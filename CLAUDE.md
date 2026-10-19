# Hinweise für Claude Code

## Herkunft

Dieses Projekt ist aus dem Rhythmus-Teil von `musik-quiz/index.html`
(GitHub: `greenboy87/musik-quiz`) herausgelöst und eigenständig neu
aufgebaut - ohne Quiz, Punkte, Teams oder Scoreboard. Es geht nur ums
Unterrichten: Takte bauen, vorklatschen, Übungen erzeugen, Arbeitsblätter
drucken. Bei Fragen zu einer Design-Entscheidung zuerst dort nachsehen,
was sich im Unterricht schon bewährt hat (Bausteine, SVG-Notenschrift,
Audio-Scheduling, Pointer-Drag).

## Nicht in einen Cloud-Ordner legen

Dieses Repository darf nicht in einem synchronisierten Ordner liegen
(iCloud Drive, OneDrive, Dropbox). Solche Dienste benennen bei Konflikten
um, statt zusammenzuführen, und beschädigen dabei `.git`.

## Abgleich zwischen mehreren Rechnern

Läuft über GitHub, nicht über Dateisynchronisation: `git pull` vor dem
Arbeiten, `git commit` und `git push` danach. Vor einem Urteil über den
Stand eines Ordners erst `git fetch` oder `git ls-remote origin main`.

## Kein Tailwind

Auf dem Entwicklungsrechner gibt es kein Node und kein Tailwind-Binary.
Dieses Projekt verwendet deshalb bewusst **kein Tailwind**, sondern eigenes
CSS mit CSS-Variablen fürs Theme (`css/stil.css`). Damit entfällt die
Falle "Klasse steht nicht in einer vorgenerierten Datei und bleibt
wirkungslos" von Anfang an.

## Keine Schülerdaten ins Repository

Sobald der Schülerraum (Diktat, Fernbedienung) dazukommt: keine Klarnamen,
Klassenlisten oder Antworten von Schülern in Commits, Issues oder
Konfigurationsdateien. Rein statisch über GitHub Pages, Zustand nur in
Firebase (eigenes Projekt, getrennt von `greenboys-scoreboard`) bzw.
`localStorage`.

## Architektur

- `js/noten.js` - Bausteine (`RHYTHMUS_BAUSTEINE`, inkl. Triolen/Sechstole),
  Vergleich (`rhythmusKern`/`rhythmusGleich`), Taktart-Rechnung,
  SVG-Zeichnung (einzelner Baustein fürs Eingabefeld, großer mehrzeiliger
  Notensatz für die Anzeige inkl. Zählzeiten, Perkussionsschlüssel).
- `js/editor.js` - das Eingabefeld: beliebig viele Takte, Bausteine per
  Tippen oder Ziehen (Pointer-Events, kein HTML5-Drag - das feuert auf
  dem iPad nicht).
- `js/audio.js` - Audiokontext-Handling (Safari bleibt stumm ohne
  `entsperreAudio`), Metronom, Vorklatschen/Mitklatschen. Alles wird im
  Voraus auf `ctx.currentTime` geplant, nie per `setInterval` getaktet.
  Jeder Metronom-Klick läuft durch einen einzigen dauerhaften Gain-Knoten
  (`metronomZiel`), damit der Lautstaerke-Regler live wirkt statt nur beim
  naechsten Start.
  `rhythmusZeitplan(stueck, {bpm, vorlaufTakte, durchgaenge, nurMetronom})`
  ist die **gemeinsame Grundlage von Live-Abspielen und Audio-Export**:
  DOM-frei, liefert `{ereignisse: [{zeit, art: 'klick'|'klatsch', betont,
  puls}], markierungen, wechsel, dauer}` (Zeiten in Sekunden ab 0).
  `Vorklatschen.starten` plant genau diese Ereignisse auf die Audiouhr,
  `rhythmusAudio` rendert sie offline - Änderungen am Timing also nur dort,
  sonst laufen Live und Datei auseinander. `metronomKlick` nimmt optional
  einen eigenen Ziel-Knoten (Export), sonst den Live-Knoten `metronomZiel`.
