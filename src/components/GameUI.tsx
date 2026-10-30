import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Animated, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme";
import PaywallModal from "./PaywallModal";
import { useAuth } from "../providers/AuthProvider";
import { requestGamePlay } from "../lib/games";

// Piezas comunes de los minijuegos: fondo con degradado, cabecera con la
// flechita de volver (sin recuadro, mismo criterio que el resto de la
// app), y botón con borde degradado azul→morado como los de Home.

export function GameScreen({
  title,
  right,
  children,
  scroll = true,
  testID,
  overlay,
}: {
  title: string;
  right?: string;
  children: React.ReactNode;
  scroll?: boolean;
  testID?: string;
  // Capa que se pinta encima de todo (ver ResultOverlay).
  overlay?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const body = scroll ? (
    <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.body, { flex: 1, paddingBottom: insets.bottom + 16 }]}>{children}</View>
  );
  return (
    <LinearGradient colors={colors.bgGradient} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ flex: 1 }} testID={testID}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/juegos"))}
          style={styles.backBtn}
          testID="btn-back-game"
        >
          <Ionicons allowFontScaling={false} name="chevron-back" size={20} color={colors.brass} />
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.title} numberOfLines={1}>{title}</Text>
        {right ? <Text allowFontScaling={false} style={styles.right}>{right}</Text> : <View style={{ width: 38 }} />}
      </View>
      {body}
      {overlay}
    </LinearGradient>
  );
}

