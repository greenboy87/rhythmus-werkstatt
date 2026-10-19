/* ============================================================
   DRUMSET-WERKSTATT: das ganze Schlagzeug in EINEM Notensystem -
   zuerst fuer Fills. Eigener Reiter neben Rhythmus- und Beat-Werkstatt.

   Instrumente (Lage wie im ueblichen Drum-Notensatz): Crash (Hilfslinie),
   Hi-Hat (ueber dem System), Ride (oberste Linie), Tom 1 (4. Zwischenraum),
   Tom 2 (4. Linie), Snare (3. Zwischenraum), Tom 3 (2. Zwischenraum),
   Bassdrum (1. Zwischenraum). Eine Stimme, alle Haelse nach oben.

   Ein Platz = eine Zaehlzeit = { r, n }: r ist das Raster (4 = Sechzehntel,
   3 = Achteltriolen, 6 = Sextolen), n[i] die Instrumente an Stelle i
   (leer = Pause). Das Raster haengt am Platz, nicht am Baustein - so geht
   jede Einsatzfolge, auch Triolen gemischt mit geraden Zaehlzeiten.
   Wie die Noten aussehen, ergibt sich erst beim Zeichnen (dsNotation):
   alles, was ins Sechzehntelraster passt, wird mit den Beat-Bausteinen
   notiert, eine Sextole aus lauter Achteltriolen als Triole.

   Bedienung: Instrument waehlen ("Stift"), dann
   - Baustein antippen: die gewaehlte Zaehlzeit bekommt diesen Rhythmus
     auf dem Instrument (Trommeln ersetzen Trommeln, Becken Becken; die
     anderen Instrumente bleiben stehen), danach naechster Platz.
   - im Platz an eine Stelle tippen: Instrument dort an/aus. Gleiche
     Familie wird ersetzt (Snare -> Tom 1), andere kommt dazu (Crash +
     Bassdrum).
   ============================================================ */

const DS_INST = [
    { k: 'crash', name: 'Crash',    y: -8, fam: 'becken' },
    { k: 'hh',    name: 'Hi-Hat',   y: -4, fam: 'becken' },
    { k: 'ride',  name: 'Ride',     y: 0,  fam: 'becken' },
    { k: 't1',    name: 'Tom 1',    y: 4,  fam: 'trommel' },
    { k: 't2',    name: 'Tom 2',    y: 8,  fam: 'trommel' },
    { k: 's',     name: 'Snare',    y: 12, fam: 'trommel' },
    { k: 't3',    name: 'Tom 3',    y: 20, fam: 'trommel' },
    { k: 'b',     name: 'Bassdrum', y: 28, fam: 'bass' }
];
const DS = {};
DS_INST.forEach(i => { DS[i.k] = i; });
const DS_REIHE = DS_INST.map(i => i.k);
function dsSortieren(liste) {
    return [...new Set(liste)].filter(x => DS[x]).sort((a, b) => DS_REIHE.indexOf(a) - DS_REIHE.indexOf(b));
}
/* Farbe (nur mit "Farbe an"): Becken, Snare, Toms, Bassdrum */
function dsFarbe(k) { return DS[k].fam === 'becken' ? 'becken' : k === 's' ? 'snare' : k === 'b' ? 'bass' : 'tom'; }

/* Bausteine: alle 16 Einsatzfolgen im Sechzehntelraster (wie in der
   Beat-Werkstatt) und Triolen/Sextolen. m = Einsatz je Rasterstelle. */
const DS_BAUSTEINE = [
    ...BEAT_FORMEN.map(f => {
        const m = [0, 0, 0, 0];
        formEinsaetze(f.code).forEach(e => { m[e.k] = 1; });
        return { id: f.code, wort: f.wort, r: 4, m, mehr: !!f.mehr };
    }),
    { id: 'T',   wort: 'Achteltriole',                     r: 3, m: [1, 1, 1] },
    { id: 'TpT', wort: 'Triole mit Pause in der Mitte (Shuffle)', r: 3, m: [1, 0, 1] },
    { id: 'X',   wort: 'Sextole (Sechzehnteltriolen)',     r: 6, m: [1, 1, 1, 1, 1, 1] },
    { id: 'pTT', wort: 'Triole mit Pause am Anfang',       r: 3, m: [0, 1, 1], mehr: true },
    { id: 'TTp', wort: 'Triole mit Pause am Ende',         r: 3, m: [1, 1, 0], mehr: true },
    { id: 'ppT', wort: 'Triole: nur die letzte Note',      r: 3, m: [0, 0, 1], mehr: true },
    { id: 'Xa',  wort: 'Halbe Sextole vorn',               r: 6, m: [1, 1, 1, 0, 0, 0], mehr: true },
    { id: 'Xb',  wort: 'Halbe Sextole hinten',             r: 6, m: [0, 0, 0, 1, 1, 1], mehr: true }
];
const DS_BAUSTEIN = {};
DS_BAUSTEINE.forEach(b => { DS_BAUSTEIN[b.id] = b; });

/* Zaehlsilben je Rasterstelle (die Zahl steht auf der Zaehlzeit selbst) */
const DS_SILBEN = { 4: ['', 'e', '+', 'e'], 3: ['', 'ta', 'ti'], 6: ['', 'ta', 'ti', '+', 'ta', 'ti'] };

/* ---------- Zustand ---------- */
const DS_SCHLUESSEL = 'rw-drumset';
const DS_TAKTE_MAX = 8;
const DS_SCHLAEGE_MAX = 12;
const ds = {
    titel: '', takte: 2, schlaege: 4, bpm: 90,
    plaetze: [], zaehlzeiten: true, farbe: false, metronom: false,
    stift: 's', mehr: false
};
let dsAktiv = 0;
let dsTaktartEigen = false;

function dsS() { return ds.schlaege; }
function dsPlaetze() { return ds.takte * dsS(); }
function dsLeer(r) { return { r, n: Array.from({ length: r }, () => []) }; }
function dsKopie(p) { return p ? { r: p.r, n: p.n.map(x => x.slice()) } : null; }
function dsPlatzGueltig(p) {
    if (!p || typeof p !== 'object' || ![3, 4, 6].includes(p.r) || !Array.isArray(p.n) || p.n.length !== p.r) return null;
    const n = p.n.map(x => dsSortieren(Array.isArray(x) ? x : []));
    return n.some(x => x.length) ? { r: p.r, n } : null;
}

