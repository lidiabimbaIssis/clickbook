import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "../../src/theme";
import { GameBook, loadGameBooks, shuffle, normalize, getLevel, setLevel } from "../../src/lib/games";
import { GameScreen, GameLoading, GameOver, GradientButton, gameStyles, ResultOverlay } from "../../src/components/GameUI";

const ROUNDS = 5;
const COVER_W = 220;
const COVER_H = COVER_W * 1.5;
// Cuánto se emborrona cada paso (efecto e_blur de Cloudinary, 0 = nítida).
// El desenfoque lo hace Cloudinary y no el móvil: así va igual de fluido
// en cualquier teléfono.
const BLUR_STEPS = [2000, 1300, 800, 450, 200, 0];

// Cada nivel la portada se aclara más deprisa, a partir del 3 hay 6
// títulos para elegir, y hacen falta más puntos para pasar (de 30).
const LEVEL_STEP_MS = [2500, 2000, 1600, 1300, 1000];
function stepMsFor(level: number) {
  return LEVEL_STEP_MS[Math.min(level, LEVEL_STEP_MS.length) - 1];
}
function optionsFor(level: number) {
  return level <= 2 ? 4 : 6;
}
function pointsToPass(level: number) {
  return Math.min(10 + 2 * level, 20);
}

function blurUri(bookId: string, blur: number) {
  const fx = blur ? `,e_blur:${blur}` : "";
  return `https://res.cloudinary.com/ddppclcl1/image/upload/w_${COVER_W * 2},q_auto,f_auto${fx}/v1780422197/${bookId}.webp`;
}

type Round = { answer: GameBook; options: GameBook[] };

function buildRounds(books: GameBook[], nOptions: number): Round[] {
  const rounds: Round[] = [];
  for (const answer of shuffle(books)) {
    if (rounds.length >= ROUNDS) break;
    const others = shuffle(books.filter((b) => normalize(b.title) !== normalize(answer.title))).slice(0, nOptions - 1);
    if (others.length < nOptions - 1) continue;
    rounds.push({ answer, options: shuffle([answer, ...others]) });
  }
  return rounds;
}

