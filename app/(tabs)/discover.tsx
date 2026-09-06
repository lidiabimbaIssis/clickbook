import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, ActivityIndicator, Platform, Linking, ScrollView, Modal, FlatList, LayoutChangeEvent, Animated, Easing } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { createAudioPlayer } from "expo-audio";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts, Lora_700Bold } from "@expo-google-fonts/lora";
import { api, Book } from "../../src/lib/api";
import { useAuth } from "../../src/providers/AuthProvider";
import { colors } from "../../src/theme";
import PaywallModal from "../../src/components/PaywallModal";
import CharacterSelectModal from "../../src/components/CharacterSelectModal";
import BuyStoreModal from "../../src/components/BuyStoreModal";
import { shareContent } from "../../src/lib/share";
import ShareCard from "../../src/components/ShareCard";
import { captureAndShare } from "../../src/lib/share";
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from "@react-native-masked-view/masked-view";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const MOOD_MAP: Array<{ kw: RegExp; label: string; icon: string; color: string }> = [
  { kw: /(thriller|terror|negra|policial|crimen|suspense|misterio)/i, label: "Intenso", icon: "🔥", color: colors.iron },
  { kw: /(romance|romántic|amor)/i, label: "Romántico", icon: "💜", color: colors.copper },
  { kw: /(fantas|magia|épic|aventur)/i, label: "Épico", icon: "⚡", color: colors.brass },
  { kw: /(filosof|ensay|psicolog|ciencia|divulgac|histor)/i, label: "Reflexionar", icon: "🤔", color: colors.copper },
  { kw: /(infantil|juvenil|ligero|humor|cómic)/i, label: "Ligero", icon: "☁️", color: colors.brass },
  { kw: /(biograf|memoria|autobiograf)/i, label: "Inspirador", icon: "✨", color: colors.gold },
  { kw: /(poesi|liric)/i, label: "Llorar", icon: "💧", color: colors.brass },
  { kw: /(autoayuda|desarrollo|negocio)/i, label: "Aprender", icon: "🎯", color: colors.verdigris },
];
function inferMood(book: Book): { label: string; icon: string; color: string } {
  const found = MOOD_MAP.find(m => m.label.toLowerCase() === (book.mood || "").toLowerCase());
  if (found) return { label: found.label, icon: found.icon, color: found.color };
  return { label: book.mood || "Descubre", icon: "📖", color: colors.brass };
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

const GLOW_ALPHA = 0.55;

const VIBE_TAG_GRADIENTS: [string, string][] = [
  [hexToRgba(colors.copper, GLOW_ALPHA), hexToRgba(colors.copperDark, GLOW_ALPHA)],
  [hexToRgba(colors.brass, GLOW_ALPHA), hexToRgba("#043552", GLOW_ALPHA)],
  [hexToRgba(colors.iron, GLOW_ALPHA), hexToRgba("#7F173C", GLOW_ALPHA)],
];

const SIDE_BTN_GRADIENTS = {
  azulMorado: [hexToRgba(colors.brass, GLOW_ALPHA), hexToRgba(colors.copper, GLOW_ALPHA)] as [string, string],
  moradoRosa: [hexToRgba(colors.copper, GLOW_ALPHA), hexToRgba(colors.iron, GLOW_ALPHA)] as [string, string],
  rosaMorado: [hexToRgba(colors.iron, GLOW_ALPHA), hexToRgba(colors.copper, GLOW_ALPHA)] as [string, string],
  moradoAzul: [hexToRgba(colors.copper, GLOW_ALPHA), hexToRgba(colors.brass, GLOW_ALPHA)] as [string, string],
};

export default function Discover() {
  const { user, refresh: refreshAuth } = useAuth();
  const lang = (user?.lang || "es") as "es" | "en";
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    Lora_700Bold,
  });

  const [slideH, setSlideH] = useState(SCREEN_H);
  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - slideH) > 0.5) setSlideH(h);
  }, [slideH]);
  const SLIDE_H = slideH;

  const params = useLocalSearchParams<{ q?: string; book_id?: string; mode?: string; t?: string; vibe?: string; authorQuery?: string; fromFavorites?: string }>();
  const query = (params.q || "").toString();
  const seedBookId = (params.book_id || "").toString();
  const isRandom = params.mode === "random";
  const isNovedades = params.mode === "novedades";
  const isVibe = params.vibe === "true";
  const isAuthorMode = params.mode === "author";
  const authorQuery = (params.authorQuery || "").toString();
  const navKey = (params.t || "").toString();
  const fromFavorites = params.fromFavorites === "1";
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [favBookIds, setFavBookIds] = useState<Set<string>>(new Set());

  const [infoOpen, setInfoOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<"limit" | "chat" | "general">("limit");
  const [audioLoading, setAudioLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioPosition, setAudioPosition] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [premiumSummaries, setPremiumSummaries] = useState<Record<string, string>>({});
  const playerRef = useRef<any>(null);
  const [hookRemaining, setHookRemaining] = useState<number | null>(null);
  const [hookIsPremium, setHookIsPremium] = useState(false);
  const [hookPlayingId, setHookPlayingId] = useState<string | null>(null);
  const [hookLoadingId, setHookLoadingId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Book>>(null);
  const shareCardRef = useRef<View>(null);
  const [coverReady, setCoverReady] = useState(false);

  const [buyRowHeight, setBuyRowHeight] = useState(64);
  const onBuyRowLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (Math.abs(h - buyRowHeight) > 0.5) setBuyRowHeight(h);
  }, [buyRowHeight]);

  const [showSwipeHint, setShowSwipeHint] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const seen = await AsyncStorage.getItem("hasSeenSwipeHint");
        if (!seen) setShowSwipeHint(true);
      } catch {}
    })();
  }, []);
  const dismissSwipeHint = useCallback(() => {
    setShowSwipeHint(false);
    AsyncStorage.setItem("hasSeenSwipeHint", "true").catch(() => {});
  }, []);

  const [showHookHint, setShowHookHint] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const seen = await AsyncStorage.getItem("hasSeenHookHint");
        if (!seen) setShowHookHint(true);
      } catch {}
    })();
  }, []);
  const dismissHookHint = useCallback(() => {
    setShowHookHint(false);
    AsyncStorage.setItem("hasSeenHookHint", "true").catch(() => {});
  }, []);
  useEffect(() => {
    if (!showHookHint) return;
    const timer = setTimeout(() => dismissHookHint(), 9000);
    return () => clearTimeout(timer);
  }, [showHookHint, dismissHookHint]);

  const stopAudio = useCallback(() => {
    try { playerRef.current?.pause?.(); playerRef.current?.remove?.(); } catch {}
    playerRef.current = null;
    setPlaying(false);
    setHookPlayingId(null);
    setAudioPosition(0);
    setAudioDuration(0);
  }, []);
  useFocusEffect(
  useCallback(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio])
);

