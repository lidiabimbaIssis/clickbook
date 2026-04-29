import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  PanResponder,
  ActivityIndicator,
  Platform,
  Linking,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { createAudioPlayer } from "expo-audio";
import { api, Book } from "../../src/lib/api";
import { useAuth } from "../../src/providers/AuthProvider";
import { colors } from "../../src/theme";

const SWIPE_THRESHOLD = 110;

type Mode = "cover" | "ficha" | "summary";

export default function Discover() {
  const { user } = useAuth();
  const lang = (user?.lang || "es") as "es" | "en";
  const insets = useSafeAreaInsets();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("cover");
  const [audioLoading, setAudioLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<any>(null);

  const pan = useRef(new Animated.ValueXY()).current;

  const resetPan = () => {
    Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 6 }).start();
  };

  const stopAudio = useCallback(() => {
    try {
      playerRef.current?.pause?.();
      playerRef.current?.remove?.();
    } catch {}
    playerRef.current = null;
    setPlaying(false);
  }, []);

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ books: Book[] }>("/books/feed?count=5");
      setBooks((prev) => {
        const existingIds = new Set(prev.map((b) => b.book_id));
        const incoming = res.books.filter((b) => !existingIds.has(b.book_id));
        return [...prev, ...incoming];
      });
    } catch (e) {
      console.warn("feed error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBooks();
    return () => stopAudio();
  }, [fetchBooks, stopAudio]);

  const current = books[0];

  const handleSwipe = async (dir: "left" | "right") => {
    if (!current) return;
    const toValue = { x: dir === "right" ? 600 : -600, y: 0 };
    Animated.timing(pan, { toValue, duration: 260, useNativeDriver: false }).start(() => {
      setBooks((prev) => prev.slice(1));
      pan.setValue({ x: 0, y: 0 });
      setMode("cover");
      stopAudio();
    });
    try {
      await api("/books/interact", {
        method: "POST",
        body: JSON.stringify({ book_id: current.book_id, action: dir === "right" ? "like" : "dislike" }),
      });
    } catch {}
    if (books.length <= 2) fetchBooks();
  };

  const handleVerticalSwipe = (dir: "up" | "down") => {
    if (dir === "up") setMode((m) => (m === "ficha" ? "cover" : "ficha"));
    else setMode((m) => (m === "summary" ? "cover" : "summary"));
    resetPan();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) handleSwipe("right");
        else if (g.dx < -SWIPE_THRESHOLD) handleSwipe("left");
        else if (g.dy < -SWIPE_THRESHOLD) handleVerticalSwipe("up");
        else if (g.dy > SWIPE_THRESHOLD) handleVerticalSwipe("down");
        else resetPan();
      },
    })
  ).current;

  const rotate = pan.x.interpolate({ inputRange: [-400, 0, 400], outputRange: ["-18deg", "0deg", "18deg"] });
  const likeOpacity = pan.x.interpolate({ inputRange: [0, 120], outputRange: [0, 1], extrapolate: "clamp" });
  const nopeOpacity = pan.x.interpolate({ inputRange: [-120, 0], outputRange: [1, 0], extrapolate: "clamp" });

  const playAudio = async () => {
    if (!current) return;
    if (playing) {
      stopAudio();
      return;
    }
    setAudioLoading(true);
    try {
      const text = lang === "es" ? current.summary_es : current.summary_en;
      const res = await api<{ audio_base64: string; mime: string }>("/tts", {
        method: "POST",
        body: JSON.stringify({ text, voice: "fable" }),
      });
      const uri = `data:${res.mime};base64,${res.audio_base64}`;
      const p = createAudioPlayer({ uri });
      playerRef.current = p;
      p.addListener("playbackStatusUpdate", (st: any) => {
        if (st.didJustFinish) {
          stopAudio();
        }
      });
      p.play();
      setPlaying(true);
    } catch (e) {
      console.warn("audio error", e);
    } finally {
      setAudioLoading(false);
    }
  };

  const openStore = (url: string) => {
    if (Platform.OS === "web" && typeof window !== "undefined") window.open(url, "_blank");
    else Linking.openURL(url);
  };

  if (loading && books.length === 0) {
    return (
      <View style={styles.center} testID="discover-loading">
        <ActivityIndicator size="large" color={colors.brass} />
        <Text style={styles.loadingText}>Calentando las calderas…</Text>
      </View>
    );
  }

  if (!current) {
    return (
      <View style={styles.center} testID="discover-empty">
        <Ionicons name="cog-outline" size={64} color={colors.brass} />
        <Text style={styles.emptyTitle}>No quedan libros por descubrir</Text>
        <TouchableOpacity
          style={styles.reloadBtn}
          testID="btn-reload-feed"
          onPress={async () => {
            await api("/books/reset", { method: "POST" });
            fetchBooks();
          }}
        >
          <Text style={styles.reloadText}>Reiniciar mazo</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]} testID="discover-screen">
      <View style={styles.topBar}>
        <View style={styles.gearRow}>
          <Ionicons name="cog" size={18} color={colors.brass} />
          <Text style={styles.brand}>VAPOR & TINTA</Text>
          <Ionicons name="cog" size={18} color={colors.brass} />
        </View>
        <Text style={styles.modeHint}>
          {mode === "cover" ? "← descartar · → favorito · ↑ ficha · ↓ resumen" : mode === "ficha" ? "FICHA TÉCNICA ↑↓" : "RESUMEN 1 MIN ↑↓"}
        </Text>
      </View>

      <View style={styles.stack}>
        {books[1] && <StaticCard book={books[1]} depth={1} />}
        <Animated.View
          testID="swipe-card"
          style={[
            styles.card,
            { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] },
          ]}
          {...panResponder.panHandlers}
        >
          <Animated.View style={[styles.stampLike, { opacity: likeOpacity }]}>
            <Text style={styles.stampLikeText}>GUARDADO</Text>
          </Animated.View>
          <Animated.View style={[styles.stampNope, { opacity: nopeOpacity }]}>
            <Text style={styles.stampNopeText}>DESCARTADO</Text>
          </Animated.View>

          {mode === "cover" && <CoverView book={current} lang={lang} />}
          {mode === "ficha" && <FichaView book={current} />}
          {mode === "summary" && (
            <SummaryView
              book={current}
              lang={lang}
              playing={playing}
              audioLoading={audioLoading}
              onPlay={playAudio}
            />
          )}
        </Animated.View>
      </View>

      <View style={[styles.actions, { paddingBottom: 8 }]}>
        <CircleBtn icon="close" color={colors.iron} onPress={() => handleSwipe("left")} testID="btn-discard" />
        <CircleBtn icon="arrow-up" color={colors.brass} onPress={() => handleVerticalSwipe("up")} small testID="btn-ficha" />
        <CircleBtn icon="arrow-down" color={colors.brass} onPress={() => handleVerticalSwipe("down")} small testID="btn-summary" />
        <CircleBtn icon="heart" color={colors.verdigris} onPress={() => handleSwipe("right")} testID="btn-like" />
      </View>

      <View style={styles.buyRow}>
        <BuyBtn label="Amazon" onPress={() => openStore(current.amazon_url)} testID="btn-buy-amazon" />
        <BuyBtn label="Casa del Libro" onPress={() => openStore(current.casa_del_libro_url)} testID="btn-buy-casa" />
        <BuyBtn label="Google Books" onPress={() => openStore(current.google_books_url)} testID="btn-buy-google" />
      </View>
    </View>
  );
}

