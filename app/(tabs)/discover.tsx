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
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, Book } from "../../src/lib/api";
import { useAuth } from "../../src/providers/AuthProvider";
import { colors } from "../../src/theme";
import PaywallModal from "../../src/components/PaywallModal";
import { shareContent } from "../../src/lib/share";
import Logo from "../../src/components/Logo";

const SWIPE_THRESHOLD = 110;

type Mode = "cover" | "ficha" | "summary";

export default function Discover() {
  const { user, refresh: refreshAuth } = useAuth();
  const lang = (user?.lang || "es") as "es" | "en";
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const query = (params.q || "").toString();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("cover");
  const [audioLoading, setAudioLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [premiumSummaries, setPremiumSummaries] = useState<Record<string, string>>({});
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<"limit" | "chat" | "general">("limit");
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
      const qp = query ? `&query=${encodeURIComponent(query)}` : "";
      const res = await api<{ books: Book[] }>(`/books/feed?count=5${qp}`);
      setBooks((prev) => {
        const existingIds = new Set(prev.map((b) => b.book_id));
        const incoming = (res?.books || []).filter((b) => !existingIds.has(b.book_id));
        return [...prev, ...incoming];
      });
    } catch (e) {
      console.warn("feed error", e);
      // Show empty state instead of crashing
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    // Reset books cuando cambia la query (busqueda nueva o mood)
    setBooks([]);
    setMode("cover");
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
    const nextMode: Mode = dir === "up" ? (mode === "ficha" ? "cover" : "ficha") : mode === "summary" ? "cover" : "summary";
    const exitY = dir === "up" ? -800 : 800;
    Animated.timing(pan, {
      toValue: { x: 0, y: exitY },
      duration: 260,
      useNativeDriver: false,
    }).start(() => {
      setMode(nextMode);
      pan.setValue({ x: 0, y: -exitY });
      Animated.spring(pan, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: false,
        friction: 7,
        tension: 40,
      }).start();
    });
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

  const rotate = pan.x.interpolate({ inputRange: [-400, 0, 400], outputRange: ["-14deg", "0deg", "14deg"] });
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
      // 1) Get premium summary (Gemini with curated prompt, cached on backend)
      let text = premiumSummaries[current.book_id];
      if (!text) {
        const sumRes = await api<{ summary: string; lang: string; cached: boolean }>(
          `/books/${current.book_id}/premium-summary?lang=${lang}`
        );
        text = sumRes.summary;
        setPremiumSummaries((prev) => ({ ...prev, [current.book_id]: text! }));
      }
      // 2) TTS the premium summary (cached in DB by book_id+voice+lang)
      const res = await api<{ audio_base64: string; mime: string }>("/tts", {
        method: "POST",
        body: JSON.stringify({ text, voice: "fable", book_id: current.book_id, lang }),
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
    } catch (e: any) {
      // 402 = daily limit reached → open paywall
      const msg = String(e?.message || "");
      if (msg.includes("402") || msg.includes("daily_limit_reached")) {
        setPaywallReason("limit");
        setPaywallOpen(true);
      } else {
        console.warn("audio error", e);
      }
    } finally {
      setAudioLoading(false);
    }
  };

  const openAuthorChat = () => {
    if (!current) return;
    if (!user?.is_premium) {
      setPaywallReason("chat");
      setPaywallOpen(true);
      return;
    }
    router.push({
      pathname: "/author-chat",
      params: { book_id: current.book_id, title: current.title, author: current.author },
    });
  };

  const shareBook = async () => {
    if (!current) return;
    try {
      const fallback = lang === "es" ? current.summary_es : current.summary_en;
      const hookText = (premiumSummaries[current.book_id] || fallback || "").split(/\.\s/)[0];
      const text = `📖 "${current.title}" — ${current.author}\n\n${hookText}.\n\n⚡ Descúbrelo en ClickBook · una historia en 60 segundos.`;
      const url =
        typeof window !== "undefined" && (window as any).location
          ? `${(window as any).location.origin}/discover?q=${encodeURIComponent(current.title)}`
          : "https://clickbook.app";
      await shareContent({ title: current.title, text, url });
    } catch (e) {
      console.warn("share book failed", e);
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
        <Text style={styles.loadingText}>Conectando al ciberespacio…</Text>
      </View>
    );
  }

  if (!current) {
    return (
      <View style={styles.center} testID="discover-empty">
        <Ionicons name="sparkles-outline" size={64} color={colors.copper} />
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
    <View style={[styles.container, { paddingTop: insets.top + 6 }]} testID="discover-screen">
      {/* Top bar compacto */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.push("/home")} style={styles.backBtn} testID="btn-back-home">
          <Ionicons name="chevron-back" size={20} color={colors.brass} />
        </TouchableOpacity>
        <View style={styles.brandRow}>
          <Text style={styles.brandCyan}>Click</Text>
          <Text style={styles.brandPurple}>Book</Text>
        </View>
        <TouchableOpacity onPress={shareBook} style={styles.backBtn} testID="btn-share-book">
          <Ionicons name="share-social" size={18} color={colors.copper} />
        </TouchableOpacity>
      </View>

      {query ? (
        <Text style={styles.queryHint} numberOfLines={1}>
          <Ionicons name="search" size={11} color={colors.copper} /> {query}
        </Text>
      ) : null}

      {/* Zona de carta: ocupa casi toda la pantalla */}
      <View style={styles.cardZone}>
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
            <Text style={styles.stampLikeText}>FAV</Text>
          </Animated.View>
          <Animated.View style={[styles.stampNope, { opacity: nopeOpacity }]}>
            <Text style={styles.stampNopeText}>NOPE</Text>
          </Animated.View>

          {mode === "cover" && <CoverView book={current} lang={lang} />}
          {mode === "ficha" && <FichaView book={current} />}
          {mode === "summary" && (
            <SummaryView
              book={current}
              lang={lang}
              premiumText={premiumSummaries[current.book_id]}
              playing={playing}
              audioLoading={audioLoading}
              onPlay={playAudio}
              onAuthorChat={openAuthorChat}
              isPremium={!!user?.is_premium}
            />
          )}
        </Animated.View>

        {/* Botones flotantes alrededor de la carta */}
        <FloatingBtn
          icon={mode === "ficha" ? "close" : "information-circle"}
          color={colors.copper}
          onPress={() => handleVerticalSwipe("up")}
          position="top"
          testID="btn-ficha"
        />
        <FloatingBtn
          icon={mode === "summary" ? "close" : "headset"}
          color={colors.copper}
          onPress={() => handleVerticalSwipe("down")}
          position="bottom"
          testID="btn-summary"
        />
        <FloatingBtn
          icon="close"
          color={colors.iron}
          onPress={() => handleSwipe("left")}
          position="left"
          big
          testID="btn-discard"
        />
        <FloatingBtn
          icon="heart"
          color={colors.verdigris}
          onPress={() => handleSwipe("right")}
          position="right"
          big
          testID="btn-like"
        />
      </View>

      {/* Botones de compra al mismo nivel */}
      <View style={[styles.buyRow, { paddingBottom: insets.bottom + 6 }]}>
        <BuyBtn
          label="Amazon"
          icon="logo-amazon"
          onPress={() => openStore(current.amazon_url)}
          testID="btn-buy-amazon"
        />
        <BuyBtn
          label="Casa del Libro"
          icon="book"
          onPress={() => openStore(current.casa_del_libro_url)}
          testID="btn-buy-casa"
        />
      </View>

      <PaywallModal
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        reason={paywallReason}
        onUpgraded={async () => {
          await refreshAuth();
        }}
      />
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
        <Text style={styles.synopsis} numberOfLines={4}>{synopsis}</Text>
      </View>
    </View>
  );
}

function FichaView({ book }: { book: Book }) {
  return (
    <View style={styles.parchment} testID="ficha-view">
      <Text style={styles.parchmentHeader}>// FICHA TÉCNICA</Text>
      <View style={styles.divider2} />
      <Text style={styles.parchmentTitle}>{book.title}</Text>
      <Text style={styles.parchmentAuthor}>por {book.author}</Text>
      <View style={styles.fichaGrid}>
        <FichaRow label="AÑO" value={String(book.year)} />
        <FichaRow label="GÉNERO" value={book.genre} />
        <FichaRow label="PÁGINAS" value={String(book.pages)} />
        <FichaRow label="VALORACIÓN" value={`★ ${book.rating.toFixed(1)} / 5`} />
      </View>
    </View>
  );
}

function SummaryView({
  book,
  lang,
  premiumText,
  playing,
  audioLoading,
  onPlay,
  onAuthorChat,
  isPremium,
}: {
  book: Book;
  lang: "es" | "en";
  premiumText?: string;
  playing: boolean;
  audioLoading: boolean;
  onPlay: () => void;
  onAuthorChat: () => void;
  isPremium: boolean;
}) {
  const fallback = lang === "es" ? book.summary_es : book.summary_en;
  const text = premiumText || fallback;
  const hasPremium = !!premiumText;
  return (
    <View style={styles.parchment} testID="summary-view">
      <View style={styles.summaryHeader}>
        <Text style={styles.parchmentHeader}>
          // RESUMEN · 1 MIN {hasPremium ? "★" : ""}
        </Text>
        <TouchableOpacity
          testID="btn-play-audio"
          onPress={onPlay}
          style={styles.playBtn}
          disabled={audioLoading}
        >
          {audioLoading ? (
            <ActivityIndicator size="small" color={colors.brass} />
          ) : (
            <Ionicons name={playing ? "pause" : "play"} size={20} color={colors.brass} />
          )}
        </TouchableOpacity>
      </View>
      <View style={styles.divider2} />
      <Text style={styles.parchmentTitle}>{book.title}</Text>
      {!hasPremium && !audioLoading && (
        <Text style={styles.summaryHint}>
          Pulsa <Ionicons name="headset" size={11} color={colors.copper} /> para generar el guion premium
        </Text>
      )}
      <ScrollView style={{ marginTop: 12, flex: 1 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.summaryText}>{text}</Text>
      </ScrollView>

      {/* Chat con el autor */}
      <TouchableOpacity
        style={[styles.chatBtn, !isPremium && styles.chatBtnLocked]}
        onPress={onAuthorChat}
        testID="btn-author-chat"
        activeOpacity={0.85}
      >
        <Ionicons
          name={isPremium ? "chatbubbles" : "lock-closed"}
          size={16}
          color={isPremium ? colors.bgBase : colors.gold}
        />
        <Text style={[styles.chatBtnText, !isPremium && styles.chatBtnTextLocked]}>
          {isPremium ? `Habla con ${book.author.split(" ").slice(-1)[0]}` : `Chat con ${book.author.split(" ").slice(-1)[0]} (Premium)`}
        </Text>
      </TouchableOpacity>
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

function FloatingBtn({
  icon,
  color,
  onPress,
  position,
  big,
  testID,
}: {
  icon: any;
  color: string;
  onPress: () => void;
  position: "top" | "bottom" | "left" | "right";
  big?: boolean;
  testID?: string;
}) {
  const size = big ? 56 : 44;
  // cardZone padding: vertical 32, horizontal 38. Card edges at those positions.
  const pos: any = { position: "absolute", zIndex: 20 };
  if (position === "top") {
    pos.top = 32 - size / 2;
    pos.left = "50%";
    pos.marginLeft = -size / 2;
  } else if (position === "bottom") {
    pos.bottom = 32 - size / 2;
    pos.left = "50%";
    pos.marginLeft = -size / 2;
  } else if (position === "left") {
    pos.left = 38 - size / 2;
    pos.top = "50%";
    pos.marginTop = -size / 2;
  } else if (position === "right") {
    pos.right = 38 - size / 2;
    pos.top = "50%";
    pos.marginTop = -size / 2;
  }
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.floatingBtn,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          shadowColor: color,
        },
        pos,
      ]}
    >
      <Ionicons name={icon} size={big ? 28 : 22} color={color} />
    </TouchableOpacity>
  );
}

