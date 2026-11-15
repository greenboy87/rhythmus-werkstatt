/* ============================================================
   EINHEITLICHE SPIELER-LEISTE fuer Beat- und Drumset-Werkstatt.
   Baut denselben tuerkisen Metronom-Kasten wie in der Rhythmus-Werkstatt
   (Metronom.bauen in audio.js): Puls | Tempo (−, Zahl, +, ±5/±1, Tap,
   Tempobezeichnung) | Vorlauf | Klick an/aus + Lautstaerke.
   Gleiche Klassen und data-rolle-Namen, damit alles gleich aussieht.
   Die Lautstaerke ist die gemeinsame Metronom-Lautstaerke aller
   Werkstaetten (metronomZiel), der Lautsprecher schaltet den Klick der
   jeweiligen Werkstatt an oder aus. Der ▶-Knopf daneben laesst das
   Metronom frei laufen (ohne Noten) - wie in der Rhythmus-Werkstatt.

   werkstattMetronomBauen(wurzel, {
       bpm(), bpmSetzen(x), an(), anSetzen(bool), vorlauf(), vorlaufSetzen(n), schlaege()
   }) -> { zeichnen(), puls(i) }   (puls(-1) = alle aus)

   Daneben: stufenBinden(minus, plus, schritt) fuer −/+-Paare und
   vorlaufPlanen(...) fuer die Einzaehl-Klicks vor dem ersten Takt.
   ============================================================ */
const VORLAUF_MAX_TAKTE = 4;

function werkstattMetronomBauen(wurzel, cfg) {
    wurzel.classList.add('metronom-gruppen');
    wurzel.innerHTML = `
        <span class="metronom-puls" data-rolle="puls" title="Puls - leuchtet beim Abspielen mit"></span>
        <span class="stufen metronom-tempo" title="Tempo in Schlägen pro Minute - −/+ in 5er- oder 1er-Schritten (Schalter ±5/±1, gedrückt halten = schneller), Zahl antippen zum Eintippen, Tap = im Tempo tippen">
            <span class="stufen-name"><i class="fa-solid fa-gauge-high"></i> Tempo</span>
            <button type="button" class="btn" data-rolle="tempo-minus" aria-label="Langsamer">−</button>
            <span class="metronom-tempo-wert">
                <input type="number" class="stufen-wert stufen-eingabe" min="${TEMPO_MIN}" max="200" step="1" value="90" data-rolle="tempo" aria-label="Tempo in bpm">
                <small data-rolle="tempo-name"></small>
            </span>
            <button type="button" class="btn" data-rolle="tempo-plus" aria-label="Schneller">+</button>
            <button type="button" class="btn tempo-schritt-knopf">±5</button>
            <button type="button" class="btn metronom-tap" data-rolle="tap" title="Mehrmals im gewünschten Tempo antippen">Tap</button>
        </span>
        <span class="stufen" title="Einzähltakte vor dem Abspielen">
            <span class="stufen-name">Vorlauf</span>
            <button type="button" class="btn" data-rolle="vorlauf-minus" aria-label="Weniger Vorlauf">−</button>
            <span class="stufen-wert" data-rolle="vorlauf-anzeige">0</span>
            <button type="button" class="btn" data-rolle="vorlauf-plus" aria-label="Mehr Vorlauf">+</button>
        </span>
        <span class="stufen metronom-feld" title="Metronom-Klick auf jeder Zählzeit mitspielen, Lautstärke (gilt für alle Werkstätten)">
            <button type="button" class="btn btn-icon" data-rolle="mute" title="Metronom-Klick an/aus"></button>
            <input type="range" min="0" max="100" value="60" step="5" data-rolle="lautstaerke" aria-label="Lautstärke des Metronoms">
            <button type="button" data-rolle="start" class="btn btn-icon" title="Metronom frei laufen lassen (ohne Noten), bis du stoppst"><i class="fa-solid fa-play"></i></button>
        </span>`;
    const teil = (r) => wurzel.querySelector(`[data-rolle="${r}"]`);
    const tempo = (x) => { cfg.bpmSetzen(Math.max(TEMPO_MIN, Math.min(200, Math.round(Number(x) || 90)))); zeichnen(); };
    gedrueckthalten(teil('tempo-minus'), () => tempo(tempoNachSchritt(cfg.bpm(), -1)));
    gedrueckthalten(teil('tempo-plus'), () => tempo(tempoNachSchritt(cfg.bpm(), 1)));
    const feld = teil('tempo');
    feld.addEventListener('change', () => tempo(feld.value));
    feld.addEventListener('blur', zeichnen);
    feld.addEventListener('keydown', (e) => { if (e.key === 'Enter') feld.blur(); });
    let tipps = [];
    const tippen = () => {
        const jetzt = performance.now();
        if (tipps.length && jetzt - tipps[tipps.length - 1] > 2000) tipps = [];
        tipps.push(jetzt); tipps = tipps.slice(-6);
        if (tipps.length >= 2) tempo(60000 / ((tipps[tipps.length - 1] - tipps[0]) / (tipps.length - 1)));
    };
    teil('tap').addEventListener('pointerdown', (e) => { e.preventDefault(); tippen(); });
    teil('tap').addEventListener('click', (e) => { if (e.detail === 0) tippen(); });
    teil('vorlauf-minus').addEventListener('click', () => { cfg.vorlaufSetzen(Math.max(0, cfg.vorlauf() - 1)); zeichnen(); });
    teil('vorlauf-plus').addEventListener('click', () => { cfg.vorlaufSetzen(Math.min(VORLAUF_MAX_TAKTE, cfg.vorlauf() + 1)); zeichnen(); });
    teil('mute').addEventListener('click', () => { cfg.anSetzen(!cfg.an()); zeichnen(); });
    const ansicht = { cfg, puls: (i) => puls(i), knopf: teil('start') };
    teil('start').addEventListener('click', () => FreiesMetronom.umschalten(ansicht));
    teil('lautstaerke').addEventListener('input', (e) => {
        Metronom.lautstaerkeSetzen(e.target.value / 100);
        if (!cfg.an() && e.target.value > 0) cfg.anSetzen(true);   // am Regler drehen = man will ihn hoeren
        zeichnen();
    });

    function zeichnen() {
        const bpm = cfg.bpm();
        if (document.activeElement !== feld) feld.value = bpm;
        teil('tempo-name').textContent = tempoBezeichnung(bpm);
        teil('vorlauf-anzeige').textContent = cfg.vorlauf() === 0 ? 'aus' : cfg.vorlauf();
        const an = cfg.an();
        teil('mute').innerHTML = an ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
        teil('mute').classList.toggle('an', !an);
        if (document.activeElement !== teil('lautstaerke')) teil('lautstaerke').value = Math.round(Metronom.lautstaerke() * 100);
        if (!FreiesMetronom.istAn(ansicht)) puls(-1);
    }
    function puls(aktiv) {
        const ziel = teil('puls'), n = cfg.schlaege();
        if (ziel.children.length !== n) {
            ziel.innerHTML = '';
            for (let i = 0; i < n; i++) {
                const p = document.createElement('span');
                p.className = 'metro-punkt' + (i === 0 ? ' eins' : '');
                ziel.appendChild(p);
            }
        }
        [...ziel.children].forEach((p, i) => p.classList.toggle('an', i === aktiv));
    }
    tempoSchrittKnoepfeZeichnen();
    zeichnen();
    return { zeichnen, puls };
}

