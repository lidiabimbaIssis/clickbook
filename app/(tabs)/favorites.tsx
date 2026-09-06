import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  Dimensions,
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

const { width: SCREEN_W } = Dimensions.get("window");
const GRID_GAP = 12;
const H_PADDING = 16;

function hexToRgba(hex: string, alpha: number): string {
  let h = (hex || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Mismo criterio de columnas que author-books.tsx: 1 sola portada -> 1
// columna grande; 2-11 -> 2 columnas; 12+ -> 3 columnas.
function getNumColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 11) return 2;
  return 3;
}

export default function Favorites() {
  const { user } = useAuth();
  const lang = (user?.lang || "es") as "es" | "en";
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const numColumns = useMemo(() => getNumColumns(books.length), [books.length]);
  const coverW = (SCREEN_W - H_PADDING * 2 - GRID_GAP * (numColumns - 1)) / numColumns;
  const coverH = coverW * 1.5; // ratio 2:3 estándar de las portadas
  // La tarjeta (card) mide coverW de ancho pero tiene 10px de padding a
  // cada lado — antes la portada se dibujaba también a coverW, más
  // ancha que el hueco disponible dentro del padding, y por eso se
  // salía y tocaba el borde en vez de quedar centrada. Ancho real de
  // la portada = coverW menos esos 20px (10+10) de padding.
  const CARD_PADDING = 10;
  const innerCoverW = coverW - CARD_PADDING * 2;
  const innerCoverH = innerCoverW * 1.5;

  // Antes: cada tarjeta abría Amazon directo (botón "Amazon" fijo). Ahora,
  // igual que en Discover, un único botón de carrito que abre el mismo
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
      {/*
        Encabezado rediseñado a petición de Lidia: mismo estilo que el
        de vibes.tsx (título grande centrado + icono al lado, subtítulo
        debajo en morado) en vez del degradado de antes. Sin botón de
        atrás, porque Favoritos es una pestaña del navbar, no una
        pantalla a la que se "vuelve" desde otro sitio.
      */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text allowFontScaling={false} style={styles.titleText}>FAVORITOS</Text>
          <Ionicons allowFontScaling={false} name="heart" size={16} color={colors.copper} style={{ marginLeft: 6 }} />
        </View>
        <Text allowFontScaling={false} style={styles.subtitle}>Tus historias guardadas</Text>
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
        // key={numColumns}: FlatList no admite cambiar numColumns "en
        // caliente" sin remontarse (mismo criterio que author-books.tsx).
        <FlatList
          key={numColumns}
          data={books}
          keyExtractor={(b) => b.book_id}
          numColumns={numColumns}
          contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: H_PADDING }}
          columnWrapperStyle={numColumns > 1 ? { gap: GRID_GAP } : undefined}
          showsVerticalScrollIndicator={false}
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
            <View style={[styles.card, { width: coverW, marginBottom: GRID_GAP }]} testID={`fav-card-${item.book_id}`}>
              <TouchableOpacity
                onPress={() => router.push({
                  pathname: "/discover",
                  // fromFavorites: para que el botón atrás de Discover
                  // sepa volver aquí, pero SOLO mientras sigas viendo
                  // este mismo libro — en cuanto deslizas a otro, deja
                  // de aplicar y vuelve a Home como de costumbre.
                  params: { book_id: item.book_id, fromFavorites: "1", t: Date.now().toString() },
                })}
                activeOpacity={0.85}
                testID={`fav-open-${item.book_id}`}
              >
                <View style={styles.coverWrap}>
                  <Image
                    source={{
                      uri: item.cover_url
                        ? item.cover_url
                        : `https://res.cloudinary.com/ddppclcl1/image/upload/v1780422197/${item.book_id}.webp`
                    }}
                    style={[styles.cover, { width: innerCoverW, height: innerCoverH }]}
                    resizeMode="cover"
                  />
                  {/* Corazón siempre relleno — todo lo que aparece aquí
                      es, por definición, un favorito. Tocarlo lo quita.
                      Ahora en degradado azul→morado en vez de rosa
                      sólido, para que combine con el resto de la app. */}
                  <TouchableOpacity
                    onPress={() => remove(item.book_id)}
                    style={styles.heartBadge}
                    testID={`fav-remove-${item.book_id}`}
                  >
                    <MaskedView
                      style={{ width: 16, height: 16 }}
                      maskElement={<Ionicons allowFontScaling={false} name="heart" size={16} color="black" />}
                    >
                      <LinearGradient
                        colors={[colors.brass, colors.copper]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{ width: 16, height: 16 }}
                      />
                    </MaskedView>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
              <View style={styles.info}>
                <Text allowFontScaling={false} style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
                <Text allowFontScaling={false} style={styles.bookAuthor} numberOfLines={1}>{item.author}</Text>
                <Text allowFontScaling={false} style={styles.meta} numberOfLines={1}>{item.genre}</Text>
              </View>
              {/*
                Movido de una esquina de la portada (poco visible) a un
                botón claro al pie de la tarjeta, alineado a la derecha
                — a petición de Lidia, no lo veía bien donde estaba antes.
              */}
              <View style={styles.cardBuyRow}>
                <TouchableOpacity
                  onPress={() => setBuyModalBookId(item.book_id)}
                  style={styles.cartBtn}
                  testID={`fav-buy-${item.book_id}`}
                >
                  <LinearGradient
                    colors={[hexToRgba(colors.copper, 0.55), hexToRgba(colors.brass, 0.55)]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cartBtn}
                  >
                    <View style={styles.cartBtnInner}>
                      <Ionicons allowFontScaling={false} name="cart" size={16} color="#FFFFFF" />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
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
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  titleRow: { flexDirection: "row", alignItems: "center" },
  titleText: { color: colors.textOnDark, fontWeight: "900", letterSpacing: 4, fontSize: 18 },
  subtitle: { color: colors.copper, fontSize: 12, marginTop: 4, letterSpacing: 0.5 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  emptyText: {
    color: colors.textOnDark,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 14,
    textAlign: "center",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
  },
  emptyHint: { color: colors.textOnDarkMuted, fontSize: 13, marginTop: 8, textAlign: "center", lineHeight: 19, paddingHorizontal: 20 },
  // Tarjeta: ya no es una fila (portada + texto al lado) sino una
  // columna (portada arriba, texto debajo) — mismo lenguaje visual de
  // borde morado que ya usabas, pero en formato cuadrícula.
  card: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: "#4E027A",
    borderRadius: 14,
    overflow: "hidden",
    padding: 10,
  },
  coverWrap: { position: "relative" },
  cover: { borderRadius: 8, backgroundColor: colors.bgSurfaceLight },
  // Corazón: círculo oscuro semitransparente en la esquina superior
  // derecha de la portada, igual que la referencia visual que trajo
  // Lidia.
  heartBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(6,1,15,0.75)",
    borderWidth: 1,
    borderColor: "rgba(255,46,120,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  // Carrito: mismo estilo de badge que el corazón, esquina inferior
  // Fila de compra al pie de la tarjeta, alineada a la derecha — visible
  // de un vistazo, en vez de un icono pequeño escondido sobre la portada.
  cardBuyRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
  // Vuelto a solo icono, sin texto "Comprar" — círculo pequeño, al pie
  // de la tarjeta, no sobre la portada.
  cartBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    padding: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBtnInner: {
    width: "100%",
    height: "100%",
    borderRadius: 14.5,
    backgroundColor: "rgba(6,1,15,0.88)",
    alignItems: "center",
    justifyContent: "center",
  },
  info: { marginTop: 8 },
  // height fijo (2 líneas siempre, aunque el título ocupe 1 sola) —
  // antes, un título corto dejaba la tarjeta más baja que la de al
  // lado con un título largo, y el botón de comprar quedaba a distinta
  // altura entre las dos tarjetas de la misma fila. Con esta altura
  // reservada, todas las tarjetas de una fila quedan alineadas.
  bookTitle: {
    color: colors.textOnDark,
    fontSize: 14,
    fontWeight: "800",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    lineHeight: 18,
    height: 36,
  },
  bookAuthor: { color: colors.brass, fontSize: 11, marginTop: 3 },
  meta: { color: colors.textOnDarkMuted, fontSize: 10, marginTop: 2 },
  emptyLogo: { width: 100, height: 100, marginBottom: 8 },
});