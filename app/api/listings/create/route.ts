// app/api/listings/create/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { brandCode, modelCode, buildInventorySlug } from "@/lib/skuHelpers";
import { fetchNextSequence } from "@/lib/sequence";

// IMPORTANT: use service role key on the server ONLY
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // never expose this to the client
  {
    auth: { persistSession: false },
  }
);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      userId,
      brand,
      model,
      category,
      color,
      material,
      description,
      condition,
      condition_notes,
      currency = "USD",
      cost,
      listing_price,
      images = [],
      status = "intake", // "intake" | "ready_to_sell"
      is_public = false,
    } = body || {};

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    // --- 1) Compute brand/model codes + sequence ---
    const brandC = brandCode(brand);
    const modelC = modelCode(model);
    const sequence = await fetchNextSequence(supabaseAdmin, brandC, modelC);

    const sku = `${brandC}-${modelC}-EMZ-${sequence}`;

    // slug without /item prefix
    const slug = buildInventorySlug(sku, brand, model);
    // full_slug stored in the table – you can include /item/ here
    const full_slug = `/item/${slug}`;

    // --- 2) Insert into listings table ---
    const { data, error } = await supabaseAdmin
      .from("listings")
      .insert({
        user_id: userId,
        sku,
        slug,       // short slug
        full_slug,  // full path-style slug
        brand,
        model,
        category,
        color,
        material,
        description,
        condition,
        condition_notes,
        currency,
        cost,
        listing_price,
        images,
        status,
        is_public,
      })
      .select()
      .single();

    if (error) {
      console.error("Error inserting listing:", error);
      return NextResponse.json(
        { error: "Failed to create listing" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("Unexpected error in /api/listings/create:", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
