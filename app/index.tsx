import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ImageBackground, Platform } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useRouter, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../src/providers/AuthProvider";
import { api, setToken } from "../src/lib/api";
import { colors } from "../src/theme";
import Logo from "../src/components/Logo";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { GoogleSignin } from "@react-native-google-signin/google-signin";

// Clave fija en AsyncStorage para el ID de dispositivo. A diferencia del
// session_token (que se borra al cerrar sesión), este ID se guarda una
// única vez y sobrevive a cerrar sesión / volver a entrar como invitado
// — solo desaparece si se desinstala la app. Sirve para que el backend
// pueda reconocer "este es el mismo teléfono de antes" y reutilizar la
// misma cuenta invitada en vez de crear una nueva cada vez, evitando así
// que se puedan resetear los límites diarios de audios/hooks solo con
// cerrar sesión y volver a entrar como invitado.
const DEVICE_ID_KEY = "bookvibes_device_id";

async function getOrCreateDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
GoogleSignin.configure({
  webClientId: "322089590785-m18kg46nbvsstgrdo5ctdu0jh1necg55.apps.googleusercontent.com",
});

function GradientWord({
  text,
  fontSize,
  fontWeight = "800",
  fontFamily,
}: {
  text: string;
  fontSize: number;
  fontWeight?: "400" | "600" | "700" | "800" | "900";
  fontFamily?: string;
}) {
  return (
    <MaskedView
      style={{ height: fontSize * 1.2 }}
      maskElement={
        <Text allowFontScaling={false} style={{ fontSize, fontWeight, fontFamily, backgroundColor: "transparent", lineHeight: fontSize * 1.2 }}>
          {text}
        </Text>
      }
    >
      <LinearGradient
        colors={[colors.brass, colors.copper]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ flex: 1 }}
      >
        <Text allowFontScaling={false} style={{ fontSize, fontWeight, fontFamily, opacity: 0, lineHeight: fontSize * 1.2 }}>{text}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

// Logo oficial de Google ("G" multicolor), dibujado con sus 4 colores de
// marca reales — en vez del icono monocromo "logo-google" de Ionicons,
// que queda plano y no se identifica tan rápido como el botón oficial de
// Google que la mayoría de apps usan.
function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12
        c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24
        c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
      />
      <Path
        fill="#FF3D00"
        d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039
        l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
      />
      <Path
        fill="#4CAF50"
        d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36
        c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
      />
      <Path
        fill="#1976D2"
        d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571
        c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24
        C44,22.659,43.862,21.35,43.611,20.083z"
      />
    </Svg>
  );
}


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

  const signIn = async () => {
    setProcessing(true);
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      const idToken = (response as any)?.data?.idToken ?? (response as any)?.idToken;
      if (!idToken) throw new Error("No se recibió idToken de Google");

      const data = await api<any>("/auth/google", {
        method: "POST",
        body: JSON.stringify({ id_token: idToken }),
      });
      if (data?.session_token) await setToken(data.session_token);
      await refresh();
      router.replace("/home");
    } catch (e: any) {
      console.warn("Error en login de Google:", e);
      setProcessing(false);
    }
  };

  if (loading || processing) {
    return (
      <LinearGradient colors={colors.bgGradient} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.loading} testID="login-loading">
        <ActivityIndicator size="large" color={colors.brass} />
        <Text allowFontScaling={false} style={styles.loadingText}>{processing ? "Autenticando…" : "Buscando tu vibe…"}</Text>
      </LinearGradient>
    );
  }

  // Antes esta redirección vivía en un useEffect (`router.replace("/home")`
  // tras montar). Eso obligaba a React a pintar un frame completo de la
  // pantalla de login ANTES de poder ejecutar el efecto y navegar — ese
  // frame de más era el "milisegundo" de login que se veía al abrir la
  // app ya logueado. <Redirect> se resuelve durante el propio render, sin
  // llegar a pintar la UI de login en ningún momento.
  if (user) {
    return <Redirect href="/home" />;
  }

  return (
    <ImageBackground source={{ uri: "https://images.pexels.com/photos/30989203/pexels-photo-30989203.jpeg" }} style={styles.container} imageStyle={{ opacity: 0.22 }} testID="login-screen">
      <LinearGradient
        colors={colors.bgGradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.overlay}
      />
      <View style={styles.header}><Logo size="lg" /><View style={styles.divider} /></View>
      <View style={styles.hero}>
        <Text allowFontScaling={false} style={styles.title}>No es solo leer libros,</Text>
        {/*
          alignItems:"baseline" alinea el texto "es" y el GradientWord
          "vivirlos" por su línea base tipográfica — es la forma más
          robusta de que queden a la misma altura en cualquier dispositivo,
          independientemente de cómo calcule cada uno la height del MaskedView.
        */}
        <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "baseline", marginTop: 2 }}>
          <Text allowFontScaling={false} style={styles.title}>es </Text>
          <GradientWord
            text="vivirlos"
            fontSize={styles.title.fontSize}
            fontWeight={styles.title.fontWeight as any}
            fontFamily={styles.title.fontFamily}
          />
        </View>
      </View>
      <View style={styles.features}>
        <Feature icon="albums" color={colors.brass}>
          <Text allowFontScaling={false} style={styles.featureText}>Desliza ↑ para <Text allowFontScaling={false} style={{ color: colors.brass, fontWeight: "700" }}>explorar</Text></Text>
        </Feature>
        <Feature icon="information-circle" color={colors.copper}>
          <Text allowFontScaling={false} style={styles.featureText}>Pulsa <Text allowFontScaling={false} style={{ color: colors.copper, fontWeight: "700" }}>Info</Text> para ver la ficha</Text>
        </Feature>
        <Feature icon="heart" color={colors.brass}>
          <Text allowFontScaling={false} style={styles.featureText}>Pulsa el <Text allowFontScaling={false} style={{ color: colors.brass, fontWeight: "700" }}>corazón</Text> para guardar</Text>
        </Feature>
        <Feature icon="headset" color={colors.copper}>
          <Text allowFontScaling={false} style={styles.featureText}>Resumen en <Text allowFontScaling={false} style={{ color: colors.copper, fontWeight: "700" }}>audio</Text> · 1 min</Text>
        </Feature>
      </View>

      {/*
        Ambos botones (Google + invitado) van dentro de un único View. El
        contenedor padre usa justifyContent:"space-evenly", que reparte
        espacio entre CADA hijo directo por igual — si los botones fueran
        dos hijos sueltos, ese espaciado automático ganaba siempre a
        cualquier marginTop que les pusiéramos. Agrupándolos en un solo
        bloque, space-evenly solo ve "un hijo" aquí, y la distancia entre
        los dos botones la controla el `gap` de authButtons, no el padre.
      */}
      <View style={styles.authButtons}>
        <TouchableOpacity testID="btn-google-login" onPress={signIn} activeOpacity={0.85} style={styles.googleBtnWrap}>
          <LinearGradient
            colors={[colors.brass, colors.copper]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.googleBtnGradient}
          >
            <GoogleLogo size={20} />
            <Text allowFontScaling={false} style={styles.loginText}>Entrar con Google</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          testID="btn-guest-login"
          onPress={async () => {
            setProcessing(true);
            try {
              // Se manda el device_id persistente junto con la petición —
              // el backend lo usa para reconocer si este dispositivo ya
              // tuvo una cuenta invitada antes y, si es así, reutilizarla
              // en vez de crear una nueva (evita el bug de resetear los
              // límites diarios cerrando y volviendo a entrar como invitado).
              const deviceId = await getOrCreateDeviceId();
              const data = await api<any>("/auth/guest", { method: "POST", body: JSON.stringify({ device_id: deviceId }) });
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
          style={styles.gradientBtnWrap}
        >
          <LinearGradient
            colors={[colors.brass, colors.copper]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientBtnBorder}
          >
            <View style={styles.gradientBtnInner}>
              <Text allowFontScaling={false} style={styles.guestText}>Como invitado</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <Text allowFontScaling={false} style={styles.footer}>
        <Text allowFontScaling={false} style={{ color: colors.brass }}>DESCUBRE</Text>
        <Text allowFontScaling={false} style={styles.footer}> . </Text>
        <Text allowFontScaling={false} style={{ color: colors.copper }}>SIENTE</Text>
        <Text allowFontScaling={false} style={styles.footer}> . </Text>
        <Text allowFontScaling={false} style={{ color: colors.iron }}>VIVE</Text>
      </Text>
    </ImageBackground>
  );
}

function Feature({ icon, children, color }: { icon: any; children: React.ReactNode; color?: string }) {
  return (
    <View style={styles.feature}>
      <Ionicons allowFontScaling={false} name={icon} size={16} color={color || colors.brass} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase, paddingHorizontal: 28, justifyContent: "space-evenly", paddingTop: 70, paddingBottom: 50 },
  overlay: { ...StyleSheet.absoluteFillObject },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 16, color: colors.textOnDarkMuted, letterSpacing: 2, fontSize: 13 },
  header: { alignItems: "center" },
  divider: { marginTop: 10, width: 120, height: 1, backgroundColor: colors.brass, opacity: 0.5 },
  hero: { alignItems: "center", paddingHorizontal: 8 },
  title: { fontFamily: Platform.select({ ios: "Georgia", default: "serif" }), fontSize: 30, color: colors.textOnDark, textAlign: "center", fontWeight: "800", lineHeight: 38 },
  subtitle: { marginTop: 14, color: colors.textOnDarkMuted, textAlign: "center", fontSize: 15, lineHeight: 22 },
  features: { backgroundColor: "rgba(0, 0, 0, 0.33)", borderWidth: 1, borderColor: colors.brassSoft, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18, gap: 10 },
  feature: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureText: { color: colors.textOnDark, fontSize: 14, letterSpacing: 0.3 },

  authButtons: { gap: 8 },

  // Borde en degradado: wrapper sin padding propio + LinearGradient con
  // 1.5px de padding actuando de borde + View interior con fondo oscuro
  // semitransparente (para que se note por encima de la imagen de fondo).
  // Botón Google: relleno SÓLIDO en degradado (sin fondo oscuro interior),
  // para que destaque como acción principal frente al botón invitado, que
  // se queda más discreto (borde fino + fondo oscuro).
  googleBtnWrap: { borderRadius: 999, shadowColor: colors.copper, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 10 },
  googleBtnGradient: { borderRadius: 999, overflow: "hidden", paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  gradientBtnWrap: { borderRadius: 999 },
  gradientBtnBorder: { borderRadius: 999, padding: 1.5 },
  gradientBtnInner: {
    borderRadius: 997.5,
    backgroundColor: "rgba(10,4,20,0.75)",
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loginText: { color: colors.bgBase, fontSize: 16, fontWeight: "800", letterSpacing: 1.5 },
  guestText: { color: colors.textOnDark, fontSize: 14, fontWeight: "700", letterSpacing: 1.5 },
  footer: { textAlign: "center", color: colors.textOnDarkMuted, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" },
});