import React, { useEffect } from "react";
import { Tabs } from "expo-router";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../src/providers/AuthProvider";
import { colors } from "../../src/theme";

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brass} />
      </View>
    );
  }

  // Antes: paddingBottom: 12 fijo. Eso solo deja sitio de sobra en
  // dispositivos con barra de gestos (donde insets.bottom es pequeño),
  // pero en dispositivos con barra de navegación clásica (botones físicos
  // de atrás/inicio/recientes) insets.bottom es mucho más grande, y esos
  // 12px fijos no alcanzan — el resultado es que la barra del sistema se
  // dibuja ENCIMA de los labels de los tabs (DESCUBRIR, FAVORITOS, etc.),
  // tapándolos parcialmente, como se vio en las capturas de varios
  // dispositivos de prueba.
  //
  // Ahora: sumamos insets.bottom real al padding base. En dispositivos
  // con gestos, insets.bottom suele ser pequeño (~10-20), así que el
  // resultado es casi idéntico a antes. En dispositivos con barra clásica,
  // insets.bottom es mayor (~24-48 según el fabricante), y ese espacio
  // extra empuja el contenido del tab bar hacia arriba lo justo para
  // quedar siempre por encima de los botones del sistema, sin solape.
  const tabBarHeight = 70 + insets.bottom;
  const tabBarPaddingBottom = 12 + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgSurface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: tabBarPaddingBottom,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.brass,
        tabBarInactiveTintColor: colors.textOnDarkMuted,
        tabBarLabelStyle: { fontSize: 11, letterSpacing: 1.2, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "INICIO",
          tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: "DESCUBRIR",
          tabBarIcon: ({ color, size }) => <Ionicons name="albums" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: "FAVORITOS",
          tabBarIcon: ({ color, size }) => <Ionicons name="heart" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "AJUSTES",
          tabBarIcon: ({ color, size }) => <Ionicons name="cog" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bgBase },
});