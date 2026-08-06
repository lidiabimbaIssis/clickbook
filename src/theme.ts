export const colors = {
  bgBase: "#000000",
  bgSurface: "#0A0414",
  bgSurfaceLight: "#15082A",
  parchment: "#070210",
  parchmentSurface: "#0F0520",
  brass: "#45b7f5",          // azul hielo
  brassMuted: "#007bbe",      // azul hielo oscuro/apagado — botones de compra
  copper: "#9a3cd1",          // morado oscuro
  copperDark: "#4E027A",      // morado aún más oscuro — tags/rating, para que pasen desapercibidos frente a la botonera lateral
  textOnDark: "#E8E4FF",
  textOnDarkMuted: "#9183B8",
  textOnLight: "#E8E4FF",
  textOnLightMuted: "#9183B8",
  verdigris: "#00FFA3",       // neon green (like)
  iron: "#FF2E78",            // neon pink (discard)
  border: "#4E027A",
  brassSoft: "rgba(3, 167, 255, 0.2)",
  gold: "#FFD23F",            // neon yellow (compras)
  goldSoft: "rgba(255,210,63,0.35)",

  // Degradado de fondo: negro → morado muy oscuro
  bgGradient: ["#000000", "#0A0414", "#12071F"] as const,
};

export const fonts = {
  display: "serif" as const,
  body: "System" as const,
};