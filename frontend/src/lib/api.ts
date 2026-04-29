const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_BASE = `${EXPO_PUBLIC_BACKEND_URL}/api`;
export const SESSION_KEY = "session_token";

async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string) {
  await AsyncStorage.setItem(SESSION_KEY, token);
}

export async function clearToken() {
  await AsyncStorage.removeItem(SESSION_KEY);
}

export async function api<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

export type Book = {
  book_id: string;
  title: string;
  author: string;
  year: number;
  genre: string;
  pages: number;
  rating: number;
  synopsis_es: string;
  synopsis_en: string;
  summary_es: string;
  summary_en: string;
  cover_url: string;
  amazon_url: string;
  casa_del_libro_url: string;
  google_books_url: string;
};

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  lang: "es" | "en";
};
