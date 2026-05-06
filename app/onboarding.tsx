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

const { width } = Dimensions.get("window");

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
        <SlideGestures />
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

/** Slide 1 — Hook: glowing 60s timer */
function SlideTimer() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);
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
    </SlideContainer>
  );
}

/** Slide 2 — Gestures D-pad */
function SlideGestures() {
  return (
    <SlideContainer
      title="DESLIZA"
      titleColor={colors.copper}
      highlight={
        <View style={{ alignItems: "center", gap: 4 }}>
          <Text style={styles.highlight}>4 gestos. 4 superpoderes.</Text>
          <View style={styles.gestureLegend}>
            <Legend symbol="←" color={colors.iron} text="pasa" />
            <Legend symbol="→" color={colors.verdigris} text="favorito" />
            <Legend symbol="↑" color={colors.copper} text="ficha" />
            <Legend symbol="↓" color={colors.copper} text="resumen" />
          </View>
        </View>
      }
    >
      {/* Arrows around the central card */}
      <View style={styles.dpad}>
        <ArrowBtn icon="chevron-up" color={colors.copper} pos={{ top: 0, alignSelf: "center" }} />
        <ArrowBtn icon="chevron-down" color={colors.copper} pos={{ bottom: 0, alignSelf: "center" }} />
        <ArrowBtn icon="close" color={colors.iron} pos={{ left: 0, top: "50%", marginTop: -28 }} big />
        <ArrowBtn icon="heart" color={colors.verdigris} pos={{ right: 0, top: "50%", marginTop: -28 }} big />
        {/* Center mini-card */}
        <View style={styles.miniCard}>
          <Ionicons name="book" size={36} color={colors.brass} />
        </View>
      </View>
    </SlideContainer>
  );
}

/** Slide 3 — Author chat */
function SlideAuthor() {
  const fadeIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fadeIn, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.delay(400),
        Animated.timing(fadeIn, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ])
    ).start();
  }, [fadeIn]);

  return (
    <SlideContainer
      title="HABLA CON EL AUTOR"
      titleColor={colors.copper}
      highlight={
        <Text style={styles.highlight}>
          <Text style={[styles.highlightStrong, { color: colors.gold }]}>Premium</Text> · IA que personifica al autor
        </Text>
      }
    >
      <View style={styles.authorWrap}>
        <View style={styles.authorAvatar}>
          <Ionicons name="person" size={62} color={colors.copper} />
          <View style={styles.authorPremiumBadge}>
            <Ionicons name="diamond" size={14} color={colors.bgBase} />
          </View>
        </View>
        <View style={styles.bubbleAssistant}>
          <Text style={styles.bubbleText}>"Tu pregunta…"</Text>
        </View>
        <Animated.View style={[styles.bubbleUser, { opacity: fadeIn }]}>
          <Ionicons name="sparkles" size={14} color={colors.bgBase} />
        </Animated.View>
      </View>
    </SlideContainer>
  );
}

/* ---------- HELPERS ---------- */

function ArrowBtn({
  icon,
  color,
  pos,
  big,
}: {
  icon: any;
  color: string;
  pos: any;
  big?: boolean;
}) {
  const size = big ? 56 : 48;
  return (
    <View
      style={[
        styles.arrowBtn,
        pos,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          shadowColor: color,
        },
      ]}
    >
      <Ionicons name={icon} size={big ? 28 : 22} color={color} />
    </View>
  );
}

function Legend({ symbol, color, text }: { symbol: string; color: string; text: string }) {
  return (
    <View style={styles.legendItem}>
      <Text style={[styles.legendSymbol, { color }]}>{symbol}</Text>
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

/* ---------- STYLES ---------- */

const HERO = 280;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  skipBtn: { position: "absolute", right: 18, zIndex: 30, padding: 6 },
  skipText: { color: colors.textOnDarkMuted, fontSize: 13, letterSpacing: 1 },
  slide: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  heroWrap: {
    width: HERO,
    height: HERO,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 60,
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

  /* Slide 2 — Gestures */
  dpad: {
    width: HERO,
    height: HERO,
    position: "relative",
  },
  miniCard: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 90,
    height: 130,
    marginTop: -65,
    marginLeft: -45,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.brass,
    backgroundColor: colors.bgSurface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.brass,
    shadowRadius: 20,
    shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  arrowBtn: {
    position: "absolute",
    borderWidth: 2,
    backgroundColor: colors.bgSurface,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.7,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  gestureLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: 8,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendSymbol: { fontSize: 14, fontWeight: "900" },
  legendText: { color: colors.textOnDarkMuted, fontSize: 12, fontWeight: "600" },

  /* Slide 3 — Author */
  authorWrap: { width: HERO, height: HERO, alignItems: "center", justifyContent: "center" },
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
    left: 18,
    top: 18,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: "rgba(176,38,255,0.45)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { color: colors.textOnDark, fontSize: 13, fontStyle: "italic" },
  bubbleUser: {
    position: "absolute",
    right: 22,
    bottom: 24,
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
