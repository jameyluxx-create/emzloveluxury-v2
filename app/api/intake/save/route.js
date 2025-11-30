import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req) {
  try {
    const body = await req.json();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase
      .from("items")
      .insert({
        item_number: body.itemNumber,
        slug: body.slug,
        full_slug: body.full_slug,
        brand: body.brand,
        model: body.model,
        status: body.status,
        grade: body.grade,
        identity: body.identity,
        seo: body.seo,
        search_keywords: body.search_keywords,
        notes: body.notes,
        image_placeholder_url: body.imagePlaceholderUrl || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ full_slug: data.full_slug });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Save failed" },
      { status: 500 }
    );
  }
}
