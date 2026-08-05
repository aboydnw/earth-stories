export interface ByteRange {
  start: number;
  end: number;
}

export function parseByteRange(
  header: string | undefined,
  size: number,
): ByteRange | null {
  if (!header) return null;
  if (!Number.isSafeInteger(size) || size <= 0)
    throw new RangeError("File has no satisfiable byte range");
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2]))
    throw new RangeError("Only one byte range is supported");
  if (!match[1]) {
    const length = Number(match[2]);
    if (!Number.isSafeInteger(length) || length <= 0)
      throw new RangeError("Invalid suffix byte range");
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  )
    throw new RangeError("Unsatisfiable byte range");
  return { start, end: Math.min(requestedEnd, size - 1) };
}
