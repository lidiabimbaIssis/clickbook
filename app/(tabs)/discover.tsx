import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, ActivityIndicator, Platform, Linking, ScrollView, Modal, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { createAudioPlayer } from "expo-audio";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, Book } from "../../src/lib/api";
import { useAuth } from "../../src/providers/AuthProvider";
import { colors } from "../../src/theme";
import PaywallModal from "../../src/components/PaywallModal";
import { shareContent } from "../../src/lib/share";
import ShareCard from "../../src/components/ShareCard";
import { captureAndShare } from "../../src/lib/share";

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
  const text = `${book.genre || ""}`;
  for (const m of MOOD_MAP) if (m.kw.test(text)) return { label: m.label, icon: m.icon, color: m.color };
  return { label: "Descubre", icon: "📖", color: colors.brass };
}

export default function Discover() {
  const { user, refresh: refreshAuth } = useAuth();
  const lang = (user?.lang || "es") as "es" | "en";
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; book_id?: string }>();
  const query = (params.q || "").toString();
  const seedBookId = (params.book_id || "").toString();

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
  const listRef = useRef<FlatList<Book>>(null);
  const shareCardRef = useRef<View>(null);

  const stopAudio = useCallback(() => {
    try { playerRef.current?.pause?.(); playerRef.current?.remove?.(); } catch {}
    playerRef.current = null;
    setPlaying(false);
  }, []);

const fetchBooks = useCallback(async (initial: boolean) => {
    if (initial) setLoading(true);
    try {
      const targetCount = 30;
      // Definimos la ruta dependiendo de si hay búsqueda o no
      const endpoint = query 
        ? `/books/search?query=${encodeURIComponent(query)}` 
        : `/books/feed?count=${targetCount}`;
      
      console.log("DEBUG: Llamando a:", endpoint);
      const res = await api<{ books: Book[] }>(endpoint);
      
      console.log("DEBUG: Libros recibidos:", res?.books?.length || 0);
      
      setBooks(res?.books || []);
    } catch (e) { 
      console.warn("feed error", e); 
    } finally { 
      setLoading(false); 
    }
  }, [query]);

  useEffect(() => {
    // Esto se ejecuta solo una vez al cargar la pantalla
    fetchBooks(true);
    
    // Cargamos favoritos aparte
    const loadFavs = async () => {
        try { 
            const res = await api<{ books: Book[] }>("/favorites"); 
            setFavBookIds(new Set(res.books.map((b) => b.book_id))); 
        } catch (e) {
            console.log("No se pudieron cargar favoritos (normal si no hay login)");
        }
    };
    loadFavs();

    return () => stopAudio();
  }, []); // <--- El array vacío asegura que solo se ejecute al montar

  const current = books[currentIndex];
  const isFav = current ? favBookIds.has(current.book_id) : false;

  const onMomentumScrollEnd = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / SCREEN_H);
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
    if (!user?.is_premium) { setPaywallReason("chat"); setPaywallOpen(true); setInfoOpen(false); return; }
    setInfoOpen(false);
    router.push({ pathname: "/author-chat", params: { book_id: current.book_id, title: current.title, author: current.author } });
  };

 const shareBook = async () => {
    if (!current) return;
    try {
      // PROTECCIÓN AQUÍ
      await new Promise((r) => setTimeout(r, 100));
      await captureAndShare(shareCardRef.current, `clickbook-${current.book_id}`);
    } catch (e) {
      console.warn("share book failed", e);
    }
  };

  const openStore = (url: string) => {
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
        snapToInterval={SCREEN_H}
        snapToAlignment="start"
        decelerationRate="fast"
        onMomentumScrollEnd={onMomentumScrollEnd}
        getItemLayout={(_, index) => ({ length: SCREEN_H, offset: SCREEN_H * index, index })}
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={1}
        renderItem={({ item }) => <BookSlide book={item} />}
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

      {query ? (
        <View style={[styles.queryWrap, { top: insets.top + 56 }]} pointerEvents="none">
          <Ionicons name="search" size={11} color={colors.copper} />
          <Text style={styles.queryHint} numberOfLines={1}>{query}</Text>
        </View>
      ) : null}

      <View style={styles.sideButtons} pointerEvents="box-none">
        <SideButton icon="information-circle" color={colors.verdigris} onPress={() => setInfoOpen(true)} testID="btn-info" />
        <SideButton icon={isFav ? "heart" : "heart-outline"} color={colors.iron} onPress={toggleFavorite} testID="btn-favorite" />
        <SideButton icon={playing ? "pause" : "headset"} color={colors.brass} onPress={() => { setAudioOpen(true); playAudio(); }} loading={audioLoading} testID="btn-audio" />
        
        {/* IA del Autor (Cerebro) — Color Cian Eléctrico con tu lógica Premium */}
        <SideButtonMC icon="brain" color="#A020F0" onPress={openAuthorChat} testID="btn-author-ia" />
        
        {/* Reseñas — Color Rosa Neón / Magenta con la estrella */}
        <SideButton icon="star" color="#CCFF00"onPress={() => router.push({ pathname: "/reviews", params: { book_id: current.book_id, title: current.title, author: current.author } })} testID="btn-reviews" />
      </View>

      <View style={[styles.buyRow, { paddingBottom: insets.bottom + 6 }]} pointerEvents="box-none">
        
        {/* Botón de Amazon: Contenedor dorado/amarillo, Icono y Texto en NARANJA */}
        <TouchableOpacity testID="btn-buy-amazon" style={styles.buyBtn} onPress={() => openStore(current.amazon_url)} activeOpacity={0.85}>
          <Ionicons name="logo-amazon" size={16} color="#FF9900" />
          <Text style={[styles.buyText, { color: "#FF9900" }]}>Amazon</Text>
        </TouchableOpacity>
        
        {/* Botón de Casa del Libro: Contenedor dorado/amarillo, Icono y Texto en VERDE NEÓN */}
        <TouchableOpacity testID="btn-buy-casa" style={styles.buyBtn} onPress={() => openStore(current.casa_del_libro_url)} activeOpacity={0.85}>
          <Ionicons name="book" size={16} color="#00FF66" />
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
            data={{
              title: current.title,
              author: current.author,
              coverUrl: current.cover_url,
              rating: current.rating,
              // PROTECCIÓN AQUÍ: si el texto es undefined o null, devuelve "" vacío
              hookText: ((premiumSummaries[current.book_id] || (lang === "es" ? current.summary_es : current.summary_en) || "").split(/\.\s/)[0] || ""),
            }}
          />
        )}
      </View>
    </View>
  );
}

