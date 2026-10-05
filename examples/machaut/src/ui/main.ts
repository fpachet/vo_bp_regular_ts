import "./style.css";
import {
  pitchName,
  validateMelody,
  type Melody,
  type NoteEvent,
  type Representation,
} from "../music";
import { learnPhraseDurations } from "../markov/phrases";
import { train, type ModelOptions } from "../markov/train";
import type {
  GenerationOptions,
  GenerationResult,
  NoteExplanation,
} from "../generation/generate";
import type { MusicalConstraints } from "../constraints/musical";
import {
  exportMidi,
  exportMusicXML,
  exportJSON,
  escapeXML,
} from "../export/formats";
import { loadMidi, midiVoices } from "../corpus/midi";
import { loadMusicXML, musicxmlVoices } from "../corpus/musicxml";
import { instruments, play, setReverb, stop, type InstrumentId } from "./playback";
const isCorpus = /\/corpus\/(?:index.html)?$/.test(location.pathname);
const root = new URL(isCorpus ? "../" : "./", location.href);
const e = escapeXML;
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<header><div class="topline"><div class="brand">Ars nova · A study in melodic possibility</div><nav class="nav"><a href="${root.href}">Generate</a><a href="${new URL("corpus/", root)}">Corpus</a><a href="https://github.com/fpachet/vo_bp_regular_ts/tree/main/examples/machaut">Source &amp; method</a></nav></div><h1>Guillaume de Machaut <span class="tag">Melody laboratory</span></h1><p>Learn from 23 attributed melodic voices. Shape a new melody with an exact Markov model, then listen, inspect and reproduce it.</p></header>
<main class="workspace">${
  isCorpus
    ? `<section class="panel full"><h2><span class="section-number">I.</span>The source melodies</h2><p class="source-note">23 MIDI transcriptions from APEMUTAM, including the original six-piece pilot. One voice is selected from each piece by highest mean pitch. This is a reproducible extraction heuristic, not a critical edition or a verified cantus attribution. Finals are the last sounding pitches, not inferred historical modes.</p><div id="corpus-table" class="corpus-table"></div></section><section class="panel full"><h2>Import your repertoire</h2><div class="import-panel"><div><label for="import-file">MIDI or uncompressed MusicXML</label><input id="import-file" type="file" accept=".mid,.midi,.MID,.xml,.musicxml"></div><div><label for="import-voice">Melodic voice</label><select id="import-voice" disabled><option>Choose a file first</option></select></div><button id="import-add" class="primary" disabled>Add selected voice</button></div><p class="hint">Imports stay in this browser tab. Download the corpus snapshot to reuse them on the generator page. Chords are reduced to the upper note; overlapping sustains are clipped; source durations are retained.</p><button class="secondary" id="snapshot">Download corpus snapshot</button><p class="status" id="status" role="status"></p></section>`
    : `<aside class="controls"><section class="panel"><h2><span class="section-number">I.</span>Corpus &amp; model</h2><label for="repertoire">Repertoire</label><select id="repertoire"><option value="songs">Rondeaux &amp; virelais (16 pieces)</option><option value="secular">All secular songs (20 pieces)</option><option value="all">All 23 pieces</option><option value="pilot">Original six-piece pilot</option><option value="rondeau">Rondeaux</option><option value="virelai">Virelais</option><option value="ballade">Ballades</option><option value="motet">Motets</option><option value="other">Complaint</option></select><label for="representation">Viewpoint</label><select id="representation"><option value="intervals">Interval × duration</option><option value="absolute" selected>Pitch × duration</option><option value="relative">Relative pitch × duration</option></select><label for="rhythm">Rhythm</label><select id="rhythm" disabled><option value="quarter">Equal quarter notes</option><option value="corpus" selected>Learned rhythm · joint pitch/duration</option></select><p class="hint">Switching rhythm sets the order preset: 3 for learned rhythm, 5 for quarter notes. You can then adjust it. Learned rhythm uses source note spacing on a sixteenth-note grid. Length and fixed positions count notes; repeats constrain pitches. No rests are generated.</p><div class="pair"><div><label for="order">Maximum order</label><input id="order" type="number" value="3" min="1" max="10"></div><div><label for="backoff">Backoff weight</label><input id="backoff" type="number" value="0.25" min="0" max="1" step="0.05"></div></div><p class="hint">Fixed suffix mixture, including order zero. Larger backoff weights increase lower-order support.</p><label for="metrical-strength">Learned meter strength</label><input id="metrical-strength" type="number" value="1" min="0" max="3" step="0.25"><p class="hint">0 disables beat-position preferences; 1 uses the smoothed corpus prior. Missing meters use a 4/4 grid; explicit incompatible meters are excluded from beat-position counts. Applies in both generation modes.</p><label for="phrase-strength">Phrase-ending duration strength</label><input id="phrase-strength" type="number" value="1" min="0" max="3" step="0.25"><p class="hint">Learns final durations and silence-based internal ending candidates. Repeated literal cadences count once per piece. 0 disables this prior.</p><label for="snapshot-file">Use a saved corpus snapshot</label><input id="snapshot-file" type="file" accept=".json"><p class="hint"><a href="${new URL("corpus/", root)}">Inspect or import MIDI / MusicXML →</a></p></section>
<section class="panel"><h2><span class="section-number">II.</span>Musical conditions</h2><label for="mode">Generation mode</label><select id="mode"><option value="constrained">Globally constrained</option><option value="ordinary">Ordinary Markov sampling</option></select><div class="pair"><div><label for="length">Number of notes</label><input id="length" type="number" value="32" min="8" max="128"></div><div><label for="seed">Random seed</label><input id="seed" type="number" value="12345" min="0" max="4294967295"></div></div><label class="check"><input id="lock-seed" type="checkbox">Keep seed fixed</label><p class="hint">Generate chooses a fresh seed. Keep it fixed to replay a melody with the same settings.</p><div class="pair"><div><label for="start">Starting pitch</label><select id="start"><option value="">Unconstrained / anchor</option></select></div><div><label for="final">Final / reference pitch</label><select id="final"></select></div></div><label class="check"><input id="force-final" type="checkbox" checked>Force final pitch</label><div class="pair"><div><label for="low">Lowest pitch</label><select id="low"></select></div><div><label for="high">Highest pitch</label><select id="high"></select></div></div><div class="pair"><div><label for="leap">Maximum leap (semitones)</label><input id="leap" type="number" value="7" min="0" max="24"></div><div><label for="span">Maximum span (optional)</label><input id="span" type="number" placeholder="Unbounded" min="0" max="48"></div></div><label class="check"><input id="cadence" type="checkbox" checked>End by a step into the final</label><label class="check"><input id="hold-ending" type="checkbox" checked>End at an exact bar boundary</label><p class="hint">Conditions learned rhythm on an exact 4/4 bar ending. Final duration is sampled jointly from the learned prior and source model. Ordinary mode ignores the bar-ending rule.</p><label for="minimum-ending">Minimum final duration (beats)</label><input id="minimum-ending" type="number" min="0.25" step="0.25" value="0.25"><label for="phrase-ends">Internal phrase ends (note positions)</label><input id="phrase-ends" placeholder="8,16,24"><p class="hint">Optional one-based note positions; applies the learned internal ending-duration prior. The last note always uses the separate final-duration prior. These preferences also apply in ordinary mode.</p><label class="check"><input id="repeat" type="checkbox">Repeat opening 3 notes at the end</label><details><summary>Phrase, pitch-set &amp; cadence controls</summary><label for="classes">Allowed pitch classes (C=0)</label><input id="classes" value="0,2,4,5,7,9,11"><label for="fixed">Fixed / phrase-end notes</label><textarea id="fixed" placeholder="8:69; 16:74; 24:69; 32:74"></textarea><p class="hint">One-based positions, MIDI pitches. Use 16:72|74 for alternatives.</p><button id="phrase-example" class="secondary" type="button">Apply 32-note phrase example</button><label for="forbidden">Forbidden signed intervals</label><input id="forbidden" placeholder="6,-6"><label for="cadence-patterns">Alternative cadence interval endings</label><input id="cadence-patterns" placeholder="-2,2; -1,1"><p class="hint">Optional exact interval tails, separated by semicolons.</p></details><p class="hint">Interval models require a starting anchor: when Start is unset, the reference pitch is used. Ordinary mode ignores musical constraints and reports violations.</p></section></aside>`
}
<div class="output ${isCorpus ? "full" : ""}"><section class="panel">${isCorpus ? "" : '<div class="toolbar"><button id="generate" class="primary" disabled>Generate melody →</button><button id="cancel" class="secondary" disabled>Cancel</button></div><p class="status" id="status" role="status">Loading the local corpus…</p>'}<div class="score-head"><div><h2><span class="section-number">${isCorpus ? "II." : "III."}</span>${isCorpus ? "Selected source voice" : "A new melodic possibility"}</h2><div id="score-subtitle" class="subtitle">${isCorpus ? "Choose a piece above to inspect its extracted voice." : "Equal quarter notes · modern notation · no historical rhythm claim"}</div></div><div class="toolbar"><button id="play" class="secondary" disabled>Play</button><button id="stop" class="secondary">Stop</button><label class="visually-hidden" for="tempo">Playback tempo</label><input id="tempo" type="number" value="96" min="30" max="240" aria-label="Playback tempo" style="width:75px"></div></div><div class="toolbar"><label for="instrument">Sound</label><select id="instrument">${Object.entries(instruments).map(([id, label]) => `<option value="${id}">${label}</option>`).join("")}</select><label for="reverb">Reverb</label><input id="reverb" type="range" min="0" max="0.3" step="0.01" value="0.12"><label class="check"><input id="natural" type="checkbox" checked>Natural performance</label><span id="audio-status" role="status"></span></div><span id="notation-time" class="hint" role="status"></span><div id="score" class="score-wrap"><div class="empty">${isCorpus ? "Explore the repertoire" : "A voice from the corpus, a path through constraints."}</div></div><div id="metrics" class="metrics"></div><div class="toolbar"><button id="download-midi" class="secondary" disabled>Download MIDI</button><button id="download-xml" class="secondary" disabled>MusicXML</button><button id="download-json" class="secondary" disabled>Experiment JSON</button>${isCorpus ? "" : '<button id="regenerate" class="secondary" disabled>New seed →</button>'}</div><p class="hint">The 4/4 engraving grid is a modern display convention. It is not a mensural transcription.</p></section>${isCorpus ? "" : `<section class="panel"><h2><span class="section-number">IV.</span>Why this note?</h2><p class="hint">Select a note below. Compare source probabilities with probabilities conditioned on every future requirement.</p><div id="note-list" class="note-list"></div><div id="explanation" class="explanation">Note explanations appear after generation.</div></section><section class="panel"><h2>Model &amp; generation diagnostics</h2><div id="stats" class="stats-grid"></div><p id="diagnostic-detail" class="source-note"></p><details><summary>Method &amp; limits</summary><p class="source-note">The model is a fixed variable-order suffix mixture, conditioned by a deterministic finite acceptor using sparse log-space belief propagation. Exactness is relative to this supplied source and constraints, within floating-point precision. This corpus does not establish historical style. More elaborate repeats and long interval horizons may exceed explicit product budgets; simplify constraints or lower order when that happens.</p></details></section>`}</div></main><footer>Built with <a href="https://www.npmjs.com/package/markov-constraints">markov-constraints 0.4.0-rc.1</a> · Local corpus from <a href="https://www.apemutam.org/instrumentsmedievaux/PartMed/Machaut/Machaut.html">APEMUTAM</a> · Generation runs in a cancellable browser Worker.<br>Source transcription reuse terms were not specified by the collection. Source URLs, checksums and extraction choices are retained with each piece; the application’s MIT license does not license those transcriptions.</footer>`;
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id)! as T;
const value = (id: string) => el<HTMLInputElement>(id).value;
const num = (id: string) => Number(value(id));
const checked = (id: string) => el<HTMLInputElement>(id).checked;
function status(message: string, error = false) {
  el("status").textContent = message;
  el("status").classList.toggle("error", error);
}
let corpus: Melody[] = [],
  currentNotes: NoteEvent[] = [],
  currentJSON: unknown = null,
  result: GenerationResult | null = null,
  worker: Worker | null = null,
  activeScore = 0;
let scoreQueue = Promise.resolve();
let scoreDisplay: import("opensheetmusicdisplay").OpenSheetMusicDisplay | undefined;
let loadedScoreXML = "";
let scoreTitle = "Melody";
async function renderScore(notes: NoteEvent[], title: string) {
  scoreTitle = title;
  const request = ++activeScore;
  const noteIndices: (number | null)[] = [];
  const xml = exportMusicXML(notes, title, noteIndices);
  scoreQueue = scoreQueue
    .catch(() => {})
    .then(async () => {
      if (request !== activeScore) return;
      const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
      if (request !== activeScore) return;
      const began = performance.now();
      if (!scoreDisplay) el("score").innerHTML = "";
      const display = scoreDisplay ??= new OpenSheetMusicDisplay(el("score"), {
        backend: "svg",
        autoResize: false,
        drawTitle: false,
        drawComposer: false,
        drawPartNames: false,
      });
      if (xml !== loadedScoreXML) {
        await display.load(xml);
        loadedScoreXML = xml;
      }
      if (request === activeScore) {
        display.render();
        el("notation-time").textContent = `Notation ${Math.round(performance.now() - began)} ms`;
        if (!isCorpus && result && notes === result.notes) {
          const glyphs =
            el("score").querySelectorAll<SVGGElement>(".vf-stavenote");
          if (glyphs.length === noteIndices.length)
            glyphs.forEach((glyph, segmentIndex) => {
              const index = noteIndices[segmentIndex];
              if (index === null) return;
              // SVG groups have no painted hit area in Firefox. Include the
              // full note/stem box so clicking or tapping selects the note.
              const box = glyph.getBBox();
              const hit = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "rect",
              );
              for (const [attribute, value] of Object.entries({
                x: box.x - 3,
                y: box.y - 3,
                width: box.width + 6,
                height: box.height + 6,
              }))
                hit.setAttribute(attribute, String(value));
              hit.setAttribute("fill", "transparent");
              hit.setAttribute("pointer-events", "all");
              glyph.prepend(hit);
              glyph.style.cursor = "pointer";
              glyph.setAttribute("role", "button");
              glyph.setAttribute("tabindex", "0");
              glyph.setAttribute(
                "aria-label",
                `Explain score note ${index + 1} ${pitchName(notes[index].midi)}`,
              );
              const select = () =>
                el("note-list")
                  .querySelectorAll<HTMLButtonElement>("button")
                  [index].click();
              glyph.onclick = select;
              glyph.onkeydown = (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  select();
                }
              };
            });
        }
      }
    });
  await scoreQueue;
}
function download(content: string | Uint8Array, name: string, type: string) {
  const blob = new Blob(
    [typeof content === "string" ? content : new Uint8Array(content).buffer],
    { type },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function available() {
  for (const id of [
    "play",
    "download-midi",
    "download-xml",
    "download-json",
    "regenerate",
  ]) {
    const button = document.getElementById(id) as HTMLButtonElement | null;
    if (button) button.disabled = !currentNotes.length || (id === "play" && audioLoading);
  }
}
let audioLoading = false;
let audioRequest = 0;
el("play").onclick = () => {
  const request = ++audioRequest;
  void play(currentNotes, num("tempo"), {
    instrument: el<HTMLSelectElement>("instrument").value as InstrumentId,
    natural: el<HTMLInputElement>("natural").checked,
    reverb: num("reverb"),
    phraseEnds: result && currentNotes === result.notes
      ? result.phraseEndPositions
      : (currentJSON as Melody | null)?.metadata?.phraseEnds?.filter(p => p.kind === "internal").map(p => p.note),
    loading: (loading) => {
      if (request !== audioRequest) return;
      audioLoading = loading;
      el("audio-status").textContent = loading ? "Loading instrument…" : "";
      available();
    },
  }).catch((error) => {
    if (request === audioRequest) el("audio-status").textContent = `Audio unavailable: ${String(error)}. Try again or download MIDI.`;
  });
};
function cancelPlayback() {
  audioRequest++;
  audioLoading = false;
  stop();
  el("audio-status").textContent = "";
  available();
}
el("stop").onclick = cancelPlayback;
el("instrument").onchange = cancelPlayback;
el("reverb").oninput = () => setReverb(num("reverb"));
el("download-midi").onclick = () =>
  download(
    exportMidi(currentNotes, num("tempo")),
    "machaut-melody.mid",
    "audio/midi",
  );
el("download-xml").onclick = () =>
  download(
    exportMusicXML(currentNotes),
    "machaut-melody.musicxml",
    "application/vnd.recordare.musicxml+xml",
  );
el("download-json").onclick = () =>
  download(
    exportJSON(currentJSON),
    "machaut-experiment.json",
    "application/json",
  );
function selectedCorpus() {
  const genre = value("repertoire");
  if (genre === "songs")
    return corpus.filter((m) =>
      ["rondeau", "virelai"].includes(m.metadata.genre ?? ""),
    );
  if (genre === "secular")
    return corpus.filter((m) =>
      ["rondeau", "virelai", "ballade"].includes(m.metadata.genre ?? ""),
    );
  if (genre === "pilot") return corpus.filter((m) => m.metadata.pilot);
  return genre === "all"
    ? corpus
    : corpus.filter((m) => m.metadata.genre === genre);
}
function updateViewpointLabels() {
  const rhythmic = value("rhythm") === "corpus";
  const labels = {
    absolute: rhythmic ? "Pitch × duration" : "Absolute pitch",
    intervals: rhythmic ? "Interval × duration" : "Melodic intervals",
    relative: rhythmic
      ? "Relative pitch × duration"
      : "Pitch relative to source final",
  };
  for (const option of el<HTMLSelectElement>("representation").options)
    option.textContent = labels[option.value as Representation];
}
function modelOptions(): ModelOptions {
  return {
    representation: value("representation") as ModelOptions["representation"],
    rhythm: value("rhythm") as ModelOptions["rhythm"],
    includeIntervalAnchor:
      value("representation") === "intervals" &&
      value("rhythm") === "corpus" &&
      (num("metrical-strength") > 0 ||
        num("phrase-strength") > 0 ||
        (checked("hold-ending") && value("mode") === "constrained")),
    maxOrder: num("order"),
    backoffWeight: num("backoff"),
    phraseEndStrength:
      value("rhythm") === "corpus" ? num("phrase-strength") : 0,
    metricalStrength:
      value("rhythm") === "corpus" ? num("metrical-strength") : 0,
  };
}
function updateStats() {
  try {
    const t = train(selectedCorpus(), modelOptions());
    const phrasePrior = learnPhraseDurations(selectedCorpus());
    el("stats").innerHTML = Object.entries({
      Pieces: t.stats.pieces,
      "Source notes": t.stats.notes,
      "Final duration observations": phrasePrior.terminal.observations,
      "Internal ending candidates": phrasePrior.internal.observations,
      "Repeated endings removed": phrasePrior.duplicatesRemoved,
      "Token vocabulary": t.stats.vocabulary,
      "Durations (quarter-note units)": t.stats.durations.join(", "),
      "Context states": t.stats.contexts,
      "Mean range": t.stats.averageRange.toFixed(1) + " semitones",
      "Unique n-grams": t.stats.ngrams
        .map((g) => `${g.order}: ${g.count}`)
        .join(" · "),
      "Interval vocabulary": t.stats.intervalVocabulary.join(", "),
    })
      .map(
        ([key, v]) => `<span>${e(key)}</span><strong>${e(String(v))}</strong>`,
      )
      .join("");
  } catch (error) {
    status(String(error), true);
  }
}
function parseNumbers(text: string) {
  if (!text.trim()) return [];
  const values = text.split(",").map((s) => Number(s.trim()));
  if (values.some((n) => !Number.isInteger(n)))
    throw new Error("Enter comma-separated integers");
  return values;
}
function readOptions(): GenerationOptions {
  const fixed: Record<string, number[]> = {};
  for (const entry of value("fixed")
    .split(";")
    .filter((s) => s.trim())) {
    const [position, pitches, ...extra] = entry.split(":");
    if (!pitches || extra.length)
      throw new Error(
        "Fixed notes use position:pitch, separated by semicolons",
      );
    fixed[String(Number(position))] = pitches.split("|").map(Number);
  }
  const final = num("final"),
    cadencePatterns = value("cadence-patterns").trim()
      ? value("cadence-patterns").split(";").map(parseNumbers)
      : undefined;
  const constraints: MusicalConstraints = {
    length: num("length"),
    start: value("start") === "" ? null : num("start"),
    final: checked("force-final") ? final : null,
    referenceFinal: final,
    minPitch: num("low"),
    maxPitch: num("high"),
    maxSpan: value("span") === "" ? null : num("span"),
    maxLeap: num("leap"),
    allowedPitchClasses: parseNumbers(value("classes")),
    fixed,
    forbiddenIntervals: parseNumbers(value("forbidden")),
    cadence:
      checked("cadence") || cadencePatterns
        ? {
            finalPitch: final,
            ...(checked("cadence")
              ? { allowedPenultimateIntervals: [-2, -1, 1, 2] }
              : {}),
            ...(cadencePatterns ? { lastNIntervals: cadencePatterns } : {}),
          }
        : null,
    repeat: checked("repeat")
      ? { from: 0, to: num("length") - 3, count: 3 }
      : null,
  };
  return {
    model: modelOptions(),
    ending:
      value("rhythm") === "corpus" && checked("hold-ending")
        ? { minDuration: num("minimum-ending"), barBeats: 4 }
        : null,
    phraseEndPositions: parseNumbers(value("phrase-ends")),
    constraints,
    seed: num("seed"),
    mode: value("mode") as GenerationOptions["mode"],
  };
}
function busy(on: boolean) {
  el<HTMLButtonElement>("generate").disabled = on;
  el<HTMLButtonElement>("cancel").disabled = !on;
  el<HTMLButtonElement>("regenerate").disabled = on || !currentNotes.length;
}
function explain(explanation: NoteExplanation | undefined) {
  if (!explanation) {
    el("explanation").textContent =
      "This first pitch is the supplied interval anchor. In learned rhythm mode its duration is sampled independently from source opening durations; later notes use joint interval/duration tokens.";
    return;
  }
  const rep = result!.model.representation;
  el("explanation").innerHTML =
    `<strong>Note ${explanation.position}: ${pitchName(explanation.pitch)} · ${explanation.duration} beats</strong><br>Source context (${e(rep)}): ${explanation.context.length ? explanation.contextLabels.join(" · ") : "empty"}<table><thead><tr><th>Continuation</th><th>Model duration</th><th>Source</th><th>Meter weight</th><th>Ending weight</th><th>Conditioned</th><th>Constraint effect</th></tr></thead><tbody>${explanation.continuations.map((c) => `<tr><td>${pitchName(c.pitch)}</td><td>${c.duration} beats</td><td>${(c.sourceProbability * 100).toFixed(1)}%</td><td>${c.metricalWeight.toFixed(2)}×</td><td>${c.phraseEndingWeight.toFixed(2)}×</td><td>${(c.conditionedProbability * 100).toFixed(1)}%</td><td>${e(c.reason)}</td></tr>`).join("")}</tbody></table>`;
}
function metric(label: string, value: string) {
  return `<div class="metric"><strong>${e(value)}</strong><span>${e(label)}</span></div>`;
}
async function showResult(r: GenerationResult) {
  result = r;
  currentNotes = r.notes;
  currentJSON = r;
  cancelPlayback();
  available();
  el<HTMLButtonElement>("regenerate").disabled = true;
  el("metrics").innerHTML =
    metric(
      "Bar crossings",
      `${(r.metricalSummary.crossingRate * 100).toFixed(1)}%`,
    ) +
    metric("Meter strength", String(r.model.metricalStrength ?? 0)) +
    metric("Final pitch", pitchName(r.notes.at(-1)!.midi)) +
    metric("Melodic range", String(r.diagnostics.range) + " st") +
    metric("Stepwise motion", r.diagnostics.stepwisePercent.toFixed(0) + "%") +
    metric(
      "Longest copied passage",
      String(r.diagnostics.longestCopiedNotes) + " notes",
    );
  el("score-subtitle").textContent =
    `${r.mode === "constrained" ? "Conditioned melody" : "Ordinary Markov sample"} · ${r.notes.length} notes · ${r.model.rhythm === "corpus" ? "learned rhythm" : "quarter notes"} · ${r.notes.reduce((sum, n) => sum + n.duration, 0)} beats · order ${r.model.maxOrder} · seed ${r.seed}${r.ending ? ` · final ${r.notes.at(-1)!.duration} beats` : ""}`;
  el("diagnostic-detail").textContent =
    `${r.productStates.toLocaleString()} product states · ${r.productEdges.toLocaleString()} time-indexed edges · ${(r.bufferBytes / 1048576).toFixed(2)} MiB inference buffers · ${r.elapsedMs.toFixed(0)} ms generation (${r.timings.modelReused ? "cached model" : "new model"}; preparation ${r.timings.trainingMs.toFixed(0)} ms, inference ${r.timings.inferenceMs.toFixed(0)} ms, sampling ${r.timings.samplingMs.toFixed(1)} ms). Mean absolute interval ${r.diagnostics.averageAbsoluteInterval.toFixed(2)}, largest leap ${r.diagnostics.maximumInterval}, repeated notes ${r.diagnostics.repeatedPercent.toFixed(1)}%. Copied ${r.diagnostics.ngramOrder}-grams: ${r.diagnostics.copiedNgrams}. Log source weight ${r.logSourceWeight.toFixed(3)}${r.logPartitionFunction === null ? "" : `, log weighted partition ${r.logPartitionFunction.toFixed(3)}`}. Constraint violations: ${r.violations.length ? r.violations.join(", ") : "none"}. Copy counts compare literal absolute pitches against each source separately; transposed copying is not counted.`;
  el("note-list").innerHTML = r.notes
    .map(
      (n, i) =>
        `<button type="button" data-index="${i}" aria-label="Explain note ${i + 1} ${pitchName(n.midi)}">${i + 1} ${pitchName(n.midi)} · ${n.duration}</button>`,
    )
    .join("");
  el("note-list").onclick = (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button",
    );
    if (!button) return;
    for (const b of el("note-list").querySelectorAll("button"))
      b.classList.remove("active");
    button.classList.add("active");
    explain(
      r.explanations.find(
        (x) => x.position === Number(button.dataset.index) + 1,
      ),
    );
  };
  explain(r.explanations[0]);
  status(
    `Generated ${r.notes.length} notes. ${r.mode === "constrained" ? "All requested musical conditions satisfied." : "Ordinary mode: " + r.violations.length + " requested conditions violated."} Rendering notation…`,
  );
  await renderScore(r.notes, "Generated melody");
  status(
    `Ready · seed ${r.seed} · ${r.elapsedMs.toFixed(0)} ms generation${r.violations.length ? " · " + r.violations.join(", ") + " violated" : ""}`,
  );
}
function generate(freshSeed = false) {
  cancelPlayback();
  try {
    if (freshSeed) {
      const current = num("seed") >>> 0;
      const next = crypto.getRandomValues(new Uint32Array(1))[0];
      el<HTMLInputElement>("seed").value = String(
        next === current ? (current + 1) >>> 0 : next,
      );
    }
    const options = readOptions(),
      selected = selectedCorpus();
    worker ??= new Worker(new URL("../generation/worker.ts", import.meta.url), {
      type: "module",
    });
    busy(true);
    status("Preparing model and solving the constrained distribution…");
    const timeout = setTimeout(() => {
      worker?.terminate();
      worker = null;
      busy(false);
      status(
        "Stopped after 30 seconds. Lower order, shorten the melody or simplify repetition constraints.",
        true,
      );
    }, 30000);
    worker.onmessage = ({ data }) => {
      clearTimeout(timeout);
      el<HTMLButtonElement>("cancel").disabled = true;
      if (data.ok) {
        void showResult(data.result)
          .catch((error) => status("Notation failed: " + String(error), true))
          .finally(() => busy(false));
      } else {
        busy(false);
        status(
          data.error +
            (/limit exceeded/.test(data.error)
              ? ". Try a lower order, a narrower repertoire, or fewer phrase-end positions."
              : ""),
          true,
        );
      }
    };
    worker.onerror = (event) => {
      clearTimeout(timeout);
      worker?.terminate();
      worker = null;
      busy(false);
      status(event.message || "Worker failed", true);
    };
    el("cancel").onclick = () => {
      clearTimeout(timeout);
      worker?.terminate();
      worker = null;
      busy(false);
      status("Generation cancelled.");
    };
    worker.postMessage({ corpus: selected, options });
  } catch (error) {
    status(String(error), true);
  }
}
function showCorpusTable() {
  el("corpus-table").innerHTML =
    `<table><thead><tr><th>Piece / genre</th><th>Notes</th><th>Range</th><th>Final</th><th>Voice</th><th>Meter / endings</th><th>Source</th></tr></thead><tbody>${corpus.map((m, i) => `<tr><td><button class="secondary" data-piece="${i}">${e(m.metadata.title)}</button><p class="hint">${e(m.metadata.genre ?? "imported")}</p></td><td>${m.notes.length}</td><td>${pitchName(Math.min(...m.notes.map((n) => n.midi)))}–${pitchName(Math.max(...m.notes.map((n) => n.midi)))}</td><td>${pitchName(m.metadata.final ?? m.notes.at(-1)!.midi)}</td><td>${e(String(m.metadata.selectedVoice ?? "unknown"))}</td><td>${e(m.metadata.meter?.events.map((t) => `${t.numerator}/${t.denominator}`).join(", ") || "4/4 assumed")}<br>${m.metadata.phraseEnds?.filter((p) => p.kind === "internal").length ?? 0} internal candidates + final</td><td>${m.metadata.source?.startsWith("https://") ? `<a href="${e(m.metadata.source)}">MIDI source</a>` : "local import"}</td></tr>`).join("")}</tbody></table>`;
  el("corpus-table").onclick = (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-piece]",
    );
    if (!button) return;
    const m = corpus[Number(button.dataset.piece)];
    currentNotes = m.notes;
    currentJSON = m;
    available();
    cancelPlayback();
    el("score-subtitle").textContent =
      m.metadata.title + " · " + m.metadata.extraction;
    el("metrics").innerHTML =
      metric("Notes", String(m.notes.length)) +
      metric("Last pitch", pitchName(m.notes.at(-1)!.midi)) +
      metric(
        "Raw final duration",
        `${m.notes.at(-1)!.duration.toFixed(2)} beats`,
      ) +
      metric(
        "Model final duration",
        `${m.metadata.finalRhythm?.duration ?? m.notes.at(-1)!.duration} beats`,
      );
    void renderScore(m.notes, m.metadata.title).catch((error) =>
      status(String(error), true),
    );
  };
}
function setImport() {
  let imported: { bytes: Uint8Array; xml: string | null; name: string } | null =
    null;
  el<HTMLInputElement>("import-file").onchange = async () => {
    try {
      const file = el<HTMLInputElement>("import-file").files?.[0];
      if (!file) return;
      if (file.size > 2_000_000) throw new Error("Import limited to 2 MB");
      const bytes = new Uint8Array(await file.arrayBuffer()),
        xml = /\.(xml|musicxml)$/i.test(file.name)
          ? new TextDecoder().decode(bytes)
          : null;
      const voices = xml
        ? musicxmlVoices(xml)
        : midiVoices(bytes).map((v) => ({
            id: String(v.index),
            notes: v.notes,
          }));
      if (!voices.length) throw new Error("No melodic voices found");
      imported = { bytes, xml, name: file.name };
      el<HTMLSelectElement>("import-voice").innerHTML =
        '<option value="auto">Highest mean-pitch voice</option>' +
        voices
          .map(
            (v) =>
              `<option value="${e(v.id)}">Voice ${e(v.id)} · ${v.notes.length} notes</option>`,
          )
          .join("");
      el<HTMLSelectElement>("import-voice").disabled = false;
      el<HTMLButtonElement>("import-add").disabled = false;
      status("Choose a voice, then add it to the local corpus.");
    } catch (error) {
      imported = null;
      el<HTMLButtonElement>("import-add").disabled = true;
      status(String(error), true);
    }
  };
  el("import-add").onclick = async () => {
    try {
      if (!imported) return;
      const digest = await crypto.subtle.digest(
          "SHA-256",
          new Uint8Array(imported.bytes).buffer,
        ),
        sha = [...new Uint8Array(digest)]
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
      const selected = value("import-voice");
      const metadata = {
        id: `import-${sha.slice(0, 12)}-${selected}`,
        title: imported.name,
        sha256: sha,
        source: "local import",
      };
      const melody = imported.xml
        ? loadMusicXML(
            imported.xml,
            metadata,
            selected === "auto" ? undefined : selected,
          )
        : loadMidi(
            imported.bytes,
            metadata,
            selected === "auto" ? undefined : Number(selected),
          );
      if (melody.notes.length > 5000)
        throw new Error("Import limited to 5,000 notes per voice");
      if (corpus.some((m) => m.id === melody.id))
        throw new Error("This voice is already imported");
      corpus.push(melody);
      showCorpusTable();
      status(
        `Added ${melody.metadata.title}. Download the snapshot to use this corpus on the generator page.`,
      );
    } catch (error) {
      status(String(error), true);
    }
  };
  el("snapshot").onclick = () =>
    download(
      exportJSON({ schemaVersion: 1, melodies: corpus }),
      "machaut-corpus.json",
      "application/json",
    );
}
async function init() {
  const response = await fetch(new URL("corpus/melodies.json", root));
  if (!response.ok) throw new Error("Local corpus could not be loaded");
  corpus = await response.json();
  if (isCorpus) {
    showCorpusTable();
    setImport();
    status(`${corpus.length} local source voices loaded.`);
    return;
  }
  for (const id of ["start", "final", "low", "high"]) {
    const select = el<HTMLSelectElement>(id);
    for (let p = 36; p <= 96; p++) {
      const option = document.createElement("option");
      option.value = String(p);
      option.textContent = pitchName(p) + ` (${p})`;
      select.append(option);
    }
  }
  el<HTMLSelectElement>("final").value = "74";
  el<HTMLSelectElement>("low").value = "62";
  el<HTMLSelectElement>("high").value = "86";
  el("generate").onclick = () => generate(!checked("lock-seed"));
  el("regenerate").onclick = () => {
    generate(true);
  };
  for (const id of [
    "repertoire",
    "representation",
    "rhythm",
    "order",
    "backoff",
    "metrical-strength",
    "phrase-strength",
    "mode",
  ])
    el(id).onchange = updateStats;
  el("rhythm").onchange = () => {
    el<HTMLInputElement>("order").value =
      value("rhythm") === "corpus" ? "3" : "5";
    el<HTMLInputElement>("hold-ending").disabled = value("rhythm") !== "corpus";
    el<HTMLInputElement>("metrical-strength").disabled =
      value("rhythm") !== "corpus";
    el<HTMLInputElement>("phrase-strength").disabled =
      value("rhythm") !== "corpus";
    el<HTMLInputElement>("minimum-ending").disabled =
      value("rhythm") !== "corpus";
    el<HTMLInputElement>("phrase-ends").disabled = value("rhythm") !== "corpus";
    updateViewpointLabels();
    updateStats();
  };
  el("hold-ending").onchange = () => {
    updateStats();
  };
  el<HTMLSelectElement>("rhythm").disabled = false;
  el("phrase-example").onclick = () => {
    el<HTMLInputElement>("length").value = "32";
    el<HTMLInputElement>("fixed").value = "8:69; 16:74; 24:69; 32:74";
  };
  el<HTMLInputElement>("snapshot-file").onchange = async () => {
    try {
      const file = el<HTMLInputElement>("snapshot-file").files?.[0];
      if (!file) return;
      if (file.size > 5_000_000) throw new Error("Snapshot limited to 5 MB");
      const data = JSON.parse(await file.text());
      if (
        data.schemaVersion !== 1 ||
        !Array.isArray(data.melodies) ||
        !data.melodies.length
      )
        throw new Error("Invalid corpus snapshot");
      const importedCorpus: Melody[] = data.melodies.map(validateMelody);
      if (
        importedCorpus.length > 50 ||
        importedCorpus.reduce((n, m) => n + m.notes.length, 0) > 20000
      )
        throw new Error(
          "Corpus snapshots are limited to 50 pieces and 20,000 notes",
        );
      corpus = importedCorpus;
      el<HTMLSelectElement>("repertoire").value = "all";
      el<HTMLSelectElement>("repertoire").options[0].textContent =
        `All ${corpus.length} pieces`;
      updateStats();
      status("Imported corpus snapshot.");
    } catch (error) {
      status(String(error), true);
    }
  };
  updateStats();
  el<HTMLButtonElement>("generate").disabled = false;
  status(`${corpus.length} source voices ready. Generate a melody to begin.`);
}
void init().catch((error) => status(String(error), true));
window.addEventListener("pagehide", () => {
  worker?.terminate();
  stop();
});

let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (currentNotes.length)
      void renderScore(currentNotes, scoreTitle).catch((error) =>
        status(String(error), true),
      );
  }, 150);
});
