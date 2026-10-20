/* ============================================================
   LINK: ein Rhythmus samt Einstellungen als Link zum Teilen.
   Alles steht im Hash (#...), damit GitHub Pages nichts davon
   sieht und kein Server je einen Rhythmus zu Gesicht bekommt:
     #t=4/4&r=V-AA-Vp-SSSS_H-H&titel=Übung%201&bpm=90&o=lz&k=holzblock&v=1&m=60
   Beide Funktionen sind DOM-frei (nur Text rein, Objekt raus und
   umgekehrt) - so lassen sie sich auch ohne Browser pruefen.
   Das vollstaendige Format steht in der CLAUDE.md unter "Architektur".
   ============================================================ */

/* Was ein Link ohne den jeweiligen Parameter bedeutet. linkBauen laesst
   genau diese Werte weg, damit der Link kurz bleibt; linkLesen fuellt sie
   wieder auf - ein Link beschreibt so immer den kompletten Stand. */
const LINK_STANDARD = {
    zeichen: '4/4',
    titel: '',
    bpm: 90,
    klang: 'klatschen',
    vorlauf: 1,
    metronom: 60,          // 0-100, wie der Lautstaerke-Regler
    notenlinien: false,
    zaehlzeiten: false,
    undAlsPlus: false,
    durchgaenge: 1,        // 1 = keine Wiederholung, 2+ = Wiederholungszeichen
    alsUebung: false,
    handsatz: false,
    loop: false,
    takteProZeile: 0,      // 0 = automatisch
    groesse: 100           // Groesse-Regler in Prozent, 60-300
};
const LINK_KLAENGE = ['klatschen', 'holzblock', 'klick', 'trommel', 'snare'];

function linkDekodieren(text) {
    try { return decodeURIComponent(String(text).replace(/\+/g, '%20')); }
    catch (e) { return String(text); }
}

/* hash: mit oder ohne fuehrendes "#". Gibt null zurueck, wenn kein
   Rhythmus (r=) darin steht - dann ist es kein Rhythmus-Link. Sonst ein
   vollstaendiges Objekt: { zeichen, takte: [['V','AA'], ...], titel, bpm,
   klang, vorlauf, metronom, notenlinien, zaehlzeiten, undAlsPlus,
   durchgaenge, alsUebung, takteProZeile, unbekannt: [{code, takt}] }.
   Unbekannte Kuerzel fallen aus den Takten heraus und landen (mit
   1-basierter Taktnummer) in "unbekannt", damit die Seite sie melden kann. */
