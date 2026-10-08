import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { randomUUID } from "expo-crypto";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/components/Button";
import { OrderCard } from "@/components/OrderCard";
import { formatMoney } from "@/domain/money";
import { currentLocation } from "@/lib/location";
import { addVisit, getCustomer, getMeta, listOrders, noSaleToday } from "@/lib/store";
import { useSync } from "@/lib/SyncProvider";
import { colors, ui } from "@/lib/theme";
import type { Customer, OutboxOrder } from "@/lib/types";

export default function CustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const { version, refresh, sync } = useSync();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<OutboxOrder[]>([]);
  const [noSale, setNoSale] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    void (async () => {
      setCustomer(await getCustomer(db, id));
      setOrders(await listOrders(db, id));
      setNoSale((await noSaleToday(db)).get(id) ?? null);
    })();
  }, [db, id, version]);

  if (!customer) return <View style={ui.screen} />;
  const balance = Number(customer.balance);
  const limit = Number(customer.credit_limit);
  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: customer.trade_name || customer.legal_name }} />
      <View style={ui.card}>
        <Text style={ui.title}>{customer.legal_name}</Text>
        {customer.trade_name && <Text style={ui.text}>{customer.trade_name}</Text>}
        <Text style={ui.muted}>
          {customer.code}
          {customer.document_number ? ` · ${customer.document_number}` : ""}
        </Text>
        {customer.address && <Text style={[ui.text, { marginTop: 8 }]}>{customer.address}</Text>}
        {customer.phone && <Text style={ui.muted}>Tel. {customer.phone}</Text>}
        {customer.route_name && <Text style={ui.muted}>Ruta {customer.route_name}{customer.visit_order ? `, visita ${customer.visit_order}` : ""}</Text>}
      </View>
      <View style={[ui.card, styles.figures]}>
        <Figure label="Saldo" value={formatMoney(balance)} warn={balance > 0} />
        <Figure label="Límite de crédito" value={limit > 0 ? formatMoney(limit) : "Sin límite"} />
        {limit > 0 && <Figure label="Disponible" value={formatMoney(Math.max(0, limit - balance))} warn={limit - balance <= 0} />}
      </View>
      <Button title="Nuevo pedido" onPress={() => router.push({ pathname: "/pedido/[customerId]", params: { customerId: customer.id } })} />
      {noSale ? (
        <Text style={styles.noSale}>Hoy: no compró ({noSale})</Text>
      ) : (
        <Button title="No compró" variant="secondary" onPress={() => setAsking(true)} />
      )}
      {orders.length > 0 && <Text style={[ui.label, { marginTop: 8 }]}>Pedidos tomados en este teléfono</Text>}
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} onPress={() => router.push({ pathname: "/orden/[id]", params: { id: order.id } })} />
      ))}
      <Text style={ui.muted}>El saldo es el del momento de la última sincronización.</Text>
      {asking && (
        <NoSaleForm
          onCancel={() => setAsking(false)}
          onSave={async (reason, notes) => {
            await addVisit(db, {
              id: randomUUID(),
              customer_id: customer.id,
              customer_name: customer.trade_name || customer.legal_name,
              visited_at: new Date().toISOString(),
              reason,
              notes,
              location: await currentLocation(),
            });
            setAsking(false);
            await refresh();
            void sync();
          }}
        />
      )}
    </ScrollView>
  );
}

/** "No compró": the reason (from the office's list) and an optional note. */
function NoSaleForm({ onSave, onCancel }: { onSave: (reason: string, notes: string | null) => Promise<void>; onCancel: () => void }) {
  const db = useSQLiteContext();
  const [reasons, setReasons] = useState<string[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void getMeta<string[]>(db, "reasons").then((r) => setReasons(r ?? []));
  }, [db]);
  return (
    <View style={[ui.card, { gap: 10 }]}>
      <Text style={ui.title}>¿Por qué no compró?</Text>
      {reasons.length === 0 && <Text style={ui.muted}>Sincronice para traer los motivos.</Text>}
      {reasons.map((r) => (
        <Pressable key={r} onPress={() => setReason(r)} style={[styles.reason, reason === r && styles.reasonActive]} accessibilityRole="radio" accessibilityState={{ selected: reason === r }}>
          <Text style={[ui.text, reason === r && { color: colors.primaryDark, fontWeight: "700" }]}>{r}</Text>
        </Pressable>
      ))}
      <TextInput style={ui.input} value={notes} onChangeText={setNotes} placeholder="Comentario (opcional)" />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button title="Cancelar" variant="secondary" style={{ flex: 1 }} onPress={onCancel} />
        <Button
          title="Registrar"
          style={{ flex: 1 }}
          disabled={!reason}
          loading={saving}
          onPress={() => {
            if (!reason) return;
            setSaving(true);
            void onSave(reason, notes.trim() || null).finally(() => setSaving(false));
          }}
        />
      </View>
    </View>
  );
}

function Figure({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 100 }}>
      <Text style={ui.muted}>{label}</Text>
      <Text style={[ui.text, { fontWeight: "700" }, warn && { color: colors.warning }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  figures: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  noSale: { textAlign: "center", color: colors.warning, fontWeight: "700", padding: 8 },
  reason: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.line },
  reasonActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
});
