/* ============================================================
   ZAEHL-TRAINING (Reiter "zaehlen"): Zaehlzeiten ueber die Noten
   schreiben. Das Spiel wuerfelt Takte aus den gewaehlten Bausteinen,
   ueber jeder Note (nicht ueber Pausen) steht ein leeres Kaestchen,
   eingetragen wird mit dem Zahlenfeld (Tippen, Maus oder Tastatur).
   Stufen = wann geprueft wird:
     1  sofort - jede falsche Eingabe zaehlt als Fehler, das Kaestchen
        bleibt leer, bis es stimmt
     2  erst, wenn ein Takt ganz ausgefuellt ist
     3  erst, wenn die ganze Aufgabe (alle Takte) ausgefuellt ist
   Falsch markierte Kaestchen (Stufe 2/3) werden ueberschrieben, dann
   wird die Einheit erneut geprueft. Jede falsche Pruefung zaehlt.
   Notenbild = stueckAnzeigeHtml aus noten.js; die Kaestchen sitzen
   genau an der Stelle der Zaehlzeiten (ZAEHL_Y), ersetzen sie also.
   ============================================================ */
const ZS_SCHLUESSEL = 'rw-zaehlen';
// Triolen haben keine deutsche Zaehlsilbe im Sechzehntelraster (siehe
// stueckAnzeigeHtml) - deshalb nicht im Spiel.
const ZS_BAUSTEINE = RHYTHMUS_BAUSTEINE.filter(b => !b.triole);
const ZS_TAKTARTEN = ['2/4', '3/4', '4/4'];
const ZS_STUFEN = {
    1: 'Jede Eingabe wird sofort geprüft – ein Fehler zählt direkt.',
    2: 'Geprüft wird erst, wenn ein Takt ganz ausgefüllt ist.',
    3: 'Geprüft wird erst, wenn die ganze Zeile ausgefüllt ist.'
};
const ZS_FELD_B = 22, ZS_FELD_H = 24, ZS_FELD_OBEN = ZAEHL_Y - 20;

const zs = {
    auswahl: new Set(['V', 'AA', 'H', 'Vp', 'ASS', 'SSA', 'SSSS', 'pA']),
    zeichen: '4/4',
    takte: 2,
    stufe: 1,
    notenlinien: false,
    beste: { 1: 0, 2: 0, 3: 0 }   // laengste Serie fehlerfreier Aufgaben je Stufe
};
let zsAufgabe = null;   // { stueck, felder, aktiv, fehler, start, fertig, stufe }
const zsStand = { nr: 0, richtig: 0, fehler: 0, serie: 0 };
let zsSpielt = false;

function zsLaden() {
    try {
        const d = JSON.parse(localStorage.getItem(ZS_SCHLUESSEL) || 'null');
        if (!d) return;
        if (Array.isArray(d.auswahl)) zs.auswahl = new Set(d.auswahl.filter(c => ZS_BAUSTEINE.some(b => b.code === c)));
        if (ZS_TAKTARTEN.includes(d.zeichen)) zs.zeichen = d.zeichen;
        if (d.takte >= 1 && d.takte <= 4) zs.takte = d.takte;
        if (ZS_STUFEN[d.stufe]) zs.stufe = d.stufe;
        zs.notenlinien = !!d.notenlinien;
        if (d.beste) Object.assign(zs.beste, d.beste);
    } catch (e) { /* egal */ }
}
function zsSpeichern() {
    try {
        localStorage.setItem(ZS_SCHLUESSEL, JSON.stringify({
            auswahl: [...zs.auswahl], zeichen: zs.zeichen, takte: zs.takte,
            stufe: zs.stufe, notenlinien: zs.notenlinien, beste: zs.beste
        }));
    } catch (e) { /* egal */ }
}

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
            const moeglich = erlaubt.filter(b => b.dauer <= rest + 0.001);
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

