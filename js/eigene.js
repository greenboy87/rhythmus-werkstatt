/* ============================================================
   EIGENE BAUSTEINE - fuer alle drei Werkstaetten.

   Rhythmus-Werkstatt: Baukasten (#eigen-kasten). Notenwerte von der
   Ganzen bis zur Zweiunddreissigstel nacheinander antippen, wahlweise
   punktiert und/oder als Pause, das Ganze optional als Tuplet (Triole,
   Quintole, Sextole, Septole). Der Baustein bekommt einen
   selbstbeschreibenden Code ("X...", siehe noten.js) und steht danach in
   der Palette - auch in Links und auf anderen Geraeten lesbar. Liste mit
   Namen in localStorage rw-eigene-bausteine.

   Beat- und Drumset-Werkstatt: eine fertig gebaute Zaehlzeit (Rhythmus
   samt Instrumenten) wird als eigener Baustein gespeichert und laesst sich
   dann per Tippen in jede andere Zaehlzeit setzen - wie ein Stempel.
   Gespeichert in rw-beat-eigene (Sechzehntel-Karte: 4 Instrumentlisten)
   bzw. rw-drumset-eigene (Platz {r, n}). Im Stueck selbst landen ganz
   normale Noten - Links brauchen dafuer nichts Neues.
   ============================================================ */

