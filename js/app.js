/* ============================================================
   APP: verdrahtet Editor, Anzeige und Metronom mit der Seite.
   ============================================================ */

/* ---------- Ansicht ----------
   ?ansicht=uebung  schlanke Übungsansicht zum Einbetten (z.B. in Beat Vault)
   ?ansicht=zaehlen nur das Zaehl-Training (fuer die Minispiele-Seite),
                    ohne Kopfzeile und Reiter, meldet eingebettet seine Hoehe
   ?ansicht=diktat  dasselbe fuer das Rhythmus-Diktat (Minispiele, Ordner diktat/)
   ?ansicht=spiele  beide Spiele (Zaehlzeiten und Rhythmus-Diktat) mit der
                    Wahl dazwischen, dunkel, fuer Beat Vault; meldet Hoehe
                    und jedes Antippen ({typ:'rw-aktiv'}, fuer die Uebezeit)
   &runden=N        Aufgaben je Runde in beiden Spielen (sonst 5)
   ?ansicht=pdf     baut nur das PDF und schickt es per postMessage an die
                    einbettende Seite ({typ:'rw-pdf', pdf: ArrayBuffer, name})
   Steht im Suchteil, nicht im Hash - so bleibt das Link-Format unberuehrt. */
const ANSICHT = new URLSearchParams(location.search).get('ansicht') || '';
const EINGEBETTET = window.parent !== window;
if (ANSICHT === 'uebung' || ANSICHT === 'pdf') document.documentElement.classList.add('ansicht-uebung');
// ?ansicht=diktat nutzt dieselben Regeln wie ?ansicht=zaehlen (ohne Kopfzeile, ohne Spielwahl)
if (ANSICHT === 'zaehlen' || ANSICHT === 'diktat') document.documentElement.classList.add('ansicht-zaehlen');
if (ANSICHT === 'spiele') document.documentElement.classList.add('ansicht-spiele');

