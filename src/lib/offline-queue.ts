/**
 * Offline scan queue.
 *
 * When the device loses connectivity mid-session, scans are stored locally and
 * replayed (in order, with their original timestamps) as soon as the network
 * comes back — so attendance is never lost in a basement lecture hall.
 */
export type QueuedScan = {
  id: string;
  sessionId: string;
  code: string;
  at: string; // ISO timestamp of the original scan
};

const KEY = "qroll.offline.scans.v1";

function read(): QueuedScan[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedScan[]) : [];
  } catch {
    return [];
  }
}

function write(items: QueuedScan[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full / private mode — nothing we can do */
  }
}

export function listQueued(sessionId?: string): QueuedScan[] {
  const all = read();
  return sessionId ? all.filter((s) => s.sessionId === sessionId) : all;
}

export function queueScan(
  sessionId: string,
  code: string,
  at = new Date().toISOString(),
): QueuedScan {
  const item: QueuedScan = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    code,
    at,
  };
  const all = read();
  // Ignore an identical code queued for the same session within 30s
  const dup = all.find(
    (s) =>
      s.sessionId === sessionId &&
      s.code === code &&
      Math.abs(Date.parse(s.at) - Date.parse(at)) < 30_000,
  );
  if (dup) return dup;
  all.push(item);
  write(all);
  return item;
}

export function removeQueued(id: string) {
  write(read().filter((s) => s.id !== id));
}

export function clearQueue(sessionId?: string) {
  write(sessionId ? read().filter((s) => s.sessionId !== sessionId) : []);
}

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}
