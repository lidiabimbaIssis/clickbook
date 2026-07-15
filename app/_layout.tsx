import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, ActivityIndicator } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import { AuthProvider } from "../src/providers/AuthProvider";
import { colors } from "../src/theme";
import Purchases from "react-native-purchases";
// Mantén el splash hasta que las fuentes carguen
SplashScreen.preventAutoHideAsync().catch(() => {});
// Inicializa RevenueCat una sola vez, al arrancar la app. Clave PÚBLICA de
// PRODUCCIÓN de la app "BookVibes (Play Store)" en RevenueCat (proyecto
// 86d45ddf). Sustituye a la clave de test usada durante el desarrollo.
Purchases.configure({ apiKey: "goog_XYySCsTPFMckLwLJgMzjRStYsob" });

export default function RootLayout() {
  // Precarga las fuentes de Ionicons para que se vean en el build nativo
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
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

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bgBase }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bgBase },
            }}
          />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}