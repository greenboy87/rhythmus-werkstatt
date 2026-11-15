/* ============================================================
   NEU: leeres Blatt in jeder Werkstatt. Steht schon etwas drin, fragt
   ein kleiner Dialog, ob das Alte vorher gespeichert werden soll:
   "Speichern und neu" loest den vorhandenen Speichern-Knopf der
   Werkstatt aus (fragt dort nach dem Namen). Nur wenn danach in der
   Blatt-Auswahl ein Name steht, ist wirklich gespeichert worden - erst
   dann wird geleert. Abbrechen beim Namen = es bleibt alles, wie es war.
   neuEinrichten({ knopf, hatInhalt, speichernKnopf, wahl, leeren })
   ============================================================ */
function neuFragen() {
    return new Promise((fertig) => {
        let d = document.getElementById('neu-dialog');
        if (!d) {
            d = document.createElement('dialog');
            d.id = 'neu-dialog';
            d.className = 'neu-dialog';
            d.innerHTML = `
                <h3><i class="fa-solid fa-file-circle-plus"></i> Neu anfangen?</h3>
                <p>Alles, was gerade eingetragen ist, wird gelöscht. Soll das Alte vorher gespeichert werden?</p>
                <div class="neu-knoepfe">
                    <button type="button" class="btn btn-primär" value="speichern"><i class="fa-solid fa-floppy-disk"></i> Speichern und neu</button>
                    <button type="button" class="btn" value="weg"><i class="fa-solid fa-eraser"></i> Ohne Speichern</button>
                    <button type="button" class="btn" value="">Abbrechen</button>
                </div>`;
            document.body.appendChild(d);
        }
        // Im Vollbild ist nur die Vollbild-Karte zu sehen - der Dialog muss dort hinein
        const voll = (document.fullscreenElement || document.webkitFullscreenElement);
        (voll || document.body).appendChild(d);
        const zu = (wert) => { d.close(); fertig(wert); };
        d.querySelectorAll('button').forEach(b => { b.onclick = () => zu(b.value); });
        d.oncancel = (e) => { e.preventDefault(); zu(''); };
        if (d.showModal) d.showModal();
        else fertig(confirm('Alles löschen und neu anfangen?') ? 'weg' : '');
    });
}

function neuEinrichten({ knopf, hatInhalt, speichernKnopf, wahl, leeren }) {
    knopf.addEventListener('click', async () => {
        if (!hatInhalt()) { leeren(); return; }
        const wahlVorher = wahl.value;
        const antwort = await neuFragen();
        if (!antwort) return;
        if (antwort === 'speichern') {
            wahl.value = '';
            speichernKnopf.click();          // fragt nach dem Namen (prompt, synchron)
            if (!wahl.value) { wahl.value = wahlVorher; return; }   // abgebrochen
        }
        leeren();
        wahl.value = '';
        zeigeToast(antwort === 'speichern' ? 'Gespeichert - neues Blatt ist leer.' : 'Neues, leeres Blatt.', 'info');
    });
}
