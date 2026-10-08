import type { SQLiteDatabase } from "expo-sqlite";
import { request } from "./api.ts";
import type { Session } from "./session.tsx";
import { applyResult, pendingOrders, saveSnapshot } from "./store.ts";
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
        orders: batch.map(({ payload }) => ({
          id: payload.id,
          customer_id: payload.customer_id,
          taken_at: payload.taken_at,
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

/** Full sync: first the orders (so the snapshot already shows them), then the catalog. */
export async function syncAll(db: SQLiteDatabase, session: Session): Promise<{ sent: number; failed: number }> {
  const upload = await uploadOrders(db, session);
  const snapshot = await request<Snapshot>(session.server, "/mobile/sync", { token: session.token });
  await saveSnapshot(db, snapshot);
  return upload;
}
