import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/lib/api";
import { useAuth } from "../../src/providers/AuthProvider";
import { colors } from "../../src/theme";

export default function Settings() {
  const { user, refresh, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const lang = user?.lang || "es";

  const setLang = async (l: "es" | "en") => {
    try {
      await api("/auth/lang", { method: "PATCH", body: JSON.stringify({ lang: l }) });
      await refresh();
    } catch (e) {
      console.warn(e);
    }
  };

  const doSignOut = async () => {
    const confirm = () => {
      signOut().then(() => router.replace("/"));
    };
    if (Platform.OS === "web") {
      confirm();
    } else {
      Alert.alert("Cerrar sesión", "¿Seguro?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Salir", style: "destructive", onPress: confirm },
      ]);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]} testID="settings-screen">
      <View style={styles.header}>
        <Ionicons name="cog" size={20} color={colors.brass} />
        <Text style={styles.title}>AJUSTES</Text>
      </View>

      <View style={styles.profile}>
        {user?.picture ? (
          <Image source={{ uri: user.picture }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPh]}>
            <Ionicons name="person" size={30} color={colors.brass} />
          </View>
        )}
        <Text style={styles.name} numberOfLines={1}>{user?.name}</Text>
        <Text style={styles.email} numberOfLines={1}>{user?.email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>IDIOMA DE LOS RESÚMENES</Text>
        <View style={styles.langRow}>
          <LangBtn label="Español" active={lang === "es"} onPress={() => setLang("es")} testID="btn-lang-es" />
          <LangBtn label="English" active={lang === "en"} onPress={() => setLang("en")} testID="btn-lang-en" />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>MAZO</Text>
        <TouchableOpacity
          style={styles.row}
          testID="btn-reset-history"
          onPress={async () => {
            await api("/books/reset", { method: "POST" });
            if (Platform.OS === "web") {
              // no alert on web
            } else {
              Alert.alert("Hecho", "Historial de descartes reiniciado.");
            }
          }}
        >
          <Ionicons name="refresh" size={18} color={colors.brass} />
          <Text style={styles.rowText}>Reiniciar historial de descartes</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={doSignOut} testID="btn-logout">
        <Ionicons name="log-out-outline" size={18} color={colors.iron} />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>Vapor & Tinta · MMXXVI</Text>
    </View>
  );
}

function LangBtn({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      style={[styles.langBtn, active && styles.langBtnActive]}
    >
      <Text style={[styles.langText, active && styles.langTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase, paddingHorizontal: 20 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  title: {
    color: colors.brass,
    fontWeight: "900",
    letterSpacing: 5,
    fontSize: 16,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
  },
  profile: { alignItems: "center", padding: 20, marginBottom: 14 },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: colors.brass },
  avatarPh: { alignItems: "center", justifyContent: "center", backgroundColor: colors.bgSurface },
  name: { color: colors.textOnDark, fontSize: 18, fontWeight: "700", marginTop: 10 },
  email: { color: colors.textOnDarkMuted, fontSize: 12, marginTop: 2 },
  section: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  sectionLabel: { color: colors.textOnDarkMuted, fontSize: 11, letterSpacing: 2, fontWeight: "800", marginBottom: 10 },
  langRow: { flexDirection: "row", gap: 10 },
  langBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.brassSoft,
    alignItems: "center",
  },
  langBtnActive: { backgroundColor: colors.brass, borderColor: colors.brass },
  langText: { color: colors.brass, fontWeight: "700", letterSpacing: 1 },
  langTextActive: { color: colors.bgBase },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  rowText: { color: colors.textOnDark, fontSize: 14 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(138,42,32,0.5)",
    borderRadius: 999,
    paddingVertical: 14,
    marginTop: 10,
  },
  logoutText: { color: colors.iron, fontWeight: "700", letterSpacing: 1 },
  footer: {
    textAlign: "center",
    color: colors.textOnDarkMuted,
    marginTop: "auto",
    marginBottom: 20,
    fontSize: 11,
    letterSpacing: 3,
  },
});
