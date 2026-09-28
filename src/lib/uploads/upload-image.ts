/** Uploads an image via `/api/uploads` (staff session required) and returns its public URL. */
export async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/uploads", {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.message ?? `Falha no upload (HTTP ${response.status})`);
  }

  return body.url as string;
}
