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
    localStorage.clear();
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

  it("shares receipts through local storage and tolerates blocked reads", () => {
    recordPreviewReceipt("one", "rev-1");
    expect(localStorage.getItem("earth-stories:preview-receipt:one")).toContain(
      "rev-1",
    );
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readPreviewReceipt("one")).toBe("rev-1");
    vi.restoreAllMocks();
  });

  it("discards corrupt values", () => {
    localStorage.setItem("earth-stories:preview-receipt:bad", "not json");
    expect(readPreviewReceipt("bad")).toBeNull();
  });

  it("falls back safely when corrupt storage cannot be removed", () => {
    localStorage.setItem("earth-stories:preview-receipt:blocked", "not json");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readPreviewReceipt("blocked")).toBeNull();
    vi.restoreAllMocks();
  });
});

it("retains a receipt when writing storage fails", () => {
  clearPreviewReceipt("quota");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  recordPreviewReceipt("quota", "rev-3");
  expect(readPreviewReceipt("quota")).toBe("rev-3");
  vi.restoreAllMocks();
  clearPreviewReceipt("quota");
});
