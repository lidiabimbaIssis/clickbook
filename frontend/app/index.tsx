import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ImageBackground,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/providers/AuthProvider";
import { api, setToken } from "../src/lib/api";
import { colors } from "../src/theme";
import Logo from "../src/components/Logo";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function LoginScreen() {
  const { user, loading, refresh } = useAuth();
  const router = useRouter();
  const [processing, setProcessing] = useState(false);

  // Handle OAuth callback hash (session_id) on web
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (typeof window === "undefined") return;
    const hash = window.location.hash || "";
    if (!hash.includes("session_id=")) return;
    const match = hash.match(/session_id=([^&]+)/);
    if (!match) return;
    const sid = match[1];
    (async () => {
      setProcessing(true);
      try {
        const data = await api<any>("/auth/session", {
          method: "POST",
          body: JSON.stringify({ session_id: sid }),
        });
        if (data?.session_token) await setToken(data.session_token);
        // clean hash
        window.history.replaceState(null, "", window.location.pathname);
        await refresh();
        router.replace("/home");
      } catch (e) {
        console.warn("Auth exchange failed", e);
        setProcessing(false);
      }
    })();
  }, [refresh, router]);

  // Already logged in -> go to app
  useEffect(() => {
    if (!loading && user) {
      router.replace("/home");
    }
  }, [loading, user, router]);

  const signIn = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
      const redirectUrl = window.location.origin + "/";
      window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(
        redirectUrl
      )}`;
    } else {
      // Native fallback - open in browser
      const WebBrowser = require("expo-web-browser");
      const url = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(
        (process.env.EXPO_PUBLIC_BACKEND_URL || "") + "/"
      )}`;
      WebBrowser.openBrowserAsync(url);
    }
  };

  if (loading || processing) {
    return (
      <View style={styles.loading} testID="login-loading">
        <ActivityIndicator size="large" color={colors.brass} />
        <Text style={styles.loadingText}>
          {processing ? "Autenticando…" : "Cargando…"}
        </Text>
      </View>
    );
  }

  return (
    <ImageBackground
      source={{
        uri: "https://images.pexels.com/photos/30989203/pexels-photo-30989203.jpeg",
      }}
      style={styles.container}
      imageStyle={{ opacity: 0.22 }}
      testID="login-screen"
    >
      <View style={styles.overlay} />

      <View style={styles.header}>
        <Logo size="lg" />
        <View style={styles.divider} />
      </View>

      <View style={styles.hero}>
        <Text style={styles.title}>Descubre tu próximo libro</Text>
        <Text style={styles.subtitle}>
          Desliza. Guarda. Escucha el resumen en un minuto.
        </Text>
      </View>

      <View style={styles.features}>
        <Feature icon="heart" label="Desliza → Favoritos" />
        <Feature icon="close" label="Desliza ← Descartar" />
        <Feature icon="arrow-up" label="↑ Ficha técnica" />
        <Feature icon="arrow-down" label="↓ Resumen 1 min" />
      </View>

      <TouchableOpacity
        testID="btn-google-login"
        style={styles.loginBtn}
        onPress={signIn}
        activeOpacity={0.85}
      >
        <Ionicons name="logo-google" size={20} color={colors.bgBase} />
        <Text style={styles.loginText}>Entrar con Google</Text>
      </TouchableOpacity>

      <TouchableOpacity
        testID="btn-guest-login"
        style={styles.guestBtn}
        onPress={async () => {
          setProcessing(true);
          try {
            const data = await api<any>("/auth/guest", { method: "POST" });
            if (data?.session_token) await setToken(data.session_token);
            await refresh();
            router.replace("/home");
          } catch (e) {
            console.warn("Guest login failed", e);
            setProcessing(false);
          }
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="eye-outline" size={18} color={colors.brass} />
        <Text style={styles.guestText}>Entrar como invitado</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>Un click · Una historia</Text>
    </ImageBackground>
  );
}

function Feature({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={styles.feature}>
      <Ionicons name={icon} size={16} color={colors.brass} />
      <Text style={styles.featureText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
    paddingHorizontal: 28,
    justifyContent: "space-between",
    paddingTop: 70,
    paddingBottom: 50,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(18,14,10,0.75)",
  },
  loading: {
    flex: 1,
    backgroundColor: colors.bgBase,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    color: colors.textOnDarkMuted,
    letterSpacing: 2,
    fontSize: 13,
  },
  header: { alignItems: "center" },
  gearRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  brand: {
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    color: colors.brass,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 6,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  divider: {
    marginTop: 10,
    width: 120,
    height: 1,
    backgroundColor: colors.brass,
    opacity: 0.5,
  },
  hero: { alignItems: "center", paddingHorizontal: 8 },
  title: {
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 30,
    color: colors.textOnDark,
    textAlign: "center",
    fontWeight: "800",
    lineHeight: 38,
  },
  subtitle: {
    marginTop: 14,
    color: colors.textOnDarkMuted,
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
  },
  features: {
    backgroundColor: "rgba(34,26,19,0.9)",
    borderWidth: 1,
    borderColor: colors.brassSoft,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 10,
  },
  feature: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureText: { color: colors.textOnDark, fontSize: 14, letterSpacing: 0.3 },
  loginBtn: {
    backgroundColor: colors.brass,
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    shadowColor: colors.brass,
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.4)",
  },
  loginText: {
    color: colors.bgBase,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  guestBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.brassSoft,
    backgroundColor: "rgba(34,26,19,0.6)",
  },
  guestText: {
    color: colors.brass,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  footer: {
    textAlign: "center",
    color: colors.textOnDarkMuted,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
});
