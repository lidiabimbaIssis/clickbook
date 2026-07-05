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
  const [clearingFavorites, setClearingFavorites] = useState(false);

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

  const doClearFavorites = () => {
    const run = async () => {
      setClearingFavorites(true);
      try {
        await api("/favorites/clear", { method: "POST" });
        if (Platform.OS !== "web") {
          Alert.alert("Hecho", "Se han borrado todos tus favoritos.");
        }
      } catch (e) {
        console.warn("clear favorites failed", e);
      } finally {
        setClearingFavorites(false);
      }
    };

    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("¿Borrar todos tus favoritos? Esta acción no se puede deshacer.")) {
        run();
      }
    } else {
      Alert.alert(
        "Vaciar favoritos",
        "Se borrarán todos los libros que tienes guardados como favoritos. Esta acción no se puede deshacer.",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Vaciar", style: "destructive", onPress: run },
        ]
      );
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
        // Usuario premium: recuadro limpio con beneficios activos,
        // sin repetir "Premium" ni el diamante (ya están arriba en el badge).
        <View style={styles.premiumActiveCard} testID="premium-active-card">
          <View style={styles.benefitRow}>
            <Ionicons name="headset" size={14} color={colors.gold} />
            <Text style={styles.benefitText}>Audios ilimitados</Text>
          </View>
          <View style={styles.benefitRow}>
            <Ionicons name="chatbubbles" size={14} color={colors.gold} />
            <Text style={styles.benefitText}>Habla con tus personajes favoritos</Text>
          </View>
          <View style={styles.benefitRow}>
            <Ionicons name="document-text" size={14} color={colors.gold} />
            <Text style={styles.benefitText}>Resúmenes completos y sin spoilers</Text>
          </View>
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
              Audios ilimitados · Habla con tus personajes favoritos · Resúmenes premium
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.gold} />
        </TouchableOpacity>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}></Text>
        <TouchableOpacity
          style={styles.row}
          testID="btn-clear-favorites"
          onPress={doClearFavorites}
          disabled={clearingFavorites}
        >
          <Ionicons name="trash-outline" size={18} color={colors.brass} />
          <Text style={styles.rowText}>
            {clearingFavorites ? "Vaciando favoritos…" : "Vaciar favoritos"}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={doSignOut} testID="btn-logout">
        <Ionicons name="log-out-outline" size={18} color={colors.iron} />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => router.push("/legal")}
        style={{ marginTop: 20, alignItems: "center" }}
      >
        <Text style={{ color: "#02666d", fontSize: 12, textAlign: "center" }}>
          Términos y Condiciones
        </Text>
      </TouchableOpacity>

      <Text style={styles.footer}>BookVibes · MMXXVI</Text>

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
  title: { color: colors.brass, fontWeight: "900", letterSpacing: 5, fontSize: 16 },
  profile: { alignItems: "center", padding: 20, marginBottom: 14 },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: colors.brass },
  avatarPh: { alignItems: "center", justifyContent: "center", backgroundColor: colors.bgSurface },
  name: { color: colors.textOnDark, fontSize: 18, fontWeight: "700", marginTop: 10 },
  email: { color: colors.textOnDarkMuted, fontSize: 12, marginTop: 2 },
  premiumBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.gold, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, marginTop: 10,
  },
  premiumBadgeText: { color: colors.bgBase, fontWeight: "900", fontSize: 10, letterSpacing: 1.5 },
  premiumCta: {
    flexDirection: "row", alignItems: "center", backgroundColor: "transparent",
    borderWidth: 2, borderColor: colors.gold, borderRadius: 16,
    padding: 14, gap: 14, marginBottom: 14,
  },
  premiumCtaLeft: { width: 44, alignItems: "center" },
  premiumCtaTitle: { color: colors.gold, fontWeight: "900", fontSize: 16, letterSpacing: 1 },
  premiumCtaSub: { color: colors.textOnDark, fontSize: 12, marginTop: 4, lineHeight: 17 },
  premiumActiveCard: {
    backgroundColor: "rgba(255,210,63,0.06)", borderWidth: 1,
    borderColor: colors.gold, borderRadius: 16, padding: 16, marginBottom: 14, gap: 10,
  },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  benefitText: { color: colors.textOnDark, fontSize: 13 },
  downgradeBtn: { marginTop: 4, alignSelf: "flex-start" },
  downgradeText: { color: colors.textOnDarkMuted, fontSize: 11, textDecorationLine: "underline" },
  section: {
    backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: 16, marginBottom: 14,
  },
  sectionLabel: { color: colors.textOnDarkMuted, fontSize: 11, letterSpacing: 2, fontWeight: "800", marginBottom: 10 },
  langRow: { flexDirection: "row", gap: 10 },
  langBtn: { flex: 1, paddingVertical: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.brassSoft, alignItems: "center" },
  langBtnActive: { backgroundColor: colors.brass, borderColor: colors.brass },
  langText: { color: colors.brass, fontWeight: "700", letterSpacing: 1 },
  langTextActive: { color: colors.bgBase },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  rowText: { color: colors.textOnDark, fontSize: 14 },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, borderWidth: 1, borderColor: "rgba(255,46,120,0.5)",
    borderRadius: 999, paddingVertical: 14, marginTop: 10,
  },
  logoutText: { color: colors.iron, fontWeight: "700", letterSpacing: 1 },
  footer: { textAlign: "center", color: colors.textOnDarkMuted, marginTop: 30, fontSize: 11, letterSpacing: 3 },
});