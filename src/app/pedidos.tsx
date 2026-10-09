import { useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { OrderCard } from "@/components/OrderCard";
import { SyncBar } from "@/components/SyncBar";
import { isOpen, listOrders } from "@/lib/store";
import { useSync } from "@/lib/SyncProvider";
import { colors, ui } from "@/lib/theme";
import type { OutboxOrder } from "@/lib/types";

/** Orders taken on this phone, in two tabs: the ones of the current route that can still
 * change, and the ones the office already processed (invoiced, on a run, closed or older). */
export default function Orders() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { version } = useSync();
  const [orders, setOrders] = useState<OutboxOrder[]>([]);
  const [tab, setTab] = useState<"open" | "done">("open");

  useEffect(() => {
    void listOrders(db).then(setOrders);
  }, [db, version]);

  const open = orders.filter(isOpen);
  const done = orders.filter((o) => !isOpen(o));
  const shown = tab === "open" ? open : done;

  return (
    <View style={ui.screen}>
      <SyncBar />
      <View style={styles.tabs}>
        <Tab label={`Para modificar (${open.length})`} active={tab === "open"} onPress={() => setTab("open")} />
        <Tab label={`Procesados (${done.length})`} active={tab === "done"} onPress={() => setTab("done")} />
      </View>
      <FlatList
        data={shown}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        ListEmptyComponent={
          <Text style={[ui.muted, { textAlign: "center", marginTop: 24 }]}>
            {tab === "open"
              ? "No hay pedidos pendientes: los tomados hoy que la oficina todavía no procesó aparecen acá."
              : "Todavía no hay pedidos facturados, en hoja de ruta o cerrados."}
          </Text>
        }
        renderItem={({ item }) => (
          <OrderCard order={item} showCustomer onPress={() => router.push({ pathname: "/orden/[id]", params: { id: item.id } })} />
        )}
      />
    </View>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.line, alignItems: "center" },
  tabActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  tabText: { color: colors.ink2, fontWeight: "600" },
  tabTextActive: { color: colors.primaryDark },
});
