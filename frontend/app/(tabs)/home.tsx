import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform, Keyboard, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../src/theme";
import Logo from "../../src/components/Logo";

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [q, setQ] = useState("");

  const go = (query?: string) => {
    Keyboard.dismiss();
    if (query && query.trim()) router.push({ pathname: "/discover", params: { q: query.trim() } });
    else router.push("/discover");
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.bgBase }}>
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]} testID="home-screen">
        <View style={styles.content}>
          <View style={styles.logoBox}>
            <Logo size="lg" />
          </View>
          <Text style={styles.tagline}>UN CLICK · UNA HISTORIA</Text>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.brass} />
            <TextInput
              testID="input-search"
              value={q}
              onChangeText={setQ}
              placeholder="Título, autor o género…"
              placeholderTextColor={colors.textOnDarkMuted}
              style={styles.input}
              returnKeyType="search"
              onSubmitEditing={() => go(q)}
            />
            {q.length > 0 && (
              <TouchableOpacity onPress={() => setQ("")}>
                <Ionicons name="close-circle" size={18} color={colors.textOnDarkMuted} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity testID="btn-search" style={styles.primaryBtn} onPress={() => go(q)} activeOpacity={0.85}>
            <Ionicons name="search" size={18} color={colors.bgBase} />
            <Text style={styles.primaryText}>BUSCAR</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>O BIEN</Text>
            <View style={styles.line} />
          </View>

          <TouchableOpacity testID="btn-lucky" style={styles.luckyBtn} onPress={() => go()} activeOpacity={0.85}>
            <Ionicons name="sparkles" size={18} color={colors.copper} />
            <Text style={styles.luckyText}>VOY A TENER SUERTE</Text>
            <Ionicons name="sparkles" size={18} color={colors.copper} />
          </TouchableOpacity>

          <View style={styles.chipsRow}>
            {["Ciencia ficción", "Novela negra", "Fantasía", "Ensayo", "Biografía", "Poesía"].map((g) => (
              <TouchableOpacity key={g} style={styles.chip} onPress={() => go(g)} testID={`chip-${g}`}>
                <Text style={styles.chipText}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.moodLabel}>¿CÓMO ME SIENTO?</Text>
          <View style={styles.moodRow}>
            {[
              { label: "Para reflexionar", emoji: "🤔", q: "libros que invitan a la reflexión profunda" },
              { label: "Ligero", emoji: "☁️", q: "libros ligeros y entretenidos para desconectar" },
              { label: "Intenso", emoji: "🔥", q: "libros intensos y trepidantes que enganchan" },
              { label: "Romántico", emoji: "💜", q: "novelas románticas envolventes" },
              { label: "Para llorar", emoji: "💧", q: "libros emotivos que conmueven" },
              { label: "Aprender", emoji: "🎯", q: "libros para aprender y crecer" },
            ].map((m) => (
              <TouchableOpacity
                key={m.label}
                style={styles.moodChip}
                onPress={() => go(m.q)}
                testID={`mood-${m.label}`}
              >
                <Text style={styles.moodEmoji}>{m.emoji}</Text>
                <Text style={styles.moodText}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 22 },
  content: { flex: 1, justifyContent: "center", gap: 18 },
  logoBox: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    marginBottom: 8,
  },
  tagline: {
    textAlign: "center",
    color: colors.brass,
    letterSpacing: 6,
    fontSize: 11,
    fontWeight: "800",
    marginTop: -10,
    textShadowColor: colors.brass,
    textShadowRadius: 10,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.brassSoft,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "web" ? 12 : 10,
    marginTop: 12,
  },
  input: { flex: 1, color: colors.textOnDark, fontSize: 15, outlineWidth: 0 as any },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.brass,
    paddingVertical: 14,
    borderRadius: 999,
    shadowColor: colors.brass,
    shadowOpacity: 0.7,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  primaryText: { color: colors.bgBase, fontWeight: "900", letterSpacing: 3 },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textOnDarkMuted, letterSpacing: 3, fontSize: 11 },
  luckyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 2,
    borderColor: colors.copper,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: colors.bgSurface,
    shadowColor: colors.copper,
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  luckyText: { color: colors.copper, fontWeight: "900", letterSpacing: 3, fontSize: 14 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 16 },
  chip: {
    borderWidth: 1,
    borderColor: colors.brassSoft,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(0,240,255,0.08)",
  },
  chipText: { color: colors.brass, fontSize: 12, fontWeight: "700" },
  moodLabel: {
    color: colors.copper,
    fontSize: 11,
    letterSpacing: 3,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 6,
  },
  moodRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginTop: 4,
  },
  moodChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(176,38,255,0.4)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(176,38,255,0.07)",
  },
  moodEmoji: { fontSize: 14 },
  moodText: { color: colors.textOnDark, fontSize: 12, fontWeight: "700" },
});
