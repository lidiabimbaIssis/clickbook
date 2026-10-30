import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Modal, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { colors } from "../../src/theme";
import { getBest, getLevel, getGameUsage, getSeenIntros, markIntroSeen } from "../../src/lib/games";
import { usePlayGate, GradientButton } from "../../src/components/GameUI";

type Game = {
  id: string;
  emoji: string;
  title: string;
  // Explicación que sale en la ventanita la primera vez que entras.
  rules: string;
  stat: "level" | "best" | null;
  bestLabel?: (n: number) => string;
};

// Menú de la pestaña JUEGOS. Cada juego vive en app/juego/<id>.tsx.
// Debajo de cada uno: el nivel por el que vas (stat "level"), tu mejor
// marca (bestLabel) o nada.
const GAMES: Game[] = [
  { id: "adivina", emoji: "🔎", title: "Adivina el libro", rules: "Te damos una pista y varias portadas. Toca la portada del libro correcto. Si no lo sabes, pide otra pista, pero cada pista te quita un punto. En cada nivel hay más portadas para elegir.", stat: "level" },
  { id: "puzzle", emoji: "🧩", title: "Puzzle de portada", rules: "La portada está desordenada en piezas. Toca dos piezas para cambiarlas de sitio hasta rehacerla. Si te atascas, mantén pulsado el botón para ver la portada. En cada nivel hay más piezas.", stat: "level" },
  { id: "autor", emoji: "✍️", title: "¿Quién lo escribió?", rules: "Te damos el título de un libro y tú eliges quién lo escribió. Para pasar de nivel tienes que acertar casi todos, y en cada nivel hay más autores para elegir.", stat: "level" },
  { id: "antes", emoji: "⏳", title: "¿Cuál salió antes?", rules: "Salen dos libros: toca el que se publicó antes. Un fallo y se acaba la racha. Cuanto más larga es tu racha, más cerca están las fechas.", stat: "best", bestLabel: (n) => `Racha: ${n}` },
  { id: "borrosa", emoji: "🌫️", title: "Portada borrosa", rules: "La portada empieza muy borrosa y se va aclarando. Elige el título cuanto antes: cuanto más borrosa esté cuando aciertes, más puntos. En cada nivel se aclara más deprisa.", stat: "level" },
  { id: "parejas", emoji: "🃏", title: "Parejas de portadas", rules: "Las cartas están boca abajo. Destápalas de dos en dos y encuentra las parejas de portadas iguales. En cada nivel hay más cartas.", stat: "level" },
  { id: "emojis", emoji: "😍", title: "Adivina por emojis", rules: "Un libro contado solo con emojis. ¿Sabes cuál es? Elige el título correcto. En cada nivel hay más títulos para elegir.", stat: "level" },
  { id: "ahorcado", emoji: "🔤", title: "Ahorcado de títulos", rules: "Adivina el título de un libro letra a letra con el teclado. Cada letra que no está te quita una vida 💜. En cada nivel tienes menos vidas.", stat: "level" },
  { id: "verdad", emoji: "👆", title: "¿Verdad o mentira?", rules: "Sale un libro con una vibe. Desliza a la derecha si es suya de verdad o a la izquierda si es mentira. Un fallo y se acaba la racha.", stat: "best", bestLabel: (n) => `Racha: ${n}` },
  { id: "paginas", emoji: "📚", title: "¿Cuál es más gordo?", rules: "Salen dos libros: toca el que tiene más páginas. Un fallo y se acaba la racha. Cuanto más larga es tu racha, más se parecen.", stat: "best", bestLabel: (n) => `Racha: ${n}` },
  { id: "vibes", emoji: "🔮", title: "Tu libro por vibes", rules: "Contesta 5 preguntas rápidas sobre cómo te sientes y qué te apetece, y te decimos qué libro te pega hoy.", stat: null },
];

const { width: SCREEN_W } = Dimensions.get("window");
const H_PADDING = 18;
const GAP = 12;
const TILE_W = Math.floor((SCREEN_W - H_PADDING * 2 - GAP) / 2);

