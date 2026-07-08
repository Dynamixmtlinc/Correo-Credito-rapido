import { NextRequest, NextResponse } from "next/server";
import { getDocumentoBuffer } from "@/lib/db-storage";
import { requireAuth, apiError } from "@/lib/api-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id, fileId } = await params;
  const doc = await getDocumentoBuffer(fileId, id);

  if (!doc) return apiError("Document non trouvé", 404);

  return new Response(new Uint8Array(doc.buffer), {
    headers: {
      "Content-Type": doc.contentType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.nombre)}"`,
      "Content-Length": doc.buffer.length.toString(),
    },
  });
}
