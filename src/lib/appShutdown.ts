/**
 * Exactly one place where the app can ask "is it safe to close now?".
 *
 * The Windows installer can only replace files once KALAI DIGITAL has really
 * exited, so before an update is started the app waits for its own queued local
 * writes to settle. Nothing here deletes data: the Firestore offline queue lives
 * in IndexedDB and is replayed on the next launch, even if the wait times out.
 */

export interface ShutdownFlushResult {
  /** Writes still queued when the wait ended (0 means everything settled). */
  pending: number;
  /** True when the wait hit its deadline; the queue is kept, not dropped. */
  timedOut: boolean;
}

type FlushHandler = () => Promise<ShutdownFlushResult>;

let handler: FlushHandler | null = null;

/** Called by the app shell whenever the active data service changes. */
export function registerShutdownFlush(next: FlushHandler): void {
  handler = next;
}

export function clearShutdownFlush(next?: FlushHandler): void {
  if (!next || handler === next) handler = null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits for queued writes without ever blocking the update forever: the
 * handler gets `timeoutMs`, and the whole call is capped at `timeoutMs + 1500`.
 */
export async function flushBeforeExit(timeoutMs = 4000): Promise<ShutdownFlushResult> {
  if (!handler) return { pending: 0, timedOut: false };

  let timer: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<ShutdownFlushResult>((resolve) => {
    timer = setTimeout(() => resolve({ pending: -1, timedOut: true }), timeoutMs + 1500);
  });

  try {
    const result = await Promise.race([handler(), deadline]);
    return { pending: Math.max(0, result.pending), timedOut: result.timedOut };
  } catch {
    return { pending: -1, timedOut: true };
  } finally {
    if (timer) clearTimeout(timer);
    // Let the microtask queue drain so a just-scheduled local write is not lost.
    await sleep(0);
  }
}
