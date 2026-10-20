/* ============================================================
   KLASSENSPIEL (klasse.html): Zaehlzeiten-Spiel fuer die ganze Klasse.
   Ohne Parameter = Lehrkraft (Einstellungen, Raum, Beamer),
   ?raum=CODE = Schueler (kommt vom QR-Code).
   Live-Daten im Firebase-Projekt greenboys-scoreboard unter
   rooms/zz-<CODE> - die Regeln geben rooms/$code schon frei, das
   Scoreboard selbst benutzt dort nur Klassennamen (ohne "zz-").
     lehrer            nur die Lehrkraft schreibt: phase ('warten' |
                       'runde' | 'auswertung' | 'ende'), runde, runden,
                       stufe, zeichen, notenlinien, aufgabe (Kuerzel wie im
                       Link), start (Serverzeit), dauer (s, 0 = ohne),
                       spiel (Kennung je Spiel), wertung {id: {punkte,
                       gesamt, platz}}, entfernt {id: true}
     spieler/<id>      jedes Geraet seinen Eintrag: {name, emoji, seit}
     stand/<spiel>_<runde>/<id>
                       Fortschritt je Runde: {richtig, fehler, gesamt,
                       fertig, fertigAm (Serverzeit)}
   Punkte rechnet die Lehrkraft: richtiges Kaestchen +2, Fehler -1
   (je Runde nicht unter 0), die ersten drei Fertigen +5/+3/+1 (fertig
   heisst: alle Kaestchen richtig - falsche muessen ausgebessert werden).
   Pruefen und Zeichnen: js/zaehlkern.js, wie im Zaehl-Training.
   Spielart (lehrer.art): 'zaehlen' (Zaehlzeiten, s. oben) oder 'diktat'
   (Rhythmus-Diktat wie die Rhythmus-Runde im Scoreboard): Der Beamer
   spielt den Rhythmus vor (Vorklatschen aus audio.js, ohne Notenbild),
   die Kinder bauen ihn mit dem Eingabefeld (editor.js, Palette =
   lehrer.werte) nach und pruefen; Einheit ist dann der Takt (richtig =
   stimmende Takte, fehler = Fehlversuche, +4 je Takt), lehrer.klatsch =
   Klatschmodus (rhythmusGleich).
   ============================================================ */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getDatabase, ref, set, update, get, onValue, remove, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js';

const firebaseConfig = {
    apiKey: 'AIzaSyA8aYVFa8XbIwviC4iJDA46gK0rMfF97Ac',
    authDomain: 'greenboys-scoreboard.firebaseapp.com',
    databaseURL: 'https://greenboys-scoreboard-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'greenboys-scoreboard',
    storageBucket: 'greenboys-scoreboard.firebasestorage.app',
    messagingSenderId: '1059492482424',
    appId: '1:1059492482424:web:9b4ad8c62ba51a83f8cc8d'
};
const db = getDatabase(initializeApp(firebaseConfig));
const pfad = (code, rest) => `rooms/zz-${code}${rest ? '/' + rest : ''}`;

const PUNKTE_RICHTIG = { zaehlen: 2, diktat: 4 }, PUNKTE_FEHLER = 1, PUNKTE_TEMPO = [5, 3, 1];
const ART_TEXT = {
    zaehlen: 'Alle sehen denselben Rhythmus und schreiben die Zählzeiten über die Noten.',
    diktat: 'Du spielst den Rhythmus am Beamer vor (so oft du willst), alle bauen ihn auf ihrem Gerät nach.'
};
const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // ohne 0/O, 1/I
const EMOJIS = ['🥁', '🎸', '🎹', '🎺', '🎷', '🎻', '🪇', '🎤', '🦊', '🐼', '🐸', '🦄', '🐙', '🚀', '⚡', '🌈'];
const STUFEN_TEXT = {
    1: 'Jede Eingabe wird sofort geprüft – ein Fehler zählt direkt.',
    2: 'Geprüft wird jeder ganz ausgefüllte Takt – wenn die Teams auf „Prüfen“ tippen.',
    3: 'Geprüft wird die ganze Zeile auf einmal – wenn die Teams auf „Prüfen“ tippen.'
};

let zeitVersatz = 0;   // Serverzeit - Geraetezeit
onValue(ref(db, '.info/serverTimeOffset'), s => { zeitVersatz = s.val() || 0; });
const jetzt = () => Date.now() + zeitVersatz;
onValue(ref(db, '.info/connected'), s => {
    const el = document.getElementById('verbindung');
    el.classList.toggle('an', !!s.val());
    el.title = s.val() ? 'Verbunden' : 'Keine Verbindung';
});

/* ---------- Kleinkram ---------- */
const $ = (id) => document.getElementById(id);
window.zeigeToast = zeigeToast;   // audio.js (Vorspielen) meldet sich darueber
function zeigeToast(text, art) {
    const el = document.createElement('div');
    el.className = 'toast' + (art ? ' ' + art : '');
    el.textContent = text;
    $('toast-bereich').appendChild(el);
    setTimeout(() => el.remove(), 3200);
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lesen = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
const schreiben = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } };
const zufall = (n, zeichen) => Array.from({ length: n }, () => zeichen[Math.floor(Math.random() * zeichen.length)]).join('');
function zeigen(id, an) { $(id).classList.toggle('hidden', !an); }
// Loesungsbild auf die Breite des Behaelters einpassen
function loesungZeigen(host, stueck, notenlinien) {
    const breite = Math.max(280, (host.clientWidth || 800) - 8);
    const probe = document.createElement('div');
    probe.innerHTML = stueckAnzeigeHtml(stueck, { zaehlzeiten: true, undAlsPlus: true, notenlinien, breite: 1 });
    const breitester = Math.max(...[...probe.querySelectorAll('svg')].map(s => s.viewBox.baseVal.width));
    const skal = Math.max(0.7, Math.min(2.2, breite / breitester));
    host.innerHTML = stueckAnzeigeHtml(stueck, { zaehlzeiten: true, undAlsPlus: true, notenlinien, breite: breite / skal, skalierung: skal });
}

/* Theme wie in der Werkstatt (gleicher Schluessel) */
(function () {
    let gespeichert = null;
    try { gespeichert = localStorage.getItem('rw-theme'); } catch (e) { /* egal */ }
    const hell = gespeichert ? gespeichert === 'light' : window.matchMedia('(prefers-color-scheme: light)').matches;
    if (hell) document.documentElement.setAttribute('data-theme', 'light');
    $('theme-knopf').addEventListener('click', () => {
        const istHell = document.documentElement.getAttribute('data-theme') === 'light';
        if (istHell) document.documentElement.removeAttribute('data-theme');
        else document.documentElement.setAttribute('data-theme', 'light');
        try { localStorage.setItem('rw-theme', istHell ? 'dark' : 'light'); } catch (e) { /* egal */ }
    });
})();

