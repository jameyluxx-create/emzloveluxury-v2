// app/item/[full_slug]/print-card/page.js

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Separator } from "@/components/ui/separator";

function formatCurrency(value) {
  if (value == null) return "";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return `$${num.toFixed(2)}`;
}

export const dynamic = "force-dynamic";

export default async function PrintCardPage({ params }) {
  const supabase = createClient();
  const fullSlug = decodeURIComponent(params.full_slug);

  const { data, error } = await supabase
    .from("items") // change if table name differs
    .select("*")
    .eq("full_slug", fullSlug)
    .maybeSingle();

  if (error || !data) {
    console.error("Print card load error:", error);
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
    material,
    size,
    condition_grade,
    acquisition_cost,
    list_price,
    acquisition_source,
    item_title,
    identity,
    seo,
    ai_quick_facts,
    search_keywords,
  } = item;

  const identityObj = identity || {};
  const seoObj = seo || {};
  const keywords = Array.isArray(search_keywords) ? search_keywords : [];

  const displayTitle =
    item_title ||
    seoObj.title ||
    [brand, model, submodel, variant].filter(Boolean).join(" ") ||
    item_number ||
    fullSlug;

  return (
    <div className="min-h-screen bg-white text-black p-8 print:p-4">
      {/* Top strip: logo + QR + meta */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-xl font-semibold tracking-[0.2em] uppercase">
            EMZLoveLuxury
          </div>
          <div className="text-xs uppercase tracking-wide text-neutral-600">
            Bags &amp; Accessories
          </div>
          {category && (
            <div className="mt-2 text-xs uppercase tracking-wide text-neutral-500">
              {category}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 text-xs">
          <div className="w-24 h-24 border border-black flex items-center justify-center text-[10px] text-center leading-tight">
            QR CODE
            <br />
            (scan for listing)
          </div>
          {item_number && (
            <div>
              <span className="font-semibold">SKU:&nbsp;</span>
              <span className="font-mono text-[11px]">{item_number}</span>
            </div>
          )}
          <div className="font-mono text-[10px]">
            /item/{decodeURIComponent(fullSlug)}
          </div>
        </div>
      </div>

      {/* Fold line indicator */}
      <div className="my-2">
        <div className="border-t border-dashed border-neutral-400" />
        <div className="text-[9px] text-neutral-500 text-center mt-1">
          Fold here (top half / bottom half)
        </div>
      </div>

      {/* Main content – 2 columns */}
      <div className="mt-4 grid grid-cols-[minmax(0,2.1fr)_minmax(0,1.4fr)] gap-6">
        {/* LEFT: Title + quick facts */}
        <div className="space-y-4">
          {/* Title block */}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight leading-snug">
              {displayTitle}
            </h1>
            <div className="mt-1 text-sm text-neutral-700">
              {brand && <span className="font-medium">{brand}</span>}
              {(model || submodel || variant) && (
                <>
                  {" "}
                  &middot;{" "}
                  {[model, submodel, variant].filter(Boolean).join(" ")}
                </>
              )}
              {color && (
                <>
                  {" "}
                  &middot; <span>{color}</span>
                </>
              )}
              {material && (
                <>
                  {" "}
                  &middot; <span>{material}</span>
                </>
              )}
            </div>
          </div>

          {/* Pricing + condition */}
          <div className="border border-neutral-300 rounded-md p-3 text-sm">
            <div className="flex justify-between mb-1.5">
              <span className="text-neutral-600">Target List Price</span>
              <span className="font-semibold text-lg">
                {formatCurrency(list_price) || "—"}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-neutral-600">Landed Cost</span>
              <span>{formatCurrency(acquisition_cost) || "—"}</span>
            </div>
            <div className="flex justify-between text-xs mt-0.5">
              <span className="text-neutral-600">Condition Grade</span>
              <span className="font-medium">
                {condition_grade ? `Grade ${condition_grade}` : "—"}
              </span>
            </div>
            <div className="flex justify-between text-xs mt-0.5">
              <span className="text-neutral-600">Source</span>
              <span>{acquisition_source || "—"}</span>
            </div>
          </div>

          {/* Quick facts */}
          <div className="border border-neutral-300 rounded-md p-3 text-sm min-h-[140px]">
            <div className="uppercase text-[11px] tracking-wide text-neutral-500 mb-1">
              Quick Facts
            </div>
            {ai_quick_facts ? (
              <pre className="whitespace-pre-wrap leading-relaxed font-sans text-[13px]">
                {ai_quick_facts}
              </pre>
            ) : (
              <p className="text-neutral-500 text-[13px]">
                Quick facts not generated yet. This section is perfect for live
                sale talking points.
              </p>
            )}
          </div>

          {/* Keywords line (for team / sorting) */}
          <div className="border border-dotted border-neutral-300 rounded-md p-2">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
              Search Keywords
            </div>
            <div className="text-[11px] leading-snug text-neutral-700">
              {keywords.length ? keywords.join(" · ") : "—"}
            </div>
          </div>
        </div>

        {/* RIGHT: Identity spec block */}
        <div className="space-y-4">
          <div className="border border-neutral-300 rounded-md p-3 text-sm">
            <div className="uppercase text-[11px] tracking-wide text-neutral-500 mb-2">
              Item Specs
            </div>
            <table className="w-full text-[12px] border-spacing-y-1">
              <tbody>
                <SpecRow label="Brand" value={identityObj.brand || brand} />
                <SpecRow label="Model / Line" value={identityObj.model || model} />
                <SpecRow
                  label="Submodel"
                  value={identityObj.submodel || submodel}
                />
                <SpecRow label="Variant" value={identityObj.variant || variant} />
                <SpecRow label="Category" value={identityObj.category || category} />
                <SpecRow label="Color" value={identityObj.color || color} />
                <SpecRow
                  label="Material"
                  value={identityObj.material || material}
                />
                <SpecRow label="Size" value={identityObj.size || size} />
                <SpecRow label="Era" value={identityObj.era} />
                <SpecRow label="Origin" value={identityObj.origin} />
              </tbody>
            </table>
            {identityObj.notes && (
              <div className="mt-2 text-[11px] text-neutral-700">
                <div className="uppercase tracking-wide text-neutral-500 text-[10px] mb-0.5">
                  Identity Notes
                </div>
                <div className="whitespace-pre-wrap">
                  {identityObj.notes}
                </div>
              </div>
            )}
          </div>

          {/* SEO snippet – optional but nice for reference */}
          <div className="border border-neutral-300 rounded-md p-3 text-[11px] space-y-1">
            <div className="uppercase text-[10px] tracking-wide text-neutral-500">
              SEO Snippet (internal reference)
            </div>
            <div>
              <span className="font-semibold">Title:&nbsp;</span>
              <span>{seoObj.title || "—"}</span>
            </div>
            <div className="text-neutral-600 whitespace-pre-wrap">
              {seoObj.description || "—"}
            </div>
          </div>

          {/* Footer / website */}
          <div className="mt-2 pt-2 border-t border-neutral-300 text-[10px] flex justify-between items-center">
            <div>
              <div className="font-semibold tracking-[0.18em] uppercase">
                EMZLoveLuxury.com
              </div>
              <div className="text-neutral-500">
                Curated pre-loved bags &amp; accessories
              </div>
            </div>
            <div className="text-right text-neutral-500">
              {item_number && (
                <div>
                  SKU: <span className="font-mono">{item_number}</span>
                </div>
              )}
              <div className="font-mono text-[9px]">
                {fullSlug}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SpecRow({ label, value }) {
  if (!value) return null;
  return (
    <tr className="align-top">
      <td className="pr-2 text-neutral-500 whitespace-nowrap">{label}</td>
      <td className="text-neutral-800">{value}</td>
    </tr>
  );
}
