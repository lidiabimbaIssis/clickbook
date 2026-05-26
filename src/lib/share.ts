import { Platform } from "react-native";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";

export type ShareBookCard = {
  title: string;
  author: string;
  coverUrl: string;
  rating?: number;
  hookText?: string;
};

/** Original simple text share (fallback for web or when image fails) */
export async function shareContent({ title, text, url }: { title: string; text: string; url: string }) {
  if (Platform.OS === "web" && typeof navigator !== "undefined" && (navigator as any).share) {
    try { await (navigator as any).share({ title, text, url }); return; } catch {}
  }
  if (Platform.OS === "web") {
    try { await navigator.clipboard.writeText(`${text}\n${url}`); alert("Texto copiado al portapapeles"); } catch {}
    return;
  }
  try {
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(url, { dialogTitle: title });
  } catch (e) { console.warn("share failed", e); }
}

/**
 * Capture a View ref as PNG and share for Stories/Reels/TikTok.
 * The view must be rendered (can be off-screen via opacity/position).
 */
export async function captureAndShare(viewRef: any, fileName: string = "clickbook-share") {
  try {
    const uri = await captureRef(viewRef, {
      format: "png",
      quality: 1,
      result: "tmpfile",
      width: 1080,
      height: 1920,
    });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        dialogTitle: "Comparte en Stories",
        mimeType: "image/png",
        UTI: "public.png",
      });
    }
    return uri;
  } catch (e) {
    console.warn("captureAndShare failed", e);
    return null;
  }
}