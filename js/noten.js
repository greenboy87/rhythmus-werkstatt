/* ============================================================
   NOTEN: Bausteine, Vergleich, SVG-Zeichnung.
   Rhythmen werden nicht aus einzelnen Noten gebaut, sondern aus
   fertigen Bausteinen - meist genau eine Zaehlzeit lang. Das hat
   zwei Vorteile: Auf dem Geraet tippt man zwei- statt fuenfmal,
   und die Balkenregel ("ein Balken bleibt innerhalb der Zaehlzeit")
   ist damit von selbst erfuellt.
   Ein Rhythmus ist die Folge der Kuerzel, mit "-" verbunden:
   "V-AA-Vp-SSSS". Diese Datei kommt aus musik-quiz/index.html,
   Abschnitt "RHYTHMUS: FRAGMENTE UND NOTENSCHRIFT".
   ============================================================ */

const RHYTHMUS_BAUSTEINE = [
    { code: 'G',    dauer: 4,   wort: 'Ganze',          teile: [{ d: 4 }] },
    { code: 'H',    dauer: 2,   wort: 'Halbe',          teile: [{ d: 2 }] },
    { code: 'V',    dauer: 1,   wort: 'Viertel',        teile: [{ d: 1 }] },
    { code: 'AA',   dauer: 1,   wort: 'Zwei Achtel',    teile: [{ d: .5 }, { d: .5 }] },
    { code: 'AdS',  dauer: 1,   wort: 'Punktierte Achtel + Sechzehntel', teile: [{ d: .75 }, { d: .25 }] },
    { code: 'SAd',  dauer: 1,   wort: 'Sechzehntel + punktierte Achtel',  teile: [{ d: .25 }, { d: .75 }] },
    { code: 'ASS',  dauer: 1,   wort: 'Achtel + 2 Sechzehntel', teile: [{ d: .5 }, { d: .25 }, { d: .25 }] },
    { code: 'SSA',  dauer: 1,   wort: '2 Sechzehntel + Achtel', teile: [{ d: .25 }, { d: .25 }, { d: .5 }] },
    { code: 'SAS',  dauer: 1,   wort: 'Sechzehntel + Achtel + Sechzehntel', teile: [{ d: .25 }, { d: .5 }, { d: .25 }] },
    { code: 'SSSS', dauer: 1,   wort: 'Vier Sechzehntel',       teile: [{ d: .25 }, { d: .25 }, { d: .25 }, { d: .25 }] },
    /* Triolen: drei (bzw. sechs) gleich lange Noten in der Zeit, die sonst
       zwei (bzw. vier) brauchen. Keine binaere Dauer, deshalb als Bruch statt
       als Dezimalzahl - 1/3 und 1/6 bleiben so exakt und vergleichbar. Das
       "triole"-Feld sagt dem Zeichner, welche Klammerzahl ueber den Balken
       gehoert; die Balkenbreite fuer diese Dauern steht eigens in VORSCHUB. */
    { code: 'A3',   dauer: 1,   wort: 'Achteltriole (3 in der Zeit von 2)', triole: 3, teile: [{ d: 1 / 3 }, { d: 1 / 3 }, { d: 1 / 3 }] },
    { code: 'S3',   dauer: .5,  wort: 'Sechzehntel-Triole (3 in der Zeit von 2)', triole: 3, teile: [{ d: 1 / 6 }, { d: 1 / 6 }, { d: 1 / 6 }] },
    { code: 'S6',   dauer: 1,   wort: 'Sechstole (6 in der Zeit von 4)', triole: 6, teile: [{ d: 1 / 6 }, { d: 1 / 6 }, { d: 1 / 6 }, { d: 1 / 6 }, { d: 1 / 6 }, { d: 1 / 6 }] },
    { code: 'A',    dauer: .5,  wort: 'Achtel einzeln', teile: [{ d: .5 }] },

    { code: 'Gp',   dauer: 4,   wort: 'Ganze Pause',    pausenreihe: true, teile: [{ d: 4, p: true }] },
    { code: 'Hp',   dauer: 2,   wort: 'Halbe Pause',    pausenreihe: true, teile: [{ d: 2, p: true }] },
    { code: 'Vp',   dauer: 1,   wort: 'Viertelpause',   pausenreihe: true, teile: [{ d: 1, p: true }] },
    { code: 'pA',   dauer: 1,   wort: 'Pause + Achtel', pausenreihe: true, teile: [{ d: .5, p: true }, { d: .5 }] },
    { code: 'Ap',   dauer: 1,   wort: 'Achtel + Pause', pausenreihe: true, teile: [{ d: .5 }, { d: .5, p: true }] },
    { code: 'pSSS', dauer: 1,   wort: 'Sechzehntelpause + 3 Sechzehntel', pausenreihe: true, teile: [{ d: .25, p: true }, { d: .25 }, { d: .25 }, { d: .25 }] },
    { code: 'pSA',  dauer: 1,   wort: 'Sechzehntelpause + Sechzehntel + Achtel', pausenreihe: true, teile: [{ d: .25, p: true }, { d: .25 }, { d: .5 }] },
    { code: 'pAS',  dauer: 1,   wort: 'Sechzehntelpause + Achtel + Sechzehntel', pausenreihe: true, teile: [{ d: .25, p: true }, { d: .5 }, { d: .25 }] },
    { code: 'pAd',  dauer: 1,   wort: 'Sechzehntelpause + punktierte Achtel',    pausenreihe: true, teile: [{ d: .25, p: true }, { d: .75 }] },
    { code: 'pdS',  dauer: 1,   wort: 'Punktierte Achtelpause + Sechzehntel',    pausenreihe: true, teile: [{ d: .75, p: true }, { d: .25 }] },
    { code: 'P',    dauer: .5,  wort: 'Achtelpause',    pausenreihe: true, teile: [{ d: .5, p: true }] }
];
const RHYTHMUS_NACH_CODE = {};
RHYTHMUS_BAUSTEINE.forEach(b => { RHYTHMUS_NACH_CODE[b.code] = b; });

