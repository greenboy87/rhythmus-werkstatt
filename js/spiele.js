/* ============================================================
   SPIELE (Reiter "zaehlen", heisst auf der Seite "Spiele"):
   Wahl zwischen Zaehlzeiten (js/zaehlspiel.js) und Rhythmus-Diktat.
   Das Diktat ist die Rhythmus-Runde aus dem Scoreboard (musik-quiz)
   fuer allein: Die Werkstatt spielt einen gewuerfelten Rhythmus vor
   (Vorklatschen, ohne Notenbild), man baut ihn mit dem Eingabefeld
   (rhythmusEditor, Palette nur aus den gewaehlten Bausteinen) nach und
   prueft Takt fuer Takt (rhythmusGleich - im Klatschmodus gilt eine
   Viertel mit folgender Pause wie eine Halbe). Runden zu dk.rundenZahl
   Aufgaben (Start: &runden=N bzw. 5, wie im Zaehl-Training). Gewuerfelt wird mit zkTakteWuerfeln
   (js/zaehlkern.js). Mit der Klasse: klasse.html (Spielart "diktat").
   ?ansicht=diktat zeigt nur das Diktat (Minispiele) und meldet eingebettet
   jede Runde wie das Zaehl-Training: {typ:'rw-runde-start'} und am Ende
   {typ:'rw-runde', spiel:'diktat', takte, pct, detail}. pct: je Aufgabe
   1 beim ersten Versuch, 0,5 spaeter, 0 mit "Loesung zeigen".
   Modi: "Endlos" (dk.runden = false, keine Runden, nichts gemeldet),
   "Automatisch wiederholen" (spielt nach jeder Pause neu vor, bis geloest)
   und "Automodus" (vorspielen dk.anzahl-mal, Loesung zeigen, mit Noten
   nochmal vorspielen, naechste Aufgabe - ganz ohne Zutun; Runden mit
   automatisch gezeigter Loesung werden nicht gemeldet). Pause dk.pause in
   Sekunden, 0 = auto (so lang wie die Aufgabe, mindestens 3 s). Ablauf:
   dkAutoPlanen entscheidet nach jedem Schritt (Vorspielen zu Ende, neue
   Aufgabe, geloest) neu, was als Naechstes kommt.
   ============================================================ */
const SPIEL_SCHLUESSEL = 'rw-spiel';
const DK_SCHLUESSEL = 'rw-diktat';
const SPIELE_TEXT = {
    zaehlen: 'Zählzeiten über die Noten schreiben.',
    diktat: 'Zuhören und den Rhythmus aus Bausteinen nachbauen.'
};
// ueberlang: zu volle Takte rot markieren und beim Pruefen benennen (aus = schwieriger)
const dk = {
    auswahl: ['V', 'AA', 'H', 'Vp', 'ASS', 'SSA', 'SSSS', 'pA'], zeichen: '4/4', takte: 1, klatsch: true, ueberlang: true,
    runden: true, rundenZahl: ZS_RUNDE, wiederholen: false, automodus: false, pause: 0, anzahl: 3
};
const DK_PAUSEN = [0, 2, 3, 5, 8, 10, 15, 20, 30];   // Sekunden, 0 = auto
let dkAutoTimer = null, dkAutoTicker = null, dkAutoAnhalten = false;
let dkAufgabe = null;   // { loesung: stueck, versuche, gehoert, fertig, geloest, eingabe, stimmt }
let dkRunde = null;     // { regeln, nr, ergebnisse: [{erster}], fertig }
let dkEditor = null, dkSpielt = false;

try { Object.assign(dk, JSON.parse(localStorage.getItem(DK_SCHLUESSEL) || '{}')); } catch (e) { /* egal */ }
// Gibt die einbettende Seite &runden=N vor, gilt das beim Laden (Beat Vault: 10)
if (new URLSearchParams(location.search).has('runden')) dk.rundenZahl = ZS_RUNDE;
const DK_RUNDEN_MAX = 50;
const dkSpeichern = () => { try { localStorage.setItem(DK_SCHLUESSEL, JSON.stringify(dk)); } catch (e) { /* egal */ } };

