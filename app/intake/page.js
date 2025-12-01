"use client";

export const dynamic = "force-dynamic";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { intakeSchema } from "@/lib/validation/intake";
import MainImageUploader from "@/components/upload/MainImageUploader";
import DetailImageUploader from "@/components/upload/DetailImageUploader";
import ImagePreviewGrid from "@/components/upload/ImagePreviewGrid";

// Safe fetch wrapper
async function safeFetch(url, options = {}) {
  try {
    if (options?.body) {
      options.headers = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      };
    }

    const res = await fetch(url, options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Request failed");
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      return data;
    }

    return await res.text();
  } catch (err) {
    throw new Error(err?.message || String(err));
  }
}

export default function IntakePage() {
  const router = useRouter();
  const [mainImage, setMainImage] = useState(null);
  const [detailImages, setDetailImages] = useState([]);
  const [itemNumber, setItemNumber] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [baseSlug, setBaseSlug] = useState("");
  const [fullSlug, setFullSlug] = useState("");
  const [grade, setGrade] = useState("A");
  const [status, setStatus] = useState("available");
  const [identity, setIdentity] = useState({});
  const [seo, setSeo] = useState({});
  const [searchKeywords, setSearchKeywords] = useState("");
  const [notes, setNotes] = useState("");
  const [isCallingAi, setIsCallingAi] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const toUrl = useCallback((img) => {
    if (!img) return null;
    if (typeof img === "string") return img;
    return img?.url ?? null;
  }, []);

  async function handleAi() {
    try {
      if (!mainImage) {
        toast.error("Please upload a main photo first.");
        return;
      }

      setIsCallingAi(true);

      const imageUrls = [toUrl(mainImage), ...detailImages.map(toUrl)].filter(Boolean);

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

      if (result.identity) setIdentity((prev) => ({ ...prev, ...result.identity }));
      if (result.seo) setSeo((prev) => ({ ...prev, ...result.seo }));
      if (result.searchKeywords) setSearchKeywords(result.searchKeywords);
      if (result.search_keywords) setSearchKeywords(result.search_keywords);

      toast.success("AI updated fields.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsCallingAi(false);
    }
  }

  async function handleGenerateSku() {
    try {
      if (!brand || !model) {
        toast.error("Brand and model required.");
        return;
      }

      const result = await safeFetch("/api/intake/generate-sku", {
        method: "POST",
        body: JSON.stringify({ brand, model }),
      });

      if (result.sku) {
        const slug = result.baseSlug || result.sku.toLowerCase().replace(/\s+/g, "-");
        setBaseSlug(slug);
        setFullSlug(result.fullSlug || slug);
      }

      toast.success("SKU generated.");
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleSave(e) {
    e.preventDefault();

    try {
      if (!mainImage) {
        toast.error("Main photo is required.");
        return;
      }

      setIsSaving(true);

      const images = {
        main: toUrl(mainImage) || null,
        details: detailImages.map(toUrl).filter(Boolean),
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

      if (!result?.full_slug) throw new Error("Invalid response from save.");

      toast.success("Saved!");
      router.push(`/item/${result.full_slug}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  const handleRemoveDetail = (url) => {
    setDetailImages((prev) => prev.filter((img) => toUrl(img) !== url));
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">EMZ Intake Form</h1>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Main Image */}
        <div>
          <label className="block text-sm font-semibold mb-2">Main Photo</label>
          <MainImageUploader onUpload={setMainImage} />
          {mainImage && (
            <div className="mt-2 w-24 h-24 bg-gray-200 rounded">
              <img src={toUrl(mainImage)} alt="main" className="w-full h-full object-cover rounded" />
            </div>
          )}
        </div>

        {/* Detail Images */}
        <div>
          <label className="block text-sm font-semibold mb-2">Detail Photos</label>
          <DetailImageUploader onUpload={(img) => setDetailImages((prev) => [...prev, img])} />
          {detailImages.length > 0 && (
            <ImagePreviewGrid images={detailImages} onRemoveDetail={handleRemoveDetail} />
          )}
        </div>

        {/* Brand & Model */}
        <div className="grid grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="Brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="p-2 border rounded"
          />
          <input
            type="text"
            placeholder="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="p-2 border rounded"
          />
        </div>

        {/* AI Button */}
        <button
          type="button"
          onClick={handleAi}
          disabled={isCallingAi}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isCallingAi ? "Running AI..." : "Run EMZCuratorAI"}
        </button>

        {/* SKU & Slug */}
        <div className="grid grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="Item Number"
            value={itemNumber}
            onChange={(e) => setItemNumber(e.target.value)}
            className="p-2 border rounded"
          />
          <input
            type="text"
            placeholder="Base Slug"
            value={baseSlug}
            onChange={(e) => setBaseSlug(e.target.value)}
            className="p-2 border rounded"
          />
        </div>

        <button
          type="button"
          onClick={handleGenerateSku}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Generate SKU
        </button>

        {/* Grade & Status */}
        <div className="grid grid-cols-2 gap-4">
          <select value={grade} onChange={(e) => setGrade(e.target.value)} className="p-2 border rounded">
            <option>A</option>
            <option>B</option>
            <option>C</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="p-2 border rounded">
            <option value="available">Available</option>
            <option value="sold">Sold</option>
          </select>
        </div>

        {/* Notes & Keywords */}
        <textarea
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full p-2 border rounded"
          rows="4"
        />
        <input
          type="text"
          placeholder="Search Keywords"
          value={searchKeywords}
          onChange={(e) => setSearchKeywords(e.target.value)}
          className="w-full p-2 border rounded"
        />

        {/* Save Button */}
        <button
          type="submit"
          disabled={isSaving}
          className="w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save Item"}
        </button>
      </form>
    </div>
  );
}
