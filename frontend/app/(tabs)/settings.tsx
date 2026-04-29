import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/lib/api";
import { useAuth } from "../../src/providers/AuthProvider";
import { colors } from "../../src/theme";
import PaywallModal from "../../src/components/PaywallModal";

export default function Settings() {
  const { user, refresh, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const lang = user?.lang || "es";
  const isPremium = !!user?.is_premium;
  const [paywallOpen, setPaywallOpen] = useState(false);

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

  const downgrade = async () => {
    try {
      await api("/me/downgrade", { method: "POST" });
      await refresh();
    } catch (e) {
      console.warn(e);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bgBase }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 20, paddingBottom: 40 }]}
      testID="settings-screen"
    >
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
        {isPremium && (
          <View style={styles.premiumBadge}>
            <Ionicons name="diamond" size={12} color={colors.bgBase} />
            <Text style={styles.premiumBadgeText}>PREMIUM</Text>
          </View>
        )}
      </View>

      {/* Premium Card */}
      {isPremium ? (
        <View style={styles.premiumActiveCard} testID="premium-active-card">
          <View style={styles.premiumActiveHeader}>
            <Ionicons name="diamond" size={22} color={colors.gold} />
            <Text style={styles.premiumActiveTitle}>ClickBook Premium</Text>
          </View>
          <Text style={styles.premiumActiveText}>
            ¡Eres Premium! Audios ilimitados, chat con autor y resúmenes premium activos.
          </Text>
          <TouchableOpacity style={styles.downgradeBtn} onPress={downgrade} testID="btn-downgrade">
            <Text style={styles.downgradeText}>Cancelar (modo demo)</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.premiumCta}
          onPress={() => setPaywallOpen(true)}
          activeOpacity={0.9}
          testID="btn-go-premium"
        >
          <View style={styles.premiumCtaLeft}>
            <Ionicons name="diamond" size={28} color={colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.premiumCtaTitle}>Hacerse Premium</Text>
            <Text style={styles.premiumCtaSub}>
              Audios ilimitados · Chat con autor · Sin anuncios
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.gold} />
        </TouchableOpacity>
      )}

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
            if (Platform.OS !== "web") {
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

      <Text style={styles.footer}>ClickBook · MMXXVI</Text>

      <PaywallModal
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onUpgraded={async () => {
          await refresh();
        }}
      />
    </ScrollView>
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
  container: { paddingHorizontal: 20 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  title: {
    color: colors.brass,
    fontWeight: "900",
    letterSpacing: 5,
    fontSize: 16,
  },
  profile: { alignItems: "center", padding: 20, marginBottom: 14 },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: colors.brass },
  avatarPh: { alignItems: "center", justifyContent: "center", backgroundColor: colors.bgSurface },
  name: { color: colors.textOnDark, fontSize: 18, fontWeight: "700", marginTop: 10 },
  email: { color: colors.textOnDarkMuted, fontSize: 12, marginTop: 2 },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.gold,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 10,
  },
  premiumBadgeText: { color: colors.bgBase, fontWeight: "900", fontSize: 10, letterSpacing: 1.5 },
  premiumCta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,210,63,0.08)",
    borderWidth: 2,
    borderColor: colors.gold,
    borderRadius: 16,
    padding: 14,
    gap: 14,
    marginBottom: 14,
    shadowColor: colors.gold,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  premiumCtaLeft: { width: 44, alignItems: "center" },
  premiumCtaTitle: {
    color: colors.gold,
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 1,
  },
  premiumCtaSub: { color: colors.textOnDark, fontSize: 12, marginTop: 4, lineHeight: 17 },
  premiumActiveCard: {
    backgroundColor: "rgba(255,210,63,0.06)",
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  premiumActiveHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  premiumActiveTitle: {
    color: colors.gold,
    fontWeight: "900",
    fontSize: 15,
    letterSpacing: 1,
  },
  premiumActiveText: { color: colors.textOnDark, fontSize: 13, lineHeight: 19 },
  downgradeBtn: { marginTop: 12, alignSelf: "flex-start" },
  downgradeText: { color: colors.textOnDarkMuted, fontSize: 11, textDecorationLine: "underline" },
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
    borderColor: "rgba(255,46,120,0.5)",
    borderRadius: 999,
    paddingVertical: 14,
    marginTop: 10,
  },
  logoutText: { color: colors.iron, fontWeight: "700", letterSpacing: 1 },
  footer: {
    textAlign: "center",
    color: colors.textOnDarkMuted,
    marginTop: 30,
    fontSize: 11,
    letterSpacing: 3,
  },
});