- `js/generator.js` - würfelt Übungen aus den ausgewählten Bausteinen.
- `js/link.js` - Rhythmus als Link, DOM-frei: `linkLesen(hash)` -> Objekt
  (oder `null` ohne `r=`), `linkBauen(objekt)` -> Hash ohne `#`.
  `linkLesen(linkBauen(x))` ergibt wieder `x`. Format (alles im Hash, damit
  GitHub Pages nichts sieht):
  `#t=4/4&r=V-AA-Vp-SSSS_H-H&titel=Übung%201&bpm=90&o=lz&k=holzblock&v=1&m=60`
  - `t` Taktart aus `TAKTARTEN` (sonst/fehlt: 4/4)
  - `r` Pflicht: Bausteine mit `-`, Takte mit `_` getrennt. Ein Baustein
    mit Akzenten: Code + `!` + Nummern der betonten Noten (1-basiert),
    z.B. `SSSS!13`, `V!1`. Beim Lesen auch
    `|` bzw. `%7C` als Takttrenner, Leerzeichen werden ignoriert.
    Unbekannte Kürzel werden übersprungen und per Toast gemeldet,
    nicht aufgehende Takte trotzdem übernommen.
  - `titel` Titel-Feld (URL-kodiert)
  - `bpm` Tempo 40-200 (sonst ignoriert, Standard 90)
  - `o` Schalter als Buchstaben: `l` Notenlinien, `z` Zählzeiten,
    `p` "+" statt "und", `w` Wiederholung (`w3` = 3× insgesamt, `w` = 2×),
    `u` Als Übung, `h` Handsatz (R/L), `e` Loop (endlos abspielen),
    `k4` = 4 Takte/Zeile (ohne `k` = auto)
  - `k` Klatsch-Klang `klatschen|holzblock|klick|trommel|snare` (Standard klatschen)
  - `v` Vorlauf-Takte 0-4 (Standard 1)
  - `m` Metronom-Lautstärke 0-100, `m=0` = stumm (Standard 60)
  - `g` Größe-Regler in Prozent 60-300 (Standard 100)
  Fehlende Parameter bedeuten den Standardwert - ein Link beschreibt immer
  den kompletten Stand; "Link kopieren" lässt Standardwerte weg. Wird beim
  Laden und bei `hashchange` übernommen; gespeicherte Blätter im
  localStorage bleiben unberührt. Blätter speichern ihre Einstellungen
  selbst im selben Format (`einstellungen`: Hash ohne `#`); ältere Blätter
  ohne das Feld laden nur den Rhythmus.
- `js/export.js` - `rhythmusAudio(stueck, optionen) -> Promise<Blob>`:
  rendert den Zeitplan mit denselben Klangfunktionen in einem
  `OfflineAudioContext` (44,1 kHz mono, 0,5 s Ausklang, Spitze auf -1 dBFS).
  `stueck` wie `editor.stueck()` (ohne Angabe: der Editor-Inhalt).
  Optionen, Standard = aktuelle Einstellungen der Seite
  (`seitenEinstellungen()` in app.js): `format` `'mp3'|'wav'` (Standard mp3),
  `bpm`, `vorlaufTakte`, `durchgaenge`, `klang`, `metronom` (0-1, 0 = ohne),
  `nurMetronom`. Dauer = (Vorlauf + Takte × Durchgänge) × Schläge × 60/bpm
  + 0,5 s. Gleiche Eingabe = byte-identische Datei: Das Rauschen der Klänge
  kommt beim Export aus einem festen Zufallsgenerator, und jeder Schlag wird
  einzeln (überlappungsfrei, in derselben Lage zum 128-Sample-Block) gerendert
  und in JS zusammengemischt - mehrere gleichzeitige Quellen in einem
  Kontext summiert Chrome nicht immer gleich. WAV wird selbst kodiert
  (16 bit PCM), MP3 mit `js/vendor/lame.min.js` (lamejs 1.2.1, LGPL,
  128 kbit/s; liegt im Repo, damit es ohne Internet im Schulnetz geht).
  MP3 hat wie jedes MP3 ca. 25 ms Encoder-Vorlauf am Anfang; für exaktes
  Timing WAV nehmen.
  Automatisiert (z.B. Playwright), ohne Echtzeit-Abspielen:
  ```js
  await page.goto('https://greenboy87.github.io/rhythmus-werkstatt/#t=4/4&r=V-AA-Vp-SSSS_H-H&titel=Übung%201&bpm=90');
  const b64 = await page.evaluate(async () => {
      const blob = await rhythmusAudio(null, { format: 'mp3' });   // null = Editor-Inhalt aus dem Link
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
  });
  fs.writeFileSync('Uebung-1_4-4_90bpm.mp3', Buffer.from(b64, 'base64'));
  ```
