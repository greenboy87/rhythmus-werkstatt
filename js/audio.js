/* ============================================================
   AUDIO: Tonausgabe, Metronom, Vorklatschen/Mitklatschen.
   Alles wird im Voraus auf die Audiouhr (ctx.currentTime) gelegt,
   nie per setInterval getaktet - ein Timer im Browser verrutscht
   um zig Millisekunden, und ausgerechnet ein Metronom darf das
   nicht. Ein Stopp-Knopf muss deshalb jeden geplanten Knoten
   einzeln stoppen, ein Flag umzulegen reicht nicht.
   ============================================================ */

let audioCtx = null, audioEntsperrt = false;
let metronomGainNode = null, metronomLautstaerke = 0.6;

/* Haenger-Erkennung (siehe musik-quiz/CLAUDE.md "Tonprobleme"): Ein
   AudioContext kann 'running' melden und trotzdem ins Leere rendern, wenn
   eine andere App oder ein Geraetewechsel (Bluetooth, AirPlay, Beamer per
   HDMI) ihm die Ausgabe wegnimmt - genau das Bild "Ton stuerzt ab zufaellig,
   geht erst nach Browser-Neustart wieder". Verraet sich daran, dass
   currentTime nicht mehr weiterlaeuft, obwohl Wanduhrzeit vergeht. */
let audioCtxZeitmarke = 0, audioCtxWanduhr = 0, audioGeraeteWechsel = false;
function audioContextHaengt() {
    if (!audioCtx || audioCtx.state !== 'running' || !audioCtxWanduhr) return false;
    const wandDelta = Date.now() - audioCtxWanduhr;
    const ctxDelta = audioCtx.currentTime - audioCtxZeitmarke;
    return wandDelta > 500 && ctxDelta < 0.05;
}
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => { audioGeraeteWechsel = true; });
}

/* Ein dauerhafter Gain-Knoten, durch den jeder Metronom-Klick laeuft (egal ob
   Start, Vorlauf oder durchlaufender Puls). Der Lautstaerke-Regler setzt
   dessen Wert direkt und sofort - anders als eine Lautstaerke, die in jeden
   Klick einzeln eingebacken wuerde, wirkt das live, auch auf schon geplante
   Klicks, und nicht erst beim naechsten Start. */
function metronomZiel(ctx) {
    if (!metronomGainNode || metronomGainNode.context !== ctx) {
        metronomGainNode = ctx.createGain();
        metronomGainNode.gain.value = metronomLautstaerke;
        metronomGainNode.connect(ctx.destination);
    }
    return metronomGainNode;
}
function metronomLautstaerkeSetzen(wert) {
    metronomLautstaerke = Math.max(0, Math.min(1, Number(wert)));
    if (metronomGainNode) metronomGainNode.gain.value = metronomLautstaerke;
}

/* Safari legt eine frisch gebaute Ausgabe als 'suspended' an und bleibt
   stumm, wenn man sofort Toene einplant. Deshalb bei jeder Geste einen
   stillen Puffer abspielen - danach ist die Ausgabe wirklich wach. */
function entsperreAudio(ctx) {
    if (!ctx || audioEntsperrt) return;
    try {
        const puffer = ctx.createBuffer(1, 1, 22050);
        const quelle = ctx.createBufferSource();
        quelle.buffer = puffer;
        quelle.connect(ctx.destination);
        quelle.start(0);
        audioEntsperrt = true;
    } catch (e) { /* dann eben beim naechsten Versuch */ }
}

function baueAudioContextNeu(Ctor) {
    // Vorher schliessen, sonst sammeln sich tote Contexts bis zum Browser-Limit.
    if (audioCtx) { try { audioCtx.close(); } catch (e) { /* schon zu */ } }
    audioCtx = new Ctor();
    audioCtxZeitmarke = 0; audioCtxWanduhr = 0; audioGeraeteWechsel = false;
    audioEntsperrt = false;
    entsperreAudio(audioCtx);
    return audioCtx;
}

function ensureAudioContext() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx || audioCtx.state === 'closed') return baueAudioContextNeu(Ctor);
    // 'interrupted' kennt nur WebKit; resume() holt ihn daraus nicht verlaesslich
    // zurueck. Ein Geraetewechsel und ein stehengebliebener Context ebenso wenig.
    if (audioCtx.state === 'interrupted' || audioGeraeteWechsel || audioContextHaengt()) {
        return baueAudioContextNeu(Ctor);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => { /* ohne Geste abgelehnt */ });
    return audioCtx;
}

/* Holt eine Ausgabe, die wirklich spielt. Ist sie noch nicht wach, wird sie
   geweckt und der Aufruf (eine Funktion ohne Argumente) danach wiederholt. */
