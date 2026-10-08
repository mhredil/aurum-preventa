/** What GET /mobile/sync returns (facturacion-service, app/modules/mobile/service.py). */

export interface Snapshot {
  server_time: string;
  seller: { id: string; code: string; name: string };
  branch: { id: string; name: string };
  warehouse: { id: string; name: string } | null;
  default_price_list_id: string | null;
  price_lists: { id: string; name: string }[];
  payment_terms: { id: string; name: string; kind: string; days: number }[];
  routes: { id: string; code: string; name: string; visit_days: number[] }[];
  customers: SnapshotCustomer[];
  products: SnapshotProduct[];
  reasons: string[];
  orders: OrderState[];
  can_change_price: boolean;
}

export interface SnapshotCustomer {
  id: string;
  code: string;
  legal_name: string;
  trade_name: string | null;
  document_number: string | null;
  address: string | null;
  phone: string | null;
  route_id: string | null;
  visit_order: number | null;
  price_list_id: string | null;
  payment_term_id: string;
  credit_limit: string;
  balance: string;
}

export interface SnapshotProduct {
  id: string;
  code: string;
  description: string;
  short_description: string | null;
  units_per_case: string;
  barcodes: string[];
  category: string | null;
  brand: string | null;
  vat_treatment: string;
  vat_rate: string;
  internal_tax_rate: string;
  available: string;
  prices: Record<string, string | null>;
}

/** State of an order already sent, as the server sees it. */
export interface OrderState {
  id: string;
  order_id: string;
  number: string;
  status: string;
  price_review: boolean;
  total_amount: string;
}

export interface UploadResult {
  id: string;
  ok: boolean;
  order_id: string | null;
  number: string | null;
  status: string | null;
  price_review: boolean;
  total_amount: string | null;
  error: string | null;
}

export interface Customer extends Omit<SnapshotCustomer, "visit_order"> {
  visit_order: number | null;
  route_name: string | null;
}

export interface Product extends Omit<SnapshotProduct, "prices" | "barcodes"> {
  barcodes: string[];
  price: number | null; // for the customer's price list
}

/** Order kept on the phone until the server confirms it. */
export interface OutboxOrder {
  id: string;
  customer_id: string;
  customer_name: string;
  created_at: string;
  payload: OrderPayload;
  total: number;
  state: "PENDING" | "SENT" | "ERROR";
  number: string | null;
  server_status: string | null;
  price_review: boolean;
  error: string | null;
  sent_at: string | null;
}

export interface OrderPayload {
  id: string;
  customer_id: string;
  taken_at: string;
  notes: string | null;
  lines: {
    product_id: string;
    code: string;
    description: string;
    cases: string;
    units: string;
    unit_price: string;
    bonus_percent: string;
    total: number;
  }[];
}

export const ORDER_STATUS: Record<string, string> = {
  PENDING_APPROVAL: "Pendiente de autorización",
  CONFIRMED: "Confirmado",
  INVOICED: "Facturado",
  REJECTED: "Rechazado",
  CANCELLED: "Cancelado",
};
