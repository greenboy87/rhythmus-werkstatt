/* ============================================================
   GENERATOR: wuerfelt eine Uebung aus den ausgewaehlten Bausteinen.
   Jeder Takt wird einzeln gewuerfelt, nach derselben Heuristik wie
   im Vorbild (musik-quiz rhythmusZufall): so lange neu versuchen,
   bis der Takt genau aufgeht und sich nicht wie Unsinn anhoert -
   nicht nur ein einziges Zeichen, nicht mehr Pause als Klang, und
   der erste Schlag muss hoerbar sein.
   ============================================================ */
function taktWuerfeln(erlaubt, soll) {
    for (let versuch = 0; versuch < 400; versuch++) {
        const takt = [];
        let rest = soll, steckt = false;
        while (rest > 0.001 && !steckt) {
            const moeglich = erlaubt.filter(b => b.dauer <= rest + 0.001);
            if (!moeglich.length) { steckt = true; break; }
            takt.push(moeglich[Math.floor(Math.random() * moeglich.length)]);
            rest = soll - takt.reduce((a, b) => a + b.dauer, 0);
        }
        if (!steckt && Math.abs(rest) < 0.001) {
            const nurPause = (b) => b.teile.every(t => t.p);
            const pausen = takt.filter(nurPause).length;
            if (versuch < 200 && takt.length < 2 && soll > 1) continue;
            if (versuch < 200 && pausen * 2 > takt.length) continue;
            if (versuch < 200 && nurPause(takt[0])) continue;
            return takt;
        }
    }
    return null;
}

/* erlaubteCodes: Liste der Baustein-Kuerzel, die verwendet werden duerfen.
   Gibt { takte } oder { fehler } zurueck. */
function uebungErzeugen(erlaubteCodes, anzahlTakte, zeichen) {
    const erlaubt = RHYTHMUS_BAUSTEINE.filter(b => erlaubteCodes.includes(b.code));
    if (!erlaubt.length) return { fehler: 'Wähle mindestens einen Baustein aus.' };
    const soll = taktSoll(zeichen);
    const takte = [];
    for (let t = 0; t < anzahlTakte; t++) {
        const takt = taktWuerfeln(erlaubt, soll);
        if (!takt) return { fehler: 'Aus dieser Auswahl geht kein Takt genau auf - nimm noch einen kürzeren Baustein dazu.' };
        takte.push({ bausteine: takt });
    }
    return { takte };
}
