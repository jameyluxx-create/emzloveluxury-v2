"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

import { toast } from "sonner";
import { intakeSchema } from "@/lib/validation/intake";

// -------- SAFE FETCH WITH DEBUGGING (PURE JS) --------
async function safeFetch(url, payload) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });

    const text = await res.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`Invalid JSON from ${url}: ${text}`);
    }

    if (!res.ok) {
      throw new Error(data?.error || `Request failed (${res.status})`);
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;
  } catch (err) {
    console.error("safeFetch error for", url, err);
    if (typeof window !== "undefined") {
      alert(`Error calling ${url}: ${err.message || "Unknown error"}`);
    }
    throw err;
  }
}

export default function IntakePage() {
  const router = useRouter();

  const [baseSlug, setBaseSlug] = useState("");
  const [fullSlug, setFullSlug] = useState("");

  const [itemNumber, setItemNumber] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState("intake");
  const [grade, setGrade] = useState("B");

  const [identity, setIdentity] = useState({
    brand: "",
    model: "",
    submodel: "",
    variant: "",
    material: "",
    color: "",
    pattern: "",
    hardware: "",
    gender: "",
    size: "",
    era: "",
    origin: "",
    notes: "",
  });

  const [seo, setSeo] = useState({
    title: "",
    subtitle: "",
    bullets: [],
    description: "",
  });

  const [searchKeywords, setSearchKeywords] = useState([]);

  const [notes, setNotes] = useState("");
  const [imagePlaceholderUrl, setImagePlaceholderUrl] = useState("");

  const [isGeneratingSku, setIsGeneratingSku] = useState(false);
  const [isCallingAi, setIsCallingAi] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  function computeSlug(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .trim();
  }

  function updateBaseSlug() {
    const raw = `${brand} ${model}`.trim();
    setBaseSlug(raw ? computeSlug(raw) : "");
  }

  function updateFullSlug() {
    if (!baseSlug || !itemNumber) return;
    setFullSlug(`${baseSlug}-${itemNumber}`);
  }

  useEffect(() => {
    updateBaseSlug();
  }, [brand, model]);

  useEffect(() => {
    updateFullSlug();
  }, [baseSlug, itemNumber]);

  // -------- HANDLERS --------

  async function handleGenerateSku() {
    try {
      setIsGeneratingSku(true);

      const result = await safeFetch("/api/intake/generate-sku", {
        brand,
        model,
      });

      if (!result?.itemNumber) throw new Error("Invalid SKU response");
      setItemNumber(result.itemNumber);
      toast.success("SKU generated");
    } catch (err) {
      toast.error(err.message || "Failed to generate SKU");
    } finally {
      setIsGeneratingSku(false);
    }
  }

  async function handleAi() {
    try {
      setIsCallingAi(true);

      const payload = {
        brand,
        model,
        identity,
        notes,
        seo,
        searchKeywords,
      };

      const result = await safeFetch("/api/intake/ai", payload);

      if (result.identity)
        setIdentity((prev) => ({ ...prev, ...result.identity }));
      if (result.seo) setSeo((prev) => ({ ...prev, ...result.seo }));
      if (result.searchKeywords) setSearchKeywords(result.searchKeywords);

      toast.success("AI data generated");
    } catch (err) {
      toast.error(err.message || "AI generation failed");
    } finally {
      setIsCallingAi(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    try {
      setIsSaving(true);

      const payload = {
        itemNumber,
        slug: baseSlug,
        full_slug: fullSlug,
        brand,
        model,
        status,
        grade,
        identity,
        seo,
        search_keywords: searchKeywords,
        notes,
        imagePlaceholderUrl,
      };

      const parsed = intakeSchema.parse(payload);

      const result = await safeFetch("/api/intake/save", parsed);

      if (!result?.full_slug) throw new Error("Invalid save response");
      toast.success("Saved");
      router.push(`/item/${result.full_slug}`);
    } catch (err) {
      toast.error(err.message || "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  // -------- RENDER --------

  const hasSummary = Boolean(brand || model || itemNumber);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto max-w-4xl py-8 pb-28">
        {/* Page header + quick summary */}
        <header className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                Intake
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                EMZLove Luxury · fast intake, clean data, perfect listings.
              </p>
            </div>

            {hasSummary && (
              <div className="hidden rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-right text-xs md:block">
                <div className="font-semibold text-amber-900">
                  {brand || "—"} {model || ""}
                </div>
                <div className="mt-0.5 text-amber-800">
                  SKU: {itemNumber || "not generated"}
                </div>
                <div className="mt-0.5 text-amber-700">
                  Grade {grade} · {status}
                </div>
              </div>
            )}
          </div>
        </header>

        <form onSubmit={handleSave} className="space-y-6">
          {/* ITEM BASICS */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900">
                Item Basics
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
                  Brand
                </label>
                <Input
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g. Louis Vuitton"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
                  Model
                </label>
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. Neverfull MM"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
                  Grade
                </label>
                <select
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                >
                  <option value="A">A (Excellent)</option>
                  <option value="B">B (Good)</option>
                  <option value="C">C (Fair)</option>
                  <option value="D">D (Project)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
                  Status
                </label>
                <select
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="intake">Intake</option>
                  <option value="ready">Ready</option>
                  <option value="listed">Listed</option>
                  <option value="sold">Sold</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
                  Item Number (SKU)
                </label>
                <Input
                  value={itemNumber}
                  onChange={(e) => setItemNumber(e.target.value)}
                  placeholder="Generated or manual"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Base slug:{" "}
                  <code className="rounded bg-slate-100 px-1 py-0.5">
                    {baseSlug || "-"}
                  </code>{" "}
                  · Full slug:{" "}
                  <code className="rounded bg-slate-100 px-1 py-0.5">
                    {fullSlug || "-"}
                  </code>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* IDENTITY */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900">
                Identity (Attributes)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="Submodel"
                placeholder="e.g. Monogram Canvas"
                value={identity.submodel}
                onChange={(v) => setIdentity({ ...identity, submodel: v })}
              />
              <Field
                label="Variant"
                placeholder="PM / MM / GM"
                value={identity.variant}
                onChange={(v) => setIdentity({ ...identity, variant: v })}
              />
              <Field
                label="Material"
                placeholder="Canvas / Leather / Nylon etc."
                value={identity.material}
                onChange={(v) => setIdentity({ ...identity, material: v })}
              />
              <Field
                label="Color"
                value={identity.color}
                onChange={(v) => setIdentity({ ...identity, color: v })}
              />
              <Field
                label="Pattern"
                placeholder="Monogram / Damier / Solid etc."
                value={identity.pattern}
                onChange={(v) => setIdentity({ ...identity, pattern: v })}
              />
              <Field
                label="Hardware"
                placeholder="Gold / Silver / Brass etc."
                value={identity.hardware}
                onChange={(v) => setIdentity({ ...identity, hardware: v })}
              />
              <Field
                label="Gender"
                placeholder="Women's / Men's / Unisex"
                value={identity.gender}
                onChange={(v) => setIdentity({ ...identity, gender: v })}
              />
              <Field
                label="Size"
                placeholder="Dimensions or general sizing"
                value={identity.size}
                onChange={(v) => setIdentity({ ...identity, size: v })}
              />
              <Field
                label="Era"
                placeholder="Vintage / Y2K / Modern"
                value={identity.era}
                onChange={(v) => setIdentity({ ...identity, era: v })}
              />
              <Field
                label="Origin"
                placeholder="Country of origin"
                value={identity.origin}
                onChange={(v) => setIdentity({ ...identity, origin: v })}
              />
            </CardContent>
          </Card>

          {/* NOTES */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900">
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
                Internal notes
              </label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Internal notes for cleaning, restoration, issues, etc."
                className="resize-none"
              />
            </CardContent>
          </Card>

          {/* SEO / LISTING DETAILS */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900">
                SEO / Listing Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <LabelSmall>SEO Title</LabelSmall>
                <Input
                  value={seo.title}
                  onChange={(e) => setSeo({ ...seo, title: e.target.value })}
                  placeholder="AI will auto-generate"
                />
              </div>

              <div>
                <LabelSmall>SEO Subtitle</LabelSmall>
                <Input
                  value={seo.subtitle}
                  onChange={(e) =>
                    setSeo({ ...seo, subtitle: e.target.value })
                  }
                />
              </div>

              <div>
                <LabelSmall>SEO Bullets</LabelSmall>
                <Textarea
                  value={seo.bullets.join("\n")}
                  onChange={(e) =>
                    setSeo({
                      ...seo,
                      bullets: e.target.value.split("\n"),
                    })
                  }
                  rows={4}
                  placeholder="Each line = a bullet point"
                  className="resize-none"
                />
              </div>

              <div>
                <LabelSmall>SEO Description</LabelSmall>
                <Textarea
                  value={seo.description}
                  onChange={(e) =>
                    setSeo({ ...seo, description: e.target.value })
                  }
                  rows={4}
                  className="resize-none"
                />
              </div>
            </CardContent>
          </Card>

          {/* SEARCH KEYWORDS */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900">
                Search Keywords
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LabelSmall>Keywords</LabelSmall>
              <Textarea
                value={searchKeywords.join(", ")}
                onChange={(e) =>
                  setSearchKeywords(
                    e.target.value
                      .split(",")
                      .map((k) => k.trim())
                      .filter(Boolean)
                  )
                }
                rows={3}
                placeholder="comma, separated, keywords"
                className="resize-none"
              />
            </CardContent>
          </Card>

          {/* IMAGE PLACEHOLDER */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900">
                Image Placeholder
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LabelSmall>Image URL</LabelSmall>
              <Input
                value={imagePlaceholderUrl}
                onChange={(e) => setImagePlaceholderUrl(e.target.value)}
                placeholder="Optional image URL or leave blank"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Upload pipeline coming next – for now you can paste a hosted
                image URL or leave this blank.
              </p>
            </CardContent>
          </Card>

          {/* Sticky action bar */}
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
            <div className="pointer-events-auto w-full max-w-4xl rounded-2xl border border-slate-200 bg-slate-50/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-slate-50/80">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-600">
                  {brand || model ? (
                    <>
                      <span className="font-semibold text-slate-900">
                        {brand || "—"} {model || ""}
                      </span>
                      {itemNumber && (
                        <>
                          {" "}
                          · <span>SKU {itemNumber}</span>
                        </>
                      )}
                    </>
                  ) : (
                    "Start with brand + model, then generate SKU & AI details."
                  )}
                </div>
                <div className="hidden text-[11px] text-slate-500 md:block">
                  All changes save to Supabase · EMZLoveLuxury
                </div>
              </div>

              <div className="flex flex-col gap-2 md:flex-row">
                <Button
                  type="button"
                  disabled={isGeneratingSku}
                  onClick={handleGenerateSku}
                  className="flex-1 border border-slate-900 bg-slate-900 text-xs font-semibold tracking-wide text-white hover:bg-slate-800"
                >
                  {isGeneratingSku ? "Generating SKU…" : "Generate SKU"}
                </Button>

                <Button
                  type="button"
                  disabled={isCallingAi}
                  onClick={handleAi}
                  className="flex-1 border border-slate-900 bg-slate-900 text-xs font-semibold tracking-wide text-white hover:bg-slate-800"
                >
                  {isCallingAi ? "AI is thinking…" : "Run AI"}
                </Button>

                <Button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 bg-emerald-600 text-xs font-semibold tracking-wide text-white hover:bg-emerald-700"
                >
                  {isSaving ? "Saving…" : "Save Item"}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Small helper label component */
function LabelSmall({ children }) {
  return (
    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
      {children}
    </label>
  );
}

/** Reusable field for the identity grid */
function Field({ label, placeholder, value, onChange }) {
  return (
    <div>
      <LabelSmall>{label}</LabelSmall>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
