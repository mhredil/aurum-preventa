import { StyleSheet, Text, View } from "react-native";
import { formatMoney } from "@/domain/money";
import { colors, ui } from "@/lib/theme";
import { ORDER_STATUS, type OutboxOrder } from "@/lib/types";
import { Button } from "./Button";

interface Props {
  order: OutboxOrder;
  showCustomer?: boolean;
  onRetry?: () => void;
  onDelete?: () => void;
}

/** An order taken on the phone: queued, sent (with its number and state) or refused. */
export function OrderCard({ order, showCustomer, onRetry, onDelete }: Props) {
  const taken = new Date(order.created_at);
  return (
    <View style={[ui.card, { gap: 4 }]}>
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
      {order.state === "PENDING" && <Text style={[styles.badge, styles.pending]}>Sin enviar: se envía al haber señal</Text>}
      {order.state === "SENT" && (
        <Text style={[styles.badge, styles.sent]}>
          {ORDER_STATUS[order.server_status ?? ""] ?? "Enviado"}
          {order.price_review ? " · precios en revisión" : ""}
        </Text>
      )}
      {order.state === "ERROR" && <Text style={[styles.badge, styles.error]}>No se pudo cargar: {order.error}</Text>}
      {(onRetry || onDelete) && order.state !== "SENT" && (
        <View style={styles.actions}>
          {onRetry && order.state === "ERROR" && <Button title="Reintentar" variant="secondary" onPress={onRetry} style={{ flex: 1 }} />}
          {onDelete && <Button title="Descartar" variant="secondary" onPress={onDelete} style={{ flex: 1 }} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  badge: { alignSelf: "flex-start", marginTop: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, fontSize: 13, fontWeight: "600", overflow: "hidden" },
  pending: { backgroundColor: colors.warningSoft, color: colors.warning },
  sent: { backgroundColor: colors.primarySoft, color: colors.primaryDark },
  error: { backgroundColor: colors.dangerSoft, color: colors.danger },
  actions: { flexDirection: "row", gap: 8, marginTop: 8 },
});
