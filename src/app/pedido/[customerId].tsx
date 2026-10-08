import { randomUUID } from "expo-crypto";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/components/Button";
import { formatMoney, formatQuantity, lineAmounts, orderTotals, parseAmount } from "@/domain/money";
import { currentLocation } from "@/lib/location";
import { takeScan } from "@/lib/scan";
import { addOrder, canEdit, getCustomer, getOrder, productByBarcode, productsByIds, searchProducts, updateOrder } from "@/lib/store";
import { useSync } from "@/lib/SyncProvider";
import { colors, ui } from "@/lib/theme";
import type { Customer, Location, OrderPayload, OutboxOrder, Product } from "@/lib/types";

interface Line {
  product: Product;
  cases: string;
  units: string;
  bonus: string;
}

const amounts = (line: Line) =>
  lineAmounts(line.product, {
    cases: parseAmount(line.cases),
    units: parseAmount(line.units),
    unitPrice: line.product.price ?? 0,
    bonusPercent: parseAmount(line.bonus),
  });

/** Order entry: search (or scan) articles, quantities in cases and units, optional bonus.
 * Prices are the customer's list as synced; the order is saved on the phone and sent when
 * there is signal. With `orderId` it modifies an order of the day. */
export default function NewOrder() {
  const { customerId, orderId } = useLocalSearchParams<{ customerId: string; orderId?: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const { refresh, sync } = useSync();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [editing, setEditing] = useState<Line | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState<OutboxOrder | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [location, setLocation] = useState<Location | null>(null);

  // Where the order is taken, asked when the screen opens so saving never waits for the GPS.
  useEffect(() => {
    void currentLocation().then(setLocation);
  }, []);

  useEffect(() => {
    void getCustomer(db, customerId).then(setCustomer);
  }, [db, customerId]);

  // Modifying: the order's lines with the articles as they are on the phone now.
  useEffect(() => {
    if (!orderId || !customer) return;
    void (async () => {
      const order = await getOrder(db, orderId);
      if (!order) return;
      setOriginal(order);
      setNotes(order.payload.notes ?? "");
      const products = await productsByIds(db, customer.price_list_id, order.payload.lines.map((l) => l.product_id));
      const byId = new Map(products.map((p) => [p.id, p]));
      setLines(
        order.payload.lines.flatMap((l) => {
          const product = byId.get(l.product_id);
          return product ? [{ product, cases: l.cases === "0" ? "" : l.cases, units: l.units === "0" ? "" : l.units, bonus: l.bonus_percent === "0" ? "" : l.bonus_percent }] : [];
        }),
      );
      setMissing(order.payload.lines.filter((l) => !byId.has(l.product_id)).map((l) => `${l.code} ${l.description}`));
    })();
  }, [db, orderId, customer]);

  useEffect(() => {
    if (!customer) return;
    const timer = setTimeout(() => void searchProducts(db, customer.price_list_id, query).then(setResults), 200);
    return () => clearTimeout(timer);
  }, [db, customer, query]);

  // Coming back from the scanner with a barcode.
  useFocusEffect(
    useCallback(() => {
      const code = takeScan("product");
      if (!code || !customer) return;
      void productByBarcode(db, customer.price_list_id, code).then((product) => {
        if (product) open(product);
        else Alert.alert("Código no encontrado", `No hay un artículo con el código ${code} en la lista de este cliente.`);
      });
    }, [db, customer]),
  );

  function open(product: Product) {
    const existing = lines.find((l) => l.product.id === product.id);
    setEditing(existing ?? { product, cases: "", units: "", bonus: "" });
    setQuery("");
  }

  function keep(line: Line) {
    const qty = parseAmount(line.cases) * Number(line.product.units_per_case) + parseAmount(line.units);
    setLines((current) => {
      const others = current.filter((l) => l.product.id !== line.product.id);
      return qty > 0 ? [...others, line] : others;
    });
    setEditing(null);
  }

  const totals = useMemo(() => orderTotals(lines.map(amounts)), [lines]);

  async function save() {
    if (!customer || !lines.length) return;
    setSaving(true);
    try {
      const payload: OrderPayload = {
        id: original?.id ?? randomUUID(),
        customer_id: customer.id,
        taken_at: original?.payload.taken_at ?? new Date().toISOString(),
        notes: notes.trim() || null,
        location: original?.payload.location ?? location,
        lines: lines.map((l) => ({
          product_id: l.product.id,
          code: l.product.code,
          description: l.product.description,
          cases: String(parseAmount(l.cases)),
          units: String(parseAmount(l.units)),
          unit_price: String(l.product.price ?? 0),
          bonus_percent: String(parseAmount(l.bonus)),
          total: amounts(l).total,
        })),
      };
      if (original) {
        if (!canEdit(original)) {
          Alert.alert("No se puede modificar", "Este pedido ya no se puede modificar.");
          return;
        }
        await updateOrder(db, payload, totals.total);
      } else {
        await addOrder(db, payload, customer.trade_name || customer.legal_name, totals.total);
      }
      await refresh();
      void sync(); // sent now if there is signal; otherwise it waits in the queue
      router.back();
    } finally {
      setSaving(false);
    }
  }

  if (!customer) return <View style={ui.screen} />;
  return (
    <View style={ui.screen}>
      <Stack.Screen options={{ title: `${original ? "Modificar" : "Pedido"}: ${customer.trade_name || customer.legal_name}` }} />
      {missing.length > 0 && (
        <Text style={styles.missing}>
          Ya no están en la lista de este cliente y se quitan del pedido: {missing.join(", ")}
        </Text>
      )}
      <View style={styles.search}>
        <TextInput
          style={[ui.input, { flex: 1 }]}
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar artículo: código, descripción o marca"
          returnKeyType="search"
        />
        <Pressable style={styles.scan} onPress={() => router.push({ pathname: "/escanear", params: { purpose: "product" } })} accessibilityLabel="Escanear código de barras">
          <Text style={styles.scanText}>Escanear</Text>
        </Pressable>
      </View>
      {query.trim() ? (
        <FlatList
          data={results}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 12, gap: 6 }}
          ListEmptyComponent={<Text style={[ui.muted, { textAlign: "center" }]}>Sin artículos con precio para este cliente</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => open(item)} style={({ pressed }) => [ui.card, styles.product, pressed && { opacity: 0.8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={ui.text} numberOfLines={2}>{item.description}</Text>
                <Text style={ui.muted}>
                  {item.code} · Stock {formatQuantity(item.available)}
                  {Number(item.units_per_case) > 1 ? ` · Bulto ×${formatQuantity(item.units_per_case)}` : ""}
                </Text>
              </View>
              <Text style={[ui.text, { fontWeight: "700" }]}>{formatMoney(item.price ?? 0)}</Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={lines}
          keyExtractor={(l) => l.product.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          ListEmptyComponent={<Text style={[ui.muted, { textAlign: "center", marginTop: 16 }]}>Busque o escanee artículos para agregarlos</Text>}
          renderItem={({ item }) => {
            const a = amounts(item);
            return (
              <Pressable onPress={() => setEditing(item)} style={({ pressed }) => [ui.card, styles.product, pressed && { opacity: 0.8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={ui.text} numberOfLines={2}>{item.product.description}</Text>
                  <Text style={ui.muted}>
                    {parseAmount(item.cases) ? `${formatQuantity(parseAmount(item.cases))} bulto${parseAmount(item.cases) > 1 ? "s" : ""} + ` : ""}
                    {formatQuantity(parseAmount(item.units))} u · {formatMoney(item.product.price ?? 0)}
                    {parseAmount(item.bonus) ? ` · bonif. ${formatQuantity(parseAmount(item.bonus))}%` : ""}
                  </Text>
                </View>
                <Text style={[ui.text, { fontWeight: "700" }]}>{formatMoney(a.total)}</Text>
              </Pressable>
            );
          }}
          ListFooterComponent={
            lines.length ? (
              <TextInput style={[ui.input, { marginTop: 8 }]} value={notes} onChangeText={setNotes} placeholder="Observaciones del pedido" multiline />
            ) : null
          }
        />
      )}
      <View style={styles.footer}>
        <View style={{ flex: 1 }}>
          <Text style={ui.muted}>Neto {formatMoney(totals.net)} + impuestos {formatMoney(totals.vat)}</Text>
          <Text style={styles.total}>{formatMoney(totals.total)}</Text>
        </View>
        <Button title={original ? "Guardar cambios" : "Guardar pedido"} onPress={() => void save()} disabled={!lines.length} loading={saving} />
      </View>
      {editing && <LineEditor line={editing} onSave={keep} onClose={() => setEditing(null)} />}
    </View>
  );
}

function LineEditor({ line, onSave, onClose }: { line: Line; onSave: (line: Line) => void; onClose: () => void }) {
  const [cases, setCases] = useState(line.cases);
  const [units, setUnits] = useState(line.units);
  const [bonus, setBonus] = useState(line.bonus);
  const perCase = Number(line.product.units_per_case);
  const draft = { ...line, cases, units, bonus };
  const a = amounts(draft);
  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <Text style={ui.title} numberOfLines={2}>{line.product.description}</Text>
        <Text style={ui.muted}>
          {line.product.code} · {formatMoney(line.product.price ?? 0)} neto por unidad · Stock {formatQuantity(line.product.available)}
        </Text>
        <View style={styles.fields}>
          {perCase > 1 && (
            <Field label={`Bultos ×${formatQuantity(perCase)}`} value={cases} onChange={setCases} autoFocus />
          )}
          <Field label="Unidades" value={units} onChange={setUnits} autoFocus={perCase <= 1} />
          <Field label="% Bonif." value={bonus} onChange={setBonus} />
        </View>
        {a.quantity > Number(line.product.available) && (
          <Text style={{ color: colors.warning }}>Más que el stock de la última sincronización ({formatQuantity(line.product.available)})</Text>
        )}
        <Text style={[ui.text, { fontWeight: "700" }]}>Total {formatMoney(a.total)}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button title={line.cases || line.units ? "Quitar" : "Cancelar"} variant="secondary" style={{ flex: 1 }} onPress={() => (line.cases || line.units ? onSave({ ...line, cases: "0", units: "0" }) : onClose())} />
          <Button title="Listo" style={{ flex: 1 }} disabled={a.quantity <= 0} onPress={() => onSave(draft)} />
        </View>
      </View>
    </View>
  );
}

function Field({ label, value, onChange, autoFocus }: { label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={ui.label}>{label}</Text>
      <TextInput style={[ui.input, { textAlign: "right" }]} value={value} onChangeText={onChange} keyboardType="decimal-pad" autoFocus={autoFocus} selectTextOnFocus />
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  scan: { justifyContent: "center", paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.primary },
  scanText: { color: colors.primary, fontWeight: "700" },
  product: { flexDirection: "row", alignItems: "center", gap: 12 },
  footer: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  total: { fontSize: 22, fontWeight: "800", color: colors.ink },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, padding: 20, gap: 12, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  fields: { flexDirection: "row", gap: 10 },
  missing: { margin: 12, marginBottom: 0, padding: 10, borderRadius: 8, backgroundColor: colors.warningSoft, color: colors.warning },
});
