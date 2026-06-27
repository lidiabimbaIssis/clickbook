import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, ActivityIndicator, Platform, Linking, ScrollView, Modal, FlatList, LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { createAudioPlayer } from "expo-audio";
import{  useLocalSearchParams, useRouter } from "expo-router";
import { api, Book } from "../../src/lib/api";
import { useAuth } from "../../src/providers/AuthProvider";
import { colors } from "../../src/theme";
import PaywallModal from "../../src/components/PaywallModal";
import { shareContent } from "../../src/lib/share";
import ShareCard from "../../src/components/ShareCard";
import { captureAndShare } from "../../src/lib/share";
import { LinearGradient } from 'expo-linear-gradient';

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

export default function Discover() {
  const { user, refresh: refreshAuth } = useAuth();
  const lang = (user?.lang || "es") as "es" | "en";
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Altura REAL del tab bar, medida en tiempo de ejecución por el propio
  // react-navigation — ya incluye cualquier insets.bottom adicional que
  // (tabs)/_layout.tsx sume internamente (ver ese archivo: ahora el
  // tabBarStyle ya no usa números fijos, sino height/padding que crecen
  // según insets.bottom real del dispositivo). Antes esto era una
  // constante fija (TAB_BAR_HEIGHT = 90) que asumía un solo tipo de
  // dispositivo; con este hook, SLIDE_H siempre coincide con el espacio
  // real que el tab bar deja libre, sea cual sea el dispositivo.
  const tabBarHeight = useBottomTabBarHeight();
  const SLIDE_H = SCREEN_H - tabBarHeight;

  const params = useLocalSearchParams<{ q?: string; book_id?: string; random?: string }>();
  const query = (params.q || "").toString();
  const seedBookId = (params.book_id || "").toString();
  const isRandom = params.random === "true";
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
  const [premiumSummaries, setPremiumSummaries] = useState<Record<string, string>>({});
  const playerRef = useRef<any>(null);
  // Timer del hook automático: se arma cada vez que currentIndex cambia y se
  // cancela si el usuario desliza antes de que pasen los 1.5s (ver useEffect
  // más abajo). No usa estado, solo un ref, porque no necesita re-renderizar
  // nada — solo dispara/cancela una acción.
  const hookTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<Book>>(null);
  const shareCardRef = useRef<View>(null);
  const [coverReady, setCoverReady] = useState(false);

  // Altura real medida del buyRow flotante (botones de compra).
  // Se mide UNA vez por montaje con onLayout — nunca se adivina a mano.
  // Arranca en un valor razonable (evita un "salto" visual en el primer
  // frame) y se corrige solo en cuanto el layout real está disponible.
  const [buyRowHeight, setBuyRowHeight] = useState(64);
  const onBuyRowLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (Math.abs(h - buyRowHeight) > 0.5) setBuyRowHeight(h);
  }, [buyRowHeight]);

  const stopAudio = useCallback(() => {
    try { playerRef.current?.pause?.(); playerRef.current?.remove?.(); } catch {}
    playerRef.current = null;
    setPlaying(false);
  }, []);

const fetchBooks = useCallback(async (initial: boolean) => {
  if (initial) setLoading(true);
  try {
    const targetCount = 500;

    // CAMBIO AQUÍ: Si hay búsqueda, usamos /books/search, si no, /books/feed
const endpoint = query
  ? `/books/search?query=${encodeURIComponent(query)}`
  : `/books/feed?count=${targetCount}`;
    const res = await api<{ books: Book[] }>(endpoint);

    setBooks((prev) => {
      const existingIds = new Set(prev.map((b) => b.book_id));
      const incoming = (res?.books || []).filter((b) => !existingIds.has(b.book_id));
      return initial ? res?.books || [] : [...prev, ...incoming];
  });
    if (initial && isRandom && res?.books?.length > 0) {
      const randomIdx = Math.floor(Math.random() * res.books.length);
      setCurrentIndex(randomIdx);
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: randomIdx, animated: false });
      }, 100);
    }
  } catch (e) {
    console.warn("feed error", e);
  } finally {
    setLoading(false);
  }
}, [query, isRandom]);
  const loadFavorites = useCallback(async () => {
    try { const res = await api<{ books: Book[] }>("/favorites"); setFavBookIds(new Set(res.books.map((b) => b.book_id))); } catch {}
  }, []);