function dsLaden() {
    try {
        const x = JSON.parse(localStorage.getItem(DS_SCHLUESSEL) || 'null');
        if (!x || typeof x !== 'object') return false;
        ds.takte = Math.max(1, Math.min(DS_TAKTE_MAX, Math.round(Number(x.takte) || 2)));
        ds.schlaege = Math.max(1, Math.min(DS_SCHLAEGE_MAX, Math.round(Number(x.schlaege) || 4)));
        ds.bpm = Math.max(40, Math.min(200, Math.round(Number(x.bpm) || 90)));
        ['zaehlzeiten', 'farbe', 'metronom', 'mehr'].forEach(k => { if (typeof x[k] === 'boolean') ds[k] = x[k]; });
        if (DS[x.stift]) ds.stift = x.stift;
        if (typeof x.titel === 'string') ds.titel = x.titel.slice(0, 80);
        ds.plaetze = Array.isArray(x.plaetze) ? x.plaetze.slice(0, DS_TAKTE_MAX * DS_SCHLAEGE_MAX).map(dsPlatzGueltig) : [];
        return true;
    } catch (e) { return false; }
}
function dsSpeichern() {
    try { localStorage.setItem(DS_SCHLUESSEL, JSON.stringify(ds)); } catch (e) { /* privates Fenster - dann eben nicht */ }
}

/* ---------- Vorlagen: Takt 1 Groove (Crash auf 1), Takt 2 Fill ----------
   Im Loop landet der Fill so auf dem Crash - wie in echt. */
function dsG(code, ...noten) {   // Sechzehntelraster aus Beat-Baustein
    const p = dsLeer(4);
    formEinsaetze(code).forEach((e, i) => { p.n[e.k] = dsSortieren([].concat(noten.length === 1 ? noten[0] : noten[i])); });
    return p;
}
function dsT(r, ...noten) {      // Triole (3) / Sextole (6), null = Pause
    const p = dsLeer(r);
    for (let i = 0; i < r; i++) {
        const x = noten.length === 1 ? noten[0] : noten[i];
        p.n[i] = x ? dsSortieren([].concat(x)) : [];
    }
    return p;
}
const DS_GROOVE = [dsG('AA', ['crash', 'b'], 'hh'), dsG('AA', ['hh', 's'], 'hh'), dsG('AA', ['hh', 'b'], 'hh'), dsG('AA', ['hh', 's'], 'hh')];
const DS_GROOVE_OHNE_CRASH = [dsG('AA', ['hh', 'b'], 'hh'), DS_GROOVE[1]];
const DS_VORLAGEN = [
    { name: 'Sechzehntel: Snare → Toms', fill: [dsG('SSSS', 's'), dsG('SSSS', 't1'), dsG('SSSS', 't2'), dsG('SSSS', 't3')] },
    { name: 'Achtel rund um die Toms', fill: [dsG('AA', 's'), dsG('AA', 't1'), dsG('AA', 't2'), dsG('AA', 't3')] },
    { name: 'Halber Takt (ab Zählzeit 3)', fill: [...DS_GROOVE_OHNE_CRASH, dsG('SSSS', 's', 's', 't1', 't1'), dsG('SSSS', 't2', 't2', 't3', 't3')] },
    { name: 'Triolen: Snare → Toms', fill: [dsT(3, 's'), dsT(3, 't1'), dsT(3, 't2'), dsT(3, 't3')] },
    { name: 'Sextolen (ab Zählzeit 3)', fill: [...DS_GROOVE_OHNE_CRASH, dsT(6, 's'), dsT(6, 't1', 't1', 't2', 't2', 't3', 't3')] },
    { name: 'Hände und Bassdrum', fill: [dsG('SSSS', 's', 's', 'b', 'b'), dsG('SSSS', 't1', 't1', 'b', 'b'), dsG('SSSS', 't2', 't2', 'b', 'b'), dsG('SSSS', 't3', 't3', 'b', 'b')] }
];

/* ============================================================
   NOTENSCHRIFT
   Etwas breiter als in der Beat-Werkstatt, damit auch sechs Noten
   einer Sextole nebeneinander Platz haben.
   ============================================================ */
const DS_ZEIT = 92, DS_SCHLAG = 108, DS_EINRUECK = 12;
const DS_HALS = 26, DS_BALKEN = 4.5, DS_PAUSE_Y = 14;
const DS_ANZEIGE_SKALA = 1.15;
const DS_SYSTEM_OBEN = -74, DS_SYSTEM_HOEHE = 122;

/* Wie ein Platz notiert wird: { tuplet (0, 3 oder 6), teile: [{ d Dauer in
   Schlaegen, w Notenwert fuers Zeichnen, inst, silbe }] } oder null (leer).
   Passt alles ins Sechzehntelraster, kommen die Beat-Bausteine zum Zug
   (Viertel, punktierte Achtel usw.); eine Sextole nur aus Achteltriolen
   wird als Triole notiert. */
function dsNotation(p) {
    if (!p) return null;
    const ein = [];
    p.n.forEach((x, i) => { if (x.length) ein.push(i); });
    if (!ein.length) return null;
    if (ein.every(i => (i * 4) % p.r === 0)) {
        const m = new Map();
        ein.forEach(i => m.set(i * 4 / p.r, p.n[i]));
        const code = FORM_NACH_MUSTER[[...m.keys()].sort((a, b) => a - b).join(',')];
        let v = 0;
        return {
            tuplet: 0,
            teile: BEAT_FORM[code].teile.map(t => {
                const k = Math.round(v * 4);
                v += t.d;
                return { d: t.d, w: t.d, inst: t.p ? [] : m.get(k), silbe: k ? DS_SILBEN[4][k] : null };
            })
        };
    }
    let r = p.r, schritt = 1;
    if (r === 6 && ein.every(i => i % 2 === 0)) { r = 3; schritt = 2; }
    const teile = [];
    for (let i = 0; i < r; i++) {
        teile.push({ d: 1 / r, w: r === 3 ? 0.5 : 0.25, inst: p.n[i * schritt], silbe: i ? DS_SILBEN[r][i] : null });
    }
    return { tuplet: r, teile };
}

