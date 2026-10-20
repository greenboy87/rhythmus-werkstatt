/* ============================================================
   SPIELE (Reiter "zaehlen", heisst auf der Seite "Spiele"):
   Wahl zwischen Zaehlzeiten (js/zaehlspiel.js) und Rhythmus-Diktat.
   Das Diktat ist die Rhythmus-Runde aus dem Scoreboard (musik-quiz)
   fuer allein: Die Werkstatt spielt einen gewuerfelten Rhythmus vor
   (Vorklatschen, ohne Notenbild), man baut ihn mit dem Eingabefeld
   (rhythmusEditor, Palette nur aus den gewaehlten Bausteinen) nach und
   prueft Takt fuer Takt (rhythmusGleich - im Klatschmodus gilt eine
   Viertel mit folgender Pause wie eine Halbe). Runden zu ZS_RUNDE
   Aufgaben wie im Zaehl-Training. Gewuerfelt wird mit zkTakteWuerfeln
   (js/zaehlkern.js). Mit der Klasse: klasse.html (Spielart "diktat").
   ============================================================ */
const SPIEL_SCHLUESSEL = 'rw-spiel';
const DK_SCHLUESSEL = 'rw-diktat';
const SPIELE_TEXT = {
    zaehlen: 'Zählzeiten über die Noten schreiben.',
    diktat: 'Zuhören und den Rhythmus aus Bausteinen nachbauen.'
};
const dk = { auswahl: ['V', 'AA', 'H', 'Vp', 'ASS', 'SSA', 'SSSS', 'pA'], zeichen: '4/4', takte: 1, klatsch: true };
let dkAufgabe = null;   // { loesung: stueck, versuche, gehoert, fertig, geloest }
let dkRunde = null;     // { regeln, nr, ergebnisse: [{erster}], fertig }
let dkEditor = null, dkSpielt = false;

try { Object.assign(dk, JSON.parse(localStorage.getItem(DK_SCHLUESSEL) || '{}')); } catch (e) { /* egal */ }
const dkSpeichern = () => { try { localStorage.setItem(DK_SCHLUESSEL, JSON.stringify(dk)); } catch (e) { /* egal */ } };

/* ---------- Spiel waehlen ---------- */
function spielZeigen(name) {
    if (!SPIELE_TEXT[name] || ANSICHT === 'zaehlen') name = 'zaehlen';
    document.querySelectorAll('[data-spiel]').forEach(b => b.classList.toggle('an', b.dataset.spiel === name));
    document.getElementById('spiel-zaehlen').classList.toggle('hidden', name !== 'zaehlen');
    document.getElementById('spiel-diktat').classList.toggle('hidden', name !== 'diktat');
    document.getElementById('spiele-text').textContent = SPIELE_TEXT[name];
    try { localStorage.setItem(SPIEL_SCHLUESSEL, name); } catch (e) { /* egal */ }
    if (name !== 'diktat') dkStoppen();
    if (name !== 'zaehlen') zsStoppen();
    if (name === 'zaehlen') zsZeichnen(); else dkZeichnen();
}

/* ---------- Diktat: Vergleich ----------
   Je Takt: stimmt der eingegebene Takt mit dem vorgespielten ueberein?
   Akzente spielen keine Rolle (nur die Kuerzel zaehlen). */
function dkTakteVergleichen(eingabe, loesung, klatsch) {
    return loesung.takte.map((t, i) => {
        const e = eingabe.takte[i];
        if (!e) return false;
        return rhythmusGleich(e.bausteine.map(b => b.code).join('-'), t.bausteine.map(b => b.code).join('-'), klatsch);
    });
}

/* ---------- Diktat: Ablauf ---------- */
function dkRundeStarten() {
    if (!dk.auswahl.some(c => ZS_BAUSTEINE.some(b => b.code === c))) { zeigeToast('Wähle mindestens einen Baustein aus.', 'danger'); return; }
    const vorher = dkRunde;
    dkRunde = { regeln: { auswahl: dk.auswahl.slice(), zeichen: dk.zeichen, takte: dk.takte, klatsch: dk.klatsch }, nr: 0, ergebnisse: [], fertig: false };
    if (!dkAufgabeErzeugen()) dkRunde = vorher;
}
function dkWeiter() {
    if (!dkRunde || dkRunde.fertig) dkRundeStarten();
    else dkAufgabeErzeugen();
}
function dkAufgabeErzeugen() {
    const r = dkRunde.regeln;
    const w = zkTakteWuerfeln(r.auswahl, r.zeichen, r.takte);
    if (w.fehler) { zeigeToast(w.fehler, 'danger'); return false; }
    dkStoppen();
    dkAufgabe = { loesung: { zeichen: r.zeichen, takte: w.takte }, versuche: 0, gehoert: 0, fertig: false, geloest: false };
    dkRunde.nr++;
    // Eingabefeld neu: Palette nur aus den erlaubten Bausteinen, so viele leere Takte wie vorgespielt
    dkEditor = rhythmusEditor(document.getElementById('dk-editor'), document.getElementById('dk-palette'), r.zeichen, r.auswahl);
    dkEditor.setzen(r.zeichen, w.takte.map(() => ({ bausteine: [] })));
    dkEditor.aufAenderung(() => { document.getElementById('dk-meldung').textContent = ''; });
    dkZeichnen();
    return true;
}

