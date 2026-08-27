"use server";

import { requireManager } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

const BUCKET = "product-images";
const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadProductImage(
  formData: FormData
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  const session = await requireManager();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "No se recibió ninguna imagen" };
  }
  if (file.size > MAX_BYTES) {
    return { success: false, error: "La imagen es demasiado grande (máx. 5MB)" };
  }

  const ext = file.type === "image/png" ? "png" : "jpg";
  const path = `${session.companyId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    return { success: false, error: "No se pudo subir la imagen. Intenta de nuevo." };
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return { success: true, url: data.publicUrl };
}