function dsKopf(x, y, k) {
    const kl = `ds-kopf ds-${dsFarbe(k)}`;
    if (DS[k].fam === 'becken') {
        return `<path class="${kl}" d="M${x - 4.5} ${y - 4.5} L${x + 4.5} ${y + 4.5} M${x + 4.5} ${y - 4.5} L${x - 4.5} ${y + 4.5}" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/>`;
    }
    return `<ellipse class="${kl}" cx="${x}" cy="${y}" rx="6.2" ry="4.5" transform="rotate(-18 ${x} ${y})" fill="currentColor"/>`;
}

/* Eine Zaehlzeit ab x0 zeichnen (eine Stimme, Haelse nach oben).
   Liegen zwei Koepfe eine Sekunde auseinander (z.B. Tom 1 + Tom 2),
   rutscht der obere wie ueblich rechts neben den Hals. */
function dsStimme(no, x0) {
    const teile = [];
    const noten = [];
    let v = 0;
    no.teile.forEach(t => {
        const px = x0 + DS_EINRUECK + v * DS_ZEIT;
        t.px = px;
        v += t.d;
        if (!t.inst || !t.inst.length) { teile.push(bwPause(px, t.w, DS_PAUSE_Y)); noten.push(null); return; }
        const ys = t.inst.map(x => DS[x].y);
        noten.push({ px, w: t.w, inst: t.inst, oben: Math.min(...ys), unten: Math.max(...ys) });
    });

    // Balkengruppen: aufeinanderfolgende Achtel/Sechzehntel, eine Pause trennt
    const gruppen = [];
    let g = [];
    noten.forEach(n => {
        if (n && n.w <= 0.75) { g.push(n); return; }
        if (g.length) gruppen.push(g);
        g = [];
        if (n) gruppen.push([n]);
    });
    if (g.length) gruppen.push(g);

    let ganzOben = DS_PAUSE_Y - 16;
    gruppen.forEach(gr => {
        const spitze = Math.min(...gr.map(n => n.oben)) - DS_HALS;
        ganzOben = Math.min(ganzOben, spitze);
        gr.forEach(n => {
            n.hx = n.px + 4.6;
            // von unten nach oben: Sekunde zum vorigen (nicht verschobenen) Kopf -> rechts daneben
            const reihe = n.inst.slice().sort((a, b) => DS[b].y - DS[a].y);
            let vorY = null, vorRechts = false;
            reihe.forEach(k => {
                const y = DS[k].y;
                const rechts = vorY !== null && vorY - y === 4 && !vorRechts;
                const x = rechts ? n.px + 10 : n.px;
                if (k === 'crash') teile.push(`<line x1="${Math.min(x, n.px) - 9}" y1="${y}" x2="${Math.max(x, n.px) + 9}" y2="${y}" stroke="currentColor" stroke-width="1.3"/>`);
                teile.push(dsKopf(x, y, k));
                if (n.w > 0.5 && n.w < 1) {
                    const aufLinie = y % 8 === 0;
                    teile.push(`<circle cx="${n.px + 11}" cy="${aufLinie ? y - 4 : y}" r="2.4" fill="currentColor"/>`);
                }
                vorY = y; vorRechts = rechts;
            });
            // Hals beim untersten Kopf: bei einem Becken-Kreuz am rechten oberen Arm
            const untenKreuz = DS[reihe[0]].fam === 'becken';
            teile.push(`<line x1="${n.hx}" y1="${untenKreuz ? n.unten - 4.5 : n.unten}" x2="${n.hx}" y2="${spitze}" stroke="currentColor" stroke-width="2.2" stroke-linecap="butt"/>`);
        });
        const y1 = spitze, y2 = spitze + 7;
        if (gr.length >= 2) {
            const a = gr[0].hx, b = gr[gr.length - 1].hx;
            teile.push(`<rect x="${a - 1.1}" y="${y1}" width="${b - a + 2.2}" height="${DS_BALKEN}" fill="currentColor"/>`);
            for (let i = 0; i < gr.length; i++) {
                if (gr[i].w > 0.25) continue;
                const rechts = i < gr.length - 1 && gr[i + 1].w <= 0.25;
                const links = i > 0 && gr[i - 1].w <= 0.25;
                let von, bis;
                if (rechts) { von = gr[i].hx; bis = gr[i + 1].hx; }
                else if (links) continue;
                else if (i > 0) { von = gr[i].hx - 8; bis = gr[i].hx; }
                else { von = gr[i].hx; bis = gr[i].hx + 8; }
                teile.push(`<rect x="${von - 1.1}" y="${y2}" width="${bis - von + 2.2}" height="${DS_BALKEN}" fill="currentColor"/>`);
            }
        } else if (gr[0].w <= 0.75) {
            const hx = gr[0].hx;
            const fahne = (y) => `<path d="M${hx} ${y} q 11 5 9 16 q -2 -8 -9 -9" fill="currentColor"/>`;
            teile.push(fahne(spitze));
            if (gr[0].w <= 0.25) teile.push(fahne(spitze + 8));
        }
    });

    // Triole/Sextole: Zahl ueber den Balken, Klammer, wenn nicht alles an einem Balken haengt
    if (no.tuplet) {
        const a = no.teile[0].px + 4.6, b = no.teile[no.teile.length - 1].px + 4.6;
        const mitte = (a + b) / 2, y = ganzOben - 8;
        const klammer = gruppen.length !== 1 || noten.some(n => !n);
        if (klammer) {
            teile.push(`<path d="M${a - 3} ${y + 4} V${y} H${mitte - 7} M${mitte + 7} ${y} H${b + 3} V${y + 4}" fill="none" stroke="currentColor" stroke-width="1.2"/>`);
        }
        teile.push(`<text class="ds-tuplet" x="${mitte}" y="${y + 4}" font-size="12" font-weight="800" font-style="italic" text-anchor="middle" font-family="DM Sans, sans-serif">${no.tuplet}</text>`);
    }
    return teile;
}