/* ---------- Eigene Rhythmen lesen ----------
   Zeile = Werkstatt-Link (#t=..&r=..) oder Kuerzel "V-AA_H-H".
   -> { aufgaben: [{zeichen, kuerzel}] } oder { fehler } */
function eigeneLesen(text, zeichenStandard) {
    const aufgaben = [];
    const zeilen = String(text || '').split('\n').map(z => z.trim()).filter(Boolean);
    for (let i = 0; i < zeilen.length; i++) {
        let z = zeilen[i], zeichen = zeichenStandard;
        const hash = z.includes('#') ? z.slice(z.indexOf('#') + 1) : (z.includes('r=') ? z : null);
        if (hash !== null) {
            const p = new URLSearchParams(hash.replace(/^\?/, ''));
            if (!p.get('r')) return { fehler: `Zeile ${i + 1}: kein Rhythmus (r=…) im Link.` };
            z = p.get('r');
            if (ZS_TAKTARTEN.includes(p.get('t'))) zeichen = p.get('t');
            else if (p.get('t')) return { fehler: `Zeile ${i + 1}: Taktart ${p.get('t')} geht im Spiel nicht (nur 2/4, 3/4, 4/4).` };
        }
        const takte = z.replace(/\s/g, '').split(/[_|]/).filter(Boolean);
        if (!takte.length) return { fehler: `Zeile ${i + 1}: leer.` };
        for (const t of takte) {
            const codes = t.split('-').map(c => c.split('!')[0]);
            const unbekannt = codes.find(c => !ZS_BAUSTEINE.some(b => b.code === c));
            if (unbekannt) return { fehler: `Zeile ${i + 1}: „${unbekannt}“ ${RHYTHMUS_NACH_CODE[unbekannt] ? 'ist eine Triole – geht im Spiel nicht' : 'kenne ich nicht'}.` };
            const dauer = codes.reduce((s, c) => s + RHYTHMUS_NACH_CODE[c].dauer, 0);
            if (Math.abs(dauer - taktSoll(zeichen)) > 0.001) return { fehler: `Zeile ${i + 1}: ein Takt geht in ${zeichen} nicht auf.` };
        }
        aufgaben.push({ zeichen, kuerzel: takte.map(t => t.split('-').map(c => c.split('!')[0]).join('-')).join('_') });
    }
    return { aufgaben };
}

/* ============================================================
   LEHRKRAFT
   ============================================================ */
const L_SCHLUESSEL = 'zk-lehrer';
const L = Object.assign({
    auswahl: ['V', 'AA', 'H', 'Vp', 'ASS', 'SSA', 'SSSS', 'pA'],
    art: 'zaehlen', klatsch: true,
    zeichen: '4/4', takte: 2, runden: 5, stufe: 1, zeit: 90, notenlinien: false, eigene: '',
    code: null,       // offener Raum
    spiel: null,      // Kennung des laufenden Spiels
    plan: [],         // [{zeichen, kuerzel}] je Runde
    gesamt: {}        // id -> Punkte
}, lesen(L_SCHLUESSEL, {}));
let lehrerStand = null;      // zuletzt geschriebener Stand unter lehrer
let spielerListe = {};       // id -> {name, emoji}
let rundenStand = {};        // id -> Fortschritt der laufenden Runde
let standAbo = null, uhr = null, autoEnde = null;
const lSpeichern = () => schreiben(L_SCHLUESSEL, L);

function lEinstellungenZeichnen() {
    document.querySelectorAll('#l-palette .gen-baustein').forEach(k => k.classList.toggle('an', L.auswahl.includes(k.dataset.code)));
    document.querySelectorAll('[data-l-zeichen]').forEach(b => b.classList.toggle('an', b.dataset.lZeichen === L.zeichen));
    document.querySelectorAll('[data-l-stufe]').forEach(b => b.classList.toggle('an', Number(b.dataset.lStufe) === L.stufe));
    document.querySelectorAll('[data-l-zeit]').forEach(b => b.classList.toggle('an', Number(b.dataset.lZeit) === L.zeit));
    $('l-stufe-text').textContent = STUFEN_TEXT[L.stufe];
    $('l-takte').textContent = L.takte;
    $('l-runden').textContent = L.runden;
    $('l-notenlinien').checked = L.notenlinien;
    $('l-klatsch').checked = L.klatsch;
    document.querySelectorAll('[data-l-art]').forEach(b => b.classList.toggle('an', b.dataset.lArt === L.art));
    $('l-art-text').textContent = ART_TEXT[L.art];
    zeigen('l-stufe-zeile', L.art === 'zaehlen');
    zeigen('l-klatsch-chip', L.art === 'diktat');
    $('l-punkte-text').textContent = L.art === 'diktat'
        ? 'Punkte: richtiger Takt +4, Fehlversuch −1, wer zuerst fertig ist +5 / +3 / +1.'
        : 'Punkte: richtiges Kästchen +2, Fehler −1, wer zuerst fertig ist +5 / +3 / +1.';
    const e = eigeneLesen(L.eigene, L.zeichen);
    $('l-eigene-info').textContent = !L.eigene.trim() ? '' : e.fehler ? '– ' + e.fehler : `– ${e.aufgaben.length} ${e.aufgaben.length === 1 ? 'Rhythmus' : 'Rhythmen'} = ${e.aufgaben.length} Runden`;
}

function lehrerSetzen(teil) {
    lehrerStand = Object.assign({}, lehrerStand, teil);
    return update(ref(db, pfad(L.code, 'lehrer')), teil);
}

async function raumOeffnen() {
    // Plan pruefen, bevor ein Raum aufgeht
    const plan = lPlanBauen();
    if (!plan) return;
    let code = null;
    for (let i = 0; i < 8 && !code; i++) {
        const k = zufall(4, CODE_ZEICHEN);
        const s = await get(ref(db, pfad(k, 'lehrer')));
        if (!s.exists()) code = k;
    }
    if (!code) { zeigeToast('Kein freier Raumcode gefunden – bitte nochmal.', 'danger'); return; }
    L.code = code; L.gesamt = {}; L.spiel = null; L.plan = plan;
    lSpeichern();
    lehrerStand = null;
    await set(ref(db, pfad(code, 'lehrer')), { phase: 'warten', art: L.art, runde: 0, runden: plan.length, stufe: L.stufe, offen: serverTimestamp() });
    lehrerStand = { phase: 'warten', art: L.art, runde: 0, runden: plan.length, stufe: L.stufe };
    lRaumVerbinden();
}

