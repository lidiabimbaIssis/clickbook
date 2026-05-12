import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Book } from "../../src/lib/api";
import { useAuth } from "../../src/providers/AuthProvider";
import { colors } from "../../src/theme";

export default function Favorites() {
  const { user } = useAuth();
  const lang = (user?.lang || "es") as "es" | "en";
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ books: Book[] }>("/favorites");
      setBooks(res.books);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    setBooks((prev) => prev.filter((b) => b.book_id !== id));
    try {
      await api(`/favorites/${id}`, { method: "DELETE" });
    } catch {
      load();
    }
  };

  const openStore = (url: string) => {
    if (Platform.OS === "web" && typeof window !== "undefined") window.open(url, "_blank");
    else Linking.openURL(url);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brass} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]} testID="favorites-screen">
      <View style={styles.header}>
        <Ionicons name="heart" size={20} color={colors.brass} />
        <Text style={styles.title}>BIBLIOTECA</Text>
      </View>
      {books.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="book-outline" size={64} color={colors.brass} />
          <Text style={styles.emptyText}>Aún no has guardado ningún libro.</Text>
          <Text style={styles.emptyHint}>Desliza a la derecha para guardar favoritos.</Text>
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(b) => b.book_id}
          contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 16, gap: 12 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.brass}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.card} testID={`fav-card-${item.book_id}`}>
              <TouchableOpacity
                onPress={() => router.push({ pathname: "/discover", params: { book_id: item.book_id } })}
                activeOpacity={0.8}
                testID={`fav-open-${item.book_id}`}
              >
                <Image source={{ uri: item.cover_url }} style={styles.cover} />
              </TouchableOpacity>
              <View style={styles.info}>
                <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.bookAuthor}>{item.author} · {item.year}</Text>
                <Text style={styles.meta}>{item.genre} · {item.pages} pág.</Text>
                <View style={styles.actions}>
                  <TouchableOpacity
                    onPress={() => openStore(item.amazon_url)}
                    style={styles.buyBtn}
                    testID={`fav-buy-amazon-${item.book_id}`}
                  >
                    <Ionicons name="cart" size={14} color={colors.brass} />
                    <Text style={styles.buyText}>Amazon</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => remove(item.book_id)}
                    style={styles.removeBtn}
                    testID={`fav-remove-${item.book_id}`}
                  >
                    <Ionicons name="trash" size={14} color={colors.iron} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  center: { flex: 1, backgroundColor: colors.bgBase, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    color: colors.brass,
    fontWeight: "900",
    letterSpacing: 5,
    fontSize: 16,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  emptyText: { color: colors.textOnDark, fontSize: 16, marginTop: 12, textAlign: "center" },
  emptyHint: { color: colors.textOnDarkMuted, fontSize: 13, marginTop: 6, textAlign: "center" },
  card: {
    flexDirection: "row",
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: "hidden",
    padding: 10,
    gap: 12,
  },
  cover: { width: 80, height: 120, borderRadius: 6, backgroundColor: colors.bgSurfaceLight },
  info: { flex: 1, justifyContent: "space-between" },
  bookTitle: {
    color: colors.textOnDark,
    fontSize: 16,
    fontWeight: "800",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
  },
  bookAuthor: { color: colors.brass, fontSize: 12, marginTop: 2 },
  meta: { color: colors.textOnDarkMuted, fontSize: 11, marginTop: 2 },
  actions: { flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" },
  buyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.brassSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  buyText: { color: colors.brass, fontSize: 11, fontWeight: "700" },
  removeBtn: {
    padding: 8,
    borderWidth: 1,
    borderColor: "rgba(138,42,32,0.4)",
    borderRadius: 999,
  },
});
