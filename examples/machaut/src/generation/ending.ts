import type { NoteEvent } from "../music";

export interface EndingOptions {
  /** Quarter-note units. */
  minDuration: number;
  barBeats: number;
}

/** Sustain the last event to a bar boundary, never shortening its sampled value. */
export function holdEnding(notes: NoteEvent[], ending?: EndingOptions | null) {
  if (!ending) return { notes, adjustment: null };
  if (
    !Number.isFinite(ending.minDuration) ||
    ending.minDuration <= 0 ||
    !Number.isFinite(ending.barBeats) ||
    ending.barBeats <= 0
  )
    throw new Error(
      "Ending duration and bar length must be positive finite values",
    );
  if (!notes.length) throw new Error("An ending requires at least one note");
  const last = notes.at(-1)!;
  const minimumEnd = last.onset + Math.max(last.duration, ending.minDuration);
  // Tolerance avoids an extra bar from floating-point error at a boundary.
  const endBeat =
    Math.ceil(minimumEnd / ending.barBeats - 1e-10) * ending.barBeats;
  const duration = endBeat - last.onset;
  return {
    notes: [...notes.slice(0, -1), { ...last, duration }],
    adjustment: {
      position: notes.length,
      sampledDuration: last.duration,
      heldDuration: duration,
      endBeat,
      minDuration: ending.minDuration,
      barBeats: ending.barBeats,
    },
  };
}
