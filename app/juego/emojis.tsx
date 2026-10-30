import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "../../src/theme";
import { GameBook, loadGameBooks, shuffle, coverUri, normalize, cleanVibeTags, getLevel, setLevel } from "../../src/lib/games";
import { GameScreen, GameLoading, GameOver, GradientButton, gameStyles, ResultOverlay } from "../../src/components/GameUI";

const ROUNDS = 8;

// Cada nivel: más títulos entre los que elegir y más aciertos para pasar.
function optionsFor(level: number) {
  return Math.min(3 + level, 6);
}
function hitsToPass(level: number) {
  return Math.min(4 + level, 7);
}

// Los emojis salen de los iconos de los vibe_tags del libro.
function emojisOf(book: GameBook) {
  return Array.from(new Set(cleanVibeTags(book).map((t) => (t.icon || "").trim()).filter(Boolean)));
}

type Round = { book: GameBook; emojis: string[]; options: GameBook[] };

function buildRounds(books: GameBook[], nOptions: number): Round[] {
  const rounds: Round[] = [];
  for (const book of shuffle(books.filter((b) => emojisOf(b).length >= 3))) {
    if (rounds.length >= ROUNDS) break;
    const others = shuffle(books.filter((b) => normalize(b.title) !== normalize(book.title))).slice(0, nOptions - 1);
    if (others.length < nOptions - 1) continue;
    rounds.push({ book, emojis: emojisOf(book), options: shuffle([book, ...others]) });
  }
  return rounds;
}

export default function Emojis() {
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [error, setError] = useState(false);
  const [idx, setIdx] = useState(0);
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
      const l = lvl ?? (await getLevel("emojis"));
      setLevelState(l);
      setRounds(buildRounds(books, optionsFor(l)));
      setIdx(0);
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
      <GameScreen title="Adivina por emojis">
        <GameLoading error={error || (rounds !== null && !rounds.length)} onRetry={() => start()} />
      </GameScreen>
    );
  }

  if (done) {
    return (
      <GameScreen title="Adivina por emojis">
        <GameOver
          score={score}
          max={rounds.length}
          isRecord={false}
          level={level}
          passed={score >= hitsToPass(level)}
          passHint={`Necesitabas ${hitsToPass(level)} aciertos para pasar. ¡Los emojis engañan!`}
          message={`¡Hablas emoji literario! En el nivel ${level + 1} habrá ${optionsFor(level + 1)} títulos para elegir.`}
          onNextLevel={() => start(level + 1)}
          onReplay={() => start(level)}
        />
      </GameScreen>
    );
  }

  const round = rounds[idx];
  const answered = picked !== null;
  const correct = picked === round.book.book_id;

  const pick = (book: GameBook) => {
    if (answered) return;
    setPicked(book.book_id);
    if (book.book_id === round.book.book_id) {
      setScore((s) => s + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const next = async () => {
    if (idx + 1 >= rounds.length) {
      if (score >= hitsToPass(level)) await setLevel("emojis", level + 1);
      setDone(true);
      return;
    }
    setIdx(idx + 1);
    setPicked(null);
  };

  return (
    <GameScreen title="Adivina por emojis" right={`${score}/${rounds.length}`} testID="game-emojis"
      overlay={
        <ResultOverlay
          visible={answered}
          title={correct ? "¡Correcto!" : "¡Casi!"}
          color={correct ? colors.verdigris : colors.iron}
          subtitle={`Era "${round.book.title}"`}
        >
          <GradientButton label={idx + 1 >= rounds.length ? "VER RESULTADO" : "SIGUIENTE"} icon="arrow-forward" onPress={next} testID="btn-next" />
        </ResultOverlay>
      }
    >
      <Text allowFontScaling={false} style={gameStyles.label}>NIVEL {level} · LIBRO {idx + 1}/{rounds.length} · PASAS CON {hitsToPass(level)}</Text>

      <View style={[gameStyles.card, styles.emojiCard]}>
        {answered ? (
          <Image source={{ uri: coverUri(round.book.book_id, 90) }} style={[gameStyles.cover, { width: 90, height: 135 }]} resizeMode="cover" />
        ) : null}
        <Text allowFontScaling={false} style={styles.emojis}>{round.emojis.join(" ")}</Text>
        {answered ? (
          <Text allowFontScaling={false} style={gameStyles.muted}>
            {cleanVibeTags(round.book).map((t) => t.label).join(" · ")}
          </Text>
        ) : (
          <Text allowFontScaling={false} style={gameStyles.muted}>¿Qué libro cuentan estos emojis?</Text>
        )}
      </View>

      {round.options.map((b) => {
        const isRight = b.book_id === round.book.book_id;
        const style = answered ? (isRight ? styles.optRight : b.book_id === picked ? styles.optWrong : styles.optDim) : null;
        return (
          <TouchableOpacity key={b.book_id} onPress={() => pick(b)} disabled={answered} activeOpacity={0.8} style={[styles.opt, style]} testID={`emoji-opt-${b.book_id}`}>
            <Text allowFontScaling={false} style={styles.optText} numberOfLines={2}>{b.title}</Text>
          </TouchableOpacity>
        );
      })}

    </GameScreen>
  );
}

const styles = StyleSheet.create({
  emojiCard: { alignItems: "center", gap: 12, paddingVertical: 24 },
  emojis: { fontSize: 44, textAlign: "center", lineHeight: 56 },
  opt: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, borderColor: "rgba(176,38,255,0.45)", backgroundColor: "rgba(176,38,255,0.07)" },
  optRight: { borderColor: colors.verdigris, backgroundColor: "rgba(0,255,163,0.10)" },
  optWrong: { borderColor: colors.iron, backgroundColor: "rgba(255,46,120,0.10)" },
  optDim: { opacity: 0.4 },
  optText: { color: colors.textOnDark, fontSize: 15, fontWeight: "700" },
  result: { textAlign: "center", fontSize: 16, fontWeight: "900" },
});
