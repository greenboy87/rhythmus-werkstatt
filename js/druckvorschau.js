/* ============================================================
   DRUCKVORSCHAU fuer alle drei Werkstaetten: Das A4-Blatt wird so
   gezeigt, wie es im PDF landet (dieselbe Leinwand wie blattPdf in
   pdf.js). Mit −/+ wird die Groesse der Noten auf dem Blatt eingestellt,
   unabhaengig von der Groesse am Bildschirm, gemerkt je Werkstatt
   (localStorage rw-druckgroesse-<werkstatt>). Groesser als eine Seite
   geht nicht: Ist das Blatt voll, sagt ein Hinweis das.

   druckGroesse(werkstatt) -> Faktor (1 = 100 %), fuer die Druck-Zeichner.
   Druckvorschau.oeffnen({
       werkstatt,            // 'rhythmus' | 'beat' | 'drumset'
       blatt(),              // zeichnet das Druckblatt neu -> { svgs, titel, kopfErsatz, begrenzt }
       pdf(), drucken()      // die vorhandenen Aktionen der Werkstatt
   })
   ============================================================ */
const DRUCK_GROESSE_MIN = 50, DRUCK_GROESSE_MAX = 200;
function druckGroesse(werkstatt) {
    try {
        const n = Number(localStorage.getItem('rw-druckgroesse-' + werkstatt));
        if (n >= DRUCK_GROESSE_MIN && n <= DRUCK_GROESSE_MAX) return n / 100;
    } catch (e) { /* egal */ }
    return 1;
}

const Druckvorschau = (function () {
    let dlg = null, cfg = null, lauf = 0;

    function bauen() {
        dlg = document.createElement('dialog');
        dlg.className = 'druckvorschau';
        dlg.innerHTML = `
            <div class="dv-leiste">
                <h3><i class="fa-solid fa-print"></i> Druckvorschau</h3>
                <span class="stufen" title="Größe der Noten auf dem Blatt">
                    <span class="stufen-name"><i class="fa-solid fa-magnifying-glass"></i> Größe</span>
                    <button type="button" class="btn" data-dv="minus" aria-label="Kleiner">−</button>
                    <span class="stufen-wert" data-dv="wert">100%</span>
                    <button type="button" class="btn" data-dv="plus" aria-label="Größer">+</button>
                </span>
                <span class="fuellt" style="flex:1"></span>
                <button type="button" class="btn btn-primär" data-dv="pdf"><i class="fa-solid fa-file-pdf"></i> Als PDF</button>
                <button type="button" class="btn" data-dv="drucken"><i class="fa-solid fa-print"></i> Drucken</button>
                <button type="button" class="btn btn-icon" data-dv="zu" title="Schließen" aria-label="Schließen"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <p class="dv-hinweis" data-dv="hinweis"></p>
            <div class="dv-flaeche"><div class="dv-seite" data-dv="seite"></div></div>`;
        document.body.appendChild(dlg);
        const teil = (n) => dlg.querySelector(`[data-dv="${n}"]`);
        gedrueckthalten(teil('minus'), () => schritt(-10));
        gedrueckthalten(teil('plus'), () => schritt(10));
        teil('zu').addEventListener('click', () => dlg.close());
        teil('pdf').addEventListener('click', async () => {
            const k = teil('pdf');
            k.disabled = true;
            try { await cfg.pdf(); } finally { k.disabled = false; }
        });
        teil('drucken').addEventListener('click', () => {
            dlg.close();
            cfg.blatt();          // Druckblatt steht mit der eingestellten Groesse bereit
            setTimeout(() => cfg.drucken(), 50);
        });
        // Klick neben das Blatt (auf den Hintergrund) schliesst
        dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    }

    function prozent() { return Math.round(druckGroesse(cfg.werkstatt) * 100); }
    function schritt(d) {
        const n = Math.max(DRUCK_GROESSE_MIN, Math.min(DRUCK_GROESSE_MAX, prozent() + d));
        try { localStorage.setItem('rw-druckgroesse-' + cfg.werkstatt, n); } catch (e) { /* egal */ }
        zeichnen();
    }

    async function zeichnen() {
        const meinLauf = ++lauf;
        const teil = (n) => dlg.querySelector(`[data-dv="${n}"]`);
        teil('wert').textContent = prozent() + '%';
        const b = cfg.blatt();
        teil('hinweis').textContent = !b.svgs.length
            ? 'Noch keine Noten - erst etwas eintragen.'
            : b.begrenzt ? 'Das Blatt ist voll: Größer passt nicht mehr auf eine Seite.' : '';
        teil('plus').disabled = prozent() >= DRUCK_GROESSE_MAX;
        teil('minus').disabled = prozent() <= DRUCK_GROESSE_MIN;
        try {
            const leinwand = await blattLeinwand(b.svgs, b.titel, b.kopfErsatz, 1.5);
            if (meinLauf !== lauf) return;      // inzwischen weitergedrueckt
            const seite = teil('seite');
            seite.innerHTML = '';
            seite.appendChild(leinwand);
        } catch (e) {
            zeigeToast(e.message, 'danger');
        }
    }

    function oeffnen(c) {
        cfg = c;
        if (!dlg) bauen();
        // Im Vollbild ist nur die Vollbild-Karte zu sehen - der Dialog muss dort hinein
        (document.fullscreenElement || document.webkitFullscreenElement || document.body).appendChild(dlg);
        if (!dlg.open) dlg.showModal();
        zeichnen();
    }
    return { oeffnen };
})();