/* Ein Platz klein (Palette, Stift-Vorschau) - mit Notenlinien */
function dsPlatzSvg(p, breite) {
    const no = dsNotation(p);
    const linien = BW_LINIEN.map(y => `<line x1="0" y1="${y}" x2="${DS_SCHLAG}" y2="${y}" class="bw-linie" stroke="currentColor" stroke-width="1"/>`).join('');
    const inhalt = no ? dsStimme(no, 0).join('') : bwPause(DS_EINRUECK, 1, DS_PAUSE_Y);
    return `<svg viewBox="0 -62 ${DS_SCHLAG} 106" width="${breite || DS_SCHLAG}" class="bw-platz-svg">${linien}${inhalt}</svg>`;
}
/* Mini-Notensystem fuer den Instrument-Knopf: wo steht das Instrument? */
function dsLageSvg(k) {
    const y = DS[k].y;
    const linien = BW_LINIEN.map(l => `<line x1="-9" y1="${l}" x2="9" y2="${l}" stroke="currentColor" stroke-width="1" opacity=".45"/>`).join('');
    const hilfs = k === 'crash' ? `<line x1="-8" y1="-8" x2="8" y2="-8" stroke="currentColor" stroke-width="1.2"/>` : '';
    return `<svg class="ds-lage" viewBox="-10 -14 20 50" width="16" height="40" aria-hidden="true">${linien}${hilfs}${dsKopf(0, y, k)}</svg>`;
}

/* Eine Notenzeile mit den Takten aus taktListe */
function dsSystemSvg(taktListe, erstes, letztes, skala) {
    const sk = skala || DS_ANZEIGE_SKALA;
    const vorn = [], teile = [];
    let x = 8;
    teile.push(schluesselSvg(x + 8, 16, 'currentColor'));
    x += 22;
    if (erstes) {
        teile.push(`<text class="kopf" x="${x + 8}" y="8" font-size="17" font-weight="900" text-anchor="middle" dominant-baseline="middle" font-family="DM Sans, sans-serif">${dsS()}</text>`);
        teile.push(`<text class="kopf" x="${x + 8}" y="25" font-size="17" font-weight="900" text-anchor="middle" dominant-baseline="middle" font-family="DM Sans, sans-serif">4</text>`);
        x += 22;
    }
    x += 4;
    taktListe.forEach((t, i) => {
        if (i > 0) {
            teile.push(`<line x1="${x}" y1="0" x2="${x}" y2="32" stroke="currentColor" stroke-width="1.6"/>`);
            x += 6;
        }
        for (let s = 0; s < dsS(); s++) {
            const platz = t * dsS() + s, sx = x + s * DS_SCHLAG;
            vorn.push(`<rect class="bw-spiel" data-spiel="${platz}" x="${sx + 2}" y="${DS_SYSTEM_OBEN + 18}" width="${DS_SCHLAG - 4}" height="${DS_SYSTEM_HOEHE - 22}" rx="6"/>`);
            const no = dsNotation(ds.plaetze[platz]);
            if (!no) { teile.push(bwPause(sx + DS_EINRUECK, 1, DS_PAUSE_Y)); }
            else teile.push(...dsStimme(no, sx));
            if (ds.zaehlzeiten) {
                const zy = DS_SYSTEM_OBEN + 12;
                teile.push(`<text class="zaehlzeit" x="${sx + DS_EINRUECK}" y="${zy}" font-size="11" font-weight="700" text-anchor="middle" font-family="DM Sans, sans-serif" opacity="${no && no.teile[0].inst && no.teile[0].inst.length ? 1 : .45}">${s + 1}</text>`);
                if (no) no.teile.forEach(tl => {
                    if (!tl.silbe || !tl.inst || !tl.inst.length) return;
                    teile.push(`<text class="zaehlzeit" x="${tl.px}" y="${zy}" font-size="11" font-weight="700" text-anchor="middle" font-family="DM Sans, sans-serif" opacity=".6">${tl.silbe}</text>`);
                });
            }
        }
        x += dsS() * DS_SCHLAG;
    });
    if (letztes) {
        // Wiederholungszeichen am Schluss: laeuft im Kreis
        teile.push(`<circle cx="${x + 1}" cy="12" r="2.2" fill="currentColor"/><circle cx="${x + 1}" cy="20" r="2.2" fill="currentColor"/>`);
        teile.push(`<line x1="${x + 7}" y1="0" x2="${x + 7}" y2="32" stroke="currentColor" stroke-width="1.5"/>`);
        teile.push(`<line x1="${x + 12}" y1="0" x2="${x + 12}" y2="32" stroke="currentColor" stroke-width="4"/>`);
        x += 14;
    } else {
        teile.push(`<line x1="${x + 2}" y1="0" x2="${x + 2}" y2="32" stroke="currentColor" stroke-width="1.6"/>`);
        x += 2;
    }
    const linien = BW_LINIEN.map(y => `<line x1="8" y1="${y}" x2="${x}" y2="${y}" class="bw-linie-anzeige" stroke="currentColor" stroke-width="1.2"/>`).join('');
    const breite = x + 8;
    return `<svg class="bw-system ds-system" viewBox="0 ${DS_SYSTEM_OBEN} ${breite} ${DS_SYSTEM_HOEHE}" width="${Math.round(breite * sk)}" height="${Math.round(DS_SYSTEM_HOEHE * sk)}">${vorn.join('')}${linien}${teile.join('')}</svg>`;
}

/* ============================================================
   KLANG - Becken, Bassdrum und Summe aus der Beat-Werkstatt,
   Snare aus audio.js, Toms neu: Sinus mit Tonhoehenabfall wie die
   Bassdrum, nur hoeher und mit etwas Fell-Rauschen.
   ============================================================ */
