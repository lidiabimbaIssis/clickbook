import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions } from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "../../src/theme";
import { GameBook, loadGameBooks, shuffle, coverUri, cleanVibeTags, normalize, getLevel, setLevel } from "../../src/lib/games";
import { GameScreen, GameLoading, GameOver, GradientButton, gameStyles, ResultOverlay } from "../../src/components/GameUI";

const ROUNDS = 5;
const { width: SCREEN_W } = Dimensions.get("window");

// Cada nivel: más portadas entre las que elegir y más puntos necesarios
// para pasar (de 15 posibles).
function optionsFor(level: number) {
  return level === 1 ? 4 : level === 2 ? 6 : 9;
}
function pointsToPass(level: number) {
  return Math.min(7 + level, 12);
}

type Round = { answer: GameBook; options: GameBook[]; clues: string[] };

// Tapa el título y el autor dentro de la sinopsis, que si no la pista 3
// lo chiva directamente.
function maskSynopsis(book: GameBook) {
  let text = (book.synopsis_es || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length > 180) {
    const cut = text.slice(0, 180);
    text = cut.slice(0, cut.lastIndexOf(" ")) + "…";
  }
  const words = [...(book.title || "").split(/\s+/), ...(book.author || "").split(/\s+/)]
    .map((w) => w.replace(/[^A-Za-zÀ-ÿ0-9]/g, ""))
    .filter((w) => w.length > 3);
  for (const w of words) {
    text = text.replace(new RegExp(`\\b${w}\\b`, "gi"), "•••");
  }
  return `"${text}"`;
}

function buildClues(book: GameBook): string[] {
  const clues: string[] = [];
  const genre = book.subgenero || book.genre;
  if (genre && book.year) clues.push(`Es de ${genre.toLowerCase()} y se publicó en ${book.year}.`);
  else if (genre) clues.push(`Es de ${genre.toLowerCase()}.`);
  else if (book.year) clues.push(`Se publicó en ${book.year}.`);

  const tags = cleanVibeTags(book).slice(0, 3);
  if (tags.length) clues.push(`Sus vibes: ${tags.map((t) => `${t.icon || ""} ${t.label}`.trim()).join(" · ")}`);
  else if (book.tono) clues.push(`Su tono: ${book.tono}.`);

  const syn = maskSynopsis(book);
  if (syn) clues.push(syn);
  if (book.pages && clues.length < 3) clues.push(`Tiene unas ${book.pages} páginas.`);
  return clues.slice(0, 3);
}

function buildRounds(books: GameBook[], nOptions: number): Round[] {
  const pool = shuffle(books.filter((b) => buildClues(b).length >= 2));
  const rounds: Round[] = [];
  for (const answer of pool) {
    if (rounds.length >= ROUNDS) break;
    const others = shuffle(books.filter((b) => b.book_id !== answer.book_id && normalize(b.title) !== normalize(answer.title))).slice(0, nOptions - 1);
    if (others.length < nOptions - 1) continue;
    rounds.push({ answer, options: shuffle([answer, ...others]), clues: buildClues(answer) });
  }
  return rounds;
}

