/* ============================================================
   PDF: das Druckblatt (Kopfzeile + #druck-anzeige) als A4-PDF,
   ohne Druckdialog. Ohne Bibliothek, damit es auch ohne Internet
   im Schulnetz geht: Jede Notenzeile wird als Bild auf eine
   300-dpi-Leinwand gezeichnet und als JPEG in eine einseitige
   PDF-Datei gelegt. Das Blatt ist dasselbe wie beim Drucken -
   druckNeuZeichnen() hat Groesse und Zeilen schon auf eine Seite
   eingepasst.
   ============================================================ */

const PDF_SEITE_PX = { b: 794, h: 1123 };   // A4 in CSS-px (96 dpi)
const PDF_RAND_PX = 60;                      // 16 mm wie @page in druck.css
const PDF_PUNKTE = { b: 595.28, h: 841.89 }; // A4 in PDF-Punkten

/* Eine Notenzeile als Bild. Ausserhalb der Seite gibt es kein Stylesheet -
   deshalb hier dieselben Farben setzen wie druck.css (schwarz, Linien grau). */
function systemAlsBild(svg, b, h, k) {
    const kopie = svg.cloneNode(true);
    kopie.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    kopie.setAttribute('width', Math.round(b * k));
    kopie.setAttribute('height', Math.round(h * k));
    kopie.removeAttribute('style');
    kopie.setAttribute('color', '#000');
    kopie.querySelectorAll('.linien-fuenf, .bw-linie-anzeige').forEach(el => el.setAttribute('color', '#666'));
    kopie.querySelectorAll('.bw-spiel, .takt-auswahl').forEach(el => el.remove());   // Mitlese-Flaechen und Loop-Auswahl der Beat-/Drumset-Werkstatt
    kopie.querySelectorAll('.kopf, .zaehlzeit, .handsatz').forEach(el => el.setAttribute('fill', '#000'));
    kopie.querySelectorAll('.jetzt').forEach(el => el.classList.remove('jetzt'));
    const xml = new XMLSerializer().serializeToString(kopie);
    return new Promise((ok, fehler) => {
        const bild = new Image();
        bild.onload = () => ok(bild);
        bild.onerror = () => fehler(new Error('Notenbild ließ sich nicht zeichnen'));
        bild.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    });
}

/* Minimale PDF-Datei: eine Seite, darauf ein JPEG ueber die ganze Flaeche. */
function jpegAlsPdf(jpeg, pxB, pxH, titel) {
    const enc = new TextEncoder();
    const teile = [];
    const versaetze = [];
    let laenge = 0;
    const dazu = (x) => { const t = typeof x === 'string' ? enc.encode(x) : x; teile.push(t); laenge += t.length; };
    const objekt = (nr, inhalt) => { versaetze[nr] = laenge; dazu(`${nr} 0 obj\n`); inhalt(); dazu('\nendobj\n'); };
    // PDF-Strings: Klammern und Backslash maskieren, Umlaute als UTF-16 mit BOM
    const pdfText = (t) => {
        let hex = 'FEFF';
        for (const z of String(t)) {
            const c = z.codePointAt(0);
            if (c > 0xffff) continue;
            hex += c.toString(16).padStart(4, '0').toUpperCase();
        }
        return `<${hex}>`;
    };
    const inhalt = `q ${PDF_PUNKTE.b} 0 0 ${PDF_PUNKTE.h} 0 0 cm /Im0 Do Q`;

    dazu('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    objekt(1, () => dazu('<< /Type /Catalog /Pages 2 0 R >>'));
    objekt(2, () => dazu('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
    objekt(3, () => dazu(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PUNKTE.b} ${PDF_PUNKTE.h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
    objekt(4, () => {
        dazu(`<< /Type /XObject /Subtype /Image /Width ${pxB} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
        dazu(jpeg);
        dazu('\nendstream');
    });
    objekt(5, () => dazu(`<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`));
    objekt(6, () => dazu(`<< /Title ${pdfText(titel)} /Producer ${pdfText('Rhythmus-Werkstatt')} >>`));
    const xref = laenge;
    dazu(`xref\n0 7\n0000000000 65535 f \n${versaetze.slice(1).map(v => String(v).padStart(10, '0') + ' 00000 n \n').join('')}`);
    dazu(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(teile, { type: 'application/pdf' });
}

/* Das aktuelle Druckblatt als PDF-Blob. */
async function notenPdf() {
    druckNeuZeichnen();
    const svgs = [...document.querySelectorAll('#druck-anzeige .anzeige-system')];
    if (!svgs.length) throw new Error('Trage erst einen Rhythmus ein.');
    const titel = document.getElementById('druck-titel').value.trim();
    return blattPdf(svgs, titel, '🥁 Rhythmus-Werkstatt', 'Rhythmus');
}

/* Ein A4-Blatt aus fertig eingepassten Notenzeilen (SVGs mit Groesse im
   style) - gemeinsam fuer Rhythmus- und Beat-Werkstatt (js/beat.js). */
async function blattPdf(svgs, titel, kopfErsatz, pdfErsatz) {

    const k = 2480 / PDF_SEITE_PX.b;            // 300 dpi
    const leinwand = document.createElement('canvas');
    leinwand.width = Math.round(PDF_SEITE_PX.b * k);
    leinwand.height = Math.round(PDF_SEITE_PX.h * k);
    const g = leinwand.getContext('2d');
    g.scale(k, k);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, PDF_SEITE_PX.b, PDF_SEITE_PX.h);
    g.fillStyle = '#000';

    // Kopfzeile wie .druck-kopf: Titel links, Name/Klasse/Datum rechts, Strich darunter
    const schrift = '"DM Sans", system-ui, sans-serif';
    const kopfY = PDF_RAND_PX + 18;
    g.textBaseline = 'alphabetic';
    g.font = `800 17.6px ${schrift}`;
    g.textAlign = 'left';
    g.fillText(titel || kopfErsatz, PDF_RAND_PX, kopfY);
    g.font = `400 12.8px ${schrift}`;
    g.textAlign = 'right';
    g.fillText('Name: ______________    Klasse: ______    Datum: ________', PDF_SEITE_PX.b - PDF_RAND_PX, kopfY);
    g.fillRect(PDF_RAND_PX, kopfY + 8, PDF_SEITE_PX.b - 2 * PDF_RAND_PX, 2);

    let y = kopfY + 8 + 2 + 35;                   // margin-bottom 2.2rem
    const mitte = PDF_SEITE_PX.b / 2;
    for (const svg of svgs) {
        const b = parseFloat(svg.style.width) || svg.getBoundingClientRect().width;
        const h = parseFloat(svg.style.height) || svg.getBoundingClientRect().height;
        const bild = await systemAlsBild(svg, b, h, k);
        g.drawImage(bild, mitte - b / 2, y, b, h);
        y += h + DRUCK_ZEILENABSTAND;
    }

    const jpegBlob = await new Promise(ok => leinwand.toBlob(ok, 'image/jpeg', 0.92));
    const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
    return jpegAlsPdf(jpeg, leinwand.width, leinwand.height, titel || pdfErsatz);
}

function pdfDateiname() {
    return exportDateiname(document.getElementById('druck-titel').value, editor.zeichen(), Metronom.bpm(), 'mp3').replace(/_\d+bpm\.mp3$/, '.pdf');
}

async function pdfHerunterladen() {
    const knopf = document.getElementById('pdf-btn');
    knopf.disabled = true;
    try {
        blobHerunterladen(await notenPdf(), pdfDateiname());
    } catch (e) {
        zeigeToast(e.message, 'danger');
    } finally {
        knopf.disabled = false;
    }
}
