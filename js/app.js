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
let anzeigeSkalierung = 1;
let wiederholungen = 1;      // zusaetzliche Durchgaenge, nicht die Gesamtzahl (Anzeige = +1)
let takteProZeile = 0;       // 0 = automatisch; gilt fuer Bildschirm/Vollbild UND Druck gleichermassen

function anzeigeOptionen() {
    return {
        notenlinien: document.getElementById('opt-notenlinien').checked,
        zaehlzeiten: document.getElementById('opt-zaehlzeiten').checked,
        undAlsPlus: document.getElementById('opt-und-als-plus').checked,
        wiederholung: document.getElementById('opt-wiederholung').checked,
        wiederholungen: wiederholungen,
        takteProZeile: takteProZeile
    };
}

function anzeigeNeuZeichnen() {
    const host = document.getElementById('anzeige');
    // Durch die Skalierung geteilt, nicht die rohe Fensterbreite: Sonst packt
    // die automatische Zeilenaufteilung schon beim Layout so viele Takte hinein,
    // wie der Platz hergibt - fuer eine Vergroesserung bliebe dann kein Raum
    // mehr, sie wuerde von max-width:100% sofort wieder zurueckgestutzt.
    const breite = Math.max(320, (host.clientWidth || 900) / anzeigeSkalierung);
    const optionen = Object.assign(anzeigeOptionen(), { breite, skalierung: anzeigeSkalierung });
    host.innerHTML = stueckAnzeigeHtml(editor.stueck(), optionen);
    document.getElementById('anzeige-karte').classList.toggle('anzeige-verdeckt', anzeigeVerdeckt);
    titelAktualisieren();
    druckNeuZeichnen();
}

/* Titel steht ueber den Noten - auf dem Bildschirm (auch im Vollbild fuers
   Beamer) ebenso wie auf dem Ausdruck, derselbe Text, dieselbe Eingabe. */
function titelAktualisieren() {
    const titel = document.getElementById('druck-titel').value.trim();
    const anzeigeH2 = document.getElementById('anzeige-titel');
    anzeigeH2.textContent = titel;
    anzeigeH2.classList.toggle('hidden', !titel);
    document.getElementById('druck-ueberschrift').textContent = titel ? titel : '🥁 Rhythmus-Werkstatt';
}

/* ---------- Druck: dieselben Einstellungen wie der Bildschirm (Groesse,
   Takte/Zeile, Titel) - ein einziger Satz Regler statt zwei verwirrend
   aehnlicher. Eigene Druck-Feinabstimmung folgt spaeter. ---------- */
function druckNeuZeichnen() {
    const optionen = Object.assign(anzeigeOptionen(), { skalierung: anzeigeSkalierung, breite: 2000 });
    document.getElementById('druck-anzeige').innerHTML = stueckAnzeigeHtml(editor.stueck(), optionen);
}

/* ---------- Uebungsgenerator ---------- */
const genAusgewaehlt = new Set();
let genAnzahlTakte = 4;

function genTakteZeichnen() {
    document.getElementById('gen-takte-anzeige').textContent = genAnzahlTakte;
}

/* Steht oben schon ein Rhythmus, wird aus "Übung erzeugen" (ersetzen)
   "Übung erweitern" (anhängen) - zwei Klicks auf leeres Blatt ergeben so
   z.B. 2x16 statt nur 16 Takte, ohne "Alles löschen" dazwischen. Erst ein
   echtes Löschen schaltet zurück auf "erzeugen". */
function editorIstLeer() {
    return editor.stueck().takte.every(t => t.bausteine.length === 0);
}
function genKnopfAktualisieren() {
    const knopf = document.getElementById('gen-erzeugen-btn');
    if (!knopf) return;
    const erweitern = !editorIstLeer();
    knopf.innerHTML = erweitern
        ? '<i class="fa-solid fa-plus"></i> Übung erweitern'
        : '<i class="fa-solid fa-dice"></i> Übung erzeugen';
    knopf.title = erweitern ? 'Hängt die neu gewürfelten Takte an die vorhandenen an' : '';
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
        if (editorIstLeer()) {
            editor.setzen(editor.zeichen(), ergebnis.takte);
            zeigeToast(`Übung erzeugt: ${genAnzahlTakte} ${genAnzahlTakte === 1 ? 'Takt' : 'Takte'}.`, 'success');
        } else {
            const bisherige = editor.stueck().takte;
            editor.setzen(editor.zeichen(), [...bisherige, ...ergebnis.takte]);
            zeigeToast(`Übung erweitert: +${genAnzahlTakte} - jetzt ${bisherige.length + genAnzahlTakte} Takte.`, 'success');
        }
    });
    genKnopfAktualisieren();
}

/* ---------- Blaetter speichern (nur in diesem Browser) ---------- */
const BLAETTER_SCHLUESSEL = 'rw-blaetter';