function CoverView({ book, lang }: { book: Book; lang: "es" | "en" }) {
  const synopsis = lang === "es" ? book.synopsis_es : book.synopsis_en;
  return (
    <View style={styles.coverWrap}>
      <Image source={{ uri: book.cover_url }} style={styles.cover} resizeMode="cover" />
      <View style={styles.coverOverlay} />
      <View style={styles.coverInfo}>
        <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
        <Text style={styles.bookAuthor}>{book.author} · {book.year}</Text>
        <View style={styles.chips}>
          <Chip label={book.genre} />
          <Chip label={`${book.pages} pág.`} />
          <Chip label={`★ ${book.rating.toFixed(1)}`} />
        </View>
        <Text style={styles.synopsis} numberOfLines={5}>{synopsis}</Text>
      </View>
    </View>
  );
}

function FichaView({ book }: { book: Book }) {
  return (
    <View style={styles.parchment} testID="ficha-view">
      <Text style={styles.parchmentHeader}>FICHA TÉCNICA</Text>
      <View style={styles.divider2} />
      <Text style={styles.parchmentTitle}>{book.title}</Text>
      <Text style={styles.parchmentAuthor}>por {book.author}</Text>
      <View style={styles.fichaGrid}>
        <FichaRow label="Año" value={String(book.year)} />
        <FichaRow label="Género" value={book.genre} />
        <FichaRow label="Páginas" value={String(book.pages)} />
        <FichaRow label="Valoración" value={`★ ${book.rating.toFixed(1)} / 5`} />
      </View>
    </View>
  );
}