function linkLesen(hash) {
    const roh = String(hash || '').replace(/^#/, '');
    const werte = {};
    roh.split('&').forEach(paar => {
        if (!paar) return;
        const i = paar.indexOf('=');
        const name = linkDekodieren(i < 0 ? paar : paar.slice(0, i)).trim().toLowerCase();
        werte[name] = i < 0 ? '' : linkDekodieren(paar.slice(i + 1));
    });
    if (werte.r === undefined) return null;

    const erg = Object.assign({}, LINK_STANDARD, { takte: [], unbekannt: [] });

    const taktarten = typeof TAKTARTEN !== 'undefined' ? TAKTARTEN : null;
    const t = String(werte.t || '').replace(/\s+/g, '');
    if (t && (!taktarten || taktarten.includes(t))) erg.zeichen = t;

    const bekannt = typeof RHYTHMUS_NACH_CODE !== 'undefined' ? RHYTHMUS_NACH_CODE : null;
    const r = werte.r.replace(/\s+/g, '');
    if (r) {
        erg.takte = r.split(/[_|]/).map((taktText, taktNr) =>
            // "SSSS!13": Code + Akzente - geprueft wird nur der Code
            taktText.split('-').filter(Boolean).filter(code => {
                if (!bekannt || bekannt[code.split('!')[0]]) return true;
                erg.unbekannt.push({ code, takt: taktNr + 1 });
                return false;
            }));
    }

    if (werte.titel !== undefined) erg.titel = werte.titel;

    const zahl = (text, min, max) => {
        if (!/^\d+$/.test(String(text || '').trim())) return null;
        const n = Number(text);
        return n >= min && n <= max ? n : null;
    };
    const bpm = zahl(werte.bpm, 40, 200);
    if (bpm !== null) erg.bpm = bpm;
    const vorlauf = zahl(werte.v, 0, 4);
    if (vorlauf !== null) erg.vorlauf = vorlauf;
    const metronom = zahl(werte.m, 0, 100);
    if (metronom !== null) erg.metronom = metronom;
    const groesse = zahl(werte.g, 60, 300);
    if (groesse !== null) erg.groesse = groesse;
    if (LINK_KLAENGE.includes(String(werte.k || '').trim().toLowerCase())) erg.klang = werte.k.trim().toLowerCase();

    // Schalter: je ein Buchstabe, w und k optional mit Zahl dahinter.
    String(werte.o || '').replace(/\s+/g, '').replace(/([a-z])(\d*)/gi, (_, buchstabe, ziffern) => {
        const n = ziffern ? Number(ziffern) : null;
        switch (buchstabe.toLowerCase()) {
            case 'l': erg.notenlinien = true; break;
            case 'z': erg.zaehlzeiten = true; break;
            case 'p': erg.undAlsPlus = true; break;
            case 'h': erg.handsatz = true; break;
            case 'e': erg.loop = true; break;
            case 'u': erg.alsUebung = true; break;
            case 'w': erg.durchgaenge = Math.max(2, Math.min(10, n || 2)); break;
            case 'k': if (n !== null) erg.takteProZeile = Math.min(8, n); break;
        }
        return '';
    });
    return erg;
}

/* Gegenstueck zu linkLesen: Objekt (wie von linkLesen geliefert) -> Hash
   ohne "#". takte darf Kuerzel-Listen oder Baustein-Objekte enthalten.
   Nur was vom Standard abweicht, kommt in den Link. */
function linkBauen(x) {
    const s = LINK_STANDARD;
    const teile = [];
    const code = (b) => (typeof b === 'string' ? b
        : typeof bausteinKuerzel === 'function' ? bausteinKuerzel(b) : b.code);
    // Takt-Trenner "_" und Baustein-Trenner "-" sind in URLs ohnehin
    // unverdaechtig, die Kuerzel selbst bestehen nur aus Buchstaben/Ziffern.
    const takte = (x.takte || []).map(t => (Array.isArray(t) ? t : (t.bausteine || [])).map(code).join('-'));
    if (x.zeichen && x.zeichen !== s.zeichen) teile.push('t=' + x.zeichen);
    teile.push('r=' + takte.join('_'));
    if (x.titel) teile.push('titel=' + encodeURIComponent(x.titel));
    if (x.bpm !== undefined && x.bpm !== s.bpm) teile.push('bpm=' + x.bpm);

    let o = '';
    if (x.notenlinien) o += 'l';
    if (x.zaehlzeiten) o += 'z';
    if (x.undAlsPlus) o += 'p';
    if (x.handsatz) o += 'h';
    if (x.loop) o += 'e';
    if (x.durchgaenge > 1) o += 'w' + (x.durchgaenge === 2 ? '' : x.durchgaenge);
    if (x.alsUebung) o += 'u';
    if (x.takteProZeile > 0) o += 'k' + x.takteProZeile;
    if (o) teile.push('o=' + o);

    if (x.klang && x.klang !== s.klang) teile.push('k=' + x.klang);
    if (x.vorlauf !== undefined && x.vorlauf !== s.vorlauf) teile.push('v=' + x.vorlauf);
    if (x.metronom !== undefined && x.metronom !== s.metronom) teile.push('m=' + x.metronom);
    if (x.groesse !== undefined && x.groesse !== s.groesse) teile.push('g=' + x.groesse);
    return teile.join('&');
}

/* ============================================================
   BEAT- UND DRUMSET-LINK: eigener Schluessel statt r=, damit ein Link
   genau einen Reiter meint (reiter.js oeffnet bei b= die Beat-, bei d=
   die Drumset-Werkstatt). Ebenfalls DOM-frei und verlustfrei:
   beatLinkLesen(beatLinkBauen(x)) bzw. drumLinkLesen(drumLinkBauen(x))
   ergibt wieder x.
     #b=AA.hb.h-AA.hs.h_V.b--Vp&u=...&t=3/4&titel=Groove&bpm=100&o=zew2
     #d=hb.h.hs.h-s.1.2-s.s.s.s&t=4/4&titel=Fill&bpm=90&o=f
   Platz = Zaehlzeit, Plaetze mit "-", Takte mit "_" getrennt, leerer
   Platz = nichts zwischen den Trennern (am Taktende weggelassen).
   Beat: Platz = Baustein-Code, dann je Note (ohne Pausen) "." und die
   Instrument-Buchstaben (BEAT_LINK_INST, g = Ghost Note). b= ist die
   eine Ebene bzw. bei zwei Ebenen die Becken, u= (nur bei zwei Ebenen)
   Bassdrum/Snare.
   Drumset: Platz = Rasterstellen mit "." getrennt (3, 4 oder 6 Teile =
   Raster), je Stelle die Instrument-Buchstaben (DRUM_LINK_INST).
   ============================================================ */
const LINK_TAKTE_MAX = 8, LINK_SCHLAEGE_MAX = 12;
const BEAT_LINK_INST = { crash: 'c', hh: 'h', ho: 'o', ride: 'r', s: 's', b: 'b', g: 'g' };
const DRUM_LINK_INST = { crash: 'c', hh: 'h', ho: 'o', ride: 'r', s: 's', t1: '1', t2: '2', t3: '3', b: 'b' };
const BEAT_LINK_STANDARD = {
    schlaege: 4, titel: '', bpm: 90,
    backbeat: true, zaehlzeiten: true, farbe: false, metronom: false,
    loop: true, alsUebung: false, durchgaenge: 1, proZeile: 0
};
const DRUM_LINK_STANDARD = { schlaege: 4, titel: '', bpm: 90, zaehlzeiten: true, farbe: false, metronom: false };
/* Schalter in "o": Buchstabe = an. Fehlt "o", gilt der Standard. */
const BEAT_LINK_SCHALTER = { a: 'backbeat', z: 'zaehlzeiten', f: 'farbe', m: 'metronom', e: 'loop', u: 'alsUebung' };
const DRUM_LINK_SCHALTER = { z: 'zaehlzeiten', f: 'farbe', m: 'metronom' };

function linkWerte(hash) {
    const werte = {};
    String(hash || '').replace(/^#/, '').split('&').forEach(paar => {
        if (!paar) return;
        const i = paar.indexOf('=');
        const name = linkDekodieren(i < 0 ? paar : paar.slice(0, i)).trim().toLowerCase();
        werte[name] = i < 0 ? '' : linkDekodieren(paar.slice(i + 1));
    });
    return werte;
}
function linkZahl(text, min, max) {
    if (!/^\d+$/.test(String(text || '').trim())) return null;
    const n = Number(text);
    return n >= min && n <= max ? n : null;
}
function linkInstUmkehr(tabelle) {
    const r = {};
    Object.keys(tabelle).forEach(k => { r[tabelle[k]] = k; });
    return r;
}
/* Gemeinsamer Teil: Taktart (x/4), Titel, Tempo, Schalter. */
function linkKopfLesen(werte, standard, schalter) {
    const erg = Object.assign({}, standard);
    const t = /^(\d+)\/4$/.exec(String(werte.t || '').replace(/\s+/g, ''));
    if (t && Number(t[1]) >= 1 && Number(t[1]) <= LINK_SCHLAEGE_MAX) erg.schlaege = Number(t[1]);
    if (werte.titel !== undefined) erg.titel = werte.titel.slice(0, 80);
    const bpm = linkZahl(werte.bpm, 40, 200);
    if (bpm !== null) erg.bpm = bpm;
    if (werte.o !== undefined) {
        Object.values(schalter).forEach(k => { erg[k] = false; });
        String(werte.o).replace(/\s+/g, '').replace(/([a-z])(\d*)/gi, (_, b, ziffern) => {
            const n = ziffern ? Number(ziffern) : null;
            b = b.toLowerCase();
            if (schalter[b]) erg[schalter[b]] = true;
            else if (b === 'w' && 'durchgaenge' in standard) erg.durchgaenge = Math.max(2, Math.min(10, n || 2));
            else if (b === 'k' && 'proZeile' in standard && n !== null) erg.proZeile = Math.min(LINK_TAKTE_MAX, n);
            return '';
        });
    }
    return erg;
}
function linkKopfBauen(x, standard, schalter) {
    const teile = [];
    if (x.schlaege !== standard.schlaege) teile.push('t=' + x.schlaege + '/4');
    if (x.titel) teile.push('titel=' + encodeURIComponent(x.titel));
    if (x.bpm !== standard.bpm) teile.push('bpm=' + x.bpm);
    const o = (y) => Object.keys(schalter).filter(b => y[schalter[b]]).join('') +
        (y.durchgaenge > 1 ? 'w' + (y.durchgaenge === 2 ? '' : y.durchgaenge) : '') +
        (y.proZeile > 0 ? 'k' + y.proZeile : '');
    if (o(x) !== o(standard)) teile.push('o=' + o(x));
    return teile;
}
/* Plaetze <-> Text: Takte "_", Plaetze "-", leere Plaetze am Taktende weg. */
function linkPlaetzeBauen(plaetze, takte, schlaege, platzText) {
    const t = [];
    for (let i = 0; i < takte; i++) {
        const liste = [];
        for (let s = 0; s < schlaege; s++) liste.push(plaetze[i * schlaege + s] ? platzText(plaetze[i * schlaege + s]) : '');
        while (liste.length && liste[liste.length - 1] === '') liste.pop();
        t.push(liste.join('-'));
    }
    return t.join('_');
}
function linkPlaetzeLesen(text, takte, schlaege, platzLesen, unbekannt) {
    const gruppen = String(text).replace(/\s+/g, '').split('_');
    const plaetze = [];
    for (let i = 0; i < takte; i++) {
        const liste = (gruppen[i] || '').split('-');
        for (let s = 0; s < schlaege; s++) {
            const roh = liste[s] || '';
            let p = null;
            if (roh) {
                p = platzLesen(roh);
                if (!p) unbekannt.push({ code: roh, takt: i + 1 });
            }
            plaetze.push(p);
        }
    }
    return plaetze;
}