/* ---------- Spiel waehlen ---------- */
function spielZeigen(name) {
    // Die Einbett-Ansichten zeigen fest ein Spiel und aendern die gemerkte Wahl nicht
    const fest = ANSICHT === 'zaehlen' ? 'zaehlen' : ANSICHT === 'diktat' ? 'diktat' : null;
    if (fest) name = fest;
    else if (!SPIELE_TEXT[name]) name = 'zaehlen';
    document.querySelectorAll('[data-spiel]').forEach(b => b.classList.toggle('an', b.dataset.spiel === name));
    document.getElementById('spiel-zaehlen').classList.toggle('hidden', name !== 'zaehlen');
    document.getElementById('spiel-diktat').classList.toggle('hidden', name !== 'diktat');
    document.getElementById('spiele-text').textContent = SPIELE_TEXT[name];
    if (!fest) try { localStorage.setItem(SPIEL_SCHLUESSEL, name); } catch (e) { /* egal */ }
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
    dkRunde = { regeln: { auswahl: dk.auswahl.slice(), zeichen: dk.zeichen, takte: dk.takte, klatsch: dk.klatsch, ueberlang: dk.ueberlang, runden: dk.runden, zahl: dk.rundenZahl }, nr: 0, ergebnisse: [], fertig: false, start: Date.now() };
    if (!dkAufgabeErzeugen()) { dkRunde = vorher; return; }
    if (dk.runden) zsMelden({ typ: 'rw-runde-start' });
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
    dkUeberlangZeigen();
    dkZeichnen();
    return true;
}

function dkHoeren() {
    if (!dkAufgabe) return;
    if (dkSpielt && Vorklatschen.istAn()) {
        // Von Hand gestoppt: die Automatik wartet, bis wieder vorgespielt wird
        dkStoppen();
        if (dk.wiederholen || dk.automodus) { dkAutoAnhalten = true; dkAutoPlanen(); }
        return;
    }
    dkAutoAnhalten = false;
    dkSpielt = true;
    dkAufgabe.gehoert++;
    // Vor dem Loesen ohne Notenbild (nichts zu markieren), danach liest die
    // Markierung in der Loesung mit
    Vorklatschen.starten(dkAufgabe.loesung, document.getElementById('dk-noten'), false, 0, null, null);
    dkStandZeichnen();
    dkAutoPlanen();
}
function dkStoppen() {
    clearTimeout(dkAutoTimer); clearInterval(dkAutoTicker); dkAutoTimer = dkAutoTicker = null;
    if (dkSpielt && Vorklatschen.istAn()) Vorklatschen.stoppen(true);
    dkSpielt = false;
}