function SummaryView({
  book,
  lang,
  playing,
  audioLoading,
  onPlay,
}: {
  book: Book;
  lang: "es" | "en";
  playing: boolean;
  audioLoading: boolean;
  onPlay: () => void;
}) {
  const text = lang === "es" ? book.summary_es : book.summary_en;
  return (
    <View style={styles.parchment} testID="summary-view">
      <View style={styles.summaryHeader}>
        <Text style={styles.parchmentHeader}>RESUMEN · 1 MIN</Text>
        <TouchableOpacity
          testID="btn-play-audio"
          onPress={onPlay}
          style={styles.playBtn}
          disabled={audioLoading}
        >
          {audioLoading ? (
            <ActivityIndicator size="small" color={colors.brass} />
          ) : (
            <Ionicons name={playing ? "pause" : "play"} size={22} color={colors.brass} />
          )}
        </TouchableOpacity>
      </View>
      <View style={styles.divider2} />
      <Text style={styles.parchmentTitle}>{book.title}</Text>
      <ScrollView style={{ marginTop: 12 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.summaryText}>{text}</Text>
      </ScrollView>
    </View>
  );
}

function FichaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fichaRow}>
      <Text style={styles.fichaLabel}>{label}</Text>
      <Text style={styles.fichaValue}>{value}</Text>
    </View>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

function CircleBtn({
  icon,
  color,
  onPress,
  small,
  testID,
}: {
  icon: any;
  color: string;
  onPress: () => void;
  small?: boolean;
  testID?: string;
}) {
  const size = small ? 48 : 60;
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.circleBtn,
        { width: size, height: size, borderRadius: size / 2, borderColor: color },
      ]}
    >
      <Ionicons name={icon} size={small ? 20 : 26} color={color} />
    </TouchableOpacity>
  );
}

function BuyBtn({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity testID={testID} style={styles.buyBtn} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name="cart" size={14} color={colors.brass} />
      <Text style={styles.buyText}>{label}</Text>
    </TouchableOpacity>
  );
}

