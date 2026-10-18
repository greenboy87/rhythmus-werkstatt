/* ============================================================
   BEAT-WERKSTATT: Schlagzeug-Beats aus Hi-Hat/Becken, Bassdrum
   und Snare bauen - eigener Reiter neben der Rhythmus-Werkstatt.

   Zwei Modi:
   - "profi" (zwei Ebenen): oben die Becken (Hals nach oben), unten
     Bassdrum und Snare zusammen (Hals nach unten) - wie im
     Schlagzeug-Notensatz ueblich.
   - "easy" (eine Ebene): Becken-Rhythmus, jede Note kann zusaetzlich
     Bassdrum, Snare oder beides bekommen (Akkord an einem Hals).

   Bausteine sind immer genau EINE Zaehlzeit lang. Im Sechzehntel-
   Raster gibt es je Zaehlzeit genau 16 Einsatzfolgen (jede der vier
   Sechzehntel-Stellen an/aus) - BEAT_FORMEN deckt sie alle ab. Welches
   Instrument eine Note spielt, steht nicht im Baustein, sondern in
   "inst" je Note: Note antippen schaltet weiter. So reichen wenige
   Bausteine fuer alle Kombinationen.

   Ein Platz ("slot") = { code, inst: [[...] je Teil] } - Pausen-Teile
   haben []. Instrumente: hh (Hi-Hat zu), ho (Hi-Hat offen), ride,
   crash, b (Bassdrum), s (Snare).
   Daten je Ebene als flache Liste: Platz = Takt * 4 + Schlag.

   Backbeat (Schalter): Snare auf 2 und 4 wird beim Zeichnen und
   Abspielen dazugerechnet (abgeleitet), die eingegebenen Daten bleiben
   unveraendert - Schalter aus, und alles ist wieder wie vorher.

   Abspielen: eigener Planer, der Takt fuer Takt kurz voraus auf die
   Audiouhr legt (wie das Metronom) - so wirken Aenderungen am Beat
   und am Tempo schon im naechsten Takt, ohne Neustart.
   ============================================================ */

const BEAT_FORMEN = [
    { code: 'V',    wort: 'Viertel',                         teile: [{ d: 1 }] },
    { code: 'AA',   wort: 'Zwei Achtel',                     teile: [{ d: .5 }, { d: .5 }] },
    { code: 'SSSS', wort: 'Vier Sechzehntel',                teile: [{ d: .25 }, { d: .25 }, { d: .25 }, { d: .25 }] },
    { code: 'AdS',  wort: 'Punktierte Achtel + Sechzehntel', teile: [{ d: .75 }, { d: .25 }] },
    { code: 'SAd',  wort: 'Sechzehntel + punktierte Achtel', teile: [{ d: .25 }, { d: .75 }] },
    { code: 'ASS',  wort: 'Achtel + 2 Sechzehntel',          teile: [{ d: .5 }, { d: .25 }, { d: .25 }] },
    { code: 'SSA',  wort: '2 Sechzehntel + Achtel',          teile: [{ d: .25 }, { d: .25 }, { d: .5 }] },
    { code: 'SAS',  wort: 'Sechzehntel + Achtel + Sechzehntel', teile: [{ d: .25 }, { d: .5 }, { d: .25 }] },
    { code: 'Vp',   wort: 'Viertelpause',                    teile: [{ d: 1, p: true }] },
    { code: 'pA',   wort: 'Achtelpause + Achtel',            teile: [{ d: .5, p: true }, { d: .5 }] },
    // Seltener gebraucht - erst nach "Mehr" sichtbar
    { code: 'pSS',  wort: 'Achtelpause + 2 Sechzehntel',     mehr: true, teile: [{ d: .5, p: true }, { d: .25 }, { d: .25 }] },
    { code: 'pSSS', wort: 'Sechzehntelpause + 3 Sechzehntel', mehr: true, teile: [{ d: .25, p: true }, { d: .25 }, { d: .25 }, { d: .25 }] },
    { code: 'pSA',  wort: 'Sechzehntelpause + Sechzehntel + Achtel', mehr: true, teile: [{ d: .25, p: true }, { d: .25 }, { d: .5 }] },
    { code: 'pAS',  wort: 'Sechzehntelpause + Achtel + Sechzehntel', mehr: true, teile: [{ d: .25, p: true }, { d: .5 }, { d: .25 }] },
    { code: 'pAd',  wort: 'Sechzehntelpause + punktierte Achtel',    mehr: true, teile: [{ d: .25, p: true }, { d: .75 }] },
    { code: 'pdS',  wort: 'Punktierte Achtelpause + Sechzehntel',    mehr: true, teile: [{ d: .75, p: true }, { d: .25 }] }
];
const BEAT_FORM = {};
BEAT_FORMEN.forEach(f => { BEAT_FORM[f.code] = f; });

const BEAT_BECKEN = { hh: 'Hi-Hat', ho: 'Hi-Hat offen', ride: 'Ride', crash: 'Crash' };
const BEAT_TROMMEL = { b: 'Bassdrum', s: 'Snare' };
const INST_REIHE = ['crash', 'hh', 'ho', 'ride', 's', 'b'];
function instSortieren(liste) {
    return [...new Set(liste)].filter(x => INST_REIHE.includes(x))
        .sort((a, b) => INST_REIHE.indexOf(a) - INST_REIHE.indexOf(b));
}

/* Einsaetze eines Bausteins: [{ k (Sechzehntel-Stelle 0-3), teil }] */
function formEinsaetze(code) {
    const r = [];
    let v = 0;
    BEAT_FORM[code].teile.forEach((t, i) => {
        if (!t.p) r.push({ k: Math.round(v * 4), teil: i });
        v += t.d;
    });
    return r;
}
const FORM_NACH_MUSTER = {};
BEAT_FORMEN.forEach(f => { FORM_NACH_MUSTER[formEinsaetze(f.code).map(e => e.k).join(',')] = f.code; });

/* Platz <-> Karte { Sechzehntel-Stelle -> Instrumente }. Ueber die Karte
   lassen sich Plaetze zusammenlegen (Easy <-> zwei Ebenen) und Einsaetze
   ergaenzen (Backbeat) - der passende Baustein ergibt sich von selbst. */
function platzKarte(slot) {
    const m = new Map();
    if (!slot || !BEAT_FORM[slot.code]) return m;
    formEinsaetze(slot.code).forEach(e => {
        const inst = (slot.inst[e.teil] || []).slice();
        if (inst.length) m.set(e.k, inst);
    });
    return m;
}
function platzAusKarte(m) {
    const ks = [...m.keys()].filter(k => m.get(k) && m.get(k).length).sort((a, b) => a - b);
    if (!ks.length) return null;
    const code = FORM_NACH_MUSTER[ks.join(',')];
    const inst = BEAT_FORM[code].teile.map(() => []);
    formEinsaetze(code).forEach(e => { inst[e.teil] = instSortieren(m.get(e.k)); });
    return { code, inst };
}

/* Kurzschreibweise fuer Vorlagen: bp('AA', 'hh') = alle Noten Hi-Hat,
   bp('AdS', 'b', 's') = je Note eigenes Instrument (oder Liste). */
function bp(code, ...noten) {
    let n = 0;
    const alle = noten.length === 1;
    return {
        code,
        inst: BEAT_FORM[code].teile.map(t => {
            if (t.p) return [];
            const x = alle ? noten[0] : noten[n];
            n++;
            return instSortieren([].concat(x));
        })
    };
}
function viermal(slot) { return [slot, slot, slot, slot]; }

/* Vorlagen: je ein Takt (4 Plaetze) pro Ebene, wird in alle Takte
   kopiert. Easy-Fassung wird daraus zusammengelegt. */
