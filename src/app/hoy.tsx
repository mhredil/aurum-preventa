import { Link, Stack, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { formatMoney } from "@/domain/money";
import { customersForDay, WEEKDAYS, isoWeekday } from "@/domain/route";
import { useSession } from "@/lib/session";
import { filterCustomers, listCustomers, listOrders, listRoutes } from "@/lib/store";
import { useSync } from "@/lib/SyncProvider";
import { colors, ui } from "@/lib/theme";
import type { Customer } from "@/lib/types";

/** Main screen: today's route (customers of the routes visited today, in visit order) or
 * every customer of the seller, with the orders already taken today. */
export default function Today() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { session } = useSession();
  const { version } = useSync();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [routes, setRoutes] = useState<{ id: string; name: string; visit_days: number[] }[]>([]);
  const [ordered, setOrdered] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"route" | "all">("route");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!session) {
      router.replace("/vincular");
      return;
    }
    void (async () => {
      setCustomers(await listCustomers(db));
      setRoutes(await listRoutes(db));
      const today = new Date().toDateString();
      const orders = await listOrders(db);
      setOrdered(new Set(orders.filter((o) => new Date(o.created_at).toDateString() === today).map((o) => o.customer_id)));
    })();
  }, [db, session, version, router]);

  const today = useMemo(() => customersForDay(customers, routes, new Date()), [customers, routes]);
  const shown = filterCustomers(mode === "route" ? today : customers, query);

  return (
    <View style={ui.screen}>
      <Stack.Screen
        options={{
          title: session?.sellerName ?? "Preventa",
          headerRight: () => (
            <Link href="/pedidos" style={styles.headerLink}>
              Pedidos
            </Link>
          ),
        }}
      />
      <SyncBar />
      <View style={styles.tools}>
        <View style={styles.tabs}>
          <Tab label={`Ruta del ${WEEKDAYS[isoWeekday(new Date())]} (${today.length})`} active={mode === "route"} onPress={() => setMode("route")} />
          <Tab label={`Todos (${customers.length})`} active={mode === "all"} onPress={() => setMode("all")} />
        </View>
        <TextInput style={ui.input} value={query} onChangeText={setQuery} placeholder="Buscar cliente: nombre, código, CUIT o dirección" />
      </View>
      <FlatList
        data={shown}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        ListEmptyComponent={
          <Text style={[ui.muted, { textAlign: "center", marginTop: 24 }]}>
            {customers.length === 0
              ? "No hay clientes en el teléfono: sincronice con señal."
              : mode === "route"
                ? "Hoy no hay clientes en sus rutas. Vea Todos."
                : "Ningún cliente coincide con la búsqueda."}
          </Text>
        }
        renderItem={({ item, index }) => (
          <Pressable onPress={() => router.push({ pathname: "/cliente/[id]", params: { id: item.id } })} style={({ pressed }) => [ui.card, styles.item, pressed && { opacity: 0.8 }]}>
            {mode === "route" && <Text style={styles.order}>{item.visit_order ?? index + 1}</Text>}
            <View style={{ flex: 1 }}>
              <Text style={ui.text} numberOfLines={1}>
                {item.trade_name || item.legal_name}
              </Text>
              <Text style={ui.muted} numberOfLines={1}>
                {item.code} · {item.address ?? "Sin dirección"}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              {ordered.has(item.id) ? <Text style={styles.done}>Pedido hoy</Text> : null}
              {Number(item.balance) > 0 && <Text style={ui.muted}>Debe {formatMoney(item.balance)}</Text>}
            </View>
          </Pressable>
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
  headerLink: { color: "#fff", fontWeight: "700", fontSize: 16, paddingHorizontal: 4 },
  tools: { padding: 12, gap: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  tabs: { flexDirection: "row", gap: 8 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.line, alignItems: "center" },
  tabActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  tabText: { color: colors.ink2, fontWeight: "600" },
  tabTextActive: { color: colors.primaryDark },
  item: { flexDirection: "row", alignItems: "center", gap: 12 },
  order: { width: 28, textAlign: "center", fontWeight: "700", color: colors.primary, fontSize: 16 },
  done: { color: colors.primary, fontWeight: "700", fontSize: 13 },
});
