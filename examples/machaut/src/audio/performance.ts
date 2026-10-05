import type { NoteEvent } from "../music";

export type PerformanceInstrument = "recorder" | "orchestral_harp" | "fiddle" | "church_organ" | "choir_aahs";
const articulation: Record<PerformanceInstrument, number> = {
  recorder: 0.96, orchestral_harp: 1, fiddle: 0.99, church_organ: 0.98, choir_aahs: 0.98,
};

/** Exact onset timing; phrase breaths shorten releases without shifting the score. */
export function renderPerformance(notes: readonly NoteEvent[], bpm: number, natural = true,
  instrument: PerformanceInstrument = "recorder", phraseEnds: readonly number[] = []) {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error("Tempo must be positive");
  const beat = 60 / bpm;
  const endings = new Set(phraseEnds);
  return notes.map((note, index) => {
    const final = index === notes.length - 1;
    const phraseEnd = endings.has(index + 1) && !final;
    const breath = instrument === "recorder" || instrument === "choir_aahs";
    const duration = note.duration * beat;
    const nextSpacing = final ? Infinity : (notes[index + 1].onset - note.onset) * beat;
    let performedDuration = natural ? duration * (final ? 1.15 : articulation[instrument]) : duration;
    if (natural && phraseEnd && breath) {
      // At most 60 ms, capped at 15% of the note; existing rests already provide a breath.
      const gap = Math.min(0.06, duration * 0.15);
      performedDuration = Math.min(performedDuration, Math.max(duration * 0.5, nextSpacing - gap));
    }
    const onBeat = Math.abs(note.onset - Math.round(note.onset)) < 1e-6;
    return {
      midi: note.midi,
      onset: note.onset * beat,
      duration: performedDuration,
      velocity: natural ? (final ? 70 : 75 + (onBeat ? 2 : -1) - (phraseEnd ? 3 : 0)) : 75,
    };
  });
}
