/* ============================================================
   ZAEHL-KERN: das Zaehlzeiten-Spiel ohne Seite drumherum.
   Gemeinsame Grundlage von Zaehl-Training (js/zaehlspiel.js, Reiter
   "zaehlen") und Klassenspiel (klasse.html, js/klasse.js): Takte
   wuerfeln, Aufgabe mit Kaestchen bauen, Eingaben pruefen, Notenbild
   mit Kaestchen zeichnen. Kein DOM ausser in zkZeichnen, keine Toasts,
   keine Punkte - das macht jede Seite selbst.
   Aufgabe = { stueck: {zeichen, takte}, felder: [{takt, baustein, teil,
   soll, wert, status: ''|'richtig'|'falsch'|'geloest'}], aktiv, fehler,
   stufe, start, fertig, dauer }.
   Stufen = wann geprueft wird: 1 jede Eingabe sofort, 2 sobald ein Takt
   voll ist, 3 sobald die ganze Aufgabe voll ist.
   ============================================================ */
// Triolen haben keine deutsche Zaehlsilbe im Sechzehntelraster (siehe
// stueckAnzeigeHtml) - deshalb nicht im Spiel.
const ZS_BAUSTEINE = RHYTHMUS_BAUSTEINE.filter(b => !b.triole);
const ZS_TAKTARTEN = ['2/4', '3/4', '4/4'];
const ZS_STUFEN_KURZ = { 1: 'Stufe 1 · sofort', 2: 'Stufe 2 · je Takt', 3: 'Stufe 3 · ganze Zeile' };
const ZS_FELD_B = 22, ZS_FELD_H = 24, ZS_FELD_OBEN = ZAEHL_Y - 20;

/* ---------- Zaehlsilbe ----------
   Dieselbe Rechnung wie die Zaehlzeiten in stueckAnzeigeHtml, nur mit "+"
   statt "und" (passt ins Kaestchen): 1 e + e 2 e + e ... */
function zsSilbe(v, zeichen) {
    const pw = pulsWert(zeichen);
    const puls = Math.floor((v + 1e-6) / pw);
    const stufe = Math.round((v - puls * pw) / 0.25) % 4;
    return stufe === 0 ? String(puls + 1) : ['', 'e', '+', 'e'][stufe];
}

/* ---------- Takte wuerfeln ----------
   Nicht der einfache Generator (generator.js), der schon den ersten
   sinnvollen Takt nimmt: Hier werden viele Kandidaten gewuerfelt und einer
   der "kniffligsten" genommen - Einsaetze neben der Zaehlzeit, Pausen auf
   dem Schlag, Halbe/Punktierte, die ueber Schlaege reichen, und moeglichst
   verschiedene Bausteine. Ein Takt darf auch mit einer Pause beginnen. */
