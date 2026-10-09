import type { SQLiteDatabase } from "expo-sqlite";
import { matches, plain } from "../domain/search.ts";
import type { Customer, OrderState, OutboxOrder, OrderPayload, Product, Snapshot, UploadResult, VisitRecord } from "./types.ts";

// ---------- Snapshot (bajada) ----------

/** Applies the server's snapshot in one transaction: everything (first sync of the day) or
 * only what changed, dropping what is gone and refreshing balances and stock. */
export async function saveSnapshot(db: SQLiteDatabase, snap: Snapshot): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    if (snap.full) {
      await tx.execAsync("DELETE FROM customers; DELETE FROM products; DELETE FROM prices;");
    }
    await tx.execAsync("DELETE FROM routes;");
    const route = await tx.prepareAsync("INSERT INTO routes (id, code, name, visit_days) VALUES (?, ?, ?, ?)");
    try {
      for (const r of snap.routes) await route.executeAsync([r.id, r.code, r.name, JSON.stringify(r.visit_days)]);
    } finally {
      await route.finalizeAsync();
    }
    const customer = await tx.prepareAsync(
      `INSERT OR REPLACE INTO customers (id, code, legal_name, trade_name, document_number, address, phone, route_id,
        visit_order, price_list_id, payment_term_id, credit_limit, balance, search)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    try {
      for (const c of snap.customers) {
        const search = plain([c.code, c.legal_name, c.trade_name, c.document_number, c.address].join(" "));
        await customer.executeAsync([
          c.id, c.code, c.legal_name, c.trade_name, c.document_number, c.address, c.phone, c.route_id,
          c.visit_order, c.price_list_id ?? snap.default_price_list_id, c.payment_term_id, c.credit_limit, c.balance, search,
        ]);
      }
    } finally {
      await customer.finalizeAsync();
    }
    const product = await tx.prepareAsync(
      `INSERT OR REPLACE INTO products (id, code, description, short_description, units_per_case, barcodes, category,
        brand, vat_treatment, vat_rate, internal_tax_rate, available, search)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const dropPrices = await tx.prepareAsync("DELETE FROM prices WHERE product_id = ?");
    const price = await tx.prepareAsync("INSERT INTO prices (product_id, price_list_id, price) VALUES (?, ?, ?)");
    try {
      for (const p of snap.products) {
        const search = plain([p.code, p.description, p.short_description, p.brand, p.category, ...p.barcodes].join(" "));
        await product.executeAsync([
          p.id, p.code, p.description, p.short_description, p.units_per_case, JSON.stringify(p.barcodes),
          p.category, p.brand, p.vat_treatment, p.vat_rate, p.internal_tax_rate, p.available, search,
        ]);
        await dropPrices.executeAsync([p.id]);
        for (const [listId, value] of Object.entries(p.prices)) {
          if (value !== null) await price.executeAsync([p.id, listId, value]);
        }
      }
    } finally {
      await product.finalizeAsync();
      await dropPrices.finalizeAsync();
      await price.finalizeAsync();
    }
    if (!snap.full) {
      // What is no longer the seller's / no longer sold.
      await keepOnly(tx, "customers", "id", snap.customer_ids);
      await keepOnly(tx, "products", "id", snap.product_ids);
      await keepOnly(tx, "prices", "product_id", snap.product_ids);
    }
    const balance = await tx.prepareAsync("UPDATE customers SET balance = ? WHERE id = ?");
    const stock = await tx.prepareAsync("UPDATE products SET available = ? WHERE id = ?");
    try {
      for (const [id, value] of Object.entries(snap.balances)) await balance.executeAsync([value, id]);
      for (const [id, value] of Object.entries(snap.stock)) await stock.executeAsync([value, id]);
    } finally {
      await balance.finalizeAsync();
      await stock.finalizeAsync();
    }
    const meta = await tx.prepareAsync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");
    try {
      const values: Record<string, unknown> = {
        last_sync_at: new Date().toISOString(),
        server_time: snap.server_time,
        seller: snap.seller,
        branch: snap.branch,
        warehouse: snap.warehouse,
        default_price_list_id: snap.default_price_list_id,
        price_lists: snap.price_lists,
        payment_terms: snap.payment_terms,
        reasons: snap.reasons,
      };
      for (const [key, value] of Object.entries(values)) await meta.executeAsync([key, JSON.stringify(value)]);
    } finally {
      await meta.finalizeAsync();
    }
    for (const state of snap.orders) await applyState(tx, state);
  });
}

