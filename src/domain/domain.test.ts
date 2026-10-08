import { test } from "node:test";
import assert from "node:assert/strict";
import { lineAmounts, orderTotals, parseAmount } from "./money.ts";
import { normalizeCode, normalizeServer, parsePairingQr } from "./pairing.ts";
import { customersForDay, isoWeekday } from "./route.ts";
import { matches } from "./search.ts";

const product = { units_per_case: "6", vat_treatment: "GRAVADO", vat_rate: "21", internal_tax_rate: "0" };

test("line amounts with cases, units, bonus and VAT", () => {
  const line = lineAmounts(product, { cases: 1, units: 2, unitPrice: 1000, bonusPercent: 10 });
  assert.equal(line.quantity, 8);
  assert.equal(line.net, 7200);
  assert.equal(line.vat, 1512);
  assert.equal(line.total, 8712);
  const exempt = lineAmounts({ ...product, vat_treatment: "EXENTO", vat_rate: "0" }, { cases: 0, units: 1, unitPrice: 99.995, bonusPercent: 0 });
  assert.equal(exempt.total, 100);
  assert.deepEqual(orderTotals([line, exempt]), { net: 7300, vat: 1512, total: 8812 });
});

test("amounts typed in es-AR or API format", () => {
  assert.equal(parseAmount("1.234,56"), 1234.56);
  assert.equal(parseAmount("1234.5600"), 1234.56);
  assert.equal(parseAmount(""), 0);
});

test("pairing QR and manual server", () => {
  const qr = JSON.stringify({ aurum: 1, server: "https://dist.com.ar/api/v1", code: "dr42h-ug8gx" });
  assert.deepEqual(parsePairingQr(qr), { server: "https://dist.com.ar/api/v1", code: "DR42HUG8GX" });
  assert.equal(parsePairingQr("https://otra-cosa.com"), null);
  assert.equal(normalizeServer("dist.com.ar/"), "https://dist.com.ar/api/v1");
  assert.equal(normalizeServer("http://192.168.0.10:8080"), "http://192.168.0.10:8080/api/v1");
  assert.equal(normalizeCode(" ab12c-de34f "), "AB12CDE34F");
});

test("customers of today's routes in visit order", () => {
  const wednesday = new Date(2026, 9, 7); // 7/10/2026
  assert.equal(isoWeekday(wednesday), 3);
  const routes = [{ id: "r1", visit_days: [1, 3] }, { id: "r2", visit_days: [2] }];
  const customers = [
    { id: "a", route_id: "r1", visit_order: 2, legal_name: "B" },
    { id: "b", route_id: "r1", visit_order: 1, legal_name: "C" },
    { id: "c", route_id: "r2", visit_order: 1, legal_name: "A" },
    { id: "d", route_id: null, visit_order: null, legal_name: "D" },
  ];
  assert.deepEqual(customersForDay(customers, routes, wednesday).map((c) => c.id), ["b", "a"]);
});

test("search ignores accents, case and word order", () => {
  assert.ok(matches("CAFÉ LA VIRGINIA 500 G", "virginia cafe"));
  assert.ok(!matches("YERBA MATE", "cafe"));
});