- `js/pdf.js` - `notenPdf() -> Promise<Blob>`: das Druckblatt (Kopfzeile +
  `#druck-anzeige`, schon von `druckNeuZeichnen` auf eine Seite eingepasst)
  als einseitiges A4-PDF, ohne Bibliothek: jede Notenzeile wird als SVG-Bild
  auf eine 300-dpi-Leinwand gezeichnet, das Ganze als JPEG in eine selbst
  geschriebene PDF-Datei gelegt. Ausserhalb der Seite gilt kein Stylesheet,
  deshalb setzt `systemAlsBild` die Druckfarben aus `druck.css` direkt.
  Knopf „Als PDF“ neben „Drucken“.
- Ansichten über den Suchteil der URL (nicht im Hash, das Link-Format bleibt
  unberührt): `?ansicht=uebung` = schlanke Übungsansicht zum Einbetten
  (Klasse `ansicht-uebung` auf `<html>`, alles mit `.nicht-in-uebung`
  verschwindet, immer dunkel), meldet eingebettet ihre Höhe per
  `postMessage({typ:'rw-hoehe', hoehe})`. `?ansicht=pdf` baut nur das PDF
  und schickt es an die einbettende Seite: `{typ:'rw-pdf', pdf: ArrayBuffer,
  name}` bzw. `{typ:'rw-pdf', fehler}`. Genutzt von Beat Vault
  (Aufgaben unter „Aktuell“: Übung aufklappen, „Als Noten öffnen“).
- Zählzeiten stehen über den Noten (`ZAEHL_Y`), der Handsatz darunter
  (`HANDSATZ_Y`) - fest für alle Zeilen, damit sie bei „Als Übung“
  untereinander stehen.
- Akzente (noten.js): ein Baustein mit `akzente: [Teil-Index]` ist eine
  eigene Kopie des geteilten Bausteins (`bausteinMitAkzenten`,
  `akzentUmschalten`, `bausteinKuerzel`/`bausteinAusKuerzel` fürs Link-
  Kürzel). Gezeichnet als `>` über Hals/Balken (`path.akzent`); mit Akzenten
  rücken die Zählzeiten höher (`ZAEHL_Y_AKZENT`). Note antippen schaltet um -
  im Eingabefeld (Tippflächen aus `bausteinSvg(b, true)`, entfernt wird jetzt
  über das kleine × je Baustein) und im Notenbild (`.noten-feld`, liegt über
  den Takt-Flächen des Loop-Bereichs). Der Zeitplan markiert betonte Noten
  (`akzent: true`), jeder Klang nimmt eine Stärke (`klangStaerke`: normal
  0,45, Akzent 1,3 = gut 9 dB Unterschied - live und im Export gleich). Alle Klänge sind so
  eingepegelt, dass auch ein Akzent live unter 1,0 bleibt.
