import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import { api } from "../lib/api";
import { useAuth } from "../providers/AuthProvider";

const { width } = Dimensions.get("window");

type Reason = "limit" | "chat" | "general";

interface Props {
  visible: boolean;
  onClose: () => void;
  reason?: Reason;
  onUpgraded?: () => Promise<void>;
}

const BENEFITS = [
  { icon: "headset", text: "Resúmenes en audio · ilimitados" },
  { icon: "flash", text: "Hook de cada libro · ilimitado" },
  { icon: "chatbubbles", text: "Habla con los personajes del libro" },
];

const REASON_COPY: Record<Reason, { title: string; sub: string }> = {
  limit: {
    title: "Has llegado al límite diario",
    sub: "Hazte Premium y escucha todos los audios que quieras.",
  },
  chat: {
    title: "Chat con personajes · Premium",
    sub: "Hazte Premium para hablar con los personajes de cualquier libro.",
  },
  general: {
    title: "ClickBook Premium",
    sub: "Desbloquea toda la experiencia.",
  },
};

export default function PaywallModal({ visible, onClose, reason = "general", onUpgraded }: Props) {
  const { refresh } = useAuth();
  const [pricing, setPricing] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [upgraded, setUpgraded] = useState(false);

  useEffect(() => {
    if (!visible) return;
    api<any>("/config/pricing").then(setPricing).catch(console.warn);
  }, [visible]);

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      await api("/me/upgrade", { method: "POST" });
      await refresh();
      if (onUpgraded) await onUpgraded();
      setUpgraded(true);
      setTimeout(() => {
        setUpgraded(false);
        onClose();
      }, 1500);
    } catch (e) {
      console.warn("upgrade failed", e);
    } finally {
      setLoading(false);
    }
  };

  const copy = REASON_COPY[reason];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} testID="btn-close-paywall">
            <Ionicons name="close" size={22} color={colors.textOnDarkMuted} />
          </TouchableOpacity>

          <View style={styles.diamondWrap}>
            <Ionicons name="diamond" size={40} color={colors.gold} />
          </View>

          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.sub}>{copy.sub}</Text>

          <View style={styles.benefits}>
            {BENEFITS.map((b) => (
              <View key={b.text} style={styles.benefitRow}>
                <Ionicons name={b.icon as any} size={18} color={colors.gold} />
                <Text style={styles.benefitText}>{b.text}</Text>
              </View>
            ))}
          </View>

          {upgraded ? (
            <View style={styles.successRow}>
              <Ionicons name="checkmark-circle" size={24} color={colors.verdigris} />
              <Text style={styles.successText}>¡Ya eres Premium!</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={styles.upgradeBtn}
                onPress={handleUpgrade}
                disabled={loading}
                testID="btn-upgrade-premium"
              >
                {loading ? (
                  <ActivityIndicator color={colors.bgBase} />
                ) : (
                  <>
                    <Ionicons name="diamond" size={16} color={colors.bgBase} />
                    <Text style={styles.upgradeBtnText}>
                      {pricing?.launch_promo_active
                        ? `${pricing.launch_promo_label} · ${pricing.monthly_launch}`
                        : `Hazte Premium · ${pricing?.monthly_regular ?? "4,99€/mes"}`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={onClose} style={styles.skipBtn} testID="btn-skip-paywall">
                <Text style={styles.skipText}>Ahora no</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.bgSurface,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.gold,
    padding: 28,
    alignItems: "center",
    shadowColor: colors.gold,
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 16,
  },
  closeBtn: { position: "absolute", top: 12, right: 12, padding: 6, zIndex: 5 },
  diamondWrap: { marginBottom: 12 },
  title: {
    color: colors.gold,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  sub: {
    color: colors.textOnDark,
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 18,
  },
  benefits: { width: "100%", gap: 12, marginBottom: 24 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  benefitText: { color: colors.textOnDark, fontSize: 14, flex: 1 },
  upgradeBtn: {
    width: "100%",
    backgroundColor: colors.gold,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    shadowColor: colors.gold,
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  upgradeBtnText: {
    color: colors.bgBase,
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  skipBtn: { marginTop: 14 },
  skipText: { color: colors.textOnDarkMuted, fontSize: 12 },
  successRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  successText: { color: colors.verdigris, fontSize: 16, fontWeight: "700" },
});