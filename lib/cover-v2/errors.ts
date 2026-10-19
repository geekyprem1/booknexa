/** Typed failures for Cover V2, so routes can explain them to a human. */

/**
 * The image model's safety filter rejected the prompt or the output. In practice
 * the most common trigger is a title that closely echoes a well-known published
 * work. The buyer needs to be told that, not shown a raw API error.
 */
export class CoverV2SafetyError extends Error {
  constructor(detail?: string) {
    super("Cover generation was blocked by the model's content filter");
    this.name = "CoverV2SafetyError";
    this.detail = detail;
  }
  readonly detail?: string;
}

/** The image model or vision model failed for a non-content reason. */
export class CoverV2ProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "CoverV2ProviderError";
  }
}

/** The finished image did not match the exact pixel dimensions KDP requires. */
export class CoverV2GeometryError extends Error {
  constructor(expected: { width: number; height: number }, actual: { width: number; height: number }) {
    super(
      `Finished cover is ${actual.width}×${actual.height}px but KDP needs ${expected.width}×${expected.height}px`
    );
    this.name = "CoverV2GeometryError";
  }
}
