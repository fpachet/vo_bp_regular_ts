/** Positive-weight accepted paths do not exist for the requested horizon. */
export class InfeasibleError extends Error {
  constructor() {
    super("Constraint has zero mass");
    this.name = "InfeasibleError";
  }
}
/** Compilation stopped before exceeding a user-supplied resource budget. */
export class ResourceLimitError extends Error {
  constructor(
    readonly resource: string,
    readonly limit: number,
  ) {
    super(`Product ${resource} limit exceeded (${limit})`);
    this.name = "ResourceLimitError";
  }
}
