import type { Melody, NoteEvent } from "../music";
import { rhythmicDuration } from "./train";

/** Empirical modern 4/4 grid. Source MIDI has no meter/pickup annotations. */
export function learnMeter(corpus: Melody[]) {
  const barTicks = 16,
    smoothing = 8;
  const global = new Map<number, number>();
  const counts = Array.from(
    { length: barTicks },
    () => new Map<number, number>(),
  );
  for (const m of corpus)
    m.notes.forEach((n, i) => {
      const d = rhythmicDuration(m, i);
      const phase = Math.round(n.onset * 4) % barTicks;
      global.set(d, (global.get(d) ?? 0) + 1);
      counts[phase].set(d, (counts[phase].get(d) ?? 0) + 1);
    });
  const durations = [...global.keys()].sort((a, b) => a - b);
  const total = [...global.values()].reduce((a, b) => a + b, 0);
  const marginal = durations.map((d) => global.get(d)! / total);
  const phases = counts.map((row, phase) => {
    const observations = [...row.values()].reduce((a, b) => a + b, 0);
    const probabilities = durations.map(
      (d, j) =>
        ((row.get(d) ?? 0) + smoothing * marginal[j]) /
        (observations + smoothing),
    );
    return {
      phase: phase / 4,
      observations,
      probabilities,
      crossingProbability: probabilities.reduce(
        (s, p, j) => s + (phase + durations[j] * 4 > barTicks ? p : 0),
        0,
      ),
    };
  });
  return {
    barBeats: 4,
    smoothing,
    durations,
    marginal,
    phases,
    assumption:
      "Modern 4/4 grid, original source onsets; no inferred historical meter or pickups",
  };
}
export type MeterPrior = ReturnType<typeof learnMeter>;
export function meterWeight(
  prior: MeterPrior,
  phase: number,
  duration: number,
  strength: number,
) {
  if (!strength) return 1;
  const j = prior.durations.indexOf(duration);
  if (j < 0) throw new Error("Duration absent from learned meter prior");
  return (prior.phases[phase].probabilities[j] / prior.marginal[j]) ** strength;
}
export function meterSummary(notes: readonly NoteEvent[], barBeats = 4) {
  let crossings = 0,
    landings = 0;
  const onsets = Array(barBeats * 4).fill(0) as number[];
  for (const n of notes) {
    const phase = Math.round(n.onset * 4) % onsets.length;
    const ticks = Math.round(n.duration * 4);
    onsets[phase]++;
    if (phase + ticks > onsets.length) crossings++;
    if ((phase + ticks) % onsets.length === 0) landings++;
  }
  return {
    notes: notes.length,
    crossings,
    crossingRate: crossings / notes.length,
    landings,
    onsetCounts: onsets,
  };
}
