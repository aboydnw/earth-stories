export interface PreviewDependencies {
  reserveTab(): { navigate(url: string): void; close(): void } | null;
  saveDraft(): Promise<{ id: string; revision: string }>;
  previewUrl(id: string): string;
  showError(error: unknown): void;
  showFallbackLink(url: string): void;
}

/** Reserve during the click gesture, then open only a successfully saved draft. */
export async function openReaderPreview(d: PreviewDependencies): Promise<void> {
  let tab: ReturnType<PreviewDependencies["reserveTab"]> = null;
  try {
    tab = d.reserveTab();
    const saved = await d.saveDraft();
    const url = d.previewUrl(saved.id);
    if (tab) tab.navigate(url);
    else d.showFallbackLink(url);
  } catch (error) {
    tab?.close();
    d.showError(error);
  }
}
