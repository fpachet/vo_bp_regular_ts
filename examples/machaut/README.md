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

The default viewpoint is **absolute pitch × duration**, with order **3**, learned rhythm and
the metered final-note constraint enabled. Interval and relative-final viewpoints
remain available in the Viewpoint control.

**Generate melody** chooses a fresh random seed on every click and updates the
visible seed field. Select **Keep seed fixed** to reuse a seed or replay a saved
melody with the same settings and corpus. **New seed** always chooses a fresh
seed, including when the seed is fixed. Experiment JSON records the seed used.

- 23 attributed source MIDI transcriptions and 2,879 extracted notes. Default: 16 rondeaux/virelais and 1,697 notes. Ballades, motets, the complaint, all secular songs and the original six-piece pilot are selectable.
- Absolute pitches, signed intervals, and pitches relative to each source final.
- Orders 1–10 and an explicit geometric backoff mixture, including order zero.
- Exact note count, first/last pitches, allowed pitch classes, pitch bounds,
  optional maximum span, maximum leap, forbidden signed intervals, fixed
  one-based positions and phrase endings, stepwise or explicit interval cadences.
- Exact recurrence of a selected opening span (UI: first three notes at the end;
  core: disjoint spans of up to four notes). Complex repeats can exceed budgets.
- Globally conditioned generation; ordinary mode ignores hard musical conditions while retaining enabled soft model priors. With both priors disabled it uses sequential Markov sampling.
- Seeded reproducibility, note explanations showing source and future-conditioned
  probabilities, copying statistics, model/n-gram statistics and buffer diagnostics.
- Conventional MusicXML notation using OpenSheetMusicDisplay, neutral WebAudio
  playback, MIDI/MusicXML/JSON export and Worker cancellation.
- MIDI and uncompressed score-partwise MusicXML import, selectable melodic voice,
  corpus snapshot download/import, and a `/corpus/` inspection page.
- A leave-one-piece-out pilot CLI with held-out, shuffled and generated scores.

Choose **Equal quarter notes** (the original reproducible pitch-only model) or
**Learned rhythm**. Learned rhythm trains compound `(pitch token, duration)`
tokens in all three representations and conditions their joint distribution on
all pitch constraints. Switching rhythm selects order 3 for learned rhythm, or order 5 for quarter notes; the order remains adjustable. Compound vocabularies
are larger and high orders can exceed the existing exact solver budgets. Durations are quarter-note units: 0.25 is a sixteenth,
0.5 an eighth, 1 a quarter, 1.5 a dotted quarter, and 2 a half.

Training rounds inter-onset spacing to the nearest 0.25 quarter-note units,
with a minimum of 0.25. This avoids treating MIDI note-off articulation as
notated rhythm. The final source note uses a documented within-voice MIDI release-pattern estimate when supported; otherwise it uses rounded sounding duration. Raw MIDI timings remain unchanged.
Original corpus timings are preserved. Gaps are folded into the preceding
note; this mode generates contiguous notes, not rests. In interval mode with meter or phrase priors enabled, the opening duration is an explicit
source token conditioned jointly with the entire melody. Without meter or phrase priors it is
sampled independently from empirical source opening durations after sampling
the conditioned interval sequence.
Later durations belong to the arriving note's interval token. This choice is
recorded in experiment JSON alongside the token dictionary and anchor-duration
probability. Source and conditional log scores describe the emitted model tokens;
in interval mode without either prior or meter the independent anchor-duration probability is
reported separately; with meter or phrase priors it belongs to the full token sequence score.

Length, fixed positions, cadences and repeats still count **notes**, and repeated
spans constrain pitches only; they do not require equal durations. Total beat
count is reported. Meter conditioning requires a complete number of bars;
the number of bars itself is not fixed. Dotted values and ties across bar
lines retain their event duration in notation, playback, exports and score-click
explanations. The modern 4/4 engraving grid is a display convention; neither modal classification nor mensural rhythm is inferred.
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
edges and DFA evaluations (metered/phrase-prior generation permits 40,000,000 time-indexed
edges; the other budgets stay unchanged). Worker jobs stop after 30 seconds and can be cancelled.
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
corpus, add rests, beat-count constraints and rhythmic repeats, evaluate
transposition-invariant copying, and design stronger held-out stylistic baselines.

## Meter and final-position constraint