function blaetterLesen() {
    try { return JSON.parse(localStorage.getItem(BLAETTER_SCHLUESSEL) || '{}'); }
    catch (e) { return {}; }
}
function blaetterSchreiben(alle) { localStorage.setItem(BLAETTER_SCHLUESSEL, JSON.stringify(alle)); }

function blattAuswahlZeichnen(ausgewaehlterName) {
    const sel = document.getElementById('blatt-wahl');
    const namen = Object.keys(blaetterLesen()).sort((a, b) => a.localeCompare(b, 'de'));
    sel.innerHTML = '<option value="">Blatt laden…</option>' +
        namen.map(n => `<option value="${n.replace(/"/g, '&quot;')}">${n.replace(/</g, '&lt;')}</option>`).join('');
    if (ausgewaehlterName) sel.value = ausgewaehlterName;
}

/* Von zwei Stellen genutzt: dem "Speichern" oben bei Rhythmus eintragen
   (fragt nach einem Namen) und dem "Speichern" neben dem Titel-Feld beim
   Druck (nimmt den Titel direkt als Namen, ohne nachzufragen). */
function blattSpeichernAls(name) {
    if (!name) return;
    const alle = blaetterLesen();
    const ueberschreibt = Object.prototype.hasOwnProperty.call(alle, name);
    alle[name] = editor.stueck();
    blaetterSchreiben(alle);
    blattAuswahlZeichnen(name);
    zeigeToast(ueberschreibt ? `„${name}" überschrieben.` : `„${name}" gespeichert.`, 'success');
}