function BookSlide({ book }: { book: Book }) {
  const insets = useSafeAreaInsets();
  const mood = useMemo(() => inferMood(book), [book]);
  const coverW = SCREEN_W * 0.88;
  const coverH = Math.min(coverW * 1.5, SCREEN_H - insets.top - insets.bottom - 240);

  return (
    <View style={[styles.slide, { width: SCREEN_W, height: SCREEN_H }]}>
      <View style={{ position: "relative", width: coverW, alignItems: "center" }}>
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
        <Image source={{ uri: book.cover_url }} style={{ width: coverW, height: coverH, borderRadius: 14 }} resizeMode="cover" />
      </View>
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

function SideButton({ icon, color, onPress, loading, testID }: { icon: any; color: string; onPress: () => void; loading?: boolean; testID?: string; }) {
  return (
    <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.7} style={styles.sideBtnWrap}>
      <View style={[styles.sideBtn, { borderColor: color, shadowColor: color }]}>
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
  const synopsis = lang === "es" ? book.synopsis_es : book.synopsis_en;
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
              <DetailItem label="TROPE" value={ext.trope || "—"} color={colors.iron} />
              <DetailItem label="COMPLEJIDAD" value={ext.complejidad || "Media"} color={colors.brass} />
              <DetailItem label="¿ES SAGA?" value={ext.es_saga || "No"} color={colors.iron} />
              <DetailItem label="CONT. SENSIBLE" value={ext.contenido_sensible || "—"} color={colors.brass} />
              <DetailItem label="PÚBLICO" value={ext.publico || "General"} color={colors.iron} />
              <DetailItem label="EDAD" value={ext.edad || "+12"} color={colors.brass} />
            </View>
            <Text style={styles.synopsisLabel}>SINOPSIS</Text>
            <Text style={styles.synopsisText}>{synopsis}</Text>
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
  slide: { backgroundColor: colors.bgBase, alignItems: "center", justifyContent: "center" },
  topBadgesRow: { position: "absolute", top: -55, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4, zIndex: 8 },
  moodPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 15, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.brassSoft, backgroundColor: "rgba(6,1,15,0.85)" },
  moodPillIcon: { fontSize: 14 },
  moodPillLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  ratingPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5, borderColor: colors.copper, backgroundColor: "rgba(6,1,15,0.85)" },
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
  buyRow: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", gap: 8, paddingHorizontal: 12, zIndex: 10 },
  buyBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderColor: colors.goldSoft, paddingHorizontal: 8, paddingVertical: 11, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.6)" },
  buyText: { color: colors.gold, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  flashCard: { backgroundColor: colors.bgSurface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 2, borderColor: colors.copper, paddingHorizontal: 22, maxHeight: SCREEN_H * 0.92 },
  flashClose: { position: "absolute", top: 12, right: 12, padding: 8, zIndex: 5 },
  flashTitle: { color: colors.textOnDark, fontSize: 22, fontWeight: "900" },
  flashAuthor: { color: colors.brass, fontSize: 14, marginTop: 4, fontStyle: "italic" },
  statRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  statBox: { flex: 1, borderWidth: 1, borderColor: colors.brassSoft, borderRadius: 12, padding: 10, alignItems: "center", backgroundColor: "rgba(0,240,255,0.04)" },
  statLabel: { color: colors.textOnDark, fontSize: 9, fontWeight: "800", letterSpacing: 1.5, marginTop: 4 },
  statValue: { color: colors.brass, fontSize: 15, fontWeight: "900", marginTop: 2 },
  flashLabel: { alignItems: "center", marginTop: 18 },
  flashLabelText: { color: colors.copper, fontSize: 10, letterSpacing: 4, fontWeight: "800" },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: colors.brassSoft, borderRadius: 12, padding: 14, marginTop: 10 },
  detailItem: { width: "50%", paddingVertical: 8, paddingRight: 8 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 4 },
  detailLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  detailValue: { color: colors.textOnDark, fontSize: 13, marginTop: 3 },
  synopsisLabel: { color: colors.copper, fontSize: 10, letterSpacing: 3, fontWeight: "900", marginTop: 18 },
  synopsisText: { color: colors.textOnDark, fontSize: 14, lineHeight: 21, marginTop: 8 },
  iaBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.gold, paddingVertical: 13, borderRadius: 999, marginTop: 18 },
  iaBtnText: { color: colors.bgBase, fontWeight: "900", fontSize: 13, letterSpacing: 0.5 },
  iaBtnLocked: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.gold },
  iaBtnTextLocked: { color: colors.gold },
  audioHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 },
  audioBadge: { color: colors.copper, fontSize: 12, letterSpacing: 3, fontWeight: "900" },
  audioPlayBtn: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: colors.brass, alignItems: "center", justifyContent: "center", backgroundColor: colors.bgBase },
  dividerLine: { height: 1, backgroundColor: colors.copper, opacity: 0.4, marginTop: 10, marginBottom: 12 },
});