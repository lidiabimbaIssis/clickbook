import React, { useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import { api } from "../lib/api";

type PricingConfig = {
  monthly_regular: string;
  monthly_launch: string;
  yearly_regular: string;
  yearly_launch: string;
  launch_promo_active: boolean;
  launch_promo_label: string;
  free_daily_audio_limit: number;
};

export default function PaywallModal({
  visible,
  onClose,
  onUpgraded,
  reason = "limit",
}: {
  visible: boolean;
  onClose: () => void;
  onUpgraded?: () => void;
  reason?: "limit" | "chat" | "general";
}) {
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"yearly" | "monthly">("yearly");

  useEffect(() => {
    if (!visible) return;
    setSelectedPlan("yearly");
    api<PricingConfig>("/config/pricing").then(setPricing).catch(() => {});
  }, [visible]);

  const upgrade = async () => {
    setLoading(true);
    try {
      await api("/me/upgrade", { method: "POST" });
      onUpgraded?.();
      onClose();
    } catch (e) {
      console.warn("upgrade failed", e);
    } finally {
      setLoading(false);
    }
  };

  const headline =
    reason === "limit"
      ? "Has alcanzado tu límite diario"
      : reason === "chat"
      ? "Chat con el Autor"
      : "ClickBook Premium";

  const sub =
    reason === "limit"
      ? `Ya escuchaste ${pricing?.free_daily_audio_limit ?? 3} audios hoy. Hazte Premium para seguir descubriendo sin límites.`
      : reason === "chat"
      ? "Habla en directo con la IA que personifica al autor del libro. Pregúntale lo que quieras."
      : "Desbloquea todo ClickBook";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} testID="paywall-close">
            <Ionicons name="close" size={22} color={colors.textOnDarkMuted} />
          </TouchableOpacity>

          <View style={styles.iconWrap}>
            <Ionicons name="diamond" size={42} color={colors.gold} />
          </View>
          <Text style={styles.title}>{headline}</Text>
          <Text style={styles.sub}>{sub}</Text>

          <View style={styles.benefits}>
            <Benefit icon="infinite" text="Audios ilimitados con voz premium" />
            <Benefit icon="chatbubbles" text="Chat con el autor del libro" />
            <Benefit icon="star" text="Resúmenes con guion premium" />
            <Benefit icon="close-circle" text="Sin anuncios, para siempre" />
          </View>

          {pricing && (
            <View style={styles.plans}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSelectedPlan("yearly")}
                style={[styles.plan, selectedPlan === "yearly" ? styles.planFeatured : styles.planMuted]}
                testID="plan-yearly"
              >
                {pricing.launch_promo_active && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{pricing.launch_promo_label}</Text>
                  </View>
                )}
                <Text style={[styles.planName, selectedPlan === "yearly" && { color: colors.gold }]}>ANUAL</Text>
                {pricing.launch_promo_active ? (
                  <>
                    <Text style={styles.priceOld}>{pricing.yearly_regular}</Text>
                    <Text style={styles.priceNew}>{pricing.yearly_launch}</Text>
                  </>
                ) : (
                  <Text style={styles.priceNew}>{pricing.yearly_regular}</Text>
                )}
                <Text style={styles.planMeta}>Ahorra ~50%</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSelectedPlan("monthly")}
                style={[styles.plan, selectedPlan === "monthly" ? styles.planFeatured : styles.planMuted]}
                testID="plan-monthly"
              >
                <Text style={[styles.planName, selectedPlan === "monthly" && { color: colors.gold }]}>MENSUAL</Text>
                {pricing.launch_promo_active ? (
                  <>
                    <Text style={styles.priceOld}>{pricing.monthly_regular}</Text>
                    <Text style={styles.priceNew}>{pricing.monthly_launch}</Text>
                  </>
                ) : (
                  <Text style={styles.priceNew}>{pricing.monthly_regular}</Text>
                )}
                <Text style={styles.planMeta}> </Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={styles.cta} onPress={upgrade} disabled={loading} testID="btn-upgrade">
            {loading ? (
              <ActivityIndicator color={colors.bgBase} />
            ) : (
              <>
                <Ionicons name="flash" size={18} color={colors.bgBase} />
                <Text style={styles.ctaText}>HACERSE PREMIUM</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            Modo demo · cancelar en cualquier momento
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function Benefit({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.benefit}>
      <Ionicons name={icon} size={16} color={colors.brass} />
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.bgSurface,
    borderWidth: 2,
    borderColor: colors.copper,
    borderRadius: 22,
    padding: 24,
    shadowColor: colors.copper,
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  closeBtn: { position: "absolute", top: 12, right: 12, padding: 6, zIndex: 10 },
  iconWrap: { alignItems: "center", marginBottom: 8 },
  title: {
    color: colors.textOnDark,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  sub: {
    color: colors.textOnDarkMuted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 19,
  },
  benefits: { marginTop: 18, gap: 10 },
  benefit: { flexDirection: "row", alignItems: "center", gap: 10 },
  benefitText: { color: colors.textOnDark, fontSize: 13, flex: 1 },
  plans: { flexDirection: "row", gap: 10, marginTop: 18 },
  plan: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.brassSoft,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    backgroundColor: "rgba(0,240,255,0.05)",
  },
  planFeatured: {
    borderColor: colors.gold,
    backgroundColor: "rgba(255,210,63,0.08)",
    borderWidth: 2,
    shadowColor: colors.gold,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  planMuted: {
    opacity: 0.55,
  },
  planName: {
    color: colors.textOnDarkMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
  },
  priceOld: {
    color: colors.textOnDarkMuted,
    fontSize: 12,
    textDecorationLine: "line-through",
    marginTop: 4,
  },
  priceNew: {
    color: colors.brass,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 2,
  },
  planMeta: { color: colors.gold, fontSize: 10, fontWeight: "700", marginTop: 4 },
  badge: {
    position: "absolute",
    top: -10,
    backgroundColor: colors.gold,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: { fontSize: 9, fontWeight: "900", color: colors.bgBase, letterSpacing: 0.5 },
  cta: {
    marginTop: 20,
    backgroundColor: colors.brass,
    paddingVertical: 14,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: colors.brass,
    shadowOpacity: 0.7,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  ctaText: { color: colors.bgBase, fontWeight: "900", letterSpacing: 2, fontSize: 14 },
  disclaimer: {
    color: colors.textOnDarkMuted,
    fontSize: 10,
    textAlign: "center",
    marginTop: 10,
    fontStyle: "italic",
  },
});
