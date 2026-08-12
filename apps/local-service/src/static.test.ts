import { describe, expect, it } from "vitest";
import { isSameOpenedFile } from "./static.js";

describe("opened editor file identity", () => {
  it("requires a regular resolved path with matching device and inode", () => {
    expect(
      isSameOpenedFile(
        { dev: 12n, ino: 34n, isFile: () => true },
        { dev: 12n, ino: 34n, isFile: () => true },
      ),
    ).toBe(true);
    expect(
      isSameOpenedFile(
        { dev: 12n, ino: 34n, isFile: () => true },
        { dev: 12n, ino: 35n, isFile: () => true },
      ),
    ).toBe(false);
    expect(
      isSameOpenedFile(
        { dev: 12n, ino: 34n, isFile: () => true },
        { dev: 12n, ino: 34n, isFile: () => false },
      ),
    ).toBe(false);
  });
});