function tonBereit(nochmal) {
    const ctx = ensureAudioContext();
    if (!ctx) { zeigeToast('Dieses Gerät gibt keinen Ton aus.', 'danger'); return null; }
    if (ctx.state !== 'running') {
        ctx.resume()
            .then(() => { if (ctx.state === 'running' && typeof nochmal === 'function') nochmal(); })
            .catch(() => zeigeToast('Der Ton ist gesperrt - tippe einmal irgendwo auf die Seite.', 'danger'));
        return null;
    }
    entsperreAudio(ctx);
    // Marken fuer die Haenger-Erkennung mitfuehren.
    audioCtxZeitmarke = ctx.currentTime;
    audioCtxWanduhr = Date.now();
    return ctx;
}

/* Akzente: Jeder Klang nimmt eine Staerke mit - 'akzent' (deutlich lauter)
   oder normal. Normal liegt deutlich unter dem Akzent (gut 9 dB, also knapp
   dreimal so laut) - +5 dB waren im Test zu wenig Unterschied. Der Akzent
   selbst bleibt so laut wie moeglich, ohne dass er uebersteuert:
   Jeder Klang ist so eingepegelt, dass auch ein Akzent live unter 1,0
   (Vollaussteuerung) bleibt - gemessen mit einem OfflineAudioContext. */
const KLANG_NORMAL = 0.45, KLANG_AKZENT = 1.3;
function klangStaerke(staerke) { return staerke === 'akzent' ? KLANG_AKZENT : KLANG_NORMAL; }

/* Ein Klatschen: kurzes Rauschen mit scharfem Einsatz. Ein Sinuston klaenge
   wie ein zweites Metronom - Taktschlag und Rhythmus muessen auseinander
   zu hoeren sein. */
function klatschKlang(ctx, zeit, staerke, ziel) {
    const laenge = Math.floor(ctx.sampleRate * 0.09);
    const puffer = ctx.createBuffer(1, laenge, ctx.sampleRate);
    const daten = puffer.getChannelData(0);
    for (let i = 0; i < laenge; i++) daten[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / laenge, 3);
    const quelle = ctx.createBufferSource();
    quelle.buffer = puffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 1500; filter.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9 * klangStaerke(staerke), zeit);
    quelle.connect(filter); filter.connect(g); g.connect(ziel || ctx.destination);
    quelle.start(zeit);
    return quelle;
}

/* Holzblock: ein stark gedaempftes Rauschen durch ein schmales (hohes Q)
   Bandpass-Filter - der Resonanzpeak gibt ihm die "hohle" Holz-Klangfarbe,
   die ein reines Klatschen (breitbandig, kein Peak) nicht hat. */
function holzblockKlang(ctx, zeit, staerke, ziel) {
    const laenge = Math.floor(ctx.sampleRate * 0.045);
    const puffer = ctx.createBuffer(1, laenge, ctx.sampleRate);
    const daten = puffer.getChannelData(0);
    for (let i = 0; i < laenge; i++) daten[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / laenge, 8);
    const quelle = ctx.createBufferSource();
    quelle.buffer = puffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 1400; filter.Q.value = 9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(3 * klangStaerke(staerke), zeit);
    quelle.connect(filter); filter.connect(g); g.connect(ziel || ctx.destination);
    quelle.start(zeit);
    return quelle;
}

/* Klick: noch kuerzer und hochpassgefiltert statt Bandpass - duenn und
   trocken, wie ein Stick-Klick, deutlich heller als Klatschen und Holzblock. */
function klickKlang(ctx, zeit, staerke, ziel) {
    const laenge = Math.floor(ctx.sampleRate * 0.025);
    const puffer = ctx.createBuffer(1, laenge, ctx.sampleRate);
    const daten = puffer.getChannelData(0);
    for (let i = 0; i < laenge; i++) daten[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / laenge, 2);
    const quelle = ctx.createBufferSource();
    quelle.buffer = puffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = 3500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * klangStaerke(staerke), zeit);
    quelle.connect(filter); filter.connect(g); g.connect(ziel || ctx.destination);
    quelle.start(zeit);
    return quelle;
}

/* Conga: anders als die drei Rausch-Klaenge ein echter Ton mit schnellem
   Tonhoehenabfall (220 -> 90 Hz) - tief und "rund", eindeutig von den
   geraeuschhaften Klaengen zu unterscheiden. */
function trommelKlang(ctx, zeit, staerke, ziel) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(220, zeit);
    o.frequency.exponentialRampToValueAtTime(90, zeit + 0.08);
    g.gain.setValueAtTime(0.0001, zeit);
    g.gain.exponentialRampToValueAtTime(0.72 * klangStaerke(staerke), zeit + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, zeit + 0.14);
    o.connect(g); g.connect(ziel || ctx.destination);
    o.start(zeit); o.stop(zeit + 0.16);
    return o;
}

