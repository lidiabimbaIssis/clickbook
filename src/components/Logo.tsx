import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";

type Size = "sm" | "md" | "lg";

const sizeMap: Record<Size, { font: number; icon: number; gap: number; glow: number }> = {
  sm: { font: 18, icon: 18, gap: 4, glow: 6 },
  md: { font: 30, icon: 28, gap: 6, glow: 12 },
  lg: { font: 46, icon: 42, gap: 8, glow: 18 },
};

export default function Logo({ size = "md" }: { size?: Size }) {
  const s = sizeMap[size];

  return (
    <View style={[styles.row, { gap: s.gap }]} testID="app-logo">
      <Text
        style={[
          styles.cyan,
          {
            fontSize: s.font,
            textShadowColor: colors.brass,
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: s.glow,
          },
        ]}
      >
        Click
      </Text>
      <Text
        style={[
          styles.purple,
          {
            fontSize: s.font,
            textShadowColor: colors.copper,
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: s.glow,
          },
        ]}
      >
        Book
      </Text>

      {/* Book icon with chromatic split: purple base + cyan offset overlay */}
      <View style={[styles.iconWrap, { width: s.icon + 4, height: s.icon + 4, marginLeft: s.gap }]}>
        <Ionicons
          name="book"
          size={s.icon}
          color={colors.copper}
          style={{
            position: "absolute",
            top: 2,
            left: 2,
            ...(Platform.OS === "web"
              ? { filter: `drop-shadow(0 0 ${s.glow}px ${colors.copper})` as any }
              : {}),
          }}
        />
        <Ionicons
          name="book"
          size={s.icon}
          color={colors.brass}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            opacity: 0.85,
            ...(Platform.OS === "web"
              ? { filter: `drop-shadow(0 0 ${s.glow}px ${colors.brass})` as any }
              : {}),
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  cyan: {
    color: colors.brass,
    fontWeight: "900",
    letterSpacing: 0.5,
    fontFamily: Platform.select({ ios: "Helvetica", android: "sans-serif-black", default: "system-ui" }),
  },
  purple: {
    color: colors.copper,
    fontWeight: "900",
    letterSpacing: 0.5,
    fontFamily: Platform.select({ ios: "Helvetica", android: "sans-serif-black", default: "system-ui" }),
  },
  iconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
});