function zsTaktBewerten(takt, zeichen) {
    let v = 0, punkte = 0, daneben = 0, noten = 0, pausen = 0;
    takt.forEach(b => b.teile.forEach(t => {
        const silbe = zsSilbe(v, zeichen);
        const aufSchlag = /^\d$/.test(silbe);
        if (t.p) { pausen++; if (aufSchlag) punkte += 1.5; }
        else {
            noten++;
            if (!aufSchlag) daneben += silbe === 'e' ? 1.5 : 1;
            if (t.d > 1 || istPunktiert(t.d)) punkte += 1.5;   // klingt ueber den naechsten Einsatz hinweg
        }
        v += t.d;
    }));
    // Einsaetze neben dem Schlag zaehlen nur bis zu einer Grenze - sonst
    // gewaenne immer der Takt mit den meisten Sechzehnteln. Eine lange Kette
    // gleicher Sechzehntel ist eher Fleiss als Koennen.
    const pulse = taktPulse(zeichen);
    punkte += Math.min(daneben, pulse * 1.5);
    if (noten > pulse * 3) punkte -= (noten - pulse * 3) * 1.5;
    // Abwechslung: jeder weitere gleiche Baustein im Takt kostet
    const arten = new Set(takt.map(b => b.code)).size;
    punkte += arten * 1.5 - (takt.length - arten) * 1.5;
    if (pausen > 1) punkte -= (pausen - 1) * 1.5;
    return { punkte, noten, pausen };
}
function zsTaktWuerfeln(erlaubt, zeichen, vorher) {
    const soll = taktSoll(zeichen);
    const kandidaten = [];
    for (let versuch = 0; versuch < 200 && kandidaten.length < 40; versuch++) {
        const takt = [];
        let rest = soll;
        while (rest > 0.001) {
            const moeglich = erlaubt.filter(b => b.dauer <= rest + 0.001 && bausteinPasstAn(b, soll - rest, zeichen));
            if (!moeglich.length) break;
            takt.push(moeglich[Math.floor(Math.random() * moeglich.length)]);
            rest -= takt[takt.length - 1].dauer;
        }
        if (Math.abs(rest) > 0.001) continue;
        const w = zsTaktBewerten(takt, zeichen);
        if (w.noten < 2 && soll > 1) continue;
        if (w.pausen > w.noten) continue;
        const kuerzel = takt.map(b => b.code).join('-');
        if (kuerzel === vorher) continue;
        kandidaten.push({ takt, punkte: w.punkte + Math.random() * 4, kuerzel });
    }
    if (!kandidaten.length) return null;
    kandidaten.sort((a, b) => b.punkte - a.punkte);
    // nicht immer der allerschwerste - sonst kaeme oft derselbe Takt
    return kandidaten[Math.floor(Math.random() * Math.min(6, kandidaten.length))];
}
/* codes: erlaubte Baustein-Kuerzel -> { takte } oder { fehler } */
function zkTakteWuerfeln(codes, zeichen, anzahl) {
    const erlaubt = ZS_BAUSTEINE.filter(b => codes.includes(b.code));
    if (!erlaubt.length) return { fehler: 'Wähle mindestens einen Baustein aus.' };
    const takte = [];
    let vorher = null;
    for (let t = 0; t < anzahl; t++) {
        const k = zsTaktWuerfeln(erlaubt, zeichen, vorher);
        if (!k) return { fehler: 'Aus dieser Auswahl geht kein Takt genau auf – nimm noch einen kürzeren Baustein dazu.' };
        takte.push({ bausteine: k.takt });
        vorher = k.kuerzel;
    }
    return { takte };
}

/* ---------- Aufgabe ---------- */
// manuell: Stufe 2/3 pruefen erst auf zkPruefen (Knopf "Pruefen"), nicht von
// selbst, sobald das letzte Kaestchen gefuellt ist - so kann man vorher noch
// einmal alles durchsehen. Das Klassenspiel prueft weiter von selbst.
function zkAufgabe(stueck, stufe, manuell) {
    const felder = [];
    stueck.takte.forEach((takt, ti) => {
        let v = 0;
        takt.bausteine.forEach((b, bi) => b.teile.forEach((teil, tei) => {
            if (!teil.p) felder.push({ takt: ti, baustein: bi, teil: tei, soll: zsSilbe(v, stueck.zeichen), wert: '', status: '' });
            v += teil.d;
        }));
    });
    return { stueck, felder, aktiv: 0, fehler: 0, stufe, manuell: !!manuell, start: Date.now(), fertig: false };
}
const zsOffen = (f) => f.status !== 'richtig' && f.status !== 'geloest';
// Naechstes Kaestchen, das noch etwas braucht (leer oder falsch) - ab "ab",
// sonst von vorn.
function zkNaechstes(a, ab) {
    const braucht = (f) => zsOffen(f) && (f.wert === '' || f.status === 'falsch');
    for (let i = ab; i < a.felder.length; i++) if (braucht(a.felder[i])) return i;
    for (let i = 0; i < ab; i++) if (braucht(a.felder[i])) return i;
    return -1;
}
function zkFertigPruefen(a) {
    if (!a.fertig && a.felder.every(f => !zsOffen(f))) {
        a.fertig = true;
        a.dauer = Math.round((Date.now() - a.start) / 1000);
    }
}
const zkRichtige = (a) => a.felder.filter(f => f.status === 'richtig').length;

/* Eine Eingabe ins aktive Kaestchen. Ergebnis:
   { art: 'richtig' | 'falsch' (Stufe 1, nicht eingetragen) | 'gesetzt'
     (Stufe 2/3, noch nicht geprueft) | 'geprueft', falsch, richtig, takt }
   - bei 'geprueft' sagen falsch/richtig, wie viele Kaestchen die Pruefung
   neu als falsch bzw. richtig markiert hat. */
