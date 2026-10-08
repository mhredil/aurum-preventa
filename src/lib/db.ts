import type { SQLiteDatabase } from "expo-sqlite";

export const DATABASE_NAME = "preventa.db";

/** Local schema. Catalog tables are replaced on each sync; `outbox` keeps the orders until
 * the server confirms them (never lost by a sync or by unlinking the phone). */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  let version = row?.user_version ?? 0;
  if (version < 1) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);
      CREATE TABLE IF NOT EXISTS routes (
        id TEXT PRIMARY KEY NOT NULL, code TEXT, name TEXT, visit_days TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY NOT NULL, code TEXT, legal_name TEXT NOT NULL, trade_name TEXT,
        document_number TEXT, address TEXT, phone TEXT, route_id TEXT, visit_order INTEGER,
        price_list_id TEXT, payment_term_id TEXT, credit_limit TEXT, balance TEXT, search TEXT
      );
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY NOT NULL, code TEXT NOT NULL, description TEXT NOT NULL,
        short_description TEXT, units_per_case TEXT, barcodes TEXT, category TEXT, brand TEXT,
        vat_treatment TEXT, vat_rate TEXT, internal_tax_rate TEXT, available TEXT, search TEXT
      );
      CREATE TABLE IF NOT EXISTS prices (
        product_id TEXT NOT NULL, price_list_id TEXT NOT NULL, price TEXT NOT NULL,
        PRIMARY KEY (product_id, price_list_id)
      );
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY NOT NULL, customer_id TEXT NOT NULL, customer_name TEXT,
        created_at TEXT NOT NULL, payload TEXT NOT NULL, total REAL NOT NULL,
        state TEXT NOT NULL, number TEXT, server_status TEXT, price_review INTEGER DEFAULT 0,
        error TEXT, sent_at TEXT
      );
      CREATE INDEX IF NOT EXISTS ix_outbox_state ON outbox (state);
    `);
    version = 1;
  }
  if (version < 2) {
    // Orders can be modified the same day: track changes to sent orders.
    await db.execAsync(`
      ALTER TABLE outbox ADD COLUMN edited INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE outbox ADD COLUMN editable INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE outbox ADD COLUMN sent_payload TEXT;
    `);
    version = 2;
  }
  if (version < 3) {
    // Visits without sale ("no compró") waiting to be sent.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS visits (
        id TEXT PRIMARY KEY NOT NULL, customer_id TEXT NOT NULL, customer_name TEXT,
        visited_at TEXT NOT NULL, reason TEXT NOT NULL, notes TEXT, location TEXT,
        state TEXT NOT NULL, error TEXT
      );
      CREATE INDEX IF NOT EXISTS ix_visits_state ON visits (state);
    `);
    version = 3;
  }
  await db.execAsync(`PRAGMA user_version = ${version}`);
}