const fetchBooks = useCallback(async (initial: boolean, seedId?: string) => {
  if (initial) setLoading(true);
  try {
    const targetCount = 150;

    if (initial && isNovedades) {
      const [novedadesRes, feedRes] = await Promise.all([
        api<{ books: Book[] }>("/books/novedades"),
        api<{ books: Book[] }>(`/books/feed?count=${targetCount}`),
      ]);

      const novedades = novedadesRes?.books || [];
      const novedadesIds = new Set(novedades.map((b) => b.book_id));
      const feedSinNovedades = (feedRes?.books || []).filter((b) => !novedadesIds.has(b.book_id));

      let feedRotado = feedSinNovedades;
      if (feedSinNovedades.length > 0) {
        const randomStart = Math.floor(Math.random() * feedSinNovedades.length);
        feedRotado = [...feedSinNovedades.slice(randomStart), ...feedSinNovedades.slice(0, randomStart)];
      }

      setBooks([...novedades, ...feedRotado]);
      setCurrentIndex(0);
      return;
    }

    if (initial && isAuthorMode && authorQuery) {
      const [authorRes, feedRes] = await Promise.all([
        api<{ books: Book[] }>(`/books/search?query=${encodeURIComponent(authorQuery)}`),
        api<{ books: Book[] }>(`/books/feed?count=${targetCount}`),
      ]);

      let authorBooks = authorRes?.books || [];

      if (seedId) {
        const idx = authorBooks.findIndex((b) => b.book_id === seedId);
        if (idx > 0) {
          const [seedBook] = authorBooks.splice(idx, 1);
          authorBooks = [seedBook, ...authorBooks];
        }
      }

      const authorIds = new Set(authorBooks.map((b) => b.book_id));
      const feedSinAutor = (feedRes?.books || []).filter((b) => !authorIds.has(b.book_id));

      let feedRotado = feedSinAutor;
      if (feedSinAutor.length > 0) {
        const randomStart = Math.floor(Math.random() * feedSinAutor.length);
        feedRotado = [...feedSinAutor.slice(randomStart), ...feedSinAutor.slice(0, randomStart)];
      }

      setBooks([...authorBooks, ...feedRotado]);
      setCurrentIndex(0);
      return;
    }

const endpoint = query
  ? `/books/search?query=${encodeURIComponent(query)}`
  : `/books/feed?count=${targetCount}`;

    const seedPromise = initial && seedId
      ? api<any>(`/books/${seedId}`).catch((e) => {
          console.warn("seed book fetch failed", e);
          return null;
        })
      : Promise.resolve(null);

    const [res, seedBook] = await Promise.all([
      api<{ books: Book[] }>(endpoint),
      seedPromise,
    ]);
    let incomingBooks = res?.books || [];

    if (initial && isVibe && incomingBooks.length > 1) {
      incomingBooks = [...incomingBooks];
      for (let i = incomingBooks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [incomingBooks[i], incomingBooks[j]] = [incomingBooks[j], incomingBooks[i]];
      }
    }

    // Sorpréndeme: el libro random va al índice 0.
    // Evita pintar el libro 0 del feed y scrollear 250ms después.
    if (initial && isRandom && incomingBooks.length > 0) {
      const randomIdx = Math.floor(Math.random() * incomingBooks.length);
      incomingBooks = [
        ...incomingBooks.slice(randomIdx),
        ...incomingBooks.slice(0, randomIdx),
      ];
    }

    let seedIdx: number | null = null;
    if (initial && seedBook && seedBook.book_id) {
      const existingIdx = incomingBooks.findIndex((b) => b.book_id === seedBook.book_id);
      if (existingIdx >= 0) {
        seedIdx = existingIdx;
      } else {
        incomingBooks = [seedBook, ...incomingBooks];
        seedIdx = 0;
      }
    }

    setBooks((prev) => {
      const existingIds = new Set(prev.map((b) => b.book_id));
      const incoming = incomingBooks.filter((b) => !existingIds.has(b.book_id));
      return initial ? incomingBooks : [...prev, ...incoming];
  });

    if (seedIdx !== null) {
      setCurrentIndex(seedIdx);
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: seedIdx!, animated: false });
      }, 250);
    } else if (initial && isRandom) {
      setCurrentIndex(0);
    }
  } catch (e) {
    console.warn("feed error", e);
  } finally {
    setLoading(false);
  }
}, [query, isRandom, isNovedades, isVibe, isAuthorMode, authorQuery, navKey]);
  const loadFavorites = useCallback(async () => {
    try { const res = await api<{ books: Book[] }>("/favorites"); setFavBookIds(new Set(res.books.map((b) => b.book_id))); } catch {}
  }, []);

useEffect(() => {
  setBooks([]);
  setCurrentIndex(0);
  setLoading(true);

  (async () => {
    try {
      await fetchBooks(true, seedBookId);
      loadFavorites();
    } catch (e) {
      console.error("Error crítico en carga inicial:", e);
      setLoading(false);
    }
  })();

  return () => stopAudio();
}, [fetchBooks, stopAudio, seedBookId, navKey]);

