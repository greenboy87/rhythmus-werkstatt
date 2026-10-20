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
   Gespielt wird in Runden zu ZS_RUNDE Aufgaben; die Regeln (Bausteine,
   Taktart, Takte, Stufe) gelten fest fuer die ganze Runde. Rundenergebnis
   = richtige Kaestchen / (richtige + Fehler). Eingebettet (Minispiele)
   geht es per postMessage an die Seite ({typ:'rw-runde', stufe, pct,
   detail}), die daraus den Bestenlisten-Eintrag macht.
   Wuerfeln, Pruefen und Zeichnen kommen aus js/zaehlkern.js (gemeinsam
   mit dem Klassenspiel); hier nur Seite, Runden, Statistik.
   ============================================================ */
const ZS_SCHLUESSEL = 'rw-zaehlen';
const ZS_STUFEN = {
    1: 'Jede Eingabe wird sofort geprüft – ein Fehler zählt direkt.',
    2: 'Geprüft wird erst, wenn ein Takt ganz ausgefüllt ist.',
    3: 'Geprüft wird erst, wenn die ganze Zeile ausgefüllt ist.'
};
const ZS_RUNDE = 5;   // Aufgaben je Runde

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
let zsRunde = null;     // { regeln: {auswahl, zeichen, takte, stufe}, nr, ergebnisse: [{richtig, fehler}], start, fertig, pct, dauer }

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

/* Eingebettet (Minispiele-Seite): der Seite Bescheid geben */
function zsMelden(nachricht) {
    if (EINGEBETTET) window.parent.postMessage(nachricht, '*');
}

function zsRundeStarten() {
    if (!ZS_BAUSTEINE.some(b => zs.auswahl.has(b.code))) { zeigeToast('Wähle mindestens einen Baustein aus.', 'danger'); return; }
    const vorher = zsRunde;
    zsRunde = {
        regeln: { auswahl: [...zs.auswahl], zeichen: zs.zeichen, takte: zs.takte, stufe: zs.stufe },
        nr: 0, ergebnisse: [], start: Date.now(), fertig: false
    };
    if (!zsAufgabeErzeugen()) { zsRunde = vorher; return; }
    zsMelden({ typ: 'rw-runde-start' });
}
// "Weiter"/Enter: naechste Aufgabe der Runde, nach der letzten eine neue Runde
function zsWeiter() {
    if (!zsRunde || zsRunde.fertig) zsRundeStarten();
    else zsAufgabeErzeugen();
}

function zsAufgabeErzeugen() {
    const regeln = zsRunde.regeln;
    const w = zkTakteWuerfeln(regeln.auswahl, regeln.zeichen, regeln.takte);
    if (w.fehler) { zeigeToast(w.fehler, 'danger'); return false; }
    zsStoppen();
    zsAufgabe = zkAufgabe({ zeichen: regeln.zeichen, takte: w.takte }, regeln.stufe);
    zsStand.nr++;
    zsRunde.nr++;
    zsZeichnen();
    return true;
}

/* ---------- Eingabe (Regeln im Kern, hier Statistik und Anzeige) ---------- */
function zsEingeben(zeichen) {
    const a = zsAufgabe;
    const e = zkEingeben(a, zeichen);
    if (!e) return;
    zsStand.richtig += e.richtig; zsStand.fehler += e.falsch;
    if (e.art === 'falsch') { zsZeichnen({ feld: e.feld, zeichen }); return; }
    if (e.art === 'geprueft' && e.falsch) {
        zeigeToast(`${e.falsch} ${e.falsch === 1 ? 'Kästchen stimmt' : 'Kästchen stimmen'} nicht – ${a.stufe === 2 ? 'im Takt ' + (e.takt + 1) : 'in der Zeile'}.`, 'danger');
    }
    zsFertigPruefen();
}
function zsLoeschen() { zkLoeschen(zsAufgabe); zsZeichnen(); }
function zsBewegen(schritt) { zkBewegen(zsAufgabe, schritt); zsZeichnen(); }
function zsLoesungZeigen() {
    const offen = zkLoesung(zsAufgabe);
    zsStand.fehler += offen;
    zsFertigPruefen();
}

function zsFertigPruefen() {
    const a = zsAufgabe;
    if (!a.fertig || a.gezaehlt) { zsZeichnen(); return; }
    a.gezaehlt = true;
    const geloest = a.felder.some(f => f.status === 'geloest');
    if (a.fehler === 0 && !geloest) {
        zsStand.serie++;
        if (zsStand.serie > (zs.beste[a.stufe] || 0)) { zs.beste[a.stufe] = zsStand.serie; zsSpeichern(); }
    } else zsStand.serie = 0;
    const r = zsRunde;
    r.ergebnisse.push({ richtig: zkRichtige(a), fehler: a.fehler });
    if (r.nr >= ZS_RUNDE) {
        r.fertig = true;
        r.dauer = Math.round((Date.now() - r.start) / 1000);
        const richtig = r.ergebnisse.reduce((s, e) => s + e.richtig, 0);
        r.fehler = r.ergebnisse.reduce((s, e) => s + e.fehler, 0);
        r.pct = richtig + r.fehler ? Math.round(richtig / (richtig + r.fehler) * 100) : 0;
        zsMelden({
            typ: 'rw-runde', stufe: r.regeln.stufe, pct: r.pct,
            detail: `${r.fehler} Fehler · ${r.regeln.zeichen} · ${zsZeit(r.dauer)}`
        });
    }
    zsZeichnen();
}

