import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform, Keyboard, KeyboardAvoidingView, ScrollView, Animated, Easing } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../../src/theme";
import { api } from "../../src/lib/api";
import Logo from "../../src/components/Logo";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

const HERO_TITLES = [
  "NO SÉ QUÉ LEER",
  "NO SÉ QUÉ LEER",
  "NO SÉ QUÉ LEER",
  "¿Y AHORA QUÉ LEO?",
  "NUEVA HISTORIA",
  "¿BLOQUEO LECTOR?",
  "NECESITO UN LIBRO",
  "ALGO QUE ME ATRAPE",
  "¡UN LIBRO, YA!",
  "MI PRÓXIMA OBSESIÓN",
];

function GradientWord({
  text,
  fontSize,
  fontWeight = "900",
  letterSpacing,
}: {
  text: string;
  fontSize: number;
  fontWeight?: "400" | "600" | "700" | "800" | "900";
  letterSpacing?: number;
}) {
  return (
    <MaskedView
      style={{ height: fontSize * 1.25 }}
      maskElement={
        <Text allowFontScaling={false} style={{ fontSize, fontWeight, letterSpacing, backgroundColor: "transparent" }}>
          {text}
        </Text>
      }
    >
      <LinearGradient
        colors={[colors.brass, colors.copper]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ flex: 1 }}
      >
        <Text allowFontScaling={false} style={{ fontSize, fontWeight, letterSpacing, opacity: 0 }}>{text}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

function GradientIcon({ name, size }: { name: any; size: number }) {
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

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [listening, setListening] = useState(false);
  const lastVoiceTranscriptRef = useRef("");
  const voiceAutoSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const AUTO_SEARCH_DELAY_MS = 800;

  const heroTitle = useMemo(() => HERO_TITLES[Math.floor(Math.random() * HERO_TITLES.length)], []);

  // Brillo sutil en el botón "Novedades" cuando hay libros nuevos que
  // TODAVÍA NO HAS VISTO — se compara la lista actual de /books/novedades
  // contra los book_id que ya se marcaron como vistos (guardados en
  // AsyncStorage, por dispositivo). Al tocar el botón, se marcan todos
  // los actuales como vistos y el brillo se apaga — solo se reactiva más
  // adelante si aparecen libros nuevos de verdad, con id que aún no está
  // en la lista de "vistos".
  const [hasNovedades, setHasNovedades] = useState(false);
  const [currentNovedadesIds, setCurrentNovedadesIds] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ books: { book_id: string }[] }>("/books/novedades");
        const ids = (res?.books || []).map((b) => b.book_id);
        if (cancelled) return;
        setCurrentNovedadesIds(ids);
        const seenRaw = await AsyncStorage.getItem("seenNovedadesIds");
        const seenIds: string[] = seenRaw ? JSON.parse(seenRaw) : [];
        const hayNuevas = ids.some((id) => !seenIds.includes(id));
        setHasNovedades(hayNuevas);
      } catch {
        // silencioso: sin novedades visibles si falla, no se molesta al usuario
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Al tocar el botón: se marcan como vistos todos los libros que había
  // AHORA MISMO en novedades, fusionándolos con los que ya estuvieran
  // guardados de antes (por si acaso), y se apaga el brillo al instante
  // sin esperar a la navegación.
  const dismissNovedadesGlow = useCallback(async () => {
    if (currentNovedadesIds.length === 0) return;
    setHasNovedades(false);
    try {
      const seenRaw = await AsyncStorage.getItem("seenNovedadesIds");
      const seenIds: string[] = seenRaw ? JSON.parse(seenRaw) : [];
      const merged = Array.from(new Set([...seenIds, ...currentNovedadesIds]));
      await AsyncStorage.setItem("seenNovedadesIds", JSON.stringify(merged));
    } catch {}
  }, [currentNovedadesIds]);

  // Efecto "tinte de color": TODO el botón cicla de color lentamente
  // (azul → morado oscuro → azul), en vez de una franja que se mueve.
  // Nota: la interpolación de COLOR no es compatible con
  // useNativeDriver, así que va con useNativeDriver: false.
  // Ahora con PAUSA: una subida (3s), una bajada (3s) volviendo al
  // estado original, y una pausa de 3s en reposo antes de repetir — no
  // es un bucle sin fin, hace el efecto y descansa.
  const novedadesGlow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!hasNovedades) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(novedadesGlow, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(novedadesGlow, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.delay(3000),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hasNovedades, novedadesGlow]);
  // Simplificado a petición de Lidia: el botón se queda SIEMPRE en
  // negro, sin cambiar de color en ningún momento — ya no hay tinte de
  // fondo. Solo el título "NOVEDADES" recorre un degradado de 3 pasos:
  // blanco (reposo) → azul → morado, y vuelve para atrás al bajar.
  const novedadesTitleColor = novedadesGlow.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [colors.textOnDark, colors.brass, colors.copper],
  });

  const go = (query?: string, isVibe?: boolean) => {
    Keyboard.dismiss();
    if (query && query.trim()) {
      router.replace({
        pathname: "/discover",
        params: { q: query.trim(), t: Date.now(), ...(isVibe ? { vibe: "true" } : {}) },
      });
    } else {
      router.replace({ pathname: "/discover", params: { t: Date.now() } });
    }
  };

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results?.[0]?.transcript;
    if (transcript) {
      setQ(transcript);
      lastVoiceTranscriptRef.current = transcript;
    }
  });

  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    const transcript = lastVoiceTranscriptRef.current.trim();
    if (!transcript) return;
    if (voiceAutoSearchTimerRef.current) clearTimeout(voiceAutoSearchTimerRef.current);
    voiceAutoSearchTimerRef.current = setTimeout(() => {
      go(transcript);
    }, AUTO_SEARCH_DELAY_MS);
  });

  useSpeechRecognitionEvent("error", (event) => {
    console.warn("speech recognition error:", event.error, event.message);
    setListening(false);
  });

  const onMicPress = useCallback(async () => {
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      console.warn("Permiso de micrófono denegado");
      return;
    }
    if (voiceAutoSearchTimerRef.current) {
      clearTimeout(voiceAutoSearchTimerRef.current);
      voiceAutoSearchTimerRef.current = null;
    }
    lastVoiceTranscriptRef.current = "";
    setQ("");
    setListening(true);
    ExpoSpeechRecognitionModule.start({
      lang: "es-ES",
      interimResults: true,
      continuous: false,
    });
  }, [listening]);

  return (
    <LinearGradient
      colors={colors.bgGradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.container, { paddingTop: insets.top + 12 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} testID="home-screen">
          <View style={styles.content}>
            <View style={styles.logoBox}><Logo size="md" /></View>
            <Text allowFontScaling={false} style={styles.tagline}>SIENTE LO QUE LEES</Text>

            <TouchableOpacity
              testID="btn-hero-sorprendeme"
              onPress={() => router.replace({ pathname: "/discover", params: { mode: "random", t: Date.now() } })}
              activeOpacity={0.85}
              style={[styles.gradientBorderWrap, { marginTop: 22 }]}
            >
              <LinearGradient
                colors={[colors.brass, colors.copper]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradientBorder}
              >
                <View style={styles.heroCardInner}>
                  <GradientIcon name="sparkles" size={18} />
                  <View style={{ height: 8 }} />
                  <Text allowFontScaling={false} style={styles.heroTitle} numberOfLines={1} adjustsFontSizeToFit>{heroTitle}</Text>
                  <GradientWord text="SORPRÉNDEME" fontSize={13} fontWeight="900" letterSpacing={2.5} />
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/*
              Brillo sutil cuando hay novedades de verdad ahora mismo
              (ver hasNovedades arriba): todo el botón cicla de color muy
              lentamente. Si no hay novedades, es exactamente el botón
              de siempre, sin nada.
            */}
            <TouchableOpacity
              testID="btn-novedades"
              onPress={() => {
                dismissNovedadesGlow();
                router.replace({ pathname: "/discover", params: { mode: "novedades", t: Date.now() } });
              }}
              activeOpacity={0.85}
              style={styles.gradientBorderWrap}
            >
              <LinearGradient
                colors={[colors.brass, colors.copper]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradientBorder}
              >
                <View style={styles.novedadesInner}>
                  <View style={styles.novedadesIconBox}>
                    <GradientIcon name="flash" size={20} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Animated.Text
                      allowFontScaling={false}
                      style={[styles.novedadesTitle, hasNovedades && { color: novedadesTitleColor }]}
                    >
                      NOVEDADES
                    </Animated.Text>
                    <Text allowFontScaling={false} style={styles.novedadesSub}>Historias recién llegadas</Text>
                  </View>
                  <Ionicons allowFontScaling={false} name="chevron-forward" size={18} color={colors.textOnDarkMuted} />
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.vibesLabelRow}>
              <View style={styles.vibesLabelLine} />
              <Ionicons allowFontScaling={false} name="heart" size={9} color={colors.iron} style={{ opacity: 0.85 }} />
              <Text allowFontScaling={false} style={styles.sectionLabel}>SEGÚN TUS VIBES</Text>
              <Ionicons allowFontScaling={false} name="heart" size={9} color={colors.iron} style={{ opacity: 0.85 }} />
              <View style={styles.vibesLabelLine} />
            </View>
            <View style={styles.moodRow}>
              {[
                { label: "Intenso", emoji: "🔥", q: "Intenso" },
                { label: "Romántico", emoji: "💜", q: "Romántico" },
                { label: "Épico", emoji: "⚔️", q: "Épico" },
                { label: "Ligero", emoji: "☁️", q: "Ligero" },
                { label: "Llorar", emoji: "💧", q: "Llorar" },
                { label: "Reflexionar", emoji: "🤔", q: "Reflexionar" },
                { label: "Aprender", emoji: "🎯", q: "Aprender" },
                { label: "Inspirador", emoji: "✨", q: "Inspirador" },
              ].map((m) => (
                <TouchableOpacity key={m.label} style={styles.moodChip} onPress={() => go(m.q, true)} testID={`mood-${m.label}`}>
                  <Text allowFontScaling={false} style={styles.moodEmoji}>{m.emoji}</Text>
                  <Text allowFontScaling={false} style={styles.moodText}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>

        <View style={[styles.searchSection, { paddingBottom: Math.min(insets.bottom, 24) + 12 }]}>
          <View style={styles.searchLabelRow}>
            <View style={styles.searchLabelLine} />
            <Text allowFontScaling={false} style={styles.searchLabel}>¿TIENES UN TÍTULO O TROPE EN MENTE?</Text>
            <View style={styles.searchLabelLine} />
          </View>
          <View style={styles.searchBox}>
            <Ionicons allowFontScaling={false} name="search" size={16} color={colors.brass} />
            <TextInput
              allowFontScaling={false}
              testID="input-search"
              value={q}
              onChangeText={(text) => {
                setQ(text);
                if (voiceAutoSearchTimerRef.current) {
                  clearTimeout(voiceAutoSearchTimerRef.current);
                  voiceAutoSearchTimerRef.current = null;
                }
              }}
              placeholder="thriller, enemies to lovers, romantasy…"
              placeholderTextColor={colors.textOnDarkMuted}
              style={styles.input}
              returnKeyType="search"
              onSubmitEditing={() => go(q)}
            />
            {q.length > 0 && (<TouchableOpacity onPress={() => setQ("")}><Ionicons allowFontScaling={false} name="close-circle" size={16} color={colors.textOnDarkMuted} /></TouchableOpacity>)}
            <TouchableOpacity testID="btn-mic" onPress={onMicPress} style={styles.micBtn}>
              <Ionicons
                allowFontScaling={false}
                name={listening ? "mic" : "mic-outline"}
                size={17}
                color={listening ? colors.iron : colors.brass}
              />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    gap: 16,
  },
  logoBox: { alignItems: "center", justifyContent: "center", marginTop: 20, marginBottom: -4 },
  tagline: { textAlign: "center", color: colors.brass, letterSpacing: 4, fontSize: 10, fontWeight: "400", marginTop: -4, textShadowColor: colors.brass, textShadowRadius: 6 },

  gradientBorderWrap: { borderRadius: 18, marginTop: 4 },
  gradientBorder: { borderRadius: 18, padding: 1.5 },
  heroCardInner: {
    borderRadius: 16.5,
    backgroundColor: colors.bgSurface,
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  heroTitle: { color: colors.textOnDark, fontSize: 22, fontWeight: "900", letterSpacing: 1, textAlign: "center", marginBottom: 10 },

  novedadesInner: {
    borderRadius: 16.5,
    backgroundColor: colors.bgSurface,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  novedadesIconBox: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.brassSoft, alignItems: "center", justifyContent: "center" },
  novedadesTitle: { color: colors.textOnDark, fontWeight: "900", fontSize: 13, letterSpacing: 1 },
  novedadesSub: { color: colors.textOnDarkMuted, fontSize: 11, marginTop: 2 },

  vibesLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 6, marginBottom: -2 },
  vibesLabelLine: { flex: 1, maxWidth: 40, height: 1, backgroundColor: "rgba(255,46,120,0.25)" },
  sectionLabel: { color: colors.textOnDarkMuted, fontSize: 10, letterSpacing: 3, fontWeight: "800" },

  moodRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 4, marginBottom: 8 },
  moodChip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: "rgba(176,38,255,0.4)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(176,38,255,0.07)" },
  moodEmoji: { fontSize: 14 },
  moodText: { color: colors.textOnDark, fontSize: 13, fontWeight: "700" },

  searchSection: { paddingHorizontal: 24, paddingTop: 22 },
  searchLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 },
  searchLabelLine: { flex: 1, maxWidth: 50, height: 1, backgroundColor: colors.brassSoft },
  searchLabel: { color: colors.textOnDarkMuted, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: "rgba(78,2,122,0.5)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === "web" ? 10 : 8 },
  input: { flex: 1, color: colors.textOnDark, fontSize: 13, outlineWidth: 0 as any },
  micBtn: { padding: 2 },
});