function dkHoeren() {
    if (!dkAufgabe) return;
    if (dkSpielt && Vorklatschen.istAn()) { dkStoppen(); return; }
    dkSpielt = true;
    dkAufgabe.gehoert++;
    // Host ohne Notenbild - die Mitlese-Markierung hat dort nichts zu markieren
    Vorklatschen.starten(dkAufgabe.loesung, document.getElementById('dk-noten'), false, 0, null, null);
    dkStandZeichnen();
}
function dkStoppen() {
    if (dkSpielt && Vorklatschen.istAn()) Vorklatschen.stoppen(true);
    dkSpielt = false;
}

function dkPruefen() {
    const a = dkAufgabe;
    if (!a || a.fertig) return;
    const eingabe = dkEditor.stueck();
    const soll = taktSoll(a.loesung.zeichen);
    const offen = eingabe.takte.findIndex(t => Math.abs(rhythmusDauer(t.bausteine) - soll) > 0.001);
    const meldung = document.getElementById('dk-meldung');
    if (offen >= 0) {
        const zuViel = rhythmusDauer(eingabe.takte[offen].bausteine) > soll;
        meldung.textContent = `Takt ${offen + 1} ist ${zuViel ? 'zu lang' : 'noch nicht voll'}.`;
        return;
    }
    const stimmt = dkTakteVergleichen(eingabe, a.loesung, dkRunde.regeln.klatsch);
    a.versuche++;
    document.querySelectorAll('#dk-editor .editor-takt').forEach((box, i) => {
        box.classList.toggle('dk-richtig', !!stimmt[i]);
        box.classList.toggle('dk-falsch', !stimmt[i]);
    });
    if (stimmt.every(Boolean)) return dkFertig(false);
    const falsch = stimmt.map((s, i) => s ? null : i + 1).filter(Boolean);
    meldung.textContent = falsch.length === 1 ? `Takt ${falsch[0]} stimmt noch nicht – hör nochmal hin.` : `Takte ${falsch.join(', ')} stimmen noch nicht – hör nochmal hin.`;
    dkStandZeichnen();
}
function dkLoesungZeigen() {
    if (!dkAufgabe || dkAufgabe.fertig) return;
    dkFertig(true);
}
function dkFertig(geloest) {
    const a = dkAufgabe;
    a.fertig = true; a.geloest = geloest;
    dkRunde.ergebnisse.push({ erster: !geloest && a.versuche === 1 });
    if (dkRunde.nr >= ZS_RUNDE) dkRunde.fertig = true;
    dkZeichnen();
}

/* ---------- Diktat: Zeichnen ---------- */
function dkEinstellungenZeichnen() {
    document.querySelectorAll('#dk-palette-wahl .gen-baustein').forEach(k => k.classList.toggle('an', dk.auswahl.includes(k.dataset.code)));
    document.querySelectorAll('[data-dk-zeichen]').forEach(b => b.classList.toggle('an', b.dataset.dkZeichen === dk.zeichen));
    document.getElementById('dk-takte-anzeige').textContent = dk.takte;
    document.getElementById('dk-klatsch').checked = dk.klatsch;
}
function dkGeaendert() {
    if (dkRunde && !dkRunde.fertig) zeigeToast('Gilt ab der nächsten Runde – „Neue Runde“ startet sie sofort.', 'info');
    dkSpeichern();
    dkEinstellungenZeichnen();
}
function dkStandZeichnen() {
    const a = dkAufgabe;
    if (!a) return;
    const erste = dkRunde.ergebnisse.filter(e => e.erster).length;
    document.getElementById('dk-stand').innerHTML =
        `<span><b>Aufgabe ${dkRunde.nr} von ${ZS_RUNDE}</b> · ${dkRunde.regeln.zeichen} · ${dkRunde.regeln.takte} ${dkRunde.regeln.takte === 1 ? 'Takt' : 'Takte'}</span>` +
        `<span>Angehört <b>${a.gehoert}×</b></span>` +
        `<span>Versuche <b class="${a.versuche > 1 ? 'zs-rot' : ''}">${a.versuche}</b></span>` +
        `<span>Beim ersten Mal richtig <b>${erste}</b></span>`;
}
function dkZeichnen() {
    const spiel = document.getElementById('dk-spiel');
    if (!spiel) return;
    spiel.classList.toggle('hidden', !dkAufgabe);
    document.getElementById('dk-start-btn').innerHTML = dkAufgabe
        ? '<i class="fa-solid fa-rotate-right"></i> Neue Runde'
        : '<i class="fa-solid fa-play"></i> Los geht’s';
    if (!dkAufgabe) return;
    const a = dkAufgabe;
    dkStandZeichnen();
    const noten = document.getElementById('dk-noten');
    noten.classList.toggle('hidden', !a.fertig);
    // Erst nach dem Loesen steht der Rhythmus als Noten da - vorher waere das die Antwort
    if (a.fertig) {
        const breite = Math.max(280, (noten.clientWidth || spiel.clientWidth) - 40);
        noten.innerHTML = stueckAnzeigeHtml(a.loesung, { zaehlzeiten: true, breite: breite / 1.6, skalierung: 1.6 });
    }
    else noten.innerHTML = '';
    ['dk-editor', 'dk-palette', 'dk-knoepfe'].forEach(id => document.getElementById(id).classList.toggle('hidden', a.fertig));
    document.getElementById('dk-fertig').classList.toggle('hidden', !a.fertig);
    if (a.fertig) {
        const r = dkRunde;
        let text = a.geloest ? 'So klang es – schau es dir an und hör nochmal hin.'
            : a.versuche === 1 ? '<b>Perfekt!</b> Beim ersten Versuch richtig.' : `<b>Geschafft</b> – im ${a.versuche}. Versuch.`;
        if (r.fertig) {
            const erste = r.ergebnisse.filter(e => e.erster).length;
            text += `<br><span class="zs-runde"><b>Runde geschafft: ${erste} von ${ZS_RUNDE}</b> beim ersten Versuch richtig</span>`;
        }
        document.getElementById('dk-fertig-text').innerHTML = text;
        document.getElementById('dk-weiter-btn').innerHTML = r.fertig
            ? '<i class="fa-solid fa-rotate-right"></i> Neue Runde'
            : '<i class="fa-solid fa-arrow-right"></i> Nächste Aufgabe';
    }
}