/* Snare Drum: drei Schichten wie bei der echten Trommel - das Fell als
   kurzer Ton mit leichtem Tonhoehenabfall (zwei Moden, ~190 und ~330 Hz),
   der knackige Anschlag als sehr kurzes helles Rauschen und der Teppich
   (die Schnarrsaiten) als laenger ausklingendes, gefiltertes Rauschen.
   Das Rauschen kommt aus Math.random - beim Export ist das der feste
   Zufallsgenerator, die Datei bleibt also reproduzierbar.
   ziel (optional, wie bei allen Klaengen): Knoten statt ctx.destination -
   Vorklatschen und Beat-Werkstatt schicken alles durch eine eigene Summe. */
function snareKlang(ctx, zeit, staerke, ziel) {
    const aus = ziel || ctx.destination;
    const st = klangStaerke(staerke);
    const ton = (f0, f1, laut, dauer) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f0, zeit);
        o.frequency.exponentialRampToValueAtTime(f1, zeit + 0.06);
        g.gain.setValueAtTime(0.0001, zeit);
        g.gain.exponentialRampToValueAtTime(laut * st, zeit + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, zeit + dauer);
        o.connect(g); g.connect(aus);
        o.start(zeit); o.stop(zeit + dauer + 0.02);
    };
    ton(195, 165, 0.26, 0.11);
    ton(335, 290, 0.1, 0.07);

    const laenge = Math.floor(ctx.sampleRate * 0.24);
    const puffer = ctx.createBuffer(1, laenge, ctx.sampleRate);
    const daten = puffer.getChannelData(0);
    for (let i = 0; i < laenge; i++) daten[i] = Math.random() * 2 - 1;
    const quelle = ctx.createBufferSource();
    quelle.buffer = puffer;
    // Teppich: Hochpass gegen Wummern, Glocke um 5 kHz fuer das Schnarren
    const hoch = ctx.createBiquadFilter();
    hoch.type = 'highpass'; hoch.frequency.value = 1400;
    const glocke = ctx.createBiquadFilter();
    glocke.type = 'peaking'; glocke.frequency.value = 5000; glocke.Q.value = 0.9; glocke.gain.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, zeit);
    g.gain.exponentialRampToValueAtTime(0.27 * st, zeit + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.07 * st, zeit + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, zeit + 0.22);
    quelle.connect(hoch); hoch.connect(glocke); glocke.connect(g); g.connect(aus);
    quelle.start(zeit);
    return quelle;
}
const KLATSCH_KLAENGE = {
    klatschen: klatschKlang,
    holzblock: holzblockKlang,
    klick: klickKlang,
    trommel: trommelKlang,
    snare: snareKlang
};
let klatschSound = 'snare';
function klatschSoundSetzen(code) { if (KLATSCH_KLAENGE[code]) klatschSound = code; }
function klatschSoundSpielen(ctx, zeit, staerke, ziel) { return KLATSCH_KLAENGE[klatschSound](ctx, zeit, staerke, ziel); }

/* ziel (optional): Knoten, in den der Klick laeuft. Ohne Angabe der
   dauerhafte Live-Gain-Knoten (metronomZiel) - der Audio-Export uebergibt
   einen eigenen im OfflineAudioContext, damit er den Live-Knoten nicht
   ersetzt und seine Lautstaerke selbst bestimmt. */
function metronomKlick(ctx, zeit, betont, ziel) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = betont ? 1760 : 1100;
    g.gain.setValueAtTime(0.0001, zeit);
    g.gain.exponentialRampToValueAtTime(betont ? 0.5 : 0.28, zeit + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, zeit + 0.05);
    o.connect(g); g.connect(ziel || metronomZiel(ctx));
    o.start(zeit); o.stop(zeit + 0.07);
    return o;
}

/* −/+-Knopf: Tippen = ein Schritt, Gedrückthalten wiederholt (erst nach
   0,4 s, dann alle 0,1 s) - auch auf dem iPad (Pointer-Events). */
function gedrueckthalten(knopf, schritt) {
    let warten = null, takt = null;
    const aufhoeren = () => { clearTimeout(warten); clearInterval(takt); warten = takt = null; };
    knopf.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        aufhoeren();
        schritt();
        warten = setTimeout(() => { takt = setInterval(schritt, 100); }, 400);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(art => knopf.addEventListener(art, aufhoeren));
    // Tastatur (Enter/Leertaste auf dem fokussierten Knopf)
    knopf.addEventListener('click', (e) => { if (e.detail === 0) schritt(); });
}

/* ============================================================
   METRONOM
   zeichenGetter() liefert die aktuelle Taktart (z.B. aus dem Editor),
   damit das Metronom immer zu dem passt, was gerade bearbeitet wird.
   ============================================================ */