const BEAT_VORLAGEN = [
    { name: 'Grundbeat (Rock)', backbeat: true,
      oben: viermal(bp('AA', 'hh')), unten: [bp('V', 'b'), null, bp('V', 'b'), null] },
    { name: 'Rock mit „3 und“', backbeat: true,
      oben: viermal(bp('AA', 'hh')), unten: [bp('V', 'b'), null, bp('AA', 'b'), null] },
    { name: 'Four on the Floor (Disco)', backbeat: true,
      oben: viermal(bp('AA', 'hh', 'ho')), unten: viermal(bp('V', 'b')) },
    { name: 'Halftime (Snare auf 3)', backbeat: false,
      oben: viermal(bp('AA', 'hh')), unten: [bp('V', 'b'), null, bp('V', 's'), null] },
    { name: 'Funky Sechzehntel', backbeat: true,
      oben: viermal(bp('SSSS', 'hh')), unten: [bp('AdS', 'b'), null, bp('pA', 'b'), null] },
    { name: 'Ride mit Crash auf 1', backbeat: true,
      oben: [bp('AA', 'crash', 'ride'), bp('AA', 'ride'), bp('AA', 'ride'), bp('AA', 'ride')],
      unten: [bp('V', 'b'), null, bp('AdS', 'b'), null] },
    { name: 'Bass punktiert + Snare-Sechzehntel', backbeat: false,
      oben: viermal(bp('AA', 'hh')), unten: [bp('AdS', 'b', 's'), bp('V', 's'), bp('AdS', 'b', 's'), bp('V', 's')] }
];

/* ---------- Zustand ---------- */
const BEAT_SCHLUESSEL = 'rw-beat';
const BEAT_TAKTE_MAX = 8;
const beat = {
    modus: 'profi', takte: 2, backbeat: true, bpm: 90,
    oben: [], unten: [], easy: [],
    zaehlzeiten: true, farbe: false, metronom: false,
    stumm: { becken: false, bass: false, snare: false },
    stift: { becken: 'hh', trommel: 'b', dazu: '' },
    mehr: false
};
let bwAktiv = { ebene: 'oben', platz: 0 };
const bwZuletzt = {};   // zuletzt gesetzter Baustein je Ebene (fuer "Auffuellen")

function bwDaten(ebene) { return beat[ebene]; }
function bwEbenen() { return beat.modus === 'easy' ? ['easy'] : ['oben', 'unten']; }
function bwPlaetze() { return beat.takte * 4; }

function platzGueltig(slot) {
    if (!slot || typeof slot !== 'object' || !BEAT_FORM[slot.code] || !Array.isArray(slot.inst)) return null;
    const f = BEAT_FORM[slot.code];
    if (slot.inst.length !== f.teile.length) return null;
    return { code: slot.code, inst: f.teile.map((t, i) => t.p ? [] : instSortieren(Array.isArray(slot.inst[i]) ? slot.inst[i] : [])) };
}
function beatLaden() {
    try {
        const x = JSON.parse(localStorage.getItem(BEAT_SCHLUESSEL) || 'null');
        if (!x || typeof x !== 'object') return false;
        if (x.modus === 'easy' || x.modus === 'profi') beat.modus = x.modus;
        beat.takte = Math.max(1, Math.min(BEAT_TAKTE_MAX, Math.round(Number(x.takte) || 2)));
        beat.bpm = Math.max(40, Math.min(200, Math.round(Number(x.bpm) || 90)));
        ['backbeat', 'zaehlzeiten', 'farbe', 'metronom', 'mehr'].forEach(k => { if (typeof x[k] === 'boolean') beat[k] = x[k]; });
        ['oben', 'unten', 'easy'].forEach(eb => {
            beat[eb] = Array.isArray(x[eb]) ? x[eb].slice(0, BEAT_TAKTE_MAX * 4).map(platzGueltig) : [];
        });
        if (x.stumm) Object.keys(beat.stumm).forEach(k => { beat.stumm[k] = !!x.stumm[k]; });
        if (x.stift) {
            if (BEAT_BECKEN[x.stift.becken]) beat.stift.becken = x.stift.becken;
            if (['b', 's', 'w'].includes(x.stift.trommel)) beat.stift.trommel = x.stift.trommel;
            if (['', 'b', 's', 'bs'].includes(x.stift.dazu)) beat.stift.dazu = x.stift.dazu;
        }
        return true;
    } catch (e) { return false; }
}
function beatSpeichern() {
    try { localStorage.setItem(BEAT_SCHLUESSEL, JSON.stringify(beat)); } catch (e) { /* privates Fenster - dann eben nicht */ }
}

/* Platz mit Backbeat: auf Schlag 2 und 4 (Index 1 und 3) der Trommel-Ebene
   (bzw. der Easy-Ebene) kommt auf die Zaehlzeit eine Snare dazu. Aus einer
   Pause wird dabei ein Einsatz, aus einem leeren Platz eine Snare-Viertel.
   auto: Teil-Nummer(n), deren Snare automatisch dazukam (blasser im Editor). */
function abgeleitet(ebene, platz) {
    const slot = bwDaten(ebene)[platz] || null;
    const schlag = platz % 4;
    if (!beat.backbeat || ebene === 'oben' || (schlag !== 1 && schlag !== 3)) return slot;
    const m = platzKarte(slot);
    const vorher = m.get(0) || [];
    if (vorher.includes('s')) return slot;
    m.set(0, instSortieren([...vorher, 's']));
    const neu = platzAusKarte(m);
    neu.auto = [formEinsaetze(neu.code).find(e => e.k === 0).teil];
    return neu;
}

/* Instrumente fuer einen frisch gesetzten Baustein - je nach "Stift". */
const BEAT_DAZU = { '': [], b: ['b'], s: ['s'], bs: ['b', 's'] };
function stiftInst(ebene, code) {
    let n = 0;
    return BEAT_FORM[code].teile.map(t => {
        if (t.p) return [];
        const i = n++;
        if (ebene === 'oben') return [beat.stift.becken];
        if (ebene === 'unten') return beat.stift.trommel === 'w' ? [i % 2 ? 's' : 'b'] : [beat.stift.trommel];
        return instSortieren([beat.stift.becken, ...(i === 0 ? BEAT_DAZU[beat.stift.dazu] : [])]);
    });
}
/* Note antippen: naechstes Instrument.
   oben: Hi-Hat -> offen -> Ride -> Crash; unten: Bass -> Snare -> beides;
   easy: Becken bleibt, dazu nichts -> Bass -> Snare -> beides. */
function instWeiter(ebene, inst) {
    const hatB = inst.includes('b'), hatS = inst.includes('s');
    if (ebene === 'oben') {
        const reihe = Object.keys(BEAT_BECKEN);
        return [reihe[(reihe.indexOf(inst[0]) + 1) % reihe.length]];
    }
    if (ebene === 'unten') {
        if (hatB && !hatS) return ['s'];
        if (!hatB && hatS) return ['b', 's'];
        return ['b'];
    }
    const becken = inst.filter(x => BEAT_BECKEN[x]);
    const dazu = !hatB && !hatS ? ['b'] : hatB && !hatS ? ['s'] : !hatB && hatS ? ['b', 's'] : [];
    return instSortieren([...(becken.length ? becken : [beat.stift.becken]), ...dazu]);
}

/* ============================================================
   NOTENSCHRIFT (Schlagzeug)
   Fuenf Linien bei y = 0, 8, 16, 24, 32. Lage der Instrumente wie im
   ueblichen Drum-Notensatz: Bassdrum 1. Zwischenraum, Snare 3.
   Zwischenraum, Ride auf der obersten Linie, Hi-Hat darueber,
   Crash auf der Hilfslinie. Becken mit x-Kopf.
   Abstaende zeitgetreu (ein Sechzehntel = BW_ZEIT/4), damit beide
   Ebenen genau untereinander stehen.
   ============================================================ */
const BW_Y = { crash: -8, hh: -4, ho: -4, ride: 0, s: 12, b: 28 };
const BW_LINIEN = [0, 8, 16, 24, 32];
const BW_ZEIT = 72, BW_SCHLAG = 84, BW_EINRUECK = 12;
const BW_HALS = 26, BW_BALKEN = 4.5;
const BW_PAUSE_Y = { oben: -2, unten: 26, easy: 14 };
const BW_ANZEIGE_SKALA = 1.3;

