¡Plantilla dinámica al 100%, lista para conectar al backend! Te paso el código + la estructura JSON que tu API debe devolver.

🟢 1. NUEVO archivo: frontend/app/vibes.tsx
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "../src/lib/api";
import { colors } from "../src/theme";

/* ====== Tipos esperados desde la API ====== */
export type Topic = { label: string; percent: number; icon: string; color: string };
export type Emotion = { label: string; percent: number; icon: string; color: string };
export type Reaction = { mood: string; quote: string; count_label: string; color: string; icon: string; avatars: string[] };
export type RealReview = { user_name: string; avatar_url?: string; rating: number; text: string; time_ago: string; likes: number; is_top?: boolean };
export type VibesData = {
  overall_rating: number;
  total_reviews_label: string;
  topics: Topic[];
  emotions: Emotion[];
  reactions: Reaction[];
  reviews: RealReview[];
};

/* ====== Componente principal ====== */
export default function VibesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ book_id?: string; title?: string }>();
  const bookId = (params.book_id || "").toString();
  const bookTitle = (params.title || "").toString();

  const [data, setData] = useState<VibesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!bookId) {
      setError("Falta el libro.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Esta línea llama a la API. Si tu API ya está conectada a tu MongoDB,
      // esto funcionará perfecto.
      const res = await api<VibesData>(`/books/${bookId}/vibes`);
      setData(res);
    } catch (e: any) {
      setError("No se pudieron cargar las vibes.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [bookId]);
  useEffect(() => { load(); }, [load]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]} testID="vibes-screen">
      <Header title={bookTitle} onBack={() => router.back()} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brass} />
          <Text style={styles.loadingText}>Sintiendo las vibes…</Text>
        </View>
      ) : error || !data ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={56} color={colors.copper} />
          <Text style={styles.emptyText}>{error || "Aún no hay reseñas"}</Text>
          <TouchableOpacity onPress={load} style={styles.retryBtn} testID="btn-retry-vibes">
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
          <OverallRatingCard rating={data.overall_rating} totalLabel={data.total_reviews_label} topics={data.topics} />
          <EmotionsCard emotions={data.emotions} />
          <ReactionsCard reactions={data.reactions} />
          <ReviewsCard reviews={data.reviews} />
        </ScrollView>
      )}
    </View>
  );
}

/* ====== Header ====== */
function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn} testID="btn-back-vibes">
        <Ionicons name="chevron-back" size={22} color={colors.brass} />
      </TouchableOpacity>
      <View style={{ flex: 1, alignItems: "center" }}>
        <View style={styles.titleRow}>
          <Text style={styles.titleText}>VIBES</Text>
          <Ionicons name="sparkles" size={16} color={colors.copper} style={{ marginLeft: 6 }} />
        </View>
        {title ? <Text style={styles.subtitle} numberOfLines={1}>{title}</Text> : null}
      </View>
      <View style={{ width: 38 }} />
    </View>
  );
}