useEffect(() => {
  if (!seedBookId || books.length === 0) return;
  const idx = books.findIndex((b) => b.book_id === seedBookId);
  if (idx >= 0 && listRef.current) {
    listRef.current.scrollToIndex({ index: idx, animated: false });
    setCurrentIndex(idx);
  } else if (seedBookId && books.length > 0) {
    (async () => {
      try {
        const res = await api<any>(`/books/${seedBookId}`);
        if (res && res.book_id) {
          setBooks((prev) => {
            if (prev.find((b) => b.book_id === res.book_id)) return prev;
            return [res, ...prev];
          });
          setCurrentIndex(0);
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: 0, animated: false });
          }, 100);
        }
      } catch (e) {
        console.warn("seed book fetch failed", e);
      }
    })();
  }
}, [seedBookId, books]);

  const current = books[currentIndex];
  const isFav = current ? favBookIds.has(current.book_id) : false;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ is_premium: boolean; remaining: number | null }>("/me/hook-usage");
        if (cancelled) return;
        setHookIsPremium(!!res.is_premium);
        setHookRemaining(res.remaining ?? null);
      } catch (e) {
        if (!cancelled) {
          setHookIsPremium(false);
          setHookRemaining(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [current?.book_id]);

  const playHook = useCallback(async () => {
    if (!current) return;
    const bookId = current.book_id;
    if (hookLoadingId === bookId || hookPlayingId === bookId) return;
    setHookLoadingId(bookId);
    try {
      const res = await api<{ available: boolean; audio_url?: string; audio_base64?: string; mime?: string }>(
        `/books/${bookId}/hook-audio`
      );
      if (!res.available) {
        setHookLoadingId((id) => (id === bookId ? null : id));
        return;
      }

      stopAudio();
      const uri = res.audio_url
        ? res.audio_url
        : `data:${res.mime};base64,${res.audio_base64}`;
      const p = createAudioPlayer({ uri });
      playerRef.current = p;
      setHookLoadingId((id) => (id === bookId ? null : id));
      setHookPlayingId(bookId);
      p.addListener("playbackStatusUpdate", (st: any) => {
        if (st.didJustFinish) {
          stopAudio();
          setHookPlayingId((id) => (id === bookId ? null : id));
        }
      });
      p.play();
      setPlaying(true);

      if (!hookIsPremium) {
        setHookRemaining((prev) => (prev !== null ? Math.max(0, prev - 1) : prev));
      }
    } catch (e) {
      console.warn("hook audio error", e);
      setHookLoadingId((id) => (id === bookId ? null : id));
    }
  }, [current, stopAudio, hookIsPremium, hookLoadingId, hookPlayingId]);

  const onMomentumScrollEnd = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / SLIDE_H);
    if (idx !== currentIndex) {
      setCurrentIndex(idx);
      stopAudio();
      if (idx >= books.length - 3) fetchBooks(false);
    }
  }, [currentIndex, books.length, fetchBooks, stopAudio]);

  const toggleFavorite = async () => {
    if (!current) return;
    const id = current.book_id;
    if (isFav) {
      setFavBookIds((s) => { const next = new Set(s); next.delete(id); return next; });
      try { await api(`/favorites/${id}`, { method: "DELETE" }); } catch {}
    } else {
      setFavBookIds((s) => new Set(s).add(id));
      try { await api("/books/interact", { method: "POST", body: JSON.stringify({ book_id: id, action: "like" }) }); } catch {}
    }
  };

  const playAudio = async () => {
    if (!current) return;
    if (playing) { stopAudio(); return; }
    setAudioLoading(true);
    try {
      let text = premiumSummaries[current.book_id];
      if (!text) {
        const sumRes = await api<{ summary: string }>(`/books/${current.book_id}/premium-summary?lang=${lang}`);
        text = sumRes.summary;
        setPremiumSummaries((prev) => ({ ...prev, [current.book_id]: text! }));
      }
      const res = await api<{ audio_url?: string; audio_base64?: string; mime: string }>("/tts", { method: "POST", body: JSON.stringify({ text, voice: "fable", book_id: current.book_id, lang }) });
      const uri = res.audio_url
        ? res.audio_url
        : `data:${res.mime};base64,${res.audio_base64}`;
      const p = createAudioPlayer({ uri });
      playerRef.current = p;
      p.addListener("playbackStatusUpdate", (st: any) => {
        if (typeof st.currentTime === "number") setAudioPosition(st.currentTime);
        if (typeof st.duration === "number" && st.duration > 0) setAudioDuration(st.duration);
        if (st.didJustFinish) stopAudio();
      });
      p.play(); setPlaying(true);
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("402") || msg.includes("daily_limit_reached")) { setPaywallReason("limit"); setPaywallOpen(true); }
    } finally { setAudioLoading(false); }
  };

  const [characterSelectOpen, setCharacterSelectOpen] = useState(false);
  const [buyModalOpen, setBuyModalOpen] = useState(false);

  const openAuthorChat = async () => {
    if (!current) return;
    setInfoOpen(false);
    try {
      const res = await api<{ characters: { nombre: string }[] }>(`/books/${current.book_id}/characters`);
      const list = res?.characters || [];
      if (list.length === 0) {
        router.push({
          pathname: "/author-chat",
          params: { book_id: current.book_id, title: current.title },
        });
      } else {
        setCharacterSelectOpen(true);
      }
    } catch (e) {
      setCharacterSelectOpen(true);
    }
  };

  const onCharacterSelected = (character: string | null, colorIndex?: number) => {
    if (!current) return;
    setCharacterSelectOpen(false);
    router.push({
      pathname: "/author-chat",
      params: {
        book_id: current.book_id,
        title: current.title,
        ...(character ? { character } : {}),
        ...(colorIndex !== undefined ? { colorIndex: String(colorIndex) } : {}),
      },
    });
  };

  const openAuthorFeed = (author: string) => {
    if (!author || !current) return;
    setInfoOpen(false);
    router.push({
      pathname: "/author-books",
      params: { authorQuery: author, fromBookId: current.book_id },
    });
  };

