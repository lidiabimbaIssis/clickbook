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
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { api, Book } from "../../src/lib/api";
import { useAuth } from "../../src/providers/AuthProvider";
import { colors } from "../../src/theme";
import BuyStoreModal from "../../src/components/BuyStoreModal";

// Texto en degradado brass→copper, mismo patrón que GradientWord en
// home.tsx — el icono de al lado (corazón) se queda en brass sólido, solo
// el título de la pantalla pasa a degradado.
function GradientTitle({ text, fontSize, letterSpacing }: { text: string; fontSize: number; letterSpacing?: number }) {
  return (
    <MaskedView
      style={{ height: fontSize * 1.25 }}
      maskElement={
        <Text allowFontScaling={false} style={{ fontSize, fontWeight: "900", letterSpacing, backgroundColor: "transparent", fontFamily: Platform.select({ ios: "Georgia", default: "serif" }) }}>
          {text}
        </Text>
      }
    >
      <LinearGradient colors={[colors.brass, colors.copper]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }}>
        <Text allowFontScaling={false} style={{ fontSize, fontWeight: "900", letterSpacing, opacity: 0, fontFamily: Platform.select({ ios: "Georgia", default: "serif" }) }}>{text}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

export default function Favorites() {
  const { user } = useAuth();
  const lang = (user?.lang || "es") as "es" | "en";
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Antes: cada tarjeta abría Amazon directo (botón "Amazon" fijo). Ahora,
  // igual que en Discover, un único botón "Comprar" que abre el mismo
  // BuyStoreModal compartido con las 4 tiendas (Amazon, Casa del Libro,
  // BuscaLibre, Kobo) — solo guardamos qué libro de la lista abrió el
  // modal, ya que aquí hay varios libros a la vez (no uno "actual" como
  // en Discover).
  const [buyModalBookId, setBuyModalBookId] = useState<string | null>(null);
  const buyModalBook = books.find((b) => b.book_id === buyModalBookId) || null;

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
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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
      <LinearGradient colors={colors.bgGradient} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.center}>
        <ActivityIndicator size="large" color={colors.brass} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={colors.bgGradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[styles.container, { paddingTop: insets.top + 12 }]}
      testID="favorites-screen"
    >
      <View style={styles.header}>
        <Ionicons allowFontScaling={false} name="heart" size={20} color={colors.brass} />
        <GradientTitle text="BIBLIOTECA" fontSize={16} letterSpacing={5} />
      </View>
      {books.length === 0 ? (
        <View style={styles.empty}>
<Image
  source={require("../../assets/images/empty-favorites-logo.png")}
  style={styles.emptyLogo}
  resizeMode="contain"
/>
          {/*
            Copy más "de marca" que antes (era genérico tipo mensaje de
            sistema: "Aún no has guardado ningún libro."). Ahora en línea
            con el tono del resto de la app (hero titles de home,
            "Buscando tu vibe…", etc.) — más evocador, con el corazón
            destacado en iron para que la acción ("toca el ♥") se lea de
            un vistazo.
          */}
          <Text allowFontScaling={false} style={styles.emptyText}>Aquí empieza tu lista de obsesiones</Text>
          <Text allowFontScaling={false} style={styles.emptyHint}>Guarda los libros que te enamoren</Text>
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
             onPress={() => router.push({ 
  pathname: "/discover", 
  params: { book_id: item.book_id } 
})}
              activeOpacity={0.8}
              testID={`fav-open-${item.book_id}`}
              >
                <Image 
  source={{ 
    uri: item.cover_url 
      ? item.cover_url 
      : `https://res.cloudinary.com/ddppclcl1/image/upload/v1780422197/${item.book_id}.webp` 
  }} 
  style={styles.cover} 
/>
              </TouchableOpacity>
              <View style={styles.info}>
                <Text allowFontScaling={false} style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
                <Text allowFontScaling={false} style={styles.bookAuthor}>{item.author} · {item.year}</Text>
                <Text allowFontScaling={false} style={styles.meta}>{item.genre} · {item.pages} pág.</Text>
                <View style={styles.actions}>
                  <TouchableOpacity
                    onPress={() => setBuyModalBookId(item.book_id)}
                    style={styles.buyBtn}
                    testID={`fav-buy-${item.book_id}`}
                  >
                    <Ionicons allowFontScaling={false} name="cart" size={14} color={colors.brass} />
                    <Text allowFontScaling={false} style={styles.buyText}>Comprar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => remove(item.book_id)}
                    style={styles.removeBtn}
                    testID={`fav-remove-${item.book_id}`}
                  >
                    <Ionicons allowFontScaling={false} name="trash" size={14} color={colors.iron} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        />
      )}

      {buyModalBook && (
        <BuyStoreModal
          visible={!!buyModalBookId}
          onClose={() => setBuyModalBookId(null)}
          onOpenStore={openStore}
          title={buyModalBook.title}
          author={buyModalBook.author}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  // Título del estado vacío ahora en la misma tipografía serif de marca
  // que los títulos de libro (bookTitle) / GradientTitle, en vez de la
  // fuente del sistema por defecto — más "editorial", menos genérico.
  emptyText: {
    color: colors.textOnDark,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 14,
    textAlign: "center",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
  },
  emptyHint: { color: colors.textOnDarkMuted, fontSize: 13, marginTop: 8, textAlign: "center", lineHeight: 19, paddingHorizontal: 20 },
  card: {
    flexDirection: "row",
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: "#4E027A",
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
  emptyLogo: { width: 100, height: 100, marginBottom: 8 },
});