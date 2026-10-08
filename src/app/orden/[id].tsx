import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { orderState } from "@/components/OrderCard";
import { formatMoney, formatQuantity, parseAmount } from "@/domain/money";
import { canEdit, deleteOrder, discardChanges, getOrder, retryOrder } from "@/lib/store";
import { useSync } from "@/lib/SyncProvider";
import { colors, ui } from "@/lib/theme";
import type { OutboxOrder } from "@/lib/types";

/** An order taken on the phone: its lines and state, and what can still be done with it. */
export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const { version, refresh, sync } = useSync();
  const [order, setOrder] = useState<OutboxOrder | null>(null);

  useEffect(() => {
    void getOrder(db, id).then(setOrder);
  }, [db, id, version]);

  if (!order) return <View style={ui.screen} />;
  const state = orderState(order);
  const editable = canEdit(order);
  const neverSent = order.sent_payload === null;
  const taken = new Date(order.created_at);

  function confirmDiscard() {
    if (!order) return;
    Alert.alert(
      neverSent ? "Descartar pedido" : "Descartar cambios",
      neverSent ? "El pedido no se envía a la oficina." : "El pedido vuelve a quedar como lo tiene la oficina.",
      [
        { text: "Volver", style: "cancel" },
        {
          text: "Descartar",
          style: "destructive",
          onPress: () =>
            void (neverSent ? deleteOrder(db, order.id) : discardChanges(db, order.id)).then(async () => {
              await refresh();
              if (neverSent) router.back();
            }),
        },
      ],
    );
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: order.number ?? "Pedido sin enviar" }} />
      <View style={ui.card}>
        <Text style={ui.title}>{order.customer_name}</Text>
        <Text style={ui.muted}>
          Tomado el {taken.toLocaleDateString("es-AR")} a las {taken.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
        </Text>
        <Text style={[styles.state, styles[state.tone]]}>{state.text}</Text>
        {!editable && !neverSent && (
          <Text style={[ui.muted, { marginTop: 6 }]}>
            Ya no se puede modificar: {order.editable ? "solo se modifican los pedidos del día" : "la oficina lo facturó, lo puso en una hoja de ruta o lo cerró"}.
          </Text>
        )}
      </View>
      <View style={[ui.card, { gap: 10 }]}>
        {order.payload.lines.map((line) => {
          const cases = parseAmount(line.cases);
          const bonus = parseAmount(line.bonus_percent);
          return (
            <View key={line.product_id} style={styles.line}>
              <View style={{ flex: 1 }}>
                <Text style={ui.text} numberOfLines={2}>{line.description}</Text>
                <Text style={ui.muted}>
                  {line.code} · {cases ? `${formatQuantity(cases)} bulto${cases > 1 ? "s" : ""} + ` : ""}
                  {formatQuantity(parseAmount(line.units))} u · {formatMoney(line.unit_price)}
                  {bonus ? ` · bonif. ${formatQuantity(bonus)}%` : ""}
                </Text>
              </View>
              <Text style={[ui.text, { fontWeight: "700" }]}>{formatMoney(line.total)}</Text>
            </View>
          );
        })}
        <View style={styles.totalRow}>
          <Text style={ui.text}>Total{order.state === "SENT" ? "" : " estimado"}</Text>
          <Text style={styles.total}>{formatMoney(order.total)}</Text>
        </View>
      </View>
      {order.payload.notes && (
        <View style={ui.card}>
          <Text style={ui.label}>Observaciones</Text>
          <Text style={ui.text}>{order.payload.notes}</Text>
        </View>
      )}
      {editable && (
        <Button
          title="Modificar pedido"
          onPress={() => router.push({ pathname: "/pedido/[customerId]", params: { customerId: order.customer_id, orderId: order.id } })}
        />
      )}
      {order.state === "ERROR" && <Button title="Reintentar el envío" variant="secondary" onPress={() => void retryOrder(db, order.id).then(sync)} />}
      {(neverSent || order.edited) && order.state !== "SENT" && (
        <Button title={neverSent ? "Descartar pedido" : "Descartar cambios"} variant="secondary" onPress={confirmDiscard} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  state: { alignSelf: "flex-start", marginTop: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, fontSize: 13, fontWeight: "600", overflow: "hidden" },
  pending: { backgroundColor: colors.warningSoft, color: colors.warning },
  sent: { backgroundColor: colors.primarySoft, color: colors.primaryDark },
  error: { backgroundColor: colors.dangerSoft, color: colors.danger },
  line: { flexDirection: "row", gap: 12, alignItems: "center" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 },
  total: { fontSize: 20, fontWeight: "800", color: colors.ink },
});
