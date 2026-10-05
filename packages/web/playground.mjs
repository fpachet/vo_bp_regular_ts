import { datasets } from "../../examples/datasets.mjs";
const $ = (id) => document.getElementById(id);
import { parseEvent, formatWords } from "../../examples/domain-utils.mjs";
import { melodyMidi } from "../../examples/midi.mjs";
let worker, lastSequence, marginalRows, audio;
function chart() {
  const row = marginalRows?.[Number($("marginalPosition").value)] ?? [];
  $("marginalChart").replaceChildren();
  for (const [symbol, p] of row) {
    const line = document.createElement("div");
    line.textContent = `${symbol}: ${(100 * p).toFixed(2)}%`;
    line.style.background = `linear-gradient(to right,#d9e9ff ${p * 100}%,transparent ${p * 100}%)`;
    $("marginalChart").append(line);
  }
}
$("marginalPosition").oninput = chart;
$("cancel").onclick = () => {
  worker?.terminate();
  for (const id of ["sample", "best", "benchmark"]) $(id).disabled = false;
  $("status").textContent = "Cancelled.";
};
$("stop").onclick = () => {
  audio?.close();
  audio = null;
  $("audioStatus").textContent = "Stopped.";
};
$("play").onclick = async () => {
  try {
    // Create/resume synchronously in the click gesture (required by Firefox).
    audio?.close();
    audio = new AudioContext();
    const context = audio;
    $("audioStatus").textContent = "Starting audio…";
    let timer;
    try {
      await Promise.race([
        context.resume(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "Audio output unavailable. Check the browser audio permission or download MIDI.",
                ),
              ),
            3000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (audio !== context) return;
    let at = audio.currentTime + 0.05;
    for (const symbol of lastSequence) {
      const event =
        typeof symbol === "number"
          ? { pitch: symbol, duration: 1 }
          : parseEvent(symbol);
      if (event.pitch === null) continue;
      const oscillator = audio.createOscillator(),
        gain = audio.createGain(),
        duration = event.duration * 0.6;
      oscillator.type = "triangle";
      oscillator.frequency.value = 440 * 2 ** ((event.pitch - 69) / 12);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.15, at + 0.01);
      gain.gain.linearRampToValueAtTime(0, at + duration - 0.01);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + duration);
      at += duration;
    }
    $("audioStatus").textContent = "Playing.";
  } catch (e) {
    $("audioStatus").textContent = e.message;
  }
};
$("midi").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([melodyMidi(lastSequence)], { type: "audio/midi" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "markov-melody.mid";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const render = ({ data }) => {
  for (const id of ["sample", "best", "benchmark"]) $(id).disabled = false;
  if (data.error) {
    $("status").textContent = data.error;
    $("output").textContent = "";
    $("diagnostics").replaceChildren();
    $("marginalChart").replaceChildren();
    for (const id of ["play", "midi"]) $(id).disabled = true;
    return;
  }
  $("status").textContent = data.feasible
    ? "Completed."
    : "No positive-mass sequence satisfies these constraints. Check prefix/suffix symbols, reduce copying restrictions, enable backoff, or adjust duration and length.";
  const xs = data.sequence;
  lastSequence = xs;
  marginalRows = data.marginals;
  $("training").textContent = data.trainingPreview ?? "";
  $("marginalPosition").max = Math.max(0, (marginalRows?.length ?? 1) - 1);
  chart();
  $("samplingBenchmark").textContent = data.samplingBench
    ? JSON.stringify(data.samplingBench, null, 2)
    : "";
  for (const id of ["play", "midi"])
    $(id).disabled = !xs || $("dataset").value !== "melody";
  $("output").textContent = xs
    ? $("wordMode").checked && $("dataset").value === "text"
      ? formatWords(xs)
      : xs.join(
          $("dataset").value === "journeys"
            ? " → "
            : $("dataset").value === "melody"
              ? " "
              : "",
        )
    : "Infeasible";
  $("diagnostics").replaceChildren();
  for (const [k, v] of Object.entries(data.diagnostics)) {
    const dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = k;
    dd.textContent = Number.isInteger(v) ? v : String(Number(v.toPrecision(7)));
    $("diagnostics").append(dt, dd);
  }
};
function run(action) {
  if (worker) worker.terminate();
  worker = new Worker(new URL("./worker.mjs", import.meta.url), {
    type: "module",
  });
  worker.onmessage = render;
  worker.onerror = (e) => render({ data: { error: e.message } });
  const length = Number($("length").value),
    order = Number($("order").value);
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > 2000 ||
    !Number.isSafeInteger(order) ||
    order < 0 ||
    order > 8
  ) {
    render({
      data: { error: "Choose integer length 0–2000 and source order 0–8." },
    });
    return;
  }
  for (const id of ["sample", "best", "benchmark"]) $(id).disabled = true;
  for (const id of ["play", "midi"]) $(id).disabled = true;
  $("status").textContent = "Computing reachable product and backward values…";
  worker.postMessage({
    action,
    lowMemory: $("lowMemory").checked,
    prune: $("prune").checked,
    fullText: $("fullText").checked,
    wordMode: $("wordMode").checked,
    meter: $("meter").checked,
    totalDuration: Number($("totalDuration").value),
    domainRules: $("domainRules").checked,
    marginals: $("marginals").checked,
    dataset: $("dataset").value,
    length,
    order,
    backoffWeight:
      $("backoff").value === "" ? null : Number($("backoff").value),
    seed: $("seed").value === "" ? null : Number($("seed").value),
    prefix: $("prefix").value,
    suffix: $("suffix").value,
    forbidden: $("forbidden").value,
    required: $("required").value,
    copyLimit: $("copy").value === "" ? null : Number($("copy").value),
    position: Number($("position").value),
    positionSymbol: $("positionSymbol").value,
    custom: $("custom").value,
  });
}
$("sample").onclick = () => run("sample");
$("best").onclick = () => run("best");
$("dataset").onchange = () => {
  worker?.terminate();
  for (const id of ["sample", "best", "benchmark"]) $(id).disabled = false;
  $("status").textContent = "Ready.";
  const name = $("dataset").value,
    d = datasets[name],
    sep = name === "melody" || name === "journeys" ? "," : "";
  for (const id of ["fullText", "wordMode", "meter"]) $(id).checked = false;
  for (const id of ["play", "midi"]) $(id).disabled = true;
  $("order").value = d.maxOrder;
  $("backoff").value = "";
  $("length").value = d.length;
  $("prefix").value = d.prefix.join(sep);
  $("suffix").value = d.suffix.join(sep);
  $("forbidden").value = d.forbidden?.[0] ?? "";
  $("required").value = d.required?.join(sep) ?? "";
  $("copy").value = d.copyLimit ?? "";
  $("custom").value = "";
  $("positionSymbol").value = "";
};

$("benchmark").onclick = () => run("benchmark");
function textSettings() {
  if ($("dataset").value !== "text") return;
  if ($("wordMode").checked) $("fullText").checked = true;
  $("order").value = $("wordMode").checked ? 1 : 2;
  $("length").value = $("wordMode").checked ? 8 : 64;
  $("prefix").value = $("wordMode").checked ? "Alice" : "A";
  $("suffix").value = ".";
  $("copy").value = $("wordMode").checked ? 3 : 4;
}
$("fullText").onchange = textSettings;
$("wordMode").onchange = textSettings;
$("meter").onchange = () => {
  if ($("dataset").value !== "melody") return;
  $("order").value = 1;
  $("backoff").value = 0.25;
  $("length").value = 12;
  $("prefix").value = $("meter").checked ? "60:1" : "60";
  $("suffix").value = $("meter").checked ? "PAD" : "60";
};
