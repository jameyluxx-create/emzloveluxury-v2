// app/api/listings/create/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { brandCode, modelCode, buildInventorySlug } from "@/lib/skuHelpers";
import { fetchNextSequence } from "@/lib/sequence";

// IMPORTANT: use service role key on the server ONLY
function getSupabaseAdmin() {
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

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const body = await req.json();

    const {
      brand,
      model,
      // include any other fields your UI sends for listings
      ...rest
    } = body;

    if (!brand || !model) {
      return NextResponse.json(
        { error: "brand and model are required" },
        { status: 400 }
      );
    }

    // --- 1) Build SKU & slug ---

    const brandC = brandCode(brand);
    const modelC = modelCode(model);

    // Use your existing helper to get the next sequence number
    const sequence = await fetchNextSequence(supabaseAdmin, brandC, modelC);

    const sku = `${brandC}-${modelC}-EMZ-${sequence}`;

    // slug without /item prefix
    const slug = buildInventorySlug(sku, brand, model);

    // full_slug stored in the table – if you want /item/ prefix, keep this:
    const full_slug = `/item/${slug}`;
    // If you prefer to store just slug, you could instead:
    // const full_slug = slug;

    // --- 2) Insert into listings table ---

    const listingToInsert = {
      ...rest,
      brand,
      model,
      sku,
      slug,
      full_slug,
    };

    const { data, error } = await supabaseAdmin
      .from("listings")
      .insert(listingToInsert)
      .select()
      .single();

    if (error) {
      console.error("Error inserting listing:", error);
      return NextResponse.json(
        { error: error.message || "Failed to create listing" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        listing: data,
        sku,
        slug,
        full_slug,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Error in /api/listings/create:", err);
    return NextResponse.json(
      { error: err.message || "Listings create failed" },
      { status: 500 }
    );
  }
}
