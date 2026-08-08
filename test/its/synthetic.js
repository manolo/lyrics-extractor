// The synthetic scores: which generator writes each one.
//
// They are ours and tiny, so the .mscz is committed and travels with the repository, which is
// what lets CI run their snapshots. The generator is how the score is edited, and
// test/synthetic-scores.test.js fails if the two drift apart.
//
// Nothing else is listed here. The snapshot suite discovers what to run from the baselines on
// disk (test/its/snapshot.js), so adding a score means adding its files, not editing a list, and
// a developer's own scores can live in test/local/ without this repository knowing their names.
var SYNTHETIC = {
    MultiVerso: "build-multiverse.js",
    Navegacion: "build-navigation.js",
    SoloAcordes: "build-chords-only.js",
    VoltasInstrumentales: "build-instrumental-voltas.js",
    LineasLargas: "build-long-lines.js",
    Cifrados: "build-chord-spellings.js",
    Etiquetas: "build-labels.js",
    IntroSalida: "build-intro-outro.js",
    Diagramas: "build-fret-diagrams.js"
};

module.exports = { SYNTHETIC: SYNTHETIC };
