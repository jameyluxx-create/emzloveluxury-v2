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

  return (
    <div className="container mx-auto py-10 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Intake</h1>

      <form onSubmit={handleSave} className="space-y-8">
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
                placeholder="e.g. Louis Vuitton"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium">Model</label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. Neverfull MM"
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
                <option value="A">A (Excellent)</option>
                <option value="B">B (Good)</option>
                <option value="C">C (Fair)</option>
                <option value="D">D (Project)</option>
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
              <label className="text-sm font-medium">Item Number (SKU)</label>
              <Input
                value={itemNumber}
                onChange={(e) => setItemNumber(e.target.value)}
                placeholder="Generated or manual"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Base slug: <code>{baseSlug || "-"}</code>
                <br />
                Full slug: <code>{fullSlug || "-"}</code>
              </p>
            </div>
          </CardContent>
        </Card>

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
                placeholder="e.g. Monogram Canvas"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Variant</label>
              <Input
                value={identity.variant}
                onChange={(e) =>
                  setIdentity({ ...identity, variant: e.target.value })
                }
                placeholder="PM / MM / GM"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Material</label>
              <Input
                value={identity.material}
                onChange={(e) =>
                  setIdentity({ ...identity, material: e.target.value })
                }
                placeholder="Canvas / Leather / Nylon etc."
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
                placeholder="Monogram / Damier / Solid etc."
              />
            </div>

            <div>
              <label className="text-sm font-medium">Hardware</label>
              <Input
                value={identity.hardware}
                onChange={(e) =>
                  setIdentity({ ...identity, hardware: e.target.value })
                }
                placeholder="Gold / Silver / Brass etc."
              />
            </div>

            <div>
              <label className="text-sm font-medium">Gender</label>
              <Input
                value={identity.gender}
                onChange={(e) =>
                  setIdentity({ ...identity, gender: e.target.value })
                }
                placeholder="Women's / Men's / Unisex"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Size</label>
              <Input
                value={identity.size}
                onChange={(e) =>
                  setIdentity({ ...identity, size: e.target.value })
                }
                placeholder="Dimensions or general sizing"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Era</label>
              <Input
                value={identity.era}
                onChange={(e) =>
                  setIdentity({ ...identity, era: e.target.value })
                }
                placeholder="Vintage / Y2K / Modern"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Origin</label>
              <Input
                value={identity.origin}
                onChange={(e) =>
                  setIdentity({ ...identity, origin: e.target.value })
                }
                placeholder="Country of origin"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Internal notes for cleaning, restoration, issues, etc."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SEO / Listing Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">SEO Title</label>
              <Input
                value={seo.title}
                onChange={(e) => setSeo({ ...seo, title: e.target.value })}
                placeholder="AI will auto-generate"
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
                placeholder="Each line = a bullet point"
              />
            </div>

            <div>
              <label className="text-sm font-medium">SEO Description</label>
              <Textarea
                value={seo.description}
                onChange={(e) =>
                  setSeo({ ...seo, description: e.target.value })
                }
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

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
              placeholder="comma, separated, keywords"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Image Placeholder</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              value={imagePlaceholderUrl}
              onChange={(e) => setImagePlaceholderUrl(e.target.value)}
              placeholder="Optional image URL or leave blank"
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Button
            type="button"
            disabled={isGeneratingSku}
            onClick={handleGenerateSku}
          >
            {isGeneratingSku ? "Generating..." : "Generate SKU"}
          </Button>

          <Button
            type="button"
            disabled={isCallingAi}
            onClick={handleAi}
          >
            {isCallingAi ? "AI is thinking..." : "Run AI"}
          </Button>

          <Button
            type="submit"
            disabled={isSaving}
            className="bg-green-600 hover:bg-green-700"
          >
            {isSaving ? "Saving..." : "Save Item"}
          </Button>
        </div>
      </form>
    </div>
  );
}
