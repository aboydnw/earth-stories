import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const runtimeRoot = resolve("apps/viewer/public/runtime/duckdb");

const expected = {
  "duckdb-browser-eh.worker.js": {
    bytes: 772_759,
    sha256: "f8ab72b6b90b3ad83077d47426d4a99d5d9a4c7e07cba1a2be37d655adc7c1ab",
  },
  "duckdb-eh.wasm": {
    bytes: 34_242_586,
    sha256: "4c221bfa59c11f24dbd750e70c90b9252eca6eec5633936e6a2ec766e55fd879",
  },
  "duckdb-browser-mvp.worker.js": {
    bytes: 844_644,
    sha256: "b0387027f174e2b60c2d5cfa31cecca9b89d8a9762346b6449a784cd1c4dde3c",
  },
  "duckdb-mvp.wasm": {
    bytes: 39_362_651,
    sha256: "45d72a81fba8e57693d890da837c7041310e385e75619a8559839b15388dfe97",
  },
  "extensions/v1.4.3/wasm_eh/spatial.duckdb_extension.wasm": {
    bytes: 23_469_719,
    sha256: "04b776946da64a15a7b14501790c75093e38f876acc46b2922f0daeb6aaa1d60",
  },
  "extensions/v1.4.3/wasm_mvp/spatial.duckdb_extension.wasm": {
    bytes: 23_338_062,
    sha256: "7a745cfc5259f69b46f077bc6afeb7a6aefb8ef8d8b336bb0b770e5449708bb4",
  },
} as const;

describe("vendored offline DuckDB runtime", () => {
  it("contains the exact compatible browser and signed spatial artifacts", async () => {
    for (const [relativePath, evidence] of Object.entries(expected)) {
      const path = resolve(runtimeRoot, relativePath);
      expect((await stat(path)).size, relativePath).toBe(evidence.bytes);
      expect(
        createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
        relativePath,
      ).toBe(evidence.sha256);
    }
  });
});
