import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";

/** Entry: linked phones go to the day's route, the rest to the linking screen. */
export default function Index() {
  const { session, loading } = useSession();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  return <Redirect href={session ? "/hoy" : "/vincular"} />;
}
