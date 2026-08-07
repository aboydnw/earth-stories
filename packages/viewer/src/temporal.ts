export const clampTemporalPosition = (value: number) =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export function timestepIndex(position: number, count: number) {
  if (count <= 1) return 0;
  return Math.round(clampTemporalPosition(position) * (count - 1));
}

export function timestepPosition(index: number, count: number) {
  if (count <= 1) return 0;
  return clampTemporalPosition(index / (count - 1));
}

export function timestampAtPosition(
  position: number,
  minimum: number,
  maximum: number,
) {
  return minimum + clampTemporalPosition(position) * (maximum - minimum);
}

export function formatTemporalTimestamp(value: number) {
  if (!Number.isFinite(value)) return "";
  const milliseconds = Math.abs(value) < 100_000_000_000 ? value * 1000 : value;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toISOString().replace(".000Z", "Z");
}
