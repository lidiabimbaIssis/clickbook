import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions } from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "../../src/theme";
import { GameBook, loadGameBooks, shuffle, coverUri, getLevel, setLevel } from "../../src/lib/games";
import { GameScreen, GameLoading, GameOver, GradientButton, gameStyles, ResultOverlay } from "../../src/components/GameUI";

const ROUNDS = 3;
const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKLÑ", "ZXCVBNM"];
// 10 teclas por fila como máximo, con 5 de hueco: que quepan en cualquier móvil.
const KEY_W = Math.min(Math.floor((Dimensions.get("window").width - 32 - 9 * 5) / 10), 34);

// Cada nivel: menos vidas por título, y a partir del 3 ya no se enseña
// el autor como pista. Para pasar hay que adivinar 2 de los 3 títulos.
function livesFor(level: number) {
  return Math.max(8 - level, 4);
}
function showAuthor(level: number) {
  return level <= 2;
}
const TO_PASS = 2;

// Letra "base" para comparar: sin tildes ni diéresis, pero la Ñ se queda
// como Ñ (si no, al quitar la tilde se convertiría en N).
function baseChar(c: string) {
  const up = c.toUpperCase();
  if (up === "Ñ") return "Ñ";
  return up.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function isLetter(c: string) {
  return /^[A-ZÑ]$/.test(baseChar(c));
}
function lettersOf(title: string) {
  return new Set(Array.from(title).filter(isLetter).map(baseChar));
}

function pickBooks(books: GameBook[]) {
  return shuffle(books.filter((b) => b.title.length >= 4 && b.title.length <= 28 && lettersOf(b.title).size >= 3)).slice(0, ROUNDS);
}

export default function Ahorcado() {
  const [rounds, setRounds] = useState<GameBook[] | null>(null);
  const [error, setError] = useState(false);
  const [idx, setIdx] = useState(0);
  const [guessed, setGuessed] = useState<Set<string>>(new Set());
  const [solvedCount, setSolvedCount] = useState(0);
  const [done, setDone] = useState(false);
  const [level, setLevelState] = useState(1);

  // Sin `lvl`, se sigue por el nivel guardado.
  const start = useCallback(async (lvl?: number) => {
    setError(false);
    setRounds(null);
    try {
      const books = await loadGameBooks();
      const l = lvl ?? (await getLevel("ahorcado"));
      setLevelState(l);
      setRounds(pickBooks(books));
      setIdx(0);
      setGuessed(new Set());
      setSolvedCount(0);
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
      <GameScreen title="Ahorcado de títulos">
        <GameLoading error={error || (rounds !== null && !rounds.length)} onRetry={() => start()} />
      </GameScreen>
    );
  }

  const need = Math.min(TO_PASS, rounds.length);

  if (done) {
    return (
      <GameScreen title="Ahorcado de títulos">
        <GameOver
          score={solvedCount}
          max={rounds.length}
          isRecord={false}
          level={level}
          passed={solvedCount >= need}
          passHint={`Necesitabas adivinar ${need} títulos para pasar. ¡Otra vez!`}
          message={`¡Bien jugado! En el nivel ${level + 1} tendrás ${livesFor(level + 1)} vidas${showAuthor(level + 1) ? "" : " y sin pista del autor"}.`}
          onNextLevel={() => start(level + 1)}
          onReplay={() => start(level)}
        />
      </GameScreen>
    );
  }

  const book = rounds[idx];
  const letters = lettersOf(book.title);
  const misses = Array.from(guessed).filter((l) => !letters.has(l)).length;
  const lives = livesFor(level);
  const won = Array.from(letters).every((l) => guessed.has(l));
  const lost = misses >= lives;
  const finished = won || lost;

  const guess = (l: string) => {
    if (finished || guessed.has(l)) return;
    const next = new Set(guessed).add(l);
    setGuessed(next);
    if (letters.has(l)) {
      Haptics.selectionAsync().catch(() => {});
      if (Array.from(letters).every((x) => next.has(x))) {
        setSolvedCount((n) => n + 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const next = async () => {
    if (idx + 1 >= rounds.length) {
      if (solvedCount >= need) await setLevel("ahorcado", level + 1);
      setDone(true);
      return;
    }
    setIdx(idx + 1);
    setGuessed(new Set());
  };

  return (
    <GameScreen title="Ahorcado de títulos" right={`${solvedCount}/${rounds.length}`} testID="game-ahorcado"
      overlay={
        <ResultOverlay
          visible={finished}
          title={won ? "¡Lo has adivinado!" : "¡Te has quedado sin vidas!"}
          color={won ? colors.verdigris : colors.iron}
          subtitle={`"${book.title}" de ${book.author}`}
        >
          <GradientButton label={idx + 1 >= rounds.length ? "VER RESULTADO" : "SIGUIENTE TÍTULO"} icon="arrow-forward" onPress={next} testID="btn-next" />
        </ResultOverlay>
      }
    >
      <Text allowFontScaling={false} style={gameStyles.label}>NIVEL {level} · TÍTULO {idx + 1}/{rounds.length}</Text>

      <View style={styles.lives}>
        {Array.from({ length: lives }, (_, i) => (
          <Text key={i} allowFontScaling={false} style={styles.heart}>{i < lives - misses ? "💜" : "🖤"}</Text>
        ))}
      </View>

      <View style={[gameStyles.card, styles.board]}>
        {finished ? (
          <Image source={{ uri: coverUri(book.book_id, 90) }} style={[gameStyles.cover, { width: 90, height: 135, alignSelf: "center", marginBottom: 12 }]} resizeMode="cover" />
        ) : null}
        <View style={styles.words}>
          {book.title.split(" ").map((word, wi) => (
            <View key={wi} style={styles.word}>
              {Array.from(word).map((c, ci) => {
                const letter = isLetter(c);
                const show = !letter || guessed.has(baseChar(c)) || finished;
                const missed = letter && finished && !guessed.has(baseChar(c));
                return (
                  <View key={ci} style={[styles.slot, letter && styles.slotLine]}>
                    <Text allowFontScaling={false} style={[styles.slotText, missed && { color: colors.iron }]}>{show ? c.toUpperCase() : " "}</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
        {showAuthor(level) || finished ? <Text allowFontScaling={false} style={[gameStyles.muted, { marginTop: 12 }]}>de {book.author}</Text> : null}
      </View>

      {finished ? null : (
        <View style={styles.keyboard}>
          {KEY_ROWS.map((row) => (
            <View key={row} style={styles.keyRow}>
              {Array.from(row).map((l) => {
                const used = guessed.has(l);
                const good = used && letters.has(l);
                return (
                  <TouchableOpacity
                    key={l}
                    onPress={() => guess(l)}
                    disabled={used}
                    style={[styles.key, used && (good ? styles.keyGood : styles.keyBad)]}
                    testID={`key-${l}`}
                  >
                    <Text allowFontScaling={false} style={styles.keyText}>{l}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </GameScreen>
  );
}

const styles = StyleSheet.create({
  lives: { flexDirection: "row", justifyContent: "center", gap: 4 },
  heart: { fontSize: 18 },
  board: { paddingVertical: 20 },
  words: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 14, rowGap: 10 },
  word: { flexDirection: "row", gap: 3 },
  slot: { minWidth: 18, alignItems: "center", paddingBottom: 2 },
  slotLine: { borderBottomWidth: 2, borderBottomColor: colors.copper },
  slotText: { color: colors.textOnDark, fontSize: 20, fontWeight: "900" },
  result: { textAlign: "center", fontSize: 16, fontWeight: "900" },
  keyboard: { gap: 6, marginTop: 4 },
  keyRow: { flexDirection: "row", justifyContent: "center", gap: 5 },
  key: { width: KEY_W, height: 42, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(176,38,255,0.5)", backgroundColor: "rgba(176,38,255,0.08)" },
  keyGood: { borderColor: colors.verdigris, backgroundColor: "rgba(0,255,163,0.15)" },
  keyBad: { opacity: 0.25 },
  keyText: { color: colors.textOnDark, fontSize: 15, fontWeight: "800" },
});