export default function Juegos() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [best, setBest] = useState<Record<string, number>>({});
  // Partidas gratis que quedan hoy (null = premium o aún sin saber).
  const [remaining, setRemaining] = useState<number | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  // Juego cuya explicación se está enseñando en la ventanita.
  const [intro, setIntro] = useState<Game | null>(null);
  const { gate, paywall } = usePlayGate();

  // Se recarga al volver de un juego, para que el nivel salga al día.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const entries = await Promise.all(GAMES.map(async (g) => [g.id, g.stat === "level" ? await getLevel(g.id) : await getBest(g.id)] as const));
        if (!cancelled) setBest(Object.fromEntries(entries));
        const seenIntros = await getSeenIntros();
        if (!cancelled) setSeen(seenIntros);
        const usage = await getGameUsage();
        if (!cancelled) setRemaining(usage && !usage.is_premium ? usage.remaining : null);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const play = (g: Game) =>
    gate(() => {
      setRemaining((r) => (r === null ? r : Math.max(0, r - 1)));
      router.push(`/juego/${g.id}` as any);
    });

  // La primera vez se explica el juego; después se entra directo.
  const open = (g: Game) => {
    if (seen.includes(g.id)) play(g);
    else setIntro(g);
  };

  const startFromIntro = () => {
    if (!intro) return;
    const g = intro;
    markIntroSeen(g.id);
    setSeen((s) => [...s, g.id]);
    setIntro(null);
    play(g);
  };

  return (
    <LinearGradient colors={colors.bgGradient} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ flex: 1 }} testID="games-screen">
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 12 }]} showsVerticalScrollIndicator={false}>
        {/* Mismo encabezado que Favoritos y Ajustes: título + icono en morado,
            subtítulo debajo. */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text allowFontScaling={false} style={styles.titleText}>JUEGOS</Text>
            <Ionicons allowFontScaling={false} name="game-controller" size={16} color={colors.copper} style={{ marginLeft: 6 }} />
          </View>
          <Text allowFontScaling={false} style={styles.subtitle}>Juega con lo que lees</Text>
        </View>
        {remaining !== null ? (
          <Text allowFontScaling={false} style={styles.remaining}>
            {remaining > 0
              ? `Te ${remaining === 1 ? "queda 1 partida gratis" : `quedan ${remaining} partidas gratis`} hoy`
              : "Hoy ya has jugado tus partidas gratis · mañana tendrás más"}
          </Text>
        ) : null}

        <View style={styles.grid}>
          {GAMES.map((g) => {
            const n = best[g.id] || 0;
            const stat = g.stat === "level" && n > 0 ? `Nivel ${n}` : g.stat === "best" && g.bestLabel && n > 0 ? g.bestLabel(n) : null;
            return (
              <TouchableOpacity key={g.id} activeOpacity={0.85} onPress={() => open(g)} style={{ width: TILE_W }} testID={`btn-game-${g.id}`}>
                <LinearGradient colors={[colors.brass, colors.copper]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.border}>
                  <View style={styles.inner}>
                    {/* "?" para volver a ver cómo se juega cuando quieras. */}
                    <TouchableOpacity onPress={() => setIntro(g)} style={styles.help} hitSlop={10} testID={`btn-help-${g.id}`}>
                      <Ionicons allowFontScaling={false} name="help-circle-outline" size={18} color={colors.textOnDarkMuted} />
                    </TouchableOpacity>
                    <View style={styles.emojiBox}>
                      <Text allowFontScaling={false} style={styles.emoji}>{g.emoji}</Text>
                    </View>
                    <Text allowFontScaling={false} style={styles.gameTitle} numberOfLines={2}>{g.title}</Text>
                    <Text allowFontScaling={false} style={styles.best}>{stat || " "}</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <Modal visible={!!intro} transparent animationType="fade" onRequestClose={() => setIntro(null)}>
        <View style={styles.modalWrap}>
          <BlurView
            intensity={40}
            tint="dark"
            experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, styles.modalDim]} />
          {intro ? (
            <LinearGradient colors={[colors.brass, colors.copper]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalBorder}>
              <View style={styles.modalCard}>
                <Text allowFontScaling={false} style={styles.modalEmoji}>{intro.emoji}</Text>
                <Text allowFontScaling={false} style={styles.modalTitle}>{intro.title}</Text>
                <Text allowFontScaling={false} style={styles.modalLabel}>CÓMO SE JUEGA</Text>
                <Text allowFontScaling={false} style={styles.modalRules}>{intro.rules}</Text>
                <View style={{ height: 8 }} />
                <GradientButton label="¡A JUGAR!" icon="play" onPress={startFromIntro} testID="btn-intro-play" />
                <TouchableOpacity onPress={() => setIntro(null)} style={styles.modalCancel} testID="btn-intro-cancel">
                  <Text allowFontScaling={false} style={styles.modalCancelText}>AHORA NO</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          ) : null}
        </View>
      </Modal>
      {paywall}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: H_PADDING, paddingBottom: 32, gap: 12 },
  header: { alignItems: "center", paddingBottom: 4 },
  titleRow: { flexDirection: "row", alignItems: "center" },
  titleText: { color: colors.textOnDark, fontWeight: "900", letterSpacing: 4, fontSize: 18 },
  subtitle: { color: colors.copper, fontSize: 12, marginTop: 4, letterSpacing: 0.5 },
  remaining: { textAlign: "center", color: colors.gold, fontSize: 12, fontWeight: "700", marginTop: -4, marginBottom: 6 },
  // Dos columnas; el último juego, si queda solo, sale centrado.
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, justifyContent: "center" },
  border: { borderRadius: 18, padding: 1.5 },
  inner: { borderRadius: 16.5, backgroundColor: colors.bgSurface, paddingVertical: 18, paddingHorizontal: 10, alignItems: "center", gap: 8, minHeight: 150 },
  help: { position: "absolute", top: 8, right: 8, zIndex: 1 },
  emojiBox: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(176,38,255,0.10)", borderWidth: 1, borderColor: "rgba(176,38,255,0.4)" },
  emoji: { fontSize: 26 },
  gameTitle: { color: colors.textOnDark, fontSize: 14, fontWeight: "900", textAlign: "center" },
  best: { color: colors.gold, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  modalWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  modalDim: { backgroundColor: "rgba(0,0,0,0.35)" },
  modalBorder: { borderRadius: 20, padding: 1.5, alignSelf: "stretch" },
  modalCard: { borderRadius: 18.5, backgroundColor: colors.bgSurface, padding: 22, alignItems: "stretch", gap: 8 },
  modalEmoji: { fontSize: 46, textAlign: "center" },
  modalTitle: { color: colors.textOnDark, fontSize: 20, fontWeight: "900", textAlign: "center" },
  modalLabel: { color: colors.brass, fontSize: 10, fontWeight: "800", letterSpacing: 3, textAlign: "center", marginTop: 4 },
  modalRules: { color: colors.textOnDark, fontSize: 14.5, lineHeight: 21, textAlign: "center" },
  modalCancel: { alignSelf: "center", paddingVertical: 8, paddingHorizontal: 16 },
  modalCancelText: { color: colors.lilac, fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },
});