- Klang `snare` (Snare Drum): Fell als zwei kurze Dreieckstöne mit
  Tonhöhenabfall + gefiltertes Rauschen für den Teppich.
- Loop-Bereich (`loopAuswahl` in app.js, `{von, bis}` Taktnummern): Takt
  in der Anzeige antippen waehlt ihn, weitere Takte erweitern, Tippen in den
  Bereich hebt ihn auf; die Uebungsnummer (`.uebung-nr`, bei „Als Übung“)
  waehlt die ganze Zeile. `stueckAnzeigeHtml` zeichnet dafuer je Takt eine
  unsichtbare Tippflaeche (`.takt-feld[data-takt]`) und hinterlegt die
  Auswahl (`.takt-auswahl`, nur Bildschirm, nicht Druck/PDF). Mit Auswahl
  spielt „Abspielen“ nur diesen Ausschnitt (`Vorklatschen.starten(...,
  taktVersatz)` haelt die Mitlese-Markierung an der richtigen Stelle) und
  schaltet den Loop ein. Nicht im Link gespeichert.
- `js/reiter.js` - Reiter in der Kopfzeile: „Rhythmus-Werkstatt |
  Beat-Werkstatt | Drumset-Werkstatt“ (`<main id="reiter-rhythmus">`,
  `#reiter-beat`, `#reiter-drumset`). Wird als letzte Datei geladen, damit
  beat.js und drumset.js schon eingerichtet sind. Gewählter Reiter in
  `localStorage` `rw-reiter`, ein Rhythmus-Link `#…r=…` öffnet immer die
  Rhythmus-Werkstatt; in den Einbett-Ansichten `?ansicht=` gibt es keine
  Reiter. `reiterZeigen` stoppt die Spieler der anderen Reiter und setzt
  die Druck-Klasse am `<body>` (`druck-beat` / `druck-drumset`).
