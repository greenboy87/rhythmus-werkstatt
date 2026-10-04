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
}

document.addEventListener('DOMContentLoaded', init);
