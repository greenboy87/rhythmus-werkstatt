/* ============================================================
   UEBE-METRONOM: das Pop-up oben rechts (Knopf "Metronom" in der
   Kopfzeile), nach dem Vorbild von Beat Vault und dem grossen Metronom
   (greenboy87.github.io/metronom) - eigenes, freies Metronom zum Ueben,
   unabhaengig vom Tempo der Werkstaetten.
   - Tempo am Drehrad (Ring drehen, 6 Grad = 1 BPM), mit −1/+1 und −5/+5
     (gedrueckt halten wiederholt), Mausrad, Pfeiltasten, Tap.
   - Taktart, Lautstaerke, Uebungen "Stille Takte" und "Schneller werden".
   - Geplant wird auf der Uhr des AudioContext (Vorausplaner), die
     Punkte folgen per requestAnimationFrame dem, was gerade erklingt.
   - Startet eine Werkstatt, stoppt es (und umgekehrt) - zwei Klicks
     gegeneinander helfen beim Ueben niemandem.
   Einstellungen merkt sich das Geraet (localStorage rw-uebemetronom).
   ============================================================ */
const UebeMetronom = (function () {
    const SCHLUESSEL = 'rw-uebemetronom';
    const GRAD_PRO_BPM = 6, MITTE = 150, BOGEN_START = -135, BOGEN_ENDE = 135, BOGEN_R = 104;
    const TAKTE = [[1, '–'], [2, '2/4'], [3, '3/4'], [4, '4/4'], [5, '5/4'], [6, '6/8']];

    const z = {
        bpm: 100, takt: 4, laut: 70,
        stille: { an: false, hoeren: 1, still: 1 },
        steigern: { an: false, alle: 4, plus: 2, ziel: 140 }
    };
    let laeuft = false, ctx = null, master = null, uhr = null, naechster = 0, schlagNr = 0, taktNr = 0;
    let startBpm = 100, geplant = [], runde = 0, tipps = [];
    let el = null, knopf = null;

    function laden() {
        try {
            const m = JSON.parse(localStorage.getItem(SCHLUESSEL)) || {};
            ['bpm', 'takt', 'laut'].forEach(k => { if (typeof m[k] === 'number') z[k] = m[k]; });
            ['stille', 'steigern'].forEach(k => { if (m[k] && typeof m[k] === 'object') Object.assign(z[k], m[k]); });
        } catch (e) { /* egal */ }
        z.bpm = grenzen(z.bpm);
        if (!TAKTE.some(([t]) => t === z.takt)) z.takt = 4;
        z.laut = Math.max(0, Math.min(100, Math.round(z.laut)));
    }
    function merken() {
        const bpm = laeuft && z.steigern.an ? startBpm : z.bpm;
        try { localStorage.setItem(SCHLUESSEL, JSON.stringify(Object.assign({}, z, { bpm }))); } catch (e) { /* egal */ }
    }
    function grenzen(x) { return Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(Number(x) || 100))); }

    /* ---------- Drehrad (SVG) ---------- */
    function polar(grad, r) {
        const w = (grad - 90) * Math.PI / 180;
        return [MITTE + r * Math.cos(w), MITTE + r * Math.sin(w)];
    }
    function bogen(von, bis, r) {
        const [x1, y1] = polar(von, r), [x2, y2] = polar(bis, r);
        return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${bis - von > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    }
    function radSvg() {
        let striche = '';
        for (let i = 0; i < 60; i++) {
            const lang = i % 5 === 0;
            const [x1, y1] = polar(i * 6, lang ? 141 : 138), [x2, y2] = polar(i * 6, lang ? 115 : 119);
            striche += `<line class="um-strich${lang ? ' lang' : ''}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
        }
        return `<svg viewBox="0 0 300 300" aria-hidden="true">
            <circle class="um-spur" cx="150" cy="150" r="128"/>
            <g data-um="drehteil">${striche}<circle class="um-griff" cx="150" cy="22" r="11"/></g>
            <path class="um-bereich-hinten" d="${bogen(BOGEN_START, BOGEN_ENDE, BOGEN_R)}"/>
            <path class="um-bereich" data-um="bereich"/>
        </svg>`;
    }
    function radEinrichten(rad) {
        const winkelVon = (e) => {
            const r = rad.getBoundingClientRect();
            const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
            return { winkel: Math.atan2(y, x) * 180 / Math.PI, abstand: Math.hypot(x, y) / (r.width / 2) };
        };
        let ziehen = null;
        rad.addEventListener('pointerdown', (e) => {
            const { winkel, abstand } = winkelVon(e);
            if (abstand < 0.62 || abstand > 1.1) return;   // die Mitte ist Start/Stopp
            e.preventDefault();
            rad.setPointerCapture(e.pointerId);
            rad.classList.add('dreht');
            ziehen = { id: e.pointerId, letzter: winkel, rest: 0 };
        });
        rad.addEventListener('pointermove', (e) => {
            if (!ziehen || e.pointerId !== ziehen.id) return;
            const { winkel } = winkelVon(e);
            let d = winkel - ziehen.letzter;
            if (d > 180) d -= 360;
            if (d < -180) d += 360;
            ziehen.letzter = winkel;
            ziehen.rest += d;
            const schritte = Math.trunc(ziehen.rest / GRAD_PRO_BPM);
            if (schritte) { ziehen.rest -= schritte * GRAD_PRO_BPM; tempo(z.bpm + schritte); }
        });
        const los = (e) => { if (ziehen && e.pointerId === ziehen.id) { ziehen = null; rad.classList.remove('dreht'); } };
        rad.addEventListener('pointerup', los);
        rad.addEventListener('pointercancel', los);
        rad.addEventListener('wheel', (e) => {
            e.preventDefault();
            tempo(z.bpm + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 5 : 1));
        }, { passive: false });
        rad.addEventListener('keydown', (e) => {
            const s = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key];
            if (!s) return;
            e.preventDefault(); e.stopPropagation();
            tempo(z.bpm + s * (e.shiftKey ? 5 : 1));
        });
    }

    /* ---------- Aufbau ---------- */
    function auswahl(name, werte) {
        return `<select data-wahl="${name}">${werte.map(w => `<option value="${w}">${w}</option>`).join('')}</select>`;
    }
    function bauen() {
        knopf = document.getElementById('uebe-metronom-knopf');
        if (!knopf) return;
        laden();
        el = document.createElement('section');
        el.className = 'uebe-metronom';
        el.id = 'uebe-metronom';
        el.hidden = true;
        el.setAttribute('aria-label', 'Metronom');
        el.innerHTML = `
            <div class="um-kopf">
                <b><i class="fa-solid fa-stopwatch"></i> Metronom</b>
                <span class="fuellt"></span>
                <a class="btn btn-icon" href="https://greenboy87.github.io/metronom/" target="_blank" rel="noopener" title="Großes Metronom in neuem Tab (Betonung, Unterteilung, Klänge)"><i class="fa-solid fa-up-right-from-square"></i></a>
                <button type="button" class="btn btn-icon" data-um="zu" title="Schließen (läuft dann nicht weiter)" aria-label="Metronom schließen"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="um-punkte" data-um="punkte" aria-hidden="true"></div>
            <div class="um-rad" data-um="rad" role="slider" tabindex="0" aria-label="Tempo in Schlägen pro Minute"
                 aria-valuemin="${TEMPO_MIN}" aria-valuemax="${TEMPO_MAX}" aria-valuenow="100">
                ${radSvg()}
                <button type="button" class="um-mitte" data-um="start" title="Start / Stopp">
                    <span class="um-bpm" data-um="bpm">100</span>
                    <span class="um-einheit">BPM</span>
                    <span class="um-name" data-um="name">Andante</span>
                    <span class="um-start-zeichen" data-um="zeichen"></span>
                </button>
            </div>
            <p class="um-hinweis">Am Ring drehen = schneller / langsamer · Mitte = Start/Stopp</p>
            <div class="um-schritte">
                <button type="button" class="btn" data-schritt="-5">−5</button>
                <button type="button" class="btn" data-schritt="-1">−1</button>
                <button type="button" class="btn um-tap" data-um="tap" title="Mehrmals im gewünschten Tempo antippen">Tap</button>
                <button type="button" class="btn" data-schritt="1">+1</button>
                <button type="button" class="btn" data-schritt="5">+5</button>
            </div>
            <div class="segment um-takte" role="group" aria-label="Taktart">
                ${TAKTE.map(([t, n]) => `<button type="button" class="btn" data-takt="${t}" title="${t === 1 ? 'Ohne Betonung' : n + '-Takt, die Eins betont'}">${n}</button>`).join('')}
            </div>
            <div class="um-status" data-um="status" hidden></div>
            <details class="um-uebungen" data-um="uebungen">
                <summary>Übungen <span data-um="aktiv"></span></summary>
                <div class="um-uebung">
                    <button type="button" class="btn" data-uebung="stille" aria-pressed="false">🤫 Stille Takte</button>
                    <span>${auswahl('stille.hoeren', [1, 2, 3, 4])} mit Klick, ${auswahl('stille.still', [1, 2, 3, 4])} ohne</span>
                </div>
                <div class="um-uebung">
                    <button type="button" class="btn" data-uebung="steigern" aria-pressed="false">🚀 Schneller werden</button>
                    <span>alle ${auswahl('steigern.alle', [1, 2, 4, 8])} Takte +${auswahl('steigern.plus', [1, 2, 3, 4, 5, 10])} BPM, bis ${auswahl('steigern.ziel', Array.from({ length: 21 }, (_, i) => 40 + i * 10))}</span>
                </div>
            </details>
            <label class="um-laut" title="Lautstärke"><i class="fa-solid fa-volume-high"></i>
                <input type="range" min="0" max="100" step="1" data-um="laut" aria-label="Lautstärke"><span data-um="laut-wert"></span></label>
            <button type="button" class="btn um-gross-start" data-um="start"></button>`;
        document.body.appendChild(el);
        const q = (r) => el.querySelector(`[data-um="${r}"]`);

        radEinrichten(q('rad'));
        el.querySelectorAll('[data-schritt]').forEach(b => gedrueckthalten(b, () => tempo(z.bpm + Number(b.dataset.schritt))));
        q('tap').addEventListener('pointerdown', (e) => { e.preventDefault(); tippen(); });
        q('tap').addEventListener('click', (e) => { if (e.detail === 0) tippen(); });
        el.querySelectorAll('[data-um="start"]').forEach(b => b.addEventListener('click', umschalten));
        q('zu').addEventListener('click', schliessen);
        q('laut').addEventListener('input', (e) => lautstaerke(Number(e.target.value)));
        el.querySelectorAll('[data-takt]').forEach(b => b.addEventListener('click', () => {
            z.takt = Number(b.dataset.takt); schlagNr = 0; zeichnen(); merken();
        }));
        el.querySelectorAll('[data-uebung]').forEach(b => b.addEventListener('click', () => {
            const u = z[b.dataset.uebung];
            u.an = !u.an;
            if (u.an && laeuft) { taktNr = 0; schlagNr = 0; startBpm = z.bpm; }
            zeichnen(); merken();
        }));
        el.querySelectorAll('[data-wahl]').forEach(s => s.addEventListener('change', () => {
            const [u, k] = s.dataset.wahl.split('.');
            z[u][k] = Number(s.value);
            zeichnen(); merken();
        }));
        if (z.stille.an || z.steigern.an) q('uebungen').open = true;
        // Leertaste im Pop-up = Start/Stopp, nicht die Werkstatt dahinter
        el.addEventListener('keydown', (e) => {
            if (e.key === ' ' && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) {
                e.preventDefault(); e.stopPropagation(); umschalten();
            } else if (e.key === 'Escape') { e.stopPropagation(); schliessen(); }
        });
        knopf.addEventListener('click', () => (el.hidden ? oeffnen() : schliessen()));
        zeichnen(); knopfZeichnen();
    }

    function oeffnen() {
        el.hidden = false;
        knopf.classList.add('offen');
        knopf.setAttribute('aria-expanded', 'true');
        q0('rad').focus({ preventScroll: true });
    }
    function schliessen() {
        stoppen();
        el.hidden = true;
        knopf.classList.remove('offen');
        knopf.setAttribute('aria-expanded', 'false');
    }
    function q0(r) { return el.querySelector(`[data-um="${r}"]`); }

    function tempo(x) {
        z.bpm = grenzen(x);
        if (laeuft) startBpm = z.bpm;   // von Hand verstellt: ab hier neu steigern
        zeichnen(); merken();
    }
    function tippen() {
        const jetzt = performance.now();
        if (tipps.length && jetzt - tipps[tipps.length - 1] > 2000) tipps = [];
        tipps.push(jetzt); tipps = tipps.slice(-6);
        if (tipps.length >= 2) tempo(60000 / ((tipps[tipps.length - 1] - tipps[0]) / (tipps.length - 1)));
    }
    function pegel() { return (z.laut / 100) ** 2 * 1.2; }   // quadratisch fuehlt sich natuerlicher an
    function lautstaerke(x) {
        z.laut = Math.max(0, Math.min(100, Math.round(x)));
        if (master) master.gain.setTargetAtTime(pegel(), master.context.currentTime, 0.02);
        zeichnen(); merken();
    }

    /* ---------- Ton ---------- */
    function starten() {
        const c = tonBereit(starten);
        if (!c) return;
        // Werkstaetten anhalten - sonst klicken zwei Metronome gegeneinander
        if (typeof Vorklatschen !== 'undefined') Vorklatschen.stoppen(true);
        if (typeof Metronom !== 'undefined') Metronom.stoppen();
        if (typeof BeatSpieler !== 'undefined') BeatSpieler.stoppen();
        if (typeof DrumSpieler !== 'undefined') DrumSpieler.stoppen();
        if (ctx !== c || !master) {
            ctx = c;
            master = ctx.createGain();
            master.connect(ctx.destination);
        }
        master.gain.value = pegel();
        laeuft = true; schlagNr = 0; taktNr = 0; geplant = []; startBpm = z.bpm;
        naechster = ctx.currentTime + 0.06;
        planen();
        clearInterval(uhr);
        uhr = setInterval(planen, 25);
        const r = ++runde;
        const bild = () => { if (laeuft && r === runde) { anzeigen(); requestAnimationFrame(bild); } };
        requestAnimationFrame(bild);
        knopfZeichnen();
    }
    function stoppen() {
        if (!laeuft) return;
        laeuft = false; runde++;
        clearInterval(uhr); uhr = null; geplant = [];
        if (z.steigern.an) z.bpm = startBpm;   // gleich noch einmal ab dem Starttempo
        el.querySelectorAll('.um-punkt').forEach(p => p.classList.remove('an'));
        el.classList.remove('still');
        zeichnen(); knopfZeichnen();
    }
    function umschalten() { laeuft ? stoppen() : starten(); }

    function planen() {
        if (!laeuft) return;
        if (ctx.state !== 'running') { stoppen(); zeigeToast('Der Ton ist weggebrochen - Metronom gestoppt.', 'danger'); return; }
        audioCtxZeitmarke = ctx.currentTime; audioCtxWanduhr = Date.now();
        // Nach einer Pause im Hintergrund nicht alle verpassten Schlaege nachholen
        if (naechster < ctx.currentTime - 0.1) { naechster = ctx.currentTime + 0.06; geplant = []; }
        const laenge = z.takt === 1 ? 4 : z.takt;
        while (naechster < ctx.currentTime + 0.12) {
            if (schlagNr >= laenge) schlagNr = 0;
            const still = istStill(taktNr);
            if (!still) klick(naechster, schlagNr === 0 && z.takt > 1);
            geplant.push({ zeit: naechster, schlag: z.takt === 1 ? 0 : schlagNr, takt: taktNr, still, bpm: z.bpm });
            naechster += 60 / z.bpm;
            if (++schlagNr >= laenge) { schlagNr = 0; taktNr++; steigernSchritt(); }
        }
    }
    function istStill(takt) {
        const s = z.stille;
        if (!s.an) return false;
        const h = Math.max(1, s.hoeren);
        return takt % (h + Math.max(1, s.still)) >= h;
    }
    function steigernSchritt() {
        const t = z.steigern;
        if (!t.an || taktNr % Math.max(1, t.alle) !== 0) return;
        const ziel = grenzen(t.ziel), d = Math.max(1, t.plus);
        if (z.bpm < ziel) z.bpm = Math.min(ziel, z.bpm + d);
        else if (z.bpm > ziel) z.bpm = Math.max(ziel, z.bpm - d);
    }
    // Kurzer, klarer Klick - die Eins hoeher
    function klick(zeit, betont) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = betont ? 1600 : 1000;
        g.gain.setValueAtTime(0.0001, zeit);
        g.gain.exponentialRampToValueAtTime(betont ? 0.9 : 0.6, zeit + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, zeit + 0.05);
        o.connect(g); g.connect(master);
        o.start(zeit); o.stop(zeit + 0.06);
    }

    /* ---------- Anzeige ---------- */
    function anzeigen() {
        const jetzt = ctx.currentTime - (ctx.outputLatency || 0);
        let zuletzt = null;
        while (geplant.length && geplant[0].zeit <= jetzt) zuletzt = geplant.shift();
        if (!zuletzt) return;
        el.querySelectorAll('.um-punkt').forEach((p, i) => p.classList.toggle('an', !zuletzt.still && i === zuletzt.schlag));
        el.classList.toggle('still', zuletzt.still);
        const mitte = q0('start');
        if (!zuletzt.still) { mitte.classList.remove('puls'); void mitte.offsetWidth; mitte.classList.add('puls'); }
        if (zuletzt.bpm !== Number(q0('bpm').textContent)) zeichnen(zuletzt.bpm);
        status(zuletzt);
    }
    function status(s) {
        const box = q0('status');
        const teile = [];
        if (z.stille.an) teile.push(s.still ? '<b>🤫 Weiterzählen!</b>' : '🔊 Mit Klick');
        if (z.steigern.an) {
            const ziel = grenzen(z.steigern.ziel);
            if (s.bpm === ziel) teile.push(`🏁 Ziel ${ziel} erreicht`);
            else {
                const alle = Math.max(1, z.steigern.alle), noch = alle - (s.takt % alle);
                teile.push(`${s.bpm === startBpm ? s.bpm : `${startBpm} → ${s.bpm}`} BPM · nächste Stufe in ${noch} ${noch === 1 ? 'Takt' : 'Takten'}`);
            }
        }
        box.hidden = !teile.length;
        box.innerHTML = teile.join('<br>');
    }
    function zeichnen(anzeigeBpm) {
        if (!el) return;
        const bpm = anzeigeBpm || z.bpm;
        q0('bpm').textContent = bpm;
        q0('name').textContent = tempoBezeichnung(bpm);
        q0('drehteil').setAttribute('transform', `rotate(${(bpm * GRAD_PRO_BPM) % 360} ${MITTE} ${MITTE})`);
        const anteil = (bpm - TEMPO_MIN) / (TEMPO_MAX - TEMPO_MIN);
        q0('bereich').setAttribute('d', anteil > 0.002 ? bogen(BOGEN_START, BOGEN_START + anteil * (BOGEN_ENDE - BOGEN_START), BOGEN_R) : '');
        q0('rad').setAttribute('aria-valuenow', bpm);
        q0('laut').value = z.laut;
        q0('laut-wert').textContent = z.laut + ' %';
        el.querySelectorAll('[data-takt]').forEach(b => b.classList.toggle('an', Number(b.dataset.takt) === z.takt));
        el.querySelectorAll('[data-uebung]').forEach(b => {
            b.classList.toggle('an', z[b.dataset.uebung].an);
            b.setAttribute('aria-pressed', String(z[b.dataset.uebung].an));
        });
        el.querySelectorAll('[data-wahl]').forEach(s => { const [u, k] = s.dataset.wahl.split('.'); s.value = z[u][k]; });
        q0('aktiv').textContent = [z.stille.an && '🤫', z.steigern.an && '🚀'].filter(Boolean).join(' ');
        if (!laeuft) q0('status').hidden = true;
        const punkte = q0('punkte');
        if (punkte.children.length !== z.takt) {
            punkte.innerHTML = Array.from({ length: z.takt }, (_, i) => `<span class="um-punkt${i === 0 && z.takt > 1 ? ' eins' : ''}"></span>`).join('');
        }
    }
    function knopfZeichnen() {
        el.querySelector('.um-gross-start').innerHTML = laeuft ? '<i class="fa-solid fa-stop"></i> Stopp' : '<i class="fa-solid fa-play"></i> Start';
        el.querySelector('.um-gross-start').classList.toggle('laeuft', laeuft);
        q0('zeichen').innerHTML = laeuft ? '<i class="fa-solid fa-stop"></i>' : '<i class="fa-solid fa-play"></i>';
        el.classList.toggle('laeuft', laeuft);
        knopf.classList.toggle('laeuft', laeuft);
    }

    document.addEventListener('DOMContentLoaded', bauen);
    return { stoppen, istAn: () => laeuft, oeffnen, schliessen };
})();