function zsAufgabeErzeugen() {
    const erlaubt = ZS_BAUSTEINE.filter(b => zs.auswahl.has(b.code));
    if (!erlaubt.length) { zeigeToast('Wähle mindestens einen Baustein aus.', 'danger'); return false; }
    const takte = [];
    let vorher = null;
    for (let t = 0; t < zs.takte; t++) {
        const k = zsTaktWuerfeln(erlaubt, zs.zeichen, vorher);
        if (!k) { zeigeToast('Aus dieser Auswahl geht kein Takt genau auf – nimm noch einen kürzeren Baustein dazu.', 'danger'); return false; }
        takte.push({ bausteine: k.takt });
        vorher = k.kuerzel;
    }
    const felder = [];
    takte.forEach((takt, ti) => {
        let v = 0;
        takt.bausteine.forEach((b, bi) => b.teile.forEach((teil, tei) => {
            if (!teil.p) felder.push({ takt: ti, baustein: bi, teil: tei, soll: zsSilbe(v, zs.zeichen), wert: '', status: '' });
            v += teil.d;
        }));
    });
    zsStoppen();
    zsAufgabe = { stueck: { zeichen: zs.zeichen, takte }, felder, aktiv: 0, fehler: 0, start: Date.now(), fertig: false, stufe: zs.stufe };
    zsStand.nr++;
    zsZeichnen();
    return true;
}

/* ---------- Eingabe ---------- */
const zsOffen = (f) => f.status !== 'richtig' && f.status !== 'geloest';
// Naechstes Kaestchen, das noch etwas braucht (leer oder falsch) - ab "ab",
// sonst von vorn.
function zsNaechstes(ab) {
    const felder = zsAufgabe.felder;
    const braucht = (f) => zsOffen(f) && (f.wert === '' || f.status === 'falsch');
    for (let i = ab; i < felder.length; i++) if (braucht(felder[i])) return i;
    for (let i = 0; i < ab; i++) if (braucht(felder[i])) return i;
    return -1;
}

function zsEingeben(zeichen) {
    const a = zsAufgabe;
    if (!a || a.fertig) return;
    const f = a.felder[a.aktiv];
    if (!f || !zsOffen(f)) { const n = zsNaechstes(a.aktiv); if (n < 0) return; a.aktiv = n; return zsEingeben(zeichen); }
    if (a.stufe === 1) {
        if (zeichen === f.soll) {
            f.wert = zeichen; f.status = 'richtig'; zsStand.richtig++;
        } else {
            a.fehler++; zsStand.fehler++;
            zsZeichnen({ blitz: a.aktiv, falsch: zeichen });
            return;
        }
    } else {
        f.wert = zeichen; f.status = '';
        // Pruefeinheit: der Takt (Stufe 2) bzw. die ganze Aufgabe (Stufe 3)
        const einheit = a.felder.filter(g => a.stufe === 3 || g.takt === f.takt);
        if (einheit.every(g => !zsOffen(g) || g.wert !== '' && g.status !== 'falsch')) {
            let falsch = 0;
            einheit.forEach(g => {
                if (!zsOffen(g)) return;
                if (g.wert === g.soll) { g.status = 'richtig'; zsStand.richtig++; }
                else { g.status = 'falsch'; falsch++; }
            });
            a.fehler += falsch; zsStand.fehler += falsch;
            if (falsch) {
                zeigeToast(`${falsch} ${falsch === 1 ? 'Kästchen stimmt' : 'Kästchen stimmen'} nicht – ${a.stufe === 2 ? 'im Takt ' + (f.takt + 1) : 'in der Zeile'}.`, 'danger');
                a.aktiv = a.felder.indexOf(einheit.find(g => g.status === 'falsch'));
                return zsFertigPruefen();
            }
        }
    }
    const n = zsNaechstes(a.aktiv + 1);
    if (n >= 0) a.aktiv = n;
    zsFertigPruefen();
}

function zsLoeschen() {
    const a = zsAufgabe;
    if (!a || a.fertig) return;
    let f = a.felder[a.aktiv];
    if (!f || !zsOffen(f) || f.wert === '') {
        // leeres Kaestchen: eins zurueck und das leeren
        for (let i = a.aktiv - 1; i >= 0; i--) if (zsOffen(a.felder[i])) { a.aktiv = i; break; }
        f = a.felder[a.aktiv];
    }
    if (f && zsOffen(f)) { f.wert = ''; f.status = ''; }
    zsZeichnen();
}