function rhythmusLesen(text) {
    return String(text || '').split('-').map(c => RHYTHMUS_NACH_CODE[c]).filter(Boolean);
}
function rhythmusSchreiben(liste) { return liste.map(b => b.code).join('-'); }
function rhythmusDauer(liste) { return liste.reduce((a, b) => a + b.dauer, 0); }

/* Derselbe Rhythmus, anders geschrieben: Zwei Achtel im Verbund klingen wie
   zwei einzeln notierte. Verglichen wird deshalb nicht die Folge der
   Bausteine, sondern das, was man hoert - jeder Baustein in seine Werte
   zerlegt und benachbarte Pausen bzw. (im Klatschmodus) Pausen nach Noten
   zusammengefasst. */
function rhythmusKern(code, klatsch) {
    const teile = [];
    rhythmusLesen(code).forEach(b => b.teile.forEach(t => {
        if (klatsch && t.p && teile.length && !teile[teile.length - 1].p) {
            teile[teile.length - 1].d += t.d;
            return;
        }
        const letzter = teile[teile.length - 1];
        if (t.p && letzter && letzter.p) letzter.d += t.d;
        else teile.push({ p: !!t.p, d: t.d });
    }));
    return teile.map(t => (t.p ? 'p' : 'n') + t.d).join(',');
}
function rhythmusGleich(a, b, klatsch) { return rhythmusKern(a, klatsch) === rhythmusKern(b, klatsch); }

/* ---------- Taktarten ---------- */
const TAKTARTEN = ['2/4', '3/4', '4/4', '6/8', '5/4', '3/8', '7/8'];

function taktSoll(zeichen) {
    const teile = String(zeichen || '4/4').split('/');
    const oben = Number(teile[0]) || 4, unten = Number(teile[1]) || 4;
    return oben * 4 / unten;
}
/* Achtel-Taktarten (x/8) werden in Achteln gezaehlt (6/8 -> sechs Schlaege),
   alle anderen in Vierteln. Deckt genau die Faelle ab, die im Unterricht
   vorkommen, ohne echte/unechte Zusammengesetztheit unterscheiden zu muessen. */
function pulsWert(zeichen) { return /\/8$/.test(String(zeichen)) ? 0.5 : 1; }
function taktPulse(zeichen) { return Math.round(taktSoll(zeichen) / pulsWert(zeichen)); }

/* ============================================================
   ZEICHNEN
   ============================================================ */
const VORSCHUB = { 4: 96, 2: 62, 1: 38, 0.75: 30, 0.5: 24, 0.25: 17, [1 / 3]: 21, [1 / 6]: 13 };
const LINIE_Y = 46, HALS_OBEN = 13, BALKEN_DICKE = 5;

