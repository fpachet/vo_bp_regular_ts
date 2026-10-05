# Machaut MVP results

The standalone application uses the public npm package
`markov-constraints@0.4.0-rc.1`; it does not import the repository’s emitted engine.
The plan’s implementation stages are complete. The application is live on
[GitHub Pages](https://fpachet.github.io/vo_bp_regular_ts/machaut/).

## Delivered

Six local source MIDI files yielded 427 notes after documented upper-voice
extraction. All three modelling representations, exact musical constraints,
ordinary comparison, copied-passage diagnostics, clickable score/note explanations,
Worker cancellation, notation/playback, exports and corpus imports are implemented.
The `/corpus/` page shows source metadata and permits explicit voice selection
for imported MIDI or uncompressed MusicXML.

## Measured construction improvement

Mac ARM64, Node 24.3.0, order 5, backoff .25, 32 notes, seed 12345, D5 final,
D4–D6 bounds, maximum leap 7, natural pitch classes and stepwise cadence.
Each measurement is the median of three runs in one process. Time includes
training, product compilation, inference, sampling, explanations and diagnostics.
Buffer bytes exclude model/acceptor Maps and object metadata.

| Representation | Initial median | Compact median | Unique product states, initial → compact | Retained buffers, initial → compact |
| -------------- | -------------: | -------------: | ---------------------------------------: | ----------------------------------: |
| Absolute pitch |        77.2 ms |        45.4 ms |                             13,821 → 531 |                     1.93 → 0.20 MiB |
| Intervals      |       276.2 ms |        83.3 ms |                           80,184 → 3,079 |                    10.76 → 1.11 MiB |
| Relative final |        59.9 ms |        34.0 ms |                             12,563 → 494 |                     1.76 → 0.18 MiB |

The compact acceptor carries note position only when fixed positions or repetition
require it. Final pitch and cadence are terminal acceptance conditions. This
avoids duplicating equivalent musical states across the whole horizon. The
interval trial is about 3.3× faster with about 90% fewer retained buffer bytes.
Independent tests compare partitions within 1e-10 and identical seeded notes
against the saved initial results. Raw files: [before](benchmark-before.json),
[after](benchmark-results.json). These are local measurements, not universal speed
or process-memory guarantees.

A separate default 128-note interval trial completed in about 297 ms with 3,079
unique states and no constraint violations. Fixed-position/repetition examples
retain the positional state and can be significantly more expensive.

## Scientific pilot

The leave-one-piece-out script produced 18 evaluations (six pieces × three
representations). Twelve held-out sequences have supported token vocabularies;
six contain unseen tokens and report unsupported/null scores. For all twelve
supported cases, held-out mean log source weight exceeded its shuffled-token
baseline in this pilot. See [raw pilot results](experiments/leave-one-out-pilot.json).
Generated same-length source samples are also scored. This is an exploratory
pipeline check, with six pieces, inferred finals, and a simple token-shuffle null;
it is not evidence of historically faithful generation.

Copy diagnostics found longest literal source passages of 22, 15 and 23 notes
in the seeded absolute/interval/relative trials. This motivates corpus expansion,
copy control and transposition-invariant diagnostics in subsequent research.

## Validation

- 16 application tests passed locally, including six actual source files,
  training/backoff, all representations, exact repeats, exhaustive tiny-language
  comparisons, probability explanations, seeded equivalence and export round trips.
- All 264 original library tests passed locally.
- Strict TypeScript application build and bundled module Worker passed locally.
- Local browser verification: interval generation, conventional SVG notation,
  playback/stop and corpus inspection.
- [Remote CI](https://github.com/fpachet/vo_bp_regular_ts/actions/runs/37323269546)
  passed Node 20/22/24 library/application checks, fresh Python parity and all
  26 Chromium/Firefox browser cases (8 Machaut cases plus 18 library playground cases).
- [Pages deployment](https://github.com/fpachet/vo_bp_regular_ts/actions/runs/37323269682)
  passed. Firefox exposed an SVG group hit-area issue during the first run;
  transparent note hit boxes fixed it and the rerun passed in both engines.
  The final run also verifies that generation stays disabled during delayed
  corpus loading.
- Desktop and narrow-layout manual checks passed. Generator controls appear
  beside the score; notation reflows on resize and exports preserve the results.

The bundled engine Worker is approximately 26.6 kB. The main JS bundle is
approximately 130 kB (44 kB gzip); notation is a separate on-demand ~1.37 MB
(~354 kB gzip) chunk. All corpus and rendering assets are served locally.

## Limits and next research steps

Generated rhythm supports equal quarters or learned compound duration tokens
(described below). Inspection preserves original source timing; 4/4 notation
is a modern grid. Voice selection and final labels are heuristics
requiring musicological review. Source transcription reuse terms are unspecified;
the app’s MIT license does not cover those third-party transcriptions.
Complex repeated-span constraints remain bounded exact inference and can exhaust
resource limits. Compressed MusicXML, MEI, rests/beat-count constraints, multiple
simultaneous voices, historical cadence/modal inference, learned phrase structure
and a validated stylistic evaluation are future work.


## Learned rhythm extension

Optional compound pitch/duration tokens now train on source inter-onset timing
rounded to a sixteenth-note grid. All three pitch representations support learned
rhythm, conditioned pitch rules, seeded generation, explanations, neutral playback
and duration-preserving exports. Dotted notation and tied segments map back to the
original generated event when clicked. Original quarter-note benchmark samples
and partitions remain unchanged.

The supplied six-piece corpus yields several duration values; generated notes
are contiguous and no rests or fixed beat-count constraints are introduced.
Repeated spans constrain pitches, not rhythm. The interval anchor's duration is
an independent empirical sample, with its probability recorded separately.

A three-run Node 24.3.0 ARM64 local benchmark at order 3, 32 notes, seed 12345
measured medians of 113 ms (absolute), 238 ms (intervals), and 95 ms (relative),
using respectively 0.61, 2.12, and 0.58 MiB inference buffers. These exclude source
and acceptor objects and are observational. Raw data: `benchmark-rhythm-results.json`.
Reproduce with `node --import tsx scripts/benchmark-rhythm.ts` from the app directory.
Joint order 5 exceeded the 3,000,000-edge budget in the default interval browser
trial; selecting learned rhythm therefore starts at order 3. Order remains adjustable.

Validation: 24 application tests pass locally, covering quantization, joint token
support, exact pitch conditions, repeated spans/cadences, ordinary sampling, seeded
reproducibility, probability normalization and MIDI/MusicXML round trips. Browser
CI additionally tests learned rhythm in each representation, tied-score clicks,
playback and exports in Chromium and Firefox.
