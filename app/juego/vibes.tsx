import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { colors } from "../../src/theme";
import { GameBook, loadGameBooks, shuffle, coverUri, cleanVibeTags, vibeText } from "../../src/lib/games";
import { GameScreen, GameLoading, GradientButton, gameStyles, usePlayGate } from "../../src/components/GameUI";

// Cada respuesta suma puntos a los libros cuyo género, tono, tropes o
// vibe_tags contengan alguna de sus palabras clave (sin tildes, en
// minúscula, y vale con un trozo: "romant" pilla romance, romántico…).
const QUESTIONS: { q: string; options: { emoji: string; label: string; keys: string[] }[] }[] = [
  {
    q: "¿Cómo te sientes hoy?",
    options: [
      { emoji: "😂", label: "Con ganas de reír", keys: ["humor", "divertid", "comedia", "ligero", "desenfad"] },
      { emoji: "🥲", label: "Con ganas de llorar un poco", keys: ["emoti", "drama", "trist", "desgarr", "nostalg", "melanc"] },
      { emoji: "😰", label: "Con el corazón en un puño", keys: ["suspense", "thriller", "intriga", "tension", "misterio"] },
      { emoji: "🥰", label: "Enamoradiza", keys: ["romance", "romant", "amor", "slow burn"] },
    ],
  },
  {
    q: "¿Dónde te escaparías ahora mismo?",
    options: [
      { emoji: "🐉", label: "A un reino con dragones", keys: ["fantasia", "magia", "epic", "dragon", "reino"] },
      { emoji: "🌧️", label: "A una ciudad bajo la lluvia", keys: ["noir", "crimen", "policia", "oscur", "detective", "asesin"] },
      { emoji: "🚀", label: "Al futuro", keys: ["ciencia ficcion", "distop", "futur", "espacio", "tecnolog"] },
      { emoji: "🏡", label: "A un pueblo pequeño", keys: ["familia", "rural", "acogedor", "cozy", "calid", "pueblo"] },
    ],
  },
  {
    q: "¿Qué ritmo le pides a un libro?",
    options: [
      { emoji: "⚡", label: "Que no pueda soltarlo", keys: ["adictiv", "trepidante", "accion", "giro", "ritmo"] },
      { emoji: "🍵", label: "Pausado y bonito", keys: ["reflexi", "introspec", "poetic", "contempla", "intimo", "lirico"] },
      { emoji: "👻", label: "Que me dé miedo", keys: ["terror", "miedo", "inquietante", "sobrenatural", "horror", "fantasma"] },
      { emoji: "🧠", label: "Que me haga pensar", keys: ["filosof", "social", "critica", "histor", "politic"] },
    ],
  },
  {
    q: "¿Qué personaje te engancha?",
    options: [
      { emoji: "⚔️", label: "Una heroína valiente", keys: ["valent", "heroina", "aventura", "lucha", "guerrera"] },
      { emoji: "😈", label: "Un villano con encanto", keys: ["villano", "moral gris", "antiheroe", "oscur", "venganza"] },
      { emoji: "🌱", label: "Alguien que busca su lugar", keys: ["crecimiento", "identidad", "juvenil", "autodescubr", "adolesc", "amistad"] },
      { emoji: "💥", label: "Dos que se odian… y se enamoran", keys: ["enemies", "enemigos", "rival", "odio"] },
    ],
  },
  {
    q: "¿Y el final?",
    options: [
      { emoji: "🌈", label: "Feliz, por favor", keys: ["esperanz", "feliz", "reconfort", "optimis", "luminos"] },
      { emoji: "💔", label: "Que me rompa", keys: ["tragic", "devastador", "desgarr", "duelo", "perdida"] },
      { emoji: "🌀", label: "Que me deje pensando", keys: ["ambigu", "misterio", "enigm", "abierto"] },
      { emoji: "🤯", label: "Un giro que no vea venir", keys: ["giro", "plot twist", "sorpre", "inesperad"] },
    ],
  },
];