const Metronom = (function () {
    let bpm = 90, vorlaufTakte = 1;
    let laeuft = false, uhr = null, naechste = 0, schlag = 0, takt = 0, sichtbarTimer = [];
    let ansichten = [];
    let zeichenGetter = () => '4/4';

    function schlaege() { return taktPulse(zeichenGetter()); }

    function jedeAnsicht(tat) {
        ansichten = ansichten.filter(a => a.isConnected);
        ansichten.forEach(a => tat(a, (rolle) => a.querySelector(`[data-rolle="${rolle}"]`)));
    }
    function pulsZeichnen(aktiv) {
        const anzahl = schlaege();
        jedeAnsicht((w, teil) => {
            const ziel = teil('puls');
            if (!ziel) return;
            if (ziel.children.length !== anzahl) {
                ziel.innerHTML = '';
                for (let i = 0; i < anzahl; i++) {
                    const p = document.createElement('span');
                    p.className = 'metro-punkt' + (i === 0 ? ' eins' : '');
                    ziel.appendChild(p);
                }
            }
            [...ziel.children].forEach((p, i) => p.classList.toggle('an', i === aktiv));
        });
    }
    function knopfZeichnen() {
        jedeAnsicht((w, teil) => {
            const start = teil('start');
            if (start) {
                start.innerHTML = laeuft ? '<i class="fa-solid fa-stop"></i>' : '<i class="fa-solid fa-play"></i>';
                start.classList.toggle('an', laeuft);
            }
        });
    }
    function tempoZeichnen() {
        jedeAnsicht((w, teil) => {
            const anzeige = teil('tempo');
            if (anzeige && document.activeElement !== anzeige) anzeige.value = bpm;
        });
    }
    function tempoSetzen(wert) { bpm = Math.max(40, Math.min(200, Math.round(Number(wert) || 90))); tempoZeichnen(); }

    let stummVorher = 0.6;
    function lautstaerkeZeichnen() {
        jedeAnsicht((w, teil) => {
            const regler = teil('lautstaerke');
            if (regler) regler.value = Math.round(metronomLautstaerke * 100);
            const mute = teil('mute');
            if (mute) {
                mute.innerHTML = metronomLautstaerke <= 0
                    ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
                mute.classList.toggle('an', metronomLautstaerke <= 0);
            }
        });
    }
    function lautstaerkeSetzen(wert) { metronomLautstaerkeSetzen(wert); lautstaerkeZeichnen(); }
    function stummUmschalten() {
        if (metronomLautstaerke > 0) { stummVorher = metronomLautstaerke; lautstaerkeSetzen(0); }
        else lautstaerkeSetzen(stummVorher || 0.6);
    }

    const VORLAUF_MAX = 4;
    function vorlaufZeichnen() {
        jedeAnsicht((w, teil) => {
            const anzeige = teil('vorlauf-anzeige');
            if (anzeige) anzeige.textContent = vorlaufTakte === 0 ? 'aus' : vorlaufTakte;
        });
    }
    function vorlaufSetzen(wert) {
        vorlaufTakte = Math.max(0, Math.min(VORLAUF_MAX, Math.round(Number(wert))));
        vorlaufZeichnen();
    }

    function starten() {
        const ctx = tonBereit(starten);
        if (!ctx) return;
        Vorklatschen.stoppen(true);
        laeuft = true; schlag = 0; takt = 0;
        naechste = ctx.currentTime + 0.12;
        knopfZeichnen(); pulsZeichnen(-1);
        uhr = setInterval(() => {
            if (!laeuft) return;
            if (ctx.state !== 'running') { stoppen(); zeigeToast('Der Ton ist weggebrochen - Metronom gestoppt.', 'danger'); return; }
            audioCtxZeitmarke = ctx.currentTime; audioCtxWanduhr = Date.now();
            while (naechste < ctx.currentTime + 0.15) {
                const s = schlag, wann = naechste;
                metronomKlick(ctx, wann, s === 0);
                const verzug = Math.max(0, (wann - ctx.currentTime) * 1000);
                sichtbarTimer.push(setTimeout(() => pulsZeichnen(s), verzug));
                naechste += 60 / bpm;
                schlag++;
                if (schlag >= schlaege()) { schlag = 0; takt++; }
            }
        }, 25);
    }
    function stoppen() {
        laeuft = false;
        if (uhr) { clearInterval(uhr); uhr = null; }
        sichtbarTimer.forEach(clearTimeout); sichtbarTimer = [];
        knopfZeichnen(); pulsZeichnen(-1);
    }
    function umschalten() { laeuft ? stoppen() : starten(); }

    function bauen(wurzel, zeichenGetterFn) {
        if (zeichenGetterFn) zeichenGetter = zeichenGetterFn;
        // Tempo und Vorlauf mit −/+ (Tempo in 5er-Schritten, Gedrückthalten
        // wiederholt, die Zahl selbst ist eintippbar), alles in einem Kasten:
        // Puls, Tempo, Vorlauf, Lautstärke, freies Metronom.
        wurzel.innerHTML = `
            <span class="metronom-puls" data-rolle="puls" title="Puls - leuchtet beim Abspielen mit"></span>
            <span class="stufen" title="Tempo in Schlägen pro Minute - −/+ in 5er-Schritten, Zahl antippen zum Eintippen, Pfeiltasten ↑↓">
                <span class="stufen-name">Tempo</span>
                <button type="button" class="btn" data-rolle="tempo-minus" aria-label="Langsamer">−</button>
                <input type="number" class="stufen-wert stufen-eingabe" min="40" max="200" step="1" value="90" data-rolle="tempo" aria-label="Tempo in bpm">
                <button type="button" class="btn" data-rolle="tempo-plus" aria-label="Schneller">+</button>
            </span>
            <span class="stufen" title="Einzähltakte vor dem Abspielen (gilt nicht für das freie Metronom)">
                <span class="stufen-name">Vorlauf</span>
                <button type="button" class="btn" data-rolle="vorlauf-minus" aria-label="Weniger Vorlauf">−</button>
                <span class="stufen-wert" data-rolle="vorlauf-anzeige">1</span>
                <button type="button" class="btn" data-rolle="vorlauf-plus" aria-label="Mehr Vorlauf">+</button>
            </span>
            <span class="stufen metronom-feld" title="Metronom: Lautstärke, stumm, frei laufen lassen">
                <button type="button" class="btn btn-icon" data-rolle="mute" title="Metronom stummschalten - das Aufleuchten im Notenbild läuft trotzdem immer mit"><i class="fa-solid fa-volume-high"></i></button>
                <input type="range" min="0" max="100" value="60" step="5" data-rolle="lautstaerke" aria-label="Lautstärke des Metronoms">
                <button type="button" data-rolle="start" class="btn btn-icon" title="Metronom frei laufen lassen (ohne Rhythmus), bis du stoppst"><i class="fa-solid fa-play"></i></button>
            </span>`;
        const teil = (r) => wurzel.querySelector(`[data-rolle="${r}"]`);
        // Auf das naechste Vielfache von 5 springen, dann in 5er-Schritten
        const tempoSchritt = (richtung) => tempoSetzen(richtung > 0 ? Math.floor(bpm / 5) * 5 + 5 : Math.ceil(bpm / 5) * 5 - 5);
        gedrueckthalten(teil('tempo-minus'), () => tempoSchritt(-1));
        gedrueckthalten(teil('tempo-plus'), () => tempoSchritt(1));
        const tempoFeld = teil('tempo');
        tempoFeld.addEventListener('change', () => tempoSetzen(tempoFeld.value));
        tempoFeld.addEventListener('blur', tempoZeichnen);
        tempoFeld.addEventListener('keydown', (e) => { if (e.key === 'Enter') tempoFeld.blur(); });
        teil('start').addEventListener('click', umschalten);
        teil('vorlauf-minus').addEventListener('click', () => vorlaufSetzen(vorlaufTakte - 1));
        teil('vorlauf-plus').addEventListener('click', () => vorlaufSetzen(vorlaufTakte + 1));
        teil('mute').addEventListener('click', stummUmschalten);
        teil('lautstaerke').addEventListener('input', (e) => lautstaerkeSetzen(e.target.value / 100));
        ansichten = ansichten.filter(a => a.isConnected && a !== wurzel);
        ansichten.push(wurzel);
        tempoZeichnen(); pulsZeichnen(-1); knopfZeichnen(); vorlaufZeichnen(); lautstaerkeZeichnen();
    }

    return {
        bauen, starten, stoppen, umschalten,
        istAn: () => laeuft,
        bpm: () => bpm,
        vorlaufTakte: () => vorlaufTakte,
        lautstaerke: () => metronomLautstaerke,
        tempoSetzen, vorlaufSetzen, lautstaerkeSetzen,
        schlaege,
        pulsZeichnen,
        _tonBereit: tonBereit
    };
})();

