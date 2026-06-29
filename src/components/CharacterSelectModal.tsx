import React, { useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import { api } from "../lib/api";

type Character = {
  nombre: string;
  descripcion: string;
  genero: "masculino" | "femenino" | "desconocido";
};

// Colores de avatar por género — coherentes con la paleta neón ya
// existente (brass=cian, copper=púrpura). "desconocido" usa un tono
// neutro intermedio para no asumir nada sin pista clara de la sinopsis.
function avatarColors(genero: Character["genero"]) {
  if (genero === "femenino") return { fg: colors.copper, bg: "rgba(176,38,255,0.12)", border: "rgba(176,38,255,0.3)" };
  if (genero === "masculino") return { fg: colors.brass, bg: "rgba(0,240,255,0.12)", border: "rgba(0,240,255,0.3)" };
  return { fg: colors.textOnDarkMuted, bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.15)" };
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
  // character = null significa "modo narrador genérico" (no ficción o sin personajes detectados)
  onSelect: (character: string | null) => void;
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
        // Si no hay personajes (no ficción o sinopsis sin nombres), no
        // tiene sentido mostrar un modal vacío preguntando "¿con quién
        // quieres hablar?" — se entra directo al modo narrador genérico,
        // sin fricción para el usuario.
        if (list.length === 0) {
          onSelect(null);
        }
      } catch (e) {
        console.warn("characters fetch failed", e);
        onSelect(null); // ante cualquier fallo, narrador genérico es la opción más segura
      } finally {
        setLoading(false);
        setCheckedOnce(true);
      }
    })();
  }, [visible, bookId]);

  // Mientras se decide (cargando, o ya se resolvió que es modo narrador
  // y se navegó solo), no se pinta nada visible del modal — evita un
  // parpadeo de modal vacío antes de saltar al chat directamente.
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
            <View style={styles.list}>
              {characters.map((c) => {
                const cl = avatarColors(c.genero);
                return (
                  <TouchableOpacity
                    key={c.nombre}
                    style={[styles.row, { borderColor: cl.border, backgroundColor: cl.bg }]}
                    activeOpacity={0.8}
                    onPress={() => onSelect(c.nombre)}
                    testID={`character-${c.nombre}`}
                  >
                    <View style={[styles.avatar, { backgroundColor: cl.bg }]}>
                      <Ionicons name="person" size={22} color={cl.fg} />
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
  rowName: { color: colors.textOnDark, fontSize: 14, fontWeight: "700" },
  rowDesc: { color: colors.textOnDarkMuted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  disclaimer: { color: colors.textOnDarkMuted, fontSize: 10, textAlign: "center", marginTop: 18, fontStyle: "italic" },
});