function zkEingeben(a, zeichen) {
    if (!a || a.fertig) return null;
    let f = a.felder[a.aktiv];
    if (!f || !zsOffen(f)) {
        const n = zkNaechstes(a, a.aktiv);
        if (n < 0) return null;
        a.aktiv = n; f = a.felder[n];
    }
    let ergebnis;
    if (a.stufe === 1) {
        if (zeichen !== f.soll) { a.fehler++; return { art: 'falsch', falsch: 1, richtig: 0, takt: f.takt, feld: a.aktiv }; }
        f.wert = zeichen; f.status = 'richtig';
        ergebnis = { art: 'richtig', falsch: 0, richtig: 1, takt: f.takt };
    } else {
        f.wert = zeichen; f.status = '';
        ergebnis = { art: 'gesetzt', falsch: 0, richtig: 0, takt: f.takt };
        if (a.manuell) {
            const n = zkNaechstes(a, a.aktiv + 1);
            if (n >= 0) a.aktiv = n;
            return ergebnis;
        }
        // Pruefeinheit: der Takt (Stufe 2) bzw. die ganze Aufgabe (Stufe 3)
        const einheit = a.felder.filter(g => a.stufe === 3 || g.takt === f.takt);
        if (einheit.every(g => !zsOffen(g) || g.wert !== '' && g.status !== 'falsch')) {
            ergebnis.art = 'geprueft';
            einheit.forEach(g => {
                if (!zsOffen(g)) return;
                if (g.wert === g.soll) { g.status = 'richtig'; ergebnis.richtig++; }
                else { g.status = 'falsch'; ergebnis.falsch++; }
            });
            a.fehler += ergebnis.falsch;
            if (ergebnis.falsch) {
                a.aktiv = a.felder.indexOf(einheit.find(g => g.status === 'falsch'));
                return ergebnis;
            }
        }
    }
    const n = zkNaechstes(a, a.aktiv + 1);
    if (n >= 0) a.aktiv = n;
    zkFertigPruefen(a);
    return ergebnis;
}
/* Knopf "Pruefen" (manuell, Stufe 2/3): prueft jede Einheit - den Takt
   (Stufe 2) bzw. die ganze Aufgabe (Stufe 3) -, in der alle offenen
   Kaestchen gefuellt sind. Gezaehlt werden nur neu eingetragene Werte;
   ein falsch markiertes, nicht ausgebessertes Kaestchen zaehlt nicht noch
   einmal. Ergebnis: { art: 'unvollstaendig' | 'unveraendert' | 'geprueft',
   falsch, richtig } */
function zkPruefen(a) {
    if (!a || a.fertig || a.stufe === 1) return null;
    const einheiten = a.stufe === 3 ? [a.felder]
        : [...new Set(a.felder.map(f => f.takt))].map(t => a.felder.filter(f => f.takt === t));
    const pruefbar = einheiten.filter(e => e.every(g => !zsOffen(g) || g.wert !== ''));
    if (!pruefbar.length) return { art: 'unvollstaendig', falsch: 0, richtig: 0 };
    const ergebnis = { art: 'geprueft', falsch: 0, richtig: 0 };
    pruefbar.forEach(e => e.forEach(g => {
        if (!zsOffen(g) || g.status === 'falsch') return;
        if (g.wert === g.soll) { g.status = 'richtig'; ergebnis.richtig++; }
        else { g.status = 'falsch'; ergebnis.falsch++; }
    }));
    if (!ergebnis.falsch && !ergebnis.richtig) ergebnis.art = 'unveraendert';
    a.fehler += ergebnis.falsch;
    const falsch = a.felder.findIndex(g => g.status === 'falsch');
    if (falsch >= 0) a.aktiv = falsch;
    else { const n = zkNaechstes(a, 0); if (n >= 0) a.aktiv = n; }
    zkFertigPruefen(a);
    return ergebnis;
}
function zkLoeschen(a) {
    if (!a || a.fertig) return;
    let f = a.felder[a.aktiv];
    if (!f || !zsOffen(f) || f.wert === '') {
        // leeres Kaestchen: eins zurueck und das leeren
        for (let i = a.aktiv - 1; i >= 0; i--) if (zsOffen(a.felder[i])) { a.aktiv = i; break; }
        f = a.felder[a.aktiv];
    }
    if (f && zsOffen(f)) { f.wert = ''; f.status = ''; }
}
function zkBewegen(a, schritt) {
    if (!a || a.fertig) return;
    for (let i = a.aktiv + schritt; i >= 0 && i < a.felder.length; i += schritt) {
        if (zsOffen(a.felder[i])) { a.aktiv = i; break; }
    }
}
function zkWaehlen(a, i) {
    if (!a || a.fertig || !a.felder[i] || !zsOffen(a.felder[i])) return false;
    a.aktiv = i;
    return true;
}
/* Rest mit der Loesung fuellen; zaehlt jedes offene Kaestchen als Fehler. */
function zkLoesung(a) {
    if (!a || a.fertig) return 0;
    let offen = 0;
    a.felder.forEach(f => { if (zsOffen(f)) { f.wert = f.soll; f.status = 'geloest'; offen++; } });
    a.fehler += offen;
    zkFertigPruefen(a);
    return offen;
}

