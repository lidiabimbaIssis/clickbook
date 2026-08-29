import React, { useEffect } from "react";
import { Tabs } from "expo-router";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { useAuth } from "../../src/providers/AuthProvider";
import { colors } from "../../src/theme";

// Icono de tab con degradado brass→copper cuando está activo (focused),
// y color plano (textOnDarkMuted) cuando no lo está — mismo patrón
// MaskedView+LinearGradient que GradientIcon en home.tsx.
function TabIcon({ name, size, focused }: { name: any; size: number; focused: boolean }) {
  if (!focused) {
    return <Ionicons allowFontScaling={false} name={name} size={size} color={colors.textOnDarkMuted} />;
  }
  return (
    <MaskedView
      style={{ width: size, height: size }}
      maskElement={<Ionicons allowFontScaling={false} name={name} size={size} color="black" />}
    >
      <LinearGradient
        colors={[colors.brass, colors.copper]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width: size, height: size }}
      />
    </MaskedView>
  );
}

// Label de tab con el mismo criterio: degradado cuando está activo, color
// plano cuando no. letterSpacing/fontWeight iguales a tabBarLabelStyle
// para que no salte el tamaño del texto al cambiar de pestaña.
function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  if (!focused) {
    return <Text allowFontScaling={false} style={[styles.label, { color: colors.textOnDarkMuted }]}>{label}</Text>;
  }
  return (
    <MaskedView
      style={{ height: 14 }}
      maskElement={
        <Text allowFontScaling={false} style={[styles.label, { backgroundColor: "transparent" }]}>{label}</Text>
      }
    >
      <LinearGradient
        colors={[colors.brass, colors.copper]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ flex: 1 }}
      >
        <Text allowFontScaling={false} style={[styles.label, { opacity: 0 }]}>{label}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

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
          borderTopColor:"#4E027A",
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: tabBarPaddingBottom,
          paddingTop: 8,
        },
        // tabBarActiveTintColor/tabBarLabelStyle ya no controlan el color
        // directamente — el degradado se aplica dentro de TabIcon/TabLabel
        // según el prop `focused` que da cada tabBarIcon/tabBarLabel.
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "PARA TI",
          tabBarIcon: ({ focused, size }) => <TabIcon name="search" size={size} focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="PARA TI" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: "DESCUBRIR",
          tabBarIcon: ({ focused, size }) => <TabIcon name="albums" size={size} focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="DESCUBRIR" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: "FAVORITOS",
          tabBarIcon: ({ focused, size }) => <TabIcon name="heart" size={size} focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="FAVORITOS" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "AJUSTES",
          tabBarIcon: ({ focused, size }) => <TabIcon name="cog" size={size} focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="AJUSTES" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bgBase },
  label: { fontSize: 11, letterSpacing: 1.2, fontWeight: "700" },
});