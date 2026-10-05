export interface PieceMetadata {
  id: string;
  title: string;
  genre?: "virelai" | "rondeau" | "ballade" | "lai" | "motet" | "other";
  voices?: number;
  selectedVoice?: string | number;
  source?: string;
  mode?: string;
  final?: number;
  file?: string;
  sha256?: string;
  transcriptionLicense?: string;
  extraction?: string;
  retrieved?: string;
  pilot?: boolean;
  genreBasis?: string;
  meter?: {
    events: { onset: number; numerator: number; denominator: number }[];
    basis: string;
    firstOnset: number;
    pickupBeats: number | null;
  };
  phraseEnds?: {
    note: number;
    kind: "terminal" | "internal";
    basis: string;
    gapBeats: number;
  }[];
  voiceReview?: string;
  finalRhythm?: {
    duration: number;
    soundingDuration: number;
    releaseGap: number;
    observations: number;
    basis: string;
  };
}
export interface NoteEvent {
  midi: number;
  pitchClass: number;
  duration: number;
  onset: number;
}
export interface Melody {
  id: string;
  notes: NoteEvent[];
  metadata: PieceMetadata;
}
export type Representation = "absolute" | "intervals" | "relative";
export const pitchName = (midi: number) =>
  ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][
    ((midi % 12) + 12) % 12
  ] +
  (Math.floor(midi / 12) - 1);
export function note(midi: number, duration = 1, onset = 0): NoteEvent {
  if (
    !Number.isInteger(midi) ||
    midi < 0 ||
    midi > 127 ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(onset) ||
    onset < 0
  )
    throw new Error("Invalid pitch or note timing");
  return { midi, pitchClass: midi % 12, duration, onset };
}
export function validateMelody(melody: Melody): Melody {
  if (!melody || !Array.isArray(melody.notes) || !melody.notes.length)
    throw new Error("No pitched notes found");
  if (
    typeof melody.id !== "string" ||
    !melody.metadata ||
    typeof melody.metadata.title !== "string"
  )
    throw new Error("Invalid melody metadata");
  if (melody.notes.length > 5000)
    throw new Error("A melodic voice is limited to 5,000 notes");
  if (melody.metadata.final !== undefined) note(melody.metadata.final);
  if (melody.metadata.finalRhythm)
    note(60, melody.metadata.finalRhythm.duration);
  let end = -Infinity;
  for (const n of melody.notes) {
    note(n.midi, n.duration, n.onset);
    if (n.onset < end - 1e-7) throw new Error("Selected voice is polyphonic");
    end = n.onset + n.duration;
  }
  return melody;
}
/** Keep the highest simultaneous note; truncate overlapping sustains to the next onset. */
export function monophonic(notes: NoteEvent[]): NoteEvent[] {
  const sorted = notes
    .slice()
    .sort((a, b) => a.onset - b.onset || b.midi - a.midi);
  const unique = sorted.filter(
    (n, i) => !i || Math.abs(n.onset - sorted[i - 1].onset) > 1e-7,
  );
  return unique.map((n, i) =>
    note(
      n.midi,
      Math.min(
        n.duration,
        unique[i + 1] ? unique[i + 1].onset - n.onset : n.duration,
      ),
      n.onset,
    ),
  );
}
export const intervals = (notes: readonly NoteEvent[]) =>
  notes.slice(1).map((n, i) => n.midi - notes[i].midi);
export function tokens(melody: Melody, rep: Representation): number[] {
  if (rep === "intervals") return intervals(melody.notes);
  const final = melody.metadata.final ?? melody.notes.at(-1)!.midi;
  return melody.notes.map((n) =>
    rep === "relative" ? n.midi - final : n.midi,
  );
}
