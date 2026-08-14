import type {
  PublicationDependency,
  PublicationManifest,
} from "@earth-stories/story-schema";

export interface PublicationRuntimePolicy {
  offline: boolean;
  runtimeAssets: PublicationManifest["runtimeAssets"];
  projectionDefinitions: PublicationManifest["projectionDefinitions"];
  dependencies: PublicationManifest["dependencies"];
}

export interface ChapterDependencyLocators {
  terrain?: string;
  buildings?: string;
}

export function publicationRuntimePolicy(
  manifest: Pick<
    PublicationManifest,
    | "publication"
    | "connectivity"
    | "runtimeAssets"
    | "projectionDefinitions"
    | "dependencies"
  >,
): PublicationRuntimePolicy {
  return {
    offline:
      manifest.publication.profile === "offline" ||
      manifest.connectivity.requested === "offline",
    runtimeAssets: manifest.runtimeAssets,
    projectionDefinitions: manifest.projectionDefinitions,
    dependencies: manifest.dependencies,
  };
}

export function chapterDependencyLocators(
  chapterId: string,
  dependencies: PublicationDependency[],
): ChapterDependencyLocators {
  const connected = dependencies.filter(
    (dependency) =>
      dependency.delivery === "connected" &&
      dependency.owner.type === "chapter" &&
      dependency.owner.id === chapterId,
  );
  const locator = (kind: "terrain" | "buildings") =>
    connected.find(
      (dependency) => dependency.id === `chapter:${chapterId}:${kind}`,
    )?.locator;
  return {
    ...(locator("terrain") ? { terrain: locator("terrain") } : {}),
    ...(locator("buildings") ? { buildings: locator("buildings") } : {}),
  };
}