function istPunktiert(d) {
    return Math.abs(d - 0.75) < 0.001 || Math.abs(d - 1.5) < 0.001 || Math.abs(d - 3) < 0.001;
}

/* Zeichnet die Teile EINES Bausteins ab der Position x in der uebergebenen
   Tinte. Kapselt genau die Logik aus dem alten rhythmusSvg (Haelse, Balken
   mit Sechzehntel-Stummeln, alle Pausenformen, Punkte) - nur ohne Taktzeichen
   und Taktstriche, die jetzt eine Ebene hoeher gezeichnet werden.
   yVersatz hebt die ganze Zeichnung an (negativ = nach oben): Steht das
   Fuenfliniensystem, sitzt die (hier: einzige) Stimme konventionell nicht auf
   der Mittellinie (h1), sondern im Raum darueber (c2) - ohne Notenlinien
   bleibt sie auf der alten Referenzlinie, yVersatz ist dann 0. */
function bausteinTeileZeichnen(baustein, x, tinte, yVersatz) {
    const Y = LINIE_Y + (yVersatz || 0), H = HALS_OBEN + (yVersatz || 0);
    const teile = [];
    let inkVon = Infinity, inkBis = -Infinity, inkOben = Infinity, inkUnten = -Infinity;
    const ink = (von, bis, oben, unten) => {
        inkVon = Math.min(inkVon, von); inkBis = Math.max(inkBis, bis);
        if (oben !== undefined) { inkOben = Math.min(inkOben, oben); inkUnten = Math.max(inkUnten, unten); }
    };
    const punktSetzen = (dx) => {
        teile.push(`<circle cx="${dx}" cy="${Y - 5}" r="2.9" fill="${tinte}"/>`);
        ink(dx - 4, dx + 4, Y - 9, Y - 1);
    };
    const gruppe = [];
    const gruppeAbschliessen = () => {
        if (gruppe.length >= 2) {
            const a = gruppe[0].hx, b = gruppe[gruppe.length - 1].hx;
            teile.push(`<rect x="${a - 1.2}" y="${H - 1}" width="${b - a + 2.4}" height="${BALKEN_DICKE}" fill="${tinte}"/>`);
            const stummel = 9;
            for (let i = 0; i < gruppe.length; i++) {
                if (gruppe[i].d > 0.25) continue;
                const nachbarRechts = i < gruppe.length - 1 && gruppe[i + 1].d <= 0.25;
                const nachbarLinks = i > 0 && gruppe[i - 1].d <= 0.25;
                let von, bis;
                if (nachbarRechts) { von = gruppe[i].hx; bis = gruppe[i + 1].hx; }
                else if (nachbarLinks) continue;
                else if (i > 0) { von = gruppe[i].hx - stummel; bis = gruppe[i].hx; }
                else { von = gruppe[i].hx; bis = gruppe[i].hx + stummel; }
                teile.push(`<rect x="${von - 1.2}" y="${H + BALKEN_DICKE + 1.5}" ` +
                           `width="${bis - von + 2.4}" height="${BALKEN_DICKE}" fill="${tinte}"/>`);
                ink(von - 2, bis + 2, H - 1, Y + 7);
            }
            if (baustein.triole) {
                const mitte = (a + b) / 2, zahlY = H - 6;
                teile.push(`<text x="${mitte}" y="${zahlY}" font-size="11" font-weight="800" text-anchor="middle" font-family="DM Sans, sans-serif" fill="${tinte}">${baustein.triole}</text>`);
                ink(mitte - 6, mitte + 6, zahlY - 10, zahlY);
            }
        } else if (gruppe.length === 1 && gruppe[0].d <= 0.75) {
            const hx = gruppe[0].hx;
            teile.push(`<path d="M${hx} ${H} q 11 5 9 16 q -2 -8 -9 -9" fill="${tinte}"/>`);
            if (gruppe[0].d <= 0.25) teile.push(`<path d="M${hx} ${H + 9} q 11 5 9 16 q -2 -8 -9 -9" fill="${tinte}"/>`);
            ink(hx - 2, hx + 12, H - 1, Y + 7);
        }
        gruppe.length = 0;
    };
    baustein.teile.forEach(t => {
        const px = x;
        x += VORSCHUB[t.d] || 38;
        if (t.p) {
            if (t.d >= 2) {
                // Ganze/halbe Pause haengen mittig im Platz, den sie fuellen -
                // nicht an dessen linkem Rand wie eine Note an ihrem Einsatz.
                const mitteX = (px + x) / 2;
                const haengt = t.d >= 4;
                const oben = haengt ? Y : Y - 8;
                teile.push(`<rect x="${mitteX - 11}" y="${oben}" width="22" height="8" fill="${tinte}"/>`);
                teile.push(`<line x1="${mitteX - 18}" y1="${Y}" x2="${mitteX + 18}" y2="${Y}" stroke="${tinte}" stroke-width="2" opacity=".8"/>`);
                ink(mitteX - 19, mitteX + 19, Y - 10, Y + 10);
            } else if (t.d >= 1) {
                teile.push(`<path d="M${px - 5} ${Y - 15} L${px + 4} ${Y - 5.5}` +
                           ` L${px - 4} ${Y + 1} L${px + 5} ${Y + 10.5}"` +
                           ` fill="none" stroke="${tinte}" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"/>`);
                teile.push(`<path d="M${px + 5} ${Y + 10.5} c -7 -3.5 -11 2 -5.5 7.5"` +
                           ` fill="none" stroke="${tinte}" stroke-width="3" stroke-linecap="round"/>`);
                ink(px - 8, px + 8, Y - 16, Y + 19);
            } else if (t.d <= 0.25) {
                teile.push(`<path d="M${px + 5} ${Y - 11} L${px - 4} ${Y + 12}" stroke="${tinte}" stroke-width="2.5" stroke-linecap="round" fill="none"/>` +
                           `<circle cx="${px}" cy="${Y - 9}" r="3.2" fill="${tinte}"/>` +
                           `<circle cx="${px - 3.5}" cy="${Y}" r="3.2" fill="${tinte}"/>`);
                ink(px - 7, px + 7, Y - 13, Y + 13);
            } else {
                teile.push(`<path d="M${px + 4} ${Y - 10} L${px - 3} ${Y + 10}" stroke="${tinte}" stroke-width="2.5" stroke-linecap="round" fill="none"/>` +
                           `<circle cx="${px - 1}" cy="${Y - 8}" r="3.2" fill="${tinte}"/>`);
                ink(px - 5, px + 6, Y - 12, Y + 11);
                if (istPunktiert(t.d)) punktSetzen(px + 9);
            }
            gruppeAbschliessen();
            return;
        }
        const hohl = t.d >= 2;
        teile.push(`<ellipse cx="${px}" cy="${Y}" rx="7.5" ry="5.4" transform="rotate(-18 ${px} ${Y})"` +
                   (hohl ? ` fill="none" stroke="${tinte}" stroke-width="2.6"/>` : ` fill="${tinte}"/>`));
        ink(px - 9, px + 9, Y - 7, Y + 7);
        if (istPunktiert(t.d)) punktSetzen(px + 12.5);
        if (t.d >= 4) return;
        const hx = px + 6.6;
        ink(px - 9, hx + (t.d <= 0.75 ? 11 : 2), H - 1, Y + 7);
        teile.push(`<line x1="${hx}" y1="${Y - 2}" x2="${hx}" y2="${H}" stroke="${tinte}" stroke-width="2.4" stroke-linecap="round"/>`);
        if (t.d <= 0.75) gruppe.push({ hx: hx, d: t.d });
    });
    gruppeAbschliessen();
    return { teile, x, inkVon, inkBis, inkOben, inkUnten };
}