function zsBewegen(schritt) {
    const a = zsAufgabe;
    if (!a || a.fertig) return;
    for (let i = a.aktiv + schritt; i >= 0 && i < a.felder.length; i += schritt) {
        if (zsOffen(a.felder[i])) { a.aktiv = i; break; }
    }
    zsZeichnen();
}

function zsLoesungZeigen() {
    const a = zsAufgabe;
    if (!a || a.fertig) return;
    let offen = 0;
    a.felder.forEach(f => { if (zsOffen(f)) { f.wert = f.soll; f.status = 'geloest'; offen++; } });
    a.fehler += offen; zsStand.fehler += offen;
    zsFertigPruefen();
}

function zsFertigPruefen() {
    const a = zsAufgabe;
    if (!a.felder.every(f => !zsOffen(f))) { zsZeichnen(); return; }
    a.fertig = true;
    a.dauer = Math.round((Date.now() - a.start) / 1000);
    const geloest = a.felder.some(f => f.status === 'geloest');
    if (a.fehler === 0 && !geloest) {
        zsStand.serie++;
        if (zsStand.serie > (zs.beste[a.stufe] || 0)) { zs.beste[a.stufe] = zsStand.serie; zsSpeichern(); }
    } else zsStand.serie = 0;
    zsZeichnen();
}

/* ---------- Zeichnen ---------- */
function zsZeit(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

function zsZeichnen(blitz) {
    const host = document.getElementById('zs-noten');
    const spiel = document.getElementById('zs-spiel');
    if (!host || !spiel) return;
    spiel.classList.toggle('hidden', !zsAufgabe);
    document.getElementById('zs-start-btn').innerHTML = zsAufgabe
        ? '<i class="fa-solid fa-dice"></i> Neue Aufgabe'
        : '<i class="fa-solid fa-play"></i> Los geht’s';
    if (!zsAufgabe) return;
    const a = zsAufgabe;

    // Breite: so gross, dass die Kaestchen auf dem Tablet gut zu treffen sind
    // (Massstab nach dem breitesten Takt: der soll die Zeile gerade fuellen,
    // hoechstens aber gut doppelt so gross werden wie die normale Anzeige)
    const verfuegbar = Math.max(280, (host.clientWidth || 800) - 8);
    const probe = document.createElement('div');
    // breite 1 = jeder Takt in eigener Zeile, aber mit denselben (nicht
    // zeitgetreuen) Abstaenden wie gleich - zeitgetreu waere ein Wink mit dem Zaunpfahl
    probe.innerHTML = stueckAnzeigeHtml(a.stueck, { zaehlzeiten: true, notenlinien: zs.notenlinien, breite: 1 });
    const breitester = Math.max(...[...probe.querySelectorAll('svg')].map(s => s.viewBox.baseVal.width));
    const skal = Math.max(0.7, Math.min(2.2, verfuegbar / breitester));
    host.innerHTML = stueckAnzeigeHtml(a.stueck, {
        zaehlzeiten: true, notenlinien: zs.notenlinien, breite: verfuegbar / skal, skalierung: skal
    });
    const ns = 'http://www.w3.org/2000/svg';
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
            if (i === a.aktiv && !a.fertig && zsOffen(f)) klassen.push('aktiv');
            if (blitz && blitz.blitz === i) klassen.push('blitz');
            g.setAttribute('class', klassen.join(' '));
            g.dataset.feld = i;
            const zeigen = blitz && blitz.blitz === i ? blitz.falsch : f.wert;
            g.innerHTML = `<rect x="${cx - ZS_FELD_B / 2}" y="${ZS_FELD_OBEN}" width="${ZS_FELD_B}" height="${ZS_FELD_H}" rx="4"/>` +
                `<text x="${cx}" y="${ZS_FELD_OBEN + ZS_FELD_H / 2 + 1}" text-anchor="middle" dominant-baseline="middle" font-size="15" font-weight="800" font-family="DM Sans, sans-serif">${zeigen}</text>`;
            svg.appendChild(g);
        });
    });
    if (blitz) setTimeout(() => { if (zsAufgabe === a) zsZeichnen(); }, 650);

    // Zahlenfeld: nur so viele Zahlen, wie der Takt Schlaege hat
    const pulse = taktPulse(a.stueck.zeichen);
    document.querySelectorAll('#zs-pad [data-zeichen]').forEach(b => {
        const z = b.dataset.zeichen;
        b.classList.toggle('unsichtbar', /^\d$/.test(z) && Number(z) > pulse);
        b.disabled = a.fertig;
    });
    document.querySelectorAll('#zs-pad [data-tat]').forEach(b => { b.disabled = a.fertig; });

    const stufenName = { 1: 'Stufe 1 · sofort', 2: 'Stufe 2 · je Takt', 3: 'Stufe 3 · ganze Zeile' }[a.stufe];
    const versuche = zsStand.richtig + zsStand.fehler;
    const quote = versuche ? Math.round(zsStand.richtig / versuche * 100) + ' %' : '–';
    document.getElementById('zs-stand').innerHTML =
        `<span><b>Aufgabe ${zsStand.nr}</b> · ${stufenName}</span>` +
        `<span>Fehler <b class="${a.fehler ? 'zs-rot' : ''}">${a.fehler}</b></span>` +
        `<span>Treffer gesamt <b>${quote}</b></span>` +
        `<span>Serie <b>${zsStand.serie}</b> <small>(Bestwert ${zs.beste[a.stufe] || 0})</small></span>`;

    const fertig = document.getElementById('zs-fertig');
    fertig.classList.toggle('hidden', !a.fertig);
    document.getElementById('zs-pad').classList.toggle('hidden', a.fertig);
    document.getElementById('zs-loesung-btn').classList.toggle('hidden', a.fertig);
    if (a.fertig) {
        const geloest = a.felder.some(f => f.status === 'geloest');
        document.getElementById('zs-fertig-text').innerHTML = geloest
            ? 'Lösung eingeblendet – schau sie dir an, dann weiter.'
            : a.fehler === 0
                ? `<b>Perfekt!</b> Ohne Fehler in ${zsZeit(a.dauer)}.`
                : `<b>Geschafft</b> – mit ${a.fehler} ${a.fehler === 1 ? 'Fehler' : 'Fehlern'} in ${zsZeit(a.dauer)}.`;
    }
}

