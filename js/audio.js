/* ============================================================
   AUDIO: Tonausgabe, Metronom, Vorklatschen/Mitklatschen.
   Alles wird im Voraus auf die Audiouhr (ctx.currentTime) gelegt,
   nie per setInterval getaktet - ein Timer im Browser verrutscht
   um zig Millisekunden, und ausgerechnet ein Metronom darf das
   nicht. Ein Stopp-Knopf muss deshalb jeden geplanten Knoten
   einzeln stoppen, ein Flag umzulegen reicht nicht.
   ============================================================ */

let audioCtx = null, audioEntsperrt = false;
let metronomGainNode = null, metronomLautstaerke = 1;

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

function ensureAudioContext() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx || audioCtx.state === 'closed' || audioCtx.state === 'interrupted') {
        if (audioCtx) { try { audioCtx.close(); } catch (e) { /* schon zu */ } }
        audioCtx = new Ctor();
        audioEntsperrt = false;
        entsperreAudio(audioCtx);
        return audioCtx;
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
    return ctx;
}

/* Ein Klatschen: kurzes Rauschen mit scharfem Einsatz. Ein Sinuston klaenge
   wie ein zweites Metronom - Taktschlag und Rhythmus muessen auseinander
   zu hoeren sein. */
function klatschKlang(ctx, zeit) {
    const laenge = Math.floor(ctx.sampleRate * 0.09);
    const puffer = ctx.createBuffer(1, laenge, ctx.sampleRate);
    const daten = puffer.getChannelData(0);
    for (let i = 0; i < laenge; i++) daten[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / laenge, 3);
    const quelle = ctx.createBufferSource();
    quelle.buffer = puffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 1500; filter.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, zeit);
    quelle.connect(filter); filter.connect(g); g.connect(ctx.destination);
    quelle.start(zeit);
    return quelle;
}

function metronomKlick(ctx, zeit, betont) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = betont ? 1760 : 1100;
    g.gain.setValueAtTime(0.0001, zeit);
    g.gain.exponentialRampToValueAtTime(betont ? 0.5 : 0.28, zeit + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, zeit + 0.05);
    o.connect(g); g.connect(metronomZiel(ctx));
    o.start(zeit); o.stop(zeit + 0.07);
    return o;
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
            if (start) start.innerHTML = laeuft ? '<i class="fa-solid fa-stop"></i> Stopp' : '<i class="fa-solid fa-play"></i> Start';
            const vl = teil('vorlauf');
            if (vl) [...vl.children].forEach(b => b.classList.toggle('an', Number(b.dataset.n) === vorlaufTakte));
        });
    }
    function tempoZeichnen() {
        jedeAnsicht((w, teil) => {
            const anzeige = teil('tempo'), regler = teil('regler');
            if (anzeige) anzeige.textContent = bpm + ' bpm';
            if (regler) regler.value = bpm;
        });
    }
    function tempoSetzen(wert) { bpm = Math.max(40, Math.min(200, Math.round(Number(wert) || 90))); tempoZeichnen(); }

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
        wurzel.innerHTML = `
            <div class="leiste">
                <span class="metronom-puls" data-rolle="puls"></span>
                <button type="button" class="btn" data-rolle="minus">−</button>
                <span data-rolle="tempo" class="btn" style="min-width:5.2rem; text-align:center">90 bpm</span>
                <button type="button" class="btn" data-rolle="plus">+</button>
                <input type="range" min="40" max="200" value="90" step="1" data-rolle="regler" style="width:7rem">
                <span class="schalter-feld" title="Gilt nur für Vorklatschen/Mitklatschen, nicht für den Start-Knopf hier">Vorlauf</span>
                <span data-rolle="vorlauf" class="leiste" style="gap:.25rem"></span>
                <button type="button" data-rolle="start" class="btn btn-primär" title="Läuft frei durch (unabhängig vom Vorlauf), bis du stoppst - zum Üben ohne Rhythmus"><i class="fa-solid fa-play"></i> Start</button>
            </div>`;
        const teil = (r) => wurzel.querySelector(`[data-rolle="${r}"]`);
        teil('minus').addEventListener('click', () => tempoSetzen(bpm - 5));
        teil('plus').addEventListener('click', () => tempoSetzen(bpm + 5));
        teil('regler').addEventListener('input', (e) => tempoSetzen(e.target.value));
        teil('start').addEventListener('click', umschalten);
        const vlZiel = teil('vorlauf');
        [['0', 0], ['1', 1], ['2', 2], ['3', 3], ['4', 4]].forEach(([wort, n]) => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'btn'; b.textContent = wort; b.dataset.n = n;
            b.title = n === 0 ? 'Kein Vorlauf - Vorklatschen/Mitklatschen starten sofort' : `${n} ${n === 1 ? 'Takt' : 'Takte'} Vorlauf`;
            b.addEventListener('click', () => { vorlaufTakte = n; knopfZeichnen(); });
            vlZiel.appendChild(b);
        });
        ansichten = ansichten.filter(a => a.isConnected && a !== wurzel);
        ansichten.push(wurzel);
        tempoZeichnen(); pulsZeichnen(-1); knopfZeichnen();
    }

    return {
        bauen, starten, stoppen, umschalten,
        istAn: () => laeuft,
        bpm: () => bpm,
        vorlaufTakte: () => vorlaufTakte,
        schlaege,
        pulsZeichnen,
        _tonBereit: tonBereit
    };
})();

