/** Public, deployment-specific appearance. Each Vercel project builds this file
 * with its own NEXT_PUBLIC_* values; the default preserves Crimson exactly. */
const id = process.env.NEXT_PUBLIC_BRAND_ID?.trim() || "crimson";

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
  throw new Error("NEXT_PUBLIC_BRAND_ID must be a lowercase slug");
}

const isCrimson = id === "crimson";
const name = isCrimson
  ? "Crimson Creed"
  : process.env.NEXT_PUBLIC_BRAND_NAME?.trim();

if (!name) {
  throw new Error("NEXT_PUBLIC_BRAND_NAME is required for another brand");
}

function color(value: string | undefined, fallback: string): string {
  const result = value?.trim() || fallback;
  if (!/^#[0-9a-fA-F]{6}$/.test(result)) {
    throw new Error("Brand colors must be six-digit hex values");
  }
  return result;
}

function asset(value: string | undefined): string | null {
  if (!value) return null;
  const result = value.trim();
  if (result.startsWith("/")) return result.startsWith("//") ? null : result;
  try {
    const url = new URL(result);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export const brand = {
  id,
  name,
  appName: `${name} Operations`,
  logo: isCrimson
    ? "/logo.webp"
    : asset(process.env.NEXT_PUBLIC_BRAND_LOGO_URL),
  mark: isCrimson
    ? "/logo-mark.png"
    : asset(process.env.NEXT_PUBLIC_BRAND_MARK_URL),
  icon: isCrimson
    ? "/brands/crimson/icon.png"
    : asset(process.env.NEXT_PUBLIC_BRAND_ICON_URL),
  appleIcon: isCrimson
    ? "/brands/crimson/apple-icon.png"
    : asset(process.env.NEXT_PUBLIC_BRAND_ICON_URL),
  light: color(
    isCrimson ? undefined : process.env.NEXT_PUBLIC_BRAND_COLOR_LIGHT,
    "#475569",
  ),
  dark: color(
    isCrimson ? undefined : process.env.NEXT_PUBLIC_BRAND_COLOR_DARK,
    "#94a3b8",
  ),
  isCrimson,
} as const;

/** Only alternate brands need overrides; Crimson retains its original CSS. */
export function brandCss(): string {
  if (brand.isCrimson) return "";
  const palette = (accent: string, dark: boolean) => `
    --primary: ${accent};
    --ring: ${accent};
    --sidebar-ring: ${accent};
    --primary-hover: color-mix(in srgb, ${accent} 84%, ${dark ? "white" : "black"});
    --primary-foreground: ${dark ? "#08090a" : "#ffffff"};
    --tone-brand-bg: color-mix(in srgb, ${accent} 14%, ${dark ? "#08090a" : "white"});
    --tone-brand-fg: ${accent};
    --tone-brand-border: color-mix(in srgb, ${accent} 38%, ${dark ? "#08090a" : "white"});
    --chart-1: ${accent};
    --chart-4: ${accent};
  `;
  return `:root { ${palette(brand.light, false)} } .dark { ${palette(brand.dark, true)} }`;
}
