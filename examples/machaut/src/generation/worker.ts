import { generate } from "./generate";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ ok: true, result: generate(data.corpus, data.options) });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