/* ---------- Zeichnen ---------- */

function zsZeichnen(blitz) {
    const host = document.getElementById('zs-noten');
    const spiel = document.getElementById('zs-spiel');
    if (!host || !spiel) return;
    spiel.classList.toggle('hidden', !zsAufgabe);
    document.getElementById('zs-start-btn').innerHTML = zsAufgabe
        ? '<i class="fa-solid fa-rotate-right"></i> Neue Runde'
        : '<i class="fa-solid fa-play"></i> Los geht’s';
    if (!zsAufgabe) return;
    const a = zsAufgabe;

    zkZeichnen(host, a, { notenlinien: zs.notenlinien, blitz });
    if (blitz) setTimeout(() => { if (zsAufgabe === a) zsZeichnen(); }, 650);

    // Zahlenfeld: nur so viele Zahlen, wie der Takt Schlaege hat
    const pulse = taktPulse(a.stueck.zeichen);
    document.querySelectorAll('#zs-pad [data-zeichen]').forEach(b => {
        const z = b.dataset.zeichen;
        b.classList.toggle('unsichtbar', /^\d$/.test(z) && Number(z) > pulse);
        b.disabled = a.fertig;
    });
    document.querySelectorAll('#zs-pad [data-tat]').forEach(b => { b.disabled = a.fertig; });

    const stufenName = ZS_STUFEN_KURZ[a.stufe];
    const versuche = zsStand.richtig + zsStand.fehler;
    const quote = versuche ? Math.round(zsStand.richtig / versuche * 100) + ' %' : '–';
    document.getElementById('zs-stand').innerHTML =
        `<span><b>Aufgabe ${zsRunde.nr} von ${ZS_RUNDE}</b> · ${stufenName}</span>` +
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
        const r = zsRunde;
        if (r.fertig) {
            document.getElementById('zs-fertig-text').innerHTML +=
                `<br><span class="zs-runde"><b>Runde geschafft: ${r.pct} %</b> richtig · ${r.fehler} Fehler · ${zsZeit(r.dauer)}</span>`;
        }
        document.getElementById('zs-weiter-btn').innerHTML = r.fertig
            ? '<i class="fa-solid fa-rotate-right"></i> Neue Runde'
            : '<i class="fa-solid fa-arrow-right"></i> Nächste Aufgabe';
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
function zsGeaendert(nurAnzeige) {
    // Die Regeln einer laufenden Runde bleiben fest - sonst waere das Ergebnis
    // nicht vergleichbar (Bestenliste)
    if (!nurAnzeige && zsRunde && !zsRunde.fertig) zeigeToast('Gilt ab der nächsten Runde – „Neue Runde“ startet sie sofort.', 'info');
    zsSpeichern();
    zsEinstellungenZeichnen();
}

function zsStoppen() {
    if (zsSpielt && Vorklatschen.istAn()) Vorklatschen.stoppen(true);
    zsSpielt = false;
}

/* Tastatur: nur bei sichtbarem Reiter. Ziffern, e, + (oder u fuer "und"),
   Rueckschritt, Pfeile; Enter = naechste Aufgabe bzw. neue Runde, wenn fertig. */
function zsTaste(e) {
    const reiter = document.getElementById('reiter-zaehlen');
    if (!reiter || reiter.classList.contains('hidden')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'checkbox') return;
    const a = zsAufgabe;
    let fertig = true;
    const k = e.key;
    if (k === 'Enter') { if (!a || a.fertig) zsWeiter(); else fertig = false; }
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
    document.getElementById('zs-notenlinien').addEventListener('change', (e) => { zs.notenlinien = e.target.checked; zsGeaendert(true); zsZeichnen(); });
    document.getElementById('zs-start-btn').addEventListener('click', zsRundeStarten);
    document.getElementById('zs-weiter-btn').addEventListener('click', zsWeiter);
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
        if (zkWaehlen(zsAufgabe, Number(ziel.dataset.feld))) zsZeichnen();
    });
    document.addEventListener('keydown', zsTaste);
    let warten = null;
    window.addEventListener('resize', () => { clearTimeout(warten); warten = setTimeout(() => zsZeichnen(), 150); });
    zsEinstellungenZeichnen();
    zsZeichnen();
}
document.addEventListener('DOMContentLoaded', zsAufbauen);