const shareBook = async () => {
  if (!current) return;
  try {
    const fallback = lang === "es" ? current.summary_es : current.summary_en;
    const hookText = (premiumSummaries[current.book_id] || fallback || "").split(/\.\s/)[0];
const coverUrl = `https://res.cloudinary.com/ddppclcl1/image/upload/v1780422197/${current.book_id}.webp`;
await Image.prefetch(coverUrl);
    await new Promise((r) => setTimeout(r, 500));
    await captureAndShare(shareCardRef.current, `clickbook-${current.book_id}`);
  } catch (e) {
    console.warn("share book failed", e);
  }
};

  const openStore = (url: string) => {
    if (!url) return;
    if (Platform.OS === "web" && typeof window !== "undefined") { window.open(url, "_blank"); }
    else { Linking.openURL(url).catch((e) => console.warn("open url", e)); }
  };

  if (!fontsLoaded) {
    return (
      <LinearGradient colors={colors.bgGradient} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.center}>
        <ActivityIndicator size="large" color={colors.brass} />
      </LinearGradient>
    );
  }

  if (loading && books.length === 0) {
    return (
      // onLayout añadido aquí: antes solo estaba en la pantalla
      // principal (más abajo), así que la medición del alto real de la
      // pantalla (slideH) no se resolvía hasta que el FlatList ya se
      // había montado con la posición aleatoria — provocando el salto
      // visible al entrar en frío. Midiendo ya durante la carga (que
      // dura bastante más que un solo frame de layout), cuando el
      // FlatList por fin se monta, la medición ya está lista.
      <LinearGradient colors={colors.bgGradient} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.center} testID="discover-loading" onLayout={onContainerLayout}>
        <ActivityIndicator size="large" color={colors.brass} />
        <Text allowFontScaling={false} style={styles.loadingText}>Buscando tu vibe…</Text>
      </LinearGradient>
    );
  }

  if (!current) {
    return (
      <LinearGradient colors={colors.bgGradient} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.center} testID="discover-empty">
        <Ionicons allowFontScaling={false} name="sparkles-outline" size={64} color={colors.copper} />
        <Text allowFontScaling={false} style={styles.emptyTitle}>No apareció...</Text>
        <Text allowFontScaling={false} style={styles.emptySub}>Tu próxima obsesión puede estar aquí</Text>
        <TouchableOpacity
          style={styles.gradientBorderWrap}
          testID="btn-empty-sorprendeme"
          onPress={() => router.replace({ pathname: "/discover", params: { mode: "random", t: Date.now() } })}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[colors.brass, colors.copper]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientBorder}
          >
            <View style={styles.reloadInner}>
              <Ionicons allowFontScaling={false} name="sparkles" size={16} color={colors.textOnDark} />
              <Text allowFontScaling={false} style={styles.reloadText}>SORPRÉNDEME</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={colors.bgGradient} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.container} testID="discover-screen" onLayout={onContainerLayout}>
      <FlatList
        ref={listRef}
        data={books}
        keyExtractor={(b) => b.book_id}
        showsVerticalScrollIndicator={false}
        pagingEnabled
        snapToInterval={SLIDE_H}
        snapToAlignment="start"
        decelerationRate="fast"
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScrollBeginDrag={() => { if (showSwipeHint) dismissSwipeHint(); }}
        getItemLayout={(_, index) => ({ length: SLIDE_H, offset: SLIDE_H * index, index })}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, animated: false });
          }, 300);
        }}
        initialScrollIndex={currentIndex > 0 ? currentIndex : undefined}
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={1}
        renderItem={({ item }) => (
          <BookSlide
            book={item}
            reservedBottom={buyRowHeight}
            slideHeight={SLIDE_H}
            isCurrent={current?.book_id === item.book_id}
            hookIsPremium={hookIsPremium}
            hookRemaining={hookRemaining}
            hookPlaying={hookPlayingId === item.book_id}
            hookLoading={hookLoadingId === item.book_id}
            onPressHook={playHook}
            showHookHint={showHookHint && currentIndex === 0 && current?.book_id === item.book_id}
            onDismissHookHint={dismissHookHint}
          />
        )}
        testID="vertical-feed"
      />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity
          onPress={() => {
            if (fromFavorites && current?.book_id === seedBookId) {
              router.replace("/favorites");
            } else {
              router.replace("/home");
            }
          }}
          style={styles.backBtn}
          testID="btn-back-home"
        >
          <Ionicons allowFontScaling={false} name="chevron-back" size={20} color={colors.brass} />
        </TouchableOpacity>
        <View style={styles.brandRow}>
          <Text allowFontScaling={false} style={styles.brandWord}>
            <Text style={styles.brandCyan}>Book</Text>
            <Text style={styles.brandPurple}>Vibes</Text>
          </Text>
        </View>
        <TouchableOpacity onPress={shareBook} style={styles.backBtn} testID="btn-share-book">
          <Ionicons allowFontScaling={false} name="share-social" size={18} color={colors.brass} />
        </TouchableOpacity>
      </View>

      <View style={styles.sideButtons} pointerEvents="box-none">
        <SideButton icon="information-circle-outline" onPress={() => setInfoOpen(true)} testID="btn-info" gradientColors={SIDE_BTN_GRADIENTS.azulMorado} />
        <SideButton icon={isFav ? "heart" : "heart-outline"} active={isFav} onPress={toggleFavorite} testID="btn-favorite" gradientColors={SIDE_BTN_GRADIENTS.moradoRosa} />
        <SideButton icon={playing ? "pause" : "headset"} active={playing} onPress={() => { setAudioOpen(true); playAudio(); }} loading={audioLoading} testID="btn-audio" gradientColors={SIDE_BTN_GRADIENTS.azulMorado} />
        <SideButton icon="chatbubbles" onPress={openAuthorChat} testID="btn-author-ia" gradientColors={SIDE_BTN_GRADIENTS.rosaMorado} />
        <SideButton icon="star" onPress={() => router.push({ pathname: "/reviews", params: { book_id: current.book_id, title: current.title, author: current.author } })} testID="btn-reviews" gradientColors={SIDE_BTN_GRADIENTS.moradoAzul} />
      </View>

      <View
        style={[styles.buyRow, { bottom: 6 }]}
        pointerEvents="box-none"
        onLayout={onBuyRowLayout}
      >
        <TouchableOpacity testID="btn-comprar" onPress={() => setBuyModalOpen(true)} activeOpacity={0.85} style={styles.buyMainWrap}>
          <LinearGradient
            colors={[colors.brassMuted, colors.copperDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.buyMainBorder}
          >
            <View style={styles.buyMainInner}>
              <Ionicons allowFontScaling={false} name="cart" size={17} color={colors.textOnDark} />
              <Text allowFontScaling={false} style={styles.buyMainText}>DÓNDE COMPRAR</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.affiliateDisclosure}>Algunas compras pueden generar una pequeña comisión sin coste para ti</Text>
      </View>

      {showSwipeHint && currentIndex === 0 && (
        <SwipeHint bottom={buyRowHeight + 24} />
      )}

      <FlashCardModal visible={infoOpen} book={current} lang={lang} onClose={() => setInfoOpen(false)} onAuthorChat={openAuthorChat} onAuthorPress={openAuthorFeed} isPremium={!!user?.is_premium} />
      <AudioModal visible={audioOpen} book={current} lang={lang} playing={playing} loading={audioLoading} text={premiumSummaries[current.book_id]} position={audioPosition} duration={audioDuration} onPlay={playAudio} onClose={() => { setAudioOpen(false); stopAudio(); }} />
      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} reason={paywallReason} onUpgraded={async () => { await refreshAuth(); }} />
      {current && (
        <CharacterSelectModal
          visible={characterSelectOpen}
          bookId={current.book_id}
          bookTitle={current.title}
          onClose={() => setCharacterSelectOpen(false)}
          onSelect={onCharacterSelected}
        />
      )}
      {current && (
        <BuyStoreModal
          visible={buyModalOpen}
          onClose={() => setBuyModalOpen(false)}
          onOpenStore={openStore}
          title={current.title}
          author={current.author}
        />
      )}
      <View style={{ position: "absolute", left: -9999, top: -9999, width: 540, height: 960 }} pointerEvents="none">
        {current && (
          <ShareCard
            ref={shareCardRef}
            onCoverLoad={() => setCoverReady(true)}
            data={{
              title: current.title,
              author: current.author,
              coverUrl: `https://res.cloudinary.com/ddppclcl1/image/upload/v1780422197/${current.book_id}.webp`,
              rating: current.rating,
              hookText: (premiumSummaries[current.book_id] || (lang === "es" ? current.summary_es : current.summary_en) || "").split(/\.\s/)[0],
            }}
          />
        )}
      </View>
    </LinearGradient>
  );
}

