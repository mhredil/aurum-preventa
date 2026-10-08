import { StyleSheet } from "react-native";

/** Aurum identity: emerald with tinted neutrals (same as the portal). */
export const colors = {
  primary: "#0B6E55",
  primaryDark: "#08503E",
  primarySoft: "#E3F1EC",
  background: "#F3F6F5",
  surface: "#FFFFFF",
  ink: "#17251F",
  ink2: "#3D4D47",
  muted: "#66756F",
  line: "#D9E2DE",
  danger: "#B42318",
  dangerSoft: "#FDECEA",
  warning: "#9A5B00",
  warningSoft: "#FFF4DE",
};

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.ink },
  text: { fontSize: 15, color: colors.ink },
  muted: { fontSize: 13, color: colors.muted },
  label: { fontSize: 13, fontWeight: "600", color: colors.ink2, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
  },
  mono: { fontFamily: "monospace", fontSize: 13, color: colors.ink2 },
});