/* Beat: x = { modus: 'easy'|'profi', schlaege, takte, easy (bzw. oben +
   unten): Plaetze {code, inst} oder null, Laenge takte × schlaege,
   titel, bpm, backbeat, zaehlzeiten, farbe, metronom, loop, alsUebung,
   durchgaenge, proZeile }. Lesen liefert dazu unbekannt: [{code, takt}]. */
function beatLinkBauen(x) {
    const platzText = (p) => {
        const form = typeof BEAT_FORM !== 'undefined' ? BEAT_FORM[p.code] : null;
        return p.code + p.inst.map((inst, i) => (form && form.teile[i].p) ? null
            : '.' + inst.map(k => BEAT_LINK_INST[k] || '').join('')).filter(t => t !== null).join('');
    };
    const ebene1 = x.modus === 'profi' ? x.oben : x.easy;
    const teile = ['b=' + linkPlaetzeBauen(ebene1, x.takte, x.schlaege, platzText)];
    if (x.modus === 'profi') teile.push('u=' + linkPlaetzeBauen(x.unten, x.takte, x.schlaege, platzText));
    return teile.concat(linkKopfBauen(x, BEAT_LINK_STANDARD, BEAT_LINK_SCHALTER)).join('&');
}
function beatLinkLesen(hash) {
    const werte = linkWerte(hash);
    if (werte.b === undefined) return null;
    const erg = linkKopfLesen(werte, BEAT_LINK_STANDARD, BEAT_LINK_SCHALTER);
    erg.modus = werte.u !== undefined ? 'profi' : 'easy';
    erg.takte = Math.max(1, Math.min(LINK_TAKTE_MAX, werte.b.split('_').length));
    erg.unbekannt = [];
    const inst = linkInstUmkehr(BEAT_LINK_INST);
    const platzLesen = (roh) => {
        const [code, ...noten] = roh.split('.');
        const form = typeof BEAT_FORM !== 'undefined' ? BEAT_FORM[code] : null;
        if (!form) return null;
        let n = 0;
        const p = { code, inst: form.teile.map(t => t.p ? [] : (noten[n++] || '').split('').map(b => inst[b]).filter(Boolean)) };
        return typeof platzGueltig === 'function' ? platzGueltig(p) : p;
    };
    if (erg.modus === 'profi') {
        erg.oben = linkPlaetzeLesen(werte.b, erg.takte, erg.schlaege, platzLesen, erg.unbekannt);
        erg.unten = linkPlaetzeLesen(werte.u, erg.takte, erg.schlaege, platzLesen, erg.unbekannt);
    } else {
        erg.easy = linkPlaetzeLesen(werte.b, erg.takte, erg.schlaege, platzLesen, erg.unbekannt);
    }
    return erg;
}

