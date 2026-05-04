import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../src/theme";

const { width } = Dimensions.get("window");

const SLIDES = [
  {
    image: require("../assets/onboarding/01_hook.png"),
    title: "TU PRÓXIMA AVENTURA",
    titleColor: colors.brass,
    subtitleParts: [
      { text: "Una historia en ", color: colors.textOnDark },
      { text: "60 segundos", color: colors.brass, bold: true },
    ],
    description: "Tu nueva forma de descubrir libros. Para los que van con prisa.",
  },
  {
    image: require("../assets/onboarding/02_gestures.png"),
    title: "DESLIZA, DESCUBRE",
    titleColor: colors.copper,
    subtitleParts: [
      { text: "← pasa  ·  → favorito", color: colors.textOnDark },
    ],
    description: "↑ ficha técnica  ·  ↓ resumen de 1 minuto",
  },
  {
    image: require("../assets/onboarding/03_author.png"),
    title: "HABLA CON EL AUTOR",
    titleColor: colors.copper,
    subtitleParts: [
      { text: "Premium · ", color: colors.gold },
      { text: "IA que personifica al autor", color: colors.textOnDark },
    ],
    description: "Pregúntale lo que quieras. Como si lo tuvieras delante.",
  },
];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const finish = async () => {
    try {
      await AsyncStorage.setItem("clickbook_onboarding_done", "1");
    } catch {}
    router.replace("/");
  };

  const next = () => {
    if (index === SLIDES.length - 1) {
      finish();
    } else {
      const newIdx = index + 1;
      setIndex(newIdx);
      scrollRef.current?.scrollTo({ x: width * newIdx, animated: true });
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / width);
    if (i !== index) setIndex(i);
  };

  const isLast = index === SLIDES.length - 1;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="onboarding-screen">
      <TouchableOpacity onPress={finish} style={[styles.skipBtn, { top: insets.top + 6 }]} testID="btn-skip-onboarding">
        <Text style={styles.skipText}>Saltar</Text>
      </TouchableOpacity>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={[styles.slide, { width }]}>
            <View style={styles.imageWrap}>
              <Image source={s.image} style={styles.image} resizeMode="cover" />
            </View>
            <Text style={[styles.title, { color: s.titleColor }]}>{s.title}</Text>
            <View style={styles.subtitleRow}>
              {s.subtitleParts.map((p: any, j: number) => (
                <Text
                  key={j}
                  style={[
                    styles.subtitle,
                    { color: p.color, fontWeight: p.bold ? "900" : "700" },
                  ]}
                >
                  {p.text}
                </Text>
              ))}
            </View>
            <Text style={styles.description}>{s.description}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === index && styles.dotActive,
                i === index && i === SLIDES.length - 1 && { backgroundColor: colors.copper },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.cta, isLast && styles.ctaLast]}
          onPress={next}
          activeOpacity={0.85}
          testID={isLast ? "btn-finish-onboarding" : "btn-next-onboarding"}
        >
          <Text style={[styles.ctaText, isLast && styles.ctaTextLast]}>
            {isLast ? "EMPEZAR" : "CONTINUAR"}
          </Text>
          <Ionicons
            name={isLast ? "flash" : "chevron-forward"}
            size={18}
            color={isLast ? colors.bgBase : colors.textOnDark}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  skipBtn: { position: "absolute", right: 18, zIndex: 10, padding: 6 },
  skipText: { color: colors.textOnDarkMuted, fontSize: 13, letterSpacing: 1 },
  slide: { alignItems: "center", paddingHorizontal: 28, paddingTop: 30 },
  imageWrap: {
    width: width - 56,
    aspectRatio: 1,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: colors.brass,
    shadowColor: colors.brass,
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
    marginBottom: 30,
  },
  image: { width: "100%", height: "100%" },
  title: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "center",
    ...Platform.select({
      web: { textShadow: `0 0 18px currentColor` as any },
      default: { textShadowColor: "rgba(0,240,255,0.6)", textShadowRadius: 14 },
    }),
  },
  subtitleRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginTop: 12 },
  subtitle: { fontSize: 17, letterSpacing: 0.5 },
  description: {
    color: colors.textOnDarkMuted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 14,
    paddingHorizontal: 16,
    lineHeight: 19,
  },
  bottom: { paddingHorizontal: 28, paddingTop: 8, gap: 18 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.brass, width: 24 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 2,
    borderColor: colors.copper,
    paddingVertical: 16,
    borderRadius: 999,
    backgroundColor: "transparent",
    shadowColor: colors.copper,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  ctaLast: {
    backgroundColor: colors.brass,
    borderColor: colors.brass,
    shadowColor: colors.brass,
  },
  ctaText: { color: colors.textOnDark, fontWeight: "900", letterSpacing: 3, fontSize: 14 },
  ctaTextLast: { color: colors.bgBase },
});