/* Ein einzelner Baustein, eng zugeschnitten - fuer Palette und Editor-Kaestchen. */
function bausteinSvg(baustein) {
    const r = bausteinTeileZeichnen(baustein, 16, 'currentColor');
    const von = (isFinite(r.inkVon) ? r.inkVon : 16) - 5;
    const breite = Math.max(24, (isFinite(r.inkBis) ? r.inkBis : r.x) + 5 - von);
    const hoeheNackt = 62;
    const oben = (isFinite(r.inkOben) && isFinite(r.inkUnten) ? (r.inkOben + r.inkUnten) / 2 : LINIE_Y) - hoeheNackt / 2;
    // Echte width/height-Attribute, nicht nur viewBox: ohne sie faellt eine
    // SVG in manchen Browsern (vor allem Safari) auf eine feste Standardgroesse
    // zurueck und ignoriert dabei die Zeichnung - sie bleibt dann unsichtbar,
    // obwohl die Box selbst (mit Rand) ganz normal zu sehen ist.
    return `<svg viewBox="${von} ${oben} ${breite} ${hoeheNackt}" width="${breite}" height="${hoeheNackt}" class="baustein-svg">${r.teile.join('')}</svg>`;
}

/* Position (x) fuer eine beliebige Viertel-Position innerhalb eines Taktes,
   interpoliert anhand der tatsaechlich gezeichneten Baustein-Slots. Damit
   lassen sich Zaehlzeiten-Ziffern unter die Note setzen, auch wenn die
   Notenwerte nicht gleichmaessig breit sind. */
