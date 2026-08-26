import React from "react";
import { View, Text, StyleSheet, Platform, Image } from "react-native";
import { colors } from "../theme";

type Size = "sm" | "md" | "lg";

const sizeMap: Record<Size, { font: number; icon: number; gap: number; glow: number }> = {
  sm: { font: 18, icon: 18, gap: 0, glow: 6 },
  md: { font: 38, icon: 34, gap: 0, glow: 14 },
  lg: { font: 46, icon: 42, gap: 0, glow: 18 },
};

// Proporción real del PNG (book-heart-icon.png): 2162x1952.
// Se usa para que el icono nunca se deforme, sea cual sea su tamaño.
const ICON_RATIO = 2162 / 1952;

export default function Logo({ size = "md" }: { size?: Size }) {
  const s = sizeMap[size];
  return (
    <View style={[styles.row, { gap: s.gap }]} testID="app-logo">
      {/*
        allowFontScaling={false} en las dos palabras del logo: es un
        logotipo/marca, no texto de lectura que el usuario deba poder
        agrandar por accesibilidad. Sin esto, el tamaño de letra del
        sistema lo escalaba — y como el "Normal" de fábrica no está
        calibrado exactamente igual entre Android puro (Pixel) y
        capas de fabricante (EMUI/Magic UI de Huawei/Honor), el logo
        se veía notablemente más grande ahí, empujando el resto de la
        pantalla y forzando scroll donde antes no lo había.
      */}
      <Text allowFontScaling={false} style={[styles.cyan, { fontSize: s.font, textShadowColor: colors.brass, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: s.glow }]}>Book</Text>
      <Text allowFontScaling={false} style={[styles.purple, { fontSize: s.font, textShadowColor: colors.copper, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: s.glow }]}>Vibes</Text>
      {/*
        Icono del libro+corazón: antes eran dos <Ionicons name="book"> superpuestos
        (el libro genérico de la librería de iconos). Ahora es una sola imagen real
        del logo (mismo PNG que en el onboarding "Elige tu vibe"), en tamaño FIJO
        en puntos según `size` (sm/md/lg) — igual que el texto, no en porcentaje de
        pantalla — para que se vea exactamente igual en cualquier dispositivo.
      */}
      <Image
        source={require("../../assets/images/book-heart-icon.png")}
        style={{
          width: s.icon + 4,
          height: (s.icon + 4) / ICON_RATIO,
          marginLeft: 14,
        }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  cyan: { color: colors.brass, fontWeight: "900", letterSpacing: 0.5, fontFamily: Platform.select({ ios: "Helvetica", android: "sans-serif-black", default: "system-ui" }) },
  purple: { color: colors.copper, fontWeight: "900", letterSpacing: 0.5, fontFamily: Platform.select({ ios: "Helvetica", android: "sans-serif-black", default: "system-ui" }) },
});