**End at an exact bar boundary** is enabled by default with learned rhythm.
The acceptor tracks duration modulo four beats. The minimum final duration is
adjustable and defaults to **0.25 beats**, allowing the learned final-duration
prior to favour source-supported endings. Setting it to 2 restores the earlier
long-ending constraint. No note is extended or repaired after sampling.
`notes` and `sampledNotes` remain identical, and `endingAdjustment` is null.
Ordinary mode ignores this hard ending rule but retains enabled soft priors.
Quarter-note mode disables rhythm-prior and bar-ending controls.

Order **3** remains the default. The expanded default repertoire uses a larger
40,000,000 time-indexed edge budget, while unique-state, time-indexed-state and
DFA-evaluation caps remain unchanged. This limit counts repeated appearances of
shared rows across layers, not 40 million separately stored edges. The default
benchmark occupies about 20 MiB of packed buffers. Other source/acceptor objects
and sampling caches require additional memory. All 23 pieces, complex repeats,
internal phrase positions or high orders can exceed limits; select a narrower
repertoire or lower the order rather than expecting an approximate result.

### Learned metrical preferences

The generator defaults to meter strength **1** for learned pitch × duration.
Set **Learned meter strength** to **0** to recover the previous model; values up
to 3 increase the preference. Quarter-note mode disables it. Both generation
modes retain the soft metrical model; ordinary mode ignores hard musical rules.

For each sixteenth-note phase on the assumed modern 4/4 grid, training counts
source inter-onset durations at their original MIDI onsets. The conditional
duration distribution is smoothed towards the corpus-wide duration distribution
with eight pseudo-observations. Missing phases therefore have neutral weights.
The transition potential is
`[P(duration | phase) / P(duration)] ** strength`, avoiding a second marginal
duration prior. The sequence distribution is the original Markov probability
times these potentials, normalized globally over the requested note horizon
and applicable exact constraints. This is a weighted sequence model, not a
locally normalized Markov transition rule. Interval opening durations participate
jointly whenever these weights are enabled, including in ordinary mode.

The existing phase state applies the weights and enforces the optional exact
bar ending. No state dimension is added when meter was already enabled. With
free rhythm, tracking phase does add product states compared with a source-only
model. Experiment JSON includes the full prior, crossing/onset diagnostics,
separate base-source and metrical log weights, and the combined partition and
conditional probability. Note explanations show each continuation's meter weight.

The original six MIDI files contain no time-signature events. Two added files
explicitly encode 3/2 or 6/8. Original meter events are retained in metadata;
incompatible meters are excluded from 4/4 phase counts while global duration
support is retained. Missing meter uses an assumed 4/4 grid. Pickups are recorded
as unknown, with original first-onset offsets preserved. These are not reconstructed
mensural meters. A future annotated
corpus should specify meter changes and pickup offsets before interpreting the
statistics historically.

Run `npm run benchmark:meter` from this directory to reproduce
[meter-benchmark-results.json](meter-benchmark-results.json). For 40 identical
seeds and the default pitch/cadence/bar-ending conditions, enabling strength 1
reduced onset-distribution total-variation distance from the source from
**0.117 to 0.053** (55% reduction). Median generation time was **148 vs 153 ms**
on this local run, with **1,553 states** in both cases and approximately
**1.22 MiB** of packed buffers. Crossing rates were **6.7% vs 4.6%**, while
the corpus rate was **7.0%**: matching local duration preferences does not
guarantee matching aggregate crossings after other constraints. These measurements
use the training corpus and do not establish held-out stylistic improvement.

### Expanded corpus and phrase-duration priors

All 17 additional MIDI files from the same source collection are stored with
SHA-256 hashes, retrieval dates, selected tracks, timing-based phrase candidates
and MIDI meter evidence. Genres follow the source table, pending independent
catalogue review. Track ranges, onsets and release patterns were inspected;
selecting the highest mean-pitch voice does not establish historical cantus identity.
The original raw six-piece snapshot is retained as `pilot-melodies.json` for
regression tests and historical benchmarks; the Pilot menu uses the six original
works with the new rhythm annotations.

Internal boundary candidates require an actual silence of at least half a beat
and 35% of inter-onset spacing. These are conservative timing estimates, not
verified editorial phrases. Every piece also supplies one EOF ending. Repeated
literal eight-event pitch/duration cadence signatures count once per work and
boundary kind; duplicate source works count once for ending observations.
The smoothing distribution covers every duration in the full training corpus,
including imported copies with different final-release annotations. The default 16-piece repertoire
has **78 internal candidates and 16 final endings**, with 13 repeated observations
removed. User snapshots may supply reviewed `metadata.phraseEnds` annotations.