- `js/beat.js` - **Beat-Werkstatt**, eigener Reiter.
  - Bausteine `BEAT_FORMEN`: immer genau eine Zählzeit, alle 16
    Einsatzfolgen im Sechzehntelraster (10 sichtbar, 6 hinter „Mehr“).
    Eigene Liste, nicht `RHYTHMUS_BAUSTEINE` (dort fehlt `pSS`).
  - Platz = `{code, inst: [[…] je Teil]}`, Instrumente `hh ho ride crash b s`.
    Das Instrument steht je Note, nicht im Baustein: Note antippen schaltet
    weiter (`instWeiter`), der „Stift“ bestimmt die Instrumente beim Setzen.
  - Knöpfe „Eine Ebene“ (intern `easy`, links, Start-Modus bei jedem
    Laden - der Modus wird nicht aus dem Speicher übernommen) und
    „Zwei Ebenen“ (`profi`).
  - Modi: „Zwei Ebenen“ (`beat.oben` Becken, Hals nach oben; `beat.unten`
    Bassdrum + Snare, Hals nach unten) und „Easy“ (`beat.easy`, eine Reihe,
    Trommeln als Akkord am Becken-Hals). Jede Ebene ist eine flache Liste,
    Platz = Takt × 4 + Schlag. Moduswechsel übernimmt den Beat, wenn der
    Ziel-Modus leer ist (über `platzKarte`/`platzAusKarte`: Sechzehntel-
    Stelle → Instrumente, daraus ergibt sich der passende Baustein).
  - Taktart `beat.schlaege` (Viertel je Takt, 1-12; Auswahl 4/4, 3/4, 2/4,
    „Eigene…“). Platz = Takt × Schläge + Schlag. Beim Wechsel behält jeder
    Takt seine ersten Zählzeiten; was wegfällt, merkt sich `bwTaktRest`
    (nur solange die Seite offen ist). Vorlagen sind 4/4-Muster
    (`bwMusterPlatz`). Keine x/8-Takte - die Bausteine sind Viertel lang.
  - Backbeat-Schalter: `abgeleitet()` rechnet die Snare beim Zeichnen/
    Abspielen dazu (`bwBackbeatSchlaege`: gerade Zählzeiten, im 3/4 auf
    2 und 3), die Daten bleiben unverändert.
  - Easy-Raster (`BW_RASTER`, `bwRasterTippen`): im Easy-Platz je
    Sechzehntel-Stelle drei Tippflächen - Becken (mit Becken-Stift),
    Snare, Bassdrum jeweils an/aus; der Baustein ergibt sich über
    `platzAusKarte`. Über dem System (Hälse/Balken) nur Auswahl.
  - Easy: ein Baustein aus der Palette ersetzt nur die Becken eines Platzes,
    Bassdrum/Snare (samt Ghost) bleiben stehen (`bwBausteinSetzen`).
  - Schalter „Hi-Hat öffnen“ (`bwOffenModus`, nicht gespeichert, schließt
    Ghost Notes aus und umgekehrt): Antippen einer Hi-Hat wechselt hh ⇄ ho.
  - Ghost Notes: Kennzeichen `'g'` in der Instrumentenliste einer Note
    (gilt für die ganze Note). Schalter „Ghost Notes“ (`bwGhostModus`, nicht
    gespeichert): Antippen schaltet `'g'` statt das Instrument. Gezeichnet
    in Klammern, gespielt mit `BW_GHOST` (Snare: Stärke normal statt Akzent).
  - Editor: je Platz EIN Fünf-Linien-System mit beiden Ebenen
    (`bwZelleSvg`). Welche Ebene gemeint ist, entscheidet die angetippte
    Fläche (`rect.bw-band[data-ebene]`, Grenze zweite Linie); alles andere
    im SVG hat `pointer-events: none`. Knopf „Bassdrum ⇄ Snare“ tauscht
    im gewählten Platz (`bwTauschen`).
  - Tastatur (`bwTaste`, nur bei sichtbarem Beat-Reiter, nicht in
    Textfeldern/Auswahllisten): Leertaste Abspielen/Stopp, ←/→ Platz,
    ↑/↓ Ebene, X Bassdrum ⇄ Snare, ⌫/Entf Platz leeren; Bausteine in
    `BEAT_FORMEN`-Reihenfolge auf `BW_TASTEN` (A S D F G H J K L Ö, die
    „Mehr“-Bausteine Q W E R T Z) - Buchstabe steht am Baustein.
  - Farbe nur mit Knopf „Farbe an“ (`beat.farbe`, Klasse `bw-bunt` auf
    `#reiter-beat`), Standard schwarz-weiß.
  - Notenhälse mit geradem Ende (`stroke-linecap="butt"`), auch in
    noten.js - ein rundes Ende ragte über den Balken. Die rechte Halskante
    sitzt bündig am rechten Rand des schrägen Kopfs (noten.js `px + 5.8`,
    beat.js `±4.6`) und reicht in den Kopf hinein - sonst steht der Hals
    seitlich über und sieht abgeschnitten aus.
    Bei einem Becken-Kreuz als unterstem Kopf beginnt der Hals am rechten
    oberen Arm des Kreuzes (`y - 4.5`), nicht in der Mitte.
