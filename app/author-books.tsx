import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, FlatList, ActivityIndicator, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api, Book } from "../src/lib/api";
import { colors } from "../src/theme";

const { width: SCREEN_W } = Dimensions.get("window");

const GRID_GAP = 12;
const H_PADDING = 20;

// Reglas de columnas: 1 sola portada -> 1 columna (grande); 2-11 -> 2
// columnas; 12+ -> 3 columnas. Las portadas SIEMPRE mantienen su
// proporción estándar 2:3 (sin recortar ni estirar) — si sobra espacio
// negro abajo cuando hay pocas, no pasa nada, se deja tal cual.
function getNumColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 11) return 2;
  return 3;
}

export default function AuthorBooks() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ authorQuery?: string; fromBookId?: string }>();
  const authorQuery = (params.authorQuery || "").toString();
  const fromBookId = (params.fromBookId || "").toString();

  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authorQuery) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const res = await api<{ books: Book[] }>(`/books/search?query=${encodeURIComponent(authorQuery)}`);
        const allResults = res?.books || [];
        // /books/search es una búsqueda general (título, tropes, etc.),
        // no un filtro exclusivo por autor — a veces devuelve algún
        // libro que coincide por otro motivo (palabra parecida, trope
        // similar) aunque no sea de este autor. Nos quedamos solo con
        // los que de verdad tienen este autor en su campo `author`.
        const normalize = (s: string) => s.trim().toLowerCase();
        const wanted = normalize(authorQuery);
        const filtered = allResults.filter((b) => {
          const bookAuthor = normalize(b.author || "");
          return bookAuthor === wanted || bookAuthor.includes(wanted) || wanted.includes(bookAuthor);
        });
        setBooks(filtered);
      } catch (e) {
        console.warn("author books fetch failed", e);
        setBooks([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [authorQuery]);

  const numColumns = useMemo(() => getNumColumns(books.length), [books.length]);
  const coverW = (SCREEN_W - H_PADDING * 2 - GRID_GAP * (numColumns - 1)) / numColumns;
  const coverH = coverW * 1.5; // ratio 2:3 estándar de las portadas, sin recortar ni estirar

  const openBook = (book: Book) => {
    router.push({
      pathname: "/discover",
      // fromAuthor: para que el botón "atrás" de Discover sepa volver
      // aquí explícitamente, en vez de depender del historial de
      // navegación.
      params: { book_id: book.book_id, t: Date.now().toString(), fromAuthor: authorQuery },
    });
  };

  return (
    <LinearGradient colors={colors.bgGradient} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ flex: 1 }} testID="author-books-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => {
            // Igual que en Discover: en vez de fiarnos de router.back()
            // (que con varias navegaciones seguidas no siempre volvía
            // a la pantalla correcta y acababa en Home), si sabemos el
            // libro desde el que se abrió este grid, volvemos ahí de
            // forma explícita.
            if (fromBookId) {
              router.push({ pathname: "/discover", params: { book_id: fromBookId, t: Date.now().toString() } });
            } else if (router.canGoBack()) {
              router.back();
            } else {
              router.push("/home");
            }
          }}
          style={styles.backBtn}
          testID="btn-back-author-books"
        >
          <Ionicons allowFontScaling={false} name="chevron-back" size={20} color={colors.brass} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.authorName} numberOfLines={1} allowFontScaling={false}>{authorQuery}</Text>
          {!loading && (
            <Text style={styles.bookCount}>
              {books.length === 1 ? "1 libro" : `${books.length} libros`}
            </Text>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brass} />
        </View>
      ) : books.length === 0 ? (
        <View style={styles.center}>
          <Ionicons allowFontScaling={false} name="book-outline" size={48} color={colors.copper} />
          <Text style={styles.emptyText}>No encontramos libros de este autor</Text>
        </View>
      ) : (
        // key={numColumns}: FlatList no admite cambiar numColumns "en
        // caliente" sin remontarse — como aquí solo cambia una vez (de
        // la carga inicial al resultado final), forzar el remount con
        // key es correcto y no causa parpadeos perceptibles.
        <FlatList
          key={numColumns}
          data={books}
          keyExtractor={(b) => b.book_id}
          numColumns={numColumns}
          contentContainerStyle={{ paddingHorizontal: H_PADDING, paddingTop: 12, paddingBottom: insets.bottom + 24 }}
          columnWrapperStyle={numColumns > 1 ? { gap: GRID_GAP, marginBottom: GRID_GAP } : undefined}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              onPress={() => openBook(item)}
              activeOpacity={0.85}
              style={{
                width: coverW,
                marginBottom: numColumns === 1 && index < books.length - 1 ? GRID_GAP : 0,
              }}
              testID={`author-book-${item.book_id}`}
            >
              <Image
                // Antes pedía la imagen a resolución COMPLETA (misma
                // URL que la portada grande de Discover), aunque aquí
                // solo hace falta una miniatura — con varias cargando
                // en paralelo, eso pesaba mucho y se notaba lento.
                // w_/q_auto/f_auto son transformaciones de Cloudinary
                // (se aplican al vuelo, sin tocar nada del backend):
                // pide justo el ancho necesario (x2 para pantallas de
                // alta densidad), calidad automática y el formato más
                // ligero que soporte el dispositivo.
                source={{ uri: `https://res.cloudinary.com/ddppclcl1/image/upload/w_${Math.round(coverW * 2)},q_auto,f_auto/v1780422197/${item.book_id}.webp` }}
                style={[styles.cover, { width: coverW, height: coverH }]}
                resizeMode="contain"
              />
            </TouchableOpacity>
          )}
          testID="author-books-grid"
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  authorName: { color: colors.textOnDark, fontSize: 17, fontWeight: "900" },
  bookCount: { color: colors.textOnDarkMuted, fontSize: 12, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  emptyText: { color: colors.textOnDarkMuted, fontSize: 14, textAlign: "center" },
  cover: {
    borderRadius: 10,
    backgroundColor: colors.bgSurface,
  },
});