function bwPause(px, d, Y) {
    const t = 'currentColor';
    if (d >= 1) {
        return `<path d="M${px - 5} ${Y - 15} L${px + 4} ${Y - 5.5} L${px - 4} ${Y + 1} L${px + 5} ${Y + 10.5}" fill="none" stroke="${t}" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"/>` +
               `<path d="M${px + 5} ${Y + 10.5} c -7 -3.5 -11 2 -5.5 7.5" fill="none" stroke="${t}" stroke-width="3" stroke-linecap="round"/>`;
    }
    if (d <= 0.25) {
        return `<path d="M${px + 5} ${Y - 11} L${px - 4} ${Y + 12}" stroke="${t}" stroke-width="2.5" stroke-linecap="round" fill="none"/>` +
               `<circle cx="${px}" cy="${Y - 9}" r="3.2" fill="${t}"/><circle cx="${px - 3.5}" cy="${Y}" r="3.2" fill="${t}"/>`;
    }
    return `<path d="M${px + 4} ${Y - 10} L${px - 3} ${Y + 10}" stroke="${t}" stroke-width="2.5" stroke-linecap="round" fill="none"/>` +
           `<circle cx="${px - 1}" cy="${Y - 8}" r="3.2" fill="${t}"/>` +
           (d > 0.5 ? `<circle cx="${px + 8}" cy="${Y - 5}" r="2.6" fill="${t}"/>` : '');
}

function bwKopf(px, y, inst, auto) {
    const art = inst === 'b' ? 'bass' : inst === 's' ? 'snare' : 'becken';
    const kl = `bw-kopf bw-${art}${auto ? ' bw-auto' : ''}`;
    if (art === 'becken') {
        return `<path class="${kl}" d="M${px - 4.5} ${y - 4.5} L${px + 4.5} ${y + 4.5} M${px + 4.5} ${y - 4.5} L${px - 4.5} ${y + 4.5}" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/>`;
    }
    return `<ellipse class="${kl}" cx="${px}" cy="${y}" rx="6.2" ry="4.5" transform="rotate(-18 ${px} ${y})" fill="currentColor"/>`;
}

/* Eine Stimme (ein Platz = eine Zaehlzeit) ab x0. richtung 'auf' = Haelse
   nach oben (Becken, Easy), 'ab' = nach unten (Bassdrum/Snare).
   Liefert SVG-Teile und Tippflaechen je Note (data-k = Sechzehntel-Stelle). */
function bwStimme(slot, x0, richtung, pauseY) {
    const teile = [], treffer = [];
    const auf = richtung === 'auf';
    const noten = [];
    let v = 0;
    BEAT_FORM[slot.code].teile.forEach((t, i) => {
        const px = x0 + BW_EINRUECK + v * BW_ZEIT;
        const k = Math.round(v * 4);
        v += t.d;
        const inst = t.p ? [] : (slot.inst[i] || []);
        if (!inst.length) { teile.push(bwPause(px, t.d, pauseY)); noten.push(null); return; }
        const ys = inst.map(x => BW_Y[x]);
        noten.push({ px, k, d: t.d, teil: i, inst, oben: Math.min(...ys), unten: Math.max(...ys), auto: (slot.auto || []).includes(i) });
    });

    // Balkengruppen: aufeinanderfolgende Achtel/Sechzehntel, Pause trennt
    const gruppen = [];
    let g = [];
    noten.forEach(n => {
        if (n && n.d <= 0.75) { g.push(n); return; }
        if (g.length) gruppen.push(g);
        g = [];
        if (n) gruppen.push([n]);
    });
    if (g.length) gruppen.push(g);

    gruppen.forEach(gr => {
        const spitze = auf ? Math.min(...gr.map(n => n.oben)) - BW_HALS : Math.max(...gr.map(n => n.unten)) + BW_HALS;
        gr.forEach(n => {
            n.hx = auf ? n.px + 5.5 : n.px - 5.5;
            n.inst.forEach(x => {
                const y = BW_Y[x];
                if (x === 'crash') teile.push(`<line x1="${n.px - 9}" y1="${y}" x2="${n.px + 9}" y2="${y}" stroke="currentColor" stroke-width="1.3"/>`);
                teile.push(bwKopf(n.px, y, x, n.auto && x === 's'));
                if (n.d > 0.5 && n.d < 1) {
                    const aufLinie = Math.abs(y / 8 - Math.round(y / 8)) < 0.01;
                    teile.push(`<circle cx="${n.px + 11}" cy="${aufLinie ? y - 4 : y}" r="2.4" fill="currentColor"/>`);
                }
            });
            const von = auf ? n.unten : n.oben;
            teile.push(`<line x1="${n.hx}" y1="${von}" x2="${n.hx}" y2="${spitze}" stroke="currentColor" stroke-width="2.2" stroke-linecap="butt"/>`);
            if (n.inst.includes('ho')) {
                const oy = auf ? spitze - 8 : n.oben - 12;
                teile.push(`<circle cx="${n.px}" cy="${oy}" r="3.3" fill="none" stroke="currentColor" stroke-width="1.6"/>`);
            }
            treffer.push({ k: n.k, x0: n.px - 9, x1: n.px + 9, y0: n.oben - 9, y1: n.unten + 9 });
        });
        const y1 = auf ? spitze : spitze - BW_BALKEN;       // erster Balken
        const y2 = auf ? spitze + 7 : spitze - BW_BALKEN - 7; // zweiter (Sechzehntel)
        if (gr.length >= 2) {
            const a = gr[0].hx, b = gr[gr.length - 1].hx;
            teile.push(`<rect x="${a - 1.1}" y="${y1}" width="${b - a + 2.2}" height="${BW_BALKEN}" fill="currentColor"/>`);
            for (let i = 0; i < gr.length; i++) {
                if (gr[i].d > 0.25) continue;
                const rechts = i < gr.length - 1 && gr[i + 1].d <= 0.25;
                const links = i > 0 && gr[i - 1].d <= 0.25;
                let von, bis;
                if (rechts) { von = gr[i].hx; bis = gr[i + 1].hx; }
                else if (links) continue;
                else if (i > 0) { von = gr[i].hx - 8; bis = gr[i].hx; }
                else { von = gr[i].hx; bis = gr[i].hx + 8; }
                teile.push(`<rect x="${von - 1.1}" y="${y2}" width="${bis - von + 2.2}" height="${BW_BALKEN}" fill="currentColor"/>`);
            }
        } else if (gr[0].d <= 0.75) {
            const hx = gr[0].hx;
            const fahne = (y) => auf
                ? `<path d="M${hx} ${y} q 11 5 9 16 q -2 -8 -9 -9" fill="currentColor"/>`
                : `<path d="M${hx} ${y} q 11 -5 9 -16 q -2 8 -9 9" fill="currentColor"/>`;
            teile.push(fahne(spitze));
            if (gr[0].d <= 0.25) teile.push(fahne(auf ? spitze + 8 : spitze - 8));
        }
    });
    return { teile, treffer };
}

/* Ein Platz klein fuer Editor und Palette - mit Notenlinien-Ausschnitt,
   damit Bassdrum unten und Snare in der Mitte schon dort zu erkennen sind. */