/* ============================================================
   ZEITPLAN: wann was erklingt - die gemeinsame Grundlage von
   Live-Abspielen (Vorklatschen.starten) und Audio-Export
   (rhythmusAudio in js/export.js). DOM-frei und ohne Audiokontext;
   Zeiten in Sekunden ab Beginn (0 = erster Vorlauf-Klick bzw. erster
   Schlag). So koennen Live und Datei nie auseinanderlaufen.
   optionen: { bpm, vorlaufTakte, durchgaenge (1 = einmal), nurMetronom,
              zeilen (optional: Takte je Zeile - dann jede Zeile einzeln wiederholt),
              abViertel (optional: Startpunkt mitten im ersten Takt, in Vierteln -
                         davor laeuft nur der Puls, damit der Takt stimmt) }
   Rueckgabe: {
     ereignisse:   [{ zeit, art: 'klick'|'klatsch', betont, puls, akzent }]
                   (akzent: betonte Note, nur bei Klatschen),
                   (puls = Schlag im Takt, 0-basiert, nur bei Klicks),
     markierungen: [{ zeit, taktNr, ab }]  - Mitlese-Markierung je Baustein,
     wechsel:      [{ zeit, nr, zeile }]   - Beginn von Durchgang nr (2, 3, ...), zeile bei opt.zeilen,
     dauer         - Ende des letzten Takts im letzten Durchgang }
   ============================================================ */
