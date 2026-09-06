import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { useFonts, Lora_700Bold } from "@expo-google-fonts/lora";
import { colors } from "../theme";

type Size = "sm" | "md" | "lg";

const sizeMap: Record<Size, { font: number; icon: number; gap: number; glow: number }> = {
  sm: { font: 19, icon: 18, gap: 0, glow: 5 },
  md: { font: 38, icon: 34, gap: 0, glow: 10 },
  lg: { font: 47, icon: 42, gap: 0, glow: 14 },
};

// Proporción real del PNG (book-heart-icon.png): 2162x1952.
const ICON_RATIO = 2162 / 1952;

export default function Logo({ size = "md" }: { size?: Size }) {
  const s = sizeMap[size];

  const [fontsLoaded] = useFonts({
    Lora_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <View style={[styles.row, { gap: s.gap }]} testID="app-logo">
      <Text
        allowFontScaling={false}
        style={[styles.word, { fontSize: s.font }]}
      >
        <Text
          style={[
            styles.cyan,
            {
              textShadowColor: colors.brass,
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: s.glow,
            },
          ]}
        >
          Book
        </Text>
        <Text
          style={[
            styles.purple,
            {
              textShadowColor: colors.copper,
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: s.glow,
            },
          ]}
        >
          Vibes
        </Text>
      </Text>

      <Image
        source={require("../../assets/images/book-heart-icon.png")}
        style={{
          width: s.icon + 4,
          height: (s.icon + 4) / ICON_RATIO,
          marginLeft: 12,
        }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  // Fuente fija: Lora Bold. Cálida, editorial, más redondeada que
  // Playfair. "Book" y "Vibes" en el MISMO <Text> como spans de
  // color, para que queden pegados sin hueco entre ambos.
  word: {
    letterSpacing: -0.3,
    includeFontPadding: false,
  },

  cyan: {
    color: colors.brass,
    fontFamily: "Lora_700Bold",
  },

  purple: {
    color: colors.copper,
    fontFamily: "Lora_700Bold",
  },
});