# Machaut MVP implementation plan

1. Create an independent npm-consuming TypeScript application and local attributed
   corpus with hashes and explicit extraction choices.
2. Normalize melodic events; load MIDI and MusicXML; train and compare absolute,
   interval and relative-final representations with backoff.
3. Implement jointly conditioned musical acceptors, an ordinary baseline,
   reproducible exports, copy diagnostics and note explanations.
4. Build the generator and corpus UI with MusicXML notation, playback, downloads,
   Worker cancellation and user corpus import.
5. Validate core semantics, export round trips and deployed browser workflows;
   measure default workload performance and run a leave-one-piece-out pilot.
6. Integrate into Pages and repository CI, publish the working demo, and report
   measured results and remaining research limitations.

All six stages are complete. Implementation, browser/deployment validation and
measured improvements are recorded in [RESULTS.md](RESULTS.md).


## Duration extension

- [x] Add optional learned compound pitch/duration tokens to all representations.
- [x] Quantize source inter-onset timing; record anchor semantics and token dictionary.
- [x] Preserve all pitch constraints and original quarter-note seeded behavior.
- [x] Engrave dotted values and tied bar splits, with event-aware score clicks.
- [x] Retain durations in playback, MIDI, MusicXML and experiment exports.
- [x] Test quantization, joint token support, reproducibility, probability normalization and round trips.
- [x] Verify Chromium/Firefox integration and deploy.


## Exact metered ending

- [x] Replace post-generation extension with meter phase and final-position duration acceptance.
- [x] Include the interval opening duration in the conditioned source sequence.
- [x] Preserve source-supported durations and probability explanations; report ordinary violations.
- [x] Verify weighted enumeration, anchor conditioning, seed variation, and unchanged MIDI/XML exports.
- [x] Measure real-corpus state/time costs and set a usable bounded default.
- [ ] Validate Chromium/Firefox and deploy.
