import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "../src/lib/api";
import { colors } from "../src/theme";

/* ====== Tipos esperados desde la API ====== */
export type Topic = { label: string; percent: number; icon: string; color: string };
export type CompositionItem = { label: string; percent: number; icon: string; color: string; description: string };
export type CollectiveFeeling = { emoji: string; label: string; count_label: string };
export type CompatibleBook = { book_id: string; title: string; author: string; cover_url: string };
export type VibesData = {
  overall_rating: number;
  total_reviews_label: string;
  topics: Topic[];
  composition: CompositionItem[];
  collective_feelings: CollectiveFeeling[];
  compatibility: CompatibleBook[];
};

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
    setLoading(true);
    setError(null);
    try {
      // TU LÓGICA DE MONGODB (Mantén esto tal cual)
      const res = await api<any>(`/books/${bookId}`); 
      setData(res.vibes_data || res); 
    } catch (e: any) {
      setError("No se pudieron cargar las vibes.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => { load(); }, [load]);

  const openBook = (id: string, title: string) => {
    router.push({ pathname: "/discover", params: { book_id: id, title } });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]} testID="vibes-screen">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="btn-back-vibes">
          <Ionicons name="chevron-back" size={22} color={colors.brass} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <View style={styles.titleRow}>
            <Text style={styles.titleText}>VIBES</Text>
            <Ionicons name="sparkles" size={16} color={colors.copper} style={{ marginLeft: 6 }} />
          </View>
          {bookTitle ? <Text style={styles.subtitle} numberOfLines={1}>{bookTitle}</Text> : null}
        </View>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brass} />
          <Text style={styles.loadingText}>Sintiendo las vibes…</Text>
        </View>
      ) : error || !data ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={56} color={colors.copper} />
          <Text style={styles.emptyText}>{error || "Aún no hay datos"}</Text>
          <TouchableOpacity onPress={load} style={styles.retryBtn} testID="btn-retry-vibes">
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
          {/* 1) Calificación general + Topics */}
          <View style={styles.card}>
            <View style={styles.cardCols}>
              <View style={{ flex: 0.9 }}>
                <Text style={styles.cardLabel}>CALIFICACIÓN GENERAL</Text>
                <View style={styles.ratingRow}>
                  <Text style={styles.ratingNumber}>{data.overall_rating.toFixed(1)}</Text>
                  <Ionicons name="star" size={22} color={colors.copper} style={{ marginLeft: 6, marginTop: 8 }} />
                </View>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Ionicons key={i} name={i <= Math.round(data.overall_rating) ? "star" : "star-outline"} size={14} color={colors.gold} style={{ marginRight: 2 }} />
                  ))}
                </View>
                <Text style={styles.totalLabel}>{data.total_reviews_label}</Text>
              </View>
              <View style={{ flex: 1.1, paddingLeft: 10 }}>
                <Text style={[styles.cardLabel, { marginBottom: 8 }]}>¿DE QUÉ HABLAN MÁS?</Text>
                <View style={{ gap: 6 }}>
                  {data.topics.map((t, i) => (
                    <View key={i} style={[styles.topicPill, { borderColor: t.color }]}>
                      <View style={styles.topicLeft}>
                        <DynamicIcon name={t.icon} size={13} color={t.color} />
                        <Text style={[styles.topicLabel, { color: t.color }]}>{t.label}</Text>
                      </View>
                      <Text style={[styles.topicPct, { color: t.color }]}>{t.percent}%</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>

          {/* 2) Composición profunda (Masterclass) */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardLabel}>COMPOSICIÓN PROFUNDA</Text>
              <Ionicons name="sparkles" size={12} color={colors.copper} style={{ marginLeft: 6 }} />
            </View>
            <Text style={styles.cardHint}>Lo que sentirás · análisis modular</Text>
            <View style={{ gap: 10, marginTop: 12 }}>
              {data.composition.map((c, i) => (
                <View key={i} style={[styles.composRow, { borderLeftColor: c.color }]}>
                  <View style={[styles.composIcon, { borderColor: c.color }]}>
                    <DynamicIcon name={c.icon} size={22} color={c.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.composHead}>
                      <Text style={[styles.composLabel, { color: c.color }]}>{c.label}</Text>
                      <Text style={[styles.composPct, { color: c.color }]}>{c.percent}%</Text>
                    </View>
                    <View style={styles.composBarBg}>
                      <View style={[styles.composBarFill, { width: `${Math.max(0, Math.min(100, c.percent))}%`, backgroundColor: c.color }]} />
                    </View>
                    <Text style={styles.composDesc} numberOfLines={2}>{c.description}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* 3) Sentimientos colectivos */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardLabel}>SENTIMIENTOS COLECTIVOS</Text>
              <Ionicons name="sparkles" size={12} color={colors.copper} style={{ marginLeft: 6 }} />
            </View>
            <View style={{ marginTop: 10 }}>
              {data.collective_feelings.map((f, i) => (
                <View key={i} style={styles.feelRow}>
                  <Text style={styles.feelEmoji}>{f.emoji}</Text>
                  <Text style={styles.feelLabel}>{f.label}</Text>
                  <Text style={styles.feelCount}>{f.count_label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* 4) Compatibilidad */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardLabel}>ESTE LIBRO ES PARA TI SI TE GUSTÓ…</Text>
              <Ionicons name="sparkles" size={12} color={colors.copper} style={{ marginLeft: 6 }} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 12, paddingHorizontal: 4 }}>
              {data.compatibility.map((b) => (
                <TouchableOpacity key={b.book_id} onPress={() => openBook(b.book_id, b.title)} activeOpacity={0.85} style={styles.compatCard} testID={`compat-${b.book_id}`}>
                  <Image source={{ uri: b.cover_url }} style={styles.compatCover} resizeMode="cover" />
                  <Text style={styles.compatTitle} numberOfLines={2}>{b.title}</Text>
                  <Text style={styles.compatAuthor} numberOfLines={1}>{b.author}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function DynamicIcon({ name, size, color }: { name: string; size: number; color: string }) {
  if (name?.startsWith("mc:")) return <MaterialCommunityIcons name={name.slice(3) as any} size={size} color={color} />;
  return <Ionicons name={(name || "ellipse") as any} size={size} color={color} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  loadingText: { color: colors.textOnDarkMuted, marginTop: 14, letterSpacing: 1.5 },
  emptyText: { color: colors.textOnDark, marginTop: 14, fontSize: 15 },
  retryBtn: { marginTop: 18, borderWidth: 1, borderColor: colors.brass, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 999 },
  retryText: { color: colors.brass, fontWeight: "800", letterSpacing: 2 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 14, gap: 8 },
  backBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.brassSoft, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center" },
  titleText: { color: colors.textOnDark, fontWeight: "900", letterSpacing: 8, fontSize: 18 },
  subtitle: { color: colors.copper, fontSize: 12, marginTop: 4, letterSpacing: 0.5 },
  // Card: same style as FlashCard — subtle border, no glow
  card: { borderWidth: 1, borderColor: colors.brassSoft, borderRadius: 14, padding: 14, marginBottom: 12, backgroundColor: colors.bgSurface },
  cardCols: { flexDirection: "row" },
  cardHead: { flexDirection: "row", alignItems: "center" },
  cardLabel: { color: colors.brass, fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  cardHint: { color: colors.textOnDarkMuted, fontSize: 11, marginTop: 4, fontStyle: "italic" },
  ratingRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  ratingNumber: { color: colors.textOnDark, fontSize: 48, fontWeight: "900", letterSpacing: -2 },
  starsRow: { flexDirection: "row", marginTop: 4 },
  totalLabel: { color: colors.textOnDarkMuted, fontSize: 11, marginTop: 8 },
  topicPill: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.3)" },
  topicLeft: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  topicLabel: { fontSize: 12, fontWeight: "700" },
  topicPct: { fontSize: 12, fontWeight: "900" },
  // Composition
  composRow: { flexDirection: "row", gap: 12, paddingLeft: 10, borderLeftWidth: 2, paddingVertical: 4 },
  composIcon: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.3)" },
  composHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  composLabel: { fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  composPct: { fontSize: 14, fontWeight: "900" },
  composBarBg: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 6, overflow: "hidden" },
  composBarFill: { height: "100%", borderRadius: 2 },
  composDesc: { color: colors.textOnDarkMuted, fontSize: 11, lineHeight: 16, marginTop: 6, fontStyle: "italic" },
  // Collective feelings
  feelRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(176,38,255,0.12)", gap: 12 },
  feelEmoji: { fontSize: 22 },
  feelLabel: { color: colors.textOnDark, fontSize: 14, flex: 1, fontWeight: "600" },
  feelCount: { color: colors.textOnDarkMuted, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  // Compatibility
  compatCard: { width: 120, alignItems: "center" },
  compatCover: { width: 120, height: 180, borderRadius: 10, backgroundColor: colors.bgSurfaceLight, borderWidth: 1, borderColor: colors.brassSoft },
  compatTitle: { color: colors.textOnDark, fontSize: 12, fontWeight: "800", marginTop: 8, textAlign: "center" },
  compatAuthor: { color: colors.brass, fontSize: 10, marginTop: 2, fontStyle: "italic" } // Aquí ya no debe haber coma
});