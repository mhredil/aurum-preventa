import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSync } from "@/lib/SyncProvider";
import { colors } from "@/lib/theme";

const since = (iso: string | null): string => {
  if (!iso) return "nunca";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return new Date(iso).toLocaleDateString("es-AR");
};

/** State of the phone against the server, always visible on the main screen. */
export function SyncBar() {
  const router = useRouter();
  const { syncing, lastSync, pending, message, error, revoked, sync } = useSync();
  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Sincronizado {since(lastSync)}</Text>
          <Text style={styles.sub}>
            {pending ? `${pending} pedido${pending > 1 ? "s" : ""} sin enviar` : "Todos los pedidos enviados"}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => void sync()}
          disabled={syncing}
          style={({ pressed }) => [styles.button, (pressed || syncing) && { opacity: 0.7 }]}
        >
          <Text style={styles.buttonText}>{syncing ? "Sincronizando…" : "Sincronizar"}</Text>
        </Pressable>
      </View>
      {revoked ? (
        <Pressable onPress={() => router.push("/vincular")}>
          <Text style={styles.error}>
            Este teléfono fue desvinculado en el portal. Los pedidos sin enviar quedan guardados: toque acá para vincularlo de nuevo.
          </Text>
        </Pressable>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : message ? (
        <Text style={styles.ok}>{message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.primaryDark, paddingHorizontal: 16, paddingVertical: 10, gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: "#fff", fontWeight: "700", fontSize: 15 },
  sub: { color: "#CFE6DD", fontSize: 13 },
  button: { backgroundColor: "#fff", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  buttonText: { color: colors.primaryDark, fontWeight: "700" },
  error: { color: "#FFD9D4", fontSize: 13 },
  ok: { color: "#CFE6DD", fontSize: 13 },
});
