// app/item/[full_slug]/print-tag/page.js

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function formatCurrency(value) {
  if (value == null) return "";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return `$${num.toFixed(2)}`;
}

export const dynamic = "force-dynamic";

export default async function PrintTagPage({ params }) {
  const supabase = createClient();
  const fullSlug = decodeURIComponent(params.full_slug);

  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("full_slug", fullSlug)
    .maybeSingle();

  if (error || !data) {
    console.error("Print tag load error:", error);
    notFound();
  }

  const item = data;
  const {
    item_number,
    brand,
    model,
    submodel,
    variant,
    category,
    color,
    list_price,
    item_title,
  } = item;

  const displayTitle =
    item_title ||
    [brand, model, submodel, variant].filter(Boolean).join(" ") ||
    item_number ||
    fullSlug;

  const shortBrandLine = [brand, category].filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen bg-white text-black p-8 print:p-4">
      <div className="text-xs text-neutral-500 mb-4">
        Cut along dotted lines. Left = front of tag, right = back.
      </div>

      <div className="flex justify-center gap-8">
        {/* FRONT OF TAG */}
        <div className="relative border border-neutral-400 rounded-md w-64 h-40 p-3 flex flex-col items-center justify-between">
          {/* Cut marks */}
          <CornerMarks />

          {/* Hole punch guide */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full border border-neutral-500" />

          <div className="mt-4 text-center">
            <div className="text-xs font-semibold tracking-[0.2em] uppercase">
              EMZLoveLuxury
            </div>
            <div className="text-[10px] text-neutral-600">
              Bags &amp; Accessories
            </div>
          </div>

          <div className="text-center px-2">
            <div className="text-[11px] font-medium leading-snug">
              {displayTitle}
            </div>
            {shortBrandLine && (
              <div className="text-[10px] text-neutral-600 mt-0.5">
                {shortBrandLine}
              </div>
            )}
            {color && (
              <div className="text-[10px] text-neutral-600 mt-0.5">
                Color: {color}
              </div>
            )}
          </div>

          <div className="w-full flex items-center justify-between text-[11px] mt-1">
            <div className="font-mono text-[10px]">
              {item_number ? `SKU: ${item_number}` : ""}
            </div>
            <div className="font-semibold text-base">
              {formatCurrency(list_price) || ""}
            </div>
          </div>

          <div className="text-[9px] text-neutral-500 mt-1 text-center w-full">
            EMZLoveLuxury.com
          </div>
        </div>

        {/* BACK OF TAG */}
        <div className="relative border border-dotted border-neutral-400 rounded-md w-64 h-40 p-3 flex flex-col justify-between">
          <CornerMarks dotted />

          <div className="flex items-start justify-between text-[10px]">
            <div className="space-y-1">
              <TagRow label="Brand" value={brand} />
              <TagRow label="Model" value={model} />
              <TagRow label="Submodel" value={submodel} />
              <TagRow label="Variant" value={variant} />
              <TagRow label="Category" value={category} />
              <TagRow label="Color" value={color} />
            </div>
            <div className="w-20 h-20 border border-neutral-500 flex items-center justify-center text-[9px] text-center leading-tight">
              QR / BARCODE
              <br />
              (scan)
            </div>
          </div>

          <div className="mt-1 text-[9px] text-neutral-600">
            <div className="font-semibold">Notes:</div>
            <div className="border border-neutral-300 rounded-sm h-10 mt-0.5" />
          </div>

          <div className="text-[8px] text-neutral-500 text-right mt-1">
            /item/{decodeURIComponent(fullSlug)}
          </div>
        </div>
      </div>
    </div>
  );
}

function TagRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-1">
      <div className="text-neutral-500">{label}:</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function CornerMarks({ dotted = false }) {
  const base = dotted ? "border-dotted" : "border-solid";
  return (
    <>
      <div className={`absolute -top-2 left-2 w-4 border-t border-neutral-400 ${base}`} />
      <div className={`absolute -top-2 right-2 w-4 border-t border-neutral-400 ${base}`} />
      <div className={`absolute -bottom-2 left-2 w-4 border-b border-neutral-400 ${base}`} />
      <div className={`absolute -bottom-2 right-2 w-4 border-b border-neutral-400 ${base}`} />
    </>
  );
}