/** Deletes the rows whose key is not in `ids` (through a temp table: lists can be long). */
async function keepOnly(db: SQLiteDatabase, table: string, column: string, ids: string[]): Promise<void> {
  await db.execAsync("DROP TABLE IF EXISTS temp.keep_ids; CREATE TEMP TABLE keep_ids (id TEXT PRIMARY KEY);");
  const insert = await db.prepareAsync("INSERT OR IGNORE INTO temp.keep_ids (id) VALUES (?)");
  try {
    for (const id of ids) await insert.executeAsync([id]);
  } finally {
    await insert.finalizeAsync();
  }
  await db.execAsync(`DELETE FROM ${table} WHERE ${column} NOT IN (SELECT id FROM temp.keep_ids); DROP TABLE temp.keep_ids;`);
}

/** What the phone tells the server to get only the changes. */
export async function syncCursor(db: SQLiteDatabase): Promise<{ since: string | null; lists: string[] }> {
  const since = await getMeta<string>(db, "server_time");
  const lists = (await getMeta<{ id: string }[]>(db, "price_lists")) ?? [];
  return { since, lists: lists.map((l) => l.id) };
}

export async function getMeta<T>(db: SQLiteDatabase, key: string): Promise<T | null> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = ?", key);
  return row ? (JSON.parse(row.value) as T) : null;
}

// ---------- Clientes y rutas ----------

type CustomerRow = Customer & { search: string };

export async function listCustomers(db: SQLiteDatabase): Promise<Customer[]> {
  return db.getAllAsync<CustomerRow>(
    `SELECT c.*, r.name AS route_name FROM customers c LEFT JOIN routes r ON r.id = c.route_id
     ORDER BY c.legal_name`,
  );
}

export async function getCustomer(db: SQLiteDatabase, id: string): Promise<Customer | null> {
  return db.getFirstAsync<CustomerRow>(
    "SELECT c.*, r.name AS route_name FROM customers c LEFT JOIN routes r ON r.id = c.route_id WHERE c.id = ?",
    id,
  );
}

export async function listRoutes(db: SQLiteDatabase): Promise<{ id: string; name: string; visit_days: number[] }[]> {
  const rows = await db.getAllAsync<{ id: string; name: string; visit_days: string }>("SELECT id, name, visit_days FROM routes");
  return rows.map((r) => ({ ...r, visit_days: JSON.parse(r.visit_days) as number[] }));
}

export const filterCustomers = (customers: Customer[], query: string): Customer[] =>
  query.trim()
    ? customers.filter((c) => matches([c.code, c.legal_name, c.trade_name, c.document_number, c.address].join(" "), query))
    : customers;

// ---------- Artículos ----------

type ProductRow = Omit<Product, "barcodes" | "price"> & { barcodes: string; price: string | null };

const toProduct = (row: ProductRow): Product => ({
  ...row,
  barcodes: JSON.parse(row.barcodes || "[]") as string[],
  price: row.price === null ? null : Number(row.price),
});

/** Articles priced for the customer's list, by words of code/description/brand or barcode. */
export async function searchProducts(db: SQLiteDatabase, priceListId: string | null, query: string, limit = 40): Promise<Product[]> {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const where = words.map(() => "p.search LIKE ?").join(" AND ");
  const rows = await db.getAllAsync<ProductRow>(
    `SELECT p.*, pr.price AS price FROM products p
     JOIN prices pr ON pr.product_id = p.id AND pr.price_list_id = ?
     WHERE ${where} ORDER BY p.description LIMIT ?`,
    [priceListId ?? "", ...words.map((w) => `%${w}%`), limit],
  );
  return rows.map(toProduct);
}

export async function productByBarcode(db: SQLiteDatabase, priceListId: string | null, barcode: string): Promise<Product | null> {
  const rows = await db.getAllAsync<ProductRow>(
    `SELECT p.*, pr.price AS price FROM products p
     JOIN prices pr ON pr.product_id = p.id AND pr.price_list_id = ?
     WHERE p.barcodes LIKE ? OR p.code = ?`,
    [priceListId ?? "", `%"${barcode}"%`, barcode],
  );
  return rows.map(toProduct).find((p) => p.code === barcode || p.barcodes.includes(barcode)) ?? null;
}

