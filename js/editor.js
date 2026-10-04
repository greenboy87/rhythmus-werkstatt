/* ============================================================
   EDITOR: das Eingabefeld fuer einen Rhythmus mit beliebig vielen
   Takten. Jeder Takt ist ein eigener, nicht umbrechender Kasten;
   die Kaesten selbst duerfen als Ganzes umbrechen (CSS flex-wrap) -
   so entsteht der Systemumbruch ganz ohne eigene Layout-Rechnung.
   Getippt wird an die naechste freie Stelle, gezogen wird mit
   Zeigerereignissen (kein HTML5-Drag, das feuert auf dem iPad
   nicht) an eine bestimmte Stelle innerhalb eines Taktes.
   wurzel: Kasten fuer die Takte. paletteWurzel: Kasten fuer die
   ziehbaren Bausteine - beide zusammen bilden ein Eingabefeld.
   ============================================================ */
function rhythmusEditor(wurzel, paletteWurzel, zeichenStart) {
    let zeichen = zeichenStart || '4/4';
    let takte = [{ bausteine: [] }];
    let onAenderung = null;

    wurzel.innerHTML = '<div class="editor-takte"></div>';
    const anzeige = wurzel.querySelector('.editor-takte');

    function soll() { return taktSoll(zeichen); }
    function dauer(t) { return rhythmusDauer(t.bausteine); }

    function naechsteFreieStelle() {
        for (let i = 0; i < takte.length; i++) {
            if (dauer(takte[i]) < soll() - 0.001) return { taktNr: i, index: takte[i].bausteine.length };
        }
        return { taktNr: takte.length - 1, index: takte[takte.length - 1].bausteine.length };
    }
    function einfuegenAmEnde(baustein) {
        const stelle = naechsteFreieStelle();
        takte[stelle.taktNr].bausteine.splice(stelle.index, 0, baustein);
        zeichnen();
    }
    function einfuegenBei(taktNr, index, baustein) {
        takte[taktNr].bausteine.splice(index, 0, baustein);
        zeichnen();
    }
    function entfernenBei(taktNr, index) {
        takte[taktNr].bausteine.splice(index, 1);
        zeichnen();
    }
    function zurueck() {
        for (let i = takte.length - 1; i >= 0; i--) {
            if (takte[i].bausteine.length) { takte[i].bausteine.pop(); break; }
        }
        zeichnen();
    }
    function leeren() { takte.forEach(t => t.bausteine = []); zeichnen(); }
    function taktHinzufuegen() { takte.push({ bausteine: [] }); zeichnen(); }
    function taktEntfernenBei(nr) {
        if (takte.length <= 1) return;
        takte.splice(nr, 1);
        zeichnen();
    }
    function taktartSetzen(z) { zeichen = z; zeichnen(); }

    function stelleAn(x, y) {
        const kaesten = [...anzeige.querySelectorAll('.editor-takt')];
        let bester = -1, besterAbstand = Infinity;
        kaesten.forEach((k, taktNr) => {
            const r = k.getBoundingClientRect();
            const abstand = Math.max(0, r.top - y, y - r.bottom) + Math.max(0, r.left - x, x - r.right);
            if (abstand < besterAbstand) { besterAbstand = abstand; bester = taktNr; }
        });
        if (bester < 0 || besterAbstand > 60) return null;
        const plaetze = [...kaesten[bester].querySelectorAll('.editor-platz')];
        for (let i = 0; i < plaetze.length; i++) {
            const pr = plaetze[i].getBoundingClientRect();
            if (x < pr.left + pr.width / 2) return { taktNr: bester, index: i };
        }
        return { taktNr: bester, index: takte[bester].bausteine.length };
    }
    function zielZeigen(x, y) {
        zielLoeschen();
        const stelle = stelleAn(x, y);
        if (!stelle) return;
        const kasten = anzeige.querySelectorAll('.editor-takt')[stelle.taktNr];
        const plaetze = kasten ? [...kasten.querySelectorAll('.editor-platz')] : [];
        const ziel = plaetze[stelle.index] || plaetze[plaetze.length - 1];
        if (ziel) ziel.classList.add('ziel');
    }
    function zielLoeschen() { anzeige.querySelectorAll('.editor-platz.ziel').forEach(p => p.classList.remove('ziel')); }

    /* Ziehen und Tippen aus einer Hand: kurzer Tipper haengt hinten an,
       Ziehen setzt an die Stelle, auf die gezeigt wird. */
    function ziehenEinrichten(knopf, baustein) {
        let geist = null, gezogen = false, start = null;
        knopf.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            start = { x: e.clientX, y: e.clientY };
            gezogen = false;
            try { knopf.setPointerCapture(e.pointerId); } catch (_) { /* kein echter Zeiger - dann ohne */ }
        });
        knopf.addEventListener('pointermove', (e) => {
            if (!start) return;
            if (!gezogen && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 8) return;
            gezogen = true;
            knopf.classList.add('gezogen');
            if (!geist) {
                geist = document.createElement('div');
                geist.className = 'rhy-geist';
                geist.innerHTML = bausteinSvg(baustein);
                document.body.appendChild(geist);
            }
            geist.style.left = (e.clientX - 30) + 'px';
            geist.style.top = (e.clientY - 34) + 'px';
            zielZeigen(e.clientX, e.clientY);
        });
        const loslassen = (e) => {
            if (!start) return;
            start = null;
            knopf.classList.remove('gezogen');
            if (geist) { geist.remove(); geist = null; }
            if (!gezogen) { einfuegenAmEnde(baustein); return; }
            const stelle = stelleAn(e.clientX, e.clientY);
            zielLoeschen();
            if (stelle) einfuegenBei(stelle.taktNr, stelle.index, baustein);
        };
        knopf.addEventListener('pointerup', loslassen);
        knopf.addEventListener('pointercancel', () => {
            start = null; gezogen = false; knopf.classList.remove('gezogen');
            if (geist) { geist.remove(); geist = null; }
            zielLoeschen();
        });
    }

    if (paletteWurzel) {
        paletteWurzel.innerHTML = '';
        RHYTHMUS_BAUSTEINE.forEach(b => {
            const knopf = document.createElement('button');
            knopf.type = 'button';
            knopf.className = 'palette-baustein';
            knopf.title = b.wort;
            knopf.innerHTML = bausteinSvg(b);
            ziehenEinrichten(knopf, b);
            paletteWurzel.appendChild(knopf);
        });
    }

    function zeichnen() {
        anzeige.innerHTML = '';
        takte.forEach((takt, taktNr) => {
            const box = document.createElement('div');
            box.className = 'editor-takt';
            const nr = document.createElement('span');
            nr.className = 'takt-nr'; nr.textContent = taktNr + 1;
            box.appendChild(nr);

            takt.bausteine.forEach((b, i) => {
                const platz = document.createElement('div');
                platz.className = 'editor-platz';
                platz.title = b.wort + ' (antippen zum Entfernen)';
                platz.innerHTML = bausteinSvg(b);
                platz.addEventListener('click', () => entfernenBei(taktNr, i));
                box.appendChild(platz);
            });
            let frei = Math.max(0, soll() - dauer(takt));
            while (frei > 0.001) {
                const platz = document.createElement('div');
                platz.className = 'editor-platz leer';
                box.appendChild(platz);
                frei -= Math.min(1, frei);
            }
            const entf = document.createElement('button');
            entf.type = 'button'; entf.className = 'takt-entfernen'; entf.innerHTML = '×';
            entf.title = 'Diesen Takt entfernen';
            entf.addEventListener('click', () => taktEntfernenBei(taktNr));
            box.appendChild(entf);

            anzeige.appendChild(box);
        });
        if (typeof onAenderung === 'function') onAenderung();
    }

    zeichnen();

    return {
        stueck: () => ({ zeichen, takte: takte.map(t => ({ bausteine: t.bausteine.slice() })) }),
        setzen: (neuesZeichen, neueTakte) => {
            zeichen = neuesZeichen || zeichen;
            takte = (neueTakte && neueTakte.length) ? neueTakte.map(t => ({ bausteine: t.bausteine.slice() })) : [{ bausteine: [] }];
            zeichnen();
        },
        leeren, zurueck, taktHinzufuegen, taktartSetzen,
        zeichen: () => zeichen,
        anzahlTakte: () => takte.length,
        aufAenderung: (fn) => { onAenderung = fn; }
    };
}