useEffect(() => {
  setBooks([]);
  setCurrentIndex(0);
  setLoading(true); // Aseguramos que el estado de carga esté activo


  (async () => {
    try {
      // 1. Cargamos primero los libros (si hay búsqueda, se usará el 'query')
      await fetchBooks(true);

      // 2. Solo después, intentamos cargar favoritos.
      // Si esto falla (401), NO afectará a los libros que ya cargaron arriba.
      loadFavorites();
    } catch (e) {
      console.error("Error crítico en carga inicial:", e);
      setLoading(false);
    }
  })();

  return () => stopAudio();
  // Eliminamos loadFavorites de las dependencias para que no se re-ejecute
  // cuando no debe.
}, [fetchBooks, stopAudio, seedBookId]);

useEffect(() => {
  if (!seedBookId || books.length === 0) return;
  const idx = books.findIndex((b) => b.book_id === seedBookId);
  if (idx >= 0 && listRef.current) {
    listRef.current.scrollToIndex({ index: idx, animated: false });
    setCurrentIndex(idx);
  }
}, [seedBookId, books]);

  const current = books[currentIndex];
  const isFav = current ? favBookIds.has(current.book_id) : false;

  // ---- Hook automático: audio corto del "hook" al pararse 1.5s en una
  // portada, sin deslizar. Ver playHookForCurrentBook más abajo para la
  // lógica de reproducción (comparte playerRef/stopAudio con el resumen,
  // para que NUNCA puedan sonar los dos a la vez).
  const playHookForCurrentBook = useCallback(async (bookId: string) => {
    try {
      const res = await api<{ available: boolean; audio_base64?: string; mime?: string }>(
        `/books/${bookId}/hook-audio`
      );
      if (!res.available) return; // sin hooks restantes hoy, o libro sin hook: silencio total, sin aviso

      stopAudio(); // por si quedaba sonando un resumen u otro hook
      const uri = `data:${res.mime};base64,${res.audio_base64}`;
      const p = createAudioPlayer({ uri });
      playerRef.current = p;
      p.addListener("playbackStatusUpdate", (st: any) => { if (st.didJustFinish) stopAudio(); });
      p.play();
      setPlaying(true);
    } catch (e) {
      // Fallo silencioso a propósito: el hook es ambiental, un error de red
      // aquí no debe interrumpir ni avisar al usuario.
      console.warn("hook audio error", e);
    }
  }, [stopAudio]);

  useEffect(() => {
    if (hookTimerRef.current) {
      clearTimeout(hookTimerRef.current);
      hookTimerRef.current = null;
    }

    hookTimerRef.current = setTimeout(() => {
      if (current) playHookForCurrentBook(current.book_id);
    }, 1500);

    return () => {
      if (hookTimerRef.current) clearTimeout(hookTimerRef.current);
    };
    // Se reinicia cada vez que cambia el libro actual. No depende de
    // playHookForCurrentBook directamente en el array para evitar relanzar
    // el timer si esa función se recrea por motivos ajenos al cambio de
    // libro; current.book_id es la señal real que nos importa.
  }, [currentIndex, current?.book_id]);

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
      const res = await api<{ audio_base64: string; mime: string }>("/tts", { method: "POST", body: JSON.stringify({ text, voice: "fable", book_id: current.book_id, lang }) });
      const uri = `data:${res.mime};base64,${res.audio_base64}`;
      const p = createAudioPlayer({ uri });
      playerRef.current = p;
      p.addListener("playbackStatusUpdate", (st: any) => { if (st.didJustFinish) stopAudio(); });
      p.play(); setPlaying(true);
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("402") || msg.includes("daily_limit_reached")) { setPaywallReason("limit"); setPaywallOpen(true); }
    } finally { setAudioLoading(false); }
  };

  const openAuthorChat = () => {
    if (!current) return;
    setInfoOpen(false);
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
    // Precarga la imagen
const coverUrl = `https://res.cloudinary.com/ddppclcl1/image/upload/v1780422197/${current.book_id}.webp`;
await Image.prefetch(coverUrl);
    // Espera un poco más para que se renderice
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

  if (loading && books.length === 0) {
    return (
      <View style={styles.center} testID="discover-loading">
        <ActivityIndicator size="large" color={colors.brass} />
        <Text style={styles.loadingText}>Conectando…</Text>
      </View>
    );
  }

  if (!current) {
    return (
      <View style={styles.center} testID="discover-empty">
        <Ionicons name="sparkles-outline" size={64} color={colors.copper} />
        <Text style={styles.emptyTitle}>No hay libros</Text>
        <TouchableOpacity style={styles.reloadBtn} testID="btn-reload-feed" onPress={() => fetchBooks(true)}>
          <Text style={styles.reloadText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="discover-screen">
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
        getItemLayout={(_, index) => ({ length: SLIDE_H, offset: SLIDE_H * index, index })}
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={1}
        renderItem={({ item }) => <BookSlide book={item} reservedBottom={buyRowHeight} slideHeight={SLIDE_H} />}
        testID="vertical-feed"
      />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
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


      <View style={styles.sideButtons} pointerEvents="box-none">
<SideButton icon="information-circle" color="#2cbb04" borderColor="#2cbb04" onPress={() => setInfoOpen(true)} testID="btn-info" />
<SideButton icon={isFav ? "heart" : "heart-outline"} color="#ff01cc" borderColor="#ff01cc" onPress={toggleFavorite} testID="btn-favorite" />
<SideButton icon={playing ? "pause" : "headset"} color="#04d3fc" borderColor="#04d3fc" onPress={() => { setAudioOpen(true); playAudio(); }} loading={audioLoading} testID="btn-audio" />
<SideButton icon="chatbubbles" color="#B026FF" borderColor="#B026FF" onPress={openAuthorChat} testID="btn-author-ia" />
<SideButton icon="star" color="#d0fe00" borderColor="#d0fe00" onPress={() => router.push({ pathname: "/reviews", params: { book_id: current.book_id, title: current.title, author: current.author } })} testID="btn-reviews" />


      </View>

      {/*
        buyRow sigue flotante y fijo, EXACTAMENTE igual que sideButtons:
        position absolute, fuera del FlatList, no se mueve al pasar de libro.
        IMPORTANTE: bottom ya NO suma insets.bottom aquí. Antes sí lo hacía,
        pero ahora SLIDE_H (más arriba) ya resta tabBarHeight completo —
        y tabBarHeight YA incluye su propio insets.bottom interno (ver
        (tabs)/_layout.tsx). Sumar insets.bottom otra vez aquí contaba ese
        espacio DOS veces, dejando un hueco negro de más entre buyRow y el
        tab bar en dispositivos con barra de navegación clásica (insets.bottom
        grande). Con solo un pequeño margen fijo de aire, queda igual de
        seguro pero sin doble conteo.
      */}
      <View
        style={[styles.buyRow, { bottom: 6 }]}
        pointerEvents="box-none"
        onLayout={onBuyRowLayout}
      >

      {/* Botón de Amazon */}
<TouchableOpacity testID="btn-buy-amazon" style={styles.buyBtn} onPress={() => {
  const q = encodeURIComponent(`${current.title} ${current.author}`);
  openStore(`https://www.amazon.es/s?k=${q}&i=stripbooks`);
}} activeOpacity={0.85}>
  <Ionicons name="logo-amazon" size={16} color="#f2fafdec" />
  <Text style={[styles.buyText, { color: "#FF9900" }]}>Amazon</Text>
</TouchableOpacity>

{/* Botón de Casa del Libro */}
<TouchableOpacity testID="btn-buy-casa" style={styles.buyBtn} onPress={() => {
  const q = encodeURIComponent(`${current.title} ${current.author}`);
  openStore(`https://www.casadellibro.com/busqueda-generica?query=${q}`);
}} activeOpacity={0.85}>
  <Ionicons name="book" size={16} color="#ffffff" />
  <Text style={[styles.buyText, { color: "#00FF66" }]}>Casa del Libro</Text>
</TouchableOpacity>

      </View>

      <FlashCardModal visible={infoOpen} book={current} lang={lang} onClose={() => setInfoOpen(false)} onAuthorChat={openAuthorChat} isPremium={!!user?.is_premium} />
      <AudioModal visible={audioOpen} book={current} lang={lang} playing={playing} loading={audioLoading} text={premiumSummaries[current.book_id]} onPlay={playAudio} onClose={() => { setAudioOpen(false); stopAudio(); }} />
      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} reason={paywallReason} onUpgraded={async () => { await refreshAuth(); }} />
    {/* Tarjeta invisible para la captura PNG */}
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
    </View>
  );
}

function BookSlide({ book, reservedBottom, slideHeight }: { book: Book; reservedBottom: number; slideHeight: number }) {
  const insets = useSafeAreaInsets();
  const mood = useMemo(() => inferMood(book), [book]);
  const coverW = SCREEN_W * 0.88;

  // Espacio real que ocupa topBar (ver styles.topBar + backBtn): el botón
  // circular mide 38 de alto, con paddingTop: insets.top + 8 por encima.
  // Reservamos esa franja completa para que topBar nunca quede tapado,
  // y SOLO DESPUÉS añadimos los 45 que topBadgesRow necesita "subir" desde
  // coverWrap (porque topBadgesRow es absolute con top:-45 relativo a
  // coverWrap, no a slide — son dos espacios distintos, no se solapan).
  const topBarSpace = insets.top + 8 + 38 + 8; // +8 de aire entre topBar y badges
  const slidePaddingTop = topBarSpace + 45;

  return (
    <View style={[styles.slide, { width: SCREEN_W, height: slideHeight, paddingTop: slidePaddingTop }]}>
      {/*
        coverArea: flex:1. Se lleva TODO el espacio que sobra después de
        reservar paddingTop (sitio real para topBar + sitio para
        topBadgesRow, que sigue flotando absolute por encima de coverWrap)
        y después de pillContainer + el spacer de abajo.
        Ya no hay ningún coverH calculado por resta de números mágicos.
      */}
      <View style={styles.coverArea}>
        <View style={styles.coverWrap}>
          <View style={styles.topBadgesRow} pointerEvents="box-none">
            <View style={styles.moodPill}>
              <Text style={styles.moodPillIcon}>{mood.icon}</Text>
              <Text style={[styles.moodPillLabel, { color: mood.color }]} numberOfLines={1}>{mood.label}</Text>
            </View>
            <View style={styles.ratingPill}>
              {renderStarsCompact(book.rating)}
              <Text style={styles.ratingValue}>{book.rating.toFixed(1)}</Text>
            </View>
          </View>

          {/*
            Antes: borderRadius/overflow estaban en la Image directamente,
            con height:"100%" y resizeMode="contain". Eso crea una CAJA
            grande (todo el alto disponible) dentro de la cual la imagen
            real del libro se dibuja más pequeña y centrada, dejando aire
            transparente alrededor — el borderRadius redondeaba esa caja
            invisible, no el borde real de la portada, por eso no se veía.

            Ahora: coverFrame tiene aspectRatio fijo (2:3, proporción
            estándar de tapa de libro) y altura máxima limitada al espacio
            disponible. Así el contenedor mide CASI exactamente lo mismo
            que la imagen real, y overflow:"hidden" + borderRadius sí
            recortan el borde visible del libro, en cualquier dispositivo.
          */}
          <View style={styles.coverFrame}>
            <Image
              source={{ uri: `https://res.cloudinary.com/ddppclcl1/image/upload/v1780422197/${book.book_id}.webp` }}
              resizeMode="cover"
              style={styles.coverImage}
              onError={(e) => console.log("Error cargando imagen:", e.nativeEvent.error)}
            />
          </View>

          <LinearGradient
            colors={['transparent', 'rgb(0, 0, 0)']}
            start={{ x: 0.9, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              right: 0,
              width: '60%',
            }}
          />
        </View>
      </View>

      {/* Tags — flujo normal, altura natural, sin cambios respecto al original */}
      <View style={styles.pillContainer}>
        {book.vibe_tags?.map((tag, index) => (
          <React.Fragment key={index}>
            <Text style={styles.pillText}>
              {tag.icon} {tag.label}
            </Text>
            {index < (book.vibe_tags?.length || 0) - 1 && (
              <Text style={styles.separator}>•</Text>
            )}
          </React.Fragment>
        ))}
      </View>

      {/*
        Spacer invisible: reserva exactamente la altura real medida del
        buyRow flotante (+ el mismo margen fijo de 6 que usa buyRow), para
        que coverArea (flex:1) nunca calcule de más y la portada no quede
        nunca tapada por los botones de compra fijos.
        No es clicable, no tiene contenido — es aire reservado en el flujo.
      */}
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
    arr.push(<Ionicons key={i} name={icon} size={11} color={colors.gold} style={{ marginHorizontal: 0.5 }} />);
  }
  return <View style={{ flexDirection: "row" }}>{arr}</View>;
}
function SideButtonMC({ icon, color, onPress, testID }: { icon: any; color: string; onPress: () => void; testID?: string; }) {
  return (
    <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.7} style={styles.sideBtnWrap}>
      <View style={[styles.sideBtn, { borderColor: color, shadowColor: color, shadowOpacity: 0.6, shadowRadius: 5 }]}>
        <MaterialCommunityIcons name={icon} size={22} color={color} />
      </View>
    </TouchableOpacity>
  );
}

