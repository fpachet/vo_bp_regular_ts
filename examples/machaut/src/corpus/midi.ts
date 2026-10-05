import ToneMidi from "@tonejs/midi";
import {
  note,
  monophonic,
  validateMelody,
  type Melody,
  type PieceMetadata,
} from "../music";
const { Midi } = ToneMidi;
export function midiVoices(bytes: Uint8Array) {
  const midi = new Midi(bytes);
  return midi.tracks
    .map((t, index) => ({
      index,
      name: t.name || `Track ${index + 1}`,
      channel: t.channel,
      notes: t.notes.map((n) =>
        note(
          n.midi,
          n.durationTicks / midi.header.ppq,
          n.ticks / midi.header.ppq,
        ),
      ),
    }))
    .filter((v) => v.notes.length && v.channel !== 9);
}
export function loadMidi(
  bytes: Uint8Array,
  metadata: PieceMetadata,
  selected?: number,
): Melody {
  const voices = midiVoices(bytes);
  if (!voices.length) throw new Error("MIDI contains no melodic tracks");
  const ranked = voices
    .slice()
    .sort(
      (a, b) =>
        b.notes.reduce((s, n) => s + n.midi, 0) / b.notes.length -
        a.notes.reduce((s, n) => s + n.midi, 0) / a.notes.length,
    );
  const voice =
    selected === undefined
      ? ranked[0]
      : voices.find((v) => v.index === selected);
  if (!voice) throw new Error("Selected MIDI track is unavailable");
  const notes = monophonic(voice.notes);
  return validateMelody({
    id: metadata.id,
    notes,
    metadata: {
      ...metadata,
      voices: voices.length,
      selectedVoice: voice.index,
      final: metadata.final ?? notes.at(-1)!.midi,
      extraction: `${voice.name}; highest mean-pitch track by default, highest simultaneous note, overlap clipped`,
    },
  });
}
