import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Animated, Easing } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../src/lib/api";
import { colors } from "../src/theme";
import { useAuth } from "../src/providers/AuthProvider";
import PaywallModal from "../src/components/PaywallModal";

type Msg = { role: "user" | "assistant"; content: string };

const POSITION_COLORS = [
  { fg: colors.brass,     bg: "rgba(0,240,255,0.12)",  border: "rgba(0,240,255,0.3)"  },
  { fg: colors.copper,    bg: "rgba(176,38,255,0.12)", border: "rgba(176,38,255,0.3)" },
  { fg: colors.iron,      bg: "rgba(255,46,120,0.12)", border: "rgba(255,46,120,0.3)" },
  { fg: colors.verdigris, bg: "rgba(0,255,163,0.12)",  border: "rgba(0,255,163,0.3)"  },
  { fg: colors.gold,      bg: "rgba(255,210,63,0.12)", border: "rgba(255,210,63,0.3)"  },
];

function CharacterAvatar({ character, isNarrator, colorIndex }: { character: string; isNarrator: boolean; colorIndex?: number }) {
  const initial = character.trim().charAt(0).toUpperCase();
  const avatarStyle = isNarrator
    ? { fg: colors.textOnDarkMuted, bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.15)" }
    : POSITION_COLORS[(colorIndex ?? 0) % POSITION_COLORS.length];

  return (
    <View style={[styles.headerAvatar, { backgroundColor: avatarStyle.bg, borderColor: avatarStyle.border, borderWidth: 1 }]}>
      {isNarrator ? (
        <Ionicons name="book" size={18} color={avatarStyle.fg} />
      ) : (
        <Text style={[styles.headerAvatarInitial, { color: avatarStyle.fg }]}>{initial}</Text>
      )}
    </View>
  );
}

// Tres puntitos animados estilo WhatsApp para el estado "escribiendo..."
function TypingDots() {
  const dot1 = React.useRef(new Animated.Value(0)).current;
  const dot2 = React.useRef(new Animated.Value(0)).current;
  const dot3 = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, easing: Easing.ease, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, easing: Easing.ease, useNativeDriver: true }),
          Animated.delay(600 - delay),
        ])
      );
    animate(dot1, 0).start();
    animate(dot2, 200).start();
    animate(dot3, 400).start();
  }, [dot1, dot2, dot3]);

  const dotStyle = (anim: Animated.Value) => ({
    opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
  });

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4 }}>
      <Animated.View style={[typingDotStyle, dotStyle(dot1)]} />
      <Animated.View style={[typingDotStyle, dotStyle(dot2)]} />
      <Animated.View style={[typingDotStyle, dotStyle(dot3)]} />
    </View>
  );
}

const typingDotStyle = {
  width: 8, height: 8, borderRadius: 4, backgroundColor: "#B026FF",
};

