// app/api/intake/save/route.js

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { intakeSchema } from "@/lib/validation/intake";

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

export async function POST(req) {
  try {
    const supabase = getSupabaseAdmin();

    const raw = await req.json();

    // Validate the incoming payload with the same schema the client uses
    const parsedResult = intakeSchema.safeParse(raw);
    if (!parsedResult.success) {
      console.error("intakeSchema validation error", parsedResult.error);
      return NextResponse.json(
        {
          error: "Validation failed",
          issues: parsedResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const payload = parsedResult.data;

    // Map intake payload -> inventory_items row
    const row = {
      // core identity
      item_number: payload.itemNumber,
      slug: payload.slug,
      full_slug: payload.full_slug,
      brand: payload.brand,
      model: payload.model,

      // condition
      condition_grade: payload.grade || null,
      // we'll add a dedicated condition_notes field in the UI later
      condition_notes: null,

      // EMZCuratorAI / structured data
      identity: payload.identity ?? null,
      seo: payload.seo ?? null,
      search_keywords: payload.search_keywords ?? null,

      // notes (internal)
      notes: payload.notes ?? null,

      // images placeholder for now
      images: payload.imagePlaceholderUrl
        ? { placeholder: payload.imagePlaceholderUrl }
        : null,
    };

    // Upsert into inventory_items so re-saving the same SKU updates instead of duplicating.
    const { data, error } = await supabase
      .from("inventory_items")
      .upsert(row, {
        onConflict: "item_number", // requires unique constraint on item_number
        returning: "representation",
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase upsert error (inventory_items)", error);
      throw error;
    }

    return NextResponse.json(
      {
        ok: true,
        full_slug: data.full_slug,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error in /api/intake/save:", err);
    return NextResponse.json(
      { error: err.message || "Failed to save intake item" },
      { status: 500 }
    );
  }
}
