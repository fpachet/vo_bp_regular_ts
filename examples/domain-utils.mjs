/** Unicode word/punctuation tokens; use the same tokenizer for training and constraints. */
export function tokenizeWords(text) {
  return text.match(/\p{L}+(?:['’’-]\p{L}+)*|\p{N}+|[^\s\p{L}\p{N}]/gu) ?? [];
}
export function formatWords(tokens) {
  return tokens.join(" ").replace(/\s+([.,;:!?])/g, "$1");
}
export function parseEvent(token) {
  if (token === "PAD") return { pitch: null, duration: 0 };
  const match = /^(\d+):(\d+)$/.exec(String(token));
  if (!match)
    throw new TypeError("Melody events use pitch:duration ticks or PAD");
  const pitch = Number(match[1]),
    duration = Number(match[2]);
  if (pitch > 127 || duration < 1)
    throw new RangeError("Event pitch must be 0–127 and duration positive");
  return { pitch, duration };
}
/** Longest matching reference substring, using a suffix automaton in linear time.
 * Fresh separator symbols prevent matches spanning distinct training sequences.
 */
export function longestCopiedRun(sequence, references) {
  const states = [{ length: 0, link: -1, next: new Map() }];
  let last = 0;
  const append = (s) => {
    const current = states.length;
    states.push({ length: states[last].length + 1, link: 0, next: new Map() });
    let p = last;
    while (p >= 0 && !states[p].next.has(s)) {
      states[p].next.set(s, current);
      p = states[p].link;
    }
    if (p >= 0) {
      const q = states[p].next.get(s);
      if (states[p].length + 1 === states[q].length) states[current].link = q;
      else {
        const clone = states.length;
        states.push({
          length: states[p].length + 1,
          link: states[q].link,
          next: new Map(states[q].next),
        });
        while (p >= 0 && states[p].next.get(s) === q) {
          states[p].next.set(s, clone);
          p = states[p].link;
        }
        states[q].link = clone;
        states[current].link = clone;
      }
    }
    last = current;
  };
  for (const reference of references) {
    for (const s of reference) append(s);
    append(Symbol("sequence boundary"));
  }
  let q = 0,
    length = 0,
    best = 0;
  for (const s of sequence) {
    while (q !== 0 && !states[q].next.has(s)) {
      q = states[q].link;
      length = Math.min(length, states[q].length);
    }
    if (states[q].next.has(s)) {
      q = states[q].next.get(s);
      length++;
    } else {
      q = 0;
      length = 0;
    }
    best = Math.max(best, length);
  }
  return best;
}
