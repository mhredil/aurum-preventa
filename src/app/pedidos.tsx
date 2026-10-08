import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { Alert, FlatList, Text, View } from "react-native";
import { OrderCard } from "@/components/OrderCard";
import { SyncBar } from "@/components/SyncBar";
import { deleteOrder, listOrders, retryOrder } from "@/lib/store";
import { useSync } from "@/lib/SyncProvider";
import { ui } from "@/lib/theme";
import type { OutboxOrder } from "@/lib/types";

/** Every order taken on this phone: the ones waiting for signal, the sent ones (with their
 * number and state in the office) and the ones the server refused. */
export default function Orders() {
  const db = useSQLiteContext();
  const { version, refresh, sync } = useSync();
  const [orders, setOrders] = useState<OutboxOrder[]>([]);

  useEffect(() => {
    void listOrders(db).then(setOrders);
  }, [db, version]);

  function discard(order: OutboxOrder) {
    Alert.alert("Descartar pedido", `¿Descartar el pedido de ${order.customer_name}? No se envía a la oficina.`, [
      { text: "Volver", style: "cancel" },
      {
        text: "Descartar",
        style: "destructive",
        onPress: () => void deleteOrder(db, order.id).then(refresh),
      },
    ]);
  }

  return (
    <View style={ui.screen}>
      <SyncBar />
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        ListEmptyComponent={<Text style={[ui.muted, { textAlign: "center", marginTop: 24 }]}>Todavía no tomó pedidos en este teléfono</Text>}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            showCustomer
            onRetry={() => void retryOrder(db, item.id).then(sync)}
            onDelete={() => discard(item)}
          />
        )}
      />
    </View>
  );
}