function BookSlide({
  book, reservedBottom, slideHeight,
  isCurrent, hookIsPremium, hookRemaining, hookPlaying, hookLoading, onPressHook,
  showHookHint, onDismissHookHint,
}: {
  book: Book; reservedBottom: number; slideHeight: number;
  isCurrent?: boolean; hookIsPremium?: boolean; hookRemaining?: number | null;
  hookPlaying?: boolean; hookLoading?: boolean; onPressHook?: () => void;
  showHookHint?: boolean; onDismissHookHint?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const mood = useMemo(() => inferMood(book), [book]);
  const coverW = SCREEN_W * 0.88;
  const isNovedad = useMemo(() => {
    const fecha = (book as any).fecha_novedad;
    if (!fecha) return false;
    const fechaNovedad = new Date(fecha);
    if (isNaN(fechaNovedad.getTime())) return false;
    const diffMs = Date.now() - fechaNovedad.getTime();
    const diffDias = diffMs / (1000 * 60 * 60 * 24);
    return diffDias >= 0 && diffDias <= 15;
  }, [book]);

  const topBarSpace = insets.top + 8 + 38 + 8;
  const slidePaddingTop = topBarSpace + 45;

  const hookPulse = useRef(new Animated.Value(0)).current;
  const hookColorPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(hookPulse, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(hookPulse, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    const colorLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(hookColorPulse, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(hookColorPulse, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );
    loop.start();
    colorLoop.start();
    return () => { loop.stop(); colorLoop.stop(); };
  }, [hookPulse, hookColorPulse]);
  const hookScale = hookPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  const hookOpacity = hookPulse.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] });
  const hookColor = hookColorPulse.interpolate({ inputRange: [0, 1], outputRange: ["rgba(255,255,255,0.85)", colors.iron] });
  const hookIdle = !(hookLoading || hookPlaying);
  const shouldPulse = hookIdle && !hookIsPremium;

  const hookButton = isCurrent && (hookIsPremium || (hookRemaining ?? 0) > 0) ? (
    <>
      <Animated.View
        style={[
          styles.hookBtn,
          shouldPulse && { transform: [{ scale: hookScale }], opacity: hookOpacity },
        ]}
      >
        <TouchableOpacity
          onPress={() => { onDismissHookHint?.(); onPressHook?.(); }}
          style={styles.hookBtnTouchable}
          activeOpacity={0.7}
          testID="btn-hook"
        >
          {hookIsPremium ? (
            <Ionicons allowFontScaling={false}
              name={hookPlaying ? "pause" : "play"}
              size={16}
              color={hookLoading || hookPlaying ? colors.iron : "rgba(255,255,255,0.85)"}
            />
          ) : (
            <Animated.Text style={[styles.hookBtnNumber, { color: (hookLoading || hookPlaying) ? colors.iron : hookColor }]}>
              {hookRemaining}
            </Animated.Text>
          )}
        </TouchableOpacity>
      </Animated.View>
      {showHookHint && (
        <View style={styles.hookHintWrap} pointerEvents="none" testID="hook-hint">
          <View style={styles.hookHintBubble}>
            <Ionicons allowFontScaling={false} name="headset" size={13} color={colors.bgBase} />
            <Text allowFontScaling={false} style={styles.hookHintText}>Toca para escuchar</Text>
          </View>
          <View style={styles.hookHintArrow} />
        </View>
      )}
    </>
  ) : null;

  return (
    <View style={[styles.slide, { width: SCREEN_W, height: slideHeight, paddingTop: slidePaddingTop }]}>
      <View style={styles.coverArea}>
        <View style={styles.coverWrap}>
          <View style={styles.topBadgesRow} pointerEvents="box-none">
            <LinearGradient
              colors={[hexToRgba(colors.copper, GLOW_ALPHA), hexToRgba(colors.copperDark, GLOW_ALPHA)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.pillGradientBorder}
            >
              <View style={styles.moodPill}>
                <Text allowFontScaling={false} style={styles.moodPillIcon}>{mood.icon}</Text>
                <Text allowFontScaling={false} style={[styles.moodPillLabel, { color: mood.color }]} numberOfLines={1}>{mood.label}</Text>
              </View>
            </LinearGradient>
            <LinearGradient
              colors={[hexToRgba(colors.copperDark, GLOW_ALPHA), hexToRgba(colors.copper, GLOW_ALPHA)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.pillGradientBorder}
            >
              <View style={styles.ratingPill}>
                {renderStarsCompact(book.rating)}
                <Text allowFontScaling={false} style={styles.ratingValue}>{book.rating.toFixed(1)}</Text>
              </View>
            </LinearGradient>
          </View>

          <View style={styles.coverFrameShadow}>
            <View style={styles.coverFrame}>
              <Image
                source={{ uri: `https://res.cloudinary.com/ddppclcl1/image/upload/v1780422197/${book.book_id}.webp` }}
                resizeMode="contain"
                style={styles.coverImage}
                onError={(e) => console.log("Error cargando imagen:", e.nativeEvent.error)}
              />
              {hookButton}
              {isNovedad && (
                <View style={styles.novedadBadge} pointerEvents="none">
                  <LinearGradient
                    colors={[colors.brass, colors.copper]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.novedadBorder}
                  >
                    <View style={styles.novedadInner}>
                      <Text allowFontScaling={false} style={styles.novedadText}>NEW</Text>
                    </View>
                  </LinearGradient>
                </View>
              )}
            </View>
          </View>

        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.vibeTagsRow}
        style={styles.vibeTagsScroll}
      >
        {(book.vibe_tags || []).map((tag, index) => {
          const tagGradient = VIBE_TAG_GRADIENTS[index % VIBE_TAG_GRADIENTS.length];
          return (
            <LinearGradient
              key={index}
              colors={tagGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.vibeTagGradientBorder}
            >
              <View style={styles.vibeTagChipInner}>
                <Text allowFontScaling={false} style={styles.vibeTagIcon} allowFontScaling={false}>{tag.icon}</Text>
                <Text allowFontScaling={false} style={styles.vibeTagLabel} allowFontScaling={false} numberOfLines={1}>{tag.label}</Text>
              </View>
            </LinearGradient>
          );
        })}
      </ScrollView>

   <View style={{ height: reservedBottom + 6 }} pointerEvents="none" />
</View>
  );
}