const BW_SICHT = { oben: [-48, 86], unten: [-6, 68], easy: [-48, 86] };
function bwPlatzSvg(slot, ebene, mitTreffern) {
    const [y0, h] = BW_SICHT[ebene];
    let inhalt = BW_LINIEN.map(y => `<line x1="0" y1="${y}" x2="${BW_SCHLAG}" y2="${y}" class="bw-linie" stroke="currentColor" stroke-width="1"/>`).join('');
    if (slot) {
        const r = bwStimme(slot, 0, ebene === 'unten' ? 'ab' : 'auf', BW_PAUSE_Y[ebene]);
        inhalt += r.teile.join('');
        if (mitTreffern) inhalt += r.treffer.map(f => `<rect class="noten-feld" data-k="${f.k}" x="${f.x0}" y="${f.y0}" width="${f.x1 - f.x0}" height="${f.y1 - f.y0}" fill="transparent"/>`).join('');
    }
    return `<svg viewBox="0 ${y0} ${BW_SCHLAG} ${h}" width="${BW_SCHLAG}" height="${h}" class="bw-platz-svg">${inhalt}</svg>`;
}

/* Eine Notenzeile mit den Takten aus taktListe. */
function bwSystemSvg(taktListe, erstes, letztes) {
    const vorn = [], teile = [];
    let x = 8;
    teile.push(schluesselSvg(x + 8, 16, 'currentColor'));
    x += 22;
    if (erstes) {
        teile.push(`<text class="kopf" x="${x + 8}" y="8" font-size="17" font-weight="900" text-anchor="middle" dominant-baseline="middle" font-family="DM Sans, sans-serif">4</text>`);
        teile.push(`<text class="kopf" x="${x + 8}" y="25" font-size="17" font-weight="900" text-anchor="middle" dominant-baseline="middle" font-family="DM Sans, sans-serif">4</text>`);
        x += 22;
    }
    x += 4;
    const ebenen = bwEbenen();
    taktListe.forEach((t, i) => {
        if (i > 0) {
            teile.push(`<line x1="${x}" y1="0" x2="${x}" y2="32" stroke="currentColor" stroke-width="1.6"/>`);
            x += 6;
        }
        for (let s = 0; s < 4; s++) {
            const platz = t * 4 + s, sx = x + s * BW_SCHLAG;
            vorn.push(`<rect class="bw-spiel" data-spiel="${platz}" x="${sx + 2}" y="-44" width="${BW_SCHLAG - 4}" height="108" rx="6"/>`);
            const einsaetze = new Set();
            ebenen.forEach(eb => {
                const slot = abgeleitet(eb, platz);
                if (!slot) { teile.push(bwPause(sx + BW_EINRUECK, 1, BW_PAUSE_Y[eb])); return; }
                platzKarte(slot).forEach((_, k) => einsaetze.add(k));
                teile.push(...bwStimme(slot, sx, eb === 'unten' ? 'ab' : 'auf', BW_PAUSE_Y[eb]).teile);
            });
            if (beat.zaehlzeiten) {
                ['', 'e', '+', 'e'].forEach((silbe, k) => {
                    const an = einsaetze.has(k);
                    if (k && !an) return;
                    teile.push(`<text class="zaehlzeit" x="${sx + BW_EINRUECK + k * BW_ZEIT / 4}" y="-48" font-size="11" font-weight="700" text-anchor="middle" font-family="DM Sans, sans-serif" opacity="${k === 0 && an ? 1 : k === 0 ? .45 : .6}">${k ? silbe : s + 1}</text>`);
                });
            }
        }
        x += 4 * BW_SCHLAG;
    });
    if (letztes) {
        // Wiederholungszeichen am Schluss: ein Beat laeuft im Kreis
        teile.push(`<circle cx="${x + 1}" cy="12" r="2.2" fill="currentColor"/><circle cx="${x + 1}" cy="20" r="2.2" fill="currentColor"/>`);
        teile.push(`<line x1="${x + 7}" y1="0" x2="${x + 7}" y2="32" stroke="currentColor" stroke-width="1.5"/>`);
        teile.push(`<line x1="${x + 12}" y1="0" x2="${x + 12}" y2="32" stroke="currentColor" stroke-width="4"/>`);
        x += 14;
    } else {
        teile.push(`<line x1="${x + 2}" y1="0" x2="${x + 2}" y2="32" stroke="currentColor" stroke-width="1.6"/>`);
        x += 2;
    }
    const linien = BW_LINIEN.map(y => `<line x1="8" y1="${y}" x2="${x}" y2="${y}" class="bw-linie-anzeige" stroke="currentColor" stroke-width="1.2"/>`).join('');
    const breite = x + 8, oben = -60, hoehe = 128;
    return `<svg class="bw-system" viewBox="0 ${oben} ${breite} ${hoehe}" width="${Math.round(breite * BW_ANZEIGE_SKALA)}" height="${Math.round(hoehe * BW_ANZEIGE_SKALA)}">${vorn.join('')}${linien}${teile.join('')}</svg>`;
}

/* ============================================================
   KLAENGE - alle in einen gemeinsamen Ziel-Knoten (Summe mit
   Begrenzer), damit Bassdrum + Snare + Becken gleichzeitig nicht
   uebersteuern und Stopp alles sofort stumm schalten kann.
   ============================================================ */
function bwRauschen(ctx, sek) {
    const laenge = Math.max(1, Math.floor(ctx.sampleRate * sek));
    const puffer = ctx.createBuffer(1, laenge, ctx.sampleRate);
    const d = puffer.getChannelData(0);
    for (let i = 0; i < laenge; i++) d[i] = Math.random() * 2 - 1;
    const q = ctx.createBufferSource();
    q.buffer = puffer;
    return q;
}
function bwHuelle(ctx, zeit, laut, dauer) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, zeit);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, laut), zeit + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, zeit + dauer);
    return g;
}
/* Becken: sechs Rechteck-Oszillatoren mit "schiefen" Frequenzen (wie bei
   der Roland 808) ergeben den metallischen Klang, dazu etwas Rauschen;
   Band- und Hochpass bestimmen, ob es nach Hi-Hat, Ride oder Crash klingt. */
function bwBecken(ctx, zeit, ziel, art, staerke) {
    const P = {
        hh:    { band: 10000, hoch: 7000, dauer: 0.06, laut: 2.0, rausch: 0.5 },
        ho:    { band: 9000,  hoch: 6000, dauer: 0.42, laut: 1.5, rausch: 0.5 },
        ride:  { band: 5500,  hoch: 3500, dauer: 0.9,  laut: 0.75, rausch: 0.15 },
        crash: { band: 7000,  hoch: 3000, dauer: 1.6,  laut: 0.95, rausch: 0.9 }
    }[art];
    const st = staerke || 1;
    const summe = ctx.createGain();
    summe.gain.value = 0.16;
    [205.3, 304.4, 369.6, 522.7, 540, 800].forEach(f => {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = art === 'ride' ? f * 1.4 : f;
        o.connect(summe);
        o.start(zeit); o.stop(zeit + P.dauer + 0.05);
    });
    const rausch = bwRauschen(ctx, P.dauer + 0.05);
    const rg = ctx.createGain();
    rg.gain.value = P.rausch;
    rausch.connect(rg); rg.connect(summe);
    rausch.start(zeit);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass'; band.frequency.value = P.band; band.Q.value = 0.7;
    const hoch = ctx.createBiquadFilter();
    hoch.type = 'highpass'; hoch.frequency.value = P.hoch;
    const g = bwHuelle(ctx, zeit, P.laut * st, P.dauer);
    summe.connect(band); band.connect(hoch); hoch.connect(g); g.connect(ziel);
}
/* Bassdrum: Sinus mit schnellem Tonhoehenabfall (150 -> 48 Hz) plus
   kurzer Klick fuer den Anschlag des Schlegels. */
