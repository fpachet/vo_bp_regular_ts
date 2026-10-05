import { readFileSync, writeFileSync } from "node:fs";
import { loadMidi, midiVoices } from "../src/corpus/midi";
import { exportMusicXML } from "../src/export/formats";
import ToneMidi from "@tonejs/midi";
import { annotatePhraseEnds, estimateFinalRhythm } from "../src/markov/phrases";
import type { PieceMetadata } from "../src/music";
const root = new URL("../public/corpus/", import.meta.url);
const metadata = JSON.parse(
  readFileSync(new URL("metadata.json", root), "utf8"),
) as PieceMetadata[];
const corpus = metadata.map((m) => {
  const bytes = new Uint8Array(readFileSync(new URL(m.file!, root)));
  const melody = loadMidi(
    bytes,
    m,
    typeof m.selectedVoice === "number" ? m.selectedVoice : undefined,
  );
  const midi = new ToneMidi.Midi(bytes);
  melody.metadata.meter = {
    events: midi.header.timeSignatures.map((t) => ({
      onset: t.ticks / midi.header.ppq,
      numerator: t.timeSignature[0],
      denominator: t.timeSignature[1],
    })),
    basis: midi.header.timeSignatures.length
      ? "Explicit MIDI time-signature events; not a mensural interpretation"
      : "No source meter events; modern 4/4 grid assumed for modelling",
    firstOnset: melody.notes[0].onset,
    pickupBeats: null,
  };
  melody.metadata.finalRhythm = estimateFinalRhythm(melody);
  melody.metadata.phraseEnds = annotatePhraseEnds(melody);
  melody.metadata.voiceReview =
    "Non-percussion track chosen by highest mean pitch; timing/range and track statistics inspected, cantus identity not musicologically verified";
  console.log(
    m.title,
    midiVoices(bytes).map((v) => ({
      index: v.index,
      name: v.name,
      notes: v.notes.length,
      mean: v.notes.reduce((s, n) => s + n.midi, 0) / v.notes.length,
    })),
    "selected",
    melody.metadata.selectedVoice,
  );
  writeFileSync(
    new URL(`musicxml/${m.id}.musicxml`, root),
    exportMusicXML(melody.notes, m.title),
  );
  return melody;
});
writeFileSync(
  new URL("melodies.json", root),
  JSON.stringify(corpus, null, 2) + "\n",
);
writeFileSync(
  new URL("metadata.json", root),
  JSON.stringify(
    corpus.map((m) => m.metadata),
    null,
    2,
  ) + "\n",
);
console.log(
  "Prepared",
  corpus.length,
  "melodies,",
  corpus.reduce((s, m) => s + m.notes.length, 0),
  "notes",
);