const DS_TOM_HZ = { t1: 210, t2: 155, t3: 105 };
function dsTom(ctx, zeit, ziel, k, staerke) {
    const f = DS_TOM_HZ[k], st = staerke || 1;
    const dauer = k === 't3' ? 0.7 : 0.5;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.6, zeit);
    o.frequency.exponentialRampToValueAtTime(f, zeit + 0.06);
    o.frequency.exponentialRampToValueAtTime(f * 0.85, zeit + dauer);
    const g = bwHuelle(ctx, zeit, 0.95 * st, dauer);
    o.connect(g); g.connect(ziel);
    o.start(zeit); o.stop(zeit + dauer + 0.05);
    const rausch = bwRauschen(ctx, 0.08);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass'; band.frequency.value = f * 8; band.Q.value = 0.9;
    const rg = bwHuelle(ctx, zeit, 0.35 * st, 0.07);
    rausch.connect(band); band.connect(rg); rg.connect(ziel);
    rausch.start(zeit);
}
function dsNoteSpielen(ctx, zeit, ziel, inst, aufSchlag) {
    inst.forEach(k => {
        if (k === 'b') bwBassdrum(ctx, zeit, ziel, 1);
        else if (k === 's') snareKlang(ctx, zeit, 'akzent', ziel);
        else if (DS_TOM_HZ[k]) dsTom(ctx, zeit, ziel, k, 1);
        else bwBecken(ctx, zeit, ziel, k, aufSchlag ? 1 : 0.7);
    });
}
/* Kurz vorhoeren (Note gesetzt, Baustein gesetzt) */
let dsVorhoerSumme = null;
function dsVorhoeren(p) {
    if (!p || DrumSpieler.istAn()) return;
    const ctx = tonBereit(() => dsVorhoeren(p));
    if (!ctx) return;
    if (!dsVorhoerSumme || dsVorhoerSumme.context !== ctx) dsVorhoerSumme = bwSummeBauen(ctx);
    const t0 = ctx.currentTime + 0.03, schlag = 60 / ds.bpm;
    p.n.forEach((inst, i) => { if (inst.length) dsNoteSpielen(ctx, t0 + i / p.r * schlag, dsVorhoerSumme, inst, i === 0); });
}

/* Abspielen: wie BeatSpieler - Takt fuer Takt 0,3 s voraus aus dem
   aktuellen Stand, Aenderungen wirken im naechsten Takt. */
const DrumSpieler = (function () {
    let laeuft = false, ctx = null, summe = null, uhr = null;
    let naechsteZeit = 0, taktZaehler = 0, anzeigeTimer = [];

    function markieren(platz) {
        document.querySelectorAll('#reiter-drumset [data-spiel].jetzt').forEach(el => el.classList.remove('jetzt'));
        if (platz === null) return;
        document.querySelectorAll(`#reiter-drumset [data-spiel="${platz}"]`).forEach(el => el.classList.add('jetzt'));
    }
    function taktPlanen(takt, t0) {
        const schlag = 60 / ds.bpm;
        for (let s = 0; s < dsS(); s++) {
            const platz = takt * dsS() + s, ts = t0 + s * schlag;
            if (ds.metronom) metronomKlick(ctx, ts, s === 0);
            anzeigeTimer.push(setTimeout(() => { if (laeuft) markieren(platz); }, Math.max(0, (ts - ctx.currentTime) * 1000)));
            const p = ds.plaetze[platz];
            if (p) p.n.forEach((inst, i) => { if (inst.length) dsNoteSpielen(ctx, ts + i / p.r * schlag, summe, inst, i === 0); });
        }
        if (anzeigeTimer.length > 64) anzeigeTimer = anzeigeTimer.slice(-16);
    }
    function tick() {
        if (!laeuft) return;
        if (ctx.state !== 'running') { stoppen(); zeigeToast('Der Ton ist weggebrochen - gestoppt.', 'danger'); return; }
        audioCtxZeitmarke = ctx.currentTime; audioCtxWanduhr = Date.now();
        while (naechsteZeit < ctx.currentTime + 0.3) {
            taktPlanen(taktZaehler % ds.takte, naechsteZeit);
            naechsteZeit += dsS() * 60 / ds.bpm;
            taktZaehler++;
        }
    }
    function starten() {
        const c = tonBereit(starten);
        if (!c) return;
        Vorklatschen.stoppen(true);
        Metronom.stoppen();
        BeatSpieler.stoppen();
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
        const b = document.getElementById('ds-abspielen');
        if (b) b.innerHTML = laeuft ? '<i class="fa-solid fa-stop"></i> Stopp' : '<i class="fa-solid fa-play"></i> Abspielen';
    }
    return { starten, stoppen, umschalten: () => (laeuft ? stoppen() : starten()), istAn: () => laeuft };
})();

/* ============================================================
   EINGABE
   ============================================================ */
function dsAenderung() {
    dsSpeichern();
    dsZeichnen();
}

/* Baustein in den gewaehlten Platz: das Instrument des Stifts bekommt
   diesen Rhythmus, die eigene Familie (Trommeln bzw. Becken) wird dabei
   ersetzt, alles andere bleibt - soweit es ins neue Raster passt. */
function dsBausteinSetzen(id) {
    const b = DS_BAUSTEIN[id];
    const alt = ds.plaetze[dsAktiv];
    const fam = DS[ds.stift].fam;
    const neu = dsLeer(b.r);
    let verloren = 0;
    if (alt) {
        alt.n.forEach((inst, i) => {
            const bleibt = inst.filter(k => DS[k].fam !== fam);
            if (!bleibt.length) return;
            const j = i * b.r / alt.r;
            if (Number.isInteger(j)) neu.n[j] = bleibt.slice();
            else verloren++;
        });
    }
    b.m.forEach((an, i) => { if (an) neu.n[i] = dsSortieren([...neu.n[i], ds.stift]); });
    if (verloren) zeigeToast(`${verloren} Note${verloren > 1 ? 'n passten' : ' passte'} nicht ins neue Raster und ${verloren > 1 ? 'sind' : 'ist'} weg.`, 'info');
    ds.plaetze[dsAktiv] = dsPlatzGueltig(neu);
    dsVorhoeren(neu);
    if (dsAktiv < dsPlaetze() - 1) dsAktiv++;
    dsAenderung();
}

/* Stelle i im Platz angetippt: Stift-Instrument an/aus. Gleiche Familie
   wird ersetzt (Snare -> Tom), eine andere kommt dazu (Crash + Bassdrum). */
function dsTippen(platz, i) {
    const p = dsKopie(ds.plaetze[platz]) || dsLeer(4);
    const x = ds.stift, fam = DS[x].fam;
    let note = p.n[i];
    if (note.includes(x)) note = note.filter(k => k !== x);
    else note = dsSortieren([...note.filter(k => DS[k].fam !== fam), x]);
    p.n[i] = note;
    ds.plaetze[platz] = dsPlatzGueltig(p);
    if (note.length) dsVorhoeren({ r: 1, n: [note] });
}

/* Ein Platz im Editor: Notensystem, darueber nur Auswahl, im System je
   Rasterstelle eine Tippflaeche (Punkte unten zeigen das Raster). */
