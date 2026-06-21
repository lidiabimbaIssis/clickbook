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

// Diccionario actualizado y ampliado para evitar errores
const iconMap: Record<string, string> = {
  "music": "musical-notes-outline",
  "heart": "heart-outline",
  "brain": "bulb-outline",
  "dragon": "paw-outline",
  "magic": "wand-outline",
  "chat": "chatbubble-outline",
  "castle": "business-outline",
  "building": "business-outline",
  "user": "person-outline",
  "hand": "hand-left-outline",
  "tear": "water-outline",
  "hospital": "medkit-outline",
  "thumb-down": "thumbs-down-outline",
  "laugh": "happy-outline",
  "question": "help-outline",
  "star": "star-outline",
  "book": "book-outline",
  "eye": "eye-outline",
  "shield": "shield-outline",
  "alert": "alert-outline",
  "search": "search-outline",
  "warning": "warning-outline",
  "cloud": "cloud-outline",
  "leaf": "leaf-outline",
  "bolt": "flash-outline",
  "lock": "lock-closed-outline",
  "mirror": "scan-outline",
  "wind": "partly-sunny-outline",
  "spark": "sparkles-outline",
  "fire": "flame-outline",
  "rocket": "rocket-outline",
  "smile": "happy-outline",
  "check-circle": "checkmark-circle-outline",
  "fist-raised": "hand-right-outline",
  "sun": "sunny-outline",
  "anchor": "boat-outline",
  "pen-nib": "create-outline",
  "chart-line": "trending-up-outline",
  "user-tie": "person-outline",
  "key": "key-outline",
};


const capitalize = (str: string) => 
  str.charAt(0).toUpperCase() + str.slice(1);

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
      const res = await api<any>(`/books/${bookId}`);
setData({ ...res.vibes_data, mood_tags: res.mood_tags, leer_si: res.leer_si });
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
                <View style={{ gap: 3 }}>
                  {data.topics.slice(0, 3).map((t, i) => (
                    <View key={i} style={[styles.topicPill, { borderColor: t.color }]}>
                      <View style={styles.topicLeft}>
                        <DynamicIcon name={t.icon} size={13} color={t.color} />
                        <Text style={[styles.topicLabel, { color: t.color }]}>{capitalize(t.label)}</Text>
                      </View>
                      <Text style={[styles.topicPct, { color: t.color }]}>{t.percent}%</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>

          <View style={[styles.card, { borderColor: "#4b017c", alignSelf: 'center', width: '100%' }]}>
            <Text style={styles.cardLabel}>QUE SENTIRÁS LEYENDO ESTE LIBRO✨</Text>
            <View style={styles.emotionsContainer}>
              {(data as any).emotions?.slice(0, 3).map((e: any, i: number) => (
                <View key={i} style={styles.emotionItem}>
                  <DynamicIcon name={e.icon} size={42} color={e.color} />
                  <Text style={[styles.emotionPct, { color: e.color }]}>{e.percent}%</Text>
                  <Text style={styles.emotionLabel}>{capitalize(e.label)}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.card, { borderColor: "#002988" }]}>
            <Text style={styles.cardLabel}>REACCIONES DE LECTORES ✨</Text>
            {data.collective_feelings.map((f: any, i: number) => (
              <View key={i} style={styles.feelRow}>
                <Text style={styles.feelEmoji}>{f.emoji}</Text>
                <Text style={styles.feelLabel}>{capitalize(f.label)}</Text>
                <Text style={styles.feelCount}>{f.count_label}</Text>
              </View>
            ))}
          </View>

          {/* leelo si */}
<View style={[styles.card, { borderColor: "#971d76" }]}>
  <Text style={styles.cardLabel}>LÉELO SI... ✨</Text>
  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
    {(data as any).leer_si?.map((tag: any, i: number) => (
      <View key={i} style={[styles.topicPill, { borderColor: "#971d76"  }]}>
        <Text style={{ fontSize: 14, marginRight: 4 }}>{tag.emoji}</Text>
<Text style={[styles.topicLabel, { color: "#E8E4FF", flexShrink: 1 }]}>{capitalize(tag.label)}</Text>
      </View>
    ))}
  </View>
</View>
        </ScrollView>
      )}
    </View>
  );
}

// Función DynamicIcon robusta para evitar errores de Ionicons
function DynamicIcon({ name, size, color }: { name: string; size: number; color: string }) {
  if (name?.startsWith("mc:")) return <MaterialCommunityIcons name={name.slice(3) as any} size={size} color={color} />;
  
  const iconName = iconMap[name];
  // Si no encuentra el icono en el mapa, pone uno de alerta en lugar de fallar
  const finalName = iconName || "alert-circle-outline";
  
  return <Ionicons name={finalName as any} size={size} color={color} />;
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
  card: { borderWidth: 1, borderColor: colors.brassSoft, borderRadius: 14, padding: 14, marginBottom: 12, backgroundColor: colors.bgSurface },
  cardCols: { flexDirection: "row" },
  cardHead: { flexDirection: "row", alignItems: "center" },
  cardLabel: { color: colors.brass, fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  ratingRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  ratingNumber: { color: colors.textOnDark, fontSize: 48, fontWeight: "900", letterSpacing: -2 },
  starsRow: { flexDirection: "row", marginTop: 4 },
  totalLabel: { color: colors.textOnDarkMuted, fontSize: 12, marginTop: 8 },
  topicPill: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 5, paddingVertical: 8, borderWidth: 1, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.3)", flexShrink: 1 },
topicLeft: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 },
topicLabel: { fontSize: 15, fontWeight: "300", flexShrink: 1 },
topicPct: { fontSize: 13, fontWeight: "900", marginLeft: 6, flexShrink: 0 },
  feelRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(176,38,255,0.12)", gap: 12 },
  feelEmoji: { fontSize: 22 },
  feelLabel: { color: colors.textOnDark, fontSize: 15, flex: 1, fontWeight: "600" },
  feelCount: { color: colors.textOnDarkMuted, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  compatCard: { width: 120, alignItems: "center" },
  compatCover: { width: 120, height: 180, borderRadius: 10, backgroundColor: colors.bgSurfaceLight, borderWidth: 1, borderColor: colors.brassSoft },
  compatTitle: { color: colors.textOnDark, fontSize: 12, fontWeight: "800", marginTop: 8, textAlign: "center" },
  emotionsContainer: { flexDirection: "row", justifyContent: "space-around", marginTop: 10 },
  emotionItem: { alignItems: "center" },
  emotionPct: { fontSize: 20, fontWeight: "900", marginTop: 8 },
  emotionLabel: { color:"#E8E4FF", fontSize: 13, marginTop: 4, textAlign: "center" },
  compatAuthor: { color: colors.brass, fontSize: 10, marginTop: 2, fontStyle: "italic" }
});