function eigenLesen(schluessel) {
    try {
        const x = JSON.parse(localStorage.getItem(schluessel) || '[]');
        return Array.isArray(x) ? x : [];
    } catch (e) { return []; }
}
function eigenSchreiben(schluessel, liste) {
    try { localStorage.setItem(schluessel, JSON.stringify(liste)); } catch (e) { /* privates Fenster */ }
}
function eigenHtml(text) {
    return String(text).replace(/[&<>"]/g, z => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[z]);
}

/* ---------- Rhythmus-Werkstatt: Baukasten ---------- */
const eigenEntwurf = { tuplet: 0, noten: [] };
let eigenBearbeitet = null;   // Code des Bausteins, der gerade bearbeitet wird

/* Laenge in Vierteln als lesbarer Bruch: 1, 3/2, 2/3 ... */
function eigenLaengeText(d) {
    for (const nenner of [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 28, 32]) {
        const zaehler = Math.round(d * nenner);
        if (Math.abs(zaehler / nenner - d) < 1e-6) {
            const ganz = nenner === 1 ? String(zaehler) : `${zaehler}/${nenner}`;
            return `${ganz} Viertel` + (Math.abs(d - 1) < 1e-6 ? ' – genau eine Zählzeit' : '');
        }
    }
    return d.toFixed(3) + ' Viertel';
}

function eigenKastenZeichnen() {
    const werte = document.getElementById('eigen-werte');
    if (!werte) return;
    const punkt = document.getElementById('eigen-punkt').checked;
    const pause = document.getElementById('eigen-pause').checked;
    werte.innerHTML = [1, 2, 4, 8, 16, 32].map(w => {
        const b = eigenerBausteinBauen(eigenerCode({ tuplet: 0, noten: [{ wert: w, punkt, pause }] }));
        return `<button type="button" class="palette-baustein eigen-wert" data-wert="${w}" title="${EIGEN_WERT_NAME[w]}${punkt ? ', punktiert' : ''}${pause ? ' (Pause)' : ''} anhängen">${bausteinSvg(b)}<span class="eigen-wert-name">${EIGEN_WERT_NAME[w].replace('Zweiunddreißigstel', '32tel').replace('Sechzehntel', '16tel')}</span></button>`;
    }).join('');

    const vorschau = document.getElementById('eigen-vorschau');
    const laenge = document.getElementById('eigen-laenge');
    if (eigenEntwurf.noten.length) {
        const b = eigenerBausteinBauen(eigenerCode(eigenEntwurf));
        vorschau.innerHTML = bausteinSvg(b);
        laenge.textContent = 'Länge: ' + eigenLaengeText(b.dauer);
    } else {
        vorschau.innerHTML = '<span class="anzeige-tipp" style="margin:0">Noch leer – oben Notenwerte antippen.</span>';
        laenge.textContent = '';
    }
    document.getElementById('eigen-tuplet').value = String(eigenEntwurf.tuplet);
    document.getElementById('eigen-speichern').innerHTML = eigenBearbeitet
        ? '<i class="fa-solid fa-check"></i> Änderung speichern'
        : '<i class="fa-solid fa-plus"></i> In die Palette';
    document.getElementById('eigen-speichern').disabled = !eigenEntwurf.noten.length;
    document.getElementById('eigen-abbrechen').classList.toggle('hidden', !eigenBearbeitet);

    const liste = eigeneListe();
    document.getElementById('eigen-liste').innerHTML = liste.length
        ? liste.map(e => {
            const b = bausteinNachCode(e.code);
            return `<div class="eigen-eintrag${e.code === eigenBearbeitet ? ' an' : ''}">` +
                `<span class="eigen-eintrag-bild">${bausteinSvg(b)}</span>` +
                `<span class="eigen-eintrag-name">${eigenHtml(e.name || eigenBeschreibung(eigenerCodeLesen(e.code)))}</span>` +
                `<button type="button" class="btn" data-eigen-bearbeiten="${e.code}" title="Diesen Baustein im Baukasten ändern"><i class="fa-solid fa-pen"></i></button>` +
                `<button type="button" class="btn" data-eigen-weg="${e.code}" title="Aus der Palette nehmen – Takte, die ihn schon benutzen, bleiben, wie sie sind"><i class="fa-solid fa-trash"></i></button>` +
                '</div>';
        }).join('')
        : '<p class="anzeige-tipp" style="margin:0; text-align:left;">Noch keine eigenen Bausteine.</p>';
}
function eigenPaletteNeu() {
    if (typeof editor !== 'undefined' && editor && editor.paletteZeichnen) editor.paletteZeichnen();
}
function eigenSpeichern() {
    if (!eigenEntwurf.noten.length) return;
    const code = eigenerCode(eigenEntwurf);
    const name = document.getElementById('eigen-name').value.trim().slice(0, 40);
    let liste = eigeneListe();
    if (eigenBearbeitet) {
        // An derselben Stelle ersetzen; gab es den neuen Code schon, faellt der doppelte weg
        if (!liste.some(e => e.code === eigenBearbeitet)) liste.push({ code, name });
        liste = liste.map(e => (e.code === eigenBearbeitet ? { code, name } : e))
            .filter((e, j, alle) => alle.findIndex(x => x.code === e.code) === j);
    } else {
        const da = liste.find(e => e.code === code);
        if (da) { da.name = name || da.name; zeigeToast('Diesen Baustein gibt es schon – nur der Name ist neu.', 'info'); }
        else liste.push({ code, name });
    }
    eigeneListeSpeichern(liste);
    const b = bausteinNachCode(code);
    if (b) b.wort = name || eigenBeschreibung(eigenerCodeLesen(code));
    if (!eigenBearbeitet) zeigeToast('Eigener Baustein steht jetzt in der Palette.', 'success');
    else zeigeToast('Baustein geändert. Takte, die die alte Fassung benutzen, bleiben, wie sie sind.', 'info');
    eigenEntwurf.noten = []; eigenEntwurf.tuplet = 0; eigenBearbeitet = null;
    document.getElementById('eigen-name').value = '';
    eigenKastenZeichnen();
    eigenPaletteNeu();
}
function eigenKastenEinrichten() {
    const kasten = document.getElementById('eigen-kasten');
    if (!kasten) return;
    document.getElementById('eigen-werte').addEventListener('click', (e) => {
        const k = e.target.closest('[data-wert]');
        if (!k) return;
        if (eigenEntwurf.noten.length >= EIGEN_MAX_NOTEN) { zeigeToast(`Mehr als ${EIGEN_MAX_NOTEN} Noten gehen in einen Baustein nicht.`, 'danger'); return; }
        eigenEntwurf.noten.push({
            wert: Number(k.dataset.wert),
            punkt: document.getElementById('eigen-punkt').checked && Number(k.dataset.wert) !== 32,
            pause: document.getElementById('eigen-pause').checked
        });
        eigenKastenZeichnen();
    });
    ['eigen-punkt', 'eigen-pause'].forEach(id => document.getElementById(id).addEventListener('change', eigenKastenZeichnen));
    document.getElementById('eigen-tuplet').addEventListener('change', (e) => { eigenEntwurf.tuplet = Number(e.target.value) || 0; eigenKastenZeichnen(); });
    document.getElementById('eigen-zurueck').addEventListener('click', () => { eigenEntwurf.noten.pop(); eigenKastenZeichnen(); });
    document.getElementById('eigen-leeren').addEventListener('click', () => { eigenEntwurf.noten = []; eigenEntwurf.tuplet = 0; eigenKastenZeichnen(); });
    document.getElementById('eigen-speichern').addEventListener('click', eigenSpeichern);
    document.getElementById('eigen-abbrechen').addEventListener('click', () => {
        eigenBearbeitet = null; eigenEntwurf.noten = []; eigenEntwurf.tuplet = 0;
        document.getElementById('eigen-name').value = '';
        eigenKastenZeichnen();
    });
    document.getElementById('eigen-liste').addEventListener('click', (e) => {
        const bearbeiten = e.target.closest('[data-eigen-bearbeiten]');
        const weg = e.target.closest('[data-eigen-weg]');
        if (bearbeiten) {
            const code = bearbeiten.dataset.eigenBearbeiten;
            const x = eigenerCodeLesen(code);
            if (!x) return;
            eigenBearbeitet = code;
            eigenEntwurf.tuplet = x.tuplet; eigenEntwurf.noten = x.noten.map(n => Object.assign({}, n));
            const eintrag = eigeneListe().find(y => y.code === code);
            document.getElementById('eigen-name').value = eintrag ? eintrag.name : '';
            eigenKastenZeichnen();
        } else if (weg) {
            const code = weg.dataset.eigenWeg;
            eigeneListeSpeichern(eigeneListe().filter(y => y.code !== code));
            if (eigenBearbeitet === code) eigenBearbeitet = null;
            zeigeToast('Aus der Palette genommen. Takte, die ihn benutzen, bleiben, wie sie sind.', 'info');
            eigenKastenZeichnen();
            eigenPaletteNeu();
        }
    });
    eigenKastenZeichnen();
}

/* ---------- Beat-Werkstatt: Zaehlzeit als Stempel ---------- */
const BW_EIGEN_SCHLUESSEL = 'rw-beat-eigene';
function bwEigeneListe() {
    return eigenLesen(BW_EIGEN_SCHLUESSEL)
        .filter(e => e && Array.isArray(e.karte) && e.karte.length === 4)
        .map(e => ({ karte: e.karte.map(x => (Array.isArray(x) ? x.filter(i => INST_REIHE.includes(i)) : [])) }))
        .filter(e => e.karte.some(x => x.some(i => i !== 'g')));
}
function bwEigenKarte(eintrag) {
    const m = new Map();
    eintrag.karte.forEach((inst, k) => { if (inst.some(i => i !== 'g')) m.set(k, instSortieren(inst.slice())); });
    return m;
}
function bwEigeneZeichnen() {
    const host = document.getElementById('bw-eigene');
    if (!host) return;
    const liste = bwEigeneListe();
    host.innerHTML = '<span class="schalter-feld">Eigene Bausteine</span>' +
        liste.map((e, i) =>
            `<span class="eigen-stempel"><button type="button" class="palette-baustein bw-baustein" data-bw-eigen="${i}" title="Eigener Baustein ${i + 1} – in die gewählte Zählzeit setzen (alle Instrumente)">` +
            `${bwPlatzSvg(platzAusKarte(bwEigenKarte(e)), 'easy', false)}</button>` +
            `<button type="button" class="eigen-stempel-weg" data-bw-eigen-weg="${i}" title="Eigenen Baustein ${i + 1} löschen" aria-label="Eigenen Baustein ${i + 1} löschen">×</button></span>`).join('') +
        '<button type="button" class="btn" id="bw-eigen-neu" title="Die gerade gewählte Zählzeit mit allen Instrumenten als eigenen Baustein speichern"><i class="fa-solid fa-plus"></i> Gewählte Zählzeit speichern</button>';
}
function bwEigenSpeichern() {
    const karte = [[], [], [], []];
    bwEbenen().forEach(eb => platzKarte(bwDaten(eb)[bwAktiv.platz]).forEach((inst, k) => { karte[k] = instSortieren([...new Set(karte[k].concat(inst))]); }));
    if (!karte.some(x => x.some(i => i !== 'g'))) { zeigeToast('Die gewählte Zählzeit ist leer – erst Noten setzen, dann speichern.', 'danger'); return; }
    const liste = bwEigeneListe();
    if (liste.some(e => JSON.stringify(e.karte) === JSON.stringify(karte))) { zeigeToast('Diesen Baustein gibt es schon.', 'info'); return; }
    liste.push({ karte });
    eigenSchreiben(BW_EIGEN_SCHLUESSEL, liste);
    zeigeToast('Eigener Baustein gespeichert – antippen setzt ihn in die gewählte Zählzeit.', 'success');
    bwEigeneZeichnen();
}
/* Stempel setzen: ersetzt die ganze Zaehlzeit. Zwei Ebenen: Becken oben,
   Bassdrum/Snare (samt Ghost) unten. */
function bwEigenSetzen(i) {
    const e = bwEigeneListe()[i];
    if (!e) return;
    const m = bwEigenKarte(e);
    if (beat.modus === 'easy') {
        bwSetzen('easy', bwAktiv.platz, platzAusKarte(m));
    } else {
        const oben = new Map(), unten = new Map();
        m.forEach((inst, k) => {
            const becken = inst.filter(x => BEAT_BECKEN[x]);
            const trommel = inst.filter(x => BEAT_TROMMEL[x]);
            const g = inst.includes('g') ? ['g'] : [];
            if (becken.length) oben.set(k, instSortieren(trommel.length ? becken : becken.concat(g)));
            if (trommel.length) unten.set(k, instSortieren(trommel.concat(g)));
        });
        bwSetzen('oben', bwAktiv.platz, platzAusKarte(oben));
        bwSetzen('unten', bwAktiv.platz, platzAusKarte(unten));
    }
    bwVorhoeren(platzAusKarte(m));
    if (bwAktiv.platz < bwPlaetze() - 1) bwAktiv.platz++;
    bwAenderung();
}

/* ---------- Drumset-Werkstatt: Zaehlzeit als Stempel ---------- */
const DS_EIGEN_SCHLUESSEL = 'rw-drumset-eigene';
function dsEigeneListe() { return eigenLesen(DS_EIGEN_SCHLUESSEL).map(e => e && dsPlatzGueltig(e.p)).filter(Boolean); }
function dsEigeneZeichnen() {
    const host = document.getElementById('ds-eigene');
    if (!host) return;
    host.innerHTML = '<span class="schalter-feld">Eigene Bausteine</span>' +
        dsEigeneListe().map((p, i) =>
            `<span class="eigen-stempel"><button type="button" class="palette-baustein bw-baustein ds-baustein" data-ds-eigen="${i}" title="Eigener Baustein ${i + 1} – in die gewählte Zählzeit setzen (alle Instrumente)">${dsPlatzSvg(p, 76)}</button>` +
            `<button type="button" class="eigen-stempel-weg" data-ds-eigen-weg="${i}" title="Eigenen Baustein ${i + 1} löschen" aria-label="Eigenen Baustein ${i + 1} löschen">×</button></span>`).join('') +
        '<button type="button" class="btn" id="ds-eigen-neu" title="Die gerade gewählte Zählzeit mit allen Instrumenten als eigenen Baustein speichern"><i class="fa-solid fa-plus"></i> Gewählte Zählzeit speichern</button>';
}
function dsEigenSpeichern() {
    const p = dsPlatzGueltig(ds.plaetze[dsAktiv]);
    if (!p) { zeigeToast('Die gewählte Zählzeit ist leer – erst Noten setzen, dann speichern.', 'danger'); return; }
    const liste = dsEigeneListe();
    if (liste.some(x => JSON.stringify(x) === JSON.stringify(p))) { zeigeToast('Diesen Baustein gibt es schon.', 'info'); return; }
    liste.push(p);
    eigenSchreiben(DS_EIGEN_SCHLUESSEL, liste.map(x => ({ p: x })));
    zeigeToast('Eigener Baustein gespeichert – antippen setzt ihn in die gewählte Zählzeit.', 'success');
    dsEigeneZeichnen();
}
function dsEigenSetzen(i) {
    const p = dsEigeneListe()[i];
    if (!p) return;
    ds.plaetze[dsAktiv] = dsKopie(p);
    dsVorhoeren(p);
    if (dsAktiv < dsPlaetze() - 1) dsAktiv++;
    dsAenderung();
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof ANSICHT !== 'undefined' && ANSICHT) return;
    eigenKastenEinrichten();
    const bw = document.getElementById('bw-eigene');
    if (bw) {
        bw.addEventListener('click', (e) => {
            const weg = e.target.closest('[data-bw-eigen-weg]');
            const setzen = e.target.closest('[data-bw-eigen]');
            if (weg) {
                const liste = bwEigeneListe();
                liste.splice(Number(weg.dataset.bwEigenWeg), 1);
                eigenSchreiben(BW_EIGEN_SCHLUESSEL, liste);
                bwEigeneZeichnen();
            } else if (setzen) bwEigenSetzen(Number(setzen.dataset.bwEigen));
            else if (e.target.closest('#bw-eigen-neu')) bwEigenSpeichern();
        });
        bwEigeneZeichnen();
    }
    const dsh = document.getElementById('ds-eigene');
    if (dsh) {
        dsh.addEventListener('click', (e) => {
            const weg = e.target.closest('[data-ds-eigen-weg]');
            const setzen = e.target.closest('[data-ds-eigen]');
            if (weg) {
                const liste = dsEigeneListe();
                liste.splice(Number(weg.dataset.dsEigenWeg), 1);
                eigenSchreiben(DS_EIGEN_SCHLUESSEL, liste.map(x => ({ p: x })));
                dsEigeneZeichnen();
            } else if (setzen) dsEigenSetzen(Number(setzen.dataset.dsEigen));
            else if (e.target.closest('#ds-eigen-neu')) dsEigenSpeichern();
        });
        dsEigeneZeichnen();
    }
});