const DS_ZELLE = [-62, 106];
function dsZelleSvg(platz) {
    const [y0, h] = DS_ZELLE;
    const p = ds.plaetze[platz];
    const r = p ? p.r : 4;
    const teile = [];
    teile.push(`<rect class="bw-band${p ? '' : ' leer'}${dsAktiv === platz ? ' aktiv' : ''}" x="1.5" y="${y0 + 1.5}" width="${DS_SCHLAG - 3}" height="${h - 3}" rx="4"/>`);
    teile.push(...BW_LINIEN.map(y => `<line x1="0" y1="${y}" x2="${DS_SCHLAG}" y2="${y}" class="bw-linie" stroke="currentColor" stroke-width="1"/>`));
    const no = dsNotation(p);
    if (no) teile.push(...dsStimme(no, 0));
    const mitte = (i) => DS_EINRUECK + i * DS_ZEIT / r;
    for (let i = 0; i < r; i++) {
        const x0 = i ? (mitte(i - 1) + mitte(i)) / 2 : 0;
        const x1 = i < r - 1 ? (mitte(i) + mitte(i + 1)) / 2 : DS_SCHLAG;
        teile.push(`<circle class="ds-raster-punkt" cx="${mitte(i)}" cy="39" r="${i ? 1.6 : 2.4}"/>`);
        teile.push(`<rect class="noten-feld bw-raster" data-i="${i}" x="${x0}" y="-15" width="${x1 - x0}" height="${y0 + h + 15}" fill="transparent"><title>${DS[ds.stift].name} an/aus</title></rect>`);
    }
    return `<svg viewBox="0 ${y0} ${DS_SCHLAG} ${h}" width="${DS_SCHLAG}" height="${h}" class="bw-platz-svg">${teile.join('')}</svg>`;
}

function dsEditorZeichnen() {
    if (dsAktiv >= dsPlaetze()) dsAktiv = dsPlaetze() - 1;
    let html = '';
    for (let t = 0; t < ds.takte; t++) {
        html += `<div class="bw-takt"><div class="bw-takt-kopf"><span>Takt ${t + 1}</span>` +
            `<button type="button" class="bw-kopieren" data-takt="${t}" title="Diesen Takt in den nächsten Takt kopieren"><i class="fa-regular fa-copy"></i> in nächsten</button></div>` +
            `<div class="bw-reihe" style="grid-template-columns: repeat(${dsS()}, minmax(64px, ${DS_SCHLAG}px))">`;
        for (let s = 0; s < dsS(); s++) {
            const platz = t * dsS() + s;
            const weg = ds.plaetze[platz] ? '<button type="button" class="bw-weg" title="Zählzeit leeren" aria-label="Zählzeit leeren">×</button>' : '';
            html += `<div class="bw-platz" data-platz="${platz}" data-spiel="${platz}" title="Oben antippen: Zählzeit wählen – im Notensystem: ${DS[ds.stift].name} an dieser Stelle an/aus">` +
                `<span class="bw-schlag-nr">${s + 1}</span>${dsZelleSvg(platz)}${weg}</div>`;
        }
        html += '</div></div>';
    }
    document.getElementById('ds-editor').innerHTML = html;
}

function dsWerkzeugZeichnen() {
    document.getElementById('ds-stifte').innerHTML = '<span class="bw-ziel">Instrument</span>' + DS_INST.map((x, i) =>
        `<button type="button" class="btn bw-chip ds-stift${ds.stift === x.k ? ' an' : ''}" data-stift="${x.k}" title="${x.name} – Taste ${i + 1}">` +
        `${dsLageSvg(x.k)}<span class="ds-stift-name"><span class="bw-punkt ds-p-${dsFarbe(x.k)}"></span>${x.name}</span><span class="ds-taste">${i + 1}</span></button>`).join('');
    const knopf = (b) => {
        const p = dsLeer(b.r);
        b.m.forEach((an, i) => { if (an) p.n[i] = [ds.stift]; });
        return `<button type="button" class="palette-baustein bw-baustein ds-baustein" data-baustein="${b.id}" title="${b.wort}">${dsPlatzSvg(p, 76)}</button>`;
    };
    const sichtbar = DS_BAUSTEINE.filter(b => ds.mehr || !b.mehr);
    document.getElementById('ds-palette').innerHTML =
        `<div class="palette-gruppe"><span class="ds-gruppe-name">Gerade</span>${sichtbar.filter(b => b.r === 4).map(knopf).join('')}</div>` +
        `<div class="palette-gruppe"><span class="ds-gruppe-name">Triolen</span>${sichtbar.filter(b => b.r !== 4).map(knopf).join('')}</div>`;
    document.getElementById('ds-mehr').innerHTML = ds.mehr
        ? '<i class="fa-solid fa-minus"></i> Weniger Bausteine'
        : '<i class="fa-solid fa-plus"></i> Mehr Bausteine (mit Pausen)';
    document.getElementById('ds-ziel').innerHTML = `Bausteine spielen auf <b>${DS[ds.stift].name}</b> – Ziel: Takt ${Math.floor(dsAktiv / dsS()) + 1}, Zählzeit ${dsAktiv % dsS() + 1}`;
}

/* ---------- Notenbild, Vollbild, Druck ---------- */
function dsSystemBreite(p) { return 72 + p * dsS() * DS_SCHLAG + (p - 1) * 6; }
function dsZeilen(proZeile) {
    const zeilen = [];
    for (let t = 0; t < ds.takte; t += proZeile) {
        const liste = [];
        for (let i = t; i < Math.min(ds.takte, t + proZeile); i++) liste.push(i);
        zeilen.push(liste);
    }
    return zeilen;
}
function dsEinpassen(w, h, abstand, minSkala, maxSkala) {
    let bestes = null;
    for (let p = ds.takte; p >= 1; p--) {
        const n = Math.ceil(ds.takte / p);
        const skala = Math.min(maxSkala, w / dsSystemBreite(p), (h - (n - 1) * abstand) / (n * DS_SYSTEM_HOEHE));
        if (skala >= minSkala) return { p, skala };
        if (!bestes || skala > bestes.skala) bestes = { p, skala };
    }
    return bestes;
}
function dsSystemeHtml(p, skala) {
    const zeilen = dsZeilen(p);
    return zeilen.map((z, i) => dsSystemSvg(z, i === 0, i === zeilen.length - 1, skala)).join('');
}
function dsAnzeigeZeichnen() {
    const host = document.getElementById('ds-anzeige');
    const karte = document.getElementById('ds-anzeige-karte');
    if (karte.classList.contains('vollbild')) {
        const kopf = karte.querySelector('.bw-vollbild-kopf');
        const w = window.innerWidth * 0.94;
        const h = window.innerHeight - (kopf ? kopf.offsetHeight : 0) - 60;
        const { p, skala } = dsEinpassen(w, h, 12, 99, 6);
        host.innerHTML = dsSystemeHtml(p, skala);
        return;
    }
    const breite = host.clientWidth || 900;
    const taktBreite = (dsS() * DS_SCHLAG + 6) * DS_ANZEIGE_SKALA;
    const proZeile = Math.max(1, Math.floor((breite - 80 * DS_ANZEIGE_SKALA) / taktBreite));
    host.innerHTML = dsSystemeHtml(proZeile, DS_ANZEIGE_SKALA);
}

