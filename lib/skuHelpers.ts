// lib/skuHelpers.ts

// Convert brand string → code
export function brandCode(brand?: string | null): string {
  if (!brand) return "BR-GEN";
  const name = brand.toLowerCase();

  if (name.includes("louis") || name.includes("lv")) return "LV";
  if (name.includes("chanel")) return "CH";
  if (name.includes("gucci")) return "GC";
  if (name.includes("prada")) return "PR";
  if (name.includes("miu")) return "MM";
  if (name.includes("burberry")) return "BB";
  if (name.includes("coach")) return "CHC";
  if (name.includes("ferragamo")) return "FG";
  if (name.includes("ysl") || name.includes("saint laurent")) return "YSL";
  if (name.includes("celine")) return "CL";

  return "BR-GEN";
}

// Convert model string → code (same logic you already use)
export function modelCode(model?: string | null): string {
  if (!model) return "GEN";
  let normalized = model.toLowerCase();

  if (normalized.includes("neverfull")) return "NVF";
  if (normalized.includes("alma")) return "ALM";
  if (normalized.includes("speedy")) return "SPD";
  if (normalized.includes("passy")) return "PSY";
  if (normalized.includes("pochette")) return "PCH";
  if (normalized.includes("wallet")) return "WLT";
  if (normalized.includes("zippy")) return "ZPY";

  normalized = normalized.replace(/\W+/g, "").toUpperCase();
  if (normalized.length >= 3) return normalized.slice(0, 3);
  if (normalized.length === 2) return normalized + "X";
  if (normalized.length === 1) return normalized + "XX";
  return "GEN";
}

// Option C: ITEMNUMBER-brand-model (no /item prefix here)
export function buildInventorySlug(
  itemNumber: string,
  brand?: string | null,
  model?: string | null
): string {
  const parts: string[] = [];

  if (brand) parts.push(String(brand));
  if (model) parts.push(String(model));

  const base = parts.join(" ").toLowerCase();

  const simpleSlug = base
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

  if (!itemNumber && !simpleSlug) return "";
  if (!simpleSlug) return String(itemNumber).toLowerCase();
  if (!itemNumber) return simpleSlug;

  return `${String(itemNumber).toLowerCase()}-${simpleSlug}`;
}