function bwBassdrum(ctx, zeit, ziel, staerke) {
    const st = staerke || 1;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, zeit);
    o.frequency.exponentialRampToValueAtTime(48, zeit + 0.12);
    const g = bwHuelle(ctx, zeit, 1.0 * st, 0.42);
    o.connect(g); g.connect(ziel);
    o.start(zeit); o.stop(zeit + 0.45);
    const k = ctx.createOscillator();
    k.type = 'triangle';
    k.frequency.setValueAtTime(1100, zeit);
    k.frequency.exponentialRampToValueAtTime(200, zeit + 0.015);
    const kg = bwHuelle(ctx, zeit, 0.3 * st, 0.02);
    k.connect(kg); kg.connect(ziel);
    k.start(zeit); k.stop(zeit + 0.03);
}
function bwInstrumentSpielen(ctx, zeit, ziel, inst, staerke) {
    if (inst === 'b') { if (!beat.stumm.bass) bwBassdrum(ctx, zeit, ziel, staerke); return; }
    if (inst === 's') { if (!beat.stumm.snare) snareKlang(ctx, zeit, 'akzent', ziel); return; }
    if (!beat.stumm.becken) bwBecken(ctx, zeit, ziel, inst, staerke);
}
function bwSummeBauen(ctx) {
    const g = ctx.createGain();
    g.gain.value = 0.8;
    const begrenzer = ctx.createDynamicsCompressor();
    begrenzer.threshold.value = -8; begrenzer.knee.value = 4; begrenzer.ratio.value = 10;
    begrenzer.attack.value = 0.002; begrenzer.release.value = 0.12;
    g.connect(begrenzer); begrenzer.connect(ctx.destination);
    return g;
}
/* Becken auf der Zaehlzeit etwas lauter als dazwischen - klingt
   lebendiger als lauter gleich laute Schlaege. */
function bwStaerke(inst, k) {
    if (!BEAT_BECKEN[inst]) return 1;
    return k === 0 ? 1 : k === 2 ? 0.8 : 0.62;
}

/* Kurz vorhoeren (Note angetippt, Baustein gesetzt). */
let bwVorhoerSumme = null;
function bwVorhoeren(slot) {
    if (!slot || BeatSpieler.istAn()) return;
    const ctx = tonBereit(() => bwVorhoeren(slot));
    if (!ctx) return;
    if (!bwVorhoerSumme || bwVorhoerSumme.context !== ctx) bwVorhoerSumme = bwSummeBauen(ctx);
    const t0 = ctx.currentTime + 0.03, schlag = 60 / beat.bpm;
    platzKarte(slot).forEach((inst, k) => inst.forEach(x => bwInstrumentSpielen(ctx, t0 + k / 4 * schlag, bwVorhoerSumme, x, bwStaerke(x, k))));
}

/* ============================================================
   ABSPIELEN - Planer: alle 25 ms werden die Takte, die in den
   naechsten 0,3 s beginnen, aus dem AKTUELLEN Beat auf die Audiouhr
   gelegt. Laeuft im Kreis, bis Stopp.
   ============================================================ */
const BeatSpieler = (function () {
    let laeuft = false, ctx = null, summe = null, uhr = null;
    let naechsteZeit = 0, taktZaehler = 0, anzeigeTimer = [];

    function markieren(platz) {
        document.querySelectorAll('[data-spiel].jetzt').forEach(el => el.classList.remove('jetzt'));
        if (platz === null) return;
        document.querySelectorAll(`#reiter-beat [data-spiel="${platz}"]`).forEach(el => el.classList.add('jetzt'));
    }
    function taktPlanen(takt, t0) {
        const schlag = 60 / beat.bpm;
        for (let s = 0; s < 4; s++) {
            const platz = takt * 4 + s, ts = t0 + s * schlag;
            if (beat.metronom) metronomKlick(ctx, ts, s === 0);
            anzeigeTimer.push(setTimeout(() => { if (laeuft) markieren(platz); }, Math.max(0, (ts - ctx.currentTime) * 1000)));
            bwEbenen().forEach(eb => {
                const slot = abgeleitet(eb, platz);
                platzKarte(slot).forEach((inst, k) => inst.forEach(x =>
                    bwInstrumentSpielen(ctx, ts + k / 4 * schlag, summe, x, bwStaerke(x, k))));
            });
        }
        // Erledigte Timer nicht ewig sammeln
        if (anzeigeTimer.length > 64) anzeigeTimer = anzeigeTimer.slice(-16);
    }
    function tick() {
        if (!laeuft) return;
        if (ctx.state !== 'running') { stoppen(); zeigeToast('Der Ton ist weggebrochen - Beat gestoppt.', 'danger'); return; }
        audioCtxZeitmarke = ctx.currentTime; audioCtxWanduhr = Date.now();
        while (naechsteZeit < ctx.currentTime + 0.3) {
            taktPlanen(taktZaehler % beat.takte, naechsteZeit);
            naechsteZeit += 4 * 60 / beat.bpm;
            taktZaehler++;
        }
    }
    function starten() {
        const c = tonBereit(starten);
        if (!c) return;
        Vorklatschen.stoppen(true);
        Metronom.stoppen();
        ctx = c;
        summe = bwSummeBauen(ctx);
        laeuft = true; taktZaehler = 0;
        naechsteZeit = ctx.currentTime + 0.12;
        uhr = setInterval(tick, 25);
        tick();
        knopf();
    }
    function stoppen() {
        if (!laeuft) return;
        laeuft = false;
        if (uhr) { clearInterval(uhr); uhr = null; }
        anzeigeTimer.forEach(clearTimeout); anzeigeTimer = [];
        // Schon geplante Schlaege nicht einzeln jagen - die ganze Summe
        // kurz ausblenden und abhaengen, beim naechsten Start gibt es eine neue.
        if (summe && ctx) {
            const alt = summe;
            try {
                alt.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
                setTimeout(() => { try { alt.disconnect(); } catch (e) { /* schon weg */ } }, 200);
            } catch (e) { /* Kontext schon zu */ }
        }
        summe = null;
        markieren(null);
        knopf();
    }
    function knopf() {
        const b = document.getElementById('bw-abspielen');
        if (b) b.innerHTML = laeuft ? '<i class="fa-solid fa-stop"></i> Stopp' : '<i class="fa-solid fa-play"></i> Beat abspielen';
    }
    return { starten, stoppen, umschalten: () => (laeuft ? stoppen() : starten()), istAn: () => laeuft };
})();

/* ============================================================
   OBERFLAECHE
   ============================================================ */
function bwSetzen(ebene, platz, slot) { bwDaten(ebene)[platz] = slot; }

function bwAenderung() {
    beatSpeichern();
    bwZeichnen();
}

/* Ein Platz im Editor: alle Ebenen zusammen auf einem Fuenf-Linien-System,
   so wie im Notenbild. Welche Ebene gemeint ist, sagt die Flaeche, in die
   man tippt: bei zwei Ebenen oben (Becken) bzw. ab der zweiten Linie
   abwaerts (Bassdrum/Snare). Noten haben eigene Tippflaechen. */
const BW_ZELLE = { profi: [-48, 112], easy: [-48, 86] };
const BW_GRENZE = 8;   // y der zweiten Linie: Trennung oben/unten
function bwZelleSvg(platz) {
    const [y0, h] = BW_ZELLE[beat.modus];
    const ebenen = bwEbenen();
    const baender = [], noten = [], felder = [];
    ebenen.forEach(eb => {
        const von = eb === 'unten' ? BW_GRENZE : y0;
        const bis = eb === 'oben' ? BW_GRENZE : y0 + h;
        const leer = !bwDaten(eb)[platz];
        const aktiv = bwAktiv.ebene === eb && bwAktiv.platz === platz;
        baender.push(`<rect class="bw-band${leer ? ' leer' : ''}${aktiv ? ' aktiv' : ''}" data-ebene="${eb}" x="1.5" y="${von + 1.5}" width="${BW_SCHLAG - 3}" height="${bis - von - 3}" rx="4"/>`);
        const slot = abgeleitet(eb, platz);
        if (!slot) return;
        const r = bwStimme(slot, 0, eb === 'unten' ? 'ab' : 'auf', BW_PAUSE_Y[eb]);
        noten.push(...r.teile);
        r.treffer.forEach(f => felder.push(`<rect class="noten-feld" data-ebene="${eb}" data-k="${f.k}" x="${f.x0}" y="${f.y0}" width="${f.x1 - f.x0}" height="${f.y1 - f.y0}" fill="transparent"/>`));
    });
    const linien = BW_LINIEN.map(y => `<line x1="0" y1="${y}" x2="${BW_SCHLAG}" y2="${y}" class="bw-linie" stroke="currentColor" stroke-width="1"/>`).join('');
    return `<svg viewBox="0 ${y0} ${BW_SCHLAG} ${h}" width="${BW_SCHLAG}" height="${h}" class="bw-platz-svg">${baender.join('')}${linien}${noten.join('')}${felder.join('')}</svg>`;
}

