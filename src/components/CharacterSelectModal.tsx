import React, { useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import { api } from "../lib/api";

type Character = {
  nombre: string;
  descripcion: string;
  genero: "masculino" | "femenino" | "desconocido";
};

// Colores por posición (índice) — independiente del género.
// Ciclo de 5 colores usando la paleta neón de la app:
// cian, morado, rosa, verde, amarillo — y vuelve a empezar.
const POSITION_COLORS = [
  { fg: colors.brass,    bg: "rgba(0,240,255,0.12)",  border: "rgba(0,240,255,0.3)"  },  // cian
  { fg: colors.copper,   bg: "rgba(176,38,255,0.12)", border: "rgba(176,38,255,0.3)" },  // morado
  { fg: colors.iron,     bg: "rgba(255,46,120,0.12)", border: "rgba(255,46,120,0.3)" },  // rosa
  { fg: colors.verdigris,bg: "rgba(0,255,163,0.12)",  border: "rgba(0,255,163,0.3)"  },  // verde
  { fg: colors.gold,     bg: "rgba(255,210,63,0.12)", border: "rgba(255,210,63,0.3)"  },  // amarillo
];

function avatarColor(index: number) {
  return POSITION_COLORS[index % POSITION_COLORS.length];
}

export default function CharacterSelectModal({
  visible,
  bookId,
  bookTitle,
  onClose,
  onSelect,
}: {
  visible: boolean;
  bookId: string;
  bookTitle: string;
  onClose: () => void;
  onSelect: (character: string | null, colorIndex?: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [checkedOnce, setCheckedOnce] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setCheckedOnce(false);
    (async () => {
      try {
        const res = await api<{ characters: Character[] }>(`/books/${bookId}/characters`);
        const list = res?.characters || [];
        setCharacters(list);
        if (list.length === 0) {
          onSelect(null);
        }
      } catch (e) {
        console.warn("characters fetch failed", e);
        onSelect(null);
      } finally {
        setLoading(false);
        setCheckedOnce(true);
      }
    })();
  }, [visible, bookId]);

  if (!visible || (checkedOnce && characters.length === 0)) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} testID="character-select-close">
            <Ionicons name="close" size={22} color={colors.textOnDarkMuted} />
          </TouchableOpacity>

          <View style={styles.iconWrap}>
            <Ionicons name="chatbubbles" size={30} color={colors.brass} />
          </View>
          <Text style={styles.title}>¿Con quién quieres hablar?</Text>
          <Text style={styles.sub} numberOfLines={1}>{bookTitle}</Text>

          {loading ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <ActivityIndicator color={colors.brass} />
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
            <View style={styles.list}>
              {characters.map((c, index) => {
                const cl = avatarColor(index);
                const initial = c.nombre.trim().charAt(0).toUpperCase();
                return (
                  <TouchableOpacity
                    key={c.nombre}
                    style={[styles.row, { borderColor: cl.border, backgroundColor: cl.bg }]}
                    activeOpacity={0.8}
                    onPress={() => onSelect(c.nombre, index)}
                    testID={`character-${c.nombre}`}
                  >
                    <View style={[styles.avatar, { backgroundColor: cl.bg, borderWidth: 1, borderColor: cl.border }]}>
                      <Text style={[styles.avatarInitial, { color: cl.fg }]}>{initial}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowName} numberOfLines={1}>{c.nombre}</Text>
                      <Text style={styles.rowDesc} numberOfLines={2}>{c.descripcion}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textOnDarkMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          )}

          <Text style={styles.disclaimer}>Conversación generada por IA</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center", padding: 20 },
  card: { width: "100%", maxWidth: 360, backgroundColor: colors.bgSurface, borderWidth: 2, borderColor: colors.copper, borderRadius: 22, padding: 24, shadowColor: colors.copper, shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 0 }, elevation: 14 },
  closeBtn: { position: "absolute", top: 12, right: 12, padding: 6, zIndex: 10 },
  iconWrap: { alignItems: "center", marginBottom: 8 },
  title: { color: colors.textOnDark, fontSize: 17, fontWeight: "900", textAlign: "center" },
  sub: { color: colors.textOnDarkMuted, fontSize: 12, textAlign: "center", marginTop: 4, marginBottom: 16 },
  list: { gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 14, padding: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 20, fontWeight: "900" },
  rowName: { color: colors.textOnDark, fontSize: 14, fontWeight: "700" },
  rowDesc: { color: colors.textOnDarkMuted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  disclaimer: { color: colors.textOnDarkMuted, fontSize: 10, textAlign: "center", marginTop: 18, fontStyle: "italic" },
});