/* Runden vorab festlegen: eigene Rhythmen oder gewuerfelt */
function lPlanBauen() {
    if (L.eigene.trim()) {
        const e = eigeneLesen(L.eigene, L.zeichen);
        if (e.fehler) { zeigeToast(e.fehler, 'danger'); return null; }
        return e.aufgaben;
    }
    const plan = [];
    for (let r = 0; r < L.runden; r++) {
        const w = zkTakteWuerfeln(L.auswahl, L.zeichen, L.takte);
        if (w.fehler) { zeigeToast(w.fehler, 'danger'); return null; }
        plan.push({ zeichen: L.zeichen, kuerzel: zkStueckKuerzel({ takte: w.takte }) });
    }
    return plan;
}

function lRaumVerbinden() {
    zeigen('l-einstellungen', false);
    zeigen('l-raum', true);
    $('l-code').textContent = L.code;
    const url = location.origin + location.pathname + '?raum=' + L.code;
    for (const [feld, groesse] of [['l-qr', 300], ['l-qr-gross', 420]]) {
        $(feld).innerHTML = '';
        new QRCode($(feld), { text: url, width: groesse, height: groesse, correctLevel: QRCode.CorrectLevel.M });
    }
    const kurz = url.replace(/^https?:\/\//, '');
    $('l-url').textContent = kurz;
    $('l-url-gross').textContent = kurz;
    onValue(ref(db, pfad(L.code, 'spieler')), s => {
        spielerListe = s.val() || {};
        lZeichnen();
    });
    onValue(ref(db, pfad(L.code, 'lehrer')), s => {
        if (!s.exists()) return;
        lehrerStand = s.val();
        lZeichnen();
        lStandAbonnieren();
    }, { onlyOnce: true });
    clearInterval(uhr);
    uhr = setInterval(lUhr, 250);
}

function lStandAbonnieren() {
    if (standAbo) { standAbo(); standAbo = null; }
    const st = lehrerStand;
    if (!st || st.phase !== 'runde') return;
    standAbo = onValue(ref(db, pfad(L.code, `stand/${st.spiel}_${st.runde}`)), s => {
        rundenStand = s.val() || {};
        lFortschrittZeichnen();
        // Alle fertig: kurz stehen lassen, dann auswerten
        const ids = Object.keys(spielerListe);
        const alle = ids.length && ids.every(id => rundenStand[id] && rundenStand[id].fertig);
        clearTimeout(autoEnde);
        if (alle && lehrerStand.phase === 'runde') autoEnde = setTimeout(lAuswerten, 1500);
    });
}

const lSpielerSortiert = () => Object.entries(spielerListe).sort((a, b) => (a[1].seit || 0) - (b[1].seit || 0));

function lZeichnen() {
    const st = lehrerStand || {};
    ['l-lobby', 'l-runde', 'l-auswertung', 'l-ende'].forEach(id => zeigen(id, false));
    zeigen('l-qr-klein-btn', st.phase !== 'warten');
    const n = Object.keys(spielerListe).length;
    $('kopf-info').textContent = `Raum ${L.code} · ${n} ${n === 1 ? 'Kind' : 'Kinder'}`;
    if (st.phase === 'warten') {
        zeigen('l-lobby', true);
        $('l-phase-info').textContent = `${st.art === 'diktat' ? 'Rhythmus-Diktat' : 'Zählzeiten · ' + ZS_STUFEN_KURZ[st.stufe]} · ${st.runden} Runden`;
        $('l-anzahl').textContent = n ? `${n} ${n === 1 ? 'Kind ist' : 'Kinder sind'} dabei.` : 'Noch niemand da.';
        $('l-namen').innerHTML = lSpielerSortiert().map(([id, p]) =>
            `<span class="zk-name">${esc(p.emoji)} ${esc(p.name)}<button type="button" data-raus="${esc(id)}" title="Entfernen">×</button></span>`).join('');
        $('l-start-btn').disabled = !n;
    } else if (st.phase === 'runde') {
        zeigen('l-runde', true);
        const diktat = st.art === 'diktat';
        $('l-phase-info').textContent = `Runde ${st.runde} von ${st.runden} · ${diktat ? 'Rhythmus-Diktat' : ZS_STUFEN_KURZ[st.stufe]}`;
        const stueck = zkStueckAusKuerzel(st.aufgabe, st.zeichen);
        const host = $('l-noten');
        zeigen('l-noten', !diktat);
        zeigen('l-diktat', diktat);
        // Beamer: beim Zaehlen nur die Noten (ohne Kaestchen und Loesung), beim Diktat gar keine
        if (diktat) host.innerHTML = '';
        else {
            const breite = Math.max(280, host.clientWidth || 800);
            host.innerHTML = stueckAnzeigeHtml(stueck, { notenlinien: st.notenlinien, breite: breite / 1.8, skalierung: 1.8 });
        }
        lFortschrittZeichnen();
    } else if (st.phase === 'auswertung') {
        zeigen('l-auswertung', true);
        $('l-phase-info').textContent = `Auflösung Runde ${st.runde} von ${st.runden}`;
        loesungZeigen($('l-loesung'), zkStueckAusKuerzel(st.aufgabe, st.zeichen), st.notenlinien);
        lListenZeichnen();
        $('l-weiter-btn').innerHTML = st.runde >= st.runden
            ? '<i class="fa-solid fa-trophy"></i> Endstand zeigen'
            : '<i class="fa-solid fa-forward"></i> Nächste Runde';
    } else if (st.phase === 'ende') {
        zeigen('l-ende', true);
        $('l-phase-info').textContent = 'Endstand';
        lEndeZeichnen();
    }
}

function lFortschrittZeichnen() {
    const st = lehrerStand;
    if (!st || st.phase !== 'runde') return;
    const zeilen = lSpielerSortiert().map(([id, p]) => {
        const f = rundenStand[id] || {};
        const anteil = f.gesamt ? Math.round((f.richtig || 0) / f.gesamt * 100) : 0;
        const zeit = f.fertig && f.fertigAm && st.start ? ` ${zsZeit(Math.max(0, Math.round((f.fertigAm - st.start) / 1000)))}` : '';
        return `<div class="zk-balken-zeile${f.fertig ? ' fertig' : ''}">
            <span class="zk-balken-name">${esc(p.emoji)} ${esc(p.name)}</span>
            <span class="zk-balken"><span style="width:${anteil}%"></span></span>
            <span class="zk-balken-wert">${f.fertig ? '✓' + zeit : (f.richtig || 0) + '/' + (f.gesamt || '–') + (st.art === 'diktat' && f.fehler ? ` <small class="zs-rot">${f.fehler}✗</small>` : '')}</span>
        </div>`;
    });
    const fertig = lSpielerSortiert().filter(([id]) => rundenStand[id] && rundenStand[id].fertig).length;
    $('l-fortschritt').innerHTML = `<p class="zs-hinweis">${fertig} von ${zeilen.length} fertig</p>` + zeilen.join('');
}

function lUhr() {
    const st = lehrerStand;
    const an = st && st.phase === 'runde' && st.dauer > 0 && st.start;
    zeigen('l-timer', !!an);
    if (!an) return;
    const rest = Math.max(0, Math.ceil((st.start + st.dauer * 1000 - jetzt()) / 1000));
    $('l-timer').textContent = zsZeit(rest);
    $('l-timer').classList.toggle('knapp', rest <= 10);
    if (rest <= 0) lAuswerten();
}

/* Palette fuers Diktat: die gewaehlten Bausteine plus alles, was in eigenen
   Rhythmen vorkommt - sonst liesse sich ein Takt gar nicht nachbauen. */
function lWerte() {
    const w = new Set(L.auswahl);
    L.plan.forEach(p => p.kuerzel.split(/[_-]/).forEach(c => w.add(c)));
    return ZS_BAUSTEINE.map(b => b.code).filter(c => w.has(c));
}
function lVorspielen() {
    const st = lehrerStand;
    if (!st || st.phase !== 'runde' || st.art !== 'diktat') return;
    // Laeuft es schon, stoppt derselbe Knopf
    Vorklatschen.starten(zkStueckAusKuerzel(st.aufgabe, st.zeichen), $('l-klang-host'), false, 0, null, null);
}

async function lRundeStarten() {
    const st = lehrerStand;
    const runde = (st.runde || 0) + 1;
    const aufgabe = L.plan[runde - 1];
    if (!aufgabe) return;
    if (!L.spiel) { L.spiel = zufall(6, 'abcdefghijkmnpqrstuvwxyz23456789'); lSpeichern(); }
    rundenStand = {};
    await lehrerSetzen({
        phase: 'runde', art: L.art, klatsch: L.klatsch, werte: lWerte(), runde, runden: L.plan.length, stufe: L.stufe, zeichen: aufgabe.zeichen,
        notenlinien: L.notenlinien, aufgabe: aufgabe.kuerzel, dauer: L.zeit, spiel: L.spiel,
        start: serverTimestamp(), wertung: null
    });
    // die echte Startzeit (Serverzeit) zuruecklesen, fuer Uhr und Fertig-Zeiten
    const s = await get(ref(db, pfad(L.code, 'lehrer/start')));
    lehrerStand.start = s.val();
    lZeichnen();
    lStandAbonnieren();
}

/* Runde auswerten: Punkte je Kind, Tempo-Bonus nach Fertig-Zeit */
let wertetAus = false;
async function lAuswerten() {
    const st = lehrerStand;
    if (!st || st.phase !== 'runde' || wertetAus) return;
    wertetAus = true;
    clearTimeout(autoEnde);
    try {
        const s = await get(ref(db, pfad(L.code, `stand/${st.spiel}_${st.runde}`)));
        rundenStand = s.val() || {};
        const ids = Object.keys(spielerListe);
        const fertige = ids.filter(id => rundenStand[id] && rundenStand[id].fertig && rundenStand[id].fertigAm)
            .sort((a, b) => rundenStand[a].fertigAm - rundenStand[b].fertigAm);
        const wertung = {};
        ids.forEach(id => {
            const f = rundenStand[id] || {};
            const tempoPlatz = fertige.indexOf(id);
            const tempo = tempoPlatz >= 0 && tempoPlatz < PUNKTE_TEMPO.length ? PUNKTE_TEMPO[tempoPlatz] : 0;
            const grund = Math.max(0, (f.richtig || 0) * PUNKTE_RICHTIG[st.art || 'zaehlen'] - (f.fehler || 0) * PUNKTE_FEHLER);
            L.gesamt[id] = (L.gesamt[id] || 0) + grund + tempo;
            wertung[id] = { punkte: grund + tempo, tempo, richtig: f.richtig || 0, fehler: f.fehler || 0, gesamt: L.gesamt[id] };
        });
        // Plaetze nach Gesamtpunkten (gleiche Punkte = gleicher Platz)
        const reihe = ids.slice().sort((a, b) => wertung[b].gesamt - wertung[a].gesamt);
        reihe.forEach((id, i) => {
            wertung[id].platz = i > 0 && wertung[reihe[i - 1]].gesamt === wertung[id].gesamt ? wertung[reihe[i - 1]].platz : i + 1;
        });
        lSpeichern();
        if (Vorklatschen.istAn()) Vorklatschen.stoppen(true);
        await lehrerSetzen({ phase: 'auswertung', wertung });
        if (standAbo) { standAbo(); standAbo = null; }
        lZeichnen();
    } finally { wertetAus = false; }
}

function lListenZeichnen() {
    const w = (lehrerStand && lehrerStand.wertung) || {};
    const name = (id) => spielerListe[id] ? `${esc(spielerListe[id].emoji)} ${esc(spielerListe[id].name)}` : '?';
    const runde = Object.keys(w).sort((a, b) => w[b].punkte - w[a].punkte);
    $('l-rundenliste').innerHTML = `<table class="zk-tabelle">${runde.map(id =>
        `<tr><td>${name(id)}</td><td class="zk-klein">${w[id].richtig} ${lehrerStand.art === 'diktat' ? (w[id].richtig === 1 ? 'Takt' : 'Takte') + ' ✓' : '✓'} · ${w[id].fehler} ✗${w[id].tempo ? ` · ⚡+${w[id].tempo}` : ''}</td><td class="zk-p">+${w[id].punkte}</td></tr>`).join('')}</table>`;
    const gesamt = Object.keys(w).sort((a, b) => w[a].platz - w[b].platz);
    $('l-gesamtliste').innerHTML = `<table class="zk-tabelle">${gesamt.map(id =>
        `<tr><td class="zk-platz">${w[id].platz}.</td><td>${name(id)}</td><td class="zk-p">${w[id].gesamt}</td></tr>`).join('')}</table>`;
}

function lEndeZeichnen() {
    const ids = Object.keys(spielerListe);
    const reihe = ids.slice().sort((a, b) => (L.gesamt[b] || 0) - (L.gesamt[a] || 0));
    const name = (id) => `${esc(spielerListe[id].emoji)} ${esc(spielerListe[id].name)}`;
    const stufen = [1, 0, 2].filter(i => reihe[i]);   // Podest: 2. - 1. - 3.
    $('l-podest').innerHTML = stufen.map(i =>
        `<div class="zk-stufe zk-stufe-${i + 1}"><div class="zk-stufe-name">${name(reihe[i])}</div><div class="zk-stufe-p">${L.gesamt[reihe[i]] || 0}</div><div class="zk-stufe-block">${['🥇', '🥈', '🥉'][i]}</div></div>`).join('');
    $('l-endliste').innerHTML = `<table class="zk-tabelle">${reihe.slice(3).map((id, i) =>
        `<tr><td class="zk-platz">${i + 4}.</td><td>${name(id)}</td><td class="zk-p">${L.gesamt[id] || 0}</td></tr>`).join('')}</table>`;
}

async function lWeiter() {
    const st = lehrerStand;
    if (st.runde >= st.runden) {
        await lehrerSetzen({ phase: 'ende' });
        lZeichnen();
    } else lRundeStarten();
}

async function lNochmal() {
    const plan = lPlanBauen();
    if (!plan) return;
    L.plan = plan; L.gesamt = {}; L.spiel = null;
    lSpeichern();
    await lehrerSetzen({ phase: 'warten', runde: 0, runden: plan.length, stufe: L.stufe, wertung: null, aufgabe: null });
    lZeichnen();
}

async function lSchliessen() {
    if (!confirm('Raum schließen? Alle Kinder fliegen raus, die Punkte sind weg.')) return;
    clearInterval(uhr);
    if (standAbo) { standAbo(); standAbo = null; }
    try { await remove(ref(db, pfad(L.code))); } catch (e) { /* egal */ }
    L.code = null; L.spiel = null; L.gesamt = {};
    lSpeichern();
    location.reload();
}

function lehrerAufbauen() {
    zeigen('lehrer', true);
    zeigen('zurueck-link', true);   // nur fuer die Lehrkraft - Kinder sollen im Spiel bleiben
    const palette = $('l-palette');
    ZS_BAUSTEINE.forEach(b => {
        const k = document.createElement('button');
        k.type = 'button'; k.className = 'gen-baustein'; k.dataset.code = b.code; k.title = b.wort;
        k.innerHTML = bausteinSvg(b);
        k.addEventListener('click', () => {
            L.auswahl = L.auswahl.includes(b.code) ? L.auswahl.filter(c => c !== b.code) : [...L.auswahl, b.code];
            lSpeichern(); lEinstellungenZeichnen();
        });
        palette.appendChild(k);
    });
    document.querySelectorAll('[data-l-zeichen]').forEach(b => b.addEventListener('click', () => { L.zeichen = b.dataset.lZeichen; lSpeichern(); lEinstellungenZeichnen(); }));
    document.querySelectorAll('[data-l-stufe]').forEach(b => b.addEventListener('click', () => { L.stufe = Number(b.dataset.lStufe); lSpeichern(); lEinstellungenZeichnen(); }));
    document.querySelectorAll('[data-l-zeit]').forEach(b => b.addEventListener('click', () => { L.zeit = Number(b.dataset.lZeit); lSpeichern(); lEinstellungenZeichnen(); }));
    document.querySelectorAll('[data-l-plus]').forEach(b => b.addEventListener('click', () => {
        const [feld, schritt] = b.dataset.lPlus.split(':');
        const grenzen = { takte: [1, 4], runden: [1, 15] }[feld];
        L[feld] = Math.max(grenzen[0], Math.min(grenzen[1], L[feld] + Number(schritt)));
        lSpeichern(); lEinstellungenZeichnen();
    }));
    $('l-notenlinien').addEventListener('change', e => { L.notenlinien = e.target.checked; lSpeichern(); });
    $('l-klatsch').addEventListener('change', e => { L.klatsch = e.target.checked; lSpeichern(); });
    document.querySelectorAll('[data-l-art]').forEach(b => b.addEventListener('click', () => { L.art = b.dataset.lArt; lSpeichern(); lEinstellungenZeichnen(); }));
    $('l-hoeren-btn').addEventListener('click', lVorspielen);
    Metronom.bauen($('l-metronom'), () => (lehrerStand && lehrerStand.zeichen) || '4/4');
    $('l-eigene').value = L.eigene;
    if (L.eigene.trim()) $('l-eigene').closest('details').open = true;
    $('l-eigene').addEventListener('input', e => { L.eigene = e.target.value; lSpeichern(); lEinstellungenZeichnen(); });
    $('l-oeffnen-btn').addEventListener('click', raumOeffnen);
    $('l-start-btn').addEventListener('click', lRundeStarten);
    $('l-beenden-btn').addEventListener('click', lAuswerten);
    $('l-weiter-btn').addEventListener('click', lWeiter);
    $('l-nochmal-btn').addEventListener('click', lNochmal);
    $('l-schliessen-btn').addEventListener('click', lSchliessen);
    $('l-qr-klein-btn').addEventListener('click', () => $('l-qr-dialog').showModal());
    $('l-qr-zu').addEventListener('click', () => $('l-qr-dialog').close());
    $('l-namen').addEventListener('click', async e => {
        const id = e.target.dataset && e.target.dataset.raus;
        if (!id) return;
        await update(ref(db, pfad(L.code, 'lehrer/entfernt')), { [id]: true });
        lehrerStand.entfernt = Object.assign({}, lehrerStand.entfernt, { [id]: true });
        await remove(ref(db, pfad(L.code, `spieler/${id}`)));
    });
    let warten = null;
    window.addEventListener('resize', () => { clearTimeout(warten); warten = setTimeout(lZeichnen, 200); });
    lEinstellungenZeichnen();
    // Nach Neuladen: offenen Raum wieder aufnehmen
    if (L.code) {
        get(ref(db, pfad(L.code, 'lehrer'))).then(s => {
            if (s.exists()) { lehrerStand = s.val(); lRaumVerbinden(); }
            else { L.code = null; lSpeichern(); }
        });
    }
}

/* ============================================================
   SCHUELER
   ============================================================ */
const geraet = lesen('zk-geraet', null) || (() => { const id = zufall(12, 'abcdefghijkmnpqrstuvwxyz23456789'); schreiben('zk-geraet', id); return id; })();
let sCode = null;
let sStand = {};        // lehrer-Knoten
let sAufgabe = null, sAufgabeSchluessel = null;
let sEmoji = lesen('zk-emoji', EMOJIS[Math.floor(Math.random() * EMOJIS.length)]);
let sDabei = false, sLehrerAbo = null;

function sBeitrittZeigen() {
    zeigen('s-beitritt', true); zeigen('s-info', false); zeigen('s-spiel', false);
    $('s-code').textContent = sCode || '';
    zeigen('s-code-feld', !sCode);
    $('s-name').value = lesen('zk-name', '');
    $('s-emojis').innerHTML = EMOJIS.map(e => `<button type="button" class="${e === sEmoji ? 'an' : ''}" data-emoji="${e}">${e}</button>`).join('');
}

async function sBeitreten() {
    if (!sCode) {
        const c = $('s-code-eingabe').value.trim().toUpperCase();
        if (!/^[A-Z0-9]{4,6}$/.test(c)) { zeigeToast('Bitte den Raumcode von der Tafel eingeben.', 'danger'); return; }
        sCode = c;
    }
    const name = $('s-name').value.replace(/\s+/g, ' ').trim().slice(0, 12);
    if (!name) { zeigeToast('Bitte gib deinen Namen ein.', 'danger'); return; }
    const raum = await get(ref(db, pfad(sCode, 'lehrer')));
    if (!raum.exists()) { zeigeToast(`Raum ${sCode} gibt es nicht (mehr).`, 'danger'); if (!new URLSearchParams(location.search).get('raum')) sCode = null; return; }
    // Name schon vergeben (anderes Geraet)?
    const alle = (await get(ref(db, pfad(sCode, 'spieler')))).val() || {};
    if (Object.entries(alle).some(([id, p]) => id !== geraet && p.name.toLowerCase() === name.toLowerCase())) {
        zeigeToast('Den Namen gibt es schon – nimm einen anderen.', 'danger'); return;
    }
    schreiben('zk-name', name); schreiben('zk-emoji', sEmoji); schreiben('zk-raum', sCode);
    if (raum.val().entfernt && raum.val().entfernt[geraet]) {
        await update(ref(db, pfad(sCode, 'lehrer/entfernt')), { [geraet]: null }).catch(() => {});
    }
    await set(ref(db, pfad(sCode, `spieler/${geraet}`)), { name, emoji: sEmoji, seit: serverTimestamp() });
    sDabei = true;
    sAbonnieren();
}

function sAbonnieren() {
    if (sLehrerAbo) sLehrerAbo();
    sLehrerAbo = onValue(ref(db, pfad(sCode, 'lehrer')), s => {
        if (!s.exists()) { sDabei = false; zeigeToast('Der Raum wurde geschlossen.', 'info'); sBeitrittZeigen(); return; }
        sStand = s.val();
        if (sStand.entfernt && sStand.entfernt[geraet]) { sDabei = false; sBeitrittZeigen(); return; }
        sZeichnen();
    });
}

function sIchHtml() {
    const w = sStand.wertung && sStand.wertung[geraet];
    return `${esc(sEmoji)} <b>${esc(lesen('zk-name', ''))}</b>${w ? ` · ${w.gesamt} Punkte` : ''}`;
}

const sRundenSchluessel = () => `${sStand.spiel}_${sStand.runde}`;

function sZeichnen() {
    const st = sStand;
    $('kopf-info').textContent = `Raum ${sCode}`;
    zeigen('s-beitritt', false);
    if (st.phase === 'runde') {
        zeigen('s-info', false); zeigen('s-spiel', true);
        const diktat = st.art === 'diktat';
        zeigen('s-noten', !diktat); zeigen('s-dk', diktat);
        if (diktat) { zeigen('s-pad', false); sDiktatVorbereiten(); sDiktatZeichnen(); return; }
        zeigen('s-dk-knoepfe', false);
        const schluessel = sRundenSchluessel();
        if (sAufgabeSchluessel !== schluessel) {
            sAufgabeSchluessel = schluessel;
            sAufgabe = zkAufgabe(zkStueckAusKuerzel(st.aufgabe, st.zeichen), st.stufe, true);
            // nach Neuladen mitten in der Runde: eigenen Stand wiederherstellen
            const alt = lesen('zk-aufgabe', null);
            if (alt && alt.schluessel === schluessel && alt.felder.length === sAufgabe.felder.length) {
                Object.assign(sAufgabe, { felder: alt.felder, fehler: alt.fehler, aktiv: alt.aktiv, fertig: alt.fertig });
            } else sMelden();
            $('s-meldung').textContent = '';
        }
        sSpielZeichnen();
    } else {
        zeigen('s-spiel', false); zeigen('s-info', true);
        $('s-ich').innerHTML = sIchHtml();
        $('s-loesung').innerHTML = '';
        if (st.phase === 'warten') {
            $('s-info-text').innerHTML = 'Du bist dabei!<br><span class="zs-hinweis">Warte, bis die Lehrkraft startet.</span>';
        } else if (st.phase === 'auswertung') {
            const w = st.wertung && st.wertung[geraet];
            $('s-info-text').innerHTML = w
                ? `Runde ${st.runde}: <b class="zk-plus">+${w.punkte}</b>${w.tempo ? ` <span class="zs-hinweis">(⚡ +${w.tempo} fürs Tempo)</span>` : ''}<br>Platz <b>${w.platz}</b> mit ${w.gesamt} Punkten`
                : `Runde ${st.runde} ist vorbei.`;
            loesungZeigen($('s-loesung'), zkStueckAusKuerzel(st.aufgabe, st.zeichen), st.notenlinien);
        } else if (st.phase === 'ende') {
            const w = st.wertung && st.wertung[geraet];
            $('s-info-text').innerHTML = w
                ? `${w.platz <= 3 ? ['🥇', '🥈', '🥉'][w.platz - 1] + ' ' : ''}Endstand: Platz <b>${w.platz}</b> mit <b>${w.gesamt}</b> Punkten!`
                : 'Das Spiel ist vorbei.';
        }
    }
}

function sSpielZeichnen(blitz) {
    const a = sAufgabe, st = sStand;
    zkZeichnen($('s-noten'), a, { notenlinien: st.notenlinien, blitz });
    if (blitz) setTimeout(() => { if (sAufgabe === a) sSpielZeichnen(); }, 650);
    const pulse = taktPulse(a.stueck.zeichen);
    document.querySelectorAll('#s-pad [data-zeichen]').forEach(b => {
        b.classList.toggle('unsichtbar', /^\d$/.test(b.dataset.zeichen) && Number(b.dataset.zeichen) > pulse);
    });
    zeigen('s-pad', !a.fertig);
    zeigen('s-pruefen-leiste', !a.fertig && a.stufe > 1);
    zeigen('s-fertig', a.fertig);
    if (a.fertig) $('s-fertig').innerHTML = '<b>Fertig!</b> Warte auf die anderen …';
    sStandZeile();
}
/* ---------- Schueler: Rhythmus-Diktat ----------
   Eingabefeld wie in der Werkstatt; Pruefen vergleicht Takt fuer Takt mit
   dem vorgespielten Rhythmus. Jeder Fehlversuch zaehlt als Fehler, richtig =
   stimmende Takte beim letzten Pruefen. Eigener Stand in zk-diktat (Neuladen). */
let sDk = null;   // { schluessel, loesung, fehler, richtig, fertig, gemeldet, editor }
function sDiktatVorbereiten() {
    const st = sStand, schluessel = sRundenSchluessel();
    if (sDk && sDk.schluessel === schluessel) return;
    const loesung = zkStueckAusKuerzel(st.aufgabe, st.zeichen);
    const editor = rhythmusEditor($('s-dk-editor'), $('s-dk-palette'), st.zeichen, st.werte || null);
    sDk = { schluessel, loesung, fehler: 0, richtig: 0, fertig: false, gemeldet: false, editor };
    const alt = lesen('zk-diktat', null);
    if (alt && alt.schluessel === schluessel) {
        Object.assign(sDk, { fehler: alt.fehler, richtig: alt.richtig, fertig: alt.fertig, gemeldet: alt.fertig });
        editor.setzen(st.zeichen, alt.takte.map(k => ({ bausteine: k ? k.split('-').map(c => RHYTHMUS_NACH_CODE[c]).filter(Boolean) : [] })));
    } else {
        editor.setzen(st.zeichen, loesung.takte.map(() => ({ bausteine: [] })));
        sDkMelden();
    }
    editor.aufAenderung(() => { $('s-meldung').textContent = ''; sDkSichern(); });
    $('s-meldung').textContent = '';
}
function sDkSichern() {
    if (!sDk) return;
    schreiben('zk-diktat', { schluessel: sDk.schluessel, fehler: sDk.fehler, richtig: sDk.richtig, fertig: sDk.fertig,
        takte: sDk.editor.stueck().takte.map(t => t.bausteine.map(b => b.code).join('-')) });
}
function sDkMelden() {
    const d = { richtig: sDk.richtig, fehler: sDk.fehler, gesamt: sDk.loesung.takte.length, fertig: sDk.fertig };
    if (sDk.fertig && !sDk.gemeldet) { d.fertigAm = serverTimestamp(); sDk.gemeldet = true; }
    sDkSichern();
    update(ref(db, pfad(sCode, `stand/${sDk.schluessel}/${geraet}`)), d).catch(() => zeigeToast('Senden hat nicht geklappt – Verbindung prüfen.', 'danger'));
}
function sDkPruefen() {
    if (sStand.phase !== 'runde' || !sDk || sDk.fertig) return;
    const eingabe = sDk.editor.stueck(), soll = taktSoll(sDk.loesung.zeichen);
    const offen = eingabe.takte.findIndex(t => Math.abs(rhythmusDauer(t.bausteine) - soll) > 0.001);
    if (offen >= 0) {
        $('s-meldung').textContent = `Takt ${offen + 1} ist ${rhythmusDauer(eingabe.takte[offen].bausteine) > soll ? 'zu lang' : 'noch nicht voll'}.`;
        return;
    }
    const kurz = (t) => t.bausteine.map(b => b.code).join('-');
    const stimmt = sDk.loesung.takte.map((t, i) => !!eingabe.takte[i] && rhythmusGleich(kurz(eingabe.takte[i]), kurz(t), sStand.klatsch !== false));
    sDk.richtig = stimmt.filter(Boolean).length;
    if (stimmt.every(Boolean)) sDk.fertig = true;
    else {
        sDk.fehler++;
        const falsch = stimmt.map((s, i) => s ? null : i + 1).filter(Boolean);
        $('s-meldung').textContent = (falsch.length === 1 ? `Takt ${falsch[0]} stimmt` : `Takte ${falsch.join(', ')} stimmen`) + ' noch nicht – hör nochmal hin.';
    }
    sDkMelden();
    sDiktatZeichnen();
    document.querySelectorAll('#s-dk-editor .editor-takt').forEach((box, i) => {
        box.classList.toggle('dk-richtig', !!stimmt[i]);
        box.classList.toggle('dk-falsch', !stimmt[i]);
    });
}
function sDiktatZeichnen() {
    zeigen('s-dk', !sDk.fertig);
    zeigen('s-dk-knoepfe', !sDk.fertig);
    zeigen('s-fertig', sDk.fertig);
    if (sDk.fertig) { $('s-fertig').innerHTML = '<b>Richtig!</b> Warte auf die anderen …'; $('s-meldung').textContent = ''; }
    sStandZeile();
}

function sStandZeile() {
    const st = sStand, a = st.art === 'diktat' ? sDk : sAufgabe;
    if (!a) return;
    let zeit = '';
    if (st.dauer > 0 && st.start) zeit = ` · <b class="zk-zeit">${zsZeit(Math.max(0, Math.ceil((st.start + st.dauer * 1000 - jetzt()) / 1000)))}</b>`;
    $('s-stand').innerHTML = `<span><b>Runde ${st.runde} von ${st.runden}</b>${zeit}</span><span>Fehler <b class="${a.fehler ? 'zs-rot' : ''}">${a.fehler}</b></span><span>${sIchHtml()}</span>`;
}
setInterval(() => { if (sStand.phase === 'runde' && sStand.dauer > 0) sStandZeile(); }, 500);

/* Fortschritt an die Lehrkraft; fertigAm nur einmal (Serverzeit) */
function sMelden() {
    const a = sAufgabe;
    schreiben('zk-aufgabe', { schluessel: sAufgabeSchluessel, felder: a.felder, fehler: a.fehler, aktiv: a.aktiv, fertig: a.fertig });
    const daten = { richtig: zkRichtige(a), fehler: a.fehler, gesamt: a.felder.length, fertig: a.fertig };
    if (a.fertig && !a.gemeldet) { daten.fertigAm = serverTimestamp(); a.gemeldet = true; }
    update(ref(db, pfad(sCode, `stand/${sAufgabeSchluessel}/${geraet}`)), daten).catch(() => zeigeToast('Senden hat nicht geklappt – Verbindung prüfen.', 'danger'));
}

function sEingeben(zeichen) {
    if (sStand.phase !== 'runde' || !sAufgabe) return;
    const e = zkEingeben(sAufgabe, zeichen);
    if (!e) return;
    $('s-meldung').textContent = '';
    if (e.art === 'falsch') { sMelden(); sSpielZeichnen({ feld: e.feld, zeichen }); return; }
    if (e.art === 'geprueft' && e.falsch) {
        $('s-meldung').textContent = `${e.falsch} ${e.falsch === 1 ? 'Kästchen stimmt' : 'Kästchen stimmen'} nicht – bessere ${e.falsch === 1 ? 'es' : 'sie'} aus.`;
    }
    if (e.art !== 'gesetzt') sMelden();
    else schreiben('zk-aufgabe', { schluessel: sAufgabeSchluessel, felder: sAufgabe.felder, fehler: sAufgabe.fehler, aktiv: sAufgabe.aktiv, fertig: sAufgabe.fertig });
    sSpielZeichnen();
}

// Stufe 2/3: Knopf "Pruefen" (oder Enter) - vorher wird nichts bewertet
function sPruefen() {
    if (sStand.phase !== 'runde' || !sAufgabe) return;
    const e = zkPruefen(sAufgabe);
    if (!e) return;
    const stufe = sAufgabe.stufe;
    $('s-meldung').textContent = e.art === 'unvollstaendig' ? (stufe === 2 ? 'Füll erst einen Takt ganz aus.' : 'Füll erst alle Kästchen aus.')
        : e.art === 'unveraendert' ? 'Bessere erst die roten Kästchen aus.'
        : e.falsch ? `${e.falsch} ${e.falsch === 1 ? 'Kästchen stimmt' : 'Kästchen stimmen'} nicht – bessere ${e.falsch === 1 ? 'es' : 'sie'} aus.` : '';
    if (e.art === 'geprueft') sMelden();
    sSpielZeichnen();
}

function schuelerAufbauen() {
    zeigen('schueler', true);
    const p = new URLSearchParams(location.search).get('raum');
    sCode = p ? p.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : null;
    $('s-emojis').addEventListener('click', e => {
        const em = e.target.closest('[data-emoji]');
        if (!em) return;
        sEmoji = em.dataset.emoji;
        document.querySelectorAll('#s-emojis button').forEach(b => b.classList.toggle('an', b === em));
    });
    $('s-los-btn').addEventListener('click', sBeitreten);
    $('s-name').addEventListener('keydown', e => { if (e.key === 'Enter') sBeitreten(); });
    $('s-raus-btn').addEventListener('click', async () => {
        if (sLehrerAbo) { sLehrerAbo(); sLehrerAbo = null; }
        await remove(ref(db, pfad(sCode, `spieler/${geraet}`))).catch(() => {});
        sDabei = false;
        sBeitrittZeigen();
    });
    document.querySelectorAll('#s-pad [data-zeichen]').forEach(b => b.addEventListener('click', () => sEingeben(b.dataset.zeichen)));
    document.querySelector('#s-pad [data-tat="loeschen"]').addEventListener('click', () => { zkLoeschen(sAufgabe); sSpielZeichnen(); });
    document.querySelector('#s-pad [data-tat="links"]').addEventListener('click', () => { zkBewegen(sAufgabe, -1); sSpielZeichnen(); });
    document.querySelector('#s-pad [data-tat="rechts"]').addEventListener('click', () => { zkBewegen(sAufgabe, 1); sSpielZeichnen(); });
    $('s-noten').addEventListener('click', e => {
        const z = e.target.closest('[data-feld]');
        if (z && zkWaehlen(sAufgabe, Number(z.dataset.feld))) sSpielZeichnen();
    });
    $('s-dk-pruefen').addEventListener('click', sDkPruefen);
    $('s-pruefen').addEventListener('click', sPruefen);
    $('s-dk-zurueck').addEventListener('click', () => { if (sDk && !sDk.fertig) sDk.editor.zurueck(); });
    $('s-dk-leeren').addEventListener('click', () => { if (sDk && !sDk.fertig) sDk.editor.leeren(); });
    document.addEventListener('keydown', e => {
        if (sStand.phase !== 'runde' || sStand.art === 'diktat' || !sAufgabe || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
        const k = e.key;
        let ok = true;
        if (/^[1-9]$/.test(k) && Number(k) <= taktPulse(sAufgabe.stueck.zeichen)) sEingeben(k);
        else if (k === 'e' || k === 'E') sEingeben('e');
        else if (k === '+' || k === 'u' || k === 'U') sEingeben('+');
        else if (k === 'Backspace' || k === 'Delete') { zkLoeschen(sAufgabe); sSpielZeichnen(); }
        else if (k === 'ArrowLeft') { zkBewegen(sAufgabe, -1); sSpielZeichnen(); }
        else if (k === 'ArrowRight') { zkBewegen(sAufgabe, 1); sSpielZeichnen(); }
        else if (k === 'Enter' && sAufgabe.stufe > 1) sPruefen();
        else ok = false;
        if (ok) e.preventDefault();
    });
    let warten = null;
    window.addEventListener('resize', () => { clearTimeout(warten); warten = setTimeout(() => { if (sDabei) sZeichnen(); }, 200); });
    // Schon in diesem Raum dabei (Neuladen)? Dann direkt weiter.
    if (sCode && lesen('zk-raum', null) === sCode && lesen('zk-name', '')) {
        get(ref(db, pfad(sCode, `spieler/${geraet}`))).then(s => {
            if (s.exists()) { sDabei = true; sAbonnieren(); } else sBeitrittZeigen();
        }).catch(() => sBeitrittZeigen());
    } else sBeitrittZeigen();
}

/* ---------- Start ---------- */
if (new URLSearchParams(location.search).has('raum')) schuelerAufbauen();
else lehrerAufbauen();
