import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions } from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "../../src/theme";
import { GameBook, loadGameBooks, shuffle, coverUri, saveBest, getLevel, setLevel } from "../../src/lib/games";
import { GameScreen, GameLoading, GradientButton, usePlayGate, ResultOverlay } from "../../src/components/GameUI";

// Parejas por nivel: cada nivel tiene más portadas que el anterior. A
// partir del último se sigue subiendo de nivel con el máximo de parejas.
const LEVEL_PAIRS = [3, 4, 6, 8, 10, 12, 15];
const GAP = 8;
const { width: SCREEN_W } = Dimensions.get("window");
const LOGO = require("../../assets/images/book-heart-icon.png");

function pairsFor(level: number) {
  return LEVEL_PAIRS[Math.min(level, LEVEL_PAIRS.length) - 1];
}

// Más cartas → más columnas y cartas más pequeñas, para que quepan.
function layoutFor(pairs: number) {
  const cols = pairs <= 3 ? 3 : pairs <= 8 ? 4 : 5;
  const w = Math.min(Math.floor((SCREEN_W - 32 - GAP * (cols - 1)) / cols), 90);
  return { w, h: w * 1.5 };
}

type Card = { key: string; bookId: string };

// Juego de memoria: portadas repetidas dos veces, boca abajo con el
// logo. Se destapan de dos en dos; si no son pareja, se vuelven a tapar.
export default function Parejas() {
  const [books, setBooks] = useState<GameBook[] | null>(null);
  const [error, setError] = useState(false);
  const [level, setLevelState] = useState(1);
  const [cards, setCards] = useState<Card[]>([]);
  const [open, setOpen] = useState<number[]>([]);
  const [found, setFound] = useState<Set<string>>(new Set());
  const [moves, setMoves] = useState(0);
  const [record, setRecord] = useState(false);
  const busy = useRef(false);
  const { gate, paywall } = usePlayGate();

  const deal = useCallback((list: GameBook[], lvl: number) => {
    const picked = shuffle(list).slice(0, pairsFor(lvl));
    const { w } = layoutFor(picked.length);
    picked.forEach((b) => Image.prefetch(coverUri(b.book_id, w)).catch(() => {}));
    setCards(shuffle(picked.flatMap((b) => [{ key: b.book_id + "a", bookId: b.book_id }, { key: b.book_id + "b", bookId: b.book_id }])));
    setLevelState(lvl);
    setOpen([]);
    setFound(new Set());
    setMoves(0);
    setRecord(false);
    busy.current = false;
  }, []);

  const start = useCallback(async () => {
    setError(false);
    try {
      const list = await loadGameBooks();
      setBooks(list);
      deal(list, await getLevel("parejas"));
    } catch {
      setError(true);
    }
  }, [deal]);

  useEffect(() => {
    start();
  }, [start]);

  if (!books || cards.length < 4) {
    return (
      <GameScreen title="Parejas de portadas">
        <GameLoading error={error || (books !== null && cards.length < 4)} onRetry={start} />
      </GameScreen>
    );
  }

  const pairs = cards.length / 2;
  const { w: cardW, h: cardH } = layoutFor(pairs);
  const cleared = found.size === pairs;

  const tap = (i: number) => {
    if (cleared || busy.current || open.includes(i) || found.has(cards[i].bookId)) return;
    Haptics.selectionAsync().catch(() => {});
    if (open.length === 0) {
      setOpen([i]);
      return;
    }
    const [first] = open;
    setOpen([first, i]);
    setMoves((m) => m + 1);
    if (cards[first].bookId === cards[i].bookId) {
      const nextFound = new Set(found).add(cards[i].bookId);
      setFound(nextFound);
      setOpen([]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // El récord de este juego es el nivel más alto superado.
      if (nextFound.size === pairs) {
        setLevel("parejas", level + 1);
        saveBest("parejas_nivel", level).then(setRecord);
      }
    } else {
      busy.current = true;
      setTimeout(() => {
        setOpen([]);
        busy.current = false;
      }, 900);
    }
  };

  return (
    <GameScreen title="Parejas de portadas" right={`${moves} int.`} testID="game-parejas"
      overlay={
        <ResultOverlay
          visible={cleared}
          title={`¡Nivel ${level} superado!`}
          color={colors.verdigris}
          subtitle={`${pairs} parejas en ${moves} intentos${record ? " · ¡nuevo récord de nivel!" : ""}`}
        >
          <GradientButton label={`NIVEL ${level + 1} · ${pairsFor(level + 1)} PAREJAS`} icon="arrow-up" onPress={() => deal(books, level + 1)} testID="btn-next-level" />
          <TouchableOpacity onPress={() => gate(() => deal(books, 1))} style={styles.restart} testID="btn-restart">
            <Text allowFontScaling={false} style={styles.restartText}>EMPEZAR DESDE EL NIVEL 1</Text>
          </TouchableOpacity>
        </ResultOverlay>
      }
    >
      <Text allowFontScaling={false} style={styles.level}>NIVEL {level}</Text>
      <Text allowFontScaling={false} style={styles.hint}>
        {cleared ? `¡Nivel superado en ${moves} intentos!` : `Encuentra las ${pairs} parejas · llevas ${found.size}`}
      </Text>
      <View style={styles.grid}>
        {cards.map((c, i) => {
          const isFound = found.has(c.bookId);
          const faceUp = isFound || open.includes(i);
          return (
            <TouchableOpacity
              key={c.key}
              onPress={() => tap(i)}
              activeOpacity={0.8}
              style={[styles.card, { width: cardW, height: cardH }, isFound && styles.cardFound]}
              testID={`card-${i}`}
            >
              {faceUp ? (
                <Image source={{ uri: coverUri(c.bookId, cardW) }} style={styles.cover} resizeMode="cover" fadeDuration={0} />
              ) : (
                <Image source={LOGO} style={{ width: cardW * 0.6, height: cardW * 0.6 }} resizeMode="contain" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      {paywall}
    </GameScreen>
  );
}

const styles = StyleSheet.create({
  level: { color: colors.brass, fontSize: 13, fontWeight: "900", letterSpacing: 3, textAlign: "center" },
  hint: { color: colors.textOnDarkMuted, fontSize: 13, textAlign: "center" },
  restart: { alignSelf: "center", paddingVertical: 8, paddingHorizontal: 16 },
  restartText: { color: colors.lilac, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, justifyContent: "center" },
  card: { borderRadius: 10, borderWidth: 1, borderColor: "rgba(176,38,255,0.5)", backgroundColor: colors.bgSurfaceLight, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  cardFound: { borderColor: colors.verdigris, borderWidth: 2 },
  cover: { width: "100%", height: "100%" },
});
