import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Platform, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../src/theme";
import { useAuth } from "../src/providers/AuthProvider";

type Review = {
  review_id: string;
  user_name: string;
  rating: number;
  text: string;
  created_at: string;
};

// Mock data — replace with backend later if needed
const MOCK_REVIEWS: Review[] = [
  { review_id: "r1", user_name: "Sara M.", rating: 5, text: "Una historia que te atrapa desde la primera página. El final me dejó sin palabras.", created_at: "Hace 2 días" },
  { review_id: "r2", user_name: "Andrés V.", rating: 4, text: "Muy bien construido. Los personajes son creíbles y el ritmo no decae.", created_at: "Hace 5 días" },
  { review_id: "r3", user_name: "Lucía P.", rating: 5, text: "De los mejores que he leído este año. Lo recomiendo cien por cien.", created_at: "Hace 1 semana" },
  { review_id: "r4", user_name: "Marc R.", rating: 4, text: "Algunos capítulos se hacen lentos, pero merece la pena por el desenlace.", created_at: "Hace 1 semana" },
  { review_id: "r5", user_name: "Elena C.", rating: 5, text: "Cada página es una sorpresa. Imposible dejarlo.", created_at: "Hace 2 semanas" },
  { review_id: "r6", user_name: "Pablo G.", rating: 3, text: "Buena premisa pero algo predecible en la mitad. Aun así, lo terminé sin problema.", created_at: "Hace 3 semanas" },
  { review_id: "r7", user_name: "Carla D.", rating: 5, text: "Una obra maestra moderna. Me ha hecho reflexionar mucho.", created_at: "Hace 1 mes" },
  { review_id: "r8", user_name: "Iván T.", rating: 4, text: "Estilo cuidado, narrativa elegante. Lo volveré a leer.", created_at: "Hace 1 mes" },
  { review_id: "r9", user_name: "Nuria L.", rating: 5, text: "Lloré, reí y aprendí. ¿Qué más se le puede pedir a un libro?", created_at: "Hace 1 mes" },
  { review_id: "r10", user_name: "Diego F.", rating: 4, text: "Recomiendo leerlo de un tirón. Crea adicción.", created_at: "Hace 2 meses" },
];

