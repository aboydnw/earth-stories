import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv.js";

describe("parseCsv", () => {
  it("keeps commas inside quoted fields in one cell", () => {
    expect(parseCsv('city,count\n"New York, NY",5')).toEqual([
      ["city", "count"],
      ["New York, NY", "5"],
    ]);
  });

  it("unescapes doubled quotes and keeps quoted line breaks", () => {
    expect(parseCsv('label\n"She said ""go"""')).toEqual([
      ["label"],
      ['She said "go"'],
    ]);
    expect(parseCsv('label,note\n"a","one\ntwo"')).toEqual([
      ["label", "note"],
      ["a", "one\ntwo"],
    ]);
  });

  it("reads both line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