function xBeiViertel(marken, v, taktEndeX) {
    for (let i = 0; i < marken.length; i++) {
        const m = marken[i];
        const istLetzte = i === marken.length - 1;
        if (v < m.ab + m.dauer - 1e-6 || istLetzte) {
            const slotEnde = istLetzte ? taktEndeX : marken[i + 1].px;
            const anteil = m.dauer > 0 ? Math.max(0, Math.min(1, (v - m.ab) / m.dauer)) : 0;
            return m.px + anteil * (slotEnde - m.px);
        }
    }
    return taktEndeX;
}

/* Der neutrale Schluessel (Perkussionsschluessel) fuer Instrumente ohne
   Tonhoehe: zwei dicke senkrechte Balken, mittig auf das System gesetzt.
   Kein Violinschluessel - der wuerde eine bestimmte Tonhoehe behaupten,
   die ein Rhythmus-Takt gar nicht hat. */
function schluesselSvg(x, mitteY, tinte) {
    const halbHoehe = 11, breite = 3, abstand = 5;
    return `<g>
        <rect x="${x - abstand / 2 - breite}" y="${mitteY - halbHoehe}" width="${breite}" height="${halbHoehe * 2}" fill="${tinte}"/>
        <rect x="${x + abstand / 2}" y="${mitteY - halbHoehe}" width="${breite}" height="${halbHoehe * 2}" fill="${tinte}"/>
    </g>`;
}

/* ============================================================
   Grosse, mehrzeilige Anzeige eines ganzen Stuecks - fuer den
   Beamer. "stueck" = { zeichen, takte: [{ bausteine: [...] }] }.
   optionen: { notenlinien, zaehlzeiten, wiederholung, breite,
               takteProZeile, skalierung }
   takteProZeile (Zahl oder 0/undefined): statt so viele Takte pro Zeile
   zu nehmen, wie in "breite" passen, immer genau so viele - fuer den
   Druck, wo Takte untereinander stehen sollen statt ineinander zu
   verlaufen. skalierung (Standard 1) vergroessert/verkleinert jede
   Zeile gleichmaessig, ohne die Zeichnung neu zu rechnen.
   Gibt HTML zurueck: ein <svg> je Notenzeile (Systemumbruch).
   ============================================================ */
