# Corpus provenance

- `alice.txt`: complete Project Gutenberg ebook 11, Lewis Carroll's *Alice's
  Adventures in Wonderland* (1865), downloaded from
  https://www.gutenberg.org/ebooks/11.txt.utf-8 on 2026-10-05. Gutenberg's included
  header/license is preserved. Benchmarks strip Gutenberg's START/END wrapper.
- `bach-pitches.txt`: deterministic pitch-only Prelude-like arpeggiation corpus
  copied from the MIT-licensed fpachet/vo-regular-bp reference repository. It is
  an evaluation corpus, not a critical score edition. Twelve pitch transpositions
  are materialized for the melody workload.
- Branching synthetic corpora are generated reproducibly by the documented LCG
  in realistic-workloads.mjs; no external data is involved.