For EOF timing, preparation finds the modal small release gap (at most 0.25 beat)
for matching sounding durations in the same voice. If none exist, it considers
long-note release gaps with at least two observations. A mode must account for
at least 75% of the evidence. The estimated EOF spacing, support count, basis
and untouched sounding duration are recorded in `metadata.finalRhythm`.
Unsupported estimates fall back to rounded sounding duration. This prevents
MIDI articulation such as 2.75-beat releases from becoming an unintended
three-quarter-beat preference when the same voice consistently uses 3-beat spacing.

**Phrase-ending duration strength** defaults to 1. Separate internal and EOF
distributions are smoothed towards global durations with eight pseudo-observations.
The factor is `[P(duration | ending kind) / P(duration)] ** strength`. EOF gets
the final prior; optional **Internal phrase ends** such as `8,16,24` get the
internal prior. These are duration preferences, not hard pitch cadences or
bar-boundary rules. Set strength to 0 to disable them; both soft priors must be
0 to obtain the original unweighted source model.

A forced bookkeeping end symbol applies the EOF weight without a duration/position
counter in the acceptor. Empty-context source fallbacks are refined by their last
token with identical note probabilities. Rejected padding keeps the graph rows
normalized; its path-independent scale is removed from the reported partition.
The symbol never appears in notes or musical exports. Specified internal positions
need a bounded position counter and may cost additional memory. Exhaustive tiny
enumeration checks the distribution including those positions and fallback states.
Experiment JSON includes separate source, meter and phrase log weights; their sum
minus the corrected log partition equals the conditional log probability.

Run `npm run benchmark:endings` to reproduce
[endings-benchmark-results.json](endings-benchmark-results.json). For 1,000
conditioned samples per strength with the default expanded repertoire, mean final
duration increases from **1.82 to 2.64 beats**. Four-beat endings increase from
**4.1% to 34.5%**, while half-beat endings decrease from **16.9% to 3.5%**.
The source EOF mean is 3.64 beats; the generated distribution also depends on
source pitch/duration associations, fixed final pitch, cadence and exact meter.
Compilation took roughly 2.4 seconds with 18,042 states and about 20 MiB of packed
buffers on this local run. These are training-data checks, not held-out historical
style validation.

### Browser sound

Playback uses `smplr` with MusyngKite sampled Recorder (default), Harp,
Fiddle, Organ and Voice. Select a sound and press Play; the first use downloads
that instrument's samples. Loaded instruments are cached for this page session.
Network failures are shown beside the controls; retry or download MIDI.

Generation → performance rendering → sampler → Web Audio reverb → output.

`src/audio/performance.ts` converts quarter-note beats to seconds at the selected
BPM without modifying the symbolic melody or exports. Natural performance adds
instrument-specific articulation (Recorder 96%, Harp 100%, Fiddle 99%,
Organ/Voice 98%), gentle accents on quarter-note beat positions, and a softer final
note held to 115%; disabling it preserves exact symbolic timing and duration.
Explicit internal phrase endings soften the release; Recorder and Voice leave a
breath of up to 60 ms (capped at 15% of note duration) where needed. Existing
rests provide their own breath. There is no timing jitter or inferred phrasing. Reverb defaults to a
restrained 12% send and can be adjusted during playback.

`src/ui/playback.ts` owns the shared AudioContext, lazy instrument cache, audio
clock scheduling and cancellation. Stop also mutes the reverb output. Instrument
changes and melody replacement cancel pending loads' playback requests.
The instrument table and sampler construction are the places to plug in future
historical samples using `smplr.Sampler`; the generator and performance function
need no changes. General MIDI names do not establish historical authenticity.

### Reusing a trained model

The generation Worker stays alive after a result and retains one trained model
and its learned meter/phrase statistics. The cache compares full selected corpus
content and effective model settings (including interval-anchor handling).
Changing only the seed or musical constraints reuses this preparation; inference
is still recomputed. Cancel, timeout, worker failure or closing the page discards
the cache. Generation diagnostics report preparation, inference and sampling
times and whether the model was reused. `generate()` remains usable without a
cache for scripts and independent comparisons.

Notation keeps one OpenSheetMusicDisplay instance. Unchanged MusicXML is not
reloaded on resize; only layout is redrawn and note interaction is reattached.
The notation timing beside the score measures load/layout separately from model
generation (the first renderer download and queue wait are excluded).
