import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setToken, clearToken, SESSION_KEY, User } from "../lib/api";
import * as SecureStore from "expo-secure-store";
import Purchases from "react-native-purchases";

type AuthState = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Usamos la MISMA clave que api.ts (SESSION_KEY = "session_token")
      const token = await SecureStore.getItemAsync(SESSION_KEY);

      if (token) {
        const me = await api<User>("/auth/me");
        setUser(me);
        // Le decimos a RevenueCat quién es este usuario (su user_id de
        // nuestro backend), para que las compras queden asociadas a él
        // y no a un ID anónimo temporal generado por el propio SDK.
        try {
          await Purchases.logIn(me.user_id);
        } catch {}
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

 const signOut = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    try {
      await Purchases.logOut();
    } catch {}
    await clearToken();
    setUser(null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}