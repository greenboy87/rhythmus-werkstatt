/* ---------- Reiter: Rhythmus-Werkstatt | Beat-Werkstatt | Drumset-Werkstatt | Zähl-Training ----------
   Eigene Datei, die als letzte geladen wird: so sind beat.js und
   drumset.js schon eingerichtet, wenn der zuletzt gewaehlte Reiter
   aufgeht. */
const REITER_SCHLUESSEL = 'rw-reiter';
const REITER = {
    rhythmus: { main: 'reiter-rhythmus', untertitel: 'Takte bauen · vorklatschen · einüben' },
    beat:     { main: 'reiter-beat',     untertitel: 'Hi-Hat · Bassdrum · Snare – Beats bauen', druck: 'druck-beat' },
    drumset:  { main: 'reiter-drumset',  untertitel: 'Snare · Toms · Bassdrum · Becken – Fills schreiben', druck: 'druck-drumset' },
    zaehlen:  { main: 'reiter-zaehlen',  untertitel: 'Zählzeiten & Rhythmus-Diktat – allein oder mit der Klasse' }
};
function reiterZeigen(name, nichtMerken) {
    if (!REITER[name]) name = 'rhythmus';
    Object.entries(REITER).forEach(([n, r]) => {
        document.getElementById(r.main).classList.toggle('hidden', n !== name);
        // Drucken (⌘P) nimmt das Blatt des offenen Reiters
        if (r.druck) document.body.classList.toggle(r.druck, n === name);
    });
    document.querySelectorAll('[data-reiter]').forEach(b => {
        const an = b.dataset.reiter === name;
        b.classList.toggle('an', an);
        b.setAttribute('aria-selected', an ? 'true' : 'false');
    });
    document.getElementById('kopf-untertitel').textContent = REITER[name].untertitel;
    if (!nichtMerken) { try { localStorage.setItem(REITER_SCHLUESSEL, name); } catch (e) { /* egal */ } }
    if (name !== 'beat') BeatSpieler.stoppen();
    if (name !== 'drumset') DrumSpieler.stoppen();
    if (name !== 'zaehlen') { zsStoppen(); dkStoppen(); }
    if (name !== 'rhythmus') {
        Vorklatschen.stoppen(true);
        Metronom.stoppen();
    }
    // Breite stimmt erst, wenn der Reiter sichtbar ist
    if (name === 'beat') bwAnzeigeZeichnen();
    else if (name === 'drumset') dsAnzeigeZeichnen();
    else if (name === 'zaehlen') { zsZeichnen(); dkZeichnen(); }
    else anzeigeNeuZeichnen();
}

document.addEventListener('DOMContentLoaded', () => {
    // Minispiele-Seite: nur das Zaehl-Training, ohne den gemerkten Reiter zu aendern
    if (ANSICHT === 'zaehlen') { reiterZeigen('zaehlen', true); return; }
    if (ANSICHT) return;   // Einbett-Ansichten zeigen nur die Rhythmus-Uebung
    document.querySelectorAll('[data-reiter]').forEach(b => b.addEventListener('click', () => reiterZeigen(b.dataset.reiter)));
    let start = 'rhythmus';
    try { start = localStorage.getItem(REITER_SCHLUESSEL) || 'rhythmus'; } catch (e) { /* egal */ }
    // Direktlink auf einen Reiter: ?reiter=zaehlen (bzw. beat, drumset)
    const gewuenscht = new URLSearchParams(location.search).get('reiter');
    if (REITER[gewuenscht]) start = gewuenscht;
    // Ein Link oeffnet immer seinen Reiter: r= Rhythmus, b= Beat, d= Drumset
    const linkReiter = () => /(^|[#&])r=/.test(location.hash) ? 'rhythmus'
        : /(^|[#&])b=/.test(location.hash) ? 'beat'
        : /(^|[#&])d=/.test(location.hash) ? 'drumset' : null;
    start = linkReiter() || start;
    if (start !== 'rhythmus') reiterZeigen(start);
    window.addEventListener('hashchange', () => { if (linkReiter()) reiterZeigen(linkReiter()); });
});
