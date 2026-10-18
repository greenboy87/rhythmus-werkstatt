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
