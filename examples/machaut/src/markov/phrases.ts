import { ContextGraph, DFA } from "markov-constraints";
import type { Melody, PieceMetadata } from "../music";
import { rhythmicDuration, type MusicToken } from "./train";
/** Recover EOF spacing from repeated MIDI note-release patterns in the same voice.
 * Raw note timing is retained. These are rhythm estimates, not score annotations. */
export function estimateFinalRhythm(
  m: Melody,
): NonNullable<PieceMetadata["finalRhythm"]> {
  const last = m.notes.at(-1)!;
  const exact: number[] = [],
    similar: number[] = [];
  for (let i = 0; i < m.notes.length - 1; i++) {
    const n = m.notes[i],
      spacing = m.notes[i + 1].onset - n.onset,
      gap = spacing - n.duration;
    if (gap < 0.02 || gap > 0.25001) continue;
    if (Math.abs(n.duration - last.duration) < 1 / 480) exact.push(gap);
    if (last.duration >= 1.5 && n.duration >= 1.5) similar.push(gap);
  }
  const evidence = exact.length ? exact : similar;
  const counts = new Map<number, number>();
  for (const gap of evidence) {
    const tick = Math.round(gap * 480);
    counts.set(tick, (counts.get(tick) ?? 0) + 1);
  }
  const best = [...counts].sort((a, b) => b[1] - a[1])[0];
  const supported =
    best &&
    (exact.length > 0 || best[1] >= 2) &&
    best[1] / evidence.length >= 0.75;
  const releaseGap = supported ? best[0] / 480 : 0;
  return {
    duration: Math.max(0.25, Math.round((last.duration + releaseGap) * 4) / 4),
    soundingDuration: last.duration,
    releaseGap,
    observations: supported ? best[1] : 0,
    basis: supported
      ? exact.length
        ? "Same sounding-duration release pattern within this voice"
        : "Long-note release pattern within this voice; inferred EOF spacing"
      : "No reliable release pattern; sounding duration rounded to quarter-beat grid",
  };
}
/** Conservative timing candidates, not editorial phrase annotations. */
export function annotatePhraseEnds(
  m: Melody,
): NonNullable<PieceMetadata["phraseEnds"]> {
  const ends: NonNullable<PieceMetadata["phraseEnds"]> = [];
  for (let i = 0; i < m.notes.length - 1; i++) {
    const spacing = m.notes[i + 1].onset - m.notes[i].onset;
    const gap = spacing - m.notes[i].duration;
    if (gap >= Math.max(0.5, 0.35 * spacing) - 1e-7)
      ends.push({
        note: i + 1,
        kind: "internal",
        basis:
          "Timing candidate: silence at least 0.5 beats and 35% of inter-onset spacing",
        gapBeats: gap,
      });
  }
  ends.push({
    note: m.notes.length,
    kind: "terminal",
    basis: "Last pitched event of extracted source voice",
    gapBeats: 0,
  });
  return ends;
}
export function learnPhraseDurations(corpus: Melody[]) {
  const global = new Map<number, number>(),
    internal = new Map<number, number>(),
    terminal = new Map<number, number>();
  const observations: {
    piece: string;
    note: number;
    kind: string;
    duration: number;
    fingerprint: string;
  }[] = [];
  const works = new Set<string>();
  const voices = new Set<string>();
  let duplicates = 0;
  for (const m of corpus) {
    const work = m.metadata.sha256 ?? JSON.stringify(m.notes);
    const voiceSignature = JSON.stringify(
      m.notes.map((n) => [
        n.midi,
        Math.round(n.onset * 480),
        Math.round(n.duration * 480),
      ]),
    );
    if (works.has(work) || voices.has(voiceSignature)) {
      duplicates++;
      continue;
    }
    works.add(work);
    voices.add(voiceSignature);
    m.notes.forEach((_, i) => {
      const d = rhythmicDuration(m, i);
      global.set(d, (global.get(d) ?? 0) + 1);
    });
    const seen = new Set<string>();
    for (const end of m.metadata.phraseEnds ?? annotatePhraseEnds(m)) {
      if (
        !Number.isInteger(end.note) ||
        end.note < 1 ||
        end.note > m.notes.length ||
        !["internal", "terminal"].includes(end.kind) ||
        (end.kind === "terminal"
          ? end.note !== m.notes.length
          : end.note >= m.notes.length)
      )
        throw new Error("Invalid source phrase boundary");
      const i = end.note - 1,
        d = rhythmicDuration(m, i);
      // Literal eight-event cadence signatures prevent repeated refrain endings
      // within one work from becoming independent observations.
      const fingerprint = JSON.stringify(
        m.notes
          .slice(Math.max(0, i - 7), i + 1)
          .map((n, j) => [n.midi, rhythmicDuration(m, Math.max(0, i - 7) + j)]),
      );
      const key = end.kind + fingerprint;
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      const counts = end.kind === "terminal" ? terminal : internal;
      counts.set(d, (counts.get(d) ?? 0) + 1);
      observations.push({
        piece: m.id,
        note: end.note,
        kind: end.kind,
        duration: d,
        fingerprint,
      });
    }
  }
  const durations = [...global.keys()].sort((a, b) => a - b),
    total = [...global.values()].reduce((a, b) => a + b, 0),
    smoothing = 8;
  const marginal = durations.map((d) => global.get(d)! / total);
  function distribution(counts: Map<number, number>) {
    const count = [...counts.values()].reduce((a, b) => a + b, 0);
    return {
      observations: count,
      counts: durations.map((d) => counts.get(d) ?? 0),
      probabilities: durations.map(
        (d, j) =>
          ((counts.get(d) ?? 0) + smoothing * marginal[j]) /
          (count + smoothing),
      ),
    };
  }
  return {
    durations,
    marginal,
    smoothing,
    internal: distribution(internal),
    terminal: distribution(terminal),
    observations,
    duplicatesRemoved: duplicates,
    semantics:
      "Source EOF endings and conservative silence-based internal candidates; repeated literal eight-event cadences deduplicated per work and kind; source event spacing includes silence",
  };
}
export type PhrasePrior = ReturnType<typeof learnPhraseDurations>;
export function phraseWeight(
  p: PhrasePrior,
  duration: number,
  kind: "internal" | "terminal",
  strength: number,
) {
  if (!strength) return 1;
  const j = p.durations.indexOf(duration);
  if (j < 0) throw new Error("Duration absent from phrase prior");
  return (p[kind].probabilities[j] / p.marginal[j]) ** strength;
}
export const END_TOKEN = -2147483648,
  DEAD_TOKEN = -2147483647;