/* ---------- Einstellungen ---------- */
function zsEinstellungenZeichnen() {
    document.querySelectorAll('#zs-palette .gen-baustein').forEach(k => k.classList.toggle('an', zs.auswahl.has(k.dataset.code)));
    document.querySelectorAll('[data-zs-zeichen]').forEach(b => b.classList.toggle('an', b.dataset.zsZeichen === zs.zeichen));
    document.querySelectorAll('[data-zs-stufe]').forEach(b => b.classList.toggle('an', Number(b.dataset.zsStufe) === zs.stufe));
    document.getElementById('zs-stufe-text').textContent = ZS_STUFEN[zs.stufe];
    document.getElementById('zs-takte-anzeige').textContent = zs.takte;
    document.getElementById('zs-notenlinien').checked = zs.notenlinien;
}
function zsGeaendert() {
    zsSpeichern();
    zsEinstellungenZeichnen();
}

function zsStoppen() {
    if (zsSpielt && Vorklatschen.istAn()) Vorklatschen.stoppen(true);
    zsSpielt = false;
}

/* Tastatur: nur bei sichtbarem Reiter. Ziffern, e, + (oder u fuer "und"),
   Rueckschritt, Pfeile; Enter = naechste Aufgabe, wenn fertig. */
function zsTaste(e) {
    const reiter = document.getElementById('reiter-zaehlen');
    if (!reiter || reiter.classList.contains('hidden')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'checkbox') return;
    const a = zsAufgabe;
    let fertig = true;
    const k = e.key;
    if (k === 'Enter') { if (!a || a.fertig) zsAufgabeErzeugen(); else fertig = false; }
    else if (!a) fertig = false;
    else if (/^[1-9]$/.test(k) && Number(k) <= taktPulse(a.stueck.zeichen)) { zsEingeben(k); }
    else if (k === 'e' || k === 'E') zsEingeben('e');
    else if (k === '+' || k === 'u' || k === 'U') zsEingeben('+');
    else if (k === 'Backspace' || k === 'Delete') zsLoeschen();
    else if (k === 'ArrowLeft') zsBewegen(-1);
    else if (k === 'ArrowRight') zsBewegen(1);
    else fertig = false;
    if (fertig) e.preventDefault();
}

