import type { ProjectSource } from "@earth-stories/story-schema";

type Presentation = NonNullable<ProjectSource["presentation"]>;

interface WorkerCategory {
  value: number;
  color: string;
  label: string;
}

function isWorkerCategory(item: unknown): item is WorkerCategory {
  const candidate = item as WorkerCategory | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.value === "number" &&
    Number.isFinite(candidate.value) &&
    typeof candidate.color === "string" &&
    /^#[0-9a-f]{6}$/i.test(candidate.color)
  );
}

/**
 * Translate a worker prepare result into presentation fields for a
 * categorical raster. Category colours are only applied by the COG shader
 * when a rescale is present, so the rescale is pinned to the class values.
 */
export function categoricalPresentation(
  output: Record<string, unknown>,
): Pick<Presentation, "categoryColors" | "rescale" | "legendTitle"> | null {
  const raw = output.categories;
  if (!Array.isArray(raw)) return null;
  const categories = raw.filter(isWorkerCategory);
  if (!categories.length) return null;
  const values = categories.map((item) => item.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return {
    categoryColors: Object.fromEntries(
      categories.map((item) => [String(item.value), item.color.toLowerCase()]),
    ),
    rescale: [minimum, maximum === minimum ? minimum + 1 : maximum],
    legendTitle: "",
  };
}