/* ---------- Diktat: Automatik ---------- */
function dkSichtbar() {
    const reiter = document.getElementById('reiter-zaehlen'), spiel = document.getElementById('spiel-diktat');
    return reiter && spiel && !reiter.classList.contains('hidden') && !spiel.classList.contains('hidden');
}
function dkPauseSekunden() {
    if (dk.pause) return dk.pause;
    const dauer = rhythmusZeitplan(dkAufgabe.loesung, { bpm: Metronom.bpm(), vorlaufTakte: 0 }).dauer;
    return Math.max(3, Math.round(dauer));
}
function dkAutoZeigen(text) {
    const an = !!dkAufgabe && (dk.wiederholen || dk.automodus);
    document.getElementById('dk-auto').classList.toggle('hidden', !an);
    document.getElementById('dk-auto-text').textContent = text;
    document.getElementById('dk-auto-pause').innerHTML = dkAutoAnhalten
        ? '<i class="fa-solid fa-play"></i> Weiter' : '<i class="fa-solid fa-pause"></i> Anhalten';
}
// Nach sek Sekunden tat ausfuehren, bis dahin rueckwaerts zaehlen ({s} im Text)
function dkAutoNach(sek, text, tat) {
    const ziel = Date.now() + sek * 1000;
    const zeigen = () => dkAutoZeigen(text.replace('{s}', Math.max(1, Math.ceil((ziel - Date.now()) / 1000))));
    zeigen();
    dkAutoTicker = setInterval(zeigen, 250);
    dkAutoTimer = setTimeout(() => { clearInterval(dkAutoTicker); dkAutoTimer = dkAutoTicker = null; tat(); }, sek * 1000);
}
function dkAutoPlanen() {
    clearTimeout(dkAutoTimer); clearInterval(dkAutoTicker); dkAutoTimer = dkAutoTicker = null;
    const a = dkAufgabe;
    if (!a || !(dk.wiederholen || dk.automodus) || !dkSichtbar()) { dkAutoZeigen(''); return; }
    if (dkAutoAnhalten) { dkAutoZeigen('Automatik angehalten.'); return; }
    if (dkSpielt && Vorklatschen.istAn()) { dkAutoZeigen(a.fertig ? 'So klingt es …' : 'Hör gut zu …'); return; }
    const pause = dkPauseSekunden();
    if (!a.fertig) {
        if (a.gehoert === 0) return dkAutoNach(1.5, 'Gleich geht’s los …', dkHoeren);
        if (dk.automodus && a.gehoert >= dk.anzahl) return dkAutoNach(pause, 'Lösung in {s} s', () => dkLoesungZeigen(true));
        const stand = dk.automodus ? `${a.gehoert} von ${dk.anzahl}` : `${a.gehoert}× gehört`;
        return dkAutoNach(pause, `Nochmal in {s} s (${stand})`, dkHoeren);
    }
    if (!dk.automodus) { dkAutoZeigen('Gelöst – mit → geht es weiter.'); return; }
    if (!a.nachgehoert) return dkAutoNach(1.5, 'Gleich nochmal mit Noten …', () => { a.nachgehoert = true; dkHoeren(); });
    dkAutoNach(pause, (dkRunde.fertig ? 'Neue Runde' : 'Nächste Aufgabe') + ' in {s} s', dkWeiter);
}

function dkPruefen() {
    const a = dkAufgabe;
    if (!a || a.fertig) return;
    const eingabe = dkEditor.stueck();
    const soll = taktSoll(a.loesung.zeichen);
    // Ohne Markierung verraet auch das Pruefen nicht, dass ein Takt zu voll ist -
    // er zaehlt dann einfach als falsch. Zu leere Takte meldet es immer.
    const zeigeZuLang = dkRunde.regeln.ueberlang !== false;
    const offen = eingabe.takte.findIndex(t => {
        const d = rhythmusDauer(t.bausteine);
        return d < soll - 0.001 || (zeigeZuLang && d > soll + 0.001);
    });
    const meldung = document.getElementById('dk-meldung');
    if (offen >= 0) {
        const zuViel = rhythmusDauer(eingabe.takte[offen].bausteine) > soll;
        meldung.textContent = `Takt ${offen + 1} ist ${zuViel ? 'zu lang' : 'noch nicht voll'}.`;
        return;
    }
    const stimmt = dkTakteVergleichen(eingabe, a.loesung, dkRunde.regeln.klatsch);
    a.versuche++;
    a.eingabe = eingabe; a.stimmt = stimmt;   // fuer die Anzeige nach dem Loesen
    document.querySelectorAll('#dk-editor .editor-takt').forEach((box, i) => {
        box.classList.toggle('dk-richtig', !!stimmt[i]);
        box.classList.toggle('dk-falsch', !stimmt[i]);
    });
    if (stimmt.every(Boolean)) return dkFertig(false);
    const falsch = stimmt.map((s, i) => s ? null : i + 1).filter(Boolean);
    meldung.textContent = falsch.length === 1 ? `Takt ${falsch[0]} stimmt noch nicht – hör nochmal hin.` : `Takte ${falsch.join(', ')} stimmen noch nicht – hör nochmal hin.`;
    dkStandZeichnen();
}
function dkLoesungZeigen(automatisch) {
    if (!dkAufgabe || dkAufgabe.fertig) return;
    if (automatisch === true) dkRunde.ohneWertung = true;
    // Was gerade im Feld steht, gilt als letzte Eingabe - auch ungeprueft
    const eingabe = dkEditor.stueck();
    if (eingabe.takte.some(t => t.bausteine.length)) {
        dkAufgabe.eingabe = eingabe;
        dkAufgabe.stimmt = dkTakteVergleichen(eingabe, dkAufgabe.loesung, dkRunde.regeln.klatsch);
    }
    dkFertig(true);
}
function dkFertig(geloest) {
    const a = dkAufgabe;
    a.fertig = true; a.geloest = geloest;
    dkRunde.ergebnisse.push({ erster: !geloest && a.versuche === 1, geschafft: !geloest });
    if (dkRunde.regeln.runden && dkRunde.nr >= dkRunde.regeln.zahl) {
        const r = dkRunde, erg = r.ergebnisse;
        r.fertig = true;
        const punkte = erg.reduce((s, e) => s + (e.erster ? 1 : e.geschafft ? 0.5 : 0), 0);
        if (!r.ohneWertung) zsMelden({
            typ: 'rw-runde', spiel: 'diktat', takte: r.regeln.takte, pct: Math.round(punkte / erg.length * 100),
            detail: `${erg.filter(e => e.erster).length}/${erg.length} sofort · ${r.regeln.zeichen} · ${zsZeit(Math.round((Date.now() - r.start) / 1000))}`
        });
    }
    dkZeichnen();
}

