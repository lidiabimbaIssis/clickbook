import React, { useState, useCallback, useRef, useMemo } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform, Keyboard, KeyboardAvoidingView, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../src/theme";
import Logo from "../../src/components/Logo";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

// Frases del título de la tarjeta principal — "NO SÉ QUÉ LEER" se repite
// varias veces en el array para que salga con más frecuencia que el
// resto al elegir al azar, sin necesitar lógica de pesos aparte.
const HERO_TITLES = [
  "NO SÉ QUÉ LEER",
  "NO SÉ QUÉ LEER",
  "NO SÉ QUÉ LEER",
  "¿Y AHORA QUÉ LEO?",
  "TU SIGUIENTE HISTORIA",
  "¿BLOQUEO LECTOR?",
  "NECESITO UN LIBRO",
  "ALGO QUE ME ATRAPE",
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
        <Text style={{ fontSize, fontWeight, letterSpacing, backgroundColor: "transparent" }}>
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
        <Text style={{ fontSize, fontWeight, letterSpacing, opacity: 0 }}>{text}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

function GradientIcon({ name, size }: { name: any; size: number }) {
  return (
    <MaskedView
      style={{ width: size, height: size }}
      maskElement={<Ionicons name={name} size={size} color="black" />}
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

  // Se elige una sola vez por montaje de pantalla (no en cada render), así
  // el título no cambia solo mientras el usuario está mirando la pantalla.
  const heroTitle = useMemo(() => HERO_TITLES[Math.floor(Math.random() * HERO_TITLES.length)], []);

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
      {/* Mismo patrón que character-chat.tsx (que sí funciona bien con el
          teclado): el buscador va FUERA del ScrollView, como una fila fija
          pegada al fondo de KeyboardAvoidingView — nunca hace falta hacer
          scroll para verlo, siempre está anclado justo encima del teclado.
          Antes estaba dentro del ScrollView empujado con un flex:1, que es
          lo que lo tapaba. */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.container, { paddingTop: insets.top + 12 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} testID="home-screen">
          <View style={styles.content}>
            <View style={styles.logoBox}><Logo size="md" /></View>
            <Text style={styles.tagline}>SIENTE LO QUE LEES</Text>

            {/*
              Tarjeta principal "Bloqueo de lector" — reemplaza al antiguo
              buscador como primer elemento interactivo. Borde en degradado
              (técnica: LinearGradient exterior con 1.5px de padding +
              View interior con fondo sólido, así el degradado solo se ve
              como borde fino). Título aleatorio (más peso a "NO SÉ QUÉ
              LEER"), subtítulo fijo "SORPRÉNDEME" en degradado de texto.
              Toda la tarjeta es un único botón que lanza modo random,
              igual que hacía antes el botón "Sorpréndeme" aparte.
            */}
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
                  <Text style={styles.heroTitle}>{heroTitle}</Text>
                  <GradientWord text="SORPRÉNDEME" fontSize={13} fontWeight="900" letterSpacing={2.5} />
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/*
              Tarjeta Novedades — mismo lenguaje visual (borde degradado)
              que la tarjeta hero, pero en formato fila compacta con
              icono + textos + flecha, como una fila de navegación.
              Subtítulo honesto: son libros recién añadidos/en preventa,
              no necesariamente "virales", así que no se afirma eso.
            */}
            <TouchableOpacity
              testID="btn-novedades"
              onPress={() => router.replace({ pathname: "/discover", params: { mode: "novedades", t: Date.now() } })}
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
                    <Text style={styles.novedadesTitle}>NOVEDADES</Text>
                    <Text style={styles.novedadesSub}>Historias recién llegadas</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textOnDarkMuted} />
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/*
              Label "SEGÚN TUS VIBES" con corazones rosas pequeños a cada
              lado y líneas divisorias, igual que en la referencia visual.
            */}
            <View style={styles.vibesLabelRow}>
              <View style={styles.vibesLabelLine} />
              <Ionicons name="heart" size={9} color={colors.iron} style={{ opacity: 0.85 }} />
              <Text style={styles.sectionLabel}>SEGÚN TUS VIBES</Text>
              <Ionicons name="heart" size={9} color={colors.iron} style={{ opacity: 0.85 }} />
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
                  <Text style={styles.moodEmoji}>{m.emoji}</Text>
                  <Text style={styles.moodText}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>

        {/*
          Buscador — antes era el primer elemento de la pantalla, ahora va
          fijo al fondo, fuera del ScrollView (ver comentario de arriba).
          Misma funcionalidad exacta que antes (texto, borrar, micrófono,
          submit) — placeholder invita a buscar por trope en vez de sugerir
          título/autor, que con ~1.600 libros es poco probable que se
          encuentren tal cual.
        */}
        <View style={[styles.searchSection, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.searchLabelRow}>
            <View style={styles.searchLabelLine} />
            <Text style={styles.searchLabel}>¿TIENES UN TÍTULO O TROPE EN MENTE?</Text>
            <View style={styles.searchLabelLine} />
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.brass} />
            <TextInput
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
            {q.length > 0 && (<TouchableOpacity onPress={() => setQ("")}><Ionicons name="close-circle" size={16} color={colors.textOnDarkMuted} /></TouchableOpacity>)}
            <TouchableOpacity testID="btn-mic" onPress={onMicPress} style={styles.micBtn}>
              <Ionicons
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
  container: { flex: 1, paddingHorizontal: 24 },
  // Antes: flex: 1, justifyContent: "center" — centraba todo el bloque
  // verticalmente dentro del espacio disponible. El problema: al salir el
  // teclado, KeyboardAvoidingView reduce ese espacio y el contenido se
  // recentraba, desplazando el logo hacia arriba aunque no se tocara el
  // buscador. Ahora es un flujo normal de arriba a abajo, sin depender del
  // alto disponible, así que el teclado nunca lo mueve.
  content: { gap: 16 },
  logoBox: { alignItems: "center", justifyContent: "center", marginTop: 20, marginBottom: -4 },
  tagline: { textAlign: "center", color: colors.brass, letterSpacing: 4, fontSize: 10, fontWeight: "400", marginTop: -4, textShadowColor: colors.brass, textShadowRadius: 6 },

  // Borde en degradado: wrapper exterior sin padding propio (el margen
  // entre tarjetas lo da el `gap` del content), LinearGradient con 1.5px
  // de padding que actúa de "borde", y dentro un View con fondo sólido.
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

  moodRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 4 },
  moodChip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: "rgba(176,38,255,0.4)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(176,38,255,0.07)" },
  moodEmoji: { fontSize: 14 },
  moodText: { color: colors.textOnDark, fontSize: 13, fontWeight: "700" },

  // Sección del buscador — ahora fija fuera del ScrollView (ver comentario
  // más arriba), con su propio padding horizontal ya que dejó de heredarlo
  // del contentContainerStyle del ScrollView.
  searchSection: { paddingHorizontal: 24, paddingTop: 4 },
  searchLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 },
  searchLabelLine: { flex: 1, maxWidth: 50, height: 1, backgroundColor: colors.brassSoft },
  searchLabel: { color: colors.textOnDarkMuted, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: "rgba(78,2,122,0.5)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === "web" ? 10 : 8 },
  input: { flex: 1, color: colors.textOnDark, fontSize: 13, outlineWidth: 0 as any },
  micBtn: { padding: 2 },
});