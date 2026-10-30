import { useEffect, useState } from "react";

// Nota que se muestra de un libro: mezcla la nota inicial que trae el
// JSON (base) con los votos reales de los lectores de la app. La nota
// inicial cuenta como PESO_NOTA_INICIAL votos, así que un solo voto no la
// hunde ni la dispara, y cuantos más votos reales hay, más manda la gente.
// Ejemplo: base 4,5 y un voto de 1 → (4,5×10 + 1) / 11 = 4,2.
export const PESO_NOTA_INICIAL = 10;

export function notaLibro(base: number | null | undefined, sum?: number | null, count?: number | null): number {
  const n = count || 0;
  const s = sum || 0;
  if (base == null || isNaN(base)) return n > 0 ? s / n : 0;
  return (base * PESO_NOTA_INICIAL + s) / (PESO_NOTA_INICIAL + n);
}

// Media solo de los votos reales (para novedades, que no tienen nota
// inicial). null si todavía nadie ha votado.
export function mediaVotos(sum?: number | null, count?: number | null): number | null {
  return count ? (sum || 0) / count : null;
}

// Votos recién hechos en la pantalla Vibes. La portada (Descubrir) carga los
// libros una sola vez, así que sin esto seguiría enseñando la nota de antes
// de votar hasta recargar el feed.
type Votos = { user_ratings_sum: number; user_ratings_count: number };
const votosActualizados = new Map<string, Votos>();
const oyentes = new Set<() => void>();

export function guardarVotosLibro(bookId: string, sum: number, count: number) {
  votosActualizados.set(bookId, { user_ratings_sum: sum, user_ratings_count: count });
  oyentes.forEach((f) => f());
}

// Devuelve el libro con los votos más recientes, si se ha votado en esta sesión.
export function conVotosActualizados<T extends { book_id?: string }>(book: T): T {
  const v = book?.book_id ? votosActualizados.get(book.book_id) : undefined;
  return v ? { ...book, ...v } : book;
}

// Vuelve a pintar el componente cuando alguien vota un libro.
export function useVotosActualizados() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((n) => n + 1);
    oyentes.add(f);
    return () => {
      oyentes.delete(f);
    };
  }, []);
}
