"use client";

import { useState } from "react";

import { createDbClient } from "@/lib/db/client";
import { uploadImage } from "@/lib/uploads/upload-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

const HEX_PATTERN = /^#([0-9a-fA-F]{6})$/;
const DEFAULT_BRAND = "#0f6e4f";

export function AppearanceSettings({
  tenantId,
  currentColor,
  currentLogoUrl,
  onChanged,
  onLogoChanged,
}: {
  tenantId: string;
  currentColor: string | null;
  currentLogoUrl: string | null;
  onChanged: (color: string | null) => void;
  onLogoChanged: (logoUrl: string | null) => void;
}) {
  const [color, setColor] = useState(currentColor ?? DEFAULT_BRAND);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUploadLogo(file: File) {
    setError(null);
    setUploadingLogo(true);

    try {
      const url = await uploadImage(file);
      const db = createDbClient();
      const { error: updateError } = await db
        .from("tenants")
        .update({ logo_url: url })
        .eq("id", tenantId);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      onLogoChanged(url);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Falha no upload.");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSave() {
    if (!HEX_PATTERN.test(color)) {
      setError("Use um código hex válido, ex: #5C3A21.");
      return;
    }

    setError(null);
    setSaving(true);

    const db = createDbClient();
    const { error: updateError } = await db
      .from("tenants")
      .update({ brand_color: color })
      .eq("id", tenantId);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    onChanged(color);
  }

  async function handleReset() {
    setError(null);
    setSaving(true);

    const db = createDbClient();
    const { error: updateError } = await db
      .from("tenants")
      .update({ brand_color: null })
      .eq("id", tenantId);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setColor(DEFAULT_BRAND);
    onChanged(null);
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Aparência</h1>
        <p className="text-sm text-muted">
          Escolha a cor de marca da sua empresa — aplicada no painel da equipe e na tela do
          cliente (QR Code/Totem). Clique “Usar padrão” pra manter o verde do KlikFlow.
        </p>
      </div>

      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex items-center gap-3">
            {currentLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- external Blob URL
              <img
                src={currentLogoUrl}
                alt="Logo"
                className="h-16 w-16 rounded-lg border border-border object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted">
                Sem logo
              </div>
            )}
            <label className="cursor-pointer text-sm text-brand underline underline-offset-2">
              {uploadingLogo ? "Enviando..." : currentLogoUrl ? "Trocar logo" : "Enviar logo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingLogo}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleUploadLogo(file);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={HEX_PATTERN.test(color) ? color : DEFAULT_BRAND}
              onChange={(event) => setColor(event.target.value)}
              className="h-10 w-14 cursor-pointer rounded border border-border bg-transparent"
              aria-label="Selecionar cor"
            />
            <Input
              value={color}
              onChange={(event) => setColor(event.target.value)}
              placeholder="#5C3A21"
              className="flex-1"
            />
          </div>

          {error && <Alert variant="danger">{error}</Alert>}

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar cor"}
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={saving}>
              Usar padrão
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
