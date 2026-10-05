/** Growable structure-of-arrays edge storage. Symbols are IDs in the graph encoder. */
export class PackedEdges {
  symbols = new Uint32Array(512);
  destinations = new Uint32Array(512);
  weights = new Float64Array(512);
  length = 0;
  append(symbol: number, next: number, weight: number): void {
    if (this.length === this.symbols.length) {
      const size = this.length * 2;
      const symbols = new Uint32Array(size),
        destinations = new Uint32Array(size),
        weights = new Float64Array(size);
      symbols.set(this.symbols);
      destinations.set(this.destinations);
      weights.set(this.weights);
      this.symbols = symbols;
      this.destinations = destinations;
      this.weights = weights;
    }
    this.symbols[this.length] = symbol;
    this.destinations[this.length] = next;
    this.weights[this.length++] = weight;
  }
  finish(): void {
    if (this.length !== this.symbols.length) {
      this.symbols = this.symbols.slice(0, this.length);
      this.destinations = this.destinations.slice(0, this.length);
      this.weights = this.weights.slice(0, this.length);
    }
  }
  get byteLength(): number {
    return (
      this.symbols.byteLength +
      this.destinations.byteLength +
      this.weights.byteLength
    );
  }
}
/** Canonical sorted state sets allow layers and index buffers to be shared. */
export class LayerPool {
  private buckets = new Map<number, Uint32Array[]>();
  intern(ids: Uint32Array): Uint32Array {
    ids.sort();
    let hash = 2166136261;
    for (const id of ids) hash = Math.imul(hash ^ id, 16777619);
    hash = Math.imul(hash ^ ids.length, 16777619);
    let bucket = this.buckets.get(hash);
    if (bucket) {
      for (const old of bucket)
        if (old.length === ids.length && old.every((id, i) => id === ids[i]))
          return old;
    } else {
      bucket = [];
      this.buckets.set(hash, bucket);
    }
    bucket.push(ids);
    return ids;
  }
}