/** A forced final symbol carries the EOF potential in the source edge.
 * Refine empty-context fallbacks by last token without changing note probabilities.
 * Rejected padding makes every note probability p/2 and EOF weight w/(2C),
 * a path-independent normalizer removed from Z. No terminal-duration DFA state. */
export function withPhraseEnding(
  graph: ContextGraph<number>,
  body: DFA<number>,
  decode: (s: number) => MusicToken,
  prior: PhrasePrior,
  strength: number,
  positions: number[],
) {
  const contexts = graph.contexts.map((c) => [...c]);
  const aliases = new Map<number, number>();
  for (const symbol of graph.alphabet) {
    const found = contexts.findIndex((c) => c.length === 1 && c[0] === symbol);
    if (found >= 0) aliases.set(symbol, found);
    else {
      aliases.set(symbol, contexts.length);
      contexts.push([symbol]);
    }
  }
  const empty = graph.contexts.findIndex((c) => !c.length);
  const scale = Math.max(
    1,
    ...prior.durations.map((d) => phraseWeight(prior, d, "terminal", strength)),
  );
  const rows = contexts.map((context, i) => {
    const row = graph.outgoing(i < graph.stateCount ? i : empty);
    const last = context.at(-1);
    const eof =
      last === undefined
        ? 0
        : phraseWeight(prior, decode(last).duration, "terminal", strength) /
          (2 * scale);
    return [
      ...row.map((e) => ({
        ...e,
        probability: e.probability / 2,
        nextState: !graph.contexts[e.nextState].length
          ? aliases.get(e.symbol)!
          : e.nextState,
      })),
      { symbol: END_TOKEN, probability: eof, nextState: i },
      {
        symbol: DEAD_TOKEN,
        probability: Math.max(
          0,
          1 - row.reduce((sum, e) => sum + e.probability / 2, 0) - eof,
        ),
        nextState: i,
      },
    ];
  });
  const wrappedGraph = new ContextGraph(
    contexts,
    rows,
    graph.startState,
    graph.maxOrder,
  );
  const lastPosition = Math.max(0, ...positions);
  const encode = (q: string | number, i: number) =>
    lastPosition ? JSON.stringify([q, i]) : q;
  const unpack = (q: string | number): [string | number, number] =>
    lastPosition ? JSON.parse(String(q)) : [q, 0];
  const dfa = new DFA<number>({
    startState: encode(body.startState, 0),
    transition: (q, s) => {
      if (q === "done" || s === DEAD_TOKEN) return null;
      const [inner, i] = unpack(q);
      if (s === END_TOKEN) return body.isAccepting(inner) ? "done" : null;
      const next = body.nextState(inner, s);
      return next === null
        ? null
        : encode(next, lastPosition ? Math.min(i + 1, lastPosition + 1) : 0);
    },
    accept: (q) => q === "done",
    weight: (q, s) => {
      if (s === END_TOKEN) return 1;
      const [inner, i] = unpack(q);
      return (
        body.transitionWeight(inner, s) *
        (positions.includes(i + 1)
          ? phraseWeight(prior, decode(s).duration, "internal", strength)
          : 1)
      );
    },
  });
  return { graph: wrappedGraph, dfa, logScale: Math.log(scale) };
}