// Resultado de cada ronda en el centro de la pantalla, con el fondo
// desenfocado y el botón de seguir a mano. Aparece con un pequeño
// retraso para que antes se vea en el juego qué era lo correcto.
export function ResultOverlay({
  visible,
  title,
  color = colors.textOnDark,
  subtitle,
  children,
  delay = 700,
}: {
  visible: boolean;
  title: string;
  color?: string;
  subtitle?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  const [shown, setShown] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      setShown(false);
      opacity.setValue(0);
      return;
    }
    const t = setTimeout(() => {
      setShown(true);
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }, delay);
    return () => clearTimeout(t);
  }, [visible, delay, opacity]);

  if (!visible || !shown) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, { opacity }]}>
      <BlurView
        intensity={40}
        tint="dark"
        // En Android, sin esto BlurView solo oscurece sin desenfocar.
        experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, styles.overlayDim]} />
      <LinearGradient colors={[colors.brass, colors.copper]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.overlayBorder}>
        <View style={styles.overlayCard}>
          <Text allowFontScaling={false} style={[styles.overlayTitle, { color }]}>{title}</Text>
          {subtitle ? <Text allowFontScaling={false} style={styles.overlaySub}>{subtitle}</Text> : null}
          <View style={{ height: 6 }} />
          {children}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export function GradientButton({
  label,
  onPress,
  icon,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  icon?: any;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.85} style={{ opacity: disabled ? 0.4 : 1 }} testID={testID}>
      <LinearGradient colors={[colors.brass, colors.copper]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnBorder}>
        <View style={styles.btnInner}>
          {icon ? <Ionicons allowFontScaling={false} name={icon} size={16} color={colors.brass} /> : null}
          <Text allowFontScaling={false} style={styles.btnText}>{label}</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export function GameLoading({ error, onRetry }: { error?: boolean; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      {error ? (
        <>
          <Text allowFontScaling={false} style={styles.muted}>No se han podido cargar los libros. Revisa la conexión.</Text>
          {onRetry ? <GradientButton label="REINTENTAR" icon="refresh" onPress={onRetry} /> : null}
        </>
      ) : (
        <ActivityIndicator size="large" color={colors.brass} />
      )}
    </View>
  );
}

// Antes de empezar una partida nueva se pide permiso al servidor (3
// partidas gratis al día). Si ya no quedan, se abre el PaywallModal en
// vez de ejecutar `fn`. `paywall` hay que pintarlo en la pantalla.
export function usePlayGate() {
  const { refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const gate = useCallback(async (fn: () => void) => {
    if ((await requestGamePlay()) === "limit") setOpen(true);
    else fn();
  }, []);
  const paywall = <PaywallModal visible={open} onClose={() => setOpen(false)} reason="games" onUpgraded={() => refresh()} />;
  return { gate, paywall };
}

// Pantalla de final de partida, común a los juegos por rondas.
// Con `level`: si se supera, botón al nivel siguiente (sigue siendo la
// misma partida, no gasta otra); si no, reintentar el nivel, que sí
// cuenta como partida nueva, igual que "Jugar otra vez".
export function GameOver({
  score,
  max,
  isRecord,
  message,
  onReplay,
  level,
  passed,
  passHint,
  onNextLevel,
}: {
  score: number;
  max?: number;
  isRecord: boolean;
  message: string;
  onReplay: () => void;
  level?: number;
  passed?: boolean;
  passHint?: string;
  onNextLevel?: () => void;
}) {
  const { gate, paywall } = usePlayGate();
  const hasLevel = typeof level === "number";
  return (
    <View style={styles.center}>
      <Text allowFontScaling={false} style={styles.bigEmoji}>{hasLevel ? (passed ? "🏆" : "📚") : isRecord ? "🏆" : "📚"}</Text>
      {hasLevel ? (
        <Text allowFontScaling={false} style={[styles.levelResult, { color: passed ? colors.verdigris : colors.iron }]}>
          {passed ? `¡NIVEL ${level} SUPERADO!` : `NIVEL ${level} NO SUPERADO`}
        </Text>
      ) : null}
      <Text allowFontScaling={false} style={styles.scoreBig}>
        {score}
        {max ? <Text style={styles.scoreMax}> / {max}</Text> : null}
      </Text>
      {isRecord ? <Text allowFontScaling={false} style={styles.record}>¡NUEVO RÉCORD!</Text> : null}
      <Text allowFontScaling={false} style={styles.message}>{hasLevel && !passed && passHint ? passHint : message}</Text>
      <View style={{ height: 20 }} />
      {hasLevel && passed && onNextLevel ? (
        <GradientButton label={`NIVEL ${(level || 0) + 1}`} icon="arrow-up" onPress={onNextLevel} testID="btn-next-level" />
      ) : (
        <GradientButton
          label={hasLevel ? `REINTENTAR NIVEL ${level}` : "JUGAR OTRA VEZ"}
          icon="refresh"
          onPress={() => gate(onReplay)}
          testID="btn-replay"
        />
      )}
      {paywall}
    </View>
  );
}

export const gameStyles = StyleSheet.create({
  cover: { borderRadius: 10, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.border },
  card: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSurface, padding: 16 },
  label: { color: colors.textOnDarkMuted, fontSize: 10, letterSpacing: 3, fontWeight: "800" },
  question: { color: colors.textOnDark, fontSize: 18, fontWeight: "900", textAlign: "center" },
  muted: { color: colors.textOnDarkMuted, fontSize: 13, textAlign: "center" },
});

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, color: colors.textOnDark, fontSize: 17, fontWeight: "900", textAlign: "center" },
  right: { minWidth: 38, color: colors.brass, fontSize: 13, fontWeight: "800", textAlign: "right" },
  body: { padding: 16, gap: 14 },
  overlay: { alignItems: "center", justifyContent: "center", padding: 28 },
  overlayDim: { backgroundColor: "rgba(0,0,0,0.35)" },
  overlayBorder: { borderRadius: 20, padding: 1.5, alignSelf: "stretch" },
  overlayCard: { borderRadius: 18.5, backgroundColor: colors.bgSurface, padding: 22, gap: 10 },
  overlayTitle: { fontSize: 20, fontWeight: "900", textAlign: "center" },
  overlaySub: { color: colors.textOnDarkMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  btnBorder: { borderRadius: 14, padding: 1.5 },
  btnInner: { borderRadius: 12.5, backgroundColor: colors.bgSurface, paddingVertical: 14, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  btnText: { color: colors.textOnDark, fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, minHeight: 400 },
  muted: { color: colors.textOnDarkMuted, fontSize: 14, textAlign: "center" },
  bigEmoji: { fontSize: 56 },
  scoreBig: { color: colors.textOnDark, fontSize: 48, fontWeight: "900" },
  scoreMax: { color: colors.textOnDarkMuted, fontSize: 24, fontWeight: "700" },
  levelResult: { fontSize: 14, fontWeight: "900", letterSpacing: 2.5, textAlign: "center" },
  record: { color: colors.gold, fontSize: 13, fontWeight: "900", letterSpacing: 3 },
  message: { color: colors.textOnDarkMuted, fontSize: 15, textAlign: "center", lineHeight: 21 },
});
