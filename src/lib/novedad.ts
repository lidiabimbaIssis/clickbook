// Días que un libro subido como novedad se muestra "Aún sin valoraciones"
// (estrellas lilas y sin nota), igual que la etiqueta NEW. Si algún lector
// vota antes, se muestra ya la media de sus votos. Pasado este plazo se usa
// la nota del JSON mezclada con los votos (ver rating.ts), sin tocar nada.
export const DIAS_SIN_RESENAS = 15;

// true si el libro tiene fecha_novedad ("YYYY-MM-DD") y todavía no han
// pasado DIAS_SIN_RESENAS días desde ella. Una fecha futura también cuenta
// como "sin reseñas". Sin fecha o con fecha inválida → false (se muestran
// las reseñas normales, como hasta ahora).
export function sinResenasAun(fechaNovedad?: string | null): boolean {
  if (!fechaNovedad) return false;
  const fecha = new Date(fechaNovedad);
  if (isNaN(fecha.getTime())) return false;
  const diffDias = (Date.now() - fecha.getTime()) / (1000 * 60 * 60 * 24);
  return diffDias < DIAS_SIN_RESENAS;
}