function bwEditorZeichnen() {
    const host = document.getElementById('bw-editor');
    const ebenen = bwEbenen();
    if (!ebenen.includes(bwAktiv.ebene)) bwAktiv.ebene = ebenen[0];
    if (bwAktiv.platz >= bwPlaetze()) bwAktiv.platz = bwPlaetze() - 1;
    let html = '';
    for (let t = 0; t < beat.takte; t++) {
        html += `<div class="bw-takt"><div class="bw-takt-kopf"><span>Takt ${t + 1}</span>` +
            `<button type="button" class="bw-kopieren" data-takt="${t}" title="Diesen Takt in den nächsten Takt kopieren"><i class="fa-regular fa-copy"></i> in nächsten</button></div>` +
            '<div class="bw-reihe">';
        for (let s = 0; s < 4; s++) {
            const platz = t * 4 + s;
            const weg = ebenen.filter(eb => bwDaten(eb)[platz]).map(eb =>
                `<button type="button" class="bw-weg bw-weg-${eb}" data-ebene="${eb}" title="${eb === 'oben' ? 'Becken' : eb === 'unten' ? 'Bassdrum/Snare' : 'Baustein'} entfernen" aria-label="Baustein entfernen">×</button>`).join('');
            html += `<div class="bw-platz" data-platz="${platz}" data-spiel="${platz}"` +
                ` title="Antippen: Platz wählen${ebenen.length > 1 ? ' (oben Becken, unten Bassdrum/Snare)' : ''} – Note antippen: Instrument wechseln">` +
                `<span class="bw-schlag-nr">${s + 1}</span>${bwZelleSvg(platz)}${weg}</div>`;
        }
        html += '</div></div>';
    }
    host.innerHTML = html;
}

const BW_TAUSCH_KNOPF = '<button type="button" class="btn bw-chip" id="bw-tauschen" title="Im gewählten Platz Bassdrum und Snare vertauschen"><i class="fa-solid fa-right-left"></i> Bassdrum ⇄ Snare</button>';
/* Im gewaehlten Platz Bassdrum und Snare vertauschen (Noten mit beidem bleiben). */
function bwTauschen() {
    const eb = bwAktiv.ebene, platz = bwAktiv.platz;
    const roh = bwDaten(eb)[platz];
    if (eb === 'oben' || !roh || !roh.inst.some(i => i.includes('b') || i.includes('s'))) {
        zeigeToast('Erst einen Platz mit Bassdrum oder Snare antippen.', 'info');
        return;
    }
    const neu = { code: roh.code, inst: roh.inst.map(i => instSortieren(i.map(x => x === 'b' ? 's' : x === 's' ? 'b' : x))) };
    bwSetzen(eb, platz, neu);
    bwVorhoeren(abgeleitet(eb, platz));
    bwAenderung();
}
/* Baustein in den gewaehlten Platz setzen, danach zum naechsten Platz. */
function bwBausteinSetzen(code) {
    const eb = bwAktiv.ebene;
    const slot = { code, inst: stiftInst(eb, code) };
    bwSetzen(eb, bwAktiv.platz, slot);
    bwZuletzt[eb] = slot;
    bwVorhoeren(abgeleitet(eb, bwAktiv.platz));
    if (bwAktiv.platz < bwPlaetze() - 1) bwAktiv.platz++;
    bwAenderung();
}

/* ---------- Tastatur (nur im Beat-Reiter) ----------
   Bausteine in der Reihenfolge von BEAT_FORMEN: die zehn immer sichtbaren
   auf der mittleren Buchstabenreihe (A S D F G H J K L Ö), die sechs
   "Mehr"-Bausteine darueber (Q W E R T Z) - die gehen auch, wenn sie
   gerade eingeklappt sind. */
