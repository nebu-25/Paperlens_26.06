const DEMO_SESSION_STORAGE_KEY = 'paperlens:demo-session:v1';
const DEMO_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

type StoredDemoSession = {
  id: string;
  createdAt: number;
};

function notifyDemoSessionChanged(): void {
  window.dispatchEvent(new Event('paperlens-demo-session-change'));
}

function randomSessionId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto?.randomUUID) {
    return webCrypto.randomUUID().replace(/-/g, '');
  }
  const bytes = new Uint8Array(24);
  webCrypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createDemoSessionId(): string {
  const id = randomSessionId();
  const entry: StoredDemoSession = { id, createdAt: Date.now() };
  window.sessionStorage.setItem(DEMO_SESSION_STORAGE_KEY, JSON.stringify(entry));
  notifyDemoSessionChanged();
  return id;
}

export function readDemoSessionId(): string | null {
  try {
    const raw = window.sessionStorage.getItem(DEMO_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Partial<StoredDemoSession>;
    if (!entry.id || !entry.createdAt || Date.now() - entry.createdAt > DEMO_SESSION_TTL_MS) {
      clearDemoSessionId();
      return null;
    }
    return entry.id;
  } catch {
    clearDemoSessionId();
    return null;
  }
}

export function clearDemoSessionId(): void {
  try {
    window.sessionStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
    notifyDemoSessionChanged();
  } catch {
    /* ignore */
  }
}
