import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { putScan } from "@/lib/scan";
import { ui } from "@/lib/theme";

/** Camera for the linking QR (purpose=pairing) or an article's barcode (purpose=product). */
export default function Scan() {
  const router = useRouter();
  const { purpose = "pairing" } = useLocalSearchParams<{ purpose?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const done = useRef(false);

  function scanned(result: BarcodeScanningResult) {
    if (done.current) return; // the camera reports the same code many times per second
    done.current = true;
    putScan(purpose, result.data);
    router.back();
  }

  if (!permission) return <View style={ui.screen} />;
  if (!permission.granted) {
    return (
      <View style={[ui.screen, styles.center]}>
        <Text style={[ui.text, { textAlign: "center" }]}>Para escanear hace falta permiso para usar la cámara.</Text>
        <Button title="Permitir la cámara" onPress={() => void requestPermission()} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: purpose === "pairing" ? ["qr"] : ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "itf14", "qr"],
        }}
        onBarcodeScanned={scanned}
      />
      <View style={styles.hint}>
        <Text style={styles.hintText}>
          {purpose === "pairing" ? "Apunte al código QR que muestra el portal" : "Apunte al código de barras del artículo"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  hint: { position: "absolute", bottom: 40, left: 20, right: 20, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 10, padding: 12 },
  hintText: { color: "#fff", textAlign: "center", fontSize: 15 },
});
