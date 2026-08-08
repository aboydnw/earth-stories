import { describe, expect, it } from "vitest";
import {
  clampTemporalPosition,
  formatTemporalTimestamp,
  timestampAtPosition,
  timestepIndex,
  timestepPosition,
} from "./temporal.js";

describe("temporal helpers", () => {
  it("maps discrete slider slots without confusing them with source indices", () => {
    expect(timestepIndex(0.5, 3)).toBe(1);
    expect(timestepPosition(2, 3)).toBe(1);
  });

  it("clamps authored positions", () => {
    expect(clampTemporalPosition(-1)).toBe(0);
    expect(clampTemporalPosition(2)).toBe(1);
  });

  it("maps normalized positions onto continuous timestamps", () => {
    expect(timestampAtPosition(0.25, 1_000, 5_000)).toBe(2_000);
  });

  it("does not throw for finite timestamps outside the Date range", () => {
    expect(formatTemporalTimestamp(Number.MAX_VALUE)).toBe("");
  });
});