function BuyBtn({
  label,
  icon,
  onPress,
  testID,
}: {
  label: string;
  icon: any;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity testID={testID} style={styles.buyBtn} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name={icon} size={16} color={colors.gold} />
      <Text style={styles.buyText}>{label}</Text>
    </TouchableOpacity>
  );
}

function StaticCard({ book, depth }: { book: Book; depth: number }) {
  return (
    <View
      style={[
        styles.card,
        styles.cardBehind,
        { transform: [{ scale: 1 - depth * 0.04 }, { translateY: depth * 10 }] },
      ]}
    >
      <Image source={{ uri: book.cover_url }} style={styles.cover} resizeMode="cover" />
      <View style={styles.coverOverlay} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase, paddingHorizontal: 12 },
  center: {
    flex: 1,
    backgroundColor: colors.bgBase,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
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
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.brassSoft,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgSurface,
  },
  brand: {
    color: colors.brass,
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 6,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandCyan: {
    color: colors.brass,
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 1,
  },
  brandPurple: {
    color: colors.copper,
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 1,
  },
  queryHint: {
    color: colors.copper,
    fontSize: 11,
    letterSpacing: 1,
    textAlign: "center",
    marginBottom: 4,
  },
  cardZone: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 38,
    paddingVertical: 32,
    position: "relative",
  },
  card: {
    borderRadius: 22,
    backgroundColor: colors.bgSurface,
    borderWidth: 2,
    borderColor: colors.brassSoft,
    overflow: "hidden",
    shadowColor: colors.brass,
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
    position: "absolute",
    top: 32,
    bottom: 32,
    left: 38,
    right: 38,
  },
  cardBehind: { opacity: 0.5 },
  coverWrap: { flex: 1 },
  cover: { width: "100%", height: "100%" },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6,1,15,0.55)",
  },
  coverInfo: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, gap: 8 },
  bookTitle: {
    color: colors.textOnDark,
    fontSize: 26,
    fontWeight: "900",
  },
  bookAuthor: { color: colors.brass, fontSize: 14, letterSpacing: 1, fontWeight: "700" },
  chips: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 },
  chip: {
    backgroundColor: "rgba(0,240,255,0.10)",
    borderWidth: 1,
    borderColor: colors.brassSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipText: { color: colors.brass, fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  synopsis: {
    color: colors.textOnDark,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    opacity: 0.92,
  },
  parchment: {
    flex: 1,
    backgroundColor: colors.parchmentSurface,
    padding: 22,
  },
  parchmentHeader: {
    color: colors.copper,
    letterSpacing: 3,
    fontSize: 12,
    fontWeight: "900",
  },
  divider2: { height: 1, backgroundColor: colors.copper, opacity: 0.4, marginVertical: 10 },
  parchmentTitle: {
    color: colors.textOnDark,
    fontSize: 22,
    fontWeight: "900",
  },
  parchmentAuthor: {
    color: colors.textOnDarkMuted,
    fontSize: 14,
    marginTop: 4,
    fontStyle: "italic",
  },
  fichaGrid: { marginTop: 20, gap: 10 },
  fichaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(176,38,255,0.25)",
    paddingVertical: 10,
  },
  fichaLabel: {
    color: colors.copper,
    letterSpacing: 2,
    fontSize: 11,
    fontWeight: "800",
  },
  fichaValue: {
    color: colors.textOnDark,
    fontSize: 15,
    fontWeight: "700",
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.brass,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgBase,
  },
  summaryText: { color: colors.textOnDark, fontSize: 15, lineHeight: 23 },
  summaryHint: {
    color: colors.copper,
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 6,
    opacity: 0.85,
  },
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.gold,
    paddingVertical: 11,
    borderRadius: 999,
    marginTop: 10,
    shadowColor: colors.gold,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  chatBtnText: { color: colors.bgBase, fontWeight: "900", fontSize: 13, letterSpacing: 0.5 },
  chatBtnLocked: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.gold,
    shadowOpacity: 0.2,
  },
  chatBtnTextLocked: { color: colors.gold },
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
    borderRadius: 6,
  },
  stampLikeText: {
    color: colors.verdigris,
    fontWeight: "900",
    fontSize: 22,
    letterSpacing: 4,
  },
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
    borderRadius: 6,
  },
  stampNopeText: {
    color: colors.iron,
    fontWeight: "900",
    fontSize: 22,
    letterSpacing: 4,
  },
  floatingBtn: {
    borderWidth: 2,
    backgroundColor: colors.bgSurface,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.8,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  buyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  buyBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.goldSoft,
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,210,63,0.06)",
    shadowColor: colors.gold,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  buyText: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
