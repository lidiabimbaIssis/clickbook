import React, { useEffect } from "react";
import { Tabs } from "expo-router";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useAuth } from "../../src/providers/AuthProvider";
import { colors } from "../../src/theme";

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brass} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgSurface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 70,
          paddingBottom: 12,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.brass,
        tabBarInactiveTintColor: colors.textOnDarkMuted,
        tabBarLabelStyle: { fontSize: 11, letterSpacing: 1.2, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{
          title: "DESCUBRIR",
          tabBarIcon: ({ color, size }) => <Ionicons name="library" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: "FAVORITOS",
          tabBarIcon: ({ color, size }) => <Ionicons name="heart" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "AJUSTES",
          tabBarIcon: ({ color, size }) => <Ionicons name="cog" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bgBase },
});