export default function CharacterChat() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ book_id?: string; title?: string; character?: string; colorIndex?: string }>();
  const bookId = (params.book_id || "").toString();
  const title = (params.title || "el libro").toString();
  const character = (params.character || "").toString();
  const colorIndex = parseInt((params.colorIndex || "0").toString(), 10);
  const isNarrator = !character;

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const { user, refresh } = useAuth();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  // Límite de 3 preguntas gratis, de por vida (no por libro, no se
  // resetea) para usuarios no premium. El contador real vive en el
  // backend (igual que hookRemaining en Discover) — este estado solo
  // refleja lo que el servidor nos dice, nunca decide por su cuenta.
  // null mientras no se sabe todavía o si el usuario es premium
  // (en cuyo caso no hay límite y no se muestra nada).
  const [chatRemaining, setChatRemaining] = useState<number | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("character_chat_disclaimer_seen").then((val) => {
      if (!val) setShowDisclaimer(true);
    });
  }, []);

  useEffect(() => {
    const greeting = isNarrator
      ? `¡Hola! He leído "${title}" y me encanta comentarlo. ¿Qué te gustaría saber?`
      : `Hola, soy ${character}, de "${title}". ¿Qué quieres preguntarme?`;
    setMessages([{ role: "assistant", content: greeting }]);
  }, [character, title, isNarrator]);

  useEffect(() => {
    if (!bookId) return;
    (async () => {
      try {
        const query = isNarrator ? "" : `?character=${encodeURIComponent(character)}`;
        const res = await api<{ questions: string[] }>(`/books/${bookId}/character-questions${query}`);
        setSuggestions(res?.questions || []);
      } catch (e) {
        console.warn("suggested questions fetch failed", e);
      }
    })();
  }, [bookId, character, isNarrator]);

  // Consulta cuántas preguntas gratis le quedan al usuario, ANTES de que
  // intente escribir nada — así el guard de send() ya sabe si debe dejar
  // pasar o mostrar el paywall directamente, sin esperar a un 402.
  useEffect(() => {
    if (user?.is_premium) return; // premium no tiene límite, no hace falta consultar
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ is_premium: boolean; remaining: number | null }>("/me/chat-usage");
        if (cancelled) return;
        setChatRemaining(res.remaining ?? null);
      } catch (e) {
        console.warn("chat usage fetch failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.is_premium]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;

    // Antes: si no eras premium, paywall directo, sin excepciones.
    // Ahora: si no eres premium, se te dejan 3 preguntas gratis (de por
    // vida, no por libro). Solo salta el paywall cuando chatRemaining
    // llega a 0. Si chatRemaining es null (todavía no se ha consultado,
    // o falló la consulta), dejamos pasar y es el backend quien decide
    // con el 402 — nunca bloqueamos a ciegas por un dato que no tenemos.
    if (!user?.is_premium && chatRemaining !== null && chatRemaining <= 0) {
      setPaywallOpen(true);
      return;
    }

    setInput("");
    const newHistory: Msg[] = [...messages, { role: "user", content: msg }];
    setMessages(newHistory);
    setSending(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const res = await api<{ reply: string; chat_remaining?: number }>(`/books/${bookId}/character-chat`, {
        method: "POST",
        body: JSON.stringify({
          message: msg,
          history: messages,
          character: isNarrator ? null : character,
        }),
      });
      setMessages([...newHistory, { role: "assistant", content: res.reply }]);
      // El backend es la única fuente de verdad del contador — si viene
      // en la respuesta, actualizamos el estado local con ese valor real.
      if (typeof res.chat_remaining === "number") {
        setChatRemaining(res.chat_remaining);
      }
    } catch (e: any) {
      const errStr = String(e?.message || "");
      if (errStr.includes("402")) {
        // El backend confirma que ya no quedan preguntas gratis — nos
        // aseguramos de que el contador local también quede en 0, por si
        // se nos había desincronizado, y mostramos el paywall.
        setChatRemaining(0);
        setPaywallOpen(true);
      } else {
        const errMsg = "No he podido responder. Inténtalo de nuevo.";
        setMessages([...newHistory, { role: "assistant", content: errMsg }]);
      }
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 400);
    }
  };

  const headerName = isNarrator ? "Guía del libro" : character;
  const headerSub = isNarrator
    ? `Comentamos las ideas · ${title}`
    : `IA inspirada en el personaje · ${title}`;
  const inputPlaceholder = isNarrator ? "Pregunta sobre el libro…" : `Pregunta a ${character}…`;

  // Aviso sutil de preguntas gratis restantes — solo se muestra si no
  // eres premium y ya sabemos el número real (nunca durante el instante
  // en que chatRemaining todavía es null).
  const showRemainingBadge = !user?.is_premium && chatRemaining !== null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.bgBase }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="btn-back-chat">
          <Ionicons name="chevron-back" size={22} color={colors.brass} />
        </TouchableOpacity>
        <CharacterAvatar character={character} isNarrator={isNarrator} colorIndex={colorIndex} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{headerName}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>★ {headerSub}</Text>
        </View>
        {showRemainingBadge ? (
          <View style={styles.remainingBadge} testID="chat-remaining-badge">
            <Ionicons name="diamond" size={11} color={colors.gold} />
            <Text style={styles.remainingBadgeText}>{chatRemaining}</Text>
          </View>
        ) : (
          <View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveText}>EN VIVO</Text></View>
        )}
      </View>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.messages} showsVerticalScrollIndicator={false}>
        {messages.map((m, i) => (
          <View key={i} style={[styles.bubble, m.role === "user" ? styles.bubbleUser : styles.bubbleAssistant]}>
            <Text style={m.role === "user" ? styles.textUser : styles.textAssistant}>{m.content}</Text>
          </View>
        ))}
        {sending && (
          <View style={[styles.bubble, styles.bubbleAssistant, { flexDirection: "row", alignItems: "center", gap: 8 }]}>
            <TypingDots />
          </View>
        )}
      </ScrollView>
      {messages.length <= 1 && suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((s) => (
            <TouchableOpacity key={s} style={styles.chip} onPress={() => send(s)} testID={`chip-${s}`}>
              <Text style={styles.chipText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={[styles.inputRow, { paddingBottom: insets.bottom + 10 }]}>
        <TextInput
          testID="input-character-chat"
          value={input}
          onChangeText={setInput}
          placeholder={inputPlaceholder}
          placeholderTextColor={colors.textOnDarkMuted}
          style={styles.input}
          returnKeyType="send"
          onSubmitEditing={() => send()}
          editable={!sending}
          multiline={true}
        />
        {/* Botón enviar: rosa cuando está enviando, cian cuando está listo */}
        <TouchableOpacity
          style={[styles.sendBtn, sending && styles.sendBtnSending, (!input.trim() && !sending) && { opacity: 0.5 }]}
          onPress={() => send()}
          disabled={!input.trim() || sending}
          testID="btn-send-chat"
        >
          {sending
            ? <ActivityIndicator size="small" color={colors.bgBase} />
            : <Ionicons name="send" size={18} color={colors.bgBase} />
          }
        </TouchableOpacity>
      </View>
      {showDisclaimer && (
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            Esta conversación es generada por IA y no representa declaraciones reales del autor.
          </Text>
          <TouchableOpacity onPress={async () => {
            await AsyncStorage.setItem("character_chat_disclaimer_seen", "true");
            setShowDisclaimer(false);
          }}>
            <Text style={styles.disclaimerBtn}>Entendido</Text>
          </TouchableOpacity>
        </View>
      )}
      <PaywallModal
        visible={paywallOpen}
        reason="chat"
        onClose={() => setPaywallOpen(false)}
        onUpgraded={async () => { await refresh(); }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.brassSoft, alignItems: "center", justifyContent: "center" },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  headerAvatarInitial: { fontSize: 18, fontWeight: "900" },
  headerTitle: { color: colors.textOnDark, fontSize: 16, fontWeight: "800" },
  headerSub: { color: colors.copper, fontSize: 11, marginTop: 2, letterSpacing: 0.5 },
  live: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.verdigris },
  liveText: { color: colors.verdigris, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  // Badge de preguntas gratis restantes — mismo estilo "pill" oscuro que
  // el resto de indicadores de la app, con el diamante dorado (icono ya
  // usado en el paywall) para que se entienda de un vistazo que es algo
  // relacionado con Premium.
  remainingBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.brassSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  remainingBadgeText: { color: colors.gold, fontSize: 11, fontWeight: "900" },
  messages: { padding: 16, gap: 10 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, maxWidth: "85%" },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: colors.brass, borderBottomRightRadius: 4 },
  bubbleAssistant: { alignSelf: "flex-start", backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: "rgba(176,38,255,0.4)", borderBottomLeftRadius: 4 },
  textUser: { color: colors.bgBase, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  textAssistant: { color: colors.textOnDark, fontSize: 14, lineHeight: 20 },
  typingBubble: { flexDirection: "row", alignItems: "center", gap: 8 },
  typing: { color: colors.copper, fontSize: 12, fontStyle: "italic" },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  chip: { borderWidth: 1, borderColor: colors.brassSoft, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "rgba(0,240,255,0.06)" },
  chipText: { color: colors.brass, fontSize: 12, fontWeight: "700" },
  inputRow: { flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "center" },
  input: { flex: 1, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.brassSoft, borderRadius: 999, paddingHorizontal: 16, paddingVertical: Platform.OS === "web" ? 12 : 10, color: colors.textOnDark, fontSize: 14, outlineWidth: 0 as any },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brass, alignItems: "center", justifyContent: "center" },
  sendBtnSending: { backgroundColor: colors.iron },
  disclaimer: { margin: 16, padding: 16, backgroundColor: "rgba(176,38,255,0.15)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(176,38,255,0.4)", gap: 12 },
  disclaimerText: { color: colors.textOnDark, fontSize: 13, lineHeight: 20, textAlign: "center" },
  disclaimerBtn: { color: colors.copper, fontSize: 14, fontWeight: "800", textAlign: "center" },
});