/* ====== 1) Calificación general + Topics ====== */
function OverallRatingCard({ rating, totalLabel, topics }: { rating: number; totalLabel: string; topics: Topic[] }) {
  return (
    <View style={[styles.card, { borderColor: colors.brass, shadowColor: colors.brass }]}>
      <View style={styles.cardCols}>
        {/* Left: rating */}
        <View style={{ flex: 0.9 }}>
          <Text style={[styles.cardLabel, { color: colors.brass }]}>CALIFICACIÓN GENERAL</Text>
          <View style={styles.ratingRow}>
            <Text style={styles.ratingNumber}>{rating.toFixed(1)}</Text>
            <Ionicons name="star" size={24} color={colors.copper} style={{ marginLeft: 6, marginTop: 8 }} />
          </View>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Ionicons key={i} name={i <= Math.round(rating) ? "star" : "star-outline"} size={16} color={colors.gold} style={{ marginRight: 2 }} />
            ))}
          </View>
          <Text style={styles.totalLabel}>{totalLabel}</Text>
        </View>
        {/* Right: topics */}
        <View style={{ flex: 1.1, paddingLeft: 10 }}>
          <Text style={[styles.cardLabel, { color: colors.brass, marginBottom: 8 }]}>¿DE QUÉ HABLAN MÁS?</Text>
          <View style={{ gap: 6 }}>
            {topics.map((t, i) => (
              <View key={i} style={[styles.topicPill, { borderColor: t.color }]}>
                <View style={styles.topicLeft}>
                  <DynamicIcon name={t.icon} size={14} color={t.color} />
                  <Text style={[styles.topicLabel, { color: t.color }]}>{t.label}</Text>
                </View>
                <Text style={[styles.topicPct, { color: t.color }]}>{t.percent}%</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

/* ====== 2) Lo que sentirás leyendo ====== */
function EmotionsCard({ emotions }: { emotions: Emotion[] }) {
  return (
    <View style={[styles.card, { borderColor: colors.copper, shadowColor: colors.copper }]}>
      <View style={styles.cardHead}>
        <Text style={[styles.cardLabel, { color: colors.brass }]}>LO QUE SENTIRÁS LEYENDO ESTE LIBRO</Text>
        <Ionicons name="sparkles" size={12} color={colors.copper} style={{ marginLeft: 6 }} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingVertical: 14, paddingHorizontal: 4 }}>
        {emotions.map((e, i) => (
          <View key={i} style={styles.emotionItem}>
            <DynamicIcon name={e.icon} size={42} color={e.color} />
            <Text style={[styles.emotionPct, { color: e.color }]}>{e.percent}%</Text>
            <Text style={styles.emotionLabel} numberOfLines={2}>{e.label}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/* ====== 3) Reacciones de lectores ====== */
function ReactionsCard({ reactions }: { reactions: Reaction[] }) {
  return (
    <View style={[styles.card, { borderColor: colors.copper, shadowColor: colors.copper }]}>
      <View style={styles.cardHead}>
        <Text style={[styles.cardLabel, { color: colors.brass }]}>REACCIONES DE LECTORES</Text>
        <Ionicons name="sparkles" size={12} color={colors.copper} style={{ marginLeft: 6 }} />
        <View style={{ flex: 1 }} />
        <TouchableOpacity testID="btn-see-all-reactions">
          <Text style={styles.linkText}>Ver todas ›</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 14, paddingHorizontal: 4 }}>
        {reactions.map((r, i) => (
          <View key={i} style={[styles.reactionCard, { borderColor: r.color, shadowColor: r.color }]}>
            <DynamicIcon name={r.icon} size={36} color={r.color} />
            <Text style={[styles.reactionMood, { color: r.color }]}>{r.mood}</Text>
            <Text style={styles.reactionQuote} numberOfLines={3}>"{r.quote}"</Text>
            <View style={styles.reactionFooter}>
              <View style={styles.avatarsRow}>
                {(r.avatars || []).slice(0, 3).map((a, idx) => (
                  <Image key={idx} source={{ uri: a }} style={[styles.smallAvatar, { marginLeft: idx === 0 ? 0 : -8, borderColor: r.color }]} />
                ))}
              </View>
              <Text style={styles.reactionCount}>{r.count_label}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/* ====== 4) Opiniones reales ====== */
function ReviewsCard({ reviews }: { reviews: RealReview[] }) {
  return (
    <View style={[styles.card, { borderColor: colors.brass, shadowColor: colors.brass }]}>
      <View style={styles.cardHead}>
        <Text style={[styles.cardLabel, { color: colors.brass }]}>OPINIONES REALES</Text>
        <Ionicons name="sparkles" size={12} color={colors.copper} style={{ marginLeft: 6 }} />
        <View style={{ flex: 1 }} />
        <Text style={[styles.linkText, { color: colors.textOnDarkMuted }]}>Más recientes ▾</Text>
      </View>
      <View style={{ marginTop: 6 }}>
        {reviews.map((r, i) => (
          <View key={i} style={styles.realRow}>
            <View style={styles.realAvatar}>
              {r.avatar_url ? (
                <Image source={{ uri: r.avatar_url }} style={{ width: 44, height: 44, borderRadius: 22 }} />
              ) : (
                <Text style={styles.realAvatarText}>{(r.user_name || "?").charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.realHeader}>
                <Text style={styles.realUser}>{r.user_name}</Text>
                {r.is_top && (
                  <View style={styles.topBadge}><Text style={styles.topBadgeText}>TOP</Text></View>
                )}
              </View>
              <View style={styles.realStarsRow}>
                {[1, 2, 3, 4, 5].map((i2) => (
                  <Ionicons key={i2} name={i2 <= r.rating ? "star" : "star-outline"} size={12} color={colors.gold} style={{ marginRight: 1 }} />
                ))}
                <Text style={styles.timeAgo}>{r.time_ago}</Text>
              </View>
              <Text style={styles.realText}>{r.text}</Text>
            </View>
            <View style={styles.likeBox}>
              <Ionicons name="heart-outline" size={16} color={colors.textOnDarkMuted} />
              <Text style={styles.likeText}>{r.likes}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ====== Icon dinámico por nombre (acepta Ionicons o MaterialCommunityIcons) ====== */
function DynamicIcon({ name, size, color }: { name: string; size: number; color: string }) {
  // Si empieza con "mc:" usa MaterialCommunityIcons. Si no, Ionicons.
  if (name?.startsWith("mc:")) {
    return <MaterialCommunityIcons name={name.slice(3) as any} size={size} color={color} />;
  }
  return <Ionicons name={(name || "ellipse") as any} size={size} color={color} />;
}

/* ====== Styles ====== */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  loadingText: { color: colors.textOnDarkMuted, marginTop: 14, letterSpacing: 1.5 },
  emptyText: { color: colors.textOnDark, marginTop: 14, fontSize: 15 },
  retryBtn: { marginTop: 18, borderWidth: 1, borderColor: colors.brass, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 999 },
  retryText: { color: colors.brass, fontWeight: "800", letterSpacing: 2 },

  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 14, gap: 8 },
  backBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: colors.brass, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center" },
  titleText: { color: colors.textOnDark, fontWeight: "900", letterSpacing: 8, fontSize: 18 },
  subtitle: { color: colors.copper, fontSize: 12, marginTop: 4, letterSpacing: 0.5 },

  card: { borderWidth: 1.5, borderRadius: 18, padding: 14, marginBottom: 14, backgroundColor: "rgba(8,3,17,0.6)", shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 5 },
  cardCols: { flexDirection: "row" },
  cardHead: { flexDirection: "row", alignItems: "center", paddingBottom: 2 },
  cardLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 2 },

  ratingRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  ratingNumber: { color: colors.textOnDark, fontSize: 52, fontWeight: "900", letterSpacing: -2 },
  starsRow: { flexDirection: "row", marginTop: 6 },
  totalLabel: { color: colors.textOnDarkMuted, fontSize: 11, marginTop: 8 },

  topicPill: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.4)" },
  topicLeft: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  topicLabel: { fontSize: 12, fontWeight: "700" },
  topicPct: { fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },

  emotionItem: { alignItems: "center", width: 88, paddingVertical: 4 },
  emotionPct: { fontSize: 22, fontWeight: "900", marginTop: 4 },
  emotionLabel: { color: colors.textOnDarkMuted, fontSize: 11, textAlign: "center", marginTop: 2 },

  reactionCard: { width: 150, borderWidth: 1.5, borderRadius: 14, padding: 12, alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)", shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  reactionMood: { fontSize: 13, fontWeight: "900", letterSpacing: 2, marginTop: 8 },
  reactionQuote: { color: colors.textOnDark, fontSize: 12, textAlign: "center", marginTop: 6, fontStyle: "italic", lineHeight: 16 },
  reactionFooter: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 6, width: "100%", justifyContent: "space-between" },
  avatarsRow: { flexDirection: "row" },
  smallAvatar: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, backgroundColor: colors.bgSurface },
  reactionCount: { color: colors.textOnDarkMuted, fontSize: 11, fontWeight: "700" },

  linkText: { color: colors.brass, fontSize: 11, fontWeight: "700" },

  realRow: { flexDirection: "row", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(176,38,255,0.15)", gap: 10, alignItems: "flex-start" },
  realAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.copper, alignItems: "center", justifyContent: "center", backgroundColor: colors.bgSurface, overflow: "hidden" },
  realAvatarText: { color: colors.copper, fontSize: 18, fontWeight: "900" },
  realHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  realUser: { color: colors.textOnDark, fontSize: 14, fontWeight: "800" },
  topBadge: { backgroundColor: colors.copper, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  topBadgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  realStarsRow: { flexDirection: "row", alignItems: "center", marginTop: 3 },
  timeAgo: { color: colors.textOnDarkMuted, fontSize: 11, marginLeft: 8 },
  realText: { color: colors.textOnDark, fontSize: 13, lineHeight: 19, marginTop: 5 },
  likeBox: { alignItems: "center", justifyContent: "center", gap: 2, minWidth: 36 },
  likeText: { color: colors.textOnDarkMuted, fontSize: 11, fontWeight: "700" },
});