- Abstände im Notenbild (`VORSCHUB` in noten.js) sind bewusst großzügig
  (Sechzehntel 26, Viertel 50), Balken 4,5 dick mit 3,5 Luft dazwischen.
  - Notensatz: eigene Drum-Notation (`bwStimme`, `bwSystemSvg`), Lage wie
    üblich (Bassdrum 1. Zwischenraum, Snare 3., Ride oberste Linie, Hi-Hat
    darüber, Crash Hilfslinie; Becken mit x-Kopf), zeitgetreue Abstände.
  - Klang: Becken als 808-artige Rechteck-Oszillatoren + Rauschen, Bassdrum
    als Sinus mit Tonhöhenabfall, Snare = `snareKlang` aus audio.js (nimmt
    dafür optional einen Ziel-Knoten). Alles läuft durch eine Summe mit
    Begrenzer (`bwSummeBauen`); Stopp blendet sie aus statt Knoten einzeln
    zu stoppen. `BeatSpieler` plant Takt für Takt 0,3 s voraus aus dem
    aktuellen Stand - Änderungen und Tempo wirken im nächsten Takt.
  - Vollbild (`#bw-anzeige-karte`, Klasse `vollbild`): `bwEinpassen`
    wählt Takte je Zeile und Maßstab für den freien Platz. Drucken/PDF:
    eigenes Blatt `#bw-druck` außerhalb von `<main>` (Kopfzeile wie in der
    Rhythmus-Werkstatt, Titel `bw-titel`), `bwDruckZeichnen` passt es auf
    A4 ein. Welches Blatt ⌘P druckt, entscheidet die Klasse `druck-beat`
    am `<body>` (gesetzt von `reiterZeigen`, Regeln in druck.css). Das PDF
    nutzt `blattPdf` aus pdf.js (gemeinsam mit `notenPdf`); Farben setzt
    `bwDruckZeichnen` dafür als feste Attribute.
  - Zustand in `localStorage` `rw-beat` (nur dieser Browser). Noch ohne
    Link und Audio-Export.
- `js/drumset.js` - **Drumset-Werkstatt** (Reiter `drumset`): das ganze
  Schlagzeug in EINEM System, eine Stimme, alle Hälse nach oben - zuerst
  für Fills. Nutzt Notensatz-Teile und Klänge aus beat.js (`bwPause`,
  `BW_LINIEN`, `bwBecken`, `bwBassdrum`, `bwSummeBauen`, `BEAT_FORMEN`,
  `FORM_NACH_MUSTER`), die Klassen `bw-…` für Editor und Anzeige.
  - Instrumente `DS_INST` (Lage): Crash -8 (Hilfslinie), Hi-Hat -4, Ride 0,
    Tom 1 4, Tom 2 8, Snare 12, Tom 3 20, Bassdrum 28. Familien `becken`,
    `trommel` (Snare + Toms), `bass`. Tasten 1-8 in dieser Reihenfolge.
  - Platz = eine Zählzeit = `{r, n}`: Raster `r` 4 (Sechzehntel), 3
    (Achteltriolen) oder 6 (Sextolen), `n[i]` Instrumente je Rasterstelle
    (leer = Pause). Das Notenbild ergibt sich erst beim Zeichnen
    (`dsNotation`): passt alles ins Sechzehntelraster, wird es mit den
    Beat-Bausteinen notiert (Viertel, punktierte Achtel ...), eine Sextole
    aus lauter Achteltriolen als Triole; sonst Triole/Sextole mit Zahl
    (Klammer, sobald Pausen oder getrennte Balken drin sind).
  - Bausteine `DS_BAUSTEINE`: die 16 geraden aus `BEAT_FORMEN` und Triolen
    (`T`, `TpT`, `X` sichtbar, Rest hinter „Mehr“). Baustein setzen
    (`dsBausteinSetzen`): Stift-Instrument bekommt den Rhythmus, dessen
    Familie wird im Platz ersetzt, andere Instrumente bleiben, soweit sie ins
    neue Raster passen (sonst Toast). Danach nächster Platz.
  - Tippen im System (`dsTippen`, Tippflächen `[data-i]` je Rasterstelle,
    Punkte unten zeigen das Raster): Stift-Instrument an/aus; gleiche
    Familie wird ersetzt, andere kommt dazu. Über dem System nur Auswahl.
  - Sekunden im Akkord (z.B. Tom 1 + Tom 2, Hi-Hat + Ride): der obere Kopf
    rutscht rechts neben den Hals (`dsStimme`).
  - Zählsilben: Sechzehntel „1 e + e“, Triole „1 ta ti“, Sextole
    „1 ta ti + ta ti“ (`DS_SILBEN`).
  - Toms klingen als Sinus mit Tonhöhenabfall + kurzem Fellrauschen
    (`dsTom`, 210/155/105 Hz). `DrumSpieler` wie `BeatSpieler`.
  - Vorlagen: Takt 1 Groove mit Crash auf 1, Takt 2 Fill - im Loop landet
    der Fill auf dem Crash. Erster Besuch startet mit der ersten Vorlage.
  - Druck/PDF wie in der Beat-Werkstatt: Blatt `#ds-druck` (Klasse
    `bw-nur-druck`), `dsDruckZeichnen`, `blattPdf`.
  - Zustand in `localStorage` `rw-drumset`. Noch ohne Link, Audio-Export,
    Akzente und zweite Stimme (Füße mit Hals nach unten) - später sollen
    Beats und Fills zusammen in einem Stück stehen.