/* Drumset: x = { schlaege, takte, plaetze: {r, n} oder null, titel, bpm,
   zaehlzeiten, farbe, metronom }. Lesen liefert dazu unbekannt. */
function drumLinkBauen(x) {
    const platzText = (p) => p.n.map(inst => inst.map(k => DRUM_LINK_INST[k] || '').join('')).join('.');
    return ['d=' + linkPlaetzeBauen(x.plaetze, x.takte, x.schlaege, platzText)]
        .concat(linkKopfBauen(x, DRUM_LINK_STANDARD, DRUM_LINK_SCHALTER)).join('&');
}
function drumLinkLesen(hash) {
    const werte = linkWerte(hash);
    if (werte.d === undefined) return null;
    const erg = linkKopfLesen(werte, DRUM_LINK_STANDARD, DRUM_LINK_SCHALTER);
    erg.takte = Math.max(1, Math.min(LINK_TAKTE_MAX, werte.d.split('_').length));
    erg.unbekannt = [];
    const inst = linkInstUmkehr(DRUM_LINK_INST);
    const platzLesen = (roh) => {
        const stellen = roh.split('.');
        if (![3, 4, 6].includes(stellen.length)) return null;
        const p = { r: stellen.length, n: stellen.map(s => s.split('').map(b => inst[b]).filter(Boolean)) };
        return typeof dsPlatzGueltig === 'function' ? dsPlatzGueltig(p) : p;
    };
    erg.plaetze = linkPlaetzeLesen(werte.d, erg.takte, erg.schlaege, platzLesen, erg.unbekannt);
    return erg;
}
