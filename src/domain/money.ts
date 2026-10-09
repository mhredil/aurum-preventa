/** Amounts shown on the phone. They are an estimate: the server recalculates every order
 * with its current prices (and flags it for review when they differ). */

export interface PricedProduct {
  units_per_case: string;
  vat_treatment: string; // GRAVADO | EXENTO | NO_GRAVADO
  vat_rate: string;
  internal_tax_rate: string;
  /** Fixed amount per base unit, besides (or instead of) the rate. */
  internal_tax_amount?: string | null;
}

export interface LineInput {
  cases: number;
  units: number;
  /** Net price per base unit (without VAT), as synced for the customer's price list. */
  unitPrice: number;
  bonusPercent: number;
}

export interface LineAmounts {
  quantity: number;
  net: number;
  vat: number;
  internalTax: number;
  total: number;
}

export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export function parseAmount(text: string | null | undefined): number {
  if (!text) return 0;
  const clean = text.trim().replace(/\s/g, "");
  // "1.234,56" (es-AR) or "1234.56" (API)
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

export function quantity(product: PricedProduct, cases: number, units: number): number {
  return cases * Number(product.units_per_case) + units;
}

export function lineAmounts(product: PricedProduct, line: LineInput): LineAmounts {
  const qty = quantity(product, line.cases, line.units);
  const net = round2(qty * line.unitPrice * (1 - line.bonusPercent / 100));
  const vat = product.vat_treatment === "GRAVADO" ? round2((net * Number(product.vat_rate)) / 100) : 0;
  const internalTax = round2(
    (net * Number(product.internal_tax_rate)) / 100 + qty * Number(product.internal_tax_amount ?? 0),
  );
  return { quantity: qty, net, vat, internalTax, total: round2(net + vat + internalTax) };
}

export function orderTotals(lines: LineAmounts[]): { net: number; vat: number; total: number } {
  return lines.reduce(
    (sum, line) => ({
      net: round2(sum.net + line.net),
      vat: round2(sum.vat + line.vat + line.internalTax),
      total: round2(sum.total + line.total),
    }),
    { net: 0, vat: 0, total: 0 },
  );
}

const MONEY = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const NUMBER = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

export const formatMoney = (value: number | string): string => MONEY.format(Number(value));
export const formatQuantity = (value: number | string): string => NUMBER.format(Number(value));