/* ---------- Diktat: Zeichnen ---------- */
function dkUeberlangZeigen() {
    // Eine laufende Runde behaelt ihre Regel; ohne Runde gilt der Schalter
    const an = dkRunde ? dkRunde.regeln.ueberlang !== false : dk.ueberlang;
    document.getElementById('dk-editor').classList.toggle('ohne-ueberlang', !an);
}
function dkEinstellungenZeichnen() {
    document.querySelectorAll('#dk-palette-wahl .gen-baustein').forEach(k => k.classList.toggle('an', dk.auswahl.includes(k.dataset.code)));
    document.querySelectorAll('[data-dk-zeichen]').forEach(b => b.classList.toggle('an', b.dataset.dkZeichen === dk.zeichen));
    document.getElementById('dk-takte-anzeige').textContent = dk.takte;
    document.getElementById('dk-klatsch').checked = dk.klatsch;
    document.getElementById('dk-ueberlang').checked = dk.ueberlang;
    document.querySelectorAll('[data-dk-runden]').forEach(b => b.classList.toggle('an', (b.dataset.dkRunden === 'ja') === dk.runden));
    document.getElementById('dk-rundenzahl-anzeige').textContent = dk.rundenZahl;
    document.getElementById('dk-rundenzahl-feld').classList.toggle('hidden', !dk.runden);
    // Automatik steht zweimal da (Einstellungen und unter dem Spiel) - beide gleich
    document.querySelectorAll('[data-dk-modus]').forEach(c => { c.checked = !!dk[c.dataset.dkModus]; });
    document.querySelectorAll('.dk-pause-anzeige').forEach(el => { el.textContent = dk.pause ? dk.pause + ' s' : 'auto'; });
    document.querySelectorAll('.dk-anzahl-anzeige').forEach(el => { el.textContent = dk.anzahl + '×'; });
    document.querySelectorAll('.dk-anzahl-feld').forEach(el => el.classList.toggle('hidden', !dk.automodus));
}
// Automatik-Schalter gelten sofort (nicht erst ab der naechsten Runde)
function dkModusGeaendert() {
    dkSpeichern();
    dkEinstellungenZeichnen();
    dkAutoAnhalten = false;
    dkAutoPlanen();
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
    const runden = dkRunde.regeln.runden;
    document.getElementById('dk-stand').innerHTML =
        `<span><b>Aufgabe ${dkRunde.nr}${runden ? ' von ' + dkRunde.regeln.zahl : ''}</b> · ${dkRunde.regeln.zeichen} · ${dkRunde.regeln.takte} ${dkRunde.regeln.takte === 1 ? 'Takt' : 'Takte'}</span>` +
        `<span>Angehört <b>${a.gehoert}×</b></span>` +
        `<span>Versuche <b class="${a.versuche > 1 ? 'zs-rot' : ''}">${a.versuche}</b></span>` +
        `<span>Beim ersten Mal richtig <b>${erste}${runden ? '' : ' von ' + dkRunde.ergebnisse.length}</b></span>`;
}
function dkZeichnen() {
    const spiel = document.getElementById('dk-spiel');
    if (!spiel) return;
    spiel.classList.toggle('hidden', !dkAufgabe);
    document.getElementById('dk-start-btn').innerHTML = dkAufgabe
        ? '<i class="fa-solid fa-rotate-right"></i> ' + (dk.runden ? 'Neue Runde' : 'Neu starten')
        : '<i class="fa-solid fa-play"></i> Los geht’s';
    if (!dkAufgabe) { dkAutoZeigen(''); return; }
    const a = dkAufgabe;
    dkStandZeichnen();
    const noten = document.getElementById('dk-noten');
    noten.classList.toggle('hidden', !a.fertig);
    // Erst nach dem Loesen steht der Rhythmus als Noten da - vorher waere das die Antwort
    if (a.fertig) {
        const breite = Math.max(280, (noten.clientWidth || spiel.clientWidth) - 40);
        const mitEigen = a.eingabe && a.eingabe.takte.some(t => t.bausteine.length);
        noten.innerHTML = (mitEigen ? '<div class="dk-eingabe-titel">Lösung</div>' : '') +
            stueckAnzeigeHtml(a.loesung, { zaehlzeiten: true, breite: breite / 1.6, skalierung: 1.6 });
    }
    else noten.innerHTML = '';
    // Darunter die eigene (zuletzt gepruefte) Eingabe, Takt fuer Takt bewertet
    const eigen = document.getElementById('dk-eingabe');
    const zeigeEigen = a.fertig && a.eingabe && a.eingabe.takte.some(t => t.bausteine.length);
    eigen.classList.toggle('hidden', !zeigeEigen);
    if (zeigeEigen) {
        const falsch = a.stimmt.map((s, i) => s ? null : i + 1).filter(Boolean);
        document.getElementById('dk-eingabe-titel').innerHTML = 'Deine Eingabe' + (a.eingabe.takte.length > 1
            ? ' · ' + a.stimmt.map((s, i) => `Takt ${i + 1} ${s ? '<b>✓</b>' : '<span class="zs-rot">✗</span>'}`).join(' · ')
            : (falsch.length ? ' · <span class="zs-rot">✗</span>' : ' · <b>✓</b>'));
        const breite = Math.max(280, (noten.clientWidth || spiel.clientWidth) - 40);
        const takte = a.eingabe.takte.filter(t => t.bausteine.length);
        document.getElementById('dk-eingabe-noten').innerHTML =
            stueckAnzeigeHtml({ zeichen: a.eingabe.zeichen, takte }, { zaehlzeiten: true, breite: breite / 1.6, skalierung: 1.6 });
    } else document.getElementById('dk-eingabe-noten').innerHTML = '';
    ['dk-editor', 'dk-palette', 'dk-knoepfe'].forEach(id => document.getElementById(id).classList.toggle('hidden', a.fertig));
    document.getElementById('dk-fertig').classList.toggle('hidden', !a.fertig);
    if (a.fertig) {
        const r = dkRunde;
        let text = a.geloest ? 'So klang es – schau es dir an und hör nochmal hin.'
            : a.versuche === 1 ? '<b>Perfekt!</b> Beim ersten Versuch richtig.' : `<b>Geschafft</b> – im ${a.versuche}. Versuch.`;
        if (r.fertig) {
            const erste = r.ergebnisse.filter(e => e.erster).length;
            text += `<br><span class="zs-runde"><b>Runde geschafft: ${erste} von ${r.regeln.zahl}</b> beim ersten Versuch richtig</span>`;
        }
        document.getElementById('dk-fertig-text').innerHTML = text;
        document.getElementById('dk-weiter-btn').innerHTML = r.fertig
            ? '<i class="fa-solid fa-rotate-right"></i> Neue Runde'
            : '<i class="fa-solid fa-arrow-right"></i> Nächste Aufgabe';
    }
    dkAutoPlanen();
}