function zsAufbauen() {
    if (!document.getElementById('reiter-zaehlen')) return;
    zsLaden();
    const palette = document.getElementById('zs-palette');
    ZS_BAUSTEINE.forEach(b => {
        const knopf = document.createElement('button');
        knopf.type = 'button';
        knopf.className = 'gen-baustein';
        knopf.dataset.code = b.code;
        knopf.title = b.wort;
        knopf.innerHTML = bausteinSvg(b);
        knopf.addEventListener('click', () => {
            if (zs.auswahl.has(b.code)) zs.auswahl.delete(b.code); else zs.auswahl.add(b.code);
            zsGeaendert();
        });
        palette.appendChild(knopf);
    });
    document.querySelectorAll('[data-zs-zeichen]').forEach(b => b.addEventListener('click', () => { zs.zeichen = b.dataset.zsZeichen; zsGeaendert(); }));
    document.querySelectorAll('[data-zs-stufe]').forEach(b => b.addEventListener('click', () => { zs.stufe = Number(b.dataset.zsStufe); zsGeaendert(); }));
    document.getElementById('zs-takte-minus').addEventListener('click', () => { zs.takte = Math.max(1, zs.takte - 1); zsGeaendert(); });
    document.getElementById('zs-takte-plus').addEventListener('click', () => { zs.takte = Math.min(4, zs.takte + 1); zsGeaendert(); });
    document.getElementById('zs-notenlinien').addEventListener('change', (e) => { zs.notenlinien = e.target.checked; zsGeaendert(); zsZeichnen(); });
    document.getElementById('zs-start-btn').addEventListener('click', zsAufgabeErzeugen);
    document.getElementById('zs-weiter-btn').addEventListener('click', zsAufgabeErzeugen);
    document.getElementById('zs-loesung-btn').addEventListener('click', zsLoesungZeigen);
    document.getElementById('zs-anhoeren-btn').addEventListener('click', () => {
        if (!zsAufgabe) return;
        if (zsSpielt && Vorklatschen.istAn()) { zsStoppen(); return; }
        zsSpielt = true;
        Vorklatschen.starten(zsAufgabe.stueck, document.getElementById('zs-noten'), false, 0, null, null);
    });
    document.querySelectorAll('#zs-pad [data-zeichen]').forEach(b => b.addEventListener('click', () => zsEingeben(b.dataset.zeichen)));
    document.querySelector('#zs-pad [data-tat="loeschen"]').addEventListener('click', zsLoeschen);
    document.querySelector('#zs-pad [data-tat="links"]').addEventListener('click', () => zsBewegen(-1));
    document.querySelector('#zs-pad [data-tat="rechts"]').addEventListener('click', () => zsBewegen(1));
    // Kaestchen oder Note antippen = dieses Kaestchen bearbeiten
    document.getElementById('zs-noten').addEventListener('click', (e) => {
        const ziel = e.target.closest('[data-feld]');
        if (!ziel || !zsAufgabe || zsAufgabe.fertig) return;
        const i = Number(ziel.dataset.feld);
        if (!zsOffen(zsAufgabe.felder[i])) return;
        zsAufgabe.aktiv = i;
        zsZeichnen();
    });
    document.addEventListener('keydown', zsTaste);
    let warten = null;
    window.addEventListener('resize', () => { clearTimeout(warten); warten = setTimeout(() => zsZeichnen(), 150); });
    zsEinstellungenZeichnen();
    zsZeichnen();
}
document.addEventListener('DOMContentLoaded', zsAufbauen);