- `js/app.js` - Verdrahtung mit der Seite, Theme, Toasts, Generator-UI,
  Link-Übernahme/-Kopieren (`linkUebernehmen`, `linkKopieren`) und der
  Herunterladen-Knopf (`audioHerunterladen`, Dateiname über
  `exportDateiname`, Download per Blob-URL + `<a download>`).
- Leiste „Metronom & Anzeige“: drei Zeilen (`.steuer-zeile`): Spielen,
  Notenbild, Blatt. Einheitliche Bausteine in stil.css: `.chip` (Checkbox
  als Knopf - die alten `opt-…`-IDs bleiben, `change` wirkt wie vorher),
  `.regler` (Name, Schieber, Wert), `.segment`, Menü `details.menue`
  („Speichern“: PDF, Drucken, MP3, WAV - Format über `data-format`).
  Intern unverändert und versteckt: `#abspielen-modus` (Umschalter
  „Vorspielen | Selbst“ setzt den Wert) und `#opt-wiederholung` (Regler
  „Durchgänge“, 1 = aus). `leisteAnzeigen()` (läuft in jedem
  `anzeigeNeuZeichnen`) bringt Regler und Umschalter auf den Stand - so
  stimmen sie auch nach Link oder Blatt laden. Metronom-Teil (Tempo,
  Vorlauf, Lautstärke, freies Metronom) baut `Metronom.bauen` in audio.js
  direkt in diese Zeile. Klang wechseln spielt ihn einmal vor.
- `css/druck.css` - A4-Druckausgabe nur der Anzeige-Karte, siehe
  `@media print`. Der `<link>` auf diese Datei darf **kein**
  `media="print"`-Attribut haben, sonst gilt auch die Regel, die die
  Druckkopfzeile auf dem Bildschirm versteckt, nur noch beim Drucken
  selbst - und die Kopfzeile bliebe dauerhaft sichtbar (genau dieser
  Bug ist einmal passiert).

## Cache-Busting bei jedem Push

Die `<script>`/`<link>`-Tags in `index.html` hängen `?v=N` an - dieselbe
Zahl wie `APP_VERSION` in `js/version.js`. GitHub Pages cacht bis zu
10 Minuten (`max-age=600`); ohne die Versionsnummer in der URL kann ein
Browser trotz neuem Commit noch die alte JS/CSS-Datei ausliefern, während
`index.html` selbst schon aktuell ist - genau das hat einmal einen echten
Fix scheinbar wirkungslos gemacht. Bei jeder inhaltlichen Änderung also
**beides zusammen** hochzählen: `APP_VERSION` in `js/version.js` und jedes
`?v=` in `index.html`.

## Offene Ausbaustufen (siehe Projektauftrag)

Seed/Reproduzierbarkeit und Schwierigkeitsstufen für den Generator,
mehrseitige Arbeitsblätter mit nummerierten Aufgaben und Lösungsblatt,
Schülerraum mit Fernbedienung/Diktat - noch nicht gebaut.
