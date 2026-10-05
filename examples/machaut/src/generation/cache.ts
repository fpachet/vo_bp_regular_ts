import type { Melody } from "../music";
import { train, type ModelOptions } from "../markov/train";
import { learnMeter } from "../markov/meter";
import { learnPhraseDurations } from "../markov/phrases";

/** One entry per worker; compare content so imported/edited corpus data invalidates it. */
export class GenerationCache {
  private key = "";
  private value?: {
    trained: ReturnType<typeof train>;
    meter: ReturnType<typeof learnMeter>;
    phrases: ReturnType<typeof learnPhraseDurations>;
  };
  prepare(corpus: Melody[], model: ModelOptions) {
    const key = JSON.stringify([corpus, model]);
    if (key === this.key && this.value) return { ...this.value, reused: true };
    const value = {
      trained: train(corpus, model),
      meter: learnMeter(corpus),
      phrases: learnPhraseDurations(corpus),
    };
    this.key = key;
    this.value = value;
    return { ...value, reused: false };
  }
}
