// app/api/intake/generate-sku/route.js

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { brandCode, modelCode } from "@/lib/skuHelpers";
import { fetchNextSequence } from "@/lib/sequence";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are not set");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export async function POST(req) {
  try {
    const supabase = getSupabase();

    const { brand, model } = await req.json();

    if (!brand || !model) {
      return NextResponse.json(
        { error: "brand and model are required" },
        { status: 400 }
      );
    }

    const brandC = brandCode(brand);
    const modelC = modelCode(model);

    const sequence = await fetchNextSequence(supabase, brandC, modelC);

    const itemNumber = `${brandC}-${modelC}-EMZ-${sequence}`;

    return NextResponse.json(
      {
        ok: true,
        itemNumber,
        brandCode: brandC,
        modelCode: modelC,
        sequence,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error in /api/intake/generate-sku:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate SKU" },
      { status: 500 }
    );
  }
}