function StaticCard({ book, depth }: { book: Book; depth: number }) {
  return (
    <View style={[styles.card, styles.cardBehind, { transform: [{ scale: 1 - depth * 0.04 }, { translateY: depth * 10 }] }]}>
      <Image source={{ uri: book.cover_url }} style={styles.cover} resizeMode="cover" />
      <View style={styles.coverOverlay} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase, paddingHorizontal: 16 },
  center: { flex: 1, backgroundColor: colors.bgBase, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingText: { color: colors.textOnDarkMuted, marginTop: 14, letterSpacing: 1 },
  emptyTitle: { color: colors.textOnDark, fontSize: 18, marginTop: 12, textAlign: "center" },
  reloadBtn: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: colors.brass,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
  },
  reloadText: { color: colors.brass, letterSpacing: 2, fontWeight: "700" },
  topBar: { alignItems: "center", paddingVertical: 8 },
  gearRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brand: {
    color: colors.brass,
    fontWeight: "900",
    fontSize: 15,
    letterSpacing: 5,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
  },
  modeHint: { color: colors.textOnDarkMuted, fontSize: 11, marginTop: 6, letterSpacing: 1.5 },
  stack: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  card: {
    width: "100%",
    maxWidth: 420,
    height: "100%",
    maxHeight: 560,
    borderRadius: 22,
    backgroundColor: colors.bgSurface,
    borderWidth: 3,
    borderColor: colors.bgSurfaceLight,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
    position: "absolute",
  },
  cardBehind: { opacity: 0.6 },
  coverWrap: { flex: 1 },
  cover: { width: "100%", height: "100%" },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(18,14,10,0.55)",
  },
  coverInfo: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, gap: 8 },
  bookTitle: {
    color: colors.textOnDark,
    fontSize: 24,
    fontWeight: "800",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
  },
  bookAuthor: { color: colors.brass, fontSize: 14, letterSpacing: 1 },
  chips: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 },
  chip: {
    backgroundColor: "rgba(196,139,71,0.15)",
    borderWidth: 1,
    borderColor: colors.brassSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipText: { color: colors.brass, fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  synopsis: { color: colors.textOnDark, fontSize: 13, lineHeight: 19, marginTop: 8, opacity: 0.92 },
  parchment: {
    flex: 1,
    backgroundColor: colors.parchment,
    padding: 24,
    borderWidth: 4,
    borderColor: colors.brass,
  },
  parchmentHeader: {
    color: colors.copper,
    letterSpacing: 4,
    fontSize: 12,
    fontWeight: "900",
  },
  divider2: { height: 1, backgroundColor: colors.copper, opacity: 0.4, marginVertical: 10 },
  parchmentTitle: {
    color: colors.textOnLight,
    fontSize: 24,
    fontWeight: "800",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
  },
  parchmentAuthor: { color: colors.textOnLightMuted, fontSize: 14, marginTop: 4, fontStyle: "italic" },
  fichaGrid: { marginTop: 20, gap: 10 },
  fichaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(123,59,28,0.2)",
    paddingVertical: 10,
  },
  fichaLabel: { color: colors.textOnLightMuted, letterSpacing: 2, fontSize: 11, fontWeight: "800" },
  fichaValue: {
    color: colors.textOnLight,
    fontSize: 15,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontWeight: "700",
  },
  summaryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.brass,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgBase,
  },
  summaryText: { color: colors.textOnLight, fontSize: 15, lineHeight: 23 },
  stampLike: {
    position: "absolute",
    top: 28,
    left: 20,
    transform: [{ rotate: "-12deg" }],
    borderWidth: 3,
    borderColor: colors.verdigris,
    paddingHorizontal: 14,
    paddingVertical: 6,
    zIndex: 5,
  },
  stampLikeText: { color: colors.verdigris, fontWeight: "900", fontSize: 18, letterSpacing: 2 },
  stampNope: {
    position: "absolute",
    top: 28,
    right: 20,
    transform: [{ rotate: "12deg" }],
    borderWidth: 3,
    borderColor: colors.iron,
    paddingHorizontal: 14,
    paddingVertical: 6,
    zIndex: 5,
  },
  stampNopeText: { color: colors.iron, fontWeight: "900", fontSize: 18, letterSpacing: 2 },
  actions: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  circleBtn: {
    borderWidth: 2,
    backgroundColor: colors.bgSurface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  buyRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 6,
    flexWrap: "wrap",
  },
  buyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.brassSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.bgSurface,
  },
  buyText: { color: colors.brass, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
});
