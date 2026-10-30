import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "../../src/theme";
import { GameBook, loadGameBooks, shuffle, coverUri, normalize, getLevel, setLevel } from "../../src/lib/games";
import { GameScreen, GameLoading, GameOver, GradientButton, gameStyles, ResultOverlay } from "../../src/components/GameUI";

const ROUNDS = 10;

// Cada nivel: más autores entre los que elegir y más aciertos para pasar.
function optionsFor(level: number) {
  return Math.min(3 + level, 6);
}
function hitsToPass(level: number) {
  return Math.min(5 + level, 9);
}

type Round = { book: GameBook; authors: string[] };

function buildRounds(books: GameBook[], nOptions: number): Round[] {
  // Un autor por nombre normalizado, para no ofrecer dos veces el mismo.
  const authors = Array.from(new Map(books.map((b) => [normalize(b.author), b.author])).values());
  if (authors.length < 4) return [];
  const rounds: Round[] = [];
  const usedAuthors = new Set<string>();
  for (const book of shuffle(books)) {
    if (rounds.length >= ROUNDS) break;
    // Evita que salgan dos libros del mismo autor en la misma partida.
    if (usedAuthors.has(normalize(book.author))) continue;
    usedAuthors.add(normalize(book.author));
    const wrong = shuffle(authors.filter((a) => normalize(a) !== normalize(book.author))).slice(0, nOptions - 1);
    rounds.push({ book, authors: shuffle([book.author, ...wrong]) });
  }
  return rounds;
}

export default function Autor() {
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
      const l = lvl ?? (await getLevel("autor"));
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
      <GameScreen title="¿Quién lo escribió?">
        <GameLoading error={error || (rounds !== null && !rounds.length)} onRetry={() => start()} />
      </GameScreen>
    );
  }

  if (done) {
    return (
      <GameScreen title="¿Quién lo escribió?">
        <GameOver
          score={score}
          max={rounds.length}
          isRecord={false}
          level={level}
          passed={score >= hitsToPass(level)}
          passHint={`Necesitabas ${hitsToPass(level)} aciertos para pasar. ¡A por ello otra vez!`}
          message={`¡Te sabes los autores de memoria! En el nivel ${level + 1} habrá ${optionsFor(level + 1)} autores para elegir.`}
          onNextLevel={() => start(level + 1)}
          onReplay={() => start(level)}
        />
      </GameScreen>
    );
  }

  const round = rounds[idx];
  const answered = picked !== null;
  const correct = picked === round.book.author;

  const pick = (author: string) => {
    if (answered) return;
    setPicked(author);
    if (author === round.book.author) {
      setScore((s) => s + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const next = async () => {
    if (idx + 1 >= rounds.length) {
      if (score >= hitsToPass(level)) await setLevel("autor", level + 1);
      setDone(true);
      return;
    }
    setIdx(idx + 1);
    setPicked(null);
  };

  const meta = [round.book.year, round.book.subgenero || round.book.genre].filter(Boolean).join(" · ");

  return (
    <GameScreen title="¿Quién lo escribió?" right={`${score}/${rounds.length}`} testID="game-autor"
      overlay={
        <ResultOverlay
          visible={answered}
          title={correct ? "¡Correcto!" : "¡Casi!"}
          color={correct ? colors.verdigris : colors.iron}
          subtitle={`"${round.book.title}" es de ${round.book.author}`}
        >
          <GradientButton label={idx + 1 >= rounds.length ? "VER RESULTADO" : "SIGUIENTE"} icon="arrow-forward" onPress={next} testID="btn-next" />
        </ResultOverlay>
      }
    >
      <Text allowFontScaling={false} style={gameStyles.label}>NIVEL {level} · LIBRO {idx + 1}/{rounds.length} · PASAS CON {hitsToPass(level)}</Text>

      {/* La portada solo se enseña al responder: casi todas llevan el
          nombre del autor impreso y lo chivarían. */}
      <View style={[gameStyles.card, styles.bookCard]}>
        {answered ? (
          <Image source={{ uri: coverUri(round.book.book_id, 110) }} style={[gameStyles.cover, { width: 110, height: 165 }]} resizeMode="cover" />
        ) : (
          <Image source={require("../../assets/images/book-heart-icon.png")} style={styles.logo} resizeMode="contain" />
        )}
        <Text allowFontScaling={false} style={gameStyles.question}>{round.book.title}</Text>
        {meta ? <Text allowFontScaling={false} style={gameStyles.muted}>{meta}</Text> : null}
      </View>

      {round.authors.map((a) => {
        const isRight = a === round.book.author;
        const style = answered ? (isRight ? styles.optRight : a === picked ? styles.optWrong : styles.optDim) : null;
        return (
          <TouchableOpacity key={a} onPress={() => pick(a)} disabled={answered} activeOpacity={0.8} style={[styles.opt, style]} testID={`author-${a}`}>
            <Text allowFontScaling={false} style={styles.optText}>{a}</Text>
            {answered && isRight ? <Text allowFontScaling={false}>✅</Text> : null}
            {answered && a === picked && !isRight ? <Text allowFontScaling={false}>❌</Text> : null}
          </TouchableOpacity>
        );
      })}

    </GameScreen>
  );
}

const styles = StyleSheet.create({
  bookCard: { alignItems: "center", gap: 10, paddingVertical: 22 },
  // Logo del libro con corazón (el mismo PNG que usa Logo.tsx, 2162x1952).
  logo: { width: 96, height: 96 / (2162 / 1952) },
  opt: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 15, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, borderColor: "rgba(176,38,255,0.45)", backgroundColor: "rgba(176,38,255,0.07)" },
  optRight: { borderColor: colors.verdigris, backgroundColor: "rgba(0,255,163,0.10)" },
  optWrong: { borderColor: colors.iron, backgroundColor: "rgba(255,46,120,0.10)" },
  optDim: { opacity: 0.4 },
  optText: { color: colors.textOnDark, fontSize: 15, fontWeight: "700", flex: 1 },
  result: { textAlign: "center", fontSize: 16, fontWeight: "900" },
});
