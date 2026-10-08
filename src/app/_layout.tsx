import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { DATABASE_NAME, migrate } from "@/lib/db";
import { SessionProvider } from "@/lib/session";
import { SyncProvider } from "@/lib/SyncProvider";
import { colors } from "@/lib/theme";

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate}>
      <SessionProvider>
        <SyncProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.primary },
              headerTintColor: "#fff",
              headerTitleStyle: { fontWeight: "700" },
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="vincular" options={{ title: "Vincular teléfono" }} />
            <Stack.Screen name="escanear" options={{ title: "Escanear", presentation: "modal" }} />
            <Stack.Screen name="hoy" options={{ title: "Preventa" }} />
            <Stack.Screen name="cliente/[id]" options={{ title: "Cliente" }} />
            <Stack.Screen name="pedido/[customerId]" options={{ title: "Nuevo pedido" }} />
            <Stack.Screen name="pedidos" options={{ title: "Pedidos" }} />
          </Stack>
        </SyncProvider>
      </SessionProvider>
    </SQLiteProvider>
  );
}
