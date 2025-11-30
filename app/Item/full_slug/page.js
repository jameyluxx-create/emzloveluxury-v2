// app/item/[full_slug]/page.js

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server"; // ⬅️ same helper as save route
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

function formatCurrency(value) {
  if (value == null) return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return `$${num.toFixed(2)}`;
}

function prettyLabel(key) {
  if (!key) return "";
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function ItemPage({ params }) {
  const supabase = createClient();
  const fullSlug = decodeURIComponent(params.full_slug);

  const { data, error } = await supabase
    .from("items") // ⬅️ change if your table name differs
    .select("*")
    .eq("full_slug", fullSlug)
    .maybeSingle();

  if (error) {
    console.error("Error loading item:", error);
    notFound();
  }

  if (!data) {
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
    acquisition_source,
    acquisition_cost,
    list_price,
    item_title,
    identity,
    seo,
    search_keywords,
    ai_quick_facts,
    notes,
    image_placeholder_url,
    created_at,
    updated_at,
  } = item;

  const displayTitle =
    item_title ||
    seo?.title ||
    [brand, model, submodel, variant].filter(Boolean).join(" ") ||
    item_number ||
    fullSlug;

  const identityObj = identity || {};
  const seoObj = seo || {};
  const keywords = Array.isArray(search_keywords) ? search_keywords : [];

  return (
    <div className="px-4 py-6 md:px-8 lg:px-12 space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            {displayTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            {brand && <span className="font-medium">{brand}</span>}
            {(model || submodel || variant) && (
              <>
                {" "}
                &middot;{" "}
                {[model, submodel, variant].filter(Boolean).join(" ")}
              </>
            )}
            {category && (
              <>
                {" "}
                &middot; <span className="uppercase text-xs">{category}</span>
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {item_number && (
              <span>
                <span className="font-semibold">SKU:</span> {item_number}
              </span>
            )}
            <span>
              <span className="font-semibold">Slug:</span> {fullSlug}
            </span>
            {condition_grade && (
              <Badge variant="outline">Grade {condition_grade}</Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Step 6 will wire these to real print routes */}
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <a href={`/item/${encodeURIComponent(fullSlug)}/print-card`} target="_blank">
              Print Card
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <a href={`/item/${encodeURIComponent(fullSlug)}/print-tag`} target="_blank">
              Print Tag
            </a>
          </Button>
        </div>
      </div>

      <Separator />

      <div className="grid gap-6 lg:gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)]">
        {/* LEFT: IMAGE + QUICK FACTS + NOTES */}
        <div className="space-y-4">
          {/* IMAGE / PLACEHOLDER */}
          <Card>
            <CardContent className="pt-4">
              <div className="aspect-[4/3] w-full rounded-xl border bg-muted flex items-center justify-center overflow-hidden">
                {image_placeholder_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image_placeholder_url}
                    alt={displayTitle}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="text-xs text-muted-foreground text-center px-6">
                    Image placeholder not set. Add{" "}
                    <span className="font-mono text-[11px]">
                      image_placeholder_url
                    </span>{" "}
                    in intake to show a preview here.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* PRICING + CONDITION */}
          <Card>
            <CardHeader>
              <CardTitle>Pricing &amp; Condition</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Landed Cost</span>
                <span className="font-medium">
                  {formatCurrency(acquisition_cost)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Target List Price</span>
                <span className="font-medium">
                  {formatCurrency(list_price)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <span className="font-medium">
                  {acquisition_source || "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Condition Grade</span>
                <span className="font-medium">
                  {condition_grade || "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* AI QUICK FACTS */}
          <Card>
            <CardHeader>
              <CardTitle>AI Quick Facts</CardTitle>
            </CardHeader>
            <CardContent>
              {ai_quick_facts ? (
                <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
                  {ai_quick_facts}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No AI Quick Facts saved yet. Run the AI Curator from the
                  intake page to auto-generate show notes and print copy.
                </p>
              )}
            </CardContent>
          </Card>

          {/* INTERNAL NOTES */}
          <Card>
            <CardHeader>
              <CardTitle>Internal Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {notes ? (
                <p className="text-sm whitespace-pre-wrap">{notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No internal notes recorded. Use this for restoration details,
                  defects, or sourcing notes.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: IDENTITY + SEO + KEYWORDS + META */}
        <div className="space-y-4">
          {/* IDENTITY */}
          <Card>
            <CardHeader>
              <CardTitle>Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-muted-foreground">Brand</span>
                <span>{identityObj.brand || brand || "—"}</span>

                <span className="text-muted-foreground">Model</span>
                <span>{identityObj.model || model || "—"}</span>

                <span className="text-muted-foreground">Submodel</span>
                <span>{identityObj.submodel || submodel || "—"}</span>

                <span className="text-muted-foreground">Variant</span>
                <span>{identityObj.variant || variant || "—"}</span>

                <span className="text-muted-foreground">Category</span>
                <span>{identityObj.category || category || "—"}</span>

                <span className="text-muted-foreground">Color</span>
                <span>{identityObj.color || color || "—"}</span>

                <span className="text-muted-foreground">Material</span>
                <span>{identityObj.material || material || "—"}</span>

                <span className="text-muted-foreground">Size</span>
                <span>{identityObj.size || size || "—"}</span>

                <span className="text-muted-foreground">Era</span>
                <span>{identityObj.era || "—"}</span>

                <span className="text-muted-foreground">Origin</span>
                <span>{identityObj.origin || "—"}</span>
              </div>

              {identityObj.notes && (
                <div className="mt-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Identity Notes
                  </p>
                  <p className="text-sm whitespace-pre-wrap">
                    {identityObj.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* SEARCH KEYWORDS */}
          <Card>
            <CardHeader>
              <CardTitle>Search Keywords</CardTitle>
            </CardHeader>
            <CardContent>
              {keywords.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {keywords.map((kw, idx) => (
                    <Badge
                      key={`${kw}-${idx}`}
                      variant="outline"
                      className="text-[11px] font-normal"
                    >
                      {kw}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No search keywords yet. The AI Curator will generate
                  search_keywords[] for internal and external search.
                </p>
              )}
            </CardContent>
          </Card>

          {/* SEO OVERVIEW */}
          <Card>
            <CardHeader>
              <CardTitle>SEO Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  SEO Title
                </p>
                <p>{seoObj.title || "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  SEO Description
                </p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {seoObj.description || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  H1
                </p>
                <p>{seoObj.h1 || "—"}</p>
              </div>
              <Separator className="my-2" />
              <div className="text-xs text-muted-foreground space-y-1">
                <div>
                  <span className="font-semibold">Meta Keywords:</span>{" "}
                  {seoObj.meta?.keywords || "—"}
                </div>
                <div>
                  <span className="font-semibold">OG Title:</span>{" "}
                  {seoObj.meta?.og_title || "—"}
                </div>
                <div>
                  <span className="font-semibold">OG Description:</span>{" "}
                  {seoObj.meta?.og_description || "—"}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* RAW JSON DEBUG (optional but handy) */}
          <Card>
            <CardHeader>
              <CardTitle>Debug / JSON</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Identity JSON
                </p>
                <pre className="max-h-40 overflow-auto rounded bg-muted/60 p-2 text-[11px] font-mono">
                  {JSON.stringify(identityObj, null, 2)}
                </pre>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  SEO JSON
                </p>
                <pre className="max-h-40 overflow-auto rounded bg-muted/60 p-2 text-[11px] font-mono">
                  {JSON.stringify(seoObj, null, 2)}
                </pre>
              </div>
              <div className="text-[11px] text-muted-foreground">
                <p>
                  Created:{" "}
                  {created_at
                    ? new Date(created_at).toLocaleString()
                    : "—"}
                </p>
                <p>
                  Updated:{" "}
                  {updated_at
                    ? new Date(updated_at).toLocaleString()
                    : "—"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