/* ---------- Theme ---------- */
(function () {
    // Eingebettet immer dunkel - passt zu Beat Vault, egal was das Geraet eingestellt hat
    if (ANSICHT === 'uebung' || ANSICHT === 'spiele') return;
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
let rhythmusVerlauf = null;   // Strg+Z im Rhythmus-Reiter (verlaufAnlegen)
let anzeigeVerdeckt = false;
let anzeigeSkalierung = 1;
let wiederholungen = 1;      // zusaetzliche Durchgaenge, nicht die Gesamtzahl (Anzeige = +1)
let takteProZeile = 0;       // 0 = automatisch; gilt fuer Bildschirm/Vollbild UND Druck gleichermassen
let loopAuswahl = null;      // {von, bis} Taktnummern (einschliesslich) - nur dieser Teil wird abgespielt
let startpunkt = null;       // {takt, ab} - ab hier wird abgespielt (ab = Viertel im Takt)
let antippModus = 'akzent';  // 'akzent' | 'start': was Antippen einer Note im Notenbild macht

function anzeigeOptionen() {
    return {
        notenlinien: document.getElementById('opt-notenlinien').checked,
        zaehlzeiten: document.getElementById('opt-zaehlzeiten').checked,
        undAlsPlus: document.getElementById('opt-und-als-plus').checked,
        handsatz: document.getElementById('opt-handsatz').checked,
        wiederholung: document.getElementById('opt-wiederholung').checked,
        wiederholungen: wiederholungen,
        alsUebung: document.getElementById('opt-als-uebung').checked,
        takteProZeile: takteProZeile
    };
}

/* Beide Takte/Zeile-Regler beschriften; der Editor bricht sofort mit um
   (dort stoert kein Sprung), die Anzeige zeichnet der Aufrufer neu. */
function takteProZeileAnzeigen() {
    document.querySelectorAll('.takte-zeile-anzeige').forEach(el => {
        el.textContent = takteProZeile === 0 ? 'auto' : takteProZeile;
    });
    document.querySelectorAll('.takte-zeile-regler').forEach(el => { el.value = takteProZeile; });
    if (editor) editor.takteProZeileSetzen(takteProZeile);
}

/* Regler und Umschalter der Leiste auf den aktuellen Stand bringen - die
   Werte selbst stehen in anzeigeSkalierung, wiederholungen, opt-wiederholung
   und abspielen-modus (auch Link und Blatt-Laden setzen nur die). */
function leisteAnzeigen() {
    const durchgaenge = document.getElementById('opt-wiederholung').checked ? wiederholungen + 1 : 1;
    document.getElementById('wiederholung-regler').value = durchgaenge;
    document.getElementById('wiederholung-wert').textContent = durchgaenge + '×';
    document.getElementById('groesse-regler').value = Math.round(anzeigeSkalierung * 100);
    document.getElementById('anzeige-groesse-anzeige').textContent = Math.round(anzeigeSkalierung * 100) + '%';
    const modus = document.getElementById('abspielen-modus').value;
    document.querySelectorAll('[data-modus]').forEach(b => b.classList.toggle('an', b.dataset.modus === modus));
    const klang = document.getElementById('klatsch-sound-wahl').value;
    document.querySelectorAll('[data-klang]').forEach(b => b.classList.toggle('an', b.dataset.klang === klang));
}

function anzeigeNeuZeichnen() {
    leisteAnzeigen();
    const host = document.getElementById('anzeige');
    // Durch die Skalierung geteilt, nicht die rohe Fensterbreite: Sonst packt
    // die automatische Zeilenaufteilung schon beim Layout so viele Takte hinein,
    // wie der Platz hergibt - fuer eine Vergroesserung bliebe dann kein Raum
    // mehr, sie wuerde von max-width:100% sofort wieder zurueckgestutzt.
    const breite = Math.max(320, (host.clientWidth || 900) / anzeigeSkalierung);
    // Passt die Auswahl nicht mehr zum Stueck (Takte geloescht), faellt sie weg.
    if (loopAuswahl && loopAuswahl.bis >= editor.stueck().takte.length) loopAuswahl = null;
    if (startpunkt && startpunktTakt() === null) startpunkt = null;
    const optionen = Object.assign(anzeigeOptionen(), { breite, skalierung: anzeigeSkalierung, auswahl: loopAuswahl, startpunkt });
    host.innerHTML = stueckAnzeigeHtml(editor.stueck(), optionen);
    loopAuswahlAnzeigen();
    startpunktAnzeigen();
    document.getElementById('anzeige-karte').classList.toggle('anzeige-verdeckt', anzeigeVerdeckt);
    titelAktualisieren();
    druckNeuZeichnen();
}

/* ---------- Loop-Bereich: einzelne Takte oder eine ganze Uebung ----------
   Takt antippen: ohne Auswahl wird er allein gewaehlt, ausserhalb einer
   Auswahl erweitert er den Bereich bis zu ihm, innerhalb hebt er sie auf.
   Die Nummer einer Uebung ("4.") waehlt deren ganze Zeile (nochmal = aus).
   Mit Auswahl spielt "Abspielen" nur diesen Teil - und der Loop geht an. */
function loopAuswahlSetzen(neu) {
    loopAuswahl = neu;
    if (neu) document.getElementById('opt-loop').checked = true;
    anzeigeNeuZeichnen();
}
function anzeigeAngetippt(e) {
    // Note antippen = Akzent an/aus (Flaechen der Noten liegen ueber denen der Takte)
    const note = e.target.closest('.noten-feld');
    if (note && antippModus === 'start') {
        const t = Number(note.dataset.takt), b = Number(note.dataset.baustein), teilNr = Number(note.dataset.teil);
        const bausteine = editor.stueck().takte[t].bausteine;
        let ab = 0;
        for (let i = 0; i < b; i++) ab += bausteine[i].dauer;
        for (let i = 0; i < teilNr; i++) ab += bausteine[b].teile[i].d;
        startpunktUmschalten({ takt: t, ab });
        return;
    }
    if (note) {
        editor.akzentUmschalten(Number(note.dataset.takt), Number(note.dataset.baustein), Number(note.dataset.teil));
        return;
    }
    const nr = e.target.closest('.uebung-nr');
    if (nr) {
        const von = Number(nr.dataset.von), bis = Number(nr.dataset.bis);
        const gleich = loopAuswahl && loopAuswahl.von === von && loopAuswahl.bis === bis;
        loopAuswahlSetzen(gleich ? null : { von, bis });
        return;
    }
    const feld = e.target.closest('.takt-feld');
    if (!feld) return;
    const i = Number(feld.dataset.takt);
    if (antippModus === 'start') { startpunktUmschalten({ takt: i, ab: 0 }); return; }
    if (!loopAuswahl) loopAuswahlSetzen({ von: i, bis: i });
    else if (i >= loopAuswahl.von && i <= loopAuswahl.bis) loopAuswahlSetzen(null);
    else loopAuswahlSetzen({ von: Math.min(i, loopAuswahl.von), bis: Math.max(i, loopAuswahl.bis) });
}
function loopAuswahlAnzeigen() {
    const info = document.getElementById('loop-auswahl-info');
    info.classList.toggle('hidden', !loopAuswahl);
    document.getElementById('loop-tipp').classList.toggle('hidden', !!loopAuswahl);
    if (!loopAuswahl) return;
    const { von, bis } = loopAuswahl;
    // Ist es genau eine Uebung, heisst sie auch so
    const nr = [...document.querySelectorAll('#anzeige .uebung-nr')]
        .find(n => Number(n.dataset.von) === von && Number(n.dataset.bis) === bis);
    document.getElementById('loop-auswahl-text').textContent = nr
        ? `Übung ${nr.textContent.replace('.', '')}`
        : (von === bis ? `Takt ${von + 1}` : `Takt ${von + 1}–${bis + 1}`);
}

/* ---------- Startpunkt: ab hier abspielen ----------
   Nur im Antipp-Modus "Startpunkt": Note antippen = ab dieser Note,
   neben die Noten = ab Taktanfang, dieselbe Stelle nochmal = von vorn.
   Vor der Note laeuft im ersten Takt nur der Puls weiter (der Takt bleibt
   hoerbar), auch jeder Loop beginnt wieder hier. Ein Loop-Bereich hat
   Vorrang. Nicht im Link gespeichert. */
function startpunktSetzen(neu) {
    startpunkt = neu;
    anzeigeNeuZeichnen();
}
function startpunktUmschalten(neu) {
    const gleich = startpunkt && startpunkt.takt === neu.takt && Math.abs(startpunkt.ab - neu.ab) < 1e-6;
    startpunktSetzen(gleich ? null : neu);
}
// Takt des Startpunkts, oder null, wenn er nicht mehr ins Stueck passt
function startpunktTakt() {
    const takt = startpunkt && editor.stueck().takte[startpunkt.takt];
    if (!takt) return null;
    const lang = takt.bausteine.reduce((s, b) => s + b.dauer, 0);
    return startpunkt.ab < lang - 1e-6 || startpunkt.ab === 0 ? startpunkt.takt : null;
}
function startpunktAnzeigen() {
    document.getElementById('startpunkt-info').classList.toggle('hidden', !startpunkt);
    if (!startpunkt) return;
    // Zaehlzeit wie ueber den Noten: "3", "2 und", "1 e" - neben dem Raster nur der Takt
    const pw = pulsWert(editor.zeichen());
    const puls = Math.floor((startpunkt.ab + 1e-6) / pw);
    const raster = (startpunkt.ab - puls * pw) / 0.25;
    const stufe = Math.round(raster);
    const silbe = Math.abs(raster - stufe) < 0.02 && stufe < 4 ? (stufe === 0 ? String(puls + 1) : `${puls + 1} ${['', 'e', 'und', 'e'][stufe]}`) : '';
    document.getElementById('startpunkt-text').textContent =
        `Start: Takt ${startpunkt.takt + 1}` + (silbe ? ` auf „${silbe}“` : '');
}
/* Zeilenaufteilung ("Als Uebung") ab einem Takt: vordere Zeilen fallen weg,
   die angebrochene zaehlt nur noch ihre restlichen Takte. */
function zeilenAb(zeilen, takt) {
    if (!zeilen) return null;
    const rest = [];
    let von = 0;
    zeilen.forEach(n => { if (von + n > takt) rest.push(von + n - Math.max(von, takt)); von += n; });
    return rest;
}
function antippModusSetzen(modus) {
    antippModus = modus;
    document.querySelectorAll('[data-antippen]').forEach(b => b.classList.toggle('an', b.dataset.antippen === modus));
    document.getElementById('anzeige').classList.toggle('antipp-modus-start', modus === 'start');
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

/* ---------- Druck: dieselben Schalter wie der Bildschirm (Takte/Zeile,
   Linien, Zaehlzeiten, Titel, Groesse). Die Groesse wirkt auch auf dem
   Papier, aber nur so weit, wie es passt: Gezeichnet wird fuer die A4-Breite
   (im auto-Modus brechen groessere Noten also frueher um), danach wird so
   weit verkleinert, dass jede Zeile in die Breite und alle Zeilen zusammen
   auf eine Seite passen. Ab da bringt "groesser" auf dem Papier nichts mehr. ---------- */
const DRUCK_BREITE = 670;    // A4 (210 mm) minus 2 × 16 mm Rand, in CSS-px
const DRUCK_HOEHE = 900;     // 297 mm minus Raender, Kopfzeile und Luft
const DRUCK_ZEILENABSTAND = 22;
function druckNeuZeichnen() {
    const optionen = Object.assign(anzeigeOptionen(), {
        skalierung: anzeigeSkalierung, breite: Math.max(200, DRUCK_BREITE / anzeigeSkalierung)
    });
    const host = document.getElementById('druck-anzeige');
    host.innerHTML = stueckAnzeigeHtml(editor.stueck(), optionen);
    const svgs = [...host.querySelectorAll('.anzeige-system')];
    if (!svgs.length) return;
    const masse = svgs.map(s => {
        // Inline-Groesse = schon mit dem Groesse-Regler skaliert.
        const b = parseFloat(s.style.width) || 1, h = parseFloat(s.style.height) || 1;
        const f = Math.min(1, DRUCK_BREITE / b);
        return { b: b * f, h: h * f };
    });
    // Die Abstaende zwischen den Zeilen bleiben fest (CSS), nur die Noten
    // selbst werden kleiner - also nur die Resthoehe auf die Zeilen verteilen.
    const notenHoehe = masse.reduce((sum, m) => sum + m.h, 0);
    const platz = Math.max(DRUCK_HOEHE * 0.3, DRUCK_HOEHE - svgs.length * DRUCK_ZEILENABSTAND);
    const g = Math.min(1, platz / notenHoehe);
    svgs.forEach((s, i) => {
        s.style.width = Math.floor(masse[i].b * g) + 'px';
        s.style.height = Math.floor(masse[i].h * g) + 'px';
    });
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
    // Mit allen Einstellungen (Als Uebung, Takte/Zeile, Groesse, Tempo ...)
    // im selben Format wie ein Link - Laden stellt so genau diesen Stand her.
    alle[name] = Object.assign(editor.stueck(), { einstellungen: linkBauen(linkStand()) });
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
        if (blatt.einstellungen) {
            linkUebernehmen(blatt.einstellungen);
        } else {
            // Aeltere Blaetter (vor dem Mitspeichern): nur der Rhythmus,
            // die Einstellungen bleiben, wie sie gerade sind.
            document.getElementById('taktart-wahl').value = blatt.zeichen;
            editor.setzen(blatt.zeichen, blatt.takte);
        }
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

/* ---------- Gemeinsamer Stand fuer Link und Audio-Export ---------- */

/* Die aktuellen Abspiel-Einstellungen - Standardwerte fuer rhythmusAudio. */
function seitenEinstellungen() {
    return {
        bpm: Metronom.bpm(),
        vorlaufTakte: Metronom.vorlaufTakte(),
        durchgaenge: document.getElementById('opt-wiederholung').checked ? wiederholungen + 1 : 1,
        klang: document.getElementById('klatsch-sound-wahl').value,
        metronom: Metronom.lautstaerke(),
        nurMetronom: document.getElementById('abspielen-modus').value === 'selbstklatschen',
        zeilen: uebungsZeilen()
    };
}

/* "Als Uebung" + Wiederholung: jede Zeile wird fuer sich wiederholt. Die
   Zeilenaufteilung kommt aus dem gerade gezeichneten Notenbild (data-takte
   je Zeile) - im "auto"-Modus haengt sie von der Breite ab, so klingt es
   immer genau so, wie es dasteht. Sonst null = ganzes Stueck am Stueck. */
function uebungsZeilen() {
    if (!document.getElementById('opt-als-uebung').checked) return null;
    if (!document.getElementById('opt-wiederholung').checked) return null;
    const zeilen = [...document.querySelectorAll('#anzeige .anzeige-system')].map(s => Number(s.dataset.takte) || 0);
    return zeilen.length ? zeilen : null;
}

/* Der komplette Stand als Objekt im Format von linkLesen/linkBauen. */
function linkStand() {
    const opt = anzeigeOptionen();
    const stueck = editor.stueck();
    return {
        zeichen: stueck.zeichen,
        takte: stueck.takte.map(t => t.bausteine.map(bausteinKuerzel)),
        titel: document.getElementById('druck-titel').value.trim(),
        bpm: Metronom.bpm(),
        klang: document.getElementById('klatsch-sound-wahl').value,
        vorlauf: Metronom.vorlaufTakte(),
        metronom: Math.round(Metronom.lautstaerke() * 100),
        notenlinien: opt.notenlinien,
        zaehlzeiten: opt.zaehlzeiten,
        undAlsPlus: opt.undAlsPlus,
        handsatz: opt.handsatz,
        loop: document.getElementById('opt-loop').checked,
        durchgaenge: opt.wiederholung ? wiederholungen + 1 : 1,
        alsUebung: opt.alsUebung,
        takteProZeile: opt.takteProZeile,
        groesse: Math.round(anzeigeSkalierung * 100)
    };
}

/* Uebernimmt einen Rhythmus-Link (#t=...&r=...) in Editor und Einstellungen.
   Gespeicherte Blaetter im localStorage bleiben dabei unberuehrt. */
function linkUebernehmen(hash) {
    const x = linkLesen(hash);
    if (!x) return false;
    document.getElementById('taktart-wahl').value = x.zeichen;
    document.getElementById('druck-titel').value = x.titel;
    Metronom.tempoSetzen(x.bpm);
    Metronom.vorlaufSetzen(x.vorlauf);
    Metronom.lautstaerkeSetzen(x.metronom / 100);
    const klangWahl = document.getElementById('klatsch-sound-wahl');
    klangWahl.value = x.klang;
    klatschSoundSetzen(x.klang);

    document.getElementById('opt-notenlinien').checked = x.notenlinien;
    document.getElementById('opt-zaehlzeiten').checked = x.zaehlzeiten;
    document.getElementById('und-plus-feld').classList.toggle('hidden', !x.zaehlzeiten);
    document.getElementById('opt-und-als-plus').checked = x.undAlsPlus;
    document.getElementById('opt-handsatz').checked = x.handsatz;
    document.getElementById('opt-loop').checked = x.loop;
    document.getElementById('opt-wiederholung').checked = x.durchgaenge > 1;
    wiederholungen = Math.max(1, x.durchgaenge - 1);
    document.getElementById('opt-als-uebung').checked = x.alsUebung;
    takteProZeile = x.takteProZeile;
    takteProZeileAnzeigen();
    anzeigeSkalierung = x.groesse / 100;

    // Setzt den Editor und zeichnet ueber aufAenderung alles neu (Anzeige,
    // Titel, Druck). Takte, die nicht aufgehen, kommen trotzdem hinein - der
    // Editor markiert sie ohnehin.
    editor.setzen(x.zeichen, x.takte.map(codes => ({ bausteine: codes.map(bausteinAusKuerzel).filter(Boolean) })));
    x.unbekannt.forEach(u => zeigeToast(`Unbekannter Baustein „${u.code}" in Takt ${u.takt} – übersprungen`, 'danger'));
    return true;
}

function linkKopieren() {
    urlKopieren(location.origin + location.pathname + '#' + linkBauen(linkStand()));
}

/* Text in die Zwischenablage, sonst zum Abschreiben anzeigen - auch fuer
   die Links der Beat- und Drumset-Werkstatt. */
function urlKopieren(url) {
    const fallback = () => {
        const feld = document.createElement('textarea');
        feld.value = url;
        feld.setAttribute('readonly', '');
        feld.style.position = 'fixed'; feld.style.top = '0'; feld.style.opacity = '0';
        document.body.appendChild(feld);
        feld.select(); feld.setSelectionRange(0, url.length);
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { /* gibt's nicht mehr */ }
        feld.remove();
        if (ok) zeigeToast('Link kopiert.', 'success');
        else prompt('Link zum Kopieren:', url);
    };
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(() => zeigeToast('Link kopiert.', 'success'), fallback);
    } else fallback();
}

/* Rueckgaengig/Wiederholen je Reiter (Rhythmus, Beat, Drumset). stand()
   liefert den Inhalt als Text (Noten, Takte, Taktart - nicht Tempo oder
   Titel), setzen(text) stellt ihn wieder her. Nach jeder Aenderung
   merken(); gleiche Staende hintereinander zaehlen nicht, deshalb loest
   das Wiederherstellen selbst keinen neuen Schritt aus. */
const VERLAUF_MAX = 100;
function verlaufAnlegen(stand, setzen) {
    const zurueck = [], vor = [];
    let jetzt = stand();
    return {
        merken() {
            const s = stand();
            if (s === jetzt) return;
            zurueck.push(jetzt);
            if (zurueck.length > VERLAUF_MAX) zurueck.shift();
            vor.length = 0;
            jetzt = s;
        },
        rueckgaengig() {
            if (!zurueck.length) { zeigeToast('Nichts mehr rückgängig zu machen.', 'info'); return; }
            vor.push(jetzt);
            jetzt = zurueck.pop();
            setzen(jetzt);
        },
        wiederholen() {
            if (!vor.length) { zeigeToast('Nichts zum Wiederholen.', 'info'); return; }
            zurueck.push(jetzt);
            jetzt = vor.pop();
            setzen(jetzt);
        }
    };
}
/* Strg+Z / ⌘Z rueckgaengig, Strg+Y / Strg+Shift+Z / ⌘⇧Z wiederholen.
   In Textfeldern bleibt das Rueckgaengig des Browsers. true = erledigt. */
function verlaufTaste(e, verlauf) {
    if (!verlauf || !(e.ctrlKey || e.metaKey) || e.altKey) return false;
    const ziel = e.target;
    if (ziel && (ziel.isContentEditable || /^(INPUT|TEXTAREA)$/.test(ziel.tagName) && !['checkbox', 'range', 'button'].includes(ziel.type))) return false;
    const taste = e.key.toLowerCase();
    if (taste === 'z' && !e.shiftKey) verlauf.rueckgaengig();
    else if ((taste === 'z' && e.shiftKey) || (taste === 'y' && !e.shiftKey)) verlauf.wiederholen();
    else return false;
    e.preventDefault();
    return true;
}

/* Uebung als HTML-Datei: Beim Oeffnen springt sie sofort in die
   Rhythmus-Werkstatt, mit genau diesem Stand (derselbe Link wie bei
   "Link kopieren"). Ohne Internet bleibt die Datei stehen und zeigt
   wenigstens Titel und Notenbild - deshalb steckt das auch mit drin. */
const WERKSTATT_URL = 'https://greenboy87.github.io/rhythmus-werkstatt/';
function htmlSpeichern() {
    const stueck = editor.stueck();
    if (stueck.takte.every(t => !t.bausteine.length)) { zeigeToast('Trage erst einen Rhythmus ein.', 'danger'); return; }
    // Lokal (localhost/Datei) zeigt der Link auf die oeffentliche Seite -
    // sonst funktioniert die Datei nur auf diesem einen Rechner.
    const basis = /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)
        ? location.origin + location.pathname : WERKSTATT_URL;
    const ziel = basis + '#' + linkBauen(linkStand());
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const titel = document.getElementById('druck-titel').value.trim() || 'Rhythmus';
    const noten = document.getElementById('druck-anzeige').innerHTML;
    const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(titel)} – Rhythmus-Werkstatt</title>
<script>if (navigator.onLine !== false) location.replace(${JSON.stringify(ziel)});<\/script>
<style>
body { font-family: system-ui, sans-serif; background: #fff; color: #111; margin: 2rem; text-align: center; }
a.knopf { display: inline-block; margin: 1rem 0 2rem; padding: .6rem 1rem; border-radius: 10px; background: #7c3aed; color: #fff; text-decoration: none; font-weight: 700; }
.anzeige-system { display: block; margin: 0 auto 22px; max-width: 100%; height: auto; color: #111; }
.anzeige-system .linien-fuenf { color: #666; }
</style>
</head>
<body>
<h1>${esc(titel)}</h1>
<a class="knopf" href="${esc(ziel)}">In der Rhythmus-Werkstatt öffnen</a>
<div>${noten}</div>
</body>
</html>
`;
    const name = exportDateiname(titel, stueck.zeichen, Metronom.bpm(), 'mp3').replace(/\.mp3$/, '.html');
    blobHerunterladen(new Blob([html], { type: 'text/html' }), name);
    zeigeToast('Gespeichert - Datei öffnen lädt die Übung direkt in die Werkstatt.', 'success');
}

async function audioHerunterladen(e) {
    const knopf = (e && e.currentTarget) || document.getElementById('herunterladen-btn');
    const stueck = editor.stueck();
    if (stueck.takte.every(t => !t.bausteine.length)) { zeigeToast('Trage erst einen Rhythmus ein.', 'danger'); return; }
    const format = knopf.dataset.format === 'wav' ? 'wav' : 'mp3';
    knopf.disabled = true;
    zeigeToast('Erzeuge Audio…', 'info');
    try {
        const blob = await rhythmusAudio(stueck, { format });
        blobHerunterladen(blob, exportDateiname(document.getElementById('druck-titel').value, stueck.zeichen, Metronom.bpm(), format));
    } catch (e) {
        zeigeToast('Audio konnte nicht erzeugt werden: ' + e.message, 'danger');
    } finally {
        knopf.disabled = false;
    }
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
    editor.aufAenderung(() => {
        anzeigeNeuZeichnen(); genKnopfAktualisieren();
        if (rhythmusVerlauf) rhythmusVerlauf.merken();
    });

    taktartWahl.addEventListener('change', () => editor.taktartSetzen(taktartWahl.value));
    document.getElementById('takt-hinzufuegen-btn').addEventListener('click', () => editor.taktHinzufuegen());
    document.getElementById('takt-loeschen-btn').addEventListener('click', () => editor.letztenTaktLoeschen());
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
    document.getElementById('opt-handsatz').addEventListener('change', anzeigeNeuZeichnen);
    document.getElementById('opt-als-uebung').addEventListener('change', anzeigeNeuZeichnen);

    // Ein Regler "Durchgaenge" (1 = keine Wiederholung) statt Schalter und
    // Zaehler. Intern bleibt es bei opt-wiederholung + wiederholungen (=
    // zusaetzliche Durchgaenge) - so brauchen Link, Export und Vorklatschen
    // nichts Neues.
    document.getElementById('wiederholung-regler').addEventListener('input', (e) => {
        const n = Number(e.target.value);
        document.getElementById('opt-wiederholung').checked = n > 1;
        wiederholungen = Math.max(1, n - 1);
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
    // Zwei Regler (Eingabe unten, Anzeige oben), ein Wert.
    document.querySelectorAll('.takte-zeile-minus').forEach(k => k.addEventListener('click', () => {
        takteProZeile = Math.max(0, takteProZeile - 1);
        takteProZeileAnzeigen();
        takteProZeileVerzoegert();
    }));
    document.querySelectorAll('.takte-zeile-plus').forEach(k => k.addEventListener('click', () => {
        takteProZeile = Math.min(8, takteProZeile + 1);
        takteProZeileAnzeigen();
        takteProZeileVerzoegert();
    }));
    document.querySelectorAll('.takte-zeile-regler').forEach(r => r.addEventListener('input', () => {
        takteProZeile = Number(r.value);
        takteProZeileAnzeigen();
        takteProZeileVerzoegert();
    }));

    document.getElementById('groesse-regler').addEventListener('input', (e) => {
        anzeigeSkalierung = Number(e.target.value) / 100;
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
    document.getElementById('anzeige').addEventListener('click', anzeigeAngetippt);
    document.getElementById('loop-auswahl-weg').addEventListener('click', () => loopAuswahlSetzen(null));
    document.getElementById('startpunkt-weg').addEventListener('click', () => startpunktSetzen(null));
    document.querySelectorAll('[data-antippen]').forEach(b => b.addEventListener('click', () => antippModusSetzen(b.dataset.antippen)));
    document.getElementById('pdf-btn').addEventListener('click', pdfHerunterladen);
    document.querySelectorAll('details.menue').forEach(m => {
        m.addEventListener('click', (e) => { if (e.target.closest('.menue-liste button')) m.open = false; });
        document.addEventListener('click', (e) => { if (!m.contains(e.target)) m.open = false; });
    });

    document.getElementById('druck-titel').addEventListener('input', () => { titelAktualisieren(); druckNeuZeichnen(); });

    const vollbildKarte = document.getElementById('anzeige-karte');
    const vollbildBtn = document.getElementById('vollbild-btn');
    vollbildBtn.addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else vollbildKarte.requestFullscreen().catch(() => zeigeToast('Vollbild wird von diesem Browser nicht unterstützt.', 'danger'));
    });
    // Hoehe des Bedien-Kopfs als CSS-Variable: Im Vollbild haelt #anzeige
    // oben (und symmetrisch unten) genau so viel Abstand - sonst schiebt
    // eine grosse Skalierung die Noten unter die Bedienelemente.
    const vollbildKopf = vollbildKarte.querySelector('.vollbild-kopf');
    const kopfHoeheMerken = () => vollbildKarte.style.setProperty('--kopf-hoehe', vollbildKopf.offsetHeight + 'px');
    if (window.ResizeObserver) new ResizeObserver(kopfHoeheMerken).observe(vollbildKopf);
    document.addEventListener('fullscreenchange', () => {
        const an = document.fullscreenElement === vollbildKarte;
        vollbildKarte.classList.toggle('vollbild', an);
        vollbildBtn.innerHTML = an
            ? '<i class="fa-solid fa-compress"></i> Verlassen'
            : '<i class="fa-solid fa-expand"></i> Vollbild';
        kopfHoeheMerken();
        // Die verfuegbare Breite aendert sich stark - Systeme neu aufteilen.
        setTimeout(anzeigeNeuZeichnen, 50);
    });

    generatorAufbauen();

    Metronom.bauen(document.getElementById('metronom'), () => editor.zeichen());

    document.getElementById('abspielen-btn').addEventListener('click', () => {
        const nurMetronom = document.getElementById('abspielen-modus').value === 'selbstklatschen';
        const extraDurchgaenge = document.getElementById('opt-wiederholung').checked ? wiederholungen : 0;
        const stueck = editor.stueck();
        const endlos = () => document.getElementById('opt-loop').checked;
        if (loopAuswahl) {
            // Nur der Loop-Bereich - als eigenes kleines Stueck, die Markierung
            // beim Mitlesen landet trotzdem an der richtigen Stelle.
            const teil = Object.assign({}, stueck, { takte: stueck.takte.slice(loopAuswahl.von, loopAuswahl.bis + 1) });
            Vorklatschen.starten(teil, document.getElementById('anzeige'), nurMetronom, extraDurchgaenge, null, endlos, loopAuswahl.von);
        } else if (startpunkt) {
            const teil = Object.assign({}, stueck, { takte: stueck.takte.slice(startpunkt.takt) });
            Vorklatschen.starten(teil, document.getElementById('anzeige'), nurMetronom, extraDurchgaenge,
                zeilenAb(uebungsZeilen(), startpunkt.takt), endlos, startpunkt.takt, startpunkt.ab);
        } else {
            Vorklatschen.starten(stueck, document.getElementById('anzeige'), nurMetronom, extraDurchgaenge, uebungsZeilen(), endlos);
        }
    });
    Vorklatschen.aufZustandAendern((laeuft) => {
        document.getElementById('abspielen-btn').innerHTML = laeuft
            ? '<i class="fa-solid fa-stop"></i> Stopp'
            : '<i class="fa-solid fa-play"></i> Abspielen';
    });

    document.querySelectorAll('[data-modus]').forEach(b => b.addEventListener('click', () => {
        document.getElementById('abspielen-modus').value = b.dataset.modus;
        leisteAnzeigen();
    }));

    // Klang wechseln = gleich einmal hoeren (statt eigenem Anhoeren-Knopf).
    // Die Knoepfe setzen die versteckte Auswahl - Link, Blatt und Export lesen weiter dort.
    const klangWahl = document.getElementById('klatsch-sound-wahl');
    document.querySelectorAll('[data-klang]').forEach(b => b.addEventListener('click', () => {
        klangWahl.value = b.dataset.klang;
        klatschSoundSetzen(klangWahl.value);
        leisteAnzeigen();
        const probe = () => { const ctx = tonBereit(probe); if (ctx) klatschSoundSpielen(ctx, ctx.currentTime + 0.05); };
        probe();
    }));
    document.addEventListener('keydown', rhythmusTaste);

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(anzeigeNeuZeichnen, 150);
    });

    window.addEventListener('beforeprint', druckNeuZeichnen);

    document.getElementById('link-kopieren-btn').addEventListener('click', linkKopieren);
    document.getElementById('html-speichern-btn').addEventListener('click', htmlSpeichern);
    document.getElementById('herunterladen-btn').addEventListener('click', audioHerunterladen);
    document.getElementById('herunterladen-wav-btn').addEventListener('click', audioHerunterladen);
    window.addEventListener('hashchange', () => linkUebernehmen(location.hash));

    if (!linkUebernehmen(location.hash)) anzeigeNeuZeichnen();
    rhythmusVerlauf = verlaufAnlegen(
        () => { const s = editor.stueck(); return JSON.stringify([s.zeichen, s.takte.map(t => t.bausteine.map(bausteinKuerzel))]); },
        (text) => {
            const [zeichen, takte] = JSON.parse(text);
            taktartWahl.value = zeichen;
            editor.setzen(zeichen, takte.map(codes => ({ bausteine: codes.map(bausteinAusKuerzel).filter(Boolean) })));
        });
    zeigeStand();
    if (EINGEBETTET) einbettungMelden();
}

/* ---------- Tastatur (nur im Rhythmus-Reiter, nicht in Textfeldern) ----------
   Leertaste Abspielen/Stopp, Pfeil hoch/runter Tempo (wirkt auch waehrend
   des Abspielens), Pfeil links/rechts waehlt den Takt davor/danach als
   Loop-Bereich, Esc hebt ihn auf. */
function rhythmusTaste(e) {
    const reiter = document.getElementById('reiter-rhythmus');
    if (!reiter || reiter.classList.contains('hidden')) return;
    if (verlaufTaste(e, rhythmusVerlauf)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const ziel = e.target;
    if (ziel && (ziel.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(ziel.tagName) && ziel.type !== 'checkbox' && ziel.type !== 'range')) return;
    const takte = editor.stueck().takte.length;
    let fertig = true;
    if (e.key === ' ') {
        // Sonst loest die Leertaste zusaetzlich den zuletzt angeklickten Knopf aus
        if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
        document.getElementById('abspielen-btn').click();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        Metronom.tempoSetzen(Metronom.bpm() + (e.key === 'ArrowUp' ? 5 : -5));
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && takte) {
        const r = e.key === 'ArrowRight' ? 1 : -1;
        const jetzt = loopAuswahl ? (r > 0 ? loopAuswahl.bis : loopAuswahl.von) : (r > 0 ? -1 : takte);
        const t = Math.max(0, Math.min(takte - 1, jetzt + r));
        loopAuswahlSetzen({ von: t, bis: t });
    } else if (e.key === 'Escape' && loopAuswahl) {
        loopAuswahlSetzen(null);
    } else if (e.key === 'Escape' && startpunkt) {
        startpunktSetzen(null);
    } else {
        fertig = false;
    }
    if (fertig) e.preventDefault();
}

/* Eingebettet: der einbettenden Seite die Hoehe melden (damit sie den
   Rahmen ohne Scrollbalken passend macht) bzw. das fertige PDF schicken. */
function einbettungMelden() {
    const an = (nachricht, transfer) => window.parent.postMessage(nachricht, '*', transfer);
    if (ANSICHT === 'pdf') {
        notenPdf()
            .then(blob => blob.arrayBuffer())
            .then(pdf => an({ typ: 'rw-pdf', pdf, name: pdfDateiname() }, [pdf]))
            .catch(e => an({ typ: 'rw-pdf', fehler: e.message }));
        return;
    }
    if (ANSICHT === 'spiele') {
        // Klicks im Rahmen erreichen die einbettende Seite nicht - sie soll trotzdem wissen, dass geuebt wird
        let zuletztAktiv = 0;
        ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => {
            const jetzt = Date.now();
            if (jetzt - zuletztAktiv > 5000) { zuletztAktiv = jetzt; an({ typ: 'rw-aktiv' }); }
        }, { passive: true, capture: true }));
    }
    if (!['uebung', 'zaehlen', 'diktat', 'spiele'].includes(ANSICHT) || !window.ResizeObserver) return;
    const bereich = document.getElementById(ANSICHT === 'uebung' ? 'reiter-rhythmus' : 'reiter-zaehlen');
    let zuletzt = 0;
    new ResizeObserver(() => {
        const hoehe = Math.ceil(bereich.getBoundingClientRect().height);
        if (hoehe !== zuletzt) { zuletzt = hoehe; an({ typ: 'rw-hoehe', hoehe }); }
    }).observe(bereich);
}

document.addEventListener('DOMContentLoaded', init);
