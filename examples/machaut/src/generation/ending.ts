import { DFA, type State } from "markov-constraints";
import type { NoteEvent } from "../music";
import type { MusicToken } from "../markov/train";

export interface EndingOptions {
  minDuration: number;
  barBeats: number;
}
export function validateEnding(ending: EndingOptions) {
  if (
    ![ending.minDuration, ending.barBeats].every(
      (n) => Number.isFinite(n) && n > 0 && Number.isInteger(n * 4),
    )
  )
    throw new Error(
      "Ending duration and meter must be positive multiples of 0.25 beats",
    );
}
/** Compose pitch rules with meter phase and the duration of the terminal event.
 * A fixed BP horizon makes the terminal-duration test a constraint on note N.
 * Tracking phase rather than total duration shares states between whole bars. */
export function meteredAcceptor(
  pitch: DFA<number>,
  decode: (s: number) => MusicToken,
  ending: EndingOptions,
  includeAnchor: boolean,
) {
  validateEnding(ending);
  const bar = ending.barBeats * 4;
  type Q = [State, number, boolean, boolean];
  const encode = (q: Q) => JSON.stringify(q);
  return new DFA<number>({
    startState: encode([pitch.startState, 0, false, !includeAnchor]),
    transition: (state, symbol) => {
      const [q, phase, , started] = JSON.parse(String(state)) as Q;
      const token = decode(symbol);
      if (!started ? !token.anchor : token.anchor) return null;
      const next = !started ? q : pitch.nextState(q, symbol);
      if (next === null) return null;
      const ticks = token.duration * 4;
      if (!Number.isInteger(ticks) || ticks <= 0)
        throw new Error("Meter requires sixteenth-note duration tokens");
      return encode([
        next,
        (phase + ticks) % bar,
        token.duration >= ending.minDuration,
        true,
      ]);
    },
    accept: (state) => {
      const [q, phase, longFinal, started] = JSON.parse(String(state)) as Q;
      return started && phase === 0 && longFinal && pitch.isAccepting(q);
    },
  });
}
export function endingViolations(
  notes: NoteEvent[],
  ending?: EndingOptions | null,
) {
  if (!ending) return [];
  validateEnding(ending);
  const last = notes.at(-1)!;
  const errors: string[] = [];
  if (last.duration < ending.minDuration) errors.push("final duration");
  if (
    Math.abs(
      (last.onset + last.duration) / ending.barBeats -
        Math.round((last.onset + last.duration) / ending.barBeats),
    ) > 1e-9
  )
    errors.push("final bar boundary");
  return errors;
}
