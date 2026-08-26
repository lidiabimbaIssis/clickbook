import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";

const { height: SCREEN_H } = Dimensions.get("window");

// Modal de tiendas — bottom sheet con el mismo lenguaje visual que el
// resto de modales de la app (FlashCardModal/AudioModal en discover.tsx).
// Amazon, Casa del Libro (vía Awin) y BuscaLibre ya llevan sus códigos de
// afiliado reales. Kobo está activa con link normal, pendiente de que
// aprueben el programa para añadirle el parámetro de afiliado. Para
// añadir una tienda nueva más adelante, solo hace falta un <StoreRow>
// más — no hay que tocar nada del resto de la pantalla que lo use.
//
// Extraído de discover.tsx (donde vivía como componente local) para que
// también lo pueda usar Biblioteca (favorites.tsx) y cualquier otra
// pantalla, en vez de tener el mismo código duplicado en varios sitios.
export default function BuyStoreModal({
  visible, onClose, onOpenStore, title, author,
}: { visible: boolean; onClose: () => void; onOpenStore: (url: string) => void; title: string; author: string; }) {
  const insets = useSafeAreaInsets();
  const q = encodeURIComponent(`${title} ${author}`);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.flashCard, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}>
          <TouchableOpacity onPress={onClose} style={styles.flashClose} testID="btn-close-buy">
            <Ionicons allowFontScaling={false} name="close" size={22} color={colors.textOnDarkMuted} />
          </TouchableOpacity>
          <Text style={styles.flashTitle}>Elige tu tienda favorita</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={styles.affiliateDisclosureModal}>Gracias por apoyar BookVibes</Text>
            <Ionicons allowFontScaling={false} name="heart" size={11} color={colors.textOnDarkMuted} />
          </View>

          <View style={{ gap: 10, marginTop: 18 }}>
            <StoreRow
              icon="logo-amazon"
              iconColor="#FF9900"
              label="Amazon"
              subtitle="Entrega rápida"
              onPress={() => { onOpenStore(`https://www.amazon.es/s?k=${q}&i=stripbooks&tag=bookvibes04-21`); onClose(); }}
              testID="btn-buy-amazon"
            />
            <StoreRow
              logoSource={require("../../assets/images/casadellibro-logo.png")}
              label="Casa del Libro"
              subtitle="Librería especializada"
              onPress={() => { onOpenStore(`https://www.awin1.com/cread.php?awinmid=21491&awinaffid=3032235&ued=${encodeURIComponent(`https://www.casadellibro.com/?query=${q}`)}`); onClose(); }}
              testID="btn-buy-casa"
            />
            <StoreRow
              logoSource={require("../../assets/images/buscalibre-logo.png")}
              label="BuscaLibre"
              subtitle="Catálogo internacional"
              onPress={() => { onOpenStore(`https://www.buscalibre.es/libros/search?q=${q}&afiliado=8650186362af552a5b42`); onClose(); }}
              testID="btn-buy-buscalibre"
            />
            {/*
              Kobo: todavía sin parámetro de afiliado (pendiente de que
              aprueben el programa) — en cuanto llegue, solo hay que
              añadirlo a esta URL, igual que se hizo con las otras tres.
            */}
            <StoreRow
              logoSource={require("../../assets/images/kobo-logo.png")}
              label="Kobo"
              subtitle="Libros digitales"
              onPress={() => { onOpenStore(`https://www.kobo.com/es/es/search?query=${q}`); onClose(); }}
              testID="btn-buy-kobo"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function StoreRow({ icon, iconColor, logoSource, label, subtitle, onPress, testID }: { icon?: any; iconColor?: string; logoSource?: any; label: string; subtitle?: string; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.storeRow} testID={testID}>
      <View style={styles.storeRowIconBox}>
        {logoSource ? (
          <Image source={logoSource} style={styles.storeRowLogo} resizeMode="contain" />
        ) : (
          <Ionicons allowFontScaling={false} name={icon} size={20} color={iconColor} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.storeRowLabel}>{label}</Text>
        {subtitle ? <Text style={styles.storeRowSub}>{subtitle}</Text> : null}
      </View>
      <Ionicons allowFontScaling={false} name="chevron-forward" size={18} color={colors.textOnDarkMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  flashCard: { backgroundColor: colors.bgSurface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 2, borderColor: colors.copper, paddingHorizontal: 22, maxHeight: SCREEN_H * 0.92 },
  flashClose: { position: "absolute", top: 12, right: 12, padding: 8, zIndex: 5 },
  flashTitle: { color: colors.textOnDark, fontSize: 24, fontWeight: "900" },
  affiliateDisclosureModal: { color: colors.textOnDarkMuted, fontSize: 11, marginTop: 4 },
  storeRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: "rgba(255,255,255,0.03)" },
  storeRowIconBox: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)", overflow: "hidden" },
  storeRowLogo: { width: 24, height: 24 },
  storeRowLabel: { color: colors.textOnDark, fontSize: 15, fontWeight: "700" },
  storeRowSub: { color: colors.textOnDarkMuted, fontSize: 11, marginTop: 2 },
});