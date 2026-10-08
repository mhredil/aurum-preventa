import { useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { OrderCard } from "@/components/OrderCard";
import { SyncBar } from "@/components/SyncBar";
import { listOrders } from "@/lib/store";
import { useSync } from "@/lib/SyncProvider";
import { ui } from "@/lib/theme";
import type { OutboxOrder } from "@/lib/types";

/** Every order taken on this phone: the ones waiting for signal, the sent ones (with their
 * number and state in the office) and the ones the server refused. */
export default function Orders() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { version } = useSync();
  const [orders, setOrders] = useState<OutboxOrder[]>([]);

  useEffect(() => {
    void listOrders(db).then(setOrders);
  }, [db, version]);

  return (
    <View style={ui.screen}>
      <SyncBar />
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        ListEmptyComponent={<Text style={[ui.muted, { textAlign: "center", marginTop: 24 }]}>Todavía no tomó pedidos en este teléfono</Text>}
        renderItem={({ item }) => (
          <OrderCard order={item} showCustomer onPress={() => router.push({ pathname: "/orden/[id]", params: { id: item.id } })} />
        )}
      />
    </View>
  );
}
