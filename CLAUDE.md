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
- `js/generator.js` - würfelt Übungen aus den ausgewählten Bausteinen.
- `js/app.js` - Verdrahtung mit der Seite, Theme, Toasts, Generator-UI.
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
