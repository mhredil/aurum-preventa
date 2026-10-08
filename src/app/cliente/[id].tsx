import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { OrderCard } from "@/components/OrderCard";
import { formatMoney } from "@/domain/money";
import { getCustomer, listOrders } from "@/lib/store";
import { useSync } from "@/lib/SyncProvider";
import { colors, ui } from "@/lib/theme";
import type { Customer, OutboxOrder } from "@/lib/types";

export default function CustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const { version } = useSync();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<OutboxOrder[]>([]);

  useEffect(() => {
    void (async () => {
      setCustomer(await getCustomer(db, id));
      setOrders(await listOrders(db, id));
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
      {orders.length > 0 && <Text style={[ui.label, { marginTop: 8 }]}>Pedidos tomados en este teléfono</Text>}
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
      <Text style={ui.muted}>El saldo es el del momento de la última sincronización.</Text>
    </ScrollView>
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
});
