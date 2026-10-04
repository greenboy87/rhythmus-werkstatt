/* ============================================================
   APP: verdrahtet Editor, Anzeige und Metronom mit der Seite.
   ============================================================ */

/* ---------- Theme ---------- */
(function () {
    const gespeichert = localStorage.getItem('rw-theme');
    const hell = gespeichert ? gespeichert === 'light' : window.matchMedia('(prefers-color-scheme: light)').matches;
    if (hell) document.documentElement.setAttribute('data-theme', 'light');
})();
function themeUmschalten() {
    const hell = document.documentElement.getAttribute('data-theme') === 'light';
    if (hell) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('rw-theme', hell ? 'dark' : 'light');
}

/* Zeigt im Fuss, von wann die geladene Fassung ist (document.lastModified -
   das Datum, das der Server fuer index.html meldet). Stimmen die Angaben auf
   zwei Geraeten nicht ueberein, laeuft eines noch im Cache - dasselbe Muster
   wie in musik-quiz, wo genau das zweimal einen vermeintlichen Audio-Bug vom
   echten unterschieden hat. */
function zeigeStand() {
    const el = document.getElementById('build-stamp');
    if (!el) return;
    const d = new Date(document.lastModified);
    let text = 'Version ' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?');
    if (!isNaN(d.getTime())) {
        text += ' · Stand: ' + d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
              + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
    el.textContent = text;
}

/* ---------- Toast ---------- */
function zeigeToast(text, art) {
    const bereich = document.getElementById('toast-bereich');
    if (!bereich) return;
    const el = document.createElement('div');
    el.className = 'toast' + (art ? ' ' + art : '');
    el.textContent = text;
    bereich.appendChild(el);
    setTimeout(() => el.remove(), 3200);
}

/* ---------- Aufbau ---------- */
let editor = null;
let anzeigeVerdeckt = false;

function anzeigeNeuZeichnen() {
    const host = document.getElementById('anzeige');
    const stueck = editor.stueck();
    const optionen = {
        notenlinien: document.getElementById('opt-notenlinien').checked,
        zaehlzeiten: document.getElementById('opt-zaehlzeiten').checked,
        wiederholung: document.getElementById('opt-wiederholung').checked,
        breite: Math.max(320, host.clientWidth || 900)
    };
    host.innerHTML = stueckAnzeigeHtml(stueck, optionen);
    document.getElementById('anzeige-karte').classList.toggle('anzeige-verdeckt', anzeigeVerdeckt);
}

/* ---------- Uebungsgenerator ---------- */
const genAusgewaehlt = new Set();
let genAnzahlTakte = 4;

function genTakteZeichnen() {
    document.getElementById('gen-takte-anzeige').textContent = genAnzahlTakte;
}

function generatorAufbauen() {
    const ziel = document.getElementById('gen-palette');
    ziel.innerHTML = '';
    RHYTHMUS_BAUSTEINE.forEach(b => {
        const knopf = document.createElement('button');
        knopf.type = 'button';
        knopf.className = 'gen-baustein';
        knopf.title = b.wort;
        knopf.innerHTML = bausteinSvg(b);
        knopf.addEventListener('click', () => {
            if (genAusgewaehlt.has(b.code)) genAusgewaehlt.delete(b.code);
            else genAusgewaehlt.add(b.code);
            knopf.classList.toggle('an', genAusgewaehlt.has(b.code));
        });
        ziel.appendChild(knopf);
    });
    genTakteZeichnen();

    document.getElementById('gen-takte-minus').addEventListener('click', () => {
        genAnzahlTakte = Math.max(1, genAnzahlTakte - 1);
        genTakteZeichnen();
    });
    document.getElementById('gen-takte-plus').addEventListener('click', () => {
        genAnzahlTakte = Math.min(16, genAnzahlTakte + 1);
        genTakteZeichnen();
    });
    document.getElementById('gen-erzeugen-btn').addEventListener('click', () => {
        const ergebnis = uebungErzeugen([...genAusgewaehlt], genAnzahlTakte, editor.zeichen());
        if (ergebnis.fehler) { zeigeToast(ergebnis.fehler, 'danger'); return; }
        editor.setzen(editor.zeichen(), ergebnis.takte);
        zeigeToast(`Übung erzeugt: ${genAnzahlTakte} ${genAnzahlTakte === 1 ? 'Takt' : 'Takte'}.`, 'success');
    });
}

function init() {
    document.getElementById('theme-knopf').addEventListener('click', themeUmschalten);

    const taktartWahl = document.getElementById('taktart-wahl');
    TAKTARTEN.forEach(z => {
        const o = document.createElement('option');
        o.value = z; o.textContent = z + '-Takt';
        taktartWahl.appendChild(o);
    });
    taktartWahl.value = '4/4';

    editor = rhythmusEditor(document.getElementById('editor-takte'), document.getElementById('palette'), '4/4');
    editor.aufAenderung(anzeigeNeuZeichnen);

    taktartWahl.addEventListener('change', () => editor.taktartSetzen(taktartWahl.value));
    document.getElementById('takt-hinzufuegen-btn').addEventListener('click', () => editor.taktHinzufuegen());
    document.getElementById('zurueck-btn').addEventListener('click', () => editor.zurueck());
    document.getElementById('leeren-btn').addEventListener('click', () => editor.leeren());

    ['opt-notenlinien', 'opt-zaehlzeiten', 'opt-wiederholung'].forEach(id =>
        document.getElementById(id).addEventListener('change', anzeigeNeuZeichnen));

    document.getElementById('verdecken-btn').addEventListener('click', (e) => {
        anzeigeVerdeckt = !anzeigeVerdeckt;
        e.currentTarget.innerHTML = anzeigeVerdeckt
            ? '<i class="fa-solid fa-eye"></i> Zeigen'
            : '<i class="fa-solid fa-eye-slash"></i> Verdecken';
        anzeigeNeuZeichnen();
    });

    document.getElementById('drucken-btn').addEventListener('click', () => window.print());

    generatorAufbauen();

    Metronom.bauen(document.getElementById('metronom'), () => editor.zeichen());

    document.getElementById('vorklatschen-btn').addEventListener('click', () => {
        Vorklatschen.starten(editor.stueck(), document.getElementById('anzeige'), false);
    });
    document.getElementById('mitklatschen-btn').addEventListener('click', () => {
        Vorklatschen.starten(editor.stueck(), document.getElementById('anzeige'), true);
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(anzeigeNeuZeichnen, 150);
    });

    anzeigeNeuZeichnen();
    zeigeStand();
}

document.addEventListener('DOMContentLoaded', init);