/* Tastatur im Diktat: Leertaste = anhoeren, Enter = pruefen bzw. weiter,
   Rueckschritt = letzten Baustein weg */
function dkTaste(e) {
    const reiter = document.getElementById('reiter-zaehlen');
    if (!reiter || reiter.classList.contains('hidden') || document.getElementById('spiel-diktat').classList.contains('hidden')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'checkbox') return;
    if (!dkAufgabe) return;
    let fertig = true;
    if (e.key === ' ') { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); dkHoeren(); }
    else if (e.key === 'Enter') { if (dkAufgabe.fertig) dkWeiter(); else dkPruefen(); }
    else if (e.key === 'Backspace' && !dkAufgabe.fertig) dkEditor.zurueck();
    else fertig = false;
    if (fertig) e.preventDefault();
}

function spieleAufbauen() {
    if (!document.getElementById('spiel-diktat')) return;
    const wahl = document.getElementById('dk-palette-wahl');
    ZS_BAUSTEINE.forEach(b => {
        const k = document.createElement('button');
        k.type = 'button'; k.className = 'gen-baustein'; k.dataset.code = b.code; k.title = b.wort;
        k.innerHTML = bausteinSvg(b);
        k.addEventListener('click', () => {
            dk.auswahl = dk.auswahl.includes(b.code) ? dk.auswahl.filter(c => c !== b.code) : [...dk.auswahl, b.code];
            dkGeaendert();
        });
        wahl.appendChild(k);
    });
    document.querySelectorAll('[data-dk-zeichen]').forEach(b => b.addEventListener('click', () => { dk.zeichen = b.dataset.dkZeichen; dkGeaendert(); }));
    document.getElementById('dk-takte-minus').addEventListener('click', () => { dk.takte = Math.max(1, dk.takte - 1); dkGeaendert(); });
    document.getElementById('dk-takte-plus').addEventListener('click', () => { dk.takte = Math.min(4, dk.takte + 1); dkGeaendert(); });
    document.getElementById('dk-klatsch').addEventListener('change', e => { dk.klatsch = e.target.checked; dkGeaendert(); });
    document.getElementById('dk-start-btn').addEventListener('click', dkRundeStarten);
    document.getElementById('dk-weiter-btn').addEventListener('click', dkWeiter);
    document.getElementById('dk-hoeren-btn').addEventListener('click', dkHoeren);
    document.getElementById('dk-pruefen-btn').addEventListener('click', dkPruefen);
    document.getElementById('dk-loesung-btn').addEventListener('click', dkLoesungZeigen);
    document.getElementById('dk-zurueck-btn').addEventListener('click', () => dkEditor && dkEditor.zurueck());
    document.getElementById('dk-leeren-btn').addEventListener('click', () => dkEditor && dkEditor.leeren());
    // Tempo und Vorlauf: dieselben Regler wie in der Rhythmus-Werkstatt (geteilter Stand)
    Metronom.bauen(document.getElementById('dk-metronom'));
    document.querySelectorAll('[data-spiel]').forEach(b => b.addEventListener('click', () => spielZeigen(b.dataset.spiel)));
    document.addEventListener('keydown', dkTaste);
    dkEinstellungenZeichnen();
    let start = 'zaehlen';
    try { start = localStorage.getItem(SPIEL_SCHLUESSEL) || 'zaehlen'; } catch (e) { /* egal */ }
    spielZeigen(start);
}
document.addEventListener('DOMContentLoaded', spieleAufbauen);
