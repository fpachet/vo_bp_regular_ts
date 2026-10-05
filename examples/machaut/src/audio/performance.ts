import type { NoteEvent } from "../music";

/** Playback seconds only; the symbolic melody is never mutated. */
export function renderPerformance(notes: readonly NoteEvent[], bpm: number, natural = true) {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error("Tempo must be positive");
  const beat = 60 / bpm;
  return notes.map((note, index) => ({
    midi: note.midi,
    onset: note.onset * beat,
    duration: note.duration * beat * (natural ? (index === notes.length - 1 ? 1.15 : 0.96) : 1),
    velocity: natural ? (index === notes.length - 1 ? 70 : 75 + (index % 4 === 0 ? 2 : -1)) : 75,
  }));
}
