/* ============================================================
   EXPORT: Rhythmus als Audiodatei (MP3 oder WAV) - fuer PowerPoint,
   Exen und Hoerbeispiele. Klingt exakt wie "Abspielen": derselbe
   Zeitplan (rhythmusZeitplan in audio.js), dieselben Klangfunktionen,
   nur in einen OfflineAudioContext gerendert statt live gespielt -
   also schneller als Echtzeit und ohne dass etwas zu hoeren ist.
   Auch automatisiert aufrufbar (z.B. per Playwright), siehe CLAUDE.md.
   ============================================================ */

const EXPORT_RATE = 44100;
const EXPORT_AUSKLANG = 0.5;      // Sekunden Stille nach dem letzten Schlag
const EXPORT_SPITZE = Math.pow(10, -1 / 20);   // -1 dBFS
const EXPORT_FENSTER = 0.4;   // Sekunden je Einzelschlag beim Rendern, laenger als jeder Klang

/* Kleiner, fester Zufallsgenerator (mulberry32). Die Rausch-Klaenge
   (Klatschen, Holzblock, Klick) wuerfeln ihr Rauschen mit Math.random -
   live egal, fuer den Export aber soll derselbe Rhythmus mit denselben
   Einstellungen immer exakt dieselbe Datei ergeben. Deshalb wird
   Math.random NUR waehrend des (synchronen) Einplanens ersetzt. */
function exportZufall(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* Standardwerte = was gerade auf der Seite eingestellt ist (app.js stellt
   seitenEinstellungen bereit). Ohne Seite: feste Grundwerte. */
function exportStandard() {
    if (typeof seitenEinstellungen === 'function') return seitenEinstellungen();
    return { bpm: 90, vorlaufTakte: 1, durchgaenge: 1, klang: 'klatschen', metronom: 0.6, nurMetronom: false };
}

/* 16-bit-PCM-WAV, mono, aus Float-Samples (-1..1). */
function wavKodieren(samples, rate) {
    const puffer = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(puffer);
    const text = (pos, s) => { for (let i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i)); };
    text(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE');
    text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    text(36, 'data'); v.setUint32(40, samples.length * 2, true);
    const pcm = alsInt16(samples);
    for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, pcm[i], true);
    return new Blob([puffer], { type: 'audio/wav' });
}

function alsInt16(samples) {
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        pcm[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7FFF);
    }
    return pcm;
}

/* MP3 mit lamejs (js/vendor/lame.min.js), 128 kbit/s. */
function mp3Kodieren(samples, rate) {
    if (typeof lamejs === 'undefined' || !lamejs.Mp3Encoder) throw new Error('MP3-Encoder (lamejs) nicht geladen.');
    const enc = new lamejs.Mp3Encoder(1, rate, 128);
    const pcm = alsInt16(samples);
    const teile = [];
    const BLOCK = 1152;
    for (let i = 0; i < pcm.length; i += BLOCK) {
        const mp3 = enc.encodeBuffer(pcm.subarray(i, i + BLOCK));
        if (mp3.length) teile.push(mp3);
    }
    const rest = enc.flush();
    if (rest.length) teile.push(rest);
    return new Blob(teile, { type: 'audio/mpeg' });
}

/* stueck: { zeichen, takte: [{ bausteine }] } wie editor.stueck() - ohne
   Angabe der Rhythmus im Editor. optionen (alle optional, Standard =
   aktuelle Einstellungen der Seite):
     format 'mp3'|'wav' (Standard mp3), bpm, vorlaufTakte, durchgaenge,
     klang 'klatschen'|'holzblock'|'klick'|'trommel',
     metronom 0-1 (0 = ohne Metronom), nurMetronom (bool).
   Liefert ein Promise auf einen Blob. */
