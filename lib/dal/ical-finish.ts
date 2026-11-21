export type SnapshotEvent = { uid: string; start: string; end: string; code?: string; last4?: string };

/**
 * Expand/contract (SD-1129): events may carry Airbnb's reservation code and phone last-4. A database that does not have that
 * migration yet answers 22023 "invalid event" for the extra keys, and rolls the whole call back: the lease is intact, so the
 * same snapshot is sent once more with only uid/start/end and the sync never stops because of a pending migration.
 */
export async function finishWithFallback<T extends { error: { code?: string } | null }>(
  finish: (events: SnapshotEvent[]) => PromiseLike<T>,
  events: SnapshotEvent[],
): Promise<T> {
  const result = await finish(events);
  if (result.error?.code === "22023" && events.some((e) => e.code || e.last4)) {
    return finish(events.map(({ uid, start, end }) => ({ uid, start, end })));
  }
  return result;
}
