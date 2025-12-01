"use client";

import { useState, useEffect, useCallback } from "react";
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

// Upload + Preview components (Message 3 provides code)
import MainImageUploader from "@/components/upload/MainImageUploader";
import DetailImageUploader from "@/components/upload/DetailImageUploader";
import ImagePreviewGrid from "@/components/upload/ImagePreviewGrid";

// Safe fetch wrapper
async function safeFetch(url, options) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Request failed");
    }
    const data = await res.json();
    if (data?.error) throw new Error(data.error);
    return data;
  } catch (err) {
    throw new Error(err.message || "Network error");
  }
}

export default function IntakePage() {
  const router = useRouter();

  // ---------------------------
  //  CORE STATES
  // ---------------------------

  // BRAND / MODEL
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");

  // SKU
  const [itemNumber, setItemNumber] = useState("");

  // STATUS, GRADE, NOTES
  const [status, setStatus] = useState("intake");
  const [grade, setGrade] = useState("B");
  const [notes, setNotes] = useState("");

  // IDENTITY (AI fills, user can override)
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

  // SEO / AI Data
  const [seo, setSeo] = useState({
    title: "",
    subtitle: "",
    bullets: [],
    description: "",
  });

  const [searchKeywords, setSearchKeywords] = useState([]);

  // ---------------------------
  //  PHOTOS
  // ---------------------------

  // Main image (single)
  const [mainImage, setMainImage] = useState(null); // { url, file }

  // Detail images (array of {url, file})
  const [detailImages, setDetailImages] = useState([]);

  // ---------------------------
  //  CONTROL STATES
  // ---------------------------
  const [isGeneratingSku, setIsGeneratingSku] = useState(false);
  const [isCallingAi, setIsCallingAi] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ---------------------------
  //  SLUG BUILDING
  // ---------------------------

  const [baseSlug, setBaseSlug] = useState("");
  const [fullSlug, setFullSlug] = useState("");

  function computeSlug(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .trim();
  }

  useEffect(() => {
    const raw = `${brand} ${model}`.trim();
    const s = raw ? computeSlug(raw) : "";
    setBaseSlug(s);
  }, [brand, model]);

  useEffect(() => {
    if (!baseSlug || !itemNumber) return;
    setFullSlug(`${baseSlug}-${itemNumber}`);
  }, [baseSlug, itemNumber]);

  // ---------------------------
  //  AI CALL
  // ---------------------------

  async function handleAi() {
    try {
      if (!mainImage) {
        toast.error("Please upload a main photo first.");
        return;
      }

      setIsCallingAi(true);

      const imageUrls = [
        mainImage?.url,
        ...detailImages.map((img) => img.url),
      ].filter(Boolean);

      const payload = {
        images: imageUrls,
        brand,
        model,
        identity,
        notes,
        seo,
        searchKeywords,
      };

      const result = await safeFetch("/api/intake/ai", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (result.identity)
        setIdentity((prev) => ({ ...prev, ...result.identity }));
      if (result.seo)
        setSeo((prev) => ({ ...prev, ...result.seo }));
      if (result.search_keywords)
        setSearchKeywords(result.search_keywords);

      toast.success("AI updated fields.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsCallingAi(false);
    }
  }

  // ---------------------------
  //  SKU GENERATION
  // ---------------------------

  async function handleGenerateSku() {
    try {
      if (!brand || !model) {
        toast.error("Brand & Model required for SKU.");
        return;
      }

      setIsGeneratingSku(true);

      const result = await safeFetch("/api/intake/generate-sku", {
        method: "POST",
        body: JSON.stringify({ brand, model }),
      });

      if (!result?.itemNumber)
        throw new Error("Invalid SKU response");

      setItemNumber(result.itemNumber);
      toast.success("SKU generated.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsGeneratingSku(false);
    }
  }

  // ---------------------------
  //  FINAL SAVE
  // ---------------------------

  async function handleSave(e) {
    e.preventDefault();

    try {
      if (!mainImage) {
        toast.error("Main photo is required.");
        return;
      }

      setIsSaving(true);

      const images = {
        main: mainImage?.url || null,
        details: detailImages.map((img) => img.url),
      };

      const payload = {
        itemNumber,
        brand,
        model,
        slug: baseSlug,
        full_slug: fullSlug,
        grade,
        status,
        identity,
        seo,
        search_keywords: searchKeywords,
        notes,
        images,
      };

      intakeSchema.parse(payload);

      const result = await safeFetch("/api/intake/save", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!result?.full_slug)
        throw new Error("Invalid response from save.");

      toast.success("Saved!");
      router.push(`/item/${result.full_slug}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  // ---------------------------
  //  RENDER
  // ---------------------------

  return (
    <div className="container mx-auto py-10 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Intake</h1>

      <form onSubmit={handleSave} className="space-y-10">

        {/* ---------------- PHOTO SECTION ---------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Photos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <MainImageUploader
              mainImage={mainImage}
              setMainImage={setMainImage}
            />

            <DetailImageUploader
              detailImages={detailImages}
              setDetailImages={setDetailImages}
            />

            <ImagePreviewGrid
              mainImage={mainImage}
              detailImages={detailImages}
              setDetailImages={setDetailImages}
              setMainImage={setMainImage}
            />

          </CardContent>
        </Card>

        {/* ---------------- ITEM BASICS ---------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Item Basics</CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <div>
              <label className="text-sm font-medium">Brand</label>
              <Input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Louis Vuitton"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium">Model</label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Neverfull MM"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium">Grade</label>
              <select
                className="border rounded px-3 py-2 w-full"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
              >
                <option value="S">S (Brand New)</option>
                <option value="SA">SA (Unused)</option>
                <option value="A">A (Excellent)</option>
                <option value="AB">AB (Good)</option>
                <option value="B">B (Average)</option>
                <option value="C">C (Damaged)</option>
                <option value="U">U (Contemporary Brand)</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Status</label>
              <select
                className="border rounded px-3 py-2 w-full"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="intake">Intake</option>
                <option value="ready">Ready</option>
                <option value="listed">Listed</option>
                <option value="sold">Sold</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">SKU</label>
              <Input
                value={itemNumber}
                onChange={(e) => setItemNumber(e.target.value)}
                placeholder="Generated or manual"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Base slug: <code>{baseSlug || "-"}</code><br />
                Full slug: <code>{fullSlug || "-"}</code>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ---------------- IDENTITY ---------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Identity (Attributes)</CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <div>
              <label className="text-sm font-medium">Submodel</label>
              <Input
                value={identity.submodel}
                onChange={(e) =>
                  setIdentity({ ...identity, submodel: e.target.value })
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium">Variant</label>
              <Input
                value={identity.variant}
                onChange={(e) =>
                  setIdentity({ ...identity, variant: e.target.value })
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium">Material</label>
              <Input
                value={identity.material}
                onChange={(e) =>
                  setIdentity({ ...identity, material: e.target.value })
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium">Color</label>
              <Input
                value={identity.color}
                onChange={(e) =>
                  setIdentity({ ...identity, color: e.target.value })
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium">Pattern</label>
              <Input
                value={identity.pattern}
                onChange={(e) =>
                  setIdentity({ ...identity, pattern: e.target.value })
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium">Hardware</label>
              <Input
                value={identity.hardware}
                onChange={(e) =>
                  setIdentity({ ...identity, hardware: e.target.value })
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium">Gender</label>
              <Input
                value={identity.gender}
                onChange={(e) =>
                  setIdentity({ ...identity, gender: e.target.value })
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium">Size</label>
              <Input
                value={identity.size}
                onChange={(e) =>
                  setIdentity({ ...identity, size: e.target.value })
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium">Era</label>
              <Input
                value={identity.era}
                onChange={(e) =>
                  setIdentity({ ...identity, era: e.target.value })
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium">Origin</label>
              <Input
                value={identity.origin}
                onChange={(e) =>
                  setIdentity({ ...identity, origin: e.target.value })
                }
              />
            </div>

          </CardContent>
        </Card>

        {/* ---------------- NOTES ---------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Internal notes…"
            />
          </CardContent>
        </Card>

        {/* ---------------- SEO ---------------- */}
        <Card>
          <CardHeader>
            <CardTitle>SEO / Listing Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">

            <div>
              <label className="text-sm font-medium">SEO Title</label>
              <Input
                value={seo.title}
                onChange={(e) =>
                  setSeo({ ...seo, title: e.target.value })
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium">SEO Subtitle</label>
              <Input
                value={seo.subtitle}
                onChange={(e) =>
                  setSeo({ ...seo, subtitle: e.target.value })
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium">SEO Bullets</label>
              <Textarea
                value={seo.bullets.join("\n")}
                onChange={(e) =>
                  setSeo({
                    ...seo,
                    bullets: e.target.value.split("\n"),
                  })
                }
                rows={4}
              />
            </div>

            <div>
              <label className="text-sm font-medium">SEO Description</label>
              <Textarea
                value={seo.description}
                onChange={(e) =>
                  setSeo({
                    ...seo,
                    description: e.target.value,
                  })
                }
                rows={4}
              />
            </div>

          </CardContent>
        </Card>

        {/* ---------------- SEARCH KEYWORDS ---------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Search Keywords</CardTitle>
          </CardHeader>

          <CardContent>
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
            />
          </CardContent>
        </Card>

        {/* ---------------- BUTTONS ---------------- */}
        <div className="flex flex-col gap-4">

          <Button
            type="button"
            disabled={isCallingAi || !mainImage}
            onClick={handleAi}
          >
            {isCallingAi ? "AI Running…" : "Run EMZCuratorAI"}
          </Button>

          <Button
            type="button"
            disabled={isGeneratingSku || !brand || !model}
            onClick={handleGenerateSku}
          >
            {isGeneratingSku ? "Generating…" : "Generate SKU"}
          </Button>

          <Button
            type="submit"
            disabled={isSaving || !itemNumber}
            className="bg-green-600 hover:bg-green-700"
          >
            {isSaving ? "Saving…" : "Save Item"}
          </Button>
        </div>

      </form>
    </div>
  );
}