function rankBooks(books: GameBook[], answers: string[][]) {
  // shuffle antes de ordenar: entre libros empatados, sale uno distinto cada vez.
  return shuffle(books)
    .map((book) => {
      const text = vibeText(book);
      const score = answers.reduce((sum, keys) => sum + (keys.some((k) => text.includes(k)) ? 1 : 0), 0);
      return { book, score };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, 3)
    .map((x) => x.book);
}

export default function Vibes() {
  const router = useRouter();
  const [books, setBooks] = useState<GameBook[] | null>(null);
  const [error, setError] = useState(false);
  const [answers, setAnswers] = useState<string[][]>([]);
  const [result, setResult] = useState<GameBook[] | null>(null);
  const { gate, paywall } = usePlayGate();

  const load = useCallback(async () => {
    setError(false);
    try {
      setBooks(await loadGameBooks());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!books) {
    return (
      <GameScreen title="Tu libro por vibes">
        <GameLoading error={error} onRetry={load} />
      </GameScreen>
    );
  }

  const restart = () => {
    setAnswers([]);
    setResult(null);
  };

  if (result && result.length) {
    const [main, ...others] = result;
    return (
      <GameScreen title="Tu libro por vibes" testID="game-vibes-result">
        <Text allowFontScaling={false} style={[gameStyles.label, { textAlign: "center" }]}>HOY TU LIBRO ES…</Text>
        <Image source={{ uri: coverUri(main.book_id, 200) }} style={[gameStyles.cover, styles.mainCover]} resizeMode="cover" />
        <Text allowFontScaling={false} style={gameStyles.question}>{main.title}</Text>
        <Text allowFontScaling={false} style={gameStyles.muted}>{main.author}</Text>
        <View style={styles.tags}>
          {cleanVibeTags(main).slice(0, 4).map((t, i) => (
            <View key={i} style={styles.tag}>
              <Text allowFontScaling={false} style={styles.tagText}>{`${t.icon || ""} ${t.label}`.trim()}</Text>
            </View>
          ))}
        </View>
        <GradientButton
          label="VER EN DESCUBRIR"
          icon="book"
          onPress={() => router.push({ pathname: "/discover", params: { book_id: main.book_id, t: Date.now().toString() } })}
          testID="btn-open-result"
        />
        {others.length ? (
          <>
            <Text allowFontScaling={false} style={[gameStyles.label, { textAlign: "center", marginTop: 10 }]}>TAMBIÉN TE PEGAN</Text>
            <View style={styles.othersRow}>
              {others.map((b) => (
                <TouchableOpacity key={b.book_id} onPress={() => router.push({ pathname: "/discover", params: { book_id: b.book_id, t: Date.now().toString() } })} style={{ alignItems: "center", width: 110 }}>
                  <Image source={{ uri: coverUri(b.book_id, 100) }} style={[gameStyles.cover, { width: 100, height: 150 }]} resizeMode="cover" />
                  <Text allowFontScaling={false} style={styles.otherTitle} numberOfLines={2}>{b.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}
        {/* Repetir el test cuenta como partida nueva. */}
        <TouchableOpacity onPress={() => gate(restart)} style={styles.again} testID="btn-vibes-again">
          <Text allowFontScaling={false} style={styles.againText}>REPETIR EL TEST</Text>
        </TouchableOpacity>
        {paywall}
      </GameScreen>
    );
  }

  const step = answers.length;
  const question = QUESTIONS[step];

  const answer = (keys: string[]) => {
    Haptics.selectionAsync().catch(() => {});
    const next = [...answers, keys];
    if (next.length >= QUESTIONS.length) {
      setAnswers(next);
      setResult(rankBooks(books, next));
    } else {
      setAnswers(next);
    }
  };

  return (
    <GameScreen title="Tu libro por vibes" right={`${step + 1}/${QUESTIONS.length}`} testID="game-vibes">
      <View style={styles.progress}>
        {QUESTIONS.map((_, i) => (
          <View key={i} style={[styles.dot, i <= step && { backgroundColor: colors.copper }]} />
        ))}
      </View>
      <Text allowFontScaling={false} style={[gameStyles.question, { marginVertical: 10, fontSize: 21 }]}>{question.q}</Text>
      {question.options.map((o) => (
        <TouchableOpacity key={o.label} onPress={() => answer(o.keys)} activeOpacity={0.8} style={styles.opt} testID={`vibe-${o.label}`}>
          <Text allowFontScaling={false} style={styles.optEmoji}>{o.emoji}</Text>
          <Text allowFontScaling={false} style={styles.optText}>{o.label}</Text>
        </TouchableOpacity>
      ))}
      {step > 0 ? (
        <TouchableOpacity onPress={() => setAnswers(answers.slice(0, -1))} style={styles.again}>
          <Text allowFontScaling={false} style={styles.againText}>← ANTERIOR</Text>
        </TouchableOpacity>
      ) : null}
    </GameScreen>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: "row", gap: 6, justifyContent: "center" },
  dot: { width: 28, height: 4, borderRadius: 2, backgroundColor: colors.border },
  opt: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, borderColor: "rgba(176,38,255,0.45)", backgroundColor: "rgba(176,38,255,0.07)" },
  optEmoji: { fontSize: 24 },
  optText: { color: colors.textOnDark, fontSize: 15.5, fontWeight: "700", flex: 1 },
  mainCover: { width: 200, height: 300, alignSelf: "center", borderWidth: 2, borderColor: colors.copper },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  tag: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: "rgba(176,38,255,0.4)", backgroundColor: "rgba(176,38,255,0.07)" },
  tagText: { color: colors.textOnDark, fontSize: 12 },
  othersRow: { flexDirection: "row", justifyContent: "center", gap: 18 },
  otherTitle: { color: colors.textOnDarkMuted, fontSize: 12, textAlign: "center", marginTop: 6 },
  again: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 16 },
  againText: { color: colors.lilac, fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },
});