function stueckAnzeigeHtml(stueck, optionen) {
    const opt = Object.assign({ notenlinien: false, zaehlzeiten: false, wiederholung: false, wiederholungen: 1, breite: 900, takteProZeile: 0, skalierung: 1 }, optionen || {});
    const tinte = 'currentColor';
    const takte = stueck.takte || [];
    if (!takte.length) return '<p class="anzeige-hinweis" style="display:block">Noch kein Takt eingetragen.</p>';

    const LINKS_RAND = 16;
    const KOPF_BREITE = 70;   // Platz fuer Schluessel + Taktangabe im ersten System
    const RAND_TAKT = 15;

    function taktBreite(takt) {
        return takt.bausteine.reduce((s, b) => s + b.teile.reduce((s2, t) => s2 + (VORSCHUB[t.d] || 38), 0), 0) + RAND_TAKT;
    }

    // Takte auf Systeme (Zeilen) verteilen: entweder feste Anzahl je Zeile
    // (Druck - Takte sollen sauber untereinander stehen) oder so viele, wie
    // in die verfuegbare Breite passen (Bildschirm), nie mitten im Takt.
    const systeme = [];
    if (opt.takteProZeile > 0) {
        for (let i = 0; i < takte.length; i += opt.takteProZeile) {
            systeme.push(takte.slice(i, i + opt.takteProZeile).map((takt, j) => ({ takt, index: i + j })));
        }
    } else {
        let aktuell = [], breite = 0;
        takte.forEach((takt, i) => {
            const kopfPlatz = systeme.length === 0 && aktuell.length === 0 ? KOPF_BREITE : 0;
            const b = taktBreite(takt);
            if (aktuell.length && breite + b > opt.breite - LINKS_RAND) {
                systeme.push(aktuell); aktuell = []; breite = 0;
            }
            aktuell.push({ takt, index: i });
            breite += b + (aktuell.length === 1 && systeme.length === 0 ? kopfPlatz : 0);
        });
        if (aktuell.length) systeme.push(aktuell);
    }

    const svgListe = systeme.map((system, systemNr) => {
        const istErstesSystem = systemNr === 0;
        const istLetztesSystem = systemNr === systeme.length - 1;
        let x = LINKS_RAND + (istErstesSystem ? KOPF_BREITE : 10);
        const teileSvg = [];
        let inkVon = Infinity, inkBis = -Infinity, inkOben = Infinity, inkUnten = -Infinity;
        const merge = (r) => {
            if (!isFinite(r.inkVon)) return;
            inkVon = Math.min(inkVon, r.inkVon); inkBis = Math.max(inkBis, r.inkBis);
            inkOben = Math.min(inkOben, r.inkOben); inkUnten = Math.max(inkUnten, r.inkUnten);
        };

        // Fester kleiner Rand, unabhaengig vom Kopf-Platz fuer Schluessel/Taktangabe -
        // sonst schneidet der Zuschnitt am Ende genau diesen Kopf wieder weg.
        const linksAnschlag = LINKS_RAND - 4;
        inkVon = Math.min(inkVon, linksAnschlag);
        if (istErstesSystem) {
            if (opt.notenlinien) {
                teileSvg.push(schluesselSvg(LINKS_RAND + 7, LINIE_Y, tinte));
                inkOben = Math.min(inkOben, LINIE_Y - 13); inkUnten = Math.max(inkUnten, LINIE_Y + 13);
            }
            if (opt.wiederholung) {
                // Ein Wiederholungszeichen ist zweistrichig: duenn, dann dick,
                // erst danach die Punkte - vorher stand hier nur ein einzelner
                // dicker Strich, das sah nicht nach dem bekannten Zeichen aus.
                const duenn = linksAnschlag - 5, dick = linksAnschlag;
                teileSvg.push(`<line x1="${duenn}" y1="${LINIE_Y - 17}" x2="${duenn}" y2="${LINIE_Y + 15}" stroke="${tinte}" stroke-width="1.5"/>`);
                teileSvg.push(`<line x1="${dick}" y1="${LINIE_Y - 17}" x2="${dick}" y2="${LINIE_Y + 15}" stroke="${tinte}" stroke-width="4"/>`);
                teileSvg.push(`<circle cx="${dick + 7}" cy="${LINIE_Y - 6}" r="2.2" fill="${tinte}"/>`);
                teileSvg.push(`<circle cx="${dick + 7}" cy="${LINIE_Y + 6}" r="2.2" fill="${tinte}"/>`);
                inkVon = Math.min(inkVon, duenn - 3);
            }
            const [oben, unten] = String(stueck.zeichen || '4/4').split('/');
            const tx = LINKS_RAND + KOPF_BREITE - 20;
            teileSvg.push(`<text class="kopf" x="${tx}" y="${LINIE_Y - 8}" font-size="19" font-weight="900"` +
                          ` text-anchor="middle" dominant-baseline="middle" font-family="DM Sans, sans-serif">${oben}</text>`);
            teileSvg.push(`<text class="kopf" x="${tx}" y="${LINIE_Y + 10}" font-size="19" font-weight="900"` +
                          ` text-anchor="middle" dominant-baseline="middle" font-family="DM Sans, sans-serif">${unten || ''}</text>`);
        }

        const zaehlzeitenTexte = [];
        system.forEach(({ takt, index }, posInSystem) => {
            // Taktstrich vor jedem Takt, ausser ganz am Anfang des ersten Systems
            if (!(istErstesSystem && posInSystem === 0)) {
                teileSvg.push(`<line x1="${x}" y1="${LINIE_Y - 17}" x2="${x}" y2="${LINIE_Y + 15}" stroke="${tinte}" stroke-width="2"/>`);
                inkVon = Math.min(inkVon, x - 2); inkBis = Math.max(inkBis, x + 2);
                x += 13;
            }
            const taktStartX = x;
            const marken = [];
            let gelaufen = 0;
            // Steht das Liniensystem, sitzt die Snare Drum konventionell im
            // Raum ueber der Mittellinie (c2), nicht auf ihr (h1) - ohne
            // Notenlinien bleibt die alte Referenzlinie unveraendert.
            const notenVersatz = opt.notenlinien ? -4 : 0;
            takt.bausteine.forEach((b) => {
                marken.push({ ab: gelaufen, px: x, dauer: b.dauer });
                const globalAb = index * taktSoll(stueck.zeichen) + gelaufen;
                const r = bausteinTeileZeichnen(b, x, tinte, notenVersatz);
                teileSvg.push(`<g data-ab="${globalAb}" data-bis="${globalAb + b.dauer}">${r.teile.join('')}</g>`);
                merge(r);
                x = r.x;
                gelaufen += b.dauer;
            });
            const taktEndeX = x;

            if (opt.zaehlzeiten) {
                // Nicht ein fester Raster-Takt, sondern eine Silbe je tatsaechlichem
                // Einsatz: eine Viertel bekommt nur "1", zwei Achtel "1 und", vier
                // Sechzehntel "1 e und e" - wie im Heft gesprochen, nicht wie am
                // Metronom gezaehlt. Einsaetze, die nicht aufs Sechzehntel-Raster
                // fallen (z.B. innerhalb einer Triole), bleiben ohne Silbe - dafuer
                // gibt es hier keine saubere deutsche Sprechweise.
                const pw = pulsWert(stueck.zeichen);
                const SILBEN = ['', 'e', 'und', 'e'];
                const zaehlzeitText = (v, text, blass) =>
                    `<text class="zaehlzeit" x="${xBeiViertel(marken, v, taktEndeX)}" y="${LINIE_Y + 30}" font-size="12" font-weight="700"` +
                    ` text-anchor="middle" font-family="DM Sans, sans-serif" opacity="${blass ? '.4' : '1'}">${text}</text>`;
                let v = 0;
                takt.bausteine.forEach(b => {
                    b.teile.forEach(teil => {
                        const pulsIndex = Math.floor((v + 1e-6) / pw);
                        const rest = v - pulsIndex * pw;
                        const raster = rest / 0.25;
                        const aufRaster = Math.abs(raster - Math.round(raster)) < 0.02;
                        if (aufRaster) {
                            const stufe = Math.round(raster) % 4;
                            const silbe = stufe === 0 ? String(pulsIndex + 1) : SILBEN[stufe];
                            if (silbe) zaehlzeitenTexte.push(zaehlzeitText(v, silbe, stufe !== 0));
                        }
                        // Liegt eine Note/Pause ueber mehr als einen Puls (Halbe, Ganze),
                        // bekommen die Pulse, auf die sie nur noch nachklingt, ihre Zahl
                        // trotzdem - blass, damit man beim Mitzaehlen nicht die Orientierung
                        // verliert, aber es nicht wie ein neuer Einsatz aussieht.
                        if (aufRaster) {
                            for (let folge = v + pw; folge < v + teil.d - 1e-6; folge += pw) {
                                const folgeIndex = Math.round(folge / pw);
                                zaehlzeitenTexte.push(zaehlzeitText(folge, String(folgeIndex + 1), true));
                            }
                        }
                        v += teil.d;
                    });
                });
                inkUnten = Math.max(inkUnten, LINIE_Y + 36);
            }
            x = taktEndeX;
        });
        teileSvg.push(...zaehlzeitenTexte);

        const rechts = x + 6;
        if (istLetztesSystem && opt.wiederholung) {
            // Spiegelbildlich zum Anfang: Punkte, dann dick, dann duenn - ersetzt
            // den normalen Taktschluss-Strich, statt zusaetzlich daneben zu stehen.
            const dick = rechts, duenn = rechts + 5;
            teileSvg.push(`<circle cx="${dick - 7}" cy="${LINIE_Y - 6}" r="2.2" fill="${tinte}"/>`);
            teileSvg.push(`<circle cx="${dick - 7}" cy="${LINIE_Y + 6}" r="2.2" fill="${tinte}"/>`);
            teileSvg.push(`<line x1="${dick}" y1="${LINIE_Y - 17}" x2="${dick}" y2="${LINIE_Y + 15}" stroke="${tinte}" stroke-width="4"/>`);
            teileSvg.push(`<line x1="${duenn}" y1="${LINIE_Y - 17}" x2="${duenn}" y2="${LINIE_Y + 15}" stroke="${tinte}" stroke-width="1.5"/>`);
            inkBis = Math.max(inkBis, duenn + 3);
            // Das Zeichen allein heisst "noch einmal" (zweimal insgesamt) - erst
            // bei mehr Durchgaengen steht die Zahl ausgeschrieben dabei.
            const male = Math.max(1, Number(opt.wiederholungen) || 1) + 1;
            if (male > 2) {
                teileSvg.push(`<text x="${duenn + 4}" y="${LINIE_Y - 20}" font-size="12" font-weight="800" text-anchor="start" font-family="DM Sans, sans-serif" fill="${tinte}">${male}×</text>`);
                inkOben = Math.min(inkOben, LINIE_Y - 32);
                inkBis = Math.max(inkBis, duenn + 4 + String(male).length * 9 + 10);
            }
        } else {
            teileSvg.push(`<line x1="${rechts}" y1="${LINIE_Y - 17}" x2="${rechts}" y2="${LINIE_Y + 15}" stroke="${tinte}" stroke-width="${istLetztesSystem ? 3 : 2}"/>`);
        }

        if (opt.notenlinien) {
            const linienHtml = [-16, -8, 0, 8, 16].map(dy =>
                `<line x1="${linksAnschlag}" y1="${LINIE_Y + dy}" x2="${rechts + 8}" y2="${LINIE_Y + dy}" class="linien-fuenf" stroke="currentColor" stroke-width="1.3"/>`
            ).join('');
            teileSvg.unshift(linienHtml);
        } else {
            teileSvg.unshift(`<line x1="${linksAnschlag}" y1="${LINIE_Y}" x2="${rechts + 8}" y2="${LINIE_Y}" stroke="${tinte}" stroke-width="1.5" opacity=".45"/>`);
        }

        if (!isFinite(inkVon)) { inkVon = linksAnschlag; inkBis = rechts; }
        if (!isFinite(inkOben)) { inkOben = HALS_OBEN; inkUnten = LINIE_Y + 7; }
        const vonX = Math.min(inkVon, linksAnschlag) - 6;
        // Nicht blind "rechts+20" - die "x-mal wiederholen"-Beschriftung am
        // Wiederholungszeichen reicht teils weiter nach rechts als das.
        const breiteSvg = Math.max(rechts + 20, inkBis + 10) - vonX;
        const obenGrenze = opt.notenlinien ? LINIE_Y - 30 : LINIE_Y - 18;
        const oben = Math.min(inkOben, obenGrenze) - 4;
        const unten = Math.max(inkUnten, LINIE_Y + 20) + 4;
        const hoeheSvg = unten - oben;
        // Anzeigegroesse per CSS skaliert, nicht die Zeichnung selbst neu
        // gerechnet - die viewBox bleibt die "echte" Groesse, nur die
        // dargestellte Breite (und damit, seitenverhaeltnis-treu, die Hoehe)
        // wandert mit dem Groesse-Regler.
        const zielBreite = Math.round(breiteSvg * opt.skalierung);
        return `<svg class="anzeige-system" viewBox="${vonX} ${oben} ${breiteSvg} ${hoeheSvg}" width="${Math.round(breiteSvg)}" height="${Math.round(hoeheSvg)}" style="width:${zielBreite}px; max-width:100%">${teileSvg.join('')}</svg>`;
    });

    return svgListe.join('');
}

/* Findet in einem gerade gezeichneten Stueck die Note/Pause an der globalen
   Position (Takt-Index, Viertel seit Taktanfang) und hebt sie hervor - fuer
   das Mitlesen waehrend Vorklatschen/Mitklatschen. null blendet aus. */
function stueckMarkieren(host, zeichen, taktIndex, viertelInTakt) {
    if (!host) return;
    host.querySelectorAll('[data-ab].jetzt').forEach(g => g.classList.remove('jetzt'));
    if (taktIndex === null || taktIndex === undefined || taktIndex < 0) return;
    const global = taktIndex * taktSoll(zeichen) + viertelInTakt;
    const gruppen = host.querySelectorAll('[data-ab]');
    for (const g of gruppen) {
        const ab = Number(g.dataset.ab), bis = Number(g.dataset.bis);
        if (global >= ab - 0.001 && global < bis - 0.001) { g.classList.add('jetzt'); break; }
    }
}
