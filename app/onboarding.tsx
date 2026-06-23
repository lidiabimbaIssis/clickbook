import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../src/theme";

const { width, height } = Dimensions.get("window");
const HERO = Math.min(260, height * 0.32);

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
    if (index === 2) {
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

  const isLast = index === 2;

  return (
    <View style={styles.container} testID="onboarding-screen">
      <TouchableOpacity
        onPress={finish}
        style={[styles.skipBtn, { top: insets.top + 14 }]}
        testID="btn-skip-onboarding"
      >
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
        <SlideTimer />
        <SlideVibes />
        <SlideAuthor />
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 22 }]}>
        <View style={styles.dots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
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

/* ---------- SLIDES ---------- */

function SlideContainer({
  children,
  title,
  highlight,
  titleColor,
}: {
  children: React.ReactNode;
  title: string;
  highlight: React.ReactNode;
  titleColor: string;
}) {
  return (
    <View style={[styles.slide, { width }]}>
      <View style={styles.heroWrap}>{children}</View>
      <View style={styles.textBlock}>
        <Text
          style={[
            styles.title,
            {
              color: titleColor,
              ...Platform.select({
                web: { textShadow: `0 0 24px ${titleColor}` as any },
                default: { textShadowColor: titleColor, textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 } },
              }),
            },
          ]}
        >
          {title}
        </Text>
        <View style={styles.highlightWrap}>{highlight}</View>
      </View>
    </View>
  );
}

/** Slide 1 — Hook: glowing 60s timer (con waveform sutil a los lados) */
function SlideTimer() {
  const pulse = useRef(new Animated.Value(0)).current;
  const wave = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(wave, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(wave, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, [pulse, wave]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.95] });

  return (
    <SlideContainer
      title="UNA HISTORIA"
      titleColor={colors.brass}
      highlight={
        <Text style={styles.highlight}>
          en{" "}
          <Text style={[styles.highlightStrong, { color: colors.brass }]}>60 segundos</Text>
        </Text>
      }
    >
      <View style={styles.timerRow}>
        <Waveform animValue={wave} color={colors.brass} side="left" />

        <View style={styles.timerCenter}>
          <Animated.View
            style={[
              styles.timerOuter,
              { transform: [{ scale }], opacity, shadowOpacity: 0.6 },
            ]}
          />
          <View style={styles.timerInner}>
            <Text style={styles.timer60}>60</Text>
            <Text style={styles.timerSec}>SEG</Text>
          </View>
          <View style={styles.timerRing} />
        </View>

        <Waveform animValue={wave} color={colors.brass} side="right" />
      </View>
    </SlideContainer>
  );
}

