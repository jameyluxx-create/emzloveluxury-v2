"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
// If you have shadcn toast:
import { useToast } from "@/components/ui/use-toast";

function toSlug(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export default function IntakePage() {
  const router = useRouter();
  const { toast } = useToast ? useToast() : { toast: () => {} };
  const [isPending, startTransition] = useTransition();

  // Core item fields
  const [itemNumber, setItemNumber] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [submodel, setSubmodel] = useState("");
  const [variant, setVariant] = useState("");
  const [category, setCategory] = useState("");
  const [color, setColor] = useState("");
  const [material, setMaterial] = useState("");
  const [size, setSize] = useState("");
  const [conditionGrade, setConditionGrade] = useState("");
  const [acquisitionSource, setAcquisitionSource] = useState("");
  const [acquisitionCost, setAcquisitionCost] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [itemTitle, setItemTitle] = useState("");

  // Slugs & system
  const [slug, setSlug] = useState("");
  const [fullSlug, setFullSlug] = useState("");

  // AI / SEO / Identity
  const [aiQuickFacts, setAiQuickFacts] = useState("");
  const [seoRaw, setSeoRaw] = useState('{\n  "title": "",\n  "description": "",\n  "h1": "",\n  "meta": {}\n}');
  const [identityRaw, setIdentityRaw] = useState(
    '{\n  "brand": "",\n  "model": "",\n  "submodel": "",\n  "variant": "",\n  "category": "",\n  "color": "",\n  "material": "",\n  "size": "",\n  "era": "",\n  "origin": "",\n  "notes": ""\n}'
  );
  const [searchKeywordsRaw, setSearchKeywordsRaw] = useState("");

  // Misc
  const [notes, setNotes] = useState("");
  const [imagePlaceholderUrl, setImagePlaceholderUrl] = useState("");

  const [isGeneratingSku, setIsGeneratingSku] = useState(false);
  const [isCallingAi, setIsCallingAi] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Helpers
  function getBaseSlug() {
    if (itemTitle) return toSlug(itemTitle);
    if (brand || model) return toSlug(`${brand} ${model} ${submodel}`.trim());
    return "";
  }

  function showToast(opts) {
    if (!toast) return;
    toast(opts);
  }

  async function handleGenerateSku() {
    try {
      setIsGeneratingSku(true);

      const res = await fetch("/api/intake/generate-sku", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_number: itemNumber || null,
          brand,
          category,
          model,
          submodel,
          variant,
        }),
      });

      if (!res.ok) {
        throw new Error(`Generate SKU failed: ${res.status}`);
      }

      const data = await res.json();
      // Expecting something like:
      // { item_number, slug, full_slug }
      if (data.item_number) setItemNumber(data.item_number);
      if (data.slug) setSlug(data.slug);
      if (data.full_slug) setFullSlug(data.full_slug);

      showToast({
        title: "SKU generated",
        description: "Item number and slugs updated.",
      });
    } catch (err) {
      console.error(err);
      showToast({
        title: "Error generating SKU",
        description: err.message ?? "Check console for details.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingSku(false);
    }
  }

  async function handleAiCurate() {
    try {
      setIsCallingAi(true);

      // Try to parse existing identity/seo if they’re valid JSON
      let existingIdentity = null;
      let existingSeo = null;
      try {
        existingIdentity = JSON.parse(identityRaw);
      } catch {
        existingIdentity = null;
      }
      try {
        existingSeo = JSON.parse(seoRaw);
      } catch {
        existingSeo = null;
      }

      const res = await fetch("/api/intake/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          model,
          submodel,
          variant,
          category,
          color,
          material,
          size,
          condition_grade: conditionGrade,
          notes,
          existingIdentity,
          existingSeo,
        }),
      });

      if (!res.ok) {
        throw new Error(`AI curator failed: ${res.status}`);
      }

      // Expected response shape (adjust to match your route implementation)
      // {
      //   identity: {...},
      //   seo: {...},
      //   search_keywords: ["lv", "monogram", ...],
      //   quick_facts: "…",
      //   title?: "Optional AI title"
      // }
      const data = await res.json();

      if (data.identity) {
        setIdentityRaw(JSON.stringify(data.identity, null, 2));
      }
      if (data.seo) {
        setSeoRaw(JSON.stringify(data.seo, null, 2));
        if (!itemTitle && data.seo.title) {
          setItemTitle(data.seo.title);
          const baseSlug = toSlug(data.seo.title);
          if (!slug) setSlug(baseSlug);
          if (!fullSlug) setFullSlug(baseSlug);
        }
      }
      if (data.search_keywords) {
        setSearchKeywordsRaw(data.search_keywords.join(", "));
      }
      if (data.quick_facts) {
        setAiQuickFacts(data.quick_facts);
      }

      showToast({
        title: "AI Curator complete",
        description: "Identity, SEO, and keywords updated.",
      });
    } catch (err) {
      console.error(err);
      showToast({
        title: "AI Curator error",
        description: err.message ?? "Check console for details.",
        variant: "destructive",
      });
    } finally {
      setIsCallingAi(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    try {
      setIsSaving(true);

      // Parse identity
      let identity;
      try {
        identity = JSON.parse(identityRaw || "{}");
      } catch (err) {
        showToast({
          title: "Invalid Identity JSON",
          description: "Please fix the identity block before saving.",
          variant: "destructive",
        });
        return;
      }

      // Parse SEO
      let seo;
      try {
        seo = JSON.parse(seoRaw || "{}");
      } catch (err) {
        showToast({
          title: "Invalid SEO JSON",
          description: "Please fix the SEO block before saving.",
          variant: "destructive",
        });
        return;
      }

      // Parse search keywords
      const searchKeywords = (searchKeywordsRaw || "")
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        item_number: itemNumber || null,
        brand,
        model,
        submodel,
        variant,
        category,
        color,
        material,
        size,
        condition_grade: conditionGrade,
        acquisition_source: acquisitionSource,
        acquisition_cost: acquisitionCost ? Number(acquisitionCost) : null,
        list_price: listPrice ? Number(listPrice) : null,
        item_title: itemTitle,
        slug: slug || getBaseSlug(),
        full_slug: fullSlug || getBaseSlug(),
        identity,
        seo,
        search_keywords: searchKeywords,
        ai_quick_facts: aiQuickFacts,
        notes,
        image_placeholder_url: imagePlaceholderUrl || null,
      };

      const res = await fetch("/api/intake/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Save failed: ${res.status}`);
      }

      const data = await res.json();
      // Expect: { full_slug, id, ... } from API
      const finalFullSlug = data.full_slug || payload.full_slug;

      showToast({
        title: "Item saved",
        description: finalFullSlug
          ? `Saved as ${finalFullSlug}`
          : "Item saved successfully.",
      });

      if (finalFullSlug) {
        startTransition(() => {
          router.push(`/item/${finalFullSlug}`);
        });
      }
    } catch (err) {
      console.error(err);
      showToast({
        title: "Save error",
        description: err.message ?? "Check console for details.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleAutoSlugFromTitle() {
    const base = getBaseSlug();
    if (!base) return;
    if (!slug) setSlug(base);
    if (!fullSlug) setFullSlug(base);
    showToast({
      title: "Slugs updated",
      description: base,
    });
  }

  const disabled = isPending || isSaving;

  return (
    <div className="px-4 py-6 md:px-8 lg:px-12 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Intake &amp; AI Curator
          </h1>
          <p className="text-sm text-muted-foreground">
            Step 1 of 6 — create or update an item, then let AI help with
            identity, SEO, and print-ready data.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAutoSlugFromTitle}
          >
            Auto-slug from title
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleGenerateSku}
            disabled={isGeneratingSku}
          >
            {isGeneratingSku ? "Generating…" : "Generate SKU"}
          </Button>
        </div>
      </div>

      <Separator />

      <form
        onSubmit={handleSave}
        className="grid gap-4 md:gap-6 lg:gap-8 md:grid-cols-3"
      >
        {/* LEFT: Core item details */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Core Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="itemNumber">Item Number (SKU)</Label>
                  <Input
                    id="itemNumber"
                    value={itemNumber}
                    onChange={(e) => setItemNumber(e.target.value)}
                    placeholder="Auto or manual"
                  />
                </div>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={category}
                    onValueChange={(val) => setCategory(val)}
                  >
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bag">Bag</SelectItem>
                      <SelectItem value="wallet">Wallet</SelectItem>
                      <SelectItem value="slg">SLG / Accessory</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="brand">Brand</Label>
                <Input
                  id="brand"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Louis Vuitton, Gucci, Coach…"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="model">Model / Line</Label>
                  <Input
                    id="model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="Neverfull, Zippy, etc."
                  />
                </div>
                <div>
                  <Label htmlFor="submodel">Submodel</Label>
                  <Input
                    id="submodel"
                    value={submodel}
                    onChange={(e) => setSubmodel(e.target.value)}
                    placeholder="MM, PM, etc."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="variant">Variant</Label>
                  <Input
                    id="variant"
                    value={variant}
                    onChange={(e) => setVariant(e.target.value)}
                    placeholder="Monogram, Damier, etc."
                  />
                </div>
                <div>
                  <Label htmlFor="color">Color</Label>
                  <Input
                    id="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="Brown / Gold, Black, etc."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="material">Material</Label>
                  <Input
                    id="material"
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                    placeholder="Coated canvas, leather…"
                  />
                </div>
                <div>
                  <Label htmlFor="size">Size / Dimensions</Label>
                  <Input
                    id="size"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    placeholder="Approx. size"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Condition Grade</Label>
                  <Select
                    value={conditionGrade}
                    onValueChange={(val) => setConditionGrade(val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select grade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">A</SelectItem>
                      <SelectItem value="B">B</SelectItem>
                      <SelectItem value="C">C</SelectItem>
                      <SelectItem value="D">D</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="acquisitionSource">Source</Label>
                  <Input
                    id="acquisitionSource"
                    value={acquisitionSource}
                    onChange={(e) => setAcquisitionSource(e.target.value)}
                    placeholder="Buyee, 2nd Street, etc."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="acquisitionCost">Cost (landed)</Label>
                  <Input
                    id="acquisitionCost"
                    type="number"
                    step="0.01"
                    value={acquisitionCost}
                    onChange={(e) => setAcquisitionCost(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label htmlFor="listPrice">Target List Price</Label>
                  <Input
                    id="listPrice"
                    type="number"
                    step="0.01"
                    value={listPrice}
                    onChange={(e) => setListPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Title &amp; Slugs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="itemTitle">Listing Title</Label>
                <Input
                  id="itemTitle"
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  placeholder="AI or manual listing title"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="slug">Slug</Label>
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder={getBaseSlug() || "auto-from-title"}
                  />
                </div>
                <div>
                  <Label htmlFor="fullSlug">Full Slug</Label>
                  <Input
                    id="fullSlug"
                    value={fullSlug}
                    onChange={(e) => setFullSlug(e.target.value)}
                    placeholder={getBaseSlug() || "auto-from-title"}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* MIDDLE: AI, SEO, Identity */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>AI Curator</CardTitle>
              <Button
                type="button"
                size="sm"
                onClick={handleAiCurate}
                disabled={isCallingAi}
              >
                {isCallingAi ? "Curating…" : "Run AI Curator"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="aiQuickFacts">AI Quick Facts</Label>
                <Textarea
                  id="aiQuickFacts"
                  value={aiQuickFacts}
                  onChange={(e) => setAiQuickFacts(e.target.value)}
                  rows={4}
                  placeholder="Short bullets or paragraph for print card, Whatnot, etc."
                />
              </div>

              <div>
                <Label htmlFor="searchKeywords">
                  Search Keywords (comma or line separated)
                </Label>
                <Textarea
                  id="searchKeywords"
                  value={searchKeywordsRaw}
                  onChange={(e) => setSearchKeywordsRaw(e.target.value)}
                  rows={3}
                  placeholder="lv, monogram, brown, tote, shoulder bag…"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SEO JSON (seo jsonb)</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={seoRaw}
                onChange={(e) => setSeoRaw(e.target.value)}
                rows={10}
                className="font-mono text-xs"
              />
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Identity + Notes + System */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Identity JSON (identity jsonb)</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={identityRaw}
                onChange={(e) => setIdentityRaw(e.target.value)}
                rows={12}
                className="font-mono text-xs"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes &amp; System</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="imagePlaceholderUrl">
                  Image Placeholder URL
                </Label>
                <Input
                  id="imagePlaceholderUrl"
                  value={imagePlaceholderUrl}
                  onChange={(e) => setImagePlaceholderUrl(e.target.value)}
                  placeholder="Optional placeholder image URL"
                />
              </div>
              <div>
                <Label htmlFor="notes">Internal Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Restoration notes, defects, internal comments…"
                />
              </div>

              <Separator />

              <div className="flex flex-col gap-2">
                <Button
                  type="submit"
                  disabled={disabled}
                  className="w-full"
                >
                  {isSaving ? "Saving…" : "Save Item"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Saving will write to Supabase (including identity/seo JSONB
                  and search_keywords[]) and then redirect you to{" "}
                  <code>/item/[full_slug]</code> when available.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
