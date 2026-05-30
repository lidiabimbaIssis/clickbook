import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "../src/lib/api";
import { colors } from "../src/theme";

/* ====== Tipos ====== */
export type VibesData = {
  overall_rating: number;
  total_reviews_label: string;
  topics: any[];
  emotions: any[];
  collective_feelings: any[];
  compatibility: any[];
};

export default function VibesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ book_id?: string; title?: string }>();
  const [data, setData] = useState<VibesData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<any>(`/books/${params.book_id}`);
      setData(res.vibes_data || res);
    } catch (e) { setData(null); }
    finally { setLoading(false); }
  }, [params.book_id]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {loading ? <ActivityIndicator size="large" color={colors.brass} style={{ flex: 1 }} /> : data ? (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 30 }}>
          
          {/* Bloque 1: Calificación General */}
          <View style={styles.card}>
            <View style={styles.cardCols}>
              <View style={{ flex: 0.9 }}>
                <Text style={styles.cardLabel}>CALIFICACIÓN GENERAL</Text>
                <Text style={styles.ratingNumber}>{data.overall_rating.toFixed(1)}</Text>
                <Text style={styles.totalLabel}>{data.total_reviews_label}</Text>
              </View>
              <View style={{ flex: 1.1, gap: 8 }}>
                <Text style={styles.cardLabel}>¿DE QUÉ HABLAN MÁS?</Text>
                {data.topics.map((t, i) => (
                  <View key={i} style={[styles.topicRow, { borderColor: t.color }]}>
                    <Text style={{ color: t.color }}>{t.label}</Text>
                    <Text style={{ color: t.color, fontWeight: "bold" }}>{t.percent}%</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Bloque 2: Lo que sentirás */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>LO QUE SENTIRÁS LEYENDO ESTE LIBRO</Text>
            <View style={styles.emotionsContainer}>
              {data.emotions.map((e, i) => (
                <View key={i} style={styles.emotionItem}>
                  <DynamicIcon name={e.icon} size={42} color={e.color} />
                  <Text style={[styles.emotionPct, { color: e.color }]}>{e.percent}%</Text>
                  <Text style={styles.emotionLabel}>{e.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Bloque 3: Sentimientos Colectivos */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>SENTIMIENTOS COLECTIVOS</Text>
            {data.collective_feelings.map((f, i) => (
              <View key={i} style={styles.feelRow}>
                <Text style={styles.feelEmoji}>{f.emoji}</Text>
                <Text style={styles.feelLabel}>{f.label}</Text>
                <Text style={styles.feelCount}>{f.count_label}</Text>
              </View>
            ))}
          </View>

          {/* Bloque 4: Compatibilidad */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>ESTE LIBRO ES PARA TI SI TE GUSTÓ…</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, marginTop: 10 }}>
              {data.compatibility.map((b, i) => (
                <View key={i} style={styles.compatCard}>
                  <Image source={{ uri: b.cover_url }} style={styles.compatCover} />
                  <Text style={styles.compatTitle}>{b.title}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

        </ScrollView>
      ) : null}
    </View>
  );
}

function DynamicIcon({ name, size, color }: any) {
  if (name?.startsWith("mc:")) return <MaterialCommunityIcons name={name.slice(3)} size={size} color={color} />;
  return <Ionicons name={name || "ellipse"} size={size} color={color} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  card: { borderWidth: 1, borderColor: colors.brassSoft, borderRadius: 20, padding: 16, marginBottom: 14, backgroundColor: "rgba(8,3,17,0.6)" },
  cardCols: { flexDirection: "row" },
  cardLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 2, color: colors.brass, marginBottom: 12 },
  ratingNumber: { color: colors.textOnDark, fontSize: 48, fontWeight: "900" },
  totalLabel: { color: colors.textOnDarkMuted, fontSize: 11 },
  topicRow: { flexDirection: "row", justifyContent: "space-between", padding: 8, borderWidth: 1, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.2)" },
  emotionsContainer: { flexDirection: "row", justifyContent: "space-around" },
  emotionItem: { alignItems: "center" },
  emotionPct: { fontSize: 24, fontWeight: "900", marginTop: 8 },
  emotionLabel: { color: colors.textOnDarkMuted, fontSize: 11, marginTop: 4, textAlign: "center" },
  feelRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderColor: "rgba(176,38,255,0.12)", gap: 12 },
  feelEmoji: { fontSize: 22 },
  feelLabel: { color: colors.textOnDark, fontSize: 14, flex: 1, fontWeight: "600" },
  feelCount: { color: colors.textOnDarkMuted, fontSize: 12, fontWeight: "800" },
  compatCard: { width: 120, alignItems: "center" },
  compatCover: { width: 120, height: 180, borderRadius: 10, backgroundColor: colors.bgSurfaceLight },
  compatTitle: { color: colors.textOnDark, fontSize: 12, marginTop: 8, textAlign: "center" }
});