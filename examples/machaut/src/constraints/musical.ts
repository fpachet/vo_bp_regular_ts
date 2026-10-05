import { DFA } from "markov-constraints";
import type { Representation } from "../music";
export interface CadenceConstraint {
  finalPitch: number;
  allowedPenultimateIntervals?: number[];
  lastNIntervals?: number[][];
}
export interface RepeatConstraint {
  from: number;
  to: number;
  count: number;
}
export interface MusicalConstraints {
  length: number;
  start: number | null;
  final: number | null;
  referenceFinal: number;
  minPitch: number;
  maxPitch: number;
  maxSpan: number | null;
  maxLeap: number;
  allowedPitchClasses: number[];
  fixed: Record<string, number[]>;
  forbiddenIntervals: number[];
  cadence: CadenceConstraint | null;
  repeat: RepeatConstraint | null;
}
export function validateConstraints(c: MusicalConstraints) {
  const pitch = (n: number) => Number.isInteger(n) && n >= 0 && n <= 127;
  if (
    !Number.isInteger(c.length) ||
    c.length < 8 ||
    c.length > 128 ||
    !pitch(c.referenceFinal) ||
    !pitch(c.minPitch) ||
    !pitch(c.maxPitch) ||
    c.minPitch > c.maxPitch ||
    ![c.start, c.final].every((n) => n === null || pitch(n))
  )
    throw new Error("Invalid length or pitch range");
  if (
    !Number.isInteger(c.maxLeap) ||
    c.maxLeap < 0 ||
    c.maxLeap > 127 ||
    !c.allowedPitchClasses.length ||
    c.allowedPitchClasses.some(
      (n) => !Number.isInteger(n) || n < 0 || n > 11,
    ) ||
    c.forbiddenIntervals.some((n) => !Number.isInteger(n) || Math.abs(n) > 127)
  )
    throw new Error("Invalid interval or pitch-class constraint");
  if (
    c.maxSpan !== null &&
    (!Number.isInteger(c.maxSpan) || c.maxSpan < 0 || c.maxSpan > 127)
  )
    throw new Error("Invalid maximum span");
  for (const [position, pitches] of Object.entries(c.fixed))
    if (
      !Number.isInteger(Number(position)) ||
      Number(position) < 1 ||
      Number(position) > c.length ||
      !pitches.length ||
      pitches.some((n) => !pitch(n))
    )
      throw new Error(
        "Fixed positions use one-based note numbers within the melody",
      );
  if (c.cadence) {
    if (
      !pitch(c.cadence.finalPitch) ||
      c.cadence.allowedPenultimateIntervals?.some(
        (n) => !Number.isInteger(n),
      ) ||
      c.cadence.lastNIntervals?.some(
        (p) =>
          !p.length ||
          p.length >= c.length ||
          p.some((n) => !Number.isInteger(n)),
      )
    )
      throw new Error("Invalid cadence");
  }
  if (c.repeat) {
    const r = c.repeat;
    if (
      ![r.from, r.to, r.count].every(Number.isInteger) ||
      r.from < 0 ||
      r.count < 1 ||
      r.count > 4 ||
      r.to < r.from + r.count ||
      r.to + r.count > c.length
    )
      throw new Error(
        "Repeat spans must be disjoint and copy at most four notes",
      );
  }
}
type Q = [number, number, number, number, number[], number[]];
export const initialPitch = (c: MusicalConstraints) =>
  c.start ?? c.referenceFinal;
