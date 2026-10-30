import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated, PanResponder, Dimensions } from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "../../src/theme";
import { GameBook, loadGameBooks, shuffle, coverUri, normalize, cleanVibeTags, saveBest } from "../../src/lib/games";
import { GameScreen, GameLoading, GameOver, GradientButton, gameStyles, ResultOverlay } from "../../src/components/GameUI";

const { width: SCREEN_W } = Dimensions.get("window");
const SWIPE_AT = 90;

type Card = { book: GameBook; tag: { label?: string; icon?: string }; isTrue: boolean };

// Una carta: un libro y una vibe. La mitad de las veces la vibe es suya
// de verdad; la otra mitad es de otro libro y no está entre las suyas.
function makeCard(books: GameBook[]): Card | null {
  const withTags = books.filter((b) => cleanVibeTags(b).length >= 2);
  if (withTags.length < 2) return null;
  const book = withTags[Math.floor(Math.random() * withTags.length)];
  const own = cleanVibeTags(book);
  if (Math.random() < 0.5) {
    return { book, tag: own[Math.floor(Math.random() * own.length)], isTrue: true };
  }
  const ownLabels = new Set(own.map((t) => normalize(t.label || "")));
  for (const other of shuffle(withTags)) {
    const fake = cleanVibeTags(other).find((t) => !ownLabels.has(normalize(t.label || "")));
    if (other.book_id !== book.book_id && fake) return { book, tag: fake, isTrue: false };
  }
  return { book, tag: own[0], isTrue: true };
}

