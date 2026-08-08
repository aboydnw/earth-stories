// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPreviewReceipt,
  previewMatchesRevision,
  readPreviewReceipt,
  recordPreviewReceipt,
} from "./previewReceipt";

describe("preview receipts", () => {
  beforeEach(() => {
    sessionStorage.clear();
    for (const projectId of ["one", "two", "bad", "blocked"])
      clearPreviewReceipt(projectId);
  });

  it("tracks saved revisions per project", () => {
    recordPreviewReceipt("one", "rev-1");
    recordPreviewReceipt("two", "rev-2");
    expect(previewMatchesRevision("one", "rev-1")).toBe(true);
    expect(previewMatchesRevision("one", "rev-2")).toBe(false);
    expect(readPreviewReceipt("two")).toBe("rev-2");
    clearPreviewReceipt("one");
    expect(readPreviewReceipt("one")).toBeNull();
  });

  it("discards corrupt values", () => {
    sessionStorage.setItem("earth-stories:preview-receipt:bad", "not json");
    expect(readPreviewReceipt("bad")).toBeNull();
  });

  it("falls back safely when corrupt storage cannot be removed", () => {
    sessionStorage.setItem("earth-stories:preview-receipt:blocked", "not json");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readPreviewReceipt("blocked")).toBeNull();
    vi.restoreAllMocks();
  });
});
