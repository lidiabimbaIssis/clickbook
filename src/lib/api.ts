import * as SecureStore from "expo-secure-store";

export const API_BASE = "https://clickbook-production.up.railway.app/api";
export const SESSION_KEY = "session_token";

async function getToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(SESSION_KEY);
}

export async function setToken(token: string) {
  await SecureStore.setItemAsync(SESSION_KEY, token);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export async function api<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await getToken();

  // Limpiamos la ruta para evitar duplicados /api/api/
  const cleanPath = path.startsWith("/api") ? path.replace("/api", "") : path;
  const fullUrl = `${API_BASE}${cleanPath}`;

  console.log(`[API] Llamando a ${fullUrl}. ¿Token encontrado?: ${!!token}`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(fullUrl, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // console.warn en vez de console.error: evita que el LogBox de desarrollo
    // tape la pantalla con errores esperados (402 limite diario, 401 sesion, etc.)
    console.warn(`[API] Error ${res.status} en ${fullUrl}: ${text}`);
    throw new Error(`${res.status}: ${text}`);
  }

  return res.json();
}