function rhythmusZeitplan(stueck, optionen) {
    const opt = optionen || {};
    const bpm = Number(opt.bpm) || 90;
    const vorlaufTakte = Math.max(0, Math.round(Number(opt.vorlaufTakte) || 0));
    const durchgaenge = Math.max(1, Math.round(Number(opt.durchgaenge) || 1));
    const nurMetronom = !!opt.nurMetronom;
    const abViertel = Math.max(0, Number(opt.abViertel) || 0);

    const pw = pulsWert(stueck.zeichen);
    const schlagDauer = 60 / bpm;             // Dauer EINES Metronom-Klicks
    const viertel = schlagDauer / pw;          // Dauer einer internen "Viertel"-Einheit
    const proTakt = taktPulse(stueck.zeichen);
    const ereignisse = [], markierungen = [], wechsel = [];

    const vorlaufSchlaege = vorlaufTakte * proTakt;
    for (let i = 0; i < vorlaufSchlaege; i++) {
        const imTakt = i % proTakt;
        ereignisse.push({ zeit: i * schlagDauer, art: 'klick', betont: imTakt === 0, puls: imTakt });
    }
    let t = vorlaufSchlaege * schlagDauer;

    // Abschnitte, die je fuer sich "durchgaenge"-mal laufen: normalerweise
    // das ganze Stueck am Stueck. Mit opt.zeilen (Takte je Zeile, z.B.
    // [2,2,1] bei "Als Uebung") wird stattdessen jede Zeile einzeln
    // wiederholt - genau wie die Wiederholungszeichen am Zeilenende es
    // zeigen. Passt die Summe nicht zur Taktzahl, gilt das ganze Stueck.
    const zeilen = Array.isArray(opt.zeilen) && opt.zeilen.length > 1 &&
        opt.zeilen.reduce((s, n) => s + n, 0) === stueck.takte.length ? opt.zeilen : null;
    const abschnitte = [];
    if (zeilen) {
        let von = 0;
        zeilen.forEach(n => { abschnitte.push({ von, bis: von + n }); von += n; });
    } else {
        abschnitte.push({ von: 0, bis: stueck.takte.length });
    }

    // Der Zeitzeiger t laeuft einfach weiter, kein erneuter Vorlauf
    // zwischen den Durchgaengen oder Zeilen.
    abschnitte.forEach((abschnitt, abschnittNr) => {
        for (let durchgang = 0; durchgang < durchgaenge; durchgang++) {
            if (durchgang > 0) wechsel.push({ zeit: t, nr: durchgang + 1, zeile: zeilen ? abschnittNr + 1 : null });
            for (let taktNr = abschnitt.von; taktNr < abschnitt.bis; taktNr++) {
                const takt = stueck.takte[taktNr];
                const taktStartT = t;
                // Startpunkt: in jedem Durchgang (und jedem Loop) des ersten
                // Takts erst ab dort klatschen und markieren
                const ab = abschnittNr === 0 && taktNr === abschnitt.von ? abViertel : 0;
                for (let p = 0; p < proTakt; p++) {
                    ereignisse.push({ zeit: taktStartT + p * pw * viertel, art: 'klick', betont: p === 0, puls: p });
                }
                let gelaufen = 0;
                takt.bausteine.forEach(b => {
                    if (gelaufen + b.dauer > ab + 1e-6) {
                        const von = Math.max(gelaufen, ab);
                        markierungen.push({ zeit: t + (von - gelaufen) * viertel, taktNr, ab: von });
                    }
                    if (!nurMetronom) {
                        let innerT = t, innerV = gelaufen;
                        b.teile.forEach((teil, teilNr) => {
                            if (!teil.p && innerV > ab - 1e-6) ereignisse.push({ zeit: innerT, art: 'klatsch', betont: false, akzent: istAkzent(b, teilNr) });
                            innerT += teil.d * viertel;
                            innerV += teil.d;
                        });
                    }
                    t += b.dauer * viertel;
                    gelaufen += b.dauer;
                });
            }
        }
    });
    return { ereignisse, markierungen, wechsel, dauer: t };
}