function renderStarsCompact(rating: number) {
  const r = Math.max(0, Math.min(5, rating));
  const full = Math.floor(r);
  const half = r - full >= 0.5;
  const arr: React.ReactElement[] = [];
  for (let i = 0; i < 5; i++) {
    let icon: any = "star-outline";
    if (i < full) icon = "star";
    else if (i === full && half) icon = "star-half";
    arr.push(<Ionicons allowFontScaling={false} key={i} name={icon} size={11} color={colors.gold} style={{ marginHorizontal: 0.5 }} />);
  }
  return <View style={{ flexDirection: "row" }}>{arr}</View>;
}

function SideButton({ icon, active, onPress, loading, testID, gradientColors }: { icon: any; active?: boolean; onPress: () => void; loading?: boolean; testID?: string; gradientColors?: [string, string]; }) {
  const iconColor = active ? colors.iron : "#FFFFFF";
  const content = loading ? (
    <ActivityIndicator size="small" color={iconColor} />
  ) : (
    <Ionicons allowFontScaling={false} name={icon} size={18} color={iconColor} />
  );

  if (icon === "heart" && active) {
    return (
      <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.7} style={styles.sideBtnWrap}>
        <LinearGradient
          colors={[colors.brass, colors.copper]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.sideBtnGradientBorder}
        >
          <View style={styles.sideBtnInner}>
            <MaskedView
              style={{ width: 18, height: 18 }}
              maskElement={<Ionicons allowFontScaling={false} name="heart" size={18} color="black" />}
            >
              <LinearGradient
                colors={[colors.brass, colors.copper]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ width: 18, height: 18 }}
              />
            </MaskedView>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  if (active) {
    return (
      <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.7} style={styles.sideBtnWrap}>
        <View style={[styles.sideBtn, { borderColor: colors.iron, shadowColor: colors.iron }]}>
          {content}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.7} style={styles.sideBtnWrap}>
      <LinearGradient
        colors={gradientColors || [colors.brassMuted, colors.copperDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.sideBtnGradientBorder}
      >
        <View style={styles.sideBtnInner}>
          {content}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function BuyBtn({ label, icon, onPress, testID }: { label: string; icon: any; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity testID={testID} style={styles.buyBtn} onPress={onPress} activeOpacity={0.85}>
      <Ionicons allowFontScaling={false} name={icon} size={16} color={colors.gold} />
      <Text allowFontScaling={false} style={styles.buyText}>{label}</Text>
    </TouchableOpacity>
  );
}

function SwipeHint({ bottom }: { bottom: number }) {
  const anims = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const loops = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(anim, {
            toValue: 1,
            duration: 900,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay((2 - i) * 150 + 300),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [anims]);

  return (
    <View style={[styles.swipeHintWrap, { bottom }]} pointerEvents="none" testID="swipe-hint">
      {anims.map((anim, i) => {
        const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -22] });
        const opacity = anim.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 0.55, 0.25, 0] });
        return (
          <Animated.View key={i} style={{ transform: [{ translateY }], opacity }}>
            <Ionicons allowFontScaling={false} name="chevron-up" size={22} color="rgba(255,255,255,0.7)" />
          </Animated.View>
        );
      })}
    </View>
  );
}