/** Barras de waveform animadas, decorativas, a un lado del círculo */
function Waveform({
  animValue,
  color,
  side,
}: {
  animValue: Animated.Value;
  color: string;
  side: "left" | "right";
}) {
  const bars = side === "left" ? [10, 18, 26, 16, 8] : [8, 16, 26, 18, 10];

  return (
    <View style={styles.waveformWrap}>
      {bars.map((h, i) => {
        const scaleY = animValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0.5, i % 2 === 0 ? 1.3 : 1],
        });
        return (
          <Animated.View
            key={i}
            style={[
              styles.waveformBar,
              {
                height: h,
                backgroundColor: color,
                shadowColor: color,
                transform: [{ scaleY }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

/** Slide 2 — Vibes: elige tu próximo libro según cómo quieres sentirte */
const VIBES: { label: string; icon: any; color: string }[] = [
  { label: "Épico", icon: "⚡", color: colors.iron },
  { label: "Romántico", icon: "💜", color: colors.copper },
  { label: "Intenso", icon: "🔥", color: colors.gold },
  { label: "Llorar", icon: "💧", color: colors.brass },
  { label: "Inspirador", icon: "✨", color: colors.verdigris },
  { label: "Reflexionar", icon: "🤔", color: colors.copper },
  { label: "Ligero", icon: "☁️", color: colors.brass },
  { label: "Aprender", icon: "🎯", color: colors.verdigris },
]

function SlideVibes() {
  return (
    <SlideContainer
      title="ELIGE TU VIBE"
      titleColor={colors.copper}
      highlight={<Text style={styles.highlight}>Encuentra libros según cómo quieres sentirte.</Text>}
    >
 <View style={styles.vibesGrid}>
  {VIBES.map((v) => (
    <View key={v.label} style={[styles.vibePill, { borderColor: v.color, shadowColor: v.color }]}>
<Text style={{ fontSize: 14 }}>{v.icon}</Text>
      <Text style={[styles.vibePillText, { color: colors.textOnDark }]}>{v.label}</Text>
    </View>
  ))}
</View>

      <View style={styles.vibeHeartWrap}>
        <Ionicons name="book-outline" size={72} color={colors.brass} style={styles.vibeBookIcon} />
        <Ionicons name="heart" size={38} color={colors.copper} style={styles.vibeHeartIcon} />
      </View>
    </SlideContainer>
  );
}

/** Slide 3 — Author chat, con el mismo lenguaje de pulso que el slide 1 */
function SlideAuthor() {
  const pulse = useRef(new Animated.Value(0)).current;
  const sparkle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(sparkle, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(sparkle, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse, sparkle]);

  const avatarScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.95] });
  const sparkleOpacity = sparkle.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const sparkleRotate = sparkle.interpolate({ inputRange: [0, 1], outputRange: ["-12deg", "12deg"] });

  return (
    <SlideContainer
      title="HABLA CON EL AUTOR"
      titleColor={colors.copper}
      highlight={
        <Text style={styles.highlight}>
          <Text style={[styles.highlightStrong, { color: colors.gold }]}>Premium</Text> · una IA inspirada en su obra
        </Text>
      }
    >
      <View style={styles.authorWrap}>
        <Animated.View
          style={[
            styles.authorGlowRing,
            { transform: [{ scale: avatarScale }], opacity: glowOpacity },
          ]}
        />
        <View style={styles.authorAvatar}>
          <Ionicons name="person" size={62} color={colors.copper} />
          <View style={styles.authorPremiumBadge}>
            <Ionicons name="diamond" size={14} color={colors.bgBase} />
          </View>
        </View>
        <View style={styles.bubbleAssistant}>
          <Text style={styles.bubbleText}>"Pregúntame lo que quieras…"</Text>
        </View>
        <Animated.View
          style={[
            styles.bubbleUser,
            { opacity: sparkleOpacity, transform: [{ rotate: sparkleRotate }] },
          ]}
        >
          <Ionicons name="sparkles" size={14} color={colors.bgBase} />
        </Animated.View>
      </View>
    </SlideContainer>
  );
}

/* ---------- STYLES ---------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  skipBtn: { position: "absolute", right: 18, zIndex: 30, padding: 6 },
  skipText: { color: colors.textOnDarkMuted, fontSize: 13, letterSpacing: 1 },
  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 180,
  },
  heroWrap: {
    width: HERO,
    height: HERO,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 36,
  },
  textBlock: { alignItems: "center", paddingHorizontal: 12 },
  title: {
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 3,
    textAlign: "center",
  },
  highlightWrap: { marginTop: 16, alignItems: "center" },
  highlight: { color: colors.textOnDark, fontSize: 16, fontWeight: "600", textAlign: "center" },
  highlightStrong: { fontWeight: "900" },

  /* Slide 1 — Timer */
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: HERO + 70,
  },
  timerCenter: {
    width: HERO,
    height: HERO,
    alignItems: "center",
    justifyContent: "center",
  },
  waveformWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    width: 40,
  },
  waveformBar: {
    width: 4,
    borderRadius: 2,
    shadowRadius: 6,
    shadowOpacity: 0.8,
    shadowOffset: { width: 0, height: 0 },
  },
  timerOuter: {
    position: "absolute",
    width: HERO - 20,
    height: HERO - 20,
    borderRadius: (HERO - 20) / 2,
    borderWidth: 3,
    borderColor: colors.brass,
    shadowColor: colors.brass,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  timerRing: {
    position: "absolute",
    width: HERO - 60,
    height: HERO - 60,
    borderRadius: (HERO - 60) / 2,
    borderWidth: 1,
    borderColor: "rgba(0,240,255,0.25)",
  },
  timerInner: { alignItems: "center", justifyContent: "center" },
  timer60: {
    fontSize: 110,
    fontWeight: "900",
    color: colors.brass,
    letterSpacing: -4,
    ...Platform.select({
      web: { textShadow: `0 0 30px ${colors.brass}` as any },
      default: { textShadowColor: colors.brass, textShadowRadius: 22 },
    }),
  },
  timerSec: {
    fontSize: 14,
    color: colors.copper,
    letterSpacing: 6,
    fontWeight: "900",
    marginTop: -6,
  },

  /* Slide 2 — Vibes */
  vibesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    width: HERO + 60,
  },
  vibePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.bgSurface,
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  vibePillText: { fontSize: 12, fontWeight: "700" },
  vibeHeartWrap: {
    marginTop: 22,
    width: 70,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  vibeBookIcon: {
    ...Platform.select({
      web: { filter: `drop-shadow(0 0 14px ${colors.brass})` as any },
    }),
  },
  vibeHeartIcon: {
    position: "absolute",
    top: -6,
    right: 2,
  },

  /* Slide 3 — Author */
  authorWrap: { width: HERO, height: HERO, alignItems: "center", justifyContent: "center" },
  authorGlowRing: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: colors.copper,
    shadowColor: colors.copper,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  authorAvatar: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 3,
    borderColor: colors.copper,
    backgroundColor: colors.bgSurface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.copper,
    shadowRadius: 30,
    shadowOpacity: 0.7,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  authorPremiumBadge: {
    position: "absolute",
    bottom: 0,
    right: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.bgBase,
  },
  bubbleAssistant: {
    position: "absolute",
    left: 4,
    top: 10,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: "rgba(176,38,255,0.45)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    maxWidth: 190,
  },
  bubbleText: { color: colors.textOnDark, fontSize: 13, fontStyle: "italic" },
  bubbleUser: {
    position: "absolute",
    right: 14,
    bottom: 18,
    backgroundColor: colors.brass,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderBottomRightRadius: 4,
  },

  /* Bottom CTA */
  bottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 28,
    paddingTop: 12,
    gap: 16,
    zIndex: 20,
    backgroundColor: colors.bgBase,
  },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.2)" },
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