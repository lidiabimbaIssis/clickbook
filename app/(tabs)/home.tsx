import React, { useState, useCallback } from "react";
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

/**
 * Texto corto con gradiente cian -> púrpura, para usar INLINE
 * (mismo patrón que en login.tsx para la palabra "vivirlos").
 */
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

/**
 * Icono de Ionicons con gradiente cian -> púrpura aplicado.
 * Usa el propio glifo del icono como máscara (igual principio que GradientWord,
 * pero con un <Ionicons> en vez de un <Text>).
 */
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
  // true mientras el micro está escuchando activamente. Solo controla el
  // estilo del icono (para dar feedback visual de "te estoy escuchando"),
  // toda la lógica real de voz vive en los listeners de abajo.
  const [listening, setListening] = useState(false);

  const go = (query?: string) => {
    Keyboard.dismiss();
    if (query && query.trim()) router.push({ pathname: "/discover", params: { q: query.trim() } });
    else router.push("/discover");
  };

  // --- Búsqueda por voz: dictado simple ---
  // Lo que el usuario dice se escribe tal cual en el mismo campo `q`,
  // no hay ninguna interpretación ni IA de por medio.

  // `results` llega cuando el reconocimiento termina (o en cada tanda
  // parcial, si interimResults está activo). Tomamos siempre la mejor
  // transcripción (resultado [0]) y la volcamos en el input.
  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results?.[0]?.transcript;
    if (transcript) setQ(transcript);
  });

  // Si el reconocimiento termina solo (silencio, o el usuario deja de
  // hablar) apagamos el estado visual de "escuchando".
  useSpeechRecognitionEvent("end", () => {
    setListening(false);
  });

  // Cualquier error (permiso denegado, sin conexión si el motor lo
  // requiere, etc.) también apaga el estado visual — así el micro nunca
  // se queda "pegado" en modo escuchando si algo falla.
  useSpeechRecognitionEvent("error", (event) => {
    console.warn("speech recognition error:", event.error, event.message);
    setListening(false);
  });

  const onMicPress = useCallback(async () => {
    // Si ya está escuchando, un segundo toque detiene la escucha
    // manualmente (igual que un botón de "stop").
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }

    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      console.warn("Permiso de micrófono denegado");
      return;
    }

    setQ(""); // limpiamos el campo antes de empezar a dictar, como un input nuevo
    setListening(true);
    ExpoSpeechRecognitionModule.start({
      lang: "es-ES",
      interimResults: true, // muestra texto parcial mientras se habla, no solo al final
      continuous: false, // se detiene sola al detectar que el usuario terminó de hablar
    });
  }, [listening]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.bgBase }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} testID="home-screen">
        <View style={styles.content}>
          <View style={styles.logoBox}><Logo size="lg" /></View>
          <Text style={styles.tagline}>UN CLICK · UNA HISTORIA</Text>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.brass} />
            <TextInput testID="input-search" value={q} onChangeText={setQ} placeholder="Título, autor o género…" placeholderTextColor={colors.textOnDarkMuted} style={styles.input} returnKeyType="search" onSubmitEditing={() => go(q)} />
            {q.length > 0 && (<TouchableOpacity onPress={() => setQ("")}><Ionicons name="close-circle" size={18} color={colors.textOnDarkMuted} /></TouchableOpacity>)}
            {/*
              Micro: SIEMPRE a la derecha del todo (lupa | input | [x] | micro).
              Mientras escucha, el icono cambia de color para dar feedback
              claro de que el micro está activo — sin esto, el usuario no
              sabría si realmente se está grabando algo.
            */}
            <TouchableOpacity testID="btn-mic" onPress={onMicPress} style={styles.micBtn}>
              <Ionicons
                name={listening ? "mic" : "mic-outline"}
                size={20}
                color={listening ? colors.iron : colors.brass}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity testID="btn-search" style={styles.primaryBtn} onPress={() => go(q)} activeOpacity={0.85}>
            <Ionicons name="search" size={18} color={colors.bgBase} />
            <Text style={styles.primaryText}>BUSCAR</Text>
          </TouchableOpacity>

          <View style={styles.divider}><View style={styles.line} /><Text style={styles.dividerText}>O BIEN</Text><View style={styles.line} /></View>
          <TouchableOpacity testID="btn-lucky" style={styles.luckyBtn} onPress={() => router.push({ pathname: "/discover", params: { random: "true" } })} activeOpacity={0.85}>
            <GradientIcon name="sparkles" size={18} />
            <GradientWord text="SORPRÉNDEME" fontSize={17} fontWeight="900" letterSpacing={3} />
            <GradientIcon name="sparkles" size={18} />
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>SEGÚN TUS VIBES</Text>
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
              <TouchableOpacity key={m.label} style={styles.moodChip} onPress={() => go(m.q)} testID={`mood-${m.label}`}>
                <Text style={styles.moodEmoji}>{m.emoji}</Text>
                <Text style={styles.moodText}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 22 },
  content: { flex: 1, justifyContent: "center", gap: 18 },
  logoBox: { alignItems: "center", justifyContent: "center", marginTop: 20, marginBottom: 8 },
  tagline: { textAlign: "center", color: colors.brass, letterSpacing: 4, fontSize: 10, fontWeight: "400", marginTop: -4, textShadowColor: colors.brass, textShadowRadius: 6 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.brassSoft, borderRadius: 14, paddingHorizontal: 14, paddingVertical: Platform.OS === "web" ? 12 : 10, marginTop: 12 },
  input: { flex: 1, color: colors.textOnDark, fontSize: 15, outlineWidth: 0 as any },
  // micBtn: sin estilos propios de tamaño/forma — el icono ya tiene su
  // tamaño fijo (size=20) y el gap:10 del searchBox ya lo separa del resto.
  // padding pequeño solo para ampliar el área táctil sin alterar el layout.
  micBtn: { padding: 2 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.brass, paddingVertical: 14, borderRadius: 999, shadowColor: colors.brass, shadowOpacity: 0.7, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  primaryText: { color: colors.bgBase, fontWeight: "900", letterSpacing: 3 },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textOnDarkMuted, letterSpacing: 3, fontSize: 11 },
  luckyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 2, borderColor: colors.copper, paddingVertical: 14, borderRadius: 999, backgroundColor: colors.bgSurface, shadowColor: colors.copper, shadowOpacity: 0.6, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  luckyText: { color: colors.copper, fontWeight: "900", letterSpacing: 3, fontSize: 14 },
  sectionLabel: { color: colors.textOnDarkMuted, fontSize: 10, letterSpacing: 3, fontWeight: "800", textAlign: "center", marginTop: 8, marginBottom: -4 },
  moodRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 4 },
  moodChip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: "rgba(176,38,255,0.4)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(176,38,255,0.07)" },
  moodEmoji: { fontSize: 14 },
  moodText: { color: colors.textOnDark, fontSize: 13, fontWeight: "700" },
});