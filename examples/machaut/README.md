# Guillaume de Machaut Melody Laboratory

A standalone TypeScript browser application consuming
[`markov-constraints@0.4.0-rc.1`](https://www.npmjs.com/package/markov-constraints)
from npm. The generation engine is a dependency; none of its implementation is
copied into this application.

[Live generator](https://fpachet.github.io/vo_bp_regular_ts/machaut/) ·
[Corpus inspection](https://fpachet.github.io/vo_bp_regular_ts/machaut/corpus/)

```sh
cd examples/machaut
npm ci
npm run dev
```

Use Node 24 for development; Vite requires Node 20.19 within the Node 20 line,
or Node 22.12 or later. Open the URL printed by Vite. For a static build, run `npm run build` and serve
`build/` over HTTP. The application needs no source-site or CDN connection at
runtime: corpus files, notation renderer and Markov engine are bundled locally.

## Included MVP

- Six attributed source MIDI transcriptions, 427 extracted melodic notes.
- Absolute pitches, signed intervals, and pitches relative to each source final.
- Orders 1–10 and an explicit geometric backoff mixture, including order zero.
- Exact note count, first/last pitches, allowed pitch classes, pitch bounds,
  optional maximum span, maximum leap, forbidden signed intervals, fixed
  one-based positions and phrase endings, stepwise or explicit interval cadences.
- Exact recurrence of a selected opening span (UI: first three notes at the end;
  core: disjoint spans of up to four notes). Complex repeats can exceed budgets.
- Globally conditioned generation and a genuinely sequential ordinary sampler.
- Seeded reproducibility, note explanations showing source and future-conditioned
  probabilities, copying statistics, model/n-gram statistics and buffer diagnostics.
- Conventional MusicXML notation using OpenSheetMusicDisplay, neutral WebAudio
  playback, MIDI/MusicXML/JSON export and Worker cancellation.
- MIDI and uncompressed score-partwise MusicXML import, selectable melodic voice,
  corpus snapshot download/import, and a `/corpus/` inspection page.
- A leave-one-piece-out pilot CLI with held-out, shuffled and generated scores.

Generated melodies use equal quarter notes. Source durations and rests are
retained for inspection/export, but are not modelled. Modern 4/4 engraving is a
display convention; neither modal classification nor mensural rhythm is inferred.
An interval model emits N−1 intervals and requires an anchor pitch. If Start is
unset, the reference final supplies that anchor. Relative-final models transpose
each piece’s last sounding note to zero during training; the reference final
reconstructs generated pitches.

The "step into final" cadence accepts penultimate pitches 1 or 2 semitones above
or below the final. It is a configurable illustrative rule, not a historical
cadence theory. Fixed positions use `8:69; 16:74` and alternatives `16:72|74`.
For explicit cadence tails use `-2,2; -1,1`; these combine with other enabled rules.

## Corpus provenance

Source collection: [APEMUTAM Machaut MIDI collection](https://www.apemutam.org/instrumentsmedievaux/PartMed/Machaut/Machaut.html).
Retrieved 2026-10-05. Every source URL and SHA-256 checksum is recorded in
`public/corpus/metadata.json`. Source MIDI is stored under `midi/`, derived modern
MusicXML under `musicxml/`, and normalized extracted melodies in `melodies.json`.
`npm run corpus:prepare` rebuilds the derived data from local MIDI without network.

Default extraction selects the non-percussion track with highest mean MIDI pitch,
keeps the highest simultaneous note, and clips overlapping sustained notes to
preserve a monophonic voice. The chosen track is recorded. This heuristic requires
musicological review; track indices are zero-based and are not historical voice
names. Last pitches are recorded as convenient finals, with no modal attribution.

The collection does not specify transcription reuse terms on its index page.
Attribution and original files are retained for this research pilot; this
repository’s MIT license covers the application code and does not grant rights
to the third-party MIDI transcriptions. Confirm transcription permission before
redistributing the corpus as a separately licensed dataset or critical edition.

## Architecture and exactness

- `src/music.ts`: domain types, interval tokens, monophonic normalization.
- `src/corpus/`: MIDI and MusicXML loaders independent of the UI.
- `src/markov/`: representation-specific training, source scores and statistics.
- `src/constraints/`: deterministic musical acceptor over pitch, position,
  optional extrema/repetition memory and cadence tails.
- `src/generation/`: sequential sampling, exact conditioned sampling, diagnostics
  and Worker transport. Source and future-conditioned continuations are inspectable.
- `src/export/`: standard MIDI, MusicXML and reproducible experiment JSON.
- `src/ui/`: controls, corpus inspection, notation and playback.

For intervals, the acceptor carries the accumulated pitch. This makes absolute
range, fixed notes and final requirements regular constraints over a bounded
pitch domain. Repetition stores the opening notes in acceptor state; it does
not generate a phrase first and subsequently condition on that random phrase.
Thus the entire requested language is conditioned jointly, including repeats.

Exactness is relative to the trained fixed source and acceptor, within Float64
rounding. No smoothing creates unseen tokens. Backoff can redistribute mass
among observed tokens but cannot make an unsupported pitch/interval feasible.
Ordinary sampling ignores musical conditions and reports violations; it does
not repair its output. An ordinary interval walk leaving the MIDI domain fails
export validation rather than being silently resampled.

Product limits: 150,000 unique states, 750,000 time-indexed states, 3,000,000
edges and DFA evaluations. Worker jobs stop after 30 seconds and can be cancelled.
Long interval melodies, high orders and repeated phrases can exceed these limits.
Errors invite simplifying conditions; the solver does not approximate or truncate.
The notation renderer is loaded on demand (~354 kB gzip in the initial build).

## Validation and experiments

```sh
npm test
npm run build
npm run experiment
npm run benchmark
```

Tests exercise real corpus extraction, training counts, backoff, all three
representations, exact repetition, independent exhaustive constraint checking,
determinism, future-conditioned probabilities, copying boundaries, and MIDI/XML
round trips with rests, long tied notes and fractional durations. Repository
browser CI additionally verifies notation, export downloads, ordinary versus
constrained behavior, cancellation, voice import and corpus snapshots in Chromium
and Firefox using the exact deployed static artifact.

`npm run experiment` writes `experiment-results.json` (ignored) for six held-out
pieces × three representations. Relative-final evaluation uses the held-out final
for normalization, which must be acknowledged in later experimental designs.
Unsupported token sequences are reported with null scores; no smoothing or silent
omission changes the experiment. A token shuffle is only a simple pilot baseline,
not a validated alternative-composer comparison.

JSON generation exports contain schema/library version, complete selected corpus
notes and source checksums, model parameters, exact constraints, seed, emitted
notes, source/conditional log weights, diagnostics and note explanations. Timing
is observational and may differ across runs; notes are reproducible given the
same inputs and library version.

Future research: review voice/final annotations, establish a licensed broader
corpus, preserve phrase/rhythmic structure in compound tokens, evaluate
transposition-invariant copying, and design stronger held-out stylistic baselines.
