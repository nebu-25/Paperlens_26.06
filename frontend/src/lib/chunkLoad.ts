const CHUNK_LOAD_PATTERNS = [
  /chunkloaderror/i,
  /loading chunk \d+ failed/i,
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /dynamically imported module/i,
];

function messageFromUnknown(value: unknown): string {
  if (value instanceof Error) return `${value.name} ${value.message}`;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return [record.name, record.message, record.reason, record.type]
      .filter((part): part is string => typeof part === 'string')
      .join(' ');
  }
  return '';
}

export function isChunkLoadError(value: unknown): boolean {
  const message = messageFromUnknown(value);
  return CHUNK_LOAD_PATTERNS.some((pattern) => pattern.test(message));
}

export function installChunkLoadReloadPrompt() {
  if (typeof window === 'undefined') return;
  const guardedWindow = window as typeof window & {
    __paperlensChunkLoadPromptInstalled?: boolean;
  };
  if (guardedWindow.__paperlensChunkLoadPromptInstalled) return;
  guardedWindow.__paperlensChunkLoadPromptInstalled = true;

  window.addEventListener('unhandledrejection', (event) => {
    if (!isChunkLoadError(event.reason)) return;
    window.dispatchEvent(new CustomEvent('paperlens:chunk-load-error'));
  });
}
