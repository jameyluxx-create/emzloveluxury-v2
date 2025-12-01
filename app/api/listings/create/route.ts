// app/api/listings/create/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    const itemNumber: string | undefined = body.itemNumber;
    if (!itemNumber) {
      return NextResponse.json(
        { error: "itemNumber is required" },
        { status: 400 }
      );
    }

    // 1) Load intake record from inventory_items
    const { data: inventory, error: invError } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("item_number", itemNumber)
      .maybeSingle();

    if (invError) {
      console.error("Error fetching inventory item:", invError);
      throw invError;
    }

    if (!inventory) {
      return NextResponse.json(
        { error: `No inventory item found for item_number=${itemNumber}` },
        { status: 404 }
      );
    }

    // 2) Build listing row from intake record
    const now = new Date().toISOString();

    const listingRow: any = {
      // Identity & routing
      sku: inventory.item_number,
      item_number: inventory.item_number,
      full_slug: inventory.full_slug,
      brand: inventory.brand,
      model: inventory.model,

      style: inventory.style,
      color: inventory.color,
      material: inventory.material,

      // Condition
      condition: inventory.condition_grade ?? null,
      condition_notes: inventory.condition_notes ?? null,

      // Dimensions as jsonb
      dimensions: {
        length: inventory.length ?? null,
        height: inventory.height ?? null,
        depth: inventory.depth ?? null,
        strap_drop: inventory.strap_drop ?? null,
      },

      // AI & SEO
      identity: inventory.identity ?? null,
      seo: inventory.seo ?? null,
      search_keywords: inventory.search_keywords ?? null,
      ai_data: inventory.ai_data ?? null,

      // Pricing
      currency: inventory.currency ?? "USD",
      listing_price: inventory.emz_sale ?? null,
      pricing: {
        retail_price: inventory.retail_price ?? null,
        comp_low: inventory.comp_low ?? null,
        comp_high: inventory.comp_high ?? null,
        emz_sale: inventory.emz_sale ?? null,
      },

      // Other
      source: inventory.source ?? null,
      notes: inventory.notes ?? null,
      images: inventory.images ?? null,

      // Listing state
      status: "ready",     // or "listed" if you prefer
      is_public: false,    // you can later flip this to true when you want it live
      updated_at: now,
    };

    // 3) See if a listing already exists for this SKU
    const { data: existingList, error: existingError } = await supabase
      .from("listings")
      .select("id")
      .eq("sku", itemNumber)
      .limit(1);

    if (existingError) {
      console.error("Error checking existing listing:", existingError);
      throw existingError;
    }

    let listing;

    if (existingList && existingList.length > 0) {
      // UPDATE existing listing
      const existingId = existingList[0].id;

      const { data: updated, error: updateError } = await supabase
        .from("listings")
        .update(listingRow)
        .eq("id", existingId)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating listing:", updateError);
        throw updateError;
      }

      listing = updated;
    } else {
      // INSERT new listing
      listingRow.created_at = now;

      const { data: inserted, error: insertError } = await supabase
        .from("listings")
        .insert(listingRow)
        .select()
        .single();

      if (insertError) {
        console.error("Error inserting listing:", insertError);
        throw insertError;
      }

      listing = inserted;
    }

    return NextResponse.json(
      {
        ok: true,
        full_slug: listing.full_slug,
        sku: listing.sku,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Error in /api/listings/create:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create/update listing" },
      { status: 500 }
    );
  }
}