/* ============================================================
   VORKLATSCHEN / MITKLATSCHEN
   Ein Takt (oder mehr) Vorlauf, dann das ganze Stueck - alles auf
   einen Schlag auf die Audiouhr gelegt. "mitklatschen" laesst die
   Klatschtoene weg und zeigt nur den durchlaufenden Puls, zum
   Mitlesen an der Wand.
   ============================================================ */
const Vorklatschen = (function () {
    let knoten = [], anzeigeFolge = [], anzeigeTakt = null, laeuft = false;
    let letzterHost = null, letztesZeichen = '4/4';

    function anzeigePlanen(zeit, tat) { anzeigeFolge.push({ zeit, tat }); }
    function anzeigeStarten(ctx) {
        anzeigeFolge.sort((a, b) => a.zeit - b.zeit);
        if (anzeigeTakt) clearInterval(anzeigeTakt);
        anzeigeTakt = setInterval(() => {
            const jetzt = ctx.currentTime;
            while (anzeigeFolge.length && anzeigeFolge[0].zeit <= jetzt) {
                try { anzeigeFolge.shift().tat(); } catch (e) { /* Anzeige bricht nie den Ablauf ab */ }
            }
            if (!anzeigeFolge.length) { clearInterval(anzeigeTakt); anzeigeTakt = null; }
        }, 20);
    }
    function anzeigeStoppen() {
        if (anzeigeTakt) { clearInterval(anzeigeTakt); anzeigeTakt = null; }
        anzeigeFolge = [];
    }

    function stoppen(leise) {
        knoten.forEach(k => { try { k.stop(0); } catch (e) { /* schon vorbei */ } });
        knoten = [];
        anzeigeStoppen();
        if (laeuft && !leise) zeigeToast('Abgebrochen.', 'info');
        laeuft = false;
        if (letzterHost) stueckMarkieren(letzterHost, letztesZeichen, -1, 0);
        Metronom.pulsZeichnen(-1);
    }

    /* stueck: {zeichen, takte:[{bausteine}]}. nurMetronom: Mitklatschen -
       kein Klatschklang, nur Puls und Mitlese-Markierung. Der Puls selbst
       laeuft in beiden Modi immer durch (nicht nur im Vorlauf) - ob er zu
       hoeren ist, entscheidet der Lautstaerke-Regler, nicht der Modus. */
    function starten(stueck, host, nurMetronom) {
        if (laeuft) { stoppen(); return; }
        if (!stueck.takte.length) { zeigeToast('Trage erst einen Rhythmus ein.', 'danger'); return; }
        const ctx = tonBereit(() => starten(stueck, host, nurMetronom));
        if (!ctx) return;
        Metronom.stoppen();
        laeuft = true;
        letzterHost = host; letztesZeichen = stueck.zeichen;

        const bpm = Metronom.bpm();
        const pw = pulsWert(stueck.zeichen);
        const schlagDauer = 60 / bpm;             // Dauer EINES Metronom-Klicks
        const viertel = schlagDauer / pw;          // Dauer einer internen "Viertel"-Einheit
        const proTakt = Metronom.schlaege();
        const vorlaufTakte = Math.max(0, Metronom.vorlaufTakte());
        const start = ctx.currentTime + 0.25;

        let t = start;
        const vorlaufSchlaege = vorlaufTakte * proTakt;
        for (let i = 0; i < vorlaufSchlaege; i++) {
            const wann = start + i * schlagDauer;
            const imTakt = i % proTakt;
            knoten.push(metronomKlick(ctx, wann, imTakt === 0));
            anzeigePlanen(wann, () => Metronom.pulsZeichnen(imTakt));
        }
        t = start + vorlaufSchlaege * schlagDauer;

        stueck.takte.forEach((takt, taktNr) => {
            const taktStartT = t;
            let gelaufen = 0;
            {
                const n = taktPulse(stueck.zeichen);
                for (let p = 0; p < n; p++) {
                    const wann = taktStartT + p * pw * viertel;
                    anzeigePlanen(wann, () => Metronom.pulsZeichnen(p));
                    knoten.push(metronomKlick(ctx, wann, p === 0));
                }
            }
            takt.bausteine.forEach(b => {
                // Schnappschuss, nicht die laufende Variable: Sonst zeigen bei der
                // spaeteren Ausfuehrung (alle Marken desselben Takts teilen sich
                // sonst dieselbe "gelaufen"-Bindung) alle Markierungen eines Takts
                // auf dessen Endwert - also schon auf den naechsten Takt.
                const gelaufenBeiStart = gelaufen;
                anzeigePlanen(t, () => stueckMarkieren(host, stueck.zeichen, taktNr, gelaufenBeiStart));
                if (!nurMetronom) {
                    let innerT = t;
                    b.teile.forEach(teil => { if (!teil.p) knoten.push(klatschKlang(ctx, innerT)); innerT += teil.d * viertel; });
                }
                t += b.dauer * viertel;
                gelaufen += b.dauer;
            });
        });
        anzeigePlanen(t + 0.15, () => {
            laeuft = false; knoten = [];
            stueckMarkieren(host, stueck.zeichen, -1, 0);
            Metronom.pulsZeichnen(-1);
        });
        anzeigeStarten(ctx);
        const ziel = nurMetronom ? 'läuft es mit' : 'kommt der Rhythmus';
        const meldung = vorlaufTakte === 0 ? `Kein Vorlauf - ${ziel} sofort.`
                       : `${vorlaufTakte === 1 ? 'Ein Takt' : vorlaufTakte + ' Takte'} Vorlauf - danach ${ziel}.`;
        zeigeToast(meldung, 'info');
    }

    return { starten, stoppen, istAn: () => laeuft };
})();
