// Solo el dueño de la plataforma puede agregar o quitar videos de Learning.
export const LEARNING_ADMIN_EMAIL = "rledezma2001@gmail.com";
export const MAX_LEARNING_VIDEOS = 10;

export type VideoEmbed = { kind: "youtube" | "vimeo"; embedUrl: string } | null;

// Devuelve la URL para incrustar si el enlace es de YouTube o Vimeo; null si es
// otro sitio (entonces se muestra solo como enlace).
export function videoEmbed(rawUrl: string): VideoEmbed {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return /^[\w-]{6,}$/.test(id) ? { kind: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` } : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.pathname.startsWith("/embed/") ? u.pathname.split("/")[2] : u.searchParams.get("v");
    return id && /^[\w-]{6,}$/.test(id) ? { kind: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` } : null;
  }
  if (host === "vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    return id && /^\d+$/.test(id) ? { kind: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` } : null;
  }
  return null;
}

export function isHttpsUrl(raw: string): boolean {
  try {
    return new URL(raw).protocol === "https:";
  } catch {
    return false;
  }
}
