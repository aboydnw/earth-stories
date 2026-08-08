import { useCallback, useEffect, useRef, useState } from "react";
import type { StoryProject } from "@earth-stories/story-schema";
import { getPublicationPreflight, type PublicationPreflight } from "./api";

export type PublicationReadinessState = {
  status: "idle" | "loading" | "ready" | "error" | "stale";
  result: PublicationPreflight | null;
  error: string | null;
  key: string | null;
};

export function publicationReadinessKey(project: StoryProject): string {
  return `${project.id}:${project.metadata.updated}:${project.publication.profile}`;
}

export function usePublicationReadiness(project: StoryProject | null) {
  const [state, setState] = useState<PublicationReadinessState>({
    status: "idle",
    result: null,
    error: null,
    key: null,
  });
  const cache = useRef(new Map<string, PublicationPreflight>());
  const request = useRef(0);
  const projectKey = project ? publicationReadinessKey(project) : null;

  useEffect(() => {
    request.current += 1;
    if (!projectKey) {
      setState({ status: "idle", result: null, error: null, key: null });
      return;
    }
    const cached = cache.current.get(projectKey);
    setState((current) =>
      cached
        ? { status: "ready", result: cached, error: null, key: projectKey }
        : current.result?.projectId === project?.id
          ? { ...current, status: "stale", error: null, key: projectKey }
          : { status: "idle", result: null, error: null, key: projectKey },
    );
  }, [project?.id, projectKey]);

  const load = useCallback(
    async (force = false): Promise<PublicationPreflight | null> => {
      if (!project || !projectKey) return null;
      const cached = cache.current.get(projectKey);
      if (cached && !force) {
        setState({
          status: "ready",
          result: cached,
          error: null,
          key: projectKey,
        });
        return cached;
      }
      const token = ++request.current;
      setState((current) => ({
        status: "loading",
        result:
          current.result?.projectId === project.id ? current.result : null,
        error: null,
        key: projectKey,
      }));
      try {
        const result = await getPublicationPreflight(project.id);
        if (request.current !== token) return null;
        cache.current.set(projectKey, result);
        setState({ status: "ready", result, error: null, key: projectKey });
        return result;
      } catch (cause) {
        if (request.current !== token) return null;
        setState((current) => ({
          status: "error",
          result:
            current.result?.projectId === project.id ? current.result : null,
          error:
            cause instanceof Error
              ? cause.message
              : "Publication checks failed.",
          key: projectKey,
        }));
        return null;
      }
    },
    [project, projectKey],
  );

  const invalidate = useCallback(() => {
    request.current += 1;
    if (projectKey) cache.current.delete(projectKey);
    setState((current) => ({
      ...current,
      status: current.result ? "stale" : "idle",
      error: null,
      key: projectKey,
    }));
  }, [projectKey]);

  return { state, load, invalidate };
}