/* Tastatur im Diktat: Leertaste = anhoeren/stoppen, Enter = pruefen bzw.
   weiter, Pfeil rechts = naechste Aufgabe (ungeloest nur endlos oder im
   Automodus - sonst zaehlt die Runde nicht sauber), Rueckschritt = letzten
   Baustein weg */
function dkTaste(e) {
    const reiter = document.getElementById('reiter-zaehlen');
    if (!reiter || reiter.classList.contains('hidden') || document.getElementById('spiel-diktat').classList.contains('hidden')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'checkbox') return;
    if (!dkAufgabe) return;
    let fertig = true;
    if (e.key === ' ') { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); dkHoeren(); }
    else if (e.key === 'Enter') { if (dkAufgabe.fertig) dkWeiter(); else dkPruefen(); }
    else if (e.key === 'ArrowRight') {
        if (dkAufgabe.fertig || !dkRunde.regeln.runden || dk.automodus) dkWeiter();
        else zeigeToast('Erst prüfen oder „Lösung zeigen“ – dann geht es mit → weiter.', 'info');
    }
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
    document.getElementById('dk-ueberlang').addEventListener('change', e => { dk.ueberlang = e.target.checked; dkGeaendert(); dkUeberlangZeigen(); });
    document.querySelectorAll('[data-dk-runden]').forEach(b => b.addEventListener('click', () => { dk.runden = b.dataset.dkRunden === 'ja'; dkGeaendert(); dkZeichnen(); }));
    // Gilt sofort, auch fuer die laufende Runde (aber nie kuerzer als schon gespielt)
    const rundenzahl = (r) => {
        dk.rundenZahl = Math.max(1, Math.min(DK_RUNDEN_MAX, dk.rundenZahl + r));
        if (dkRunde && !dkRunde.fertig && dkRunde.regeln.runden) dkRunde.regeln.zahl = Math.max(dkRunde.nr, dk.rundenZahl);
        dkSpeichern(); dkEinstellungenZeichnen(); dkStandZeichnen();
    };
    gedrueckthalten(document.getElementById('dk-rundenzahl-minus'), () => rundenzahl(-1));
    gedrueckthalten(document.getElementById('dk-rundenzahl-plus'), () => rundenzahl(1));
    document.querySelectorAll('[data-dk-modus]').forEach(c => c.addEventListener('change', () => { dk[c.dataset.dkModus] = c.checked; dkModusGeaendert(); }));
    document.querySelectorAll('[data-dk-pause]').forEach(k => k.addEventListener('click', () => {
        const i = Math.max(0, DK_PAUSEN.indexOf(dk.pause));
        dk.pause = DK_PAUSEN[Math.max(0, Math.min(DK_PAUSEN.length - 1, i + Number(k.dataset.dkPause)))];
        dkModusGeaendert();
    }));
    document.querySelectorAll('[data-dk-anzahl]').forEach(k => k.addEventListener('click', () => {
        dk.anzahl = Math.max(1, Math.min(10, dk.anzahl + Number(k.dataset.dkAnzahl)));
        dkModusGeaendert();
    }));
    document.getElementById('dk-auto-pause').addEventListener('click', () => {
        dkAutoAnhalten = !dkAutoAnhalten;
        if (dkAutoAnhalten) dkStoppen();
        dkAutoPlanen();
    });
    // Vorspielen zu Ende: die Automatik plant den naechsten Schritt
    Vorklatschen.aufZustandAendern((laeuft) => {
        if (!laeuft) setTimeout(() => { if (dkSpielt && !Vorklatschen.istAn()) { dkSpielt = false; dkAutoPlanen(); } }, 0);
    });
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