export default function Adivina() {
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [error, setError] = useState(false);
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState(1);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [level, setLevelState] = useState(1);

  // Sin `lvl`, se sigue por el nivel guardado.
  const start = useCallback(async (lvl?: number) => {
    setError(false);
    setRounds(null);
    try {
      const books = await loadGameBooks();
      const l = lvl ?? (await getLevel("adivina"));
      setLevelState(l);
      setRounds(buildRounds(books, optionsFor(l)));
      setIdx(0);
      setShown(1);
      setPicked(null);
      setScore(0);
      setDone(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    start();
  }, [start]);

  if (!rounds || !rounds.length) {
    return (
      <GameScreen title="Adivina el libro">
        <GameLoading error={error || (rounds !== null && !rounds.length)} onRetry={() => start()} />
      </GameScreen>
    );
  }

  if (done) {
    const max = rounds.length * 3;
    const need = pointsToPass(level);
    return (
      <GameScreen title="Adivina el libro">
        <GameOver
          score={score}
          max={max}
          isRecord={false}
          level={level}
          passed={score >= need}
          passHint={`Necesitabas ${need} puntos para pasar. ¡Casi lo tienes!`}
          message={`En el nivel ${level + 1} tendrás ${optionsFor(level + 1)} portadas para elegir. ¡Eres una enciclopedia andante!`}
          onNextLevel={() => start(level + 1)}
          onReplay={() => start(level)}
        />
      </GameScreen>
    );
  }

  const round = rounds[idx];
  const cols = round.options.length <= 4 ? 2 : 3;
  const coverW = Math.floor((SCREEN_W - 32 - 12 * (cols - 1)) / cols);
  const coverH = coverW * 1.5;
  const answered = picked !== null;
  const points = Math.max(1, 4 - shown);

  const pick = (book: GameBook) => {
    if (answered) return;
    setPicked(book.book_id);
    if (book.book_id === round.answer.book_id) {
      setScore((s) => s + points);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
    // Al fallar se enseñan todas las pistas, para que se vea por qué era ese.
    setShown(round.clues.length);
  };

  const next = async () => {
    if (idx + 1 >= rounds.length) {
      if (score >= pointsToPass(level)) await setLevel("adivina", level + 1);
      setDone(true);
      return;
    }
    setIdx(idx + 1);
    setShown(1);
    setPicked(null);
  };

  return (
    <GameScreen title="Adivina el libro" right={`${score} pts`} testID="game-adivina"
      overlay={
        <ResultOverlay
          visible={answered}
          title={picked === round.answer.book_id ? `¡Correcto! +${points}` : "¡Casi!"}
          color={picked === round.answer.book_id ? colors.verdigris : colors.iron}
          subtitle={`"${round.answer.title}" de ${round.answer.author}`}
        >
          <GradientButton label={idx + 1 >= rounds.length ? "VER RESULTADO" : "SIGUIENTE"} icon="arrow-forward" onPress={next} testID="btn-next" />
        </ResultOverlay>
      }
    >
      <Text allowFontScaling={false} style={gameStyles.label}>NIVEL {level} · RONDA {idx + 1}/{rounds.length} · PASAS CON {pointsToPass(level)}</Text>

      <View style={gameStyles.card}>
        {round.clues.slice(0, shown).map((c, i) => (
          <View key={i} style={[styles.clueRow, i > 0 && { marginTop: 10 }]}>
            <Text allowFontScaling={false} style={styles.clueNum}>{i + 1}</Text>
            <Text allowFontScaling={false} style={styles.clueText}>{c}</Text>
          </View>
        ))}
        {!answered && shown < round.clues.length ? (
          <TouchableOpacity onPress={() => setShown(shown + 1)} style={styles.moreBtn} testID="btn-more-clue">
            <Text allowFontScaling={false} style={styles.moreText}>+ OTRA PISTA (vale {points - 1} pts)</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {!answered ? (
        <Text allowFontScaling={false} style={gameStyles.muted}>Toca la portada correcta · ahora vale {points} {points === 1 ? "punto" : "puntos"}</Text>
      ) : (
        <Text allowFontScaling={false} style={[styles.result, { color: picked === round.answer.book_id ? colors.verdigris : colors.iron }]}>
          {picked === round.answer.book_id ? `¡Correcto! +${points}` : `Era "${round.answer.title}"`}
        </Text>
      )}

      <View style={styles.grid}>
        {round.options.map((b) => {
          const isAnswer = b.book_id === round.answer.book_id;
          const border = answered ? (isAnswer ? colors.verdigris : b.book_id === picked ? colors.iron : colors.border) : colors.border;
          return (
            <TouchableOpacity key={b.book_id} onPress={() => pick(b)} activeOpacity={0.8} disabled={answered} testID={`option-${b.book_id}`}>
              <Image
                source={{ uri: coverUri(b.book_id, coverW) }}
                style={[gameStyles.cover, { width: coverW, height: coverH, borderColor: border, borderWidth: answered ? 3 : 1, opacity: answered && !isAnswer && b.book_id !== picked ? 0.4 : 1 }]}
                resizeMode="cover"
              />
            </TouchableOpacity>
          );
        })}
      </View>

    </GameScreen>
  );
}

const styles = StyleSheet.create({
  clueRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  clueNum: { color: colors.brass, fontWeight: "900", fontSize: 14, width: 18 },
  clueText: { flex: 1, color: colors.textOnDark, fontSize: 14.5, lineHeight: 20 },
  moreBtn: { marginTop: 14, alignSelf: "center", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: "rgba(176,38,255,0.5)", backgroundColor: "rgba(176,38,255,0.08)" },
  moreText: { color: colors.lilac, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  result: { textAlign: "center", fontSize: 16, fontWeight: "900" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
});
