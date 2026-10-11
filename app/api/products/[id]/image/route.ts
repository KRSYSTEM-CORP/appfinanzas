import { getSession } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";

// Serves one product's photo as a real image so the catalog lists don't have
// to carry every base64 photo. The URL embeds the product's updatedAt (?v=),
// so a changed photo gets a new URL and an unchanged one can be cached by the
// browser indefinitely. app/api is excluded from proxy.ts, so this route
// authenticates itself, and it scopes by company and branch exactly like
// getProduct does.
const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("No autorizado", { status: 401 });

  const { id } = await params;
  const { companyId, branchId } = session;

  const product = await withTenant(companyId, (tx) =>
    tx.product.findFirst({
      where: { id, companyId, ...(branchId ? { branchId } : {}) },
      select: { imageDataUrl: true },
    })
  );

  const match = product?.imageDataUrl ? DATA_URL_RE.exec(product.imageDataUrl) : null;
  if (!match) return new Response("Sin imagen", { status: 404 });

  return new Response(Buffer.from(match[2], "base64"), {
    headers: {
      "Content-Type": match[1],
      // private: a photo belongs to one company, never cache it in a shared proxy.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
