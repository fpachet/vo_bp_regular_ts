import { GenerationCache } from "./cache";
import { generate } from "./generate";
const cache = new GenerationCache();
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ ok: true, result: generate(data.corpus, data.options, cache) });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
