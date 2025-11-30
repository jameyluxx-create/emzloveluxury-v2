// app/api/intake/save/route.js

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server"; // ⬅️ adjust this import to your setup

// If your table name is different (e.g. "inventory"), change this:
const TABLE_NAME = "items";

export async function POST(req) {
  try {
    const supabase = createClient();
    const body = await req.json();

    const {
      item_number,
      brand,
      model,
      submodel,
      variant,
      category,
      color,
      material,
      size,
      condition_grade,
      acquisition_source,
      acquisition_cost,
      list_price,
      item_title,
      slug,
      full_slug,
      identity,
      seo,
      search_keywords,
      ai_quick_facts,
      notes,
      image_placeholder_url,
    } = body || {};

    if (!slug || !full_slug) {
      return NextResponse.json(
        {
          error: "Missing slug/full_slug",
          details: "Slug and full_slug are required to save an item.",
        },
        { status: 400 }
      );
    }

    // Normalize / sanitize a bit
    const now = new Date().toISOString();

    // search_keywords should be an array of strings or null
    const normalizedKeywords = Array.isArray(search_keywords)
      ? search_keywords.map((k) => String(k).trim()).filter(Boolean)
      : [];

    const record = {
      // Core identity
      item_number: item_number || null,
      brand: brand || null,
      model: model || null,
      submodel: submodel || null,
      variant: variant || null,
      category: category || null,
      color: color || null,
      material: material || null,
      size: size || null,
      condition_grade: condition_grade || null,

      // Business info
      acquisition_source: acquisition_source || null,
      acquisition_cost:
        typeof acquisition_cost === "number"
          ? acquisition_cost
          : acquisition_cost
          ? Number(acquisition_cost)
          : null,
      list_price:
        typeof list_price === "number"
          ? list_price
          : list_price
          ? Number(list_price)
          : null,

      // Web / SEO
      item_title: item_title || null,
      slug,
      full_slug,

      identity: identity || {}, // jsonb
      seo: seo || {}, // jsonb
      search_keywords: normalizedKeywords.length ? normalizedKeywords : null, // text[]

      ai_quick_facts: ai_quick_facts || null,
      notes: notes || null,
      image_placeholder_url: image_placeholder_url || null,

      // Timestamps (assuming your table has created_at default and updated_at manual)
      updated_at: now,
    };

    // If your table uses created_at default, no need to set it.
    // If you want upsert behavior:
    // - Make sure you have a UNIQUE constraint on item_number OR full_slug
    // - Then set onConflict accordingly
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .upsert(record, {
        onConflict: "item_number", // or "full_slug" – adjust to match your unique index
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase upsert error:", error);
      return NextResponse.json(
        {
          error: "Failed to save item",
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        id: data.id,
        full_slug: data.full_slug,
        slug: data.slug,
        item_number: data.item_number,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error in /api/intake/save:", err);
    return NextResponse.json(
      {
        error: "Unexpected error while saving item",
        details: err?.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}
