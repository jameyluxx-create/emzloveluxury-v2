// app/api/intake/generate-sku/route.js

import { NextResponse } from "next/server";

function toSlug(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function makeTimestampCode(date = new Date()) {
  const pad = (n) => n.toString().padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function makeRandomCode(len = 3) {
  return Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, len);
}

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      item_number: existingItemNumber,
      brand = "",
      category = "",
      model = "",
      submodel = "",
      variant = "",
    } = body || {};

    // --- ITEM NUMBER (SKU) ---
    // Pattern: BRANDCAT-YYYYMMDD-HHMMSS-RND
    // Example: LVW-20251130-142305-7KQ
    const brandCode = (brand || "EMZ")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 3) || "EMZ";

    const catCode = (category || "X")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 1) || "X";

    const tsCode = makeTimestampCode();
    const rndCode = makeRandomCode(3);

    const generatedItemNumber = `${brandCode}${catCode}-${tsCode}-${rndCode}`;

    const finalItemNumber =
      existingItemNumber && existingItemNumber.trim().length > 0
        ? existingItemNumber.trim()
        : generatedItemNumber;

    // --- SLUGS ---
    // Base for slug: brand + model + submodel + variant
    const nameParts = [brand, model, submodel, variant].filter(Boolean).join(" ");
    const baseName = nameParts || finalItemNumber;

    const slugBase = toSlug(baseName);
    const slug = slugBase || toSlug(finalItemNumber);
    const full_slug = slug; // If you later want nested paths, adjust here.

    return NextResponse.json(
      {
        item_number: finalItemNumber,
        slug,
        full_slug,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error in /api/intake/generate-sku:", err);
    return NextResponse.json(
      {
        error: "Failed to generate SKU",
        details: err?.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}