// ---------- Pedidos (cola de envío) ----------

type OutboxRow = Omit<OutboxOrder, "payload" | "price_review" | "edited" | "editable" | "sent_payload"> & {
  payload: string;
  price_review: number;
  edited: number;
  editable: number;
  sent_payload: string | null;
};

const toOutbox = (row: OutboxRow): OutboxOrder => ({
  ...row,
  payload: JSON.parse(row.payload) as OrderPayload,
  price_review: Boolean(row.price_review),
  edited: Boolean(row.edited),
  editable: Boolean(row.editable),
  sent_payload: row.sent_payload ? (JSON.parse(row.sent_payload) as OrderPayload) : null,
});

const isToday = (iso: string): boolean => new Date(iso).toDateString() === new Date().toDateString();

/** The seller may change an order the day it was taken while the office has not invoiced
 * it nor put it on a delivery run (the server re-checks when it arrives). */
export const canEdit = (order: OutboxOrder): boolean =>
  isToday(order.created_at) && (order.sent_payload === null || order.editable);

/** Still in the seller's hands: not sent yet, refused, or sent but still modifiable
 * (today's, not invoiced nor on a delivery run). The rest are processed by the office. */
export const isOpen = (order: OutboxOrder): boolean => order.state !== "SENT" || canEdit(order);

export async function getOrder(db: SQLiteDatabase, id: string): Promise<OutboxOrder | null> {
  const row = await db.getFirstAsync<OutboxRow>("SELECT * FROM outbox WHERE id = ?", id);
  return row ? toOutbox(row) : null;
}

/** Saves a change: an order never sent stays a new one; a sent one becomes a modification. */
export async function updateOrder(db: SQLiteDatabase, payload: OrderPayload, total: number): Promise<void> {
  await db.runAsync(
    `UPDATE outbox SET payload = ?, total = ?, state = 'PENDING', error = NULL,
       edited = CASE WHEN sent_payload IS NULL THEN 0 ELSE 1 END
     WHERE id = ?`,
    [JSON.stringify(payload), total, payload.id],
  );
}

/** Back to the order as the server has it (a change it refused, or one no longer wanted). */
export async function discardChanges(db: SQLiteDatabase, id: string): Promise<void> {
  const order = await getOrder(db, id);
  if (!order?.sent_payload) return;
  const total = order.sent_payload.lines.reduce((sum, line) => sum + line.total, 0);
  await db.runAsync(
    "UPDATE outbox SET payload = sent_payload, total = ?, state = 'SENT', edited = 0, error = NULL WHERE id = ?",
    [Math.round(total * 100) / 100, id],
  );
}

