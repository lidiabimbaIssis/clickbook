import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

// Datos y utilidades compartidas por los minijuegos (pestaña JUEGOS).
// Todo sale de /books/feed, el mismo listado aleatorio que usa la app —
// no hace falta nada nuevo en el backend.

export type GameBook = {
  book_id: string;
  title: string;
  author: string;
  year?: number;
  pages?: number;
  genre?: string;
  subgenero?: string;
  tema?: string;
  tono?: string;
  mood?: string | string[];
  trope?: string | string[];
  synopsis_es?: string;
  vibe_tags?: { label?: string; icon?: string }[];
};

let cache: GameBook[] | null = null;

// Una sola carga por sesión: los juegos se abren y cierran muchas veces
// y no tiene sentido pedir 150 libros cada vez.
export async function loadGameBooks(): Promise<GameBook[]> {
  if (cache && cache.length) return cache;
  const res = await api<{ books: GameBook[] }>("/books/feed?skip=0&count=150");
  cache = (res?.books || []).filter((b) => b && b.book_id && b.title && b.author);
  return cache;
}

// Mismo patrón de URL de Cloudinary que Favoritos / libros del autor.
export function coverUri(bookId: string, width: number) {
  return `https://res.cloudinary.com/ddppclcl1/image/upload/w_${Math.round(width * 2)},q_auto,f_auto/v1780422197/${bookId}.webp`;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function normalize(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

// Igual que en Descubrir: las etiquetas tipo "Más de 5.000 reseñas" vienen
// inventadas en los JSON, así que no se usan.
export function cleanVibeTags(book: GameBook) {
  return (book.vibe_tags || []).filter((t) => t && t.label && !/rese[ñn]a|valoraci/i.test(t.label));
}

function asText(v: string | string[] | undefined) {
  if (!v) return "";
  return Array.isArray(v) ? v.join(" ") : String(v);
}

// Todo el texto "de ambiente" de un libro junto, para el test de vibes.
export function vibeText(book: GameBook) {
  return normalize(
    [
      book.genre,
      book.subgenero,
      book.tema,
      book.tono,
      asText(book.mood),
      asText(book.trope),
      cleanVibeTags(book).map((t) => t.label).join(" "),
    ].join(" ")
  );
}

// Récords de cada juego, guardados en el móvil.
const BEST_PREFIX = "games_best_";

export async function getBest(gameId: string): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(BEST_PREFIX + gameId);
    return v ? Number(v) || 0 : 0;
  } catch {
    return 0;
  }
}

// Guarda el récord solo si lo supera. Devuelve true si es récord nuevo.
export async function saveBest(gameId: string, score: number): Promise<boolean> {
  const prev = await getBest(gameId);
  if (score <= prev) return false;
  try {
    await AsyncStorage.setItem(BEST_PREFIX + gameId, String(score));
  } catch {}
  return true;
}

// Nivel por el que va cada juego, para seguir donde lo dejaste.
const LEVEL_PREFIX = "games_level_";

export async function getLevel(gameId: string): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(LEVEL_PREFIX + gameId);
    return Math.max(1, Number(v) || 1);
  } catch {
    return 1;
  }
}

export async function setLevel(gameId: string, level: number) {
  try {
    await AsyncStorage.setItem(LEVEL_PREFIX + gameId, String(level));
  } catch {}
}

// Juegos cuya explicación ya se ha visto (la ventanita que sale la
// primera vez que entras en cada uno).
const SEEN_KEY = "games_seen_intros";

export async function getSeenIntros(): Promise<string[]> {
  try {
    const v = await AsyncStorage.getItem(SEEN_KEY);
    return v ? JSON.parse(v) : [];
  } catch {
    return [];
  }
}

export async function markIntroSeen(gameId: string) {
  const seen = await getSeenIntros();
  if (seen.includes(gameId)) return;
  try {
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seen, gameId]));
  } catch {}
}

// Borra récords, niveles y explicaciones vistas de todos los juegos (botón
// "Resetear juegos" de Ajustes): empiezas de cero del todo.
export async function resetGameRecords() {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(BEST_PREFIX) || k.startsWith(LEVEL_PREFIX) || k === SEEN_KEY));
}

// Límite diario de partidas (3 gratis al día, como los hooks). Se pide
// permiso al servidor justo antes de empezar cada partida.
export async function requestGamePlay(): Promise<"ok" | "limit"> {
  try {
    await api("/me/game-play", { method: "POST" });
    return "ok";
  } catch (e: any) {
    // Solo se bloquea con un 402 de verdad. Si falla otra cosa (sin
    // conexión, servidor sin actualizar…) se deja jugar.
    return String(e?.message || "").startsWith("402") ? "limit" : "ok";
  }
}

export async function getGameUsage(): Promise<{ is_premium: boolean; remaining: number | null; limit: number } | null> {
  try {
    return await api("/me/game-usage");
  } catch {
    return null;
  }
}
