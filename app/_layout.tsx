import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, ActivityIndicator } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import { AuthProvider, useAuth } from "../src/providers/AuthProvider";
import { colors } from "../src/theme";
import Purchases from "react-native-purchases";
// Mantén el splash hasta que las fuentes carguen
SplashScreen.preventAutoHideAsync().catch(() => {});
// Inicializa RevenueCat una sola vez, al arrancar la app. Clave PÚBLICA de
// PRODUCCIÓN de la app "BookVibes (Play Store)" en RevenueCat (proyecto
// 86d45ddf). Sustituye a la clave de test usada durante el desarrollo.
Purchases.configure({ apiKey: "goog_XYySCsTPFMckLwLJgMzjRStYsob" });

// Pantalla de carga compartida: se usa tanto mientras cargan las fuentes
// como mientras AuthProvider todavía no sabe si hay una sesión guardada
// (llamada a /auth/me en curso). Antes solo se esperaba a las fuentes,
// así que el Stack montaba la ruta de login (index) ANTES de saber si
// había que redirigir a home — de ahí el salto de un segundo que se
// veía cada vez que se abría la app ya logueado.
function LoadingScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bgBase,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ActivityIndicator size="large" color={colors.brass} />
    </View>
  );
}

// Vive DENTRO de <AuthProvider>, así que puede leer `loading` del
// contexto de auth (cosa que RootLayout no puede hacer directamente).
// Mientras fontsLoaded sea false O authLoading sea true, se muestra
// LoadingScreen en vez de montar el <Stack> — así la pantalla de login
// (ruta inicial) nunca llega a pintarse mientras todavía se está
// comprobando si existe una sesión guardada. El splash nativo tampoco
// se oculta hasta que las dos condiciones estén resueltas.
function AppGate({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { loading: authLoading } = useAuth();

  useEffect(() => {
    if (fontsLoaded && !authLoading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, authLoading]);

  if (!fontsLoaded || authLoading) {
    return <LoadingScreen />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bgBase },
      }}
    >
      {/*
        Sin esto, cada vez que se entra al grupo de pestañas (home) desde
        el <Redirect> de login, onboarding, Google o invitado, el Stack
        aplica su animación por defecto de "deslizar" — eso es lo que se
        veía como si pasara una diapositiva, con el splash/spinner
        reapareciendo un instante en medio. animation:"none" hace que
        entrar a home sea un corte directo, no un deslizamiento. Las
        demás pantallas (discover, author-chat, etc.) conservan su
        animación normal, esto solo afecta a la entrada al grupo (tabs).
      */}
      <Stack.Screen
        name="(tabs)"
        options={{
          animation: "none",
          // <Redirect> navega por debajo con un "replace", y ese tipo de
          // navegación tiene su PROPIO ajuste de animación
          // (animationTypeForReplace), independiente de `animation`.
          // Por defecto sigue animando como un push (deslizar desde la
          // derecha) aunque animation sea "none" — de ahí que el cambio
          // anterior no se notara. "pop" evita ese deslizamiento.
          animationTypeForReplace: "pop",
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  // Precarga las fuentes de Ionicons para que se vean en el build nativo
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bgBase }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <AppGate fontsLoaded={!!fontsLoaded} />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}