async function rhythmusAudio(stueck, optionen) {
    if (!stueck && typeof editor !== 'undefined' && editor) stueck = editor.stueck();
    if (!stueck || !stueck.takte || !stueck.takte.length) throw new Error('Kein Rhythmus angegeben.');
    const opt = Object.assign({ format: 'mp3' }, exportStandard(), optionen || {});
    const klangFn = KLATSCH_KLAENGE[opt.klang] || KLATSCH_KLAENGE.klatschen;
    const metronom = Math.max(0, Math.min(1, Number(opt.metronom) || 0));

    const plan = rhythmusZeitplan(stueck, {
        bpm: opt.bpm, vorlaufTakte: opt.vorlaufTakte, durchgaenge: opt.durchgaenge, nurMetronom: opt.nurMetronom, zeilen: opt.zeilen
    });
    const laenge = Math.ceil((plan.dauer + EXPORT_AUSKLANG) * EXPORT_RATE);
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) throw new Error('Dieser Browser kann kein Audio erzeugen.');

    /* Jeder Schlag wird einzeln gerendert - in einem gemeinsamen Kontext,
       aber in eigenen, weit auseinanderliegenden Zeitfenstern, so dass sich
       nichts ueberlappt - und erst hier in fester Reihenfolge an seine
       Stelle gemischt. Grund: Klingen mehrere Quellen gleichzeitig in EINEM
       Kontext (Conga-Sechstole, Klatschen + Metronom), summiert der Browser
       sie nicht immer in derselben Reihenfolge, und die Datei wich bei jedem
       Export um ein paar Bit ab. Jeder Schlag liegt in seinem Fenster an
       derselben Stelle relativ zum 128-Sample-Block der Audio-Engine wie im
       Original (samt Bruchteil eines Samples): Chrome rechnet manche Rampen
       (Conga) blockweise, nur so ist das Ergebnis dasselbe, als laege der
       Schlag direkt an seiner Stelle - wie beim Live-Abspielen. */
    const BLOCK = 128;
    const FENSTER = Math.ceil(EXPORT_FENSTER * EXPORT_RATE / BLOCK) * BLOCK;
    async function spurMischen(ziel, liste, spielen) {
        if (!liste.length) return;
        const ctx = new Offline(1, (liste.length + 1) * FENSTER, EXPORT_RATE);
        const echterZufall = Math.random;
        Math.random = exportZufall(20260101);
        const anfaenge = [];
        try {
            liste.forEach((e, i) => {
                const pos = e.zeit * EXPORT_RATE;
                const basis = Math.floor(pos / BLOCK) * BLOCK;   // Blockanfang vor dem Schlag
                anfaenge.push(basis);
                spielen(ctx, (i * FENSTER + (pos - basis)) / EXPORT_RATE, e);
            });
        } finally { Math.random = echterZufall; }
        const daten = (await ctx.startRendering()).getChannelData(0);
        anfaenge.forEach((basis, i) => {
            const von = i * FENSTER, bis = Math.min(FENSTER, ziel.length - basis);
            for (let k = 0; k < bis; k++) ziel[basis + k] += daten[von + k];
        });
    }

    const samples = new Float32Array(laenge);
    await spurMischen(samples, plan.ereignisse.filter(e => e.art === 'klatsch'), (ctx, zeit) => klangFn(ctx, zeit));
    if (metronom > 0) {
        // Eigener Gain-Knoten fuer die Metronom-Lautstaerke - der globale
        // metronomGainNode des Live-Contexts bleibt unangetastet.
        let metroZiel = null;
        await spurMischen(samples, plan.ereignisse.filter(e => e.art === 'klick'), (ctx, zeit, e) => {
            if (!metroZiel) {
                metroZiel = ctx.createGain();
                metroZiel.gain.value = metronom;
                metroZiel.connect(ctx.destination);
            }
            metronomKlick(ctx, zeit, e.betont, metroZiel);
        });
    }

    let spitze = 0;
    for (let i = 0; i < samples.length; i++) { const a = Math.abs(samples[i]); if (a > spitze) spitze = a; }
    if (spitze > 0) {
        const faktor = EXPORT_SPITZE / spitze;
        for (let i = 0; i < samples.length; i++) samples[i] *= faktor;
    }
    return opt.format === 'wav' ? wavKodieren(samples, EXPORT_RATE) : mp3Kodieren(samples, EXPORT_RATE);
}

/* Dateiname aus Titel, Taktart und Tempo: "Uebung-1_4-4_90bpm.mp3". */
function exportDateiname(titel, zeichen, bpm, format) {
    const umschrift = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss' };
    const name = String(titel || '').trim()
        .replace(/[äöüÄÖÜß]/g, z => umschrift[z])
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'Rhythmus';
    return `${name}_${String(zeichen || '4/4').replace('/', '-')}_${bpm}bpm.${format === 'wav' ? 'wav' : 'mp3'}`;
}

/* Download per Blob-URL und <a download> - geht auch in Safari auf dem
   iPad. Die URL erst spaeter freigeben: Safari liest sie teils erst nach
   dem Klick, ein sofortiges revoke liefert dort eine leere Datei. */
function blobHerunterladen(blob, dateiname) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = dateiname; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}