function allowed(
  c: MusicalConstraints,
  p: number,
  index: number,
  first = index === 0,
) {
  return (
    p >= c.minPitch &&
    p <= c.maxPitch &&
    c.allowedPitchClasses.includes(p % 12) &&
    (!c.fixed[index + 1] || c.fixed[index + 1].includes(p)) &&
    (!first || c.start === null || p === c.start)
  );
}
export function musicalAcceptor(
  rep: Representation,
  c: MusicalConstraints,
  pitchToken: (symbol: number) => number = (s) => s,
) {
  validateConstraints(c);
  const interval = rep === "intervals",
    anchor = initialPitch(c),
    span = c.maxSpan !== null && c.maxSpan < c.maxPitch - c.minPitch;
  const tailSize = Math.max(
    1,
    ...(c.cadence?.lastNIntervals ?? []).map((p) => p.length),
  );
  const positional = Object.keys(c.fixed).length > 0 || c.repeat !== null;
  const firstOpening =
    c.repeat && c.repeat.from === 0 && interval ? [anchor] : [];
  const first: Q = interval
    ? [
        positional ? 1 : 0,
        anchor,
        span ? anchor : 0,
        span ? anchor : 0,
        firstOpening,
        [],
      ]
    : [0, -1, 0, 0, [], []];
  const anchorAllowed = !interval || allowed(c, anchor, 0);
  const encode = (q: Q) => JSON.stringify(q);
  return new DFA<number>({
    startState: encode(first),
    transition: (state, symbol) => {
      if (!anchorAllowed) return null;
      const [i, previous, lo, hi, opening, tail] = JSON.parse(
        String(state),
      ) as Q;
      if (positional && i >= c.length) return null;
      const token = pitchToken(symbol);
      const p =
        rep === "intervals"
          ? previous + token
          : rep === "relative"
            ? c.referenceFinal + token
            : token;
      if (!allowed(c, p, i, previous < 0)) return null;
      const delta = previous < 0 ? null : p - previous;
      if (
        delta !== null &&
        (Math.abs(delta) > c.maxLeap || c.forbiddenIntervals.includes(delta))
      )
        return null;
      const nextLo = span ? (previous < 0 ? p : Math.min(lo, p)) : 0,
        nextHi = span ? (previous < 0 ? p : Math.max(hi, p)) : 0;
      if (span && nextHi - nextLo > c.maxSpan!) return null;
      let nextOpening = opening;
      if (c.repeat) {
        const r = c.repeat;
        if (i >= r.from && i < r.from + r.count) nextOpening = [...opening, p];
        if (i >= r.to && i < r.to + r.count && p !== opening[i - r.to])
          return null;
      }
      const nextTail =
        c.cadence && delta !== null ? [...tail, delta].slice(-tailSize) : [];
      return encode([
        positional ? i + 1 : 0,
        p,
        nextLo,
        nextHi,
        nextOpening,
        nextTail,
      ]);
    },
    accept: (state) => {
      const [i, previous, , , , tail] = JSON.parse(String(state)) as Q;
      return (
        anchorAllowed &&
        (!positional || i === c.length) &&
        (c.final === null || previous === c.final) &&
        (!c.cadence ||
          (previous === c.cadence.finalPitch &&
            (!c.cadence.allowedPenultimateIntervals ||
              (tail.length > 0 &&
                c.cadence.allowedPenultimateIntervals.includes(
                  -tail.at(-1)!,
                ))))) &&
        (!c.cadence?.lastNIntervals ||
          c.cadence.lastNIntervals.some(
            (p) =>
              p.length <= tail.length &&
              p.every((v, j) => v === tail[tail.length - p.length + j]),
          ))
      );
    },
  });
}
export function constraintViolations(
  pitches: number[],
  c: MusicalConstraints,
): string[] {
  const errors: string[] = [];
  if (pitches.length !== c.length) errors.push("length");
  if (c.start !== null && pitches[0] !== c.start) errors.push("start");
  if (c.final !== null && pitches.at(-1) !== c.final) errors.push("final");
  if (pitches.some((p) => p < c.minPitch || p > c.maxPitch))
    errors.push("range");
  if (pitches.some((p) => !c.allowedPitchClasses.includes(p % 12)))
    errors.push("pitch classes");
  const deltas = pitches.slice(1).map((p, i) => p - pitches[i]);
  if (deltas.some((d) => Math.abs(d) > c.maxLeap)) errors.push("maximum leap");
  if (deltas.some((d) => c.forbiddenIntervals.includes(d)))
    errors.push("forbidden intervals");
  if (
    c.maxSpan !== null &&
    Math.max(...pitches) - Math.min(...pitches) > c.maxSpan
  )
    errors.push("span");
  for (const [i, allowed] of Object.entries(c.fixed))
    if (!allowed.includes(pitches[Number(i) - 1])) errors.push(`position ${i}`);
  if (
    c.repeat &&
    !Array.from(
      { length: c.repeat.count },
      (_, i) => pitches[c.repeat!.from + i] === pitches[c.repeat!.to + i],
    ).every(Boolean)
  )
    errors.push("repeat");
  if (c.cadence) {
    const cadence = c.cadence;
    if (
      pitches.at(-1) !== cadence.finalPitch ||
      (cadence.allowedPenultimateIntervals &&
        !cadence.allowedPenultimateIntervals.includes(
          pitches.at(-2)! - pitches.at(-1)!,
        ))
    )
      errors.push("cadence");
    if (
      cadence.lastNIntervals &&
      !cadence.lastNIntervals.some((p) =>
        p.every((d, i) => d === deltas[deltas.length - p.length + i]),
      )
    )
      errors.push("cadence intervals");
  }
  return errors;
}