const BW_TASTEN = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ö', 'q', 'w', 'e', 'r', 't', 'z'];
function bwTasteFuer(code) { return BW_TASTEN[BEAT_FORMEN.findIndex(f => f.code === code)] || ''; }
function bwTaste(e) {
    if (document.getElementById('reiter-beat').classList.contains('hidden')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const ziel = e.target;
    if (ziel && (ziel.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(ziel.tagName) && ziel.type !== 'checkbox' && ziel.type !== 'range')) return;
    const taste = e.key.toLowerCase();
    let fertig = true;
    if (e.key === ' ') {
        // Sonst loest die Leertaste zusaetzlich den zuletzt angeklickten Knopf aus
        if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
        BeatSpieler.umschalten();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const neu = bwAktiv.platz + (e.key === 'ArrowLeft' ? -1 : 1);
        bwAktiv.platz = Math.max(0, Math.min(bwPlaetze() - 1, neu));
        bwZeichnen();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const ebenen = bwEbenen();
        const i = ebenen.indexOf(bwAktiv.ebene) + (e.key === 'ArrowUp' ? -1 : 1);
        if (i >= 0 && i < ebenen.length) { bwAktiv.ebene = ebenen[i]; bwZeichnen(); }
    } else if (taste === 'x') {
        bwTauschen();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
        bwSetzen(bwAktiv.ebene, bwAktiv.platz, null);
        bwAenderung();
    } else if (BW_TASTEN.includes(taste)) {
        bwBausteinSetzen(BEAT_FORMEN[BW_TASTEN.indexOf(taste)].code);
    } else {
        fertig = false;
    }
    if (fertig) e.preventDefault();
}

const BW_EBENEN_NAME = { oben: 'Ebene 1 · Hi-Hat / Becken', unten: 'Ebene 2 · Bassdrum & Snare', easy: 'Easy · Becken + Bassdrum/Snare' };
function bwPaletteZeichnen() {
    const eb = bwAktiv.ebene;
    const chip = (gruppe, wert, text, klasse) =>
        `<button type="button" class="btn bw-chip${beat.stift[gruppe] === wert ? ' an' : ''}" data-stift="${gruppe}" data-wert="${wert}">` +
        (klasse ? `<span class="bw-punkt ${klasse}"></span>` : '') + `${text}</button>`;
    let stifte = `<span class="bw-ziel">Bausteine für <b>${BW_EBENEN_NAME[eb]}</b></span>`;
    if (eb === 'oben' || eb === 'easy') {
        stifte += '<span class="schalter-feld">Becken</span>' +
            Object.entries(BEAT_BECKEN).map(([w, t]) => chip('becken', w, t, 'bw-becken')).join('');
    }
    if (eb === 'unten') {
        stifte += '<span class="schalter-feld">Trommel</span>' +
            chip('trommel', 'b', 'Bassdrum', 'bw-bass') + chip('trommel', 's', 'Snare', 'bw-snare') +
            chip('trommel', 'w', 'Wechsel B–S', 'bw-wechsel') + BW_TAUSCH_KNOPF;
    }
    if (eb === 'easy') {
        stifte += '<span class="schalter-feld">auf die 1. Note dazu</span>' +
            chip('dazu', '', 'nichts') + chip('dazu', 'b', 'Bassdrum', 'bw-bass') +
            chip('dazu', 's', 'Snare', 'bw-snare') + chip('dazu', 'bs', 'beides', 'bw-wechsel') + BW_TAUSCH_KNOPF;
    }
    document.getElementById('bw-stifte').innerHTML = stifte;
    document.getElementById('bw-palette').innerHTML = BEAT_FORMEN
        .filter(f => beat.mehr || !f.mehr)
        .map(f => {
            const taste = bwTasteFuer(f.code).toUpperCase();
            return `<button type="button" class="palette-baustein bw-baustein" data-code="${f.code}" title="${f.wort} – Taste ${taste}">` +
                `${bwPlatzSvg({ code: f.code, inst: stiftInst(eb, f.code) }, eb, false)}<span class="bw-taste">${taste}</span></button>`;
        })
        .join('');
    document.getElementById('bw-mehr').innerHTML = beat.mehr
        ? '<i class="fa-solid fa-minus"></i> Weniger Bausteine'
        : '<i class="fa-solid fa-plus"></i> Mehr Bausteine (mit Pausen)';
}

function bwAnzeigeZeichnen() {
    const host = document.getElementById('bw-anzeige');
    const breite = host.clientWidth || 900;
    const taktBreite = (4 * BW_SCHLAG + 6) * BW_ANZEIGE_SKALA;
    const proZeile = Math.max(1, Math.floor((breite - 80 * BW_ANZEIGE_SKALA) / taktBreite));
    const zeilen = [];
    for (let t = 0; t < beat.takte; t += proZeile) {
        const liste = [];
        for (let i = t; i < Math.min(beat.takte, t + proZeile); i++) liste.push(i);
        zeilen.push(liste);
    }
    host.innerHTML = zeilen.map((z, i) => bwSystemSvg(z, i === 0, i === zeilen.length - 1)).join('');
}

function bwSchalterZeichnen() {
    document.querySelectorAll('[data-bw-modus]').forEach(b => b.classList.toggle('an', b.dataset.bwModus === beat.modus));
    document.getElementById('bw-backbeat').checked = beat.backbeat;
    document.getElementById('bw-takte-anzeige').textContent = beat.takte;
    document.getElementById('bw-takte-minus').disabled = beat.takte <= 1;
    document.getElementById('bw-takte-plus').disabled = beat.takte >= BEAT_TAKTE_MAX;
    document.getElementById('bw-tempo-anzeige').textContent = beat.bpm + ' bpm';
    document.getElementById('bw-tempo-regler').value = beat.bpm;
    document.getElementById('bw-metronom').checked = beat.metronom;
    document.getElementById('bw-zaehlzeiten').checked = beat.zaehlzeiten;
    document.getElementById('reiter-beat').classList.toggle('bw-bunt', beat.farbe);
    document.getElementById('bw-farbe').innerHTML = beat.farbe
        ? '<i class="fa-solid fa-palette"></i> Farbe aus' : '<i class="fa-solid fa-palette"></i> Farbe an';
    document.querySelectorAll('[data-bw-stumm]').forEach(b => {
        const stumm = beat.stumm[b.dataset.bwStumm];
        b.classList.toggle('stumm', stumm);
        b.title = stumm ? 'Stumm – antippen zum Einschalten' : 'Hörbar – antippen zum Stummschalten';
    });
    const legende = beat.modus === 'easy'
        ? 'Eine Reihe: jede Becken-Note kann zusätzlich <span class="bw-punkt bw-bass"></span> Bassdrum, <span class="bw-punkt bw-snare"></span> Snare oder beides bekommen.'
        : 'Ein Notensystem, zwei Ebenen: oben <span class="bw-punkt bw-becken"></span> Hi-Hat / Becken (Hälse nach oben), unten <span class="bw-punkt bw-bass"></span> Bassdrum und <span class="bw-punkt bw-snare"></span> Snare (Hälse nach unten). Oben oder unten in einen Platz tippen wählt die Ebene.';
    document.getElementById('bw-legende').innerHTML = legende +
        (beat.backbeat ? ' <span class="bw-hinweis-bb">Backbeat an: Snare auf 2 und 4 kommt automatisch dazu (blass).</span>' : '');
}

function bwZeichnen() {
    bwSchalterZeichnen();
    bwEditorZeichnen();
    bwPaletteZeichnen();
    bwAnzeigeZeichnen();
}

/* Moduswechsel: Ist der Ziel-Modus noch leer, wird der Beat uebernommen -
   zusammengelegt (zwei Ebenen -> Easy) bzw. aufgeteilt (Easy -> zwei Ebenen). */
function bwModusSetzen(modus) {
    if (modus === beat.modus) return;
    const n = bwPlaetze();
    const leer = (eb) => beat[eb].slice(0, n).every(s => !s);
    if (modus === 'easy' && leer('easy') && !(leer('oben') && leer('unten'))) {
        for (let p = 0; p < n; p++) {
            const m = platzKarte(beat.oben[p]);
            platzKarte(beat.unten[p]).forEach((inst, k) => m.set(k, [...(m.get(k) || []), ...inst]));
            beat.easy[p] = platzAusKarte(m);
        }
        zeigeToast('Beat in die Easy-Ebene übernommen.', 'info');
    } else if (modus === 'profi' && leer('oben') && leer('unten') && !leer('easy')) {
        for (let p = 0; p < n; p++) {
            const mo = new Map(), mu = new Map();
            platzKarte(beat.easy[p]).forEach((inst, k) => {
                const b = inst.filter(x => BEAT_BECKEN[x]), t = inst.filter(x => BEAT_TROMMEL[x]);
                if (b.length) mo.set(k, b);
                if (t.length) mu.set(k, t);
            });
            beat.oben[p] = platzAusKarte(mo);
            beat.unten[p] = platzAusKarte(mu);
        }
        zeigeToast('Beat auf zwei Ebenen aufgeteilt.', 'info');
    }
    beat.modus = modus;
    bwAktiv = { ebene: bwEbenen()[0], platz: 0 };
    bwAenderung();
}

function bwVorlageLaden(nr) {
    const v = BEAT_VORLAGEN[nr];
    if (!v) return;
    const kopie = (s) => s ? { code: s.code, inst: s.inst.map(i => i.slice()) } : null;
    for (let p = 0; p < bwPlaetze(); p++) {
        beat.oben[p] = kopie(v.oben[p % 4]);
        beat.unten[p] = kopie(v.unten[p % 4]);
        const m = platzKarte(v.oben[p % 4]);
        platzKarte(v.unten[p % 4]).forEach((inst, k) => m.set(k, [...(m.get(k) || []), ...inst]));
        beat.easy[p] = platzAusKarte(m);
    }
    beat.backbeat = v.backbeat;
    zeigeToast(`Vorlage „${v.name}“ geladen` + (v.backbeat ? ' – mit Backbeat.' : '.'), 'info');
    bwAenderung();
}

function bwNoteWechseln(ebene, platz, k) {
    const roh = bwDaten(ebene)[platz];
    const m = platzKarte(roh);
    // Noch keine eigene Note an der Stelle (nur der automatische Backbeat):
    // dann wird sie zur eigenen - mit dem naechsten Instrument nach der Snare.
    const jetzt = m.get(k) || (ebene === 'easy' ? [beat.stift.becken] : ebene === 'unten' ? ['s'] : [beat.stift.becken]);
    m.set(k, instWeiter(ebene, jetzt));
    const neu = platzAusKarte(m);
    bwSetzen(ebene, platz, neu);
    bwVorhoeren({ code: 'V', inst: [m.get(k)] });
}

function bwEinrichten() {
    beatLaden();
    if (!beat.oben.some(Boolean) && !beat.unten.some(Boolean) && !beat.easy.some(Boolean)) {
        // Erster Besuch: mit dem Grundbeat starten statt mit leerem Blatt
        beat.takte = 2;
        const v = BEAT_VORLAGEN[0];
        for (let p = 0; p < 8; p++) {
            beat.oben[p] = v.oben[p % 4];
            beat.unten[p] = v.unten[p % 4];
            const m = platzKarte(v.oben[p % 4]);
            platzKarte(v.unten[p % 4]).forEach((inst, k) => m.set(k, [...(m.get(k) || []), ...inst]));
            beat.easy[p] = platzAusKarte(m);
        }
        beat.backbeat = true;
    }
    bwAktiv = { ebene: bwEbenen()[0], platz: 0 };

    const vorlage = document.getElementById('bw-vorlage');
    BEAT_VORLAGEN.forEach((v, i) => {
        const o = document.createElement('option');
        o.value = i; o.textContent = v.name;
        vorlage.appendChild(o);
    });
    vorlage.addEventListener('change', () => { if (vorlage.value !== '') bwVorlageLaden(Number(vorlage.value)); vorlage.value = ''; });

    document.querySelectorAll('[data-bw-modus]').forEach(b => b.addEventListener('click', () => bwModusSetzen(b.dataset.bwModus)));
    document.getElementById('bw-backbeat').addEventListener('change', (e) => { beat.backbeat = e.target.checked; bwAenderung(); });
    document.getElementById('bw-takte-minus').addEventListener('click', () => { beat.takte = Math.max(1, beat.takte - 1); bwAenderung(); });
    document.getElementById('bw-takte-plus').addEventListener('click', () => { beat.takte = Math.min(BEAT_TAKTE_MAX, beat.takte + 1); bwAenderung(); });
    document.getElementById('bw-leeren').addEventListener('click', () => {
        bwEbenen().forEach(eb => { beat[eb] = []; });
        bwAktiv.platz = 0;
        bwAenderung();
    });

    // Editor: Platz waehlen, Note antippen = Instrument wechseln, × = leeren
    document.getElementById('bw-editor').addEventListener('click', (e) => {
        const kop = e.target.closest('.bw-kopieren');
        if (kop) {
            const t = Number(kop.dataset.takt);
            if (t + 1 >= BEAT_TAKTE_MAX) { zeigeToast('Mehr als ' + BEAT_TAKTE_MAX + ' Takte gehen nicht.', 'danger'); return; }
            if (t + 1 >= beat.takte) beat.takte = t + 2;
            ['oben', 'unten', 'easy'].forEach(eb => {
                for (let s = 0; s < 4; s++) {
                    const q = beat[eb][t * 4 + s];
                    beat[eb][(t + 1) * 4 + s] = q ? { code: q.code, inst: q.inst.map(i => i.slice()) } : null;
                }
            });
            bwAenderung();
            return;
        }
        const el = e.target.closest('.bw-platz');
        if (!el) return;
        const ebEl = e.target.closest('[data-ebene]');
        const eb = ebEl ? ebEl.dataset.ebene : bwAktiv.ebene;
        const platz = Number(el.dataset.platz);
        bwAktiv = { ebene: eb, platz };
        if (e.target.closest('.bw-weg')) bwSetzen(eb, platz, null);
        else {
            const note = e.target.closest('[data-k]');
            if (note) bwNoteWechseln(eb, platz, Number(note.dataset.k));
        }
        bwAenderung();
    });

    // Werkzeug: Stift waehlen, Baustein setzen
    document.getElementById('bw-stifte').addEventListener('click', (e) => {
        if (e.target.closest('#bw-tauschen')) { bwTauschen(); return; }
        const c = e.target.closest('[data-stift]');
        if (!c) return;
        beat.stift[c.dataset.stift] = c.dataset.wert;
        bwAenderung();
    });
    document.getElementById('bw-palette').addEventListener('click', (e) => {
        const b = e.target.closest('[data-code]');
        if (b) bwBausteinSetzen(b.dataset.code);
    });
    document.addEventListener('keydown', bwTaste);
    document.getElementById('bw-mehr').addEventListener('click', () => { beat.mehr = !beat.mehr; bwAenderung(); });
    document.getElementById('bw-auffuellen').addEventListener('click', () => {
        const eb = bwAktiv.ebene;
        const vorbild = bwZuletzt[eb] || bwDaten(eb)[bwAktiv.platz] || bwDaten(eb).find(Boolean);
        if (!vorbild) { zeigeToast('Setz erst einen Baustein – der wird dann in alle leeren Plätze kopiert.', 'info'); return; }
        let n = 0;
        for (let p = 0; p < bwPlaetze(); p++) {
            if (!bwDaten(eb)[p]) { bwDaten(eb)[p] = { code: vorbild.code, inst: vorbild.inst.map(i => i.slice()) }; n++; }
        }
        zeigeToast(n ? `${n} leere Plätze gefüllt.` : 'Keine leeren Plätze in dieser Reihe.', 'info');
        bwAenderung();
    });
    document.getElementById('bw-reihe-leeren').addEventListener('click', () => {
        beat[bwAktiv.ebene] = [];
        bwAenderung();
    });

    // Abspielen
    document.getElementById('bw-abspielen').addEventListener('click', () => BeatSpieler.umschalten());
    const tempo = (w) => { beat.bpm = Math.max(40, Math.min(200, Math.round(Number(w) || 90))); beatSpeichern(); bwSchalterZeichnen(); };
    document.getElementById('bw-tempo-minus').addEventListener('click', () => tempo(beat.bpm - 5));
    document.getElementById('bw-tempo-plus').addEventListener('click', () => tempo(beat.bpm + 5));
    document.getElementById('bw-tempo-regler').addEventListener('input', (e) => tempo(e.target.value));
    document.getElementById('bw-metronom').addEventListener('change', (e) => { beat.metronom = e.target.checked; beatSpeichern(); });
    document.getElementById('bw-zaehlzeiten').addEventListener('change', (e) => { beat.zaehlzeiten = e.target.checked; bwAenderung(); });
    document.getElementById('bw-farbe').addEventListener('click', () => { beat.farbe = !beat.farbe; bwAenderung(); });
    document.querySelectorAll('[data-bw-stumm]').forEach(b => b.addEventListener('click', () => {
        beat.stumm[b.dataset.bwStumm] = !beat.stumm[b.dataset.bwStumm];
        beatSpeichern(); bwSchalterZeichnen();
    }));

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { if (!document.getElementById('reiter-beat').classList.contains('hidden')) bwAnzeigeZeichnen(); }, 150);
    });
    bwZeichnen();
}