function FlashCardModal({ visible, book, lang, onClose, onAuthorChat, onAuthorPress, isPremium }: { visible: boolean; book: Book; lang: "es" | "en"; onClose: () => void; onAuthorChat: () => void; onAuthorPress?: (author: string) => void; isPremium: boolean; }) {
  const insets = useSafeAreaInsets();
  const ext = (book as any) || {};
  const [authorPressed, setAuthorPressed] = useState(false);

  useEffect(() => {
    setAuthorPressed(false);
  }, [book?.book_id]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.flashCard, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity onPress={onClose} style={styles.flashClose} testID="btn-close-flash">
            <Ionicons allowFontScaling={false} name="close" size={22} color={colors.textOnDarkMuted} />
          </TouchableOpacity>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text allowFontScaling={false} style={styles.flashTitle} numberOfLines={3}>{book.title}</Text>
            {onAuthorPress ? (
              <TouchableOpacity
                onPress={() => {
  setAuthorPressed(true);
  setTimeout(() => {
    onAuthorPress(book.author);
  }, 150);
}}
                activeOpacity={0.7}
                testID="btn-flash-author-name"
                style={styles.flashAuthorRow}
              >
                <Text allowFontScaling={false} style={[styles.flashAuthor, authorPressed && { color: colors.iron }]}>{book.author}</Text>
                <Ionicons allowFontScaling={false} name="chevron-forward" size={13} color={authorPressed ? colors.iron : colors.brass} style={{ marginTop: 4 }} />
              </TouchableOpacity>
            ) : (
              <Text allowFontScaling={false} style={[styles.flashAuthor, { marginTop: 4 }]}>{book.author}</Text>
            )}
            <View style={styles.statRow}>
              <StatBox icon="calendar" label="AÑO" value={String(book.year)} gradientColors={SIDE_BTN_GRADIENTS.azulMorado} />
              <StatBox icon="book" label="PÁGINAS" value={String(book.pages)} gradientColors={SIDE_BTN_GRADIENTS.moradoRosa} />
              <StatBox icon="rocket" label="GÉNERO" value={book.genre.split("/")[0].trim()} small gradientColors={SIDE_BTN_GRADIENTS.moradoAzul} />
            </View>
            <View style={styles.flashLabel}>
              <Text allowFontScaling={false} style={styles.flashLabelText}>— FLASH CARD —</Text>
            </View>
            <View style={styles.detailGrid}>
              <DetailItem label="TEMA" value={ext.tema || "—"} color={colors.iron} />
              <DetailItem label="TONO" value={ext.tono || "—"} color={colors.brass} />
              <DetailItem label="SUBGÉNERO" value={ext.subgenero || "—"} color={colors.iron} />
              <DetailItem label="TROPE" value={ext.trope || "—"} color={colors.brass} />
              <DetailItem label="SAGA" value={ext.saga_info || "Libro independiente"} color={colors.iron} />
              <DetailItem label="CONT. SENSIBLE" value={ext.contenido_sensible || "—"} color={colors.brass} />
              <DetailItem label="DIFICULTAD" value={ext.ficha_lectura?.dificultad || "—"} color={colors.iron} />
              <DetailItem label="ESTILO" value={ext.ficha_lectura?.estilo || "—"} color={colors.brass} />
            </View>

            {ext.hook && (
              <View style={styles.hookContainer}>
                <Text allowFontScaling={false} style={styles.hookText}>"{ext.hook}"</Text>
              </View>
            )}

            <TouchableOpacity style={[styles.iaBtn, !isPremium && styles.iaBtnLocked]} onPress={onAuthorChat} activeOpacity={0.85} testID="btn-flash-author-chat">
              <Ionicons allowFontScaling={false} name={isPremium ? "chatbubbles" : "lock-closed"} size={16} color={isPremium ? colors.bgBase : colors.gold} />
              <Text allowFontScaling={false} style={[styles.iaBtnText, !isPremium && styles.iaBtnTextLocked]}>Habla con ellos {!isPremium && "(Premium)"}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function StatBox({ icon, label, value, small, gradientColors }: { icon: any; label: string; value: string; small?: boolean; gradientColors: [string, string] }) {
  return (
    <View style={styles.statBox}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.statIconRing}
      >
        <View style={styles.statIconInner}>
          <Ionicons allowFontScaling={false} name={icon} size={18} color="#FFFFFF" />
        </View>
      </LinearGradient>
      <Text allowFontScaling={false} style={styles.statLabel}>{label}</Text>
      <Text allowFontScaling={false} style={[styles.statValue, small && { fontSize: 13 }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function DetailItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.detailItem}>
      <View style={styles.detailHeader}>
        <Ionicons allowFontScaling={false} name="star" size={10} color={color} />
        <Text allowFontScaling={false} style={[styles.detailLabel, { color }]}>{label}</Text>
      </View>
      <Text allowFontScaling={false} style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function formatAudioTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function AudioModal({ visible, book, lang, playing, loading, text, position, duration, onPlay, onClose }: { visible: boolean; book: Book; lang: "es" | "en"; playing: boolean; loading: boolean; text?: string; position: number; duration: number; onPlay: () => void; onClose: () => void; }) {
  const insets = useSafeAreaInsets();
  const fallback = lang === "es" ? book.summary_es : book.summary_en;
  const effectiveDuration = duration > 0 ? duration : 60;
  const progressPct = Math.max(0, Math.min(100, (position / effectiveDuration) * 100));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.flashCard, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity onPress={onClose} style={styles.flashClose} testID="btn-close-audio">
            <Ionicons allowFontScaling={false} name="close" size={22} color={colors.textOnDarkMuted} />
          </TouchableOpacity>

          <Text allowFontScaling={false} style={styles.audioBadge}>// RESUMEN · 1 MIN</Text>
          <View style={styles.dividerLine} />

          <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 4 }}>
            <View style={styles.audioHeroWrap}>
              <Image
                source={require("../../assets/images/audio-headphones-glow.png")}
                style={styles.audioHeadphonesImg}
                resizeMode="contain"
              />
            </View>

            <TouchableOpacity onPress={onPlay} disabled={loading} style={styles.audioPlayCircleWrap} testID="btn-audio-play">
              <LinearGradient
                colors={[colors.brass, colors.copper]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.audioPlayCircleBorder}
              >
                <View style={styles.audioPlayCircleInner}>
                  {loading ? (
                    <ActivityIndicator color={colors.brass} />
                  ) : (
                    <Ionicons allowFontScaling={false} name={playing ? "pause" : "play"} size={26} color={colors.textOnDark} />
                  )}
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.audioProgressRow}>
              <Text allowFontScaling={false} style={styles.audioTimeText}>{formatAudioTime(position)}</Text>
              <View style={styles.audioProgressTrack}>
                <View style={[styles.audioProgressFill, { width: `${progressPct}%` }]} />
              </View>
              <Text allowFontScaling={false} style={styles.audioTimeText}>{formatAudioTime(effectiveDuration)}</Text>
            </View>

            <Text allowFontScaling={false} style={[styles.flashTitle, { marginTop: 18 }]}>{book.title}</Text>
            <Text allowFontScaling={false} style={[styles.synopsisText, { marginTop: 10 }]}>{text || fallback}</Text>

            <View style={styles.audioBottomPill}>
              <Ionicons allowFontScaling={false} name="time-outline" size={14} color={colors.copper} />
              <Text allowFontScaling={false} style={styles.audioBottomPillText}>UN MINUTO PARA DECIDIR SI LEERLO O NO</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingText: { color: colors.textOnDarkMuted, marginTop: 14, letterSpacing: 1 },
  emptyTitle: { color: colors.textOnDark, fontSize: 18, marginTop: 12, textAlign: "center" },
  reloadBtn: { marginTop: 24, borderWidth: 1, borderColor: colors.brass, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999 },
  reloadText: { color: colors.textOnDark, letterSpacing: 2, fontWeight: "700" },
  emptySub: { color: colors.textOnDarkMuted, fontSize: 13, marginTop: 8, textAlign: "center", paddingHorizontal: 30, lineHeight: 19 },
  gradientBorderWrap: { borderRadius: 14, marginTop: 22 },
  gradientBorder: { borderRadius: 14, padding: 1.5 },
  reloadInner: { borderRadius: 12.5, backgroundColor: "rgba(6,1,15,0.75)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 12 },
  slide: { alignItems: "center", flexDirection: "column" },
  coverArea: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" },
  coverWrap: { position: "relative", width: SCREEN_W * 0.88, height: "100%", alignItems: "center", justifyContent: "center" },
  coverFrameShadow: {
    width: "100%",
    maxWidth: SCREEN_W * 0.88,
    aspectRatio: 2 / 3,
    maxHeight: "100%",
    borderRadius: 15,
  },
  coverFrame: { width: "100%", height: "100%", borderRadius: 15, overflow: "hidden", backgroundColor: "transparent" },
  coverImage: { width: "100%", height: "100%" },
  hookBtn: {
    position: "absolute",
    bottom: 10,
    left: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  hookBtnTouchable: {
    width: "100%",
    height: "100%",
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  hookBtnNumber: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "800" },
  hookHintWrap: {
    position: "absolute",
    bottom: 38,
    left: 6,
    alignItems: "flex-start",
    zIndex: 12,
  },
  hookHintBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brass,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    shadowColor: colors.brass,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  hookHintText: { color: colors.bgBase, fontSize: 12, fontWeight: "800" },
  hookHintArrow: {
    width: 0,
    height: 0,
    marginLeft: 14,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: colors.brass,
  },
  novedadBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  novedadBorder: {
    borderRadius: 999,
    padding: 1.5,
  },
  novedadInner: {
    borderRadius: 997.5,
    backgroundColor: "rgba(6,1,15,0.85)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  novedadText: { color: "#ffffff", fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  topBadgesRow: { position: "absolute", top: -45, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4, zIndex: 8 },
  pillGradientBorder: { borderRadius: 999, padding: 1.3 },
  moodPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 998, backgroundColor: "rgba(6,1,15,0.9)" },
  moodPillIcon: { fontSize: 14 },
  moodPillLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  ratingPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 998, backgroundColor: "rgba(6,1,15,0.9)" },
  ratingValue: { color:"#962fd2ad", fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, zIndex: 10 },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  brandRow: { flexDirection: "row", alignItems: "center" },

  brandWord: {
    fontSize: 18,
    letterSpacing: -0.3,
    includeFontPadding: false,
  },
  brandCyan: {
    color: colors.brass,
    fontFamily: "Lora_700Bold",
  },
  brandPurple: {
    color: colors.copper,
    fontFamily: "Lora_700Bold",
  },

  queryWrap: { position: "absolute", left: 0, right: 0, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 5 },
  queryHint: { color: colors.copper, fontSize: 12, fontWeight: "600", letterSpacing: 1, maxWidth: 240 },
  sideButtons: { position: "absolute", right: 10, top: "50%", marginTop: -118, gap: 18, alignItems: "center", zIndex: 10 },
  sideBtnWrap: { alignItems: "center" },
  sideBtnGradientBorder: { width: 38, height: 38, borderRadius: 13, padding: 1.5 },
  sideBtnInner: { flex: 1, borderRadius: 11.5, backgroundColor: "rgba(6,1,15,0.75)", alignItems: "center", justifyContent: "center" },
  sideBtn: { width: 38, height: 38, borderRadius: 13, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(6,1,15,0.6)", shadowOpacity: 0.9, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  buyRow: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: 4, paddingHorizontal: 12, zIndex: 10 },
  buyMainWrap: { borderRadius: 14, width: SCREEN_W * 0.88 },
  buyMainBorder: { borderRadius: 14, padding: 1.5, width: "100%" },
  buyMainInner: { borderRadius: 12.5, backgroundColor: "rgba(6,1,15,0.92)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 26, paddingVertical: 12, width: "100%" },
  buyMainText: { color: colors.textOnDark, fontSize: 13, fontWeight: "900", letterSpacing: 1.5 },
  affiliateDisclosure: { color: colors.textOnDarkMuted, fontSize: 9.5, textAlign: "center" },
  buyBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderColor: colors.brassMuted, paddingHorizontal: 8, paddingVertical: 11, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.6)" },
  buyText: { color: colors.gold, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  swipeHintWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "flex-end",
    height: 40,
    gap: -8,
    zIndex: 9,
  },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  flashCard: { backgroundColor: colors.bgSurface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 2, borderColor: colors.copper, paddingHorizontal: 22, maxHeight: SCREEN_H * 0.92 },
  flashClose: { position: "absolute", top: 12, right: 12, padding: 8, zIndex: 5 },
  flashTitle: { color: colors.textOnDark, fontSize: 24, fontWeight: "900" },
  flashAuthorRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, alignSelf: "flex-start" },
  flashAuthor: { color: colors.brass, fontSize: 14, fontStyle: "italic" },
  statRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  statBox: { flex: 1, borderRadius: 12, padding: 10, alignItems: "center", backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(78,2,122,0.55)" },
  statIconRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    padding: 1.5,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  statIconInner: { width: "100%", height: "100%", borderRadius: 18.5, backgroundColor: "rgba(6,1,15,0.85)", alignItems: "center", justifyContent: "center" },
  statLabel: { color: colors.textOnDark, fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginTop: 8 },
  statValue: { color: colors.brass, fontSize: 13, fontWeight: "900", marginTop: 2 },
  flashLabel: { alignItems: "center", marginTop: 18 },
  flashLabelText: { color: colors.copper, fontSize: 13, letterSpacing: 4, fontWeight: "800" },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: "rgba(78,2,122,0.55)", borderRadius: 12, padding: 14, marginTop: 10 },
  detailItem: { width: "50%", paddingVertical: 8, paddingRight: 8 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 4 },
  detailLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  detailValue: { color: colors.textOnDark, fontSize: 14, marginTop: 3 },
  synopsisLabel: { color: colors.copper, fontSize: 13, letterSpacing: 3, fontWeight: "900", marginTop: 18 },
  synopsisText: { color: colors.textOnDark, fontSize: 15, lineHeight: 21, marginTop: 8 },
  iaBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.gold, paddingVertical: 13, borderRadius: 999, marginTop: 18 },
  iaBtnText: { color: colors.bgBase, fontWeight: "900", fontSize: 13, letterSpacing: 0.5 },
  iaBtnLocked: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.gold },
  iaBtnTextLocked: { color: colors.gold },
  audioBadge: { color: colors.copper, fontSize: 12, letterSpacing: 3, fontWeight: "900", marginTop: 16 },
  audioHeroWrap: { alignItems: "center", justifyContent: "center", marginTop: 6, marginBottom: 10 },
  audioHeadphonesImg: { width: "82%", height: 150 },
  audioPlayCircleWrap: { alignSelf: "center", borderRadius: 999, shadowColor: colors.copper, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  audioPlayCircleBorder: { width: 68, height: 68, borderRadius: 34, padding: 2, alignItems: "center", justifyContent: "center" },
  audioPlayCircleInner: { width: "100%", height: "100%", borderRadius: 32, backgroundColor: colors.bgSurface, alignItems: "center", justifyContent: "center" },
  audioProgressRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16, paddingHorizontal: 4 },
  audioTimeText: { color: colors.textOnDarkMuted, fontSize: 12, fontWeight: "700", minWidth: 32 },
  audioProgressTrack: { flex: 1, height: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  audioProgressFill: { height: "100%", borderRadius: 999, backgroundColor: colors.copper },
  audioBottomPill: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "rgba(112,3,174,0.4)", borderRadius: 999, paddingVertical: 12, paddingHorizontal: 16, marginTop: 22, marginBottom: 8 },
  audioBottomPillText: { color: colors.copper, fontSize: 11, fontWeight: "800", letterSpacing: 0.8, textAlign: "center", flexShrink: 1 },
  dividerLine: { height: 1, backgroundColor: colors.copper, opacity: 0.4, marginTop: 10, marginBottom: 12 },
  vibeTagsScroll: {
    flexGrow: 0,
    marginTop: 12,
    marginBottom: 18,
  },
  vibeTagsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    flexGrow: 1,
    justifyContent: "center",
  },
  vibeTagGradientBorder: {
    borderRadius: 13,
    padding: 1.2,
  },
  vibeTagChipInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 11.8,
    backgroundColor: "rgba(6,1,15,0.75)",
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  vibeTagIcon: { fontSize: 13 },
  vibeTagLabel: { color: "#ffffff", fontSize: 12.5, fontWeight: "600" },
  hookContainer: { marginTop: 24, padding: 16, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 16, borderLeftWidth: 3, borderLeftColor: colors.copper },
  hookText: { color: colors.textOnDark, fontSize: 16, fontStyle: 'italic', textAlign: 'center', lineHeight: 24, fontWeight: '500' },
});