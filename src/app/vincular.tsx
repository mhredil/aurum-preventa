import * as Device from "expo-device";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/components/Button";
import { normalizeCode, normalizeServer, parsePairingQr } from "@/domain/pairing";
import { APP_VERSION, request } from "@/lib/api";
import { takeScan } from "@/lib/scan";
import { useSession } from "@/lib/session";
import { syncAll } from "@/lib/sync";
import { useSync } from "@/lib/SyncProvider";
import { colors, ui } from "@/lib/theme";

interface PairResponse {
  token: string;
  device_id: string;
  user_name: string;
  seller_name: string;
  company_name: string;
}

/** Links the phone with the one-time code generated in the portal (Distribución → Preventa
 * móvil): scanning the QR or typing the server and the code. */
export default function Link() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { session, save } = useSession();
  const { refresh } = useSync();
  const [server, setServer] = useState(session ? session.server.replace(/\/api\/v1$/, "") : "");
  const [code, setCode] = useState("");
  const [name, setName] = useState(Device.modelName ?? "Teléfono");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const scanned = takeScan("pairing");
      if (!scanned) return;
      const data = parsePairingQr(scanned);
      if (!data) {
        setError("Ese código QR no es de Aurum: genere uno en el portal, en Distribución → Preventa móvil.");
        return;
      }
      setServer(data.server.replace(/\/api\/v1$/, ""));
      setCode(data.code);
      setError(null);
    }, []),
  );

  async function link() {
    const api = normalizeServer(server);
    if (!api) return setError("Revise la dirección del servidor");
    if (normalizeCode(code).length < 6) return setError("Escriba el código que muestra el portal");
    setBusy(true);
    setError(null);
    try {
      const answer = await request<PairResponse>(api, "/mobile/pair", {
        method: "POST",
        body: { code: normalizeCode(code), device_name: name.trim() || "Teléfono", platform: Platform.OS, app_version: APP_VERSION },
      });
      const linked = {
        server: api,
        token: answer.token,
        deviceId: answer.device_id,
        userName: answer.user_name,
        sellerName: answer.seller_name,
        companyName: answer.company_name,
      };
      await save(linked);
      // First sync right away: the seller leaves with everything on the phone.
      await syncAll(db, linked).catch(() => undefined);
      await refresh();
      router.replace("/hoy");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={ui.title}>Aurum Preventa</Text>
        <Text style={ui.muted}>
          Pida en la oficina que generen un código para su usuario en el portal (Distribución → Preventa móvil) y escanéelo.
        </Text>
        <Button title="Escanear código QR" onPress={() => router.push({ pathname: "/escanear", params: { purpose: "pairing" } })} />
        <Text style={[ui.muted, { textAlign: "center" }]}>o escriba los datos</Text>
        <View>
          <Text style={ui.label}>Servidor</Text>
          <TextInput
            style={ui.input}
            value={server}
            onChangeText={setServer}
            placeholder="distribuidora.com.ar"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>
        <View>
          <Text style={ui.label}>Código</Text>
          <TextInput style={[ui.input, styles.code]} value={code} onChangeText={setCode} placeholder="ABCDE-FGHIJ" autoCapitalize="characters" autoCorrect={false} />
        </View>
        <View>
          <Text style={ui.label}>Nombre del teléfono</Text>
          <TextInput style={ui.input} value={name} onChangeText={setName} />
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
        <Button title="Vincular" onPress={() => void link()} loading={busy} />
        {session && (
          <Text style={ui.muted}>
            Vinculado hoy como {session.sellerName} en {session.server.replace(/\/api\/v1$/, "")}. Vincularlo de nuevo no borra los pedidos sin enviar.
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14 },
  code: { fontSize: 20, letterSpacing: 2, fontWeight: "700" },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft, padding: 10, borderRadius: 8 },
});