/* ---------- Reiter: Rhythmus-Werkstatt | Beat-Werkstatt ---------- */
const REITER_SCHLUESSEL = 'rw-reiter';
function reiterZeigen(name) {
    const beatAn = name === 'beat';
    document.getElementById('reiter-rhythmus').classList.toggle('hidden', beatAn);
    document.getElementById('reiter-beat').classList.toggle('hidden', !beatAn);
    document.querySelectorAll('[data-reiter]').forEach(b => {
        const an = b.dataset.reiter === name;
        b.classList.toggle('an', an);
        b.setAttribute('aria-selected', an ? 'true' : 'false');
    });
    document.getElementById('kopf-untertitel').textContent = beatAn
        ? 'Hi-Hat · Bassdrum · Snare – Beats bauen'
        : 'Takte bauen · vorklatschen · einüben';
    try { localStorage.setItem(REITER_SCHLUESSEL, name); } catch (e) { /* egal */ }
    if (beatAn) {
        Vorklatschen.stoppen(true);
        Metronom.stoppen();
        bwAnzeigeZeichnen();   // Breite stimmt erst, wenn der Reiter sichtbar ist
    } else {
        BeatSpieler.stoppen();
        anzeigeNeuZeichnen();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (ANSICHT) return;   // Einbett-Ansichten zeigen nur die Rhythmus-Uebung
    bwEinrichten();
    document.querySelectorAll('[data-reiter]').forEach(b => b.addEventListener('click', () => reiterZeigen(b.dataset.reiter)));
    let start = 'rhythmus';
    try { start = localStorage.getItem(REITER_SCHLUESSEL) || 'rhythmus'; } catch (e) { /* egal */ }
    // Ein Rhythmus-Link geht immer in die Rhythmus-Werkstatt
    if (/(^|[#&])r=/.test(location.hash)) start = 'rhythmus';
    if (start === 'beat') reiterZeigen('beat');
    window.addEventListener('hashchange', () => { if (/(^|[#&])r=/.test(location.hash)) reiterZeigen('rhythmus'); });
});
