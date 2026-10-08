import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatMoney } from "@/domain/money";
import { colors, ui } from "@/lib/theme";
import { ORDER_STATUS, type OutboxOrder } from "@/lib/types";

interface Props {
  order: OutboxOrder;
  showCustomer?: boolean;
  onPress?: () => void;
}

/** One-line state of an order taken on the phone. */
export function orderState(order: OutboxOrder): { text: string; tone: "pending" | "sent" | "error" } {
  if (order.state === "PENDING") {
    return { text: order.edited ? "Modificado: se envía al haber señal" : "Sin enviar: se envía al haber señal", tone: "pending" };
  }
  if (order.state === "ERROR") {
    return { text: `${order.edited ? "No se pudo modificar" : "No se pudo cargar"}: ${order.error}`, tone: "error" };
  }
  const status = ORDER_STATUS[order.server_status ?? ""] ?? "Enviado";
  return { text: `${status}${order.price_review ? " · precios en revisión" : ""}`, tone: "sent" };
}

/** An order taken on the phone: queued, sent (with its number and state) or refused. */
export function OrderCard({ order, showCustomer, onPress }: Props) {
  const taken = new Date(order.created_at);
  const state = orderState(order);
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [ui.card, { gap: 4 }, pressed && { opacity: 0.8 }]}>
      <View style={styles.row}>
        <Text style={[ui.text, { fontWeight: "700", flex: 1 }]} numberOfLines={1}>
          {showCustomer ? order.customer_name : order.number ?? "Pedido sin enviar"}
        </Text>
        <Text style={[ui.text, { fontWeight: "700" }]}>{formatMoney(order.total)}</Text>
      </View>
      <Text style={ui.muted}>
        {taken.toLocaleDateString("es-AR")} {taken.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} ·{" "}
        {order.payload.lines.length} artículo{order.payload.lines.length > 1 ? "s" : ""}
        {showCustomer && order.number ? ` · ${order.number}` : ""}
      </Text>
      <Text style={[styles.badge, styles[state.tone]]}>{state.text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  badge: { alignSelf: "flex-start", marginTop: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, fontSize: 13, fontWeight: "600", overflow: "hidden" },
  pending: { backgroundColor: colors.warningSoft, color: colors.warning },
  sent: { backgroundColor: colors.primarySoft, color: colors.primaryDark },
  error: { backgroundColor: colors.dangerSoft, color: colors.danger },
});
