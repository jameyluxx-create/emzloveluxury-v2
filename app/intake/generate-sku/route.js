import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req) {
  try {
    const body = await req.json();
    const { brand, model } = body;

    if (!brand || !model) {
      return NextResponse.json(
        { error: "Brand and model are required." },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const prefix =
      `${brand} ${model}`
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .split("-")
        .slice(0, 2)
        .join("-") || "GEN";

    const { data, error } = await supabase
      .from("items")
      .select("item_number")
      .like("item_number", `${prefix}%`)
      .order("item_number", { ascending: false })
      .limit(1);

    if (error) throw error;

    let nextNum = 1;
    if (data && data.length > 0) {
      const last = data[0].item_number;
      const parts = last.split("-");
      const num = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(num)) nextNum = num + 1;
    }

    const itemNumber = `${prefix}-${String(nextNum).padStart(3, "0")}`;
    return NextResponse.json({ itemNumber });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Failed to generate SKU." },
      { status: 500 }
    );
  }
}