export async function addOrder(db: SQLiteDatabase, payload: OrderPayload, customerName: string, total: number): Promise<void> {
  await db.runAsync(
    `INSERT INTO outbox (id, customer_id, customer_name, created_at, payload, total, state)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
    [payload.id, payload.customer_id, customerName, payload.taken_at, JSON.stringify(payload), total],
  );
}

export async function listOrders(db: SQLiteDatabase, customerId?: string): Promise<OutboxOrder[]> {
  const rows = customerId
    ? await db.getAllAsync<OutboxRow>("SELECT * FROM outbox WHERE customer_id = ? ORDER BY created_at DESC", customerId)
    : await db.getAllAsync<OutboxRow>("SELECT * FROM outbox ORDER BY created_at DESC LIMIT 200");
  return rows.map(toOutbox);
}

export async function pendingOrders(db: SQLiteDatabase): Promise<OutboxOrder[]> {
  const rows = await db.getAllAsync<OutboxRow>("SELECT * FROM outbox WHERE state = 'PENDING' ORDER BY created_at");
  return rows.map(toOutbox);
}

/** Orders and visits still on the phone only (or refused by the server). */
export async function countPending(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT (SELECT COUNT(*) FROM outbox WHERE state != 'SENT') + (SELECT COUNT(*) FROM visits WHERE state = 'PENDING') AS n",
  );
  return row?.n ?? 0;
}

export async function applyResult(db: SQLiteDatabase, result: UploadResult): Promise<void> {
  if (result.ok) {
    await db.runAsync(
      `UPDATE outbox SET state = 'SENT', number = ?, server_status = ?, price_review = ?, editable = ?,
       error = NULL, edited = 0, sent_payload = payload, total = COALESCE(?, total), sent_at = ?
       WHERE id = ?`,
      [
        result.number,
        result.status,
        result.price_review ? 1 : 0,
        result.editable ? 1 : 0,
        result.total_amount === null ? null : Number(result.total_amount),
        new Date().toISOString(),
        result.id,
      ],
    );
  } else {
    await db.runAsync("UPDATE outbox SET state = 'ERROR', error = ? WHERE id = ?", [result.error, result.id]);
  }
}

async function applyState(db: SQLiteDatabase, state: OrderState): Promise<void> {
  // A change still waiting to be sent is not overwritten by the office's state.
  await db.runAsync(
    `UPDATE outbox SET number = ?, server_status = ?, price_review = ?, editable = ?,
       state = CASE WHEN edited = 1 THEN state ELSE 'SENT' END,
       error = CASE WHEN edited = 1 THEN error ELSE NULL END,
       sent_payload = COALESCE(sent_payload, payload)
     WHERE id = ?`,
    [state.number, state.status, state.price_review ? 1 : 0, state.editable ? 1 : 0, state.id],
  );
}

/** An order the server refused (e.g. inactive customer) goes back to the queue. */
export async function retryOrder(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync("UPDATE outbox SET state = 'PENDING', error = NULL WHERE id = ? AND state = 'ERROR'", id);
}

/** Only orders the server never received can be discarded. */
export async function deleteOrder(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync("DELETE FROM outbox WHERE id = ? AND sent_payload IS NULL", id);
}

/** Articles of an order, priced for the customer's list (to modify it). */
export async function productsByIds(db: SQLiteDatabase, priceListId: string | null, ids: string[]): Promise<Product[]> {
  if (!ids.length) return [];
  const rows = await db.getAllAsync<ProductRow>(
    `SELECT p.*, pr.price AS price FROM products p
     JOIN prices pr ON pr.product_id = p.id AND pr.price_list_id = ?
     WHERE p.id IN (${ids.map(() => "?").join(", ")})`,
    [priceListId ?? "", ...ids],
  );
  return rows.map(toProduct);
}

// ---------- Visitas sin compra ----------

type VisitRow = Omit<VisitRecord, "location"> & { location: string | null };

const toVisit = (row: VisitRow): VisitRecord => ({
  ...row,
  location: row.location ? (JSON.parse(row.location) as VisitRecord["location"]) : null,
});

export async function addVisit(db: SQLiteDatabase, visit: Omit<VisitRecord, "state" | "error">): Promise<void> {
  await db.runAsync(
    `INSERT INTO visits (id, customer_id, customer_name, visited_at, reason, notes, location, state)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    [visit.id, visit.customer_id, visit.customer_name, visit.visited_at, visit.reason, visit.notes, visit.location ? JSON.stringify(visit.location) : null],
  );
}

export async function pendingVisits(db: SQLiteDatabase): Promise<VisitRecord[]> {
  const rows = await db.getAllAsync<VisitRow>("SELECT * FROM visits WHERE state = 'PENDING' ORDER BY visited_at");
  return rows.map(toVisit);
}

export async function applyVisitResult(db: SQLiteDatabase, id: string, ok: boolean, error: string | null): Promise<void> {
  await db.runAsync("UPDATE visits SET state = ?, error = ? WHERE id = ?", [ok ? "SENT" : "ERROR", error, id]);
}

/** Customers with a "no compró" today (for the day's route). */
export async function noSaleToday(db: SQLiteDatabase): Promise<Map<string, string>> {
  const rows = await db.getAllAsync<{ customer_id: string; reason: string; visited_at: string }>(
    "SELECT customer_id, reason, visited_at FROM visits ORDER BY visited_at",
  );
  const today = new Date().toDateString();
  return new Map(rows.filter((r) => new Date(r.visited_at).toDateString() === today).map((r) => [r.customer_id, r.reason]));
}
