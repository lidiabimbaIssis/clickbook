import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, Platform, Keyboard, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../src/theme";

const LOGO = "https://customer-assets.emergentagent.com/job_book-swipe-1/artifacts/3rm492li_grok_image_1776093602296_edit_926181258950751.jpg";

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
      <View style={[styles.container, { paddingTop: insets.top + 24 }]} testID="home-screen">
        <Image source={{ uri: LOGO }} style={styles.logo} resizeMode="cover" />
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 22, alignItems: "stretch", gap: 18 },
  logo: {
    width: "100%",
    height: 130,
    alignSelf: "center",
    marginTop: 4,
    borderRadius: 14,
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
});
