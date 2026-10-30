import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions } from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "../../src/theme";
import { GameBook, loadGameBooks, shuffle, coverUri, saveBest } from "../../src/lib/games";
import { GameScreen, GameLoading, GameOver, GradientButton, gameStyles, ResultOverlay } from "../../src/components/GameUI";

const { width: SCREEN_W } = Dimensions.get("window");
const COVER_W = (SCREEN_W - 32 - 14) / 2;
const COVER_H = COVER_W * 1.5;

// Cada 5 aciertos seguidos se sube de nivel, y los dos libros se
// parecen cada vez más en grosor (máxima diferencia de páginas, en % del
// más gordo).
const LEVEL_GAPS = [Infinity, 60, 35, 20, 10];
function levelFor(streak: number) {
  return 1 + Math.floor(streak / 5);
}
function maxGapFor(level: number) {
  return LEVEL_GAPS[Math.min(level, LEVEL_GAPS.length) - 1];
}

function diffPct(a: GameBook, b: GameBook) {
  const pa = a.pages || 0;
  const pb = b.pages || 0;
  return (Math.abs(pa - pb) / Math.max(pa, pb, 1)) * 100;
}

// Dos libros con distinto número de páginas, sin repetir libros en la
// misma partida mientras queden.
function nextPair(books: GameBook[], used: Set<string>, maxGap: number): [GameBook, GameBook] | null {
  let pool = books.filter((b) => b.pages && !used.has(b.book_id));
  if (pool.length < 2) {
    used.clear();
    pool = books.filter((b) => b.pages);
  }
  const shuffled = shuffle(pool);
  const a = shuffled[0];
  // Si no hay ninguno tan parecido, vale cualquiera con otro número de páginas.
  const b =
    shuffled.find((x) => x.pages !== a?.pages && a && diffPct(a, x) <= maxGap) ||
    shuffled.find((x) => x.pages !== a?.pages);
  if (!a || !b) return null;
  used.add(a.book_id);
  used.add(b.book_id);
  return [a, b];
}

export default function Paginas() {
  const [books, setBooks] = useState<GameBook[] | null>(null);
  const [error, setError] = useState(false);
  const [used] = useState(() => new Set<string>());
  const [pair, setPair] = useState<[GameBook, GameBook] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [over, setOver] = useState(false);
  const [record, setRecord] = useState(false);

  const start = useCallback(async () => {
    setError(false);
    try {
      const list = await loadGameBooks();
      setBooks(list);
      used.clear();
      setPair(nextPair(list, used, maxGapFor(1)));
      setPicked(null);
      setStreak(0);
      setOver(false);
      setRecord(false);
    } catch {
      setError(true);
    }
  }, [used]);

  useEffect(() => {
    start();
  }, [start]);

  if (!books || !pair) {
    return (
      <GameScreen title="¿Cuál es más gordo?">
        <GameLoading error={error || (books !== null && !pair)} onRetry={start} />
      </GameScreen>
    );
  }

  if (over) {
    return (
      <GameScreen title="¿Cuál es más gordo?">
        <GameOver
          score={streak}
          isRecord={record}
          message={streak >= 10 ? "¡Racha de leyenda! Calculas las páginas a ojo." : streak >= 4 ? "¡Buena racha! Tienes buen ojo para los tochos." : "Las portadas engañan… ¡prueba otra vez!"}
          onReplay={start}
        />
      </GameScreen>
    );
  }

  const [a, b] = pair;
  const thicker = (a.pages || 0) > (b.pages || 0) ? a : b;
  const answered = picked !== null;
  const correct = picked === thicker.book_id;

  const pick = (book: GameBook) => {
    if (answered) return;
    setPicked(book.book_id);
    if (book.book_id === thicker.book_id) {
      setStreak((s) => s + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const next = async () => {
    if (!correct) {
      setRecord(await saveBest("paginas", streak));
      setOver(true);
      return;
    }
    // streak ya incluye este acierto (se sumó al tocar).
    setPair(nextPair(books, used, maxGapFor(levelFor(streak))));
    setPicked(null);
  };

  // Nivel de la pareja que hay en pantalla (al acertar, streak ya ha
  // sumado este acierto, pero la pareja es aún la del nivel anterior).
  const pairLevel = levelFor(answered && correct ? streak - 1 : streak);
  const pairGap = maxGapFor(pairLevel);

  return (
    <GameScreen title="¿Cuál es más gordo?" right={`🔥 ${streak}`} testID="game-paginas"
      overlay={
        <ResultOverlay
          visible={answered}
          title={correct ? "¡Correcto!" : "¡Uy! Se acabó la racha"}
          color={correct ? colors.verdigris : colors.iron}
          subtitle={`"${thicker.title}" tiene ${thicker.pages} páginas`}
        >
          <GradientButton label={correct ? "SIGUIENTE" : "VER RESULTADO"} icon="arrow-forward" onPress={next} testID="btn-next" />
        </ResultOverlay>
      }
    >
      <Text allowFontScaling={false} style={[gameStyles.label, { textAlign: "center" }]}>
        NIVEL {pairLevel}
        {pairGap !== Infinity ? " · CADA VEZ SE PARECEN MÁS" : ""}
      </Text>
      <Text allowFontScaling={false} style={gameStyles.question}>¿Cuál tiene más páginas?</Text>
      <Text allowFontScaling={false} style={gameStyles.muted}>Toca el libro más gordo. Un fallo y se acaba la racha.</Text>

      <View style={styles.row}>
        {pair.map((book) => {
          const isThicker = book.book_id === thicker.book_id;
          const border = answered ? (isThicker ? colors.verdigris : colors.iron) : colors.border;
          return (
            <TouchableOpacity key={book.book_id} onPress={() => pick(book)} disabled={answered} activeOpacity={0.8} style={{ width: COVER_W }} testID={`thicker-${book.book_id}`}>
              <Image
                source={{ uri: coverUri(book.book_id, COVER_W) }}
                style={[gameStyles.cover, { width: COVER_W, height: COVER_H, borderColor: border, borderWidth: answered ? 3 : 1 }]}
                resizeMode="cover"
              />
              <Text allowFontScaling={false} style={styles.title} numberOfLines={2}>{book.title}</Text>
              {answered ? <Text allowFontScaling={false} style={[styles.year, { color: isThicker ? colors.verdigris : colors.iron }]}>{book.pages} págs.</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>

    </GameScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 14, marginTop: 6 },
  title: { color: colors.textOnDark, fontSize: 13, fontWeight: "700", textAlign: "center", marginTop: 8 },
  year: { fontSize: 22, fontWeight: "900", textAlign: "center", marginTop: 4 },
  result: { textAlign: "center", fontSize: 16, fontWeight: "900" },
});
