import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "../../src/theme";
import { GameBook, loadGameBooks, shuffle, coverUri, getLevel, setLevel } from "../../src/lib/games";
import { GameScreen, GameLoading, GradientButton, gameStyles, ResultOverlay } from "../../src/components/GameUI";

const { width: SCREEN_W } = Dimensions.get("window");
const BOARD_W = Math.min(SCREEN_W - 32, 300);
const BOARD_H = BOARD_W * 1.5;

// Tamaño del puzzle por nivel: 3×3 en los dos primeros, luego 4×4, y
// desde el nivel 5, 5×5.
function sizeFor(level: number) {
  return level <= 2 ? 3 : level <= 4 ? 4 : 5;
}

// Puzzle de intercambio: tocas una pieza, tocas otra y se cambian de
// sitio. Sin arrastrar, así funciona igual en cualquier móvil.
// order[posición] = número de la pieza que hay en esa posición.
function shuffledOrder(n: number) {
  const ids = Array.from({ length: n }, (_, i) => i);
  let order = shuffle(ids);
  while (order.every((v, i) => v === i)) order = shuffle(ids);
  return order;
}

export default function Puzzle() {
  const [books, setBooks] = useState<GameBook[] | null>(null);
  const [error, setError] = useState(false);
  const [book, setBook] = useState<GameBook | null>(null);
  const [level, setLevelState] = useState(1);
  const [order, setOrder] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [solved, setSolved] = useState(false);
  const [peek, setPeek] = useState(false);

  const newPuzzle = useCallback((list: GameBook[], lvl: number) => {
    const n = sizeFor(lvl);
    setLevelState(lvl);
    const b = list[Math.floor(Math.random() * list.length)];
    Image.prefetch(coverUri(b.book_id, BOARD_W)).catch(() => {});
    setBook(b);
    setOrder(shuffledOrder(n * n));
    setSelected(null);
    setMoves(0);
    setSolved(false);
  }, []);

  const load = useCallback(async () => {
    setError(false);
    try {
      const list = await loadGameBooks();
      setBooks(list);
      if (list.length) newPuzzle(list, await getLevel("puzzle"));
    } catch {
      setError(true);
    }
  }, [newPuzzle]);

  useEffect(() => {
    load();
  }, [load]);

  if (!books || !book) {
    return (
      <GameScreen title="Puzzle de portada">
        <GameLoading error={error} onRetry={load} />
      </GameScreen>
    );
  }

  const size = sizeFor(level);
  const tileW = BOARD_W / size;
  const tileH = BOARD_H / size;
  const uri = coverUri(book.book_id, BOARD_W);

  const tap = async (pos: number) => {
    if (solved) return;
    if (selected === null) {
      setSelected(pos);
      Haptics.selectionAsync().catch(() => {});
      return;
    }
    if (selected === pos) {
      setSelected(null);
      return;
    }
    const next = [...order];
    [next[selected], next[pos]] = [next[pos], next[selected]];
    setOrder(next);
    setSelected(null);
    setMoves((m) => m + 1);
    if (next.every((v, i) => v === i)) {
      setSolved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await setLevel("puzzle", level + 1);
    }
  };

  return (
    <GameScreen title="Puzzle de portada" right={`${moves} mov.`} testID="game-puzzle"
      overlay={
        <ResultOverlay
          visible={solved}
          title={`¡Completado en ${moves} movimientos!`}
          color={colors.verdigris}
          subtitle={`"${book.title}" de ${book.author}`}
          delay={1000}
        >
          <GradientButton label={`NIVEL ${level + 1} · ${sizeFor(level + 1)}×${sizeFor(level + 1)}`} icon="arrow-up" onPress={() => newPuzzle(books, level + 1)} testID="btn-next-puzzle" />
        </ResultOverlay>
      }
    >
      <Text allowFontScaling={false} style={[gameStyles.label, { textAlign: "center" }]}>
        NIVEL {level} · {size}×{size} PIEZAS
      </Text>

      <Text allowFontScaling={false} style={gameStyles.muted}>
        {solved ? " " : "Toca dos piezas para cambiarlas de sitio"}
      </Text>

      <View style={[styles.board, { width: BOARD_W, height: BOARD_H }]}>
        {peek || solved ? (
          <Image source={{ uri }} style={{ width: BOARD_W, height: BOARD_H }} resizeMode="cover" />
        ) : (
          order.map((tile, pos) => {
            const r = Math.floor(tile / size);
            const c = tile % size;
            return (
              <TouchableOpacity
                key={pos}
                activeOpacity={0.8}
                onPress={() => tap(pos)}
                style={[styles.tile, { width: tileW, height: tileH, left: (pos % size) * tileW, top: Math.floor(pos / size) * tileH }]}
              >
                <Image
                  source={{ uri }}
                  style={{ position: "absolute", width: BOARD_W, height: BOARD_H, left: -c * tileW, top: -r * tileH }}
                  resizeMode="cover"
                />
                {/* El borde va en una capa encima: si se pusiera en la propia
                    pieza, movería la imagen y no casaría con las de al lado. */}
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, selected === pos ? styles.tileSelected : styles.tileEdge]} />
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {solved ? null : (
        <Pressable onPressIn={() => setPeek(true)} onPressOut={() => setPeek(false)} style={styles.peekBtn} testID="btn-peek">
          <Text allowFontScaling={false} style={styles.peekText}>👁  MANTÉN PULSADO PARA VER LA PORTADA</Text>
        </Pressable>
      )}
    </GameScreen>
  );
}

const styles = StyleSheet.create({
  board: { alignSelf: "center", borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSurface },
  tile: { position: "absolute", overflow: "hidden" },
  tileEdge: { borderWidth: 0.5, borderColor: "rgba(0,0,0,0.6)" },
  tileSelected: { borderWidth: 3, borderColor: colors.brass, backgroundColor: "rgba(69,183,245,0.25)" },
  peekBtn: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: "rgba(176,38,255,0.5)", backgroundColor: "rgba(176,38,255,0.08)" },
  peekText: { color: colors.lilac, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
});
