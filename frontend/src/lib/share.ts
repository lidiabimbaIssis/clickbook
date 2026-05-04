import { Platform } from "react-native";

export type ShareData = {
  title?: string;
  text: string;
  url?: string;
  audioBase64?: string;  // optional MP3 base64
  filename?: string;
};

/**
 * Cross-platform share. On web uses navigator.share + clipboard fallback.
 * On native uses expo-sharing.
 */
export async function shareContent(data: ShareData): Promise<boolean> {
  if (Platform.OS === "web") {
    try {
      // Web Share API - supports files when audio provided
      const navAny = (typeof navigator !== "undefined") ? (navigator as any) : null;
      if (navAny?.share) {
        const payload: any = {
          title: data.title,
          text: data.text,
          url: data.url,
        };
        if (data.audioBase64) {
          try {
            const byteChars = atob(data.audioBase64);
            const bytes = new Uint8Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
            const blob = new Blob([bytes], { type: "audio/mpeg" });
            const file = new File([blob], data.filename || "clickbook.mp3", { type: "audio/mpeg" });
            if (navAny.canShare && navAny.canShare({ files: [file] })) {
              payload.files = [file];
            }
          } catch {}
        }
        await navAny.share(payload);
        return true;
      }
      // Fallback: copy to clipboard
      const fullText = `${data.text}${data.url ? `\n${data.url}` : ""}`;
      if (navAny?.clipboard) {
        await navAny.clipboard.writeText(fullText);
        if (typeof window !== "undefined") {
          window.alert("¡Enlace copiado al portapapeles!");
        }
        return true;
      }
    } catch (e) {
      console.warn("share failed", e);
    }
    return false;
  }
  // Native: use expo-sharing
  try {
    const Sharing = await import("expo-sharing");
    const FileSystem: any = await import("expo-file-system");
    if (data.audioBase64) {
      const path = `${FileSystem.cacheDirectory}${data.filename || "clickbook.mp3"}`;
      await FileSystem.writeAsStringAsync(path, data.audioBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(path, { mimeType: "audio/mpeg", dialogTitle: data.title });
        return true;
      }
    }
    // No audio: try sharing a tiny text file (some social apps allow this) or just URL
    if (data.url) {
      const Linking = await import("expo-linking");
      // Open share-style URL on iOS via mailto fallback won't help; just return false to caller
    }
  } catch (e) {
    console.warn("native share failed", e);
  }
  return false;
}
