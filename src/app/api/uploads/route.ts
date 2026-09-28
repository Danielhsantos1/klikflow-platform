import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

import { getCurrentUser } from "@/lib/auth/session";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Staff-only image upload (logo, category banner) — backed by Vercel
 * Blob. Anyone with a KlikFlow session can upload; the actual DB write
 * that attaches the resulting URL to a tenant/category still goes
 * through the normal RLS-checked `tenant.manage`/`categories` policies,
 * so an uploaded-but-unused file is the worst case, never a privilege
 * escalation.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "Não autenticado." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Nenhum arquivo enviado." }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ message: "Envie uma imagem." }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ message: "Imagem muito grande (máximo 5MB)." }, { status: 400 });
  }

  const blob = await put(`klikflow/${user.id}/${Date.now()}-${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
  });

  return NextResponse.json({ url: blob.url });
}