export default function ReviewsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ book_id?: string; title?: string; author?: string }>();
  const title = (params.title || "este libro").toString();
  const author = (params.author || "").toString();

  const [reviews, setReviews] = useState<Review[]>(MOCK_REVIEWS);
  const [loading, setLoading] = useState(false);
  const [newRating, setNewRating] = useState(0);
  const [newText, setNewText] = useState("");

  const submitReview = useCallback(() => {
    if (newRating < 1 || !newText.trim()) return;
    const newReview: Review = {
      review_id: `r_${Date.now()}`,
      user_name: user?.name || "Tú",
      rating: newRating,
      text: newText.trim(),
      created_at: "Ahora",
    };
    setReviews((prev) => [newReview, ...prev].slice(0, 10));
    setNewRating(0);
    setNewText("");
  }, [newRating, newText, user]);

  const renderStars = (rating: number) => {
    const arr: React.ReactElement[] = [];
    for (let i = 0; i < 5; i++) {
      arr.push(
        <Ionicons
          key={i}
          name={i < rating ? "star" : "star-outline"}
          size={14}
          color={colors.gold}
          style={{ marginRight: 2 }}
        />
      );
    }
    return arr;
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.bgBase }}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="btn-back-reviews">
          <Ionicons name="chevron-back" size={22} color={colors.brass} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.headerTitle}>RESEÑAS</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{title}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Write your own review */}
        <View style={styles.writeCard}>
          <Text style={styles.writeLabel}>// TU RESEÑA</Text>
          <View style={styles.writeStarsRow}>
            {[1, 2, 3, 4, 5].map((i) => (
              <TouchableOpacity key={i} onPress={() => setNewRating(i)} testID={`star-${i}`}>
                <Ionicons name={i <= newRating ? "star" : "star-outline"} size={26} color={colors.gold} style={{ marginHorizontal: 3 }} />
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.writeInput}
            placeholder="¿Qué te pareció el libro?"
            placeholderTextColor={colors.textOnDarkMuted}
            value={newText}
            onChangeText={setNewText}
            multiline
            maxLength={280}
            testID="input-new-review"
          />
          <TouchableOpacity
            style={[styles.submitBtn, (!newText.trim() || newRating < 1) && { opacity: 0.4 }]}
            onPress={submitReview}
            disabled={!newText.trim() || newRating < 1}
            testID="btn-submit-review"
          >
            <Ionicons name="send" size={14} color={colors.bgBase} />
            <Text style={styles.submitText}>PUBLICAR</Text>
          </TouchableOpacity>
        </View>

        {/* Reviews list */}
        {loading && reviews.length === 0 ? (
          <ActivityIndicator size="large" color={colors.brass} style={{ marginTop: 30 }} />
        ) : (
          reviews.slice(0, 10).map((r, idx) => {
            const isCyan = idx % 2 === 0;
            const borderColor = isCyan ? colors.brass : colors.copper;
            return (
              <View
                key={r.review_id}
                style={[styles.reviewCard, { borderColor, shadowColor: borderColor }]}
              >
                <View style={styles.reviewHead}>
                  <View style={[styles.avatar, { borderColor }]}>
                    <Text style={[styles.avatarText, { color: borderColor }]}>
                      {r.user_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName} numberOfLines={1}>{r.user_name}</Text>
                    <View style={styles.starsRow}>{renderStars(r.rating)}</View>
                  </View>
                  <Text style={styles.date}>{r.created_at}</Text>
                </View>
                <View style={[styles.divider, { backgroundColor: borderColor, opacity: 0.3 }]} />
                <Text style={styles.reviewText}>{r.text}</Text>
              </View>
            );
          })
        )}

        {reviews.length === 0 && !loading && (
          <View style={{ alignItems: "center", padding: 40 }}>
            <Ionicons name="chatbox-ellipses-outline" size={48} color={colors.copper} />
            <Text style={{ color: colors.textOnDarkMuted, marginTop: 12, textAlign: "center" }}>
              Sé el primero en reseñar este libro
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.brassSoft, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.brass, fontWeight: "900", letterSpacing: 4, fontSize: 14 },
  headerSubtitle: { color: colors.textOnDarkMuted, fontSize: 11, marginTop: 2, letterSpacing: 0.5 },
  writeCard: { borderWidth: 1.5, borderColor: colors.brass, borderRadius: 14, padding: 16, marginTop: 14, marginBottom: 16, backgroundColor: "rgba(0,240,255,0.04)" },
  writeLabel: { color: colors.brass, fontSize: 11, letterSpacing: 3, fontWeight: "800" },
  writeStarsRow: { flexDirection: "row", justifyContent: "center", marginVertical: 10 },
  writeInput: { color: colors.textOnDark, fontSize: 14, borderWidth: 1, borderColor: colors.brassSoft, borderRadius: 10, padding: 10, minHeight: 70, textAlignVertical: "top", marginBottom: 12, outlineWidth: 0 as any },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brass, paddingVertical: 10, borderRadius: 999 },
  submitText: { color: colors.bgBase, fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  reviewCard: { borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 12, backgroundColor: colors.bgSurface, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  reviewHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: colors.bgBase },
  avatarText: { fontSize: 16, fontWeight: "900" },
  userName: { color: colors.textOnDark, fontSize: 14, fontWeight: "800" },
  starsRow: { flexDirection: "row", marginTop: 4 },
  date: { color: colors.textOnDarkMuted, fontSize: 10, letterSpacing: 0.5 },
  divider: { height: 1, marginVertical: 10 },
  reviewText: { color: colors.textOnDark, fontSize: 13, lineHeight: 19 },
});