import React, { forwardRef } from "react";
import { View, Text, Image, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";

export type ShareCardData = {
  title: string;
  author: string;
  coverUrl: string;
  rating?: number;
  hookText?: string;
};

const CARD_W = 540;
const CARD_H = 960;

const ShareCard = forwardRef<View, { data: ShareCardData; onCoverLoad?: () => void }>(({ data, onCoverLoad }, ref) => {
const rating = Math.round(data.rating || 4);
  const hook = (data.hookText || "Una historia en 60 segundos").slice(0, 130);
  const stars = Array.from({ length: 5 }).map((_, i) =>
    i < rating ? "★" : "☆"
  ).join("");

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      {/* Background grid layer (subtle) */}
      <View style={styles.gridA} pointerEvents="none" />
      <View style={styles.gridB} pointerEvents="none" />

      {/* Brand */}
      <View style={styles.brandRow}>
        <Text style={styles.brandCyan}>Click</Text>
        <Text style={styles.brandPurple}>Book</Text>
      </View>
      <Text style={styles.tagline}>UN CLICK · UNA HISTORIA</Text>

      {/* Cover */}
      <View style={styles.coverWrap}>
<Image source={{ uri: data.coverUrl }} style={styles.cover} resizeMode="cover" onLoad={onCoverLoad} />
      </View>

      {/* Title + author + rating */}
      <View style={styles.infoBlock}>
        <Text style={styles.title} numberOfLines={2}>{data.title}</Text>
        <Text style={styles.author} numberOfLines={1}>{data.author}</Text>
        <Text style={styles.stars}>{stars}</Text>
        <Text style={styles.hook} numberOfLines={3}>"{hook}"</Text>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Ionicons name="arrow-up" size={22} color={colors.brass} />
        <Text style={styles.footerText}>DESCÚBRELO EN CLICKBOOK</Text>
      </View>
    </View>
  );
});

ShareCard.displayName = "ShareCard";
export default ShareCard;

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_H,
    backgroundColor: colors.bgBase,
    paddingHorizontal: 40,
    paddingTop: 60,
    paddingBottom: 60,
    overflow: "hidden",
    position: "relative",
  },
  gridA: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  gridB: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(176,38,255,0.04)",
  },
  brandRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  brandCyan: {
    color: colors.brass,
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: 0,
    textShadowColor: colors.brass,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
    fontFamily: Platform.select({ ios: "Helvetica", android: "sans-serif-black", default: "system-ui" }),
  },
  brandPurple: {
    color: colors.copper,
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: 0,
    textShadowColor: colors.copper,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
    fontFamily: Platform.select({ ios: "Helvetica", android: "sans-serif-black", default: "system-ui" }),
  },
  tagline: {
    textAlign: "center",
    color: colors.brass,
    letterSpacing: 6,
    fontSize: 12,
    fontWeight: "400",
    marginTop: 8,
    opacity: 0.85,
  },
  coverWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 30,
    marginBottom: 26,
  },
  cover: {
    width: 360,
    height: 540,
    borderRadius: 14,
    shadowColor: colors.brass,
    shadowOpacity: 0.6,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  infoBlock: {
    alignItems: "center",
    paddingHorizontal: 10,
  },
  title: {
    color: colors.textOnDark,
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 32,
  },
  author: {
    color: colors.brass,
    fontSize: 16,
    fontStyle: "italic",
    marginTop: 8,
    letterSpacing: 1,
  },
  stars: {
    color: colors.gold,
    fontSize: 18,
    letterSpacing: 4,
    marginTop: 10,
  },
  hook: {
    color: colors.copper,
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 14,
    lineHeight: 19,
    paddingHorizontal: 10,
  },
  footer: {
    alignItems: "center",
    marginTop: 14,
  },
  footerText: {
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 4,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 4,
  },
});

export { CARD_W, CARD_H };