/* FREIES METRONOM der Beat- und Drumset-Werkstatt: klickt im Tempo und
   in der Taktart der Werkstatt, bis man stoppt. Tempo-Aenderungen wirken
   sofort. Alles andere, was klickt oder spielt, wird vorher angehalten;
   Metronom.starten/stoppen (und damit jeder Spieler-Start) halten es an. */
const FreiesMetronom = (function () {
    let aktiv = null, uhr = null, naechste = 0, schlag = 0, timer = [];
    function knopf(a, an) {
        a.knopf.innerHTML = an ? '<i class="fa-solid fa-stop"></i>' : '<i class="fa-solid fa-play"></i>';
        a.knopf.classList.toggle('an', an);
    }
    function stoppen() {
        if (!aktiv) return;
        const a = aktiv; aktiv = null;
        if (uhr) { clearInterval(uhr); uhr = null; }
        timer.forEach(clearTimeout); timer = [];
        knopf(a, false); a.puls(-1);
    }
    function starten(a) {
        const ctx = tonBereit(() => starten(a));
        if (!ctx) return;
        stoppen();
        if (typeof Vorklatschen !== 'undefined') Vorklatschen.stoppen(true);
        Metronom.stoppen();
        if (typeof UebeMetronom !== 'undefined') UebeMetronom.stoppen();
        if (typeof BeatSpieler !== 'undefined') BeatSpieler.stoppen();
        if (typeof DrumSpieler !== 'undefined') DrumSpieler.stoppen();
        aktiv = a; schlag = 0; naechste = ctx.currentTime + 0.12;
        knopf(a, true);
        uhr = setInterval(() => {
            if (aktiv !== a) return;
            if (ctx.state !== 'running') { stoppen(); zeigeToast('Der Ton ist weggebrochen - Metronom gestoppt.', 'danger'); return; }
            while (naechste < ctx.currentTime + 0.15) {
                const s = schlag % a.cfg.schlaege(), wann = naechste;
                metronomKlick(ctx, wann, s === 0);
                timer.push(setTimeout(() => { if (aktiv === a) a.puls(s); }, Math.max(0, (wann - ctx.currentTime) * 1000)));
                naechste += 60 / a.cfg.bpm();
                schlag = s + 1;
            }
            if (timer.length > 64) timer = timer.slice(-16);
        }, 25);
    }
    return {
        starten, stoppen,
        umschalten: (a) => (aktiv === a ? stoppen() : starten(a)),
        istAn: (a) => (a ? aktiv === a : !!aktiv)
    };
})();

/* −/+-Paar an einen Wert binden (Gedrueckthalten wiederholt). */
function stufenBinden(minus, plus, schritt) {
    gedrueckthalten(document.getElementById(minus), () => schritt(-1));
    gedrueckthalten(document.getElementById(plus), () => schritt(1));
}

/* Einzaehlen: takte × schlaege Klicks ab start (Eins betont), die Puls-
   Punkte leuchten mit. Gibt die Zeit zurueck, zu der der erste Takt beginnt.
   timer: Liste, in der die Anzeige-Timeouts landen (zum Abbrechen). */
function vorlaufPlanen(ctx, start, bpm, schlaege, takte, puls, timer) {
    const schlag = 60 / bpm;
    for (let i = 0; i < takte * schlaege; i++) {
        const t = start + i * schlag, s = i % schlaege;
        metronomKlick(ctx, t, s === 0);
        timer.push(setTimeout(() => puls(s), Math.max(0, (t - ctx.currentTime) * 1000)));
    }
    return start + takte * schlaege * schlag;
}

// Die Metronom-Lautstaerke gilt ueberall - alle Regler gleich halten
document.addEventListener('input', (e) => {
    if (!e.target.matches || !e.target.matches('[data-rolle="lautstaerke"]')) return;
    document.querySelectorAll('[data-rolle="lautstaerke"]').forEach(r => { if (r !== e.target) r.value = e.target.value; });
});