const DS_DRUCKFARBEN = { 'ellipse.ds-bass': '#2563eb', 'ellipse.ds-snare': '#ea580c', 'ellipse.ds-tom': '#16a34a', 'path.ds-becken': '#a16207' };
function dsTitel() { return (document.getElementById('ds-titel').value || '').trim(); }
function dsDruckZeichnen() {
    document.getElementById('ds-druck-titel').textContent = dsTitel() || '🥁 Drumset-Werkstatt';
    const host = document.getElementById('ds-druck-noten');
    const { p, skala } = dsEinpassen(DRUCK_BREITE, DRUCK_HOEHE, DRUCK_ZEILENABSTAND, 0.85, 1.3);
    host.innerHTML = dsSystemeHtml(p, skala);
    host.querySelectorAll('.bw-system').forEach(svg => {
        svg.style.width = svg.getAttribute('width') + 'px';
        svg.style.height = svg.getAttribute('height') + 'px';
        if (!ds.farbe) return;
        Object.entries(DS_DRUCKFARBEN).forEach(([sel, farbe]) =>
            svg.querySelectorAll(sel).forEach(el => el.setAttribute(sel.startsWith('path') ? 'stroke' : 'fill', farbe)));
    });
}
async function dsPdfHerunterladen() {
    const knopf = document.getElementById('ds-pdf');
    knopf.disabled = true;
    try {
        dsDruckZeichnen();
        const svgs = [...document.querySelectorAll('#ds-druck-noten .bw-system')];
        const pdf = await blattPdf(svgs, dsTitel(), '🥁 Drumset-Werkstatt', 'Drumset');
        const name = exportDateiname(dsTitel() || 'Drumset', dsS() + '/4', ds.bpm, 'mp3').replace(/_\d+bpm\.mp3$/, '.pdf');
        blobHerunterladen(pdf, name);
    } catch (e) {
        zeigeToast(e.message, 'danger');
    } finally {
        knopf.disabled = false;
    }
}

function dsSchalterZeichnen() {
    const ta = document.getElementById('ds-taktart');
    const fest = [4, 3, 2].includes(dsS());
    if (document.activeElement !== ta) ta.value = fest && !dsTaktartEigen ? String(dsS()) : 'eigene';
    document.getElementById('ds-taktart-eigen').classList.toggle('hidden', ta.value !== 'eigene');
    const ez = document.getElementById('ds-zaehler');
    if (document.activeElement !== ez) ez.value = dsS();
    document.getElementById('ds-takte-anzeige').textContent = ds.takte;
    document.getElementById('ds-takte-minus').disabled = ds.takte <= 1;
    document.getElementById('ds-takte-plus').disabled = ds.takte >= DS_TAKTE_MAX;
    document.getElementById('ds-tempo-anzeige').textContent = ds.bpm + ' bpm';
    document.getElementById('ds-tempo-regler').value = ds.bpm;
    document.getElementById('ds-metronom').checked = ds.metronom;
    document.getElementById('ds-zaehlzeiten').checked = ds.zaehlzeiten;
    document.getElementById('reiter-drumset').classList.toggle('ds-bunt', ds.farbe);
    document.getElementById('ds-farbe').innerHTML = ds.farbe
        ? '<i class="fa-solid fa-palette"></i> Farbe aus' : '<i class="fa-solid fa-palette"></i> Farbe an';
}

function dsZeichnen() {
    dsSchalterZeichnen();
    dsEditorZeichnen();
    dsWerkzeugZeichnen();
    dsAnzeigeZeichnen();
}

/* Taktart wechseln: jeder Takt behaelt seine ersten Zaehlzeiten */
function dsTaktartSetzen(neu) {
    const S2 = Math.max(1, Math.min(DS_SCHLAEGE_MAX, Math.round(Number(neu) || 4)));
    const S1 = dsS();
    if (S2 === S1) return;
    const liste = [];
    for (let t = 0; t < DS_TAKTE_MAX; t++) {
        for (let s = 0; s < S2; s++) liste[t * S2 + s] = s < S1 ? ds.plaetze[t * S1 + s] || null : null;
    }
    ds.plaetze = liste;
    ds.schlaege = S2;
    dsAktiv = Math.min(dsAktiv, dsPlaetze() - 1);
    dsAenderung();
}

function dsVorlageLaden(nr) {
    const v = DS_VORLAGEN[nr];
    if (!v) return;
    ds.schlaege = 4; ds.takte = 2;
    dsTaktartEigen = false;
    ds.plaetze = [...DS_GROOVE, ...v.fill].map(dsKopie);
    dsAktiv = 4;
    zeigeToast(`Vorlage „${v.name}“ geladen – Takt 1 Groove, Takt 2 Fill.`, 'info');
    dsAenderung();
}