function SideButton({ icon, color, borderColor, onPress, loading, testID }: { icon: any; color: string; borderColor?: string; onPress: () => void; loading?: boolean; testID?: string; }) {
  const border = borderColor || color;
  return (
    <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.7} style={styles.sideBtnWrap}>
      <View style={[styles.sideBtn, { borderColor: border, shadowColor: border }]}>
        {loading ? <ActivityIndicator size="small" color={color} /> : <Ionicons name={icon} size={22} color={color} />}
      </View>
    </TouchableOpacity>
  );
}

function BuyBtn({ label, icon, onPress, testID }: { label: string; icon: any; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity testID={testID} style={styles.buyBtn} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name={icon} size={16} color={colors.gold} />
      <Text style={styles.buyText}>{label}</Text>
    </TouchableOpacity>
  );
}

function FlashCardModal({ visible, book, lang, onClose, onAuthorChat, isPremium }: { visible: boolean; book: Book; lang: "es" | "en"; onClose: () => void; onAuthorChat: () => void; isPremium: boolean; }) {
  const insets = useSafeAreaInsets();
  const ext = (book as any) || {};

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.flashCard, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity onPress={onClose} style={styles.flashClose} testID="btn-close-flash">
            <Ionicons name="close" size={22} color={colors.textOnDarkMuted} />
          </TouchableOpacity>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.flashTitle} numberOfLines={3}>{book.title}</Text>
            <Text style={styles.flashAuthor}>{book.author}</Text>
            <View style={styles.statRow}>
              <StatBox icon="calendar" label="AÑO" value={String(book.year)} />
              <StatBox icon="book" label="PÁGINAS" value={String(book.pages)} />
              <StatBox icon="rocket" label="GÉNERO" value={book.genre.split("/")[0].trim()} small />
            </View>
            <View style={styles.flashLabel}>
              <Text style={styles.flashLabelText}>— FLASH CARD —</Text>
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

            {/* Bloque limpio sin título de la frase impactante */}
            {ext.hook && (
              <View style={styles.hookContainer}>
                <Text style={styles.hookText}>"{ext.hook}"</Text>
              </View>
            )}

            <TouchableOpacity style={[styles.iaBtn, !isPremium && styles.iaBtnLocked]} onPress={onAuthorChat} activeOpacity={0.85} testID="btn-flash-author-chat">
              <Ionicons name={isPremium ? "chatbubbles" : "lock-closed"} size={16} color={isPremium ? colors.bgBase : colors.gold} />
              <Text style={[styles.iaBtnText, !isPremium && styles.iaBtnTextLocked]}>IA con el Autor {!isPremium && "(Premium)"}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function StatBox({ icon, label, value, small }: { icon: any; label: string; value: string; small?: boolean }) {
  return (
    <View style={styles.statBox}>
      <Ionicons name={icon} size={20} color={colors.brass} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, small && { fontSize: 13 }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function DetailItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.detailItem}>
      <View style={styles.detailHeader}>
        <Ionicons name="star" size={10} color={color} />
        <Text style={[styles.detailLabel, { color }]}>{label}</Text>
      </View>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function AudioModal({ visible, book, lang, playing, loading, text, onPlay, onClose }: { visible: boolean; book: Book; lang: "es" | "en"; playing: boolean; loading: boolean; text?: string; onPlay: () => void; onClose: () => void; }) {
  const insets = useSafeAreaInsets();
  const fallback = lang === "es" ? book.summary_es : book.summary_en;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.flashCard, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity onPress={onClose} style={styles.flashClose} testID="btn-close-audio">
            <Ionicons name="close" size={22} color={colors.textOnDarkMuted} />
          </TouchableOpacity>
          <View style={styles.audioHeader}>
            <Text style={styles.audioBadge}>// RESUMEN · 1 MIN</Text>
            <TouchableOpacity onPress={onPlay} style={styles.audioPlayBtn} disabled={loading} testID="btn-audio-play">
              {loading ? <ActivityIndicator color={colors.brass} /> : <Ionicons name={playing ? "pause" : "play"} size={26} color={colors.brass} />}
            </TouchableOpacity>
          </View>
          <View style={styles.dividerLine} />
          <Text style={styles.flashTitle}>{book.title}</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 10 }}>
            <Text style={styles.synopsisText}>{text || fallback}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bgBase, padding: 24 },
  loadingText: { color: colors.textOnDarkMuted, marginTop: 14, letterSpacing: 1 },
  emptyTitle: { color: colors.textOnDark, fontSize: 18, marginTop: 12, textAlign: "center" },
  reloadBtn: { marginTop: 24, borderWidth: 1, borderColor: colors.brass, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999 },
  reloadText: { color: colors.brass, letterSpacing: 2, fontWeight: "700" },
  // slide: ya NO usa justifyContent:"center". Es columna flex de arriba a
  // abajo: paddingTop reserva sitio para topBadgesRow (absolute), luego
  // coverArea (flex:1) se lleva el resto, luego pillContainer y el spacer.
  slide: { backgroundColor: colors.bgBase, alignItems: "center", flexDirection: "column" },
  coverArea: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" },
  coverWrap: { position: "relative", width: SCREEN_W * 0.88, height: "100%", alignItems: "center", justifyContent: "center" },
  // coverFrame: contenedor con proporción fija 2:3 (estándar de tapa de
  // libro) y altura máxima = el espacio real disponible. overflow:"hidden"
  // recorta la imagen exactamente en su propio borde, no en un hueco
  // transparente más grande — por eso ahora SÍ se ven las esquinas
  // redondeadas. maxWidth evita que en pantallas muy altas la portada se
  // vuelva demasiado ancha en proporción a su alto.
  coverFrame: { width: "100%", maxWidth: SCREEN_W * 0.88, aspectRatio: 2 / 3, maxHeight: "100%", borderRadius: 15, overflow: "hidden" },
  coverImage: { width: "100%", height: "100%" },
  topBadgesRow: { position: "absolute", top: -45, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4, zIndex: 8 },
  moodPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 15, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.brassSoft, backgroundColor: "rgba(6,1,15,0.85)" },
  moodPillIcon: { fontSize: 14 },
  moodPillLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  ratingPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5, borderColor: "#031588", backgroundColor: "rgba(6,1,15,0.85)" },
  ratingValue: { color: colors.copper, fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, zIndex: 10 },
  backBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.brassSoft, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  brandRow: { flexDirection: "row" },
  brandCyan: { color: colors.brass, fontWeight: "900", fontSize: 18 },
  brandPurple: { color: colors.copper, fontWeight: "900", fontSize: 18 },
  queryWrap: { position: "absolute", left: 0, right: 0, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 5 },
  queryHint: { color: colors.copper, fontSize: 12, fontWeight: "600", letterSpacing: 1, maxWidth: 240 },
  sideButtons: { position: "absolute", right: 10, top: "50%", marginTop: -90, gap: 16, alignItems: "center", zIndex: 10 },
  sideBtnWrap: { alignItems: "center" },
sideBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(6,1,15,0.6)", shadowOpacity: 0.7, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 5 },
  // buyRow: igual que antes (flotante, absolute, fijo), solo cambia que
  // `bottom` ya no es un número fijo (-23) sino que se inyecta dinámicamente
  // con insets.bottom + 8 desde donde se usa el estilo (ver JSX de Discover).
  buyRow: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", gap: 8, paddingHorizontal: 12, zIndex: 10 },
  buyBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderColor: colors.brassSoft, paddingHorizontal: 8, paddingVertical: 11, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.6)", shadowColor: colors.brass, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 5 },
  buyText: { color: colors.gold, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  flashCard: { backgroundColor: colors.bgSurface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 2, borderColor: colors.copper, paddingHorizontal: 22, maxHeight: SCREEN_H * 0.92 },
  flashClose: { position: "absolute", top: 12, right: 12, padding: 8, zIndex: 5 },
  flashTitle: { color: colors.textOnDark, fontSize: 24, fontWeight: "900" },
  flashAuthor: { color: colors.brass, fontSize: 14, marginTop: 4, fontStyle: "italic" },
  statRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  statBox: { flex: 1, borderWidth: 1, borderColor: colors.brassSoft, borderRadius: 12, padding: 10, alignItems: "center", backgroundColor: "rgba(0,240,255,0.04)" },
  statLabel: { color: colors.textOnDark, fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginTop: 4 },
  statValue: { color: colors.brass, fontSize: 13, fontWeight: "900", marginTop: 2 },
  flashLabel: { alignItems: "center", marginTop: 18 },
  flashLabelText: { color: colors.copper, fontSize: 13, letterSpacing: 4, fontWeight: "800" },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: colors.brassSoft, borderRadius: 12, padding: 14, marginTop: 10 },
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
  audioHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 },
  audioBadge: { color: colors.copper, fontSize: 12, letterSpacing: 3, fontWeight: "900" },
  audioPlayBtn: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: colors.brass, alignItems: "center", justifyContent: "center", backgroundColor: colors.bgBase },
  dividerLine: { height: 1, backgroundColor: colors.copper, opacity: 0.4, marginTop: 10, marginBottom: 12 },
  pillContainer: {
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: 'rgba(255, 255, 255, 0.07)',
  paddingVertical: 5,
  paddingHorizontal: 16,
  borderRadius: 25,
  borderWidth: 1,
  borderColor: '#08a3fd3b',
  marginTop: 8,
  marginBottom: 10,
},
pillText: {
  color: '#ffffff',
  fontSize: 13,
  marginHorizontal: 7,
  fontWeight: '500',
},
separator: {
  color: 'rgba(57, 138, 243, 0.64)',
  fontSize: 12,
},
  hookContainer: { marginTop: 24, padding: 16, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 16, borderLeftWidth: 3, borderLeftColor: colors.copper },
  hookText: { color: colors.textOnDark, fontSize: 16, fontStyle: 'italic', textAlign: 'center', lineHeight: 24, fontWeight: '500' },
});