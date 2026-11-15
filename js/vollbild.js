/* ============================================================
   VOLLBILD fuer alle drei Werkstaetten (Beamer, iPad).
   Safari auf dem iPad kennt das Vollbild oft nur mit webkit-Vorsilbe
   (webkitRequestFullscreen, webkitfullscreenchange) - ohne die passierte
   dort gar nichts oder die Karte bekam ihre Vollbild-Klasse nie.
   Gibt es gar kein Element-Vollbild (iPhone, Chrome auf dem iPad, ein
   abgelehnter Aufruf), legt sich die Karte als "Ersatz-Vollbild" fest
   ueber die ganze Seite (Klasse vollbild + vollbild-ersatz) - das sieht
   gleich aus, nur die Browserleiste bleibt sichtbar.
   nachWechsel(an) laeuft nach jedem Wechsel (Notenbild neu aufteilen).
   ============================================================ */
function vollbildElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}
function vollbildEinrichten(karte, knopf, nachWechsel) {
    const knopfZeichnen = (an) => {
        knopf.innerHTML = an ? '<i class="fa-solid fa-compress"></i> Verlassen' : '<i class="fa-solid fa-expand"></i> Vollbild';
    };
    const melden = () => {
        const an = vollbildElement() === karte || karte.classList.contains('vollbild-ersatz');
        karte.classList.toggle('vollbild', an);
        document.body.classList.toggle('vollbild-offen', !!document.querySelector('.vollbild-ersatz'));
        knopfZeichnen(an);
        if (nachWechsel) setTimeout(() => nachWechsel(an), 50);
    };
    const ersatz = (an) => { karte.classList.toggle('vollbild-ersatz', an); melden(); };

    knopf.addEventListener('click', () => {
        if (karte.classList.contains('vollbild-ersatz')) { ersatz(false); return; }
        if (vollbildElement()) {
            (document.exitFullscreen || document.webkitExitFullscreen).call(document);
            return;
        }
        const anfordern = karte.requestFullscreen || karte.webkitRequestFullscreen;
        if (!anfordern) { ersatz(true); return; }
        try {
            const p = anfordern.call(karte);
            if (p && p.catch) p.catch(() => ersatz(true));
        } catch (e) { ersatz(true); }
    });
    document.addEventListener('fullscreenchange', melden);
    document.addEventListener('webkitfullscreenchange', melden);
    // Esc beendet auch das Ersatz-Vollbild (das echte beendet der Browser selbst)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && karte.classList.contains('vollbild-ersatz')) ersatz(false);
    });
    return { an: () => karte.classList.contains('vollbild') };
}