/* Tastatur (nur im Drumset-Reiter): Leertaste, ←/→, ⌫, 1-8 Instrument */
function dsTaste(e) {
    if (document.getElementById('reiter-drumset').classList.contains('hidden')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const ziel = e.target;
    if (ziel && (ziel.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(ziel.tagName) && ziel.type !== 'checkbox' && ziel.type !== 'range')) return;
    let fertig = true;
    if (e.key === ' ') {
        if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
        DrumSpieler.umschalten();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        dsAktiv = Math.max(0, Math.min(dsPlaetze() - 1, dsAktiv + (e.key === 'ArrowLeft' ? -1 : 1)));
        dsZeichnen();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
        ds.plaetze[dsAktiv] = null;
        dsAenderung();
    } else if (/^[1-8]$/.test(e.key)) {
        ds.stift = DS_INST[Number(e.key) - 1].k;
        dsAenderung();
    } else {
        fertig = false;
    }
    if (fertig) e.preventDefault();
}

function dsEinrichten() {
    dsLaden();
    if (!ds.plaetze.some(Boolean)) {
        // Erster Besuch: Groove + Fill statt leerem Blatt
        ds.takte = 2; ds.schlaege = 4;
        ds.plaetze = [...DS_GROOVE, ...DS_VORLAGEN[0].fill].map(dsKopie);
    }
    dsTaktartEigen = ![4, 3, 2].includes(dsS());

    const vorlage = document.getElementById('ds-vorlage');
    DS_VORLAGEN.forEach((v, i) => {
        const o = document.createElement('option');
        o.value = i; o.textContent = v.name;
        vorlage.appendChild(o);
    });
    vorlage.addEventListener('change', () => { if (vorlage.value !== '') dsVorlageLaden(Number(vorlage.value)); vorlage.value = ''; });

    const taktart = document.getElementById('ds-taktart');
    taktart.addEventListener('change', () => {
        dsTaktartEigen = taktart.value === 'eigene';
        if (dsTaktartEigen) { dsSchalterZeichnen(); document.getElementById('ds-zaehler').focus(); return; }
        dsTaktartSetzen(Number(taktart.value));
    });
    document.getElementById('ds-zaehler').addEventListener('change', (e) => dsTaktartSetzen(e.target.value));
    document.getElementById('ds-takte-minus').addEventListener('click', () => { ds.takte = Math.max(1, ds.takte - 1); dsAenderung(); });
    document.getElementById('ds-takte-plus').addEventListener('click', () => { ds.takte = Math.min(DS_TAKTE_MAX, ds.takte + 1); dsAenderung(); });
    document.getElementById('ds-leeren').addEventListener('click', () => { ds.plaetze = []; dsAktiv = 0; dsAenderung(); });
    document.getElementById('ds-farbe').addEventListener('click', () => { ds.farbe = !ds.farbe; dsAenderung(); });

    document.getElementById('ds-editor').addEventListener('click', (e) => {
        const kop = e.target.closest('.bw-kopieren');
        if (kop) {
            const t = Number(kop.dataset.takt);
            if (t + 1 >= DS_TAKTE_MAX) { zeigeToast('Mehr als ' + DS_TAKTE_MAX + ' Takte gehen nicht.', 'danger'); return; }
            if (t + 1 >= ds.takte) ds.takte = t + 2;
            for (let s = 0; s < dsS(); s++) ds.plaetze[(t + 1) * dsS() + s] = dsKopie(ds.plaetze[t * dsS() + s]);
            dsAenderung();
            return;
        }
        const el = e.target.closest('.bw-platz');
        if (!el) return;
        const platz = Number(el.dataset.platz);
        dsAktiv = platz;
        if (e.target.closest('.bw-weg')) ds.plaetze[platz] = null;
        else {
            const feld = e.target.closest('[data-i]');
            if (feld) dsTippen(platz, Number(feld.dataset.i));
        }
        dsAenderung();
    });
    document.getElementById('ds-stifte').addEventListener('click', (e) => {
        const c = e.target.closest('[data-stift]');
        if (!c) return;
        ds.stift = c.dataset.stift;
        dsVorhoeren({ r: 1, n: [[ds.stift]] });
        dsAenderung();
    });
    document.getElementById('ds-palette').addEventListener('click', (e) => {
        const b = e.target.closest('[data-baustein]');
        if (b) dsBausteinSetzen(b.dataset.baustein);
    });
    document.getElementById('ds-mehr').addEventListener('click', () => { ds.mehr = !ds.mehr; dsAenderung(); });
    document.addEventListener('keydown', dsTaste);

    document.getElementById('ds-abspielen').addEventListener('click', () => DrumSpieler.umschalten());
    const titel = document.getElementById('ds-titel');
    titel.value = ds.titel;
    titel.addEventListener('input', () => { ds.titel = titel.value.slice(0, 80); dsSpeichern(); });
    document.getElementById('ds-drucken').addEventListener('click', () => { dsDruckZeichnen(); window.print(); });
    document.getElementById('ds-pdf').addEventListener('click', dsPdfHerunterladen);
    window.addEventListener('beforeprint', () => { if (document.body.classList.contains('druck-drumset')) dsDruckZeichnen(); });
    const vollKarte = document.getElementById('ds-anzeige-karte');
    const vollKnopf = document.getElementById('ds-vollbild');
    vollKnopf.addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (vollKarte.requestFullscreen) vollKarte.requestFullscreen().catch(() => zeigeToast('Vollbild wird von diesem Browser nicht unterstützt.', 'danger'));
        else zeigeToast('Vollbild wird von diesem Browser nicht unterstützt.', 'danger');
    });
    document.addEventListener('fullscreenchange', () => {
        const an = document.fullscreenElement === vollKarte;
        vollKarte.classList.toggle('vollbild', an);
        vollKnopf.innerHTML = an ? '<i class="fa-solid fa-compress"></i> Verlassen' : '<i class="fa-solid fa-expand"></i> Vollbild';
        setTimeout(dsAnzeigeZeichnen, 50);
    });
    const tempo = (w) => { ds.bpm = Math.max(40, Math.min(200, Math.round(Number(w) || 90))); dsSpeichern(); dsSchalterZeichnen(); };
    document.getElementById('ds-tempo-minus').addEventListener('click', () => tempo(ds.bpm - 5));
    document.getElementById('ds-tempo-plus').addEventListener('click', () => tempo(ds.bpm + 5));
    document.getElementById('ds-tempo-regler').addEventListener('input', (e) => tempo(e.target.value));
    document.getElementById('ds-metronom').addEventListener('change', (e) => { ds.metronom = e.target.checked; dsSpeichern(); });
    document.getElementById('ds-zaehlzeiten').addEventListener('change', (e) => { ds.zaehlzeiten = e.target.checked; dsAenderung(); });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { if (!document.getElementById('reiter-drumset').classList.contains('hidden')) dsAnzeigeZeichnen(); }, 150);
    });
    dsZeichnen();
}

document.addEventListener('DOMContentLoaded', () => {
    if (ANSICHT) return;   // Einbett-Ansichten zeigen nur die Rhythmus-Uebung
    dsEinrichten();
});
