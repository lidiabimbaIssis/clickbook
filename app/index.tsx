import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ImageBackground, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../src/providers/AuthProvider";
import { api, setToken } from "../src/lib/api";
import { colors } from "../src/theme";
import Logo from "../src/components/Logo";

export default function LoginScreen() {
  const { user, loading, refresh } = useAuth();
  const router = useRouter();
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const done = await AsyncStorage.getItem("clickbook_onboarding_done");
        if (!done && !user && !loading) { router.replace("/onboarding"); return; }
      } catch {}
    })();
  }, [user, loading, router]);

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
        const data = await api<any>("/auth/session", { method: "POST", body: JSON.stringify({ session_id: sid }) });
        if (data?.session_token) await setToken(data.session_token);
        window.history.replaceState(null, "", window.location.pathname);
        await refresh();
        router.replace("/home");
      } catch (e) { console.warn(e); setProcessing(false); }
    })();
  }, [refresh, router]);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/home");
    }
  }, [loading, user, router]);

  const signIn = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const redirectUrl = window.location.origin + "/";
      window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    } else {
      const WebBrowser = require("expo-web-browser");
      const url = `https://auth.emergentagent.com/?redirect=${encodeURIComponent((process.env.EXPO_PUBLIC_BACKEND_URL || "") + "/")}`;
      WebBrowser.openBrowserAsync(url);
    }
  };

  if (loading || processing) {
    return (
      <View style={styles.loading} testID="login-loading">
        <ActivityIndicator size="large" color={colors.brass} />
        <Text style={styles.loadingText}>{processing ? "Autenticando…" : "Cargando…"}</Text>
      </View>
    );
  }

  return (
    <ImageBackground source={{ uri: "https://images.pexels.com/photos/30989203/pexels-photo-30989203.jpeg" }} style={styles.container} imageStyle={{ opacity: 0.22 }} testID="login-screen">
      <View style={styles.overlay} />
      <View style={styles.header}><Logo size="lg" /><View style={styles.divider} /></View>
      <View style={styles.hero}>
        <Text style={styles.title}>
  No es solo leer libros, es <Text style={{ color: colors.brass }}>vivirlos</Text>
</Text>
      </View>
      <View style={styles.features}>
        
       <Feature icon="albums" color={colors.brass}>
  <Text style={styles.featureText}>Desliza ↑ para <Text style={{ color: colors.brass, fontWeight: "700" }}>explorar</Text></Text>
</Feature>
<Feature icon="information-circle" color={colors.copper}>
  <Text style={styles.featureText}>Pulsa <Text style={{ color: colors.copper, fontWeight: "700" }}>Info</Text> para ver la ficha</Text>
</Feature>
<Feature icon="heart" color={colors.brass}>
  <Text style={styles.featureText}>Pulsa el <Text style={{ color: colors.brass, fontWeight: "700" }}>corazón</Text> para guardar</Text>
</Feature>
<Feature icon="headset" color={colors.copper}>
  <Text style={styles.featureText}>Resumen en <Text style={{ color: colors.copper, fontWeight: "700" }}>audio</Text> · 1 min</Text>
</Feature>
      </View>
      <TouchableOpacity testID="btn-google-login" style={styles.loginBtn} onPress={signIn} activeOpacity={0.85}>
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
          } 
          catch (e) { 
            console.error("Error en login de invitado:", e);
            setProcessing(false);
          }
        }} 
        activeOpacity={0.85}
      >
        <Ionicons name="eye-outline" size={18} color="#B026FF" />
        <Text style={styles.guestText}>Entrar como invitado</Text>
      </TouchableOpacity>

<Text style={styles.footer}>
        <Text style={{ color: "#00F0FF" }}>DESCUBRE</Text>
        <Text style={styles.footer}> . </Text>
        <Text style={{ color: "#B026FF" }}>SIENTE</Text>
        <Text style={styles.footer}> . </Text>
        <Text style={{ color:"#ff07bd"  }}>VIVE</Text>
      </Text>
    </ImageBackground>
  );
}
function Feature({ icon, children, color }: { icon: any; children: React.ReactNode; color?: string }) {
  return (
    <View style={styles.feature}>
      <Ionicons name={icon} size={16} color={color || colors.brass} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase, paddingHorizontal: 28, justifyContent: "space-evenly", paddingTop: 70, paddingBottom: 50 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgb(0, 0, 0)" },
  loading: { flex: 1, backgroundColor: colors.bgBase, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 16, color: colors.textOnDarkMuted, letterSpacing: 2, fontSize: 13 },
  header: { alignItems: "center" },
  divider: { marginTop: 10, width: 120, height: 1, backgroundColor: colors.brass, opacity: 0.5 },
  hero: { alignItems: "center", paddingHorizontal: 8 },
  title: { fontFamily: Platform.select({ ios: "Georgia", default: "serif" }), fontSize: 30, color: colors.textOnDark, textAlign: "center", fontWeight: "800", lineHeight: 38 },
  subtitle: { marginTop: 14, color: colors.textOnDarkMuted, textAlign: "center", fontSize: 15, lineHeight: 22 },
  features: { backgroundColor: "rgba(0, 0, 0, 0.33)", borderWidth: 1, borderColor: colors.brassSoft, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18, gap: 10 },
  feature: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureText: { color: colors.textOnDark, fontSize: 14, letterSpacing: 0.3 },
  loginBtn: { backgroundColor: colors.brass, paddingVertical: 16, borderRadius: 999, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 10, shadowColor: colors.brass, shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 10, borderWidth: 1, borderColor: "rgba(0,0,0,0.4)" },
  loginText: { color: colors.bgBase, fontSize: 16, fontWeight: "800", letterSpacing: 1.5 },
  guestBtn: { marginTop: 12, paddingVertical: 14, borderRadius: 999, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, borderWidth: 1, borderColor:"#B026FF", backgroundColor: "rgba(34,26,19,0.6)" },
  guestText: { color:"#B026FF", fontSize: 14, fontWeight: "700", letterSpacing: 1.5 },
  footer: { textAlign: "center", color: colors.textOnDarkMuted, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" },
});