/* ---------- Zeichnen ----------
   Notenbild mit Kaestchen ueber jeder Note in host. Breite: so gross,
   dass die Kaestchen auf dem Tablet gut zu treffen sind (Massstab nach dem
   breitesten Takt: der soll die Zeile gerade fuellen, hoechstens aber gut
   doppelt so gross werden wie die normale Anzeige).
   opt: { notenlinien, blitz: {feld, zeichen}, gesperrt, maxSkal } */
function zkZeichnen(host, a, opt) {
    opt = opt || {};
    const verfuegbar = Math.max(280, (host.clientWidth || 800) - 8);
    const probe = document.createElement('div');
    // breite 1 = jeder Takt in eigener Zeile, aber mit denselben (nicht
    // zeitgetreuen) Abstaenden wie gleich - zeitgetreu waere ein Wink mit dem Zaunpfahl
    probe.innerHTML = stueckAnzeigeHtml(a.stueck, { zaehlzeiten: true, notenlinien: opt.notenlinien, breite: 1 });
    const breitester = Math.max(...[...probe.querySelectorAll('svg')].map(s => s.viewBox.baseVal.width));
    const skal = Math.max(0.7, Math.min(opt.maxSkal || 2.2, verfuegbar / breitester));
    host.innerHTML = stueckAnzeigeHtml(a.stueck, {
        zaehlzeiten: true, notenlinien: opt.notenlinien, breite: verfuegbar / skal, skalierung: skal
    });
    const ns = 'http://www.w3.org/2000/svg';
    const blitz = opt.blitz;
    host.querySelectorAll('svg.anzeige-system').forEach(svg => {
        svg.querySelectorAll('.zaehlzeit, .takt-feld').forEach(el => el.remove());
        const vb = svg.viewBox.baseVal;
        const oben = Math.min(vb.y, ZS_FELD_OBEN - 6), plus = vb.y - oben;
        if (plus > 0) {
            svg.setAttribute('viewBox', `${vb.x} ${oben} ${vb.width} ${vb.height + plus}`);
            svg.setAttribute('height', Math.round(vb.height));
            svg.style.height = Math.round(vb.height * skal) + 'px';
        }
        svg.querySelectorAll('.noten-feld').forEach(r => {
            const i = a.felder.findIndex(f => f.takt === Number(r.dataset.takt) && f.baustein === Number(r.dataset.baustein) && f.teil === Number(r.dataset.teil));
            if (i < 0) return;
            r.dataset.feld = i;
            const f = a.felder[i];
            const cx = Number(r.getAttribute('x')) + 12;
            const g = document.createElementNS(ns, 'g');
            const klassen = ['zs-feld'];
            if (f.status) klassen.push(f.status);
            if (i === a.aktiv && !a.fertig && !opt.gesperrt && zsOffen(f)) klassen.push('aktiv');
            if (blitz && blitz.feld === i) klassen.push('blitz');
            g.setAttribute('class', klassen.join(' '));
            g.dataset.feld = i;
            const zeigen = blitz && blitz.feld === i ? blitz.zeichen : f.wert;
            g.innerHTML = `<rect x="${cx - ZS_FELD_B / 2}" y="${ZS_FELD_OBEN}" width="${ZS_FELD_B}" height="${ZS_FELD_H}" rx="4"/>` +
                `<text x="${cx}" y="${ZS_FELD_OBEN + ZS_FELD_H / 2 + 1}" text-anchor="middle" dominant-baseline="middle" font-size="15" font-weight="800" font-family="DM Sans, sans-serif">${zeigen}</text>`;
            svg.appendChild(g);
        });
    });
}

/* Stueck als Kuerzel ("V-AA-Vp-SSSS_H-H", wie im Link) und zurueck -
   fuers Klassenspiel, das die Aufgabe so an die Geraete schickt. */
function zkStueckKuerzel(stueck) {
    return stueck.takte.map(t => t.bausteine.map(b => b.code).join('-')).join('_');
}
function zkStueckAusKuerzel(text, zeichen) {
    const takte = String(text || '').split(/[_|]/).map(t => ({ bausteine: t.split('-').map(c => RHYTHMUS_NACH_CODE[c.trim()]).filter(Boolean) }))
        .filter(t => t.bausteine.length);
    return { zeichen: zeichen || '4/4', takte };
}
function zsZeit(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