export default function Borrosa() {
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [error, setError] = useState(false);
  const [idx, setIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [level, setLevelState] = useState(1);
  // Si Cloudinary no pudiera aplicar el desenfoque, se usa el del propio
  // móvil (blurRadius) como plan B.
  const [cloudBlurFailed, setCloudBlurFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  // Sin `lvl`, se sigue por el nivel guardado.
  const start = useCallback(async (lvl?: number) => {
    setError(false);
    setRounds(null);
    try {
      const books = await loadGameBooks();
      const l = lvl ?? (await getLevel("borrosa"));
      setLevelState(l);
      setRounds(buildRounds(books, optionsFor(l)));
      setIdx(0);
      setStep(0);
      setPicked(null);
      setScore(0);
      setDone(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    start();
    return stopTimer;
  }, [start]);

  const round = rounds && rounds[idx];

  // Al empezar cada ronda: precarga todas las versiones de la portada y
  // arranca el reloj que la va aclarando.
  useEffect(() => {
    if (!round || done) return;
    BLUR_STEPS.forEach((b) => Image.prefetch(blurUri(round.answer.book_id, b)).catch(() => {}));
    stopTimer();
    timer.current = setInterval(() => {
      setStep((s) => {
        if (s >= BLUR_STEPS.length - 1) {
          stopTimer();
          return s;
        }
        return s + 1;
      });
    }, stepMsFor(level));
    return stopTimer;
  }, [round, done, level]);

  if (!rounds || !rounds.length || !round) {
    return (
      <GameScreen title="Portada borrosa">
        <GameLoading error={error || (rounds !== null && !rounds.length)} onRetry={() => start()} />
      </GameScreen>
    );
  }

  if (done) {
    const max = rounds.length * BLUR_STEPS.length;
    return (
      <GameScreen title="Portada borrosa">
        <GameOver
          score={score}
          max={max}
          isRecord={false}
          level={level}
          passed={score >= pointsToPass(level)}
          passHint={`Necesitabas ${pointsToPass(level)} puntos para pasar. ¡Las portadas se te resisten, otra ronda!`}
          message="¡Ojo de halcón! En el siguiente nivel las portadas se aclaran más deprisa."
          onNextLevel={() => start(level + 1)}
          onReplay={() => start(level)}
        />
      </GameScreen>
    );
  }

  const answered = picked !== null;
  const points = BLUR_STEPS.length - step;
  const correct = picked === round.answer.book_id;

  const pick = (book: GameBook) => {
    if (answered) return;
    stopTimer();
    setPicked(book.book_id);
    if (book.book_id === round.answer.book_id) {
      setScore((s) => s + points);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const next = async () => {
    if (idx + 1 >= rounds.length) {
      if (score >= pointsToPass(level)) await setLevel("borrosa", level + 1);
      setDone(true);
      return;
    }
    setIdx(idx + 1);
    setStep(0);
    setPicked(null);
  };

  // Al responder se enseña la portada ya nítida.
  const blur = answered ? 0 : BLUR_STEPS[step];

  return (
    <GameScreen title="Portada borrosa" right={`${score} pts`} testID="game-borrosa"
      overlay={
        <ResultOverlay
          visible={answered}
          title={correct ? `¡Correcto! +${points}` : "¡Casi!"}
          color={correct ? colors.verdigris : colors.iron}
          subtitle={`"${round.answer.title}" de ${round.answer.author}`}
        >
          <GradientButton label={idx + 1 >= rounds.length ? "VER RESULTADO" : "SIGUIENTE"} icon="arrow-forward" onPress={next} testID="btn-next" />
        </ResultOverlay>
      }
    >
      <Text allowFontScaling={false} style={gameStyles.label}>NIVEL {level} · RONDA {idx + 1}/{rounds.length} · PASAS CON {pointsToPass(level)}</Text>
      <Image
        source={{ uri: blurUri(round.answer.book_id, cloudBlurFailed ? 0 : blur) }}
        blurRadius={cloudBlurFailed ? blur / 80 : 0}
        onError={() => {
          if (blur) setCloudBlurFailed(true);
        }}
        style={[gameStyles.cover, styles.cover, answered && { borderColor: correct ? colors.verdigris : colors.iron, borderWidth: 3 }]}
        resizeMode="cover"
        fadeDuration={0}
      />
      {!answered ? (
        <View style={styles.meter}>
          {BLUR_STEPS.map((_, i) => (
            <View key={i} style={[styles.meterDot, i >= step && { backgroundColor: colors.copper }]} />
          ))}
        </View>
      ) : null}
      <Text allowFontScaling={false} style={answered ? [styles.result, { color: correct ? colors.verdigris : colors.iron }] : gameStyles.muted}>
        {answered ? (correct ? `¡Correcto! +${points}` : `Era "${round.answer.title}"`) : `¿Qué libro es? Ahora vale ${points} ${points === 1 ? "punto" : "puntos"}`}
      </Text>

      {round.options.map((b) => {
        const isRight = b.book_id === round.answer.book_id;
        const style = answered ? (isRight ? styles.optRight : b.book_id === picked ? styles.optWrong : styles.optDim) : null;
        return (
          <TouchableOpacity key={b.book_id} onPress={() => pick(b)} disabled={answered} activeOpacity={0.8} style={[styles.opt, style]} testID={`blur-${b.book_id}`}>
            <Text allowFontScaling={false} style={styles.optText} numberOfLines={2}>{b.title}</Text>
          </TouchableOpacity>
        );
      })}

    </GameScreen>
  );
}

const styles = StyleSheet.create({
  cover: { width: COVER_W, height: COVER_H, alignSelf: "center" },
  meter: { flexDirection: "row", gap: 6, justifyContent: "center" },
  meterDot: { width: 24, height: 4, borderRadius: 2, backgroundColor: colors.border },
  opt: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, borderColor: "rgba(176,38,255,0.45)", backgroundColor: "rgba(176,38,255,0.07)" },
  optRight: { borderColor: colors.verdigris, backgroundColor: "rgba(0,255,163,0.10)" },
  optWrong: { borderColor: colors.iron, backgroundColor: "rgba(255,46,120,0.10)" },
  optDim: { opacity: 0.4 },
  optText: { color: colors.textOnDark, fontSize: 15, fontWeight: "700" },
  result: { textAlign: "center", fontSize: 16, fontWeight: "900" },
});
