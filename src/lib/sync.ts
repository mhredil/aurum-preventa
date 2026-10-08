import type { SQLiteDatabase } from "expo-sqlite";
import { request } from "./api.ts";
import type { Session } from "./session.tsx";
import { applyResult, applyVisitResult, pendingOrders, pendingVisits, saveSnapshot, syncCursor } from "./store.ts";
import type { Snapshot, UploadResult } from "./types.ts";

const BATCH = 50;

/** Sends the queued orders. Network failures leave them queued; refused ones (inactive
 * customer, removed article...) are marked with the server's message. */
export async function uploadOrders(db: SQLiteDatabase, session: Session): Promise<{ sent: number; failed: number }> {
  const pending = await pendingOrders(db);
  let sent = 0;
  let failed = 0;
  for (let start = 0; start < pending.length; start += BATCH) {
    const batch = pending.slice(start, start + BATCH);
    const results = await request<UploadResult[]>(session.server, "/mobile/orders", {
      method: "POST",
      token: session.token,
      body: {
        orders: batch.map(({ payload, edited }) => ({
          id: payload.id,
          customer_id: payload.customer_id,
          taken_at: payload.taken_at,
          // A change to an order the server already has.
          modified_at: edited ? new Date().toISOString() : null,
          location: payload.location ?? null,
          notes: payload.notes,
          lines: payload.lines.map((l) => ({
            product_id: l.product_id,
            cases: l.cases,
            units: l.units,
            unit_price: l.unit_price,
            bonus_percent: l.bonus_percent,
          })),
        })),
      },
    });
    for (const result of results) {
      await applyResult(db, result);
      if (result.ok) sent += 1;
      else failed += 1;
    }
  }
  return { sent, failed };
}

/** Sends the "no compró" visits; re-sending never duplicates them. */
export async function uploadVisits(db: SQLiteDatabase, session: Session): Promise<number> {
  const visits = await pendingVisits(db);
  for (let start = 0; start < visits.length; start += BATCH * 2) {
    const batch = visits.slice(start, start + BATCH * 2);
    const results = await request<{ id: string; ok: boolean; error: string | null }[]>(session.server, "/mobile/visits", {
      method: "POST",
      token: session.token,
      body: {
        visits: batch.map((v) => ({
          id: v.id,
          customer_id: v.customer_id,
          visited_at: v.visited_at,
          reason: v.reason,
          notes: v.notes,
          location: v.location,
        })),
      },
    });
    for (const result of results) await applyVisitResult(db, result.id, result.ok, result.error);
  }
  return visits.length;
}

/** Sends what is queued (orders and visits). */
export async function uploadAll(db: SQLiteDatabase, session: Session): Promise<{ sent: number; failed: number }> {
  const orders = await uploadOrders(db, session);
  await uploadVisits(db, session);
  return orders;
}

/** Full sync: first what is queued (so the snapshot already shows it), then the catalog.
 * The catalog travels complete the first time of the day and only the changes afterwards. */
export async function syncAll(db: SQLiteDatabase, session: Session): Promise<{ sent: number; failed: number }> {
  const upload = await uploadAll(db, session);
  const { since, lists } = await syncCursor(db);
  const query = since ? `?since=${encodeURIComponent(since)}&lists=${encodeURIComponent(lists.join(","))}` : "";
  const snapshot = await request<Snapshot>(session.server, `/mobile/sync${query}`, { token: session.token });
  await saveSnapshot(db, snapshot);
  return upload;
}
