import type { CSSProperties } from "react";

/**
 * Overrides the KlikFlow brand CSS variables (see `globals.css`) for a
 * single tenant, via inline style on a wrapper element — cascades to
 * every descendant that uses `bg-brand`/`text-brand`/etc, without
 * touching the default theme for tenants that never set a color.
 *
 * `color-mix()` derives the "soft" tint from the base color blended
 * into the current surface color, so it stays sensible in both light
 * and dark mode without a second value to configure.
 */
export function brandStyleVars(color: string | null | undefined): CSSProperties {
  if (!color) return {};

  return {
    "--brand": color,
    "--brand-soft": `color-mix(in srgb, ${color} 18%, var(--surface))`,
  } as CSSProperties;
}