export default function Verdad() {
  const [books, setBooks] = useState<GameBook[] | null>(null);
  const [error, setError] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [answer, setAnswer] = useState<boolean | null>(null);
  const [streak, setStreak] = useState(0);
  const [over, setOver] = useState(false);
  const [record, setRecord] = useState(false);
  const pan = useRef(new Animated.ValueXY()).current;

  const start = useCallback(async () => {
    setError(false);
    try {
      const list = await loadGameBooks();
      setBooks(list);
      setCard(makeCard(list));
      setAnswer(null);
      setStreak(0);
      setOver(false);
      setRecord(false);
      pan.setValue({ x: 0, y: 0 });
    } catch {
      setError(true);
    }
  }, [pan]);

  useEffect(() => {
    start();
  }, [start]);

  // Refs para que el PanResponder (creado una sola vez) vea siempre los
  // valores actuales.
  const answerRef = useRef<(v: boolean) => void>(() => {});
  const answeredRef = useRef(false);
  answeredRef.current = answer !== null;

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => !answeredRef.current && Math.abs(g.dx) > 8,
      onPanResponderMove: (_, g) => pan.setValue({ x: g.dx, y: 0 }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_AT) answerRef.current(true);
        else if (g.dx < -SWIPE_AT) answerRef.current(false);
        else Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
    })
  ).current;

  const respond = (saysTrue: boolean) => {
    if (!card || answer !== null) return;
    setAnswer(saysTrue);
    // La carta sale volando hacia el lado elegido.
    Animated.timing(pan, { toValue: { x: saysTrue ? SCREEN_W : -SCREEN_W, y: 0 }, duration: 220, useNativeDriver: false }).start(() => {
      pan.setValue({ x: 0, y: 0 });
    });
    if (saysTrue === card.isTrue) {
      setStreak((s) => s + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };
  answerRef.current = respond;

  if (!books || !card) {
    return (
      <GameScreen title="¿Verdad o mentira?">
        <GameLoading error={error || (books !== null && !card)} onRetry={start} />
      </GameScreen>
    );
  }

  if (over) {
    return (
      <GameScreen title="¿Verdad o mentira?">
        <GameOver
          score={streak}
          isRecord={record}
          message={streak >= 10 ? "¡Conoces las vibes de cada libro como nadie!" : streak >= 4 ? "¡Buena racha! Tienes buen olfato para las vibes." : "Las vibes engañan… ¡prueba otra vez!"}
          onReplay={start}
        />
      </GameScreen>
    );
  }

  const answered = answer !== null;
  const correct = answered && answer === card.isTrue;

  const next = async () => {
    if (!correct) {
      setRecord(await saveBest("verdad", streak));
      setOver(true);
      return;
    }
    setCard(makeCard(books));
    setAnswer(null);
  };

  const rotate = pan.x.interpolate({ inputRange: [-SCREEN_W, 0, SCREEN_W], outputRange: ["-18deg", "0deg", "18deg"] });

  return (
    <GameScreen title="¿Verdad o mentira?" right={`🔥 ${streak}`} scroll={false} testID="game-verdad"
      overlay={
        <ResultOverlay visible={answered} title={correct ? "¡Correcto!" : "¡Uy! Se acabó la racha"} color={correct ? colors.verdigris : colors.iron} delay={500}>
          <GradientButton label={correct ? "SIGUIENTE" : "VER RESULTADO"} icon="arrow-forward" onPress={next} testID="btn-next" />
        </ResultOverlay>
      }
    >
      <Text allowFontScaling={false} style={gameStyles.muted}>Desliza a la derecha si es verdad, a la izquierda si es mentira</Text>

      {!answered ? (
        <Animated.View {...responder.panHandlers} style={[styles.card, { transform: [{ translateX: pan.x }, { rotate }] }]}>
          <Image source={{ uri: coverUri(card.book.book_id, 150) }} style={[gameStyles.cover, { width: 150, height: 225 }]} resizeMode="cover" />
          <Text allowFontScaling={false} style={styles.title} numberOfLines={2}>{card.book.title}</Text>
          <Text allowFontScaling={false} style={gameStyles.muted}>tiene esta vibe:</Text>
          <View style={styles.tag}>
            <Text allowFontScaling={false} style={styles.tagText}>{`${card.tag.icon || ""} ${card.tag.label}`.trim()}</Text>
          </View>
        </Animated.View>
      ) : (
        <View style={[styles.card, { borderColor: correct ? colors.verdigris : colors.iron }]}>
          <Text allowFontScaling={false} style={styles.bigEmoji}>{correct ? "✅" : "❌"}</Text>
          <Text allowFontScaling={false} style={[styles.result, { color: correct ? colors.verdigris : colors.iron }]}>
            {correct ? "¡Correcto!" : "¡Uy! Se acabó la racha"}
          </Text>
          <Text allowFontScaling={false} style={gameStyles.muted}>
            "{card.tag.label}" {card.isTrue ? "SÍ" : "NO"} es una vibe de {card.book.title}.
          </Text>
          <Text allowFontScaling={false} style={[gameStyles.muted, { fontSize: 12 }]}>
            Sus vibes: {cleanVibeTags(card.book).map((t) => t.label).join(" · ")}
          </Text>
        </View>
      )}

      {!answered ? (
        <View style={styles.buttons}>
          <TouchableOpacity onPress={() => respond(false)} style={[styles.choice, { borderColor: colors.iron }]} testID="btn-mentira">
            <Text allowFontScaling={false} style={[styles.choiceText, { color: colors.iron }]}>✕ MENTIRA</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => respond(true)} style={[styles.choice, { borderColor: colors.verdigris }]} testID="btn-verdad">
            <Text allowFontScaling={false} style={[styles.choiceText, { color: colors.verdigris }]}>✓ VERDAD</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </GameScreen>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "center", gap: 10, padding: 20, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSurface, minHeight: 380, justifyContent: "center" },
  title: { color: colors.textOnDark, fontSize: 17, fontWeight: "900", textAlign: "center" },
  tag: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: colors.copper, backgroundColor: "rgba(176,38,255,0.12)" },
  tagText: { color: colors.textOnDark, fontSize: 16, fontWeight: "800" },
  bigEmoji: { fontSize: 54 },
  result: { textAlign: "center", fontSize: 17, fontWeight: "900" },
  buttons: { flexDirection: "row", gap: 12 },
  choice: { flex: 1, paddingVertical: 16, borderRadius: 14, borderWidth: 1.5, alignItems: "center", backgroundColor: colors.bgSurface },
  choiceText: { fontSize: 14, fontWeight: "900", letterSpacing: 1.5 },
});