/* ============================================================
   VORKLATSCHEN / MITKLATSCHEN
   Vorlauf, dann das Stueck. "mitklatschen" laesst die Klatschtoene weg
   und zeigt nur den durchlaufenden Puls, zum Mitlesen an der Wand.

   Geplant wird nur kurz voraus (wie in der Beat-Werkstatt): Der Zeitplan
   rechnet in Schlaegen (rhythmusZeitplan mit bpm 60), alle 20 ms wird
   gelegt, was in den naechsten 0,2 s faellig ist - umgerechnet mit dem
   AKTUELLEN Tempo. So wirkt der Tempo-Regler sofort, ohne Neustart
   (anker: ab diesem Schlag gilt dieses Tempo). Alle Klaenge laufen durch
   eine eigene Summe; Stopp blendet sie aus und haengt sie ab - so
   verstummt auch, was aus mehreren Knoten besteht (Snare: zwei Toene +
   Rauschen), statt leise weiterzuklingen.
   ============================================================ */
const Vorklatschen = (function () {
    const VORAUS = 0.2;
    let laeuft = false, uhr = null, ctx = null, summe = null, klicks = [];
    let folge = [], anzeigeFolge = [], anker = null, horizont = 0;
    let letzterHost = null, letztesZeichen = '4/4';
    let zustandCallback = null;
    function zustandMelden() { if (zustandCallback) zustandCallback(laeuft); }

    function zeitVon(schlag) { return anker.zeit + (schlag - anker.schlag) * 60 / anker.bpm; }
    function schlagVon(zeit) { return anker.schlag + (zeit - anker.zeit) * anker.bpm / 60; }

    function stoppen(leise) {
        if (uhr) { clearInterval(uhr); uhr = null; }
        klicks.forEach(k => { try { k.stop(0); } catch (e) { /* schon vorbei */ } });
        klicks = [];
        if (summe && ctx) {
            const alt = summe;
            try {
                alt.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
                setTimeout(() => { try { alt.disconnect(); } catch (e) { /* schon weg */ } }, 200);
            } catch (e) { /* Kontext schon zu */ }
        }
        summe = null;
        folge = []; anzeigeFolge = [];
        if (laeuft && !leise) zeigeToast('Abgebrochen.', 'info');
        laeuft = false;
        if (letzterHost) stueckMarkieren(letzterHost, letztesZeichen, -1, 0);
        Metronom.pulsZeichnen(-1);
        zustandMelden();
    }

    /* stueck: {zeichen, takte:[{bausteine}]}. nurMetronom: Selbstklatschen -
       kein Klatschklang, nur Puls und Mitlese-Markierung. Der Puls selbst
       laeuft in beiden Modi immer durch (nicht nur im Vorlauf) - ob er zu
       hoeren ist, entscheidet der Lautstaerke-Regler, nicht der Modus.
       wiederholungen: wie oft das ganze Stueck ZUSAETZLICH durchlaeuft -
       0 = einmal, 1 = zweimal (das klassische Wiederholungszeichen), usw.
       endlos (optional): Funktion -> true = Loop. Dann beginnt nach dem
       letzten Durchgang nahtlos der naechste (ohne neuen Vorlauf), bis Stopp
       gedrueckt wird. Wird kurz vor jedem Ende neu gefragt - der Loop-Schalter
       wirkt also auch mitten im Abspielen.
       taktVersatz (optional): stueck ist nur ein Ausschnitt (Loop-Bereich),
       der bei diesem Takt des angezeigten Stuecks beginnt - fuer die
       Mitlese-Markierung.
       abViertel (optional): Startpunkt mitten im ersten Takt (siehe
       rhythmusZeitplan) - auch jeder Loop beginnt wieder dort. */
    function starten(stueck, host, nurMetronom, wiederholungen, zeilen, endlos, taktVersatz, abViertel) {
        const versatz = Number(taktVersatz) || 0;
        if (laeuft) { stoppen(); return; }
        if (!stueck.takte.length) { zeigeToast('Trage erst einen Rhythmus ein.', 'danger'); return; }
        const c = tonBereit(() => starten(stueck, host, nurMetronom, wiederholungen, zeilen, endlos, taktVersatz, abViertel));
        if (!c) return;
        Metronom.stoppen();
        ctx = c;
        summe = ctx.createGain();
        summe.gain.value = 1;
        summe.connect(ctx.destination);
        laeuft = true;
        zustandMelden();
        letzterHost = host; letztesZeichen = stueck.zeichen;
        const durchgaenge = Math.max(1, (Number(wiederholungen) || 0) + 1);
        const loop = typeof endlos === 'function' ? endlos : () => false;

        // Ein kompletter Ablauf (Vorlauf + alle Durchgaenge) ab Schlag "ab"
        // als Ereignisliste in Schlaegen - am Ende ein "ende"-Eintrag.
        function ablauf(ab, vorlaufTakte) {
            const plan = rhythmusZeitplan(stueck, { bpm: 60, vorlaufTakte, durchgaenge, nurMetronom, zeilen, abViertel });
            const liste = [
                ...plan.ereignisse.map(e => Object.assign({}, e, { schlag: ab + e.zeit })),
                ...plan.markierungen.map(m => ({ schlag: ab + m.zeit, art: 'markierung', taktNr: m.taktNr, ab: m.ab })),
                ...plan.wechsel.map(w => ({ schlag: ab + w.zeit, art: 'wechsel', nr: w.nr, zeile: w.zeile }))
            ].sort((a, b) => a.schlag - b.schlag);
            liste.push({ schlag: ab + plan.dauer, art: 'ende' });
            return liste;
        }
        function anzeigen(zeit, tat) { anzeigeFolge.push({ zeit, tat }); }
        function fertig() {
            if (uhr) { clearInterval(uhr); uhr = null; }
            laeuft = false; klicks = [];
            if (summe) { const alt = summe; setTimeout(() => { try { alt.disconnect(); } catch (e) { /* schon weg */ } }, 500); }
            summe = null;
            stueckMarkieren(host, stueck.zeichen, -1, 0);
            Metronom.pulsZeichnen(-1);
            zustandMelden();
        }
        function tick() {
            if (!laeuft) return;
            // Faellt die Ausgabe weg (Geraetewechsel, andere App), tickte es
            // sonst stumm weiter - lieber anhalten und es sagen.
            if (ctx.state !== 'running') { stoppen(); zeigeToast('Der Ton ist weggebrochen - abgebrochen.', 'danger'); return; }
            audioCtxZeitmarke = ctx.currentTime; audioCtxWanduhr = Date.now();
            // Tempo geaendert: ab dem schon geplanten Stand gilt das neue
            const bpm = Metronom.bpm();
            if (bpm !== anker.bpm) anker = { schlag: schlagVon(horizont), zeit: horizont, bpm };
            const bis = Math.max(horizont, ctx.currentTime + VORAUS);
            while (laeuft && folge.length && zeitVon(folge[0].schlag) < bis) {
                const e = folge.shift(), wann = zeitVon(e.schlag);
                if (e.art === 'klick') {
                    klicks.push(metronomKlick(ctx, wann, e.betont));
                    anzeigen(wann, () => Metronom.pulsZeichnen(e.puls));
                } else if (e.art === 'klatsch') {
                    klatschSoundSpielen(ctx, wann, e.akzent ? 'akzent' : null, summe);
                } else if (e.art === 'markierung') {
                    anzeigen(wann, () => stueckMarkieren(host, stueck.zeichen, e.taktNr + versatz, e.ab));
                } else if (e.art === 'wechsel') {
                    anzeigen(wann, () => zeigeToast(e.zeile ? `Übung ${e.zeile}: Durchgang ${e.nr} von ${durchgaenge}…` : `Durchgang ${e.nr} von ${durchgaenge}…`, 'info'));
                } else if (e.art === 'ende') {
                    // Im Loop nahtlos den naechsten Ablauf anhaengen, sonst aufraeumen
                    if (loop()) folge.push(...ablauf(e.schlag, 0));
                    else anzeigen(wann + 0.15, fertig);
                }
            }
            horizont = bis;
            if (klicks.length > 64) klicks = klicks.slice(-16);
            anzeigeFolge.sort((a, b) => a.zeit - b.zeit);
            const jetzt = ctx.currentTime;
            while (laeuft && anzeigeFolge.length && anzeigeFolge[0].zeit <= jetzt) {
                try { anzeigeFolge.shift().tat(); } catch (e) { /* Anzeige bricht nie den Ablauf ab */ }
            }
        }

        const vorlaufTakte = Math.max(0, Metronom.vorlaufTakte());
        const beginn = ctx.currentTime + 0.25;
        anker = { schlag: 0, zeit: beginn, bpm: Metronom.bpm() };
        horizont = beginn;
        folge = ablauf(0, vorlaufTakte);
        anzeigeFolge = [];
        klicks = [];
        uhr = setInterval(tick, 20);
        tick();
        const ziel = nurMetronom ? 'läuft es mit' : 'kommt der Rhythmus';
        const wiederholHinweis = durchgaenge > 1 ? (zeilen && zeilen.length > 1 ? ` (jede Zeile ${durchgaenge}×)` : ` (${durchgaenge}× hintereinander)`) : '';
        const loopHinweis = loop() ? ' Loop: läuft, bis du Stopp drückst.' : '';
        const meldung = (vorlaufTakte === 0 ? `Kein Vorlauf - ${ziel} sofort.` : `${vorlaufTakte === 1 ? 'Ein Takt' : vorlaufTakte + ' Takte'} Vorlauf - danach ${ziel}.`) + wiederholHinweis + loopHinweis;
        zeigeToast(meldung, 'info');
    }

    return { starten, stoppen, istAn: () => laeuft, aufZustandAendern: (fn) => { zustandCallback = fn; } };
})();