function blaetterAufbauen() {
    blattAuswahlZeichnen();

    document.getElementById('blatt-speichern-btn').addEventListener('click', () => {
        blattSpeichernAls(prompt('Name für dieses Blatt:'));
    });

    document.getElementById('druck-titel-speichern-btn').addEventListener('click', () => {
        const titel = document.getElementById('druck-titel').value.trim();
        if (!titel) { zeigeToast('Erst einen Titel eintragen.', 'danger'); return; }
        blattSpeichernAls(titel);
    });

    document.getElementById('blatt-wahl').addEventListener('change', (e) => {
        const name = e.target.value;
        if (!name) return;
        const blatt = blaetterLesen()[name];
        if (!blatt) return;
        document.getElementById('taktart-wahl').value = blatt.zeichen;
        editor.setzen(blatt.zeichen, blatt.takte);
        const titelFeld = document.getElementById('druck-titel');
        if (!titelFeld.value.trim()) { titelFeld.value = name; titelAktualisieren(); druckNeuZeichnen(); }
        zeigeToast(`„${name}" geladen.`, 'info');
    });

    document.getElementById('blatt-loeschen-btn').addEventListener('click', () => {
        const sel = document.getElementById('blatt-wahl');
        const name = sel.value;
        if (!name) { zeigeToast('Wähle erst ein gespeichertes Blatt aus.', 'danger'); return; }
        if (!confirm(`„${name}" wirklich löschen?`)) return;
        const alle = blaetterLesen();
        delete alle[name];
        blaetterSchreiben(alle);
        blattAuswahlZeichnen();
        zeigeToast(`„${name}" gelöscht.`, 'info');
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
    editor.aufAenderung(() => { anzeigeNeuZeichnen(); genKnopfAktualisieren(); });

    taktartWahl.addEventListener('change', () => editor.taktartSetzen(taktartWahl.value));
    document.getElementById('takt-hinzufuegen-btn').addEventListener('click', () => editor.taktHinzufuegen());
    document.getElementById('zurueck-btn').addEventListener('click', () => editor.zurueck());
    document.getElementById('leeren-btn').addEventListener('click', () => editor.leeren());
    document.getElementById('opt-auto-takt').addEventListener('change', (e) => editor.autoNeuerTaktSetzen(e.target.checked));
    blaetterAufbauen();

    document.getElementById('opt-notenlinien').addEventListener('change', anzeigeNeuZeichnen);
    document.getElementById('opt-zaehlzeiten').addEventListener('change', (e) => {
        document.getElementById('und-plus-feld').classList.toggle('hidden', !e.target.checked);
        anzeigeNeuZeichnen();
    });
    document.getElementById('opt-und-als-plus').addEventListener('change', anzeigeNeuZeichnen);

    // Anzeige/Bedienung zaehlen die Gesamtzahl der Durchgaenge (2,3,4...),
    // "wiederholungen" selbst bleibt intern die Zusatz-Zahl (1,2,3...) - die
    // Audio-Planung in Vorklatschen braucht genau diese Differenz von 1.
    const wiederholungenZeichnen = () => { document.getElementById('wiederholungen-anzeige').textContent = wiederholungen + 1; };
    document.getElementById('opt-wiederholung').addEventListener('change', (e) => {
        document.getElementById('wiederholungen-feld').classList.toggle('hidden', !e.target.checked);
        if (e.target.checked) { wiederholungen = 1; wiederholungenZeichnen(); }   // startet immer bei "2x"
        anzeigeNeuZeichnen();
    });
    document.getElementById('wiederholungen-minus').addEventListener('click', () => {
        wiederholungen = Math.max(1, wiederholungen - 1);
        wiederholungenZeichnen();
        anzeigeNeuZeichnen();
    });
    document.getElementById('wiederholungen-plus').addEventListener('click', () => {
        wiederholungen = Math.min(9, wiederholungen + 1);
        wiederholungenZeichnen();
        anzeigeNeuZeichnen();
    });

    // Takte/Zeile veraendert den Zeilenumbruch grundlegend (Anzahl und Hoehe
    // der Zeilen) - ein sofortiger Sprung waere mitten im Unterricht, mit der
    // Klasse vor dem Beamer, verwirrend. Deshalb mit kurzer Verzoegerung.
    let takteProZeileTimer = null;
    const takteProZeileVerzoegert = () => {
        clearTimeout(takteProZeileTimer);
        takteProZeileTimer = setTimeout(anzeigeNeuZeichnen, 1500);
    };
    const takteProZeileZeichnen = () => {
        document.getElementById('takte-zeile-anzeige').textContent = takteProZeile === 0 ? 'auto' : takteProZeile;
    };
    document.getElementById('takte-zeile-minus').addEventListener('click', () => {
        takteProZeile = Math.max(0, takteProZeile - 1);
        takteProZeileZeichnen();
        takteProZeileVerzoegert();
    });
    document.getElementById('takte-zeile-plus').addEventListener('click', () => {
        takteProZeile = Math.min(8, takteProZeile + 1);
        takteProZeileZeichnen();
        takteProZeileVerzoegert();
    });

    document.getElementById('anzeige-groesse-minus').addEventListener('click', () => {
        anzeigeSkalierung = Math.max(0.6, Math.round((anzeigeSkalierung - 0.1) * 10) / 10);
        document.getElementById('anzeige-groesse-anzeige').textContent = Math.round(anzeigeSkalierung * 100) + '%';
        anzeigeNeuZeichnen();
    });
    document.getElementById('anzeige-groesse-plus').addEventListener('click', () => {
        anzeigeSkalierung = Math.min(3.0, Math.round((anzeigeSkalierung + 0.1) * 10) / 10);
        document.getElementById('anzeige-groesse-anzeige').textContent = Math.round(anzeigeSkalierung * 100) + '%';
        anzeigeNeuZeichnen();
    });

    document.getElementById('verdecken-btn').addEventListener('click', (e) => {
        anzeigeVerdeckt = !anzeigeVerdeckt;
        e.currentTarget.innerHTML = anzeigeVerdeckt
            ? '<i class="fa-solid fa-eye"></i> Zeigen'
            : '<i class="fa-solid fa-eye-slash"></i> Verdecken';
        anzeigeNeuZeichnen();
    });

    document.getElementById('drucken-btn').addEventListener('click', () => window.print());

    document.getElementById('druck-titel').addEventListener('input', () => { titelAktualisieren(); druckNeuZeichnen(); });

    const vollbildKarte = document.getElementById('anzeige-karte');
    const vollbildBtn = document.getElementById('vollbild-btn');
    vollbildBtn.addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else vollbildKarte.requestFullscreen().catch(() => zeigeToast('Vollbild wird von diesem Browser nicht unterstützt.', 'danger'));
    });
    document.addEventListener('fullscreenchange', () => {
        const an = document.fullscreenElement === vollbildKarte;
        vollbildKarte.classList.toggle('vollbild', an);
        vollbildBtn.innerHTML = an
            ? '<i class="fa-solid fa-compress"></i> Verlassen'
            : '<i class="fa-solid fa-expand"></i> Vollbild';
        // Die verfuegbare Breite aendert sich stark - Systeme neu aufteilen.
        setTimeout(anzeigeNeuZeichnen, 50);
    });

    generatorAufbauen();

    Metronom.bauen(document.getElementById('metronom'), () => editor.zeichen());

    document.getElementById('abspielen-btn').addEventListener('click', () => {
        const nurMetronom = document.getElementById('abspielen-modus').value === 'selbstklatschen';
        const extraDurchgaenge = document.getElementById('opt-wiederholung').checked ? wiederholungen : 0;
        Vorklatschen.starten(editor.stueck(), document.getElementById('anzeige'), nurMetronom, extraDurchgaenge);
    });
    Vorklatschen.aufZustandAendern((laeuft) => {
        document.getElementById('abspielen-btn').innerHTML = laeuft
            ? '<i class="fa-solid fa-stop"></i> Stopp'
            : '<i class="fa-solid fa-play"></i> Abspielen';
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(anzeigeNeuZeichnen, 150);
    });

    window.addEventListener('beforeprint', druckNeuZeichnen);

    anzeigeNeuZeichnen();
    zeigeStand();
}

document.addEventListener('DOMContentLoaded', init);
