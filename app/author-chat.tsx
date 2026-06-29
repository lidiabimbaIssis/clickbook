import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../src/lib/api";
import { colors } from "../src/theme";
import { useAuth } from "../src/providers/AuthProvider";
import PaywallModal from "../src/components/PaywallModal";

type Msg = { role: "user" | "assistant"; content: string };

export default function CharacterChat() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // character: nombre del personaje elegido en CharacterSelectModal, o
  // vacío/ausente cuando es modo Narrador Genérico (no ficción, o
  // sinopsis sin personajes detectados — ver resumen_chat_personajes.md).
  const params = useLocalSearchParams<{ book_id?: string; title?: string; character?: string }>();
  const bookId = (params.book_id || "").toString();
  const title = (params.title || "el libro").toString();
  const character = (params.character || "").toString(); // "" = narrador genérico
  const isNarrator = !character;

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const { user, refresh } = useAuth();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("character_chat_disclaimer_seen").then((val) => {
      if (!val) setShowDisclaimer(true);
    });
  }, []);

  // Saludo inicial: distinto según sea personaje o narrador. No se
  // inventa contenido de trama aquí — es solo un saludo genérico de
  // bienvenida, el contenido real de la conversación lo gestiona el
  // backend con la sinopsis real (ver prompt_identidad_personaje.md /
  // prompt_narrador_generico.md).
  useEffect(() => {
    const greeting = isNarrator
      ? `¡Hola! He leído "${title}" y me encanta comentarlo. ¿Qué te gustaría saber?`
      : `Hola, soy ${character}, de "${title}". ¿Qué quieres preguntarme?`;
    setMessages([{ role: "assistant", content: greeting }]);
  }, [character, title, isNarrator]);

  // Preguntas sugeridas: cacheadas en el backend por libro+personaje (o
  // por libro+narrador). Una sola llamada al entrar al chat.
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

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;

    // 🔒 Premium gate: bloqueamos el ENVÍO real, no la entrada al chat
    if (!user?.is_premium) {
      setPaywallOpen(true);
      return;
    }

    setInput("");
    const newHistory: Msg[] = [...messages, { role: "user", content: msg }];
    setMessages(newHistory);
    setSending(true);
    try {
      const res = await api<{ reply: string }>(`/books/${bookId}/character-chat`, {
        method: "POST",
        body: JSON.stringify({
          message: msg,
          history: messages,
          character: isNarrator ? null : character,
        }),
      });
      setMessages([...newHistory, { role: "assistant", content: res.reply }]);
    } catch (e: any) {
      const errStr = String(e?.message || "");
      const errMsg = errStr.includes("402")
        ? "Este chat es solo para usuarios Premium."
        : "No he podido responder. Inténtalo de nuevo.";
      setMessages([...newHistory, { role: "assistant", content: errMsg }]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const headerName = isNarrator ? "Guía del libro" : character;
  const headerSub = isNarrator
    ? `Comentamos las ideas · ${title}`
    : `IA inspirada en el personaje · ${title}`;
  const inputPlaceholder = isNarrator ? "Pregunta sobre el libro…" : `Pregunta a ${character}…`;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0} style={{ flex: 1, backgroundColor: colors.bgBase }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="btn-back-chat">
          <Ionicons name="chevron-back" size={22} color={colors.brass} />
        </TouchableOpacity>
        {/*
          Avatar genérico en el header: mismo principio que
          CharacterSelectModal (icono de persona, sin foto real — los
          personajes son ficticios, no hay foto que mostrar). El
          narrador genérico usa un icono de libro en vez de persona,
          para diferenciarlo visualmente.
        */}
        <View style={styles.headerAvatar}>
          <Ionicons name={isNarrator ? "book" : "person"} size={18} color={colors.brass} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{headerName}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>★ {headerSub}</Text>
        </View>
        <View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveText}>EN VIVO</Text></View>
      </View>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.messages} showsVerticalScrollIndicator={false}>
        {messages.map((m, i) => (
          <View key={i} style={[styles.bubble, m.role === "user" ? styles.bubbleUser : styles.bubbleAssistant]}>
            <Text style={m.role === "user" ? styles.textUser : styles.textAssistant}>{m.content}</Text>
          </View>
        ))}
        {sending && (
          <View style={[styles.bubble, styles.bubbleAssistant, styles.typingBubble]}>
            <ActivityIndicator size="small" color={colors.copper} />
            <Text style={styles.typing}>Escribiendo…</Text>
          </View>
        )}
      </ScrollView>
      {messages.length <= 1 && suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((s) => (
            <TouchableOpacity key={s} style={styles.chip} onPress={() => setInput(s)} testID={`chip-${s}`}>
              <Text style={styles.chipText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={[styles.inputRow, { paddingBottom: insets.bottom + 10 }]}>
        <TextInput testID="input-character-chat" value={input} onChangeText={setInput} placeholder={inputPlaceholder} placeholderTextColor={colors.textOnDarkMuted} style={styles.input} returnKeyType="send" onSubmitEditing={() => send()} editable={!sending} />
        <TouchableOpacity style={[styles.sendBtn, (!input.trim() || sending) && { opacity: 0.5 }]} onPress={() => send()} disabled={!input.trim() || sending} testID="btn-send-chat">
          <Ionicons name="send" size={18} color={colors.bgBase} />
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
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,240,255,0.12)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textOnDark, fontSize: 16, fontWeight: "800" },
  headerSub: { color: colors.copper, fontSize: 11, marginTop: 2, letterSpacing: 0.5 },
  live: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.verdigris },
  liveText: { color: colors.verdigris, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
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
  disclaimer: { margin: 16, padding: 16, backgroundColor: "rgba(176,38,255,0.15)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(176,38,255,0.4)", gap: 12 },
  disclaimerText: { color: colors.textOnDark, fontSize: 13, lineHeight: 20, textAlign: "center" },
  disclaimerBtn: { color: colors.copper, fontSize: 14, fontWeight: "800", textAlign: "center" },
});