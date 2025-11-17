"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabaseClient";

// ---------- helper: resize image on client before upload ----------
async function resizeImage(file, maxSize = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Canvas is empty"));
              return;
            }
            resolve(blob);
          },
          "image/jpeg",
          quality
        );
      };

      img.onerror = (err) => reject(err);
      img.src = event.target.result;
    };

    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

// ---------- helper: generate unique item number ----------
function generateItemNumber() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, "0");
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const mi = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `EMZ-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

// ---------- helper: escape HTML for print window ----------
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default function IntakePage() {
  // TODO: replace with actual Supabase auth
  const currentUserId = "demo-user-123";

  // CORE FIELDS
  const [itemNumber, setItemNumber] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [category, setCategory] = useState("");
  const [color, setColor] = useState("");
  const [material, setMaterial] = useState("");

  const [condition, setCondition] = useState(""); // user must choose before AI
  const [gradingNotes, setGradingNotes] = useState("");

  const [currency, setCurrency] = useState("USD"); // user-selectable currency
  const [cost, setCost] = useState("");
  const [listingPrice, setListingPrice] = useState("");

  // EMZCurator Description (print card)
  const [curatorNarrative, setCuratorNarrative] = useState("");

  // Included items as raw text (one per line)
  const [includedText, setIncludedText] = useState("");

  // Pricing preview from AI
  const [pricingPreview, setPricingPreview] = useState({
    retail_price: null,
    comp_low: null,
    comp_high: null,
    recommended_listing: null,
    whatnot_start: null,
    sources: [],
  });

  // AI structured data
  const [aiData, setAiData] = useState(null);

  // Dimensions from AI to build typical measurements line
  const [dimensions, setDimensions] = useState({
    length: "",
    height: "",
    depth: "",
    strap_drop: "",
  });

  // Listing controls
  const [listForSale, setListForSale] = useState(false);

  // Photo grid (10 slots: [0] = main listing photo, 1–9 = additional)
  const [images, setImages] = useState(Array(10).fill(null));

  // Flags
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Inventory summary
  const [userInventory, setUserInventory] = useState([]);
  const [globalInventory, setGlobalInventory] = useState([]);

  // Refs for auto-growing textareas
  const narrativeRef = useRef(null);
  const includedRef = useRef(null);

  useEffect(() => {
    loadInventory();
  }, []);

  // Auto-grow EMZCurator Description textarea
  useEffect(() => {
    if (narrativeRef.current) {
      const el = narrativeRef.current;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, [curatorNarrative]);

  // Auto-grow Included Items textarea
  useEffect(() => {
    if (includedRef.current) {
      const el = includedRef.current;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, [includedText]);

  async function loadInventory() {
    try {
      const { data: allListings } = await supabase
        .from("listings")
        .select("*")
        .order("created_at", { ascending: false });

      const { data: myListings } = await supabase
        .from("listings")
        .select("*")
        .eq("user_id", currentUserId)
        .order("created_at", { ascending: false });

      if (allListings) setGlobalInventory(allListings);
      if (myListings) setUserInventory(myListings);
    } catch (err) {
      console.error("Error loading inventory", err);
    }
  }

  // ---------- REPLACE IMAGE ----------
  const handleReplaceImage = (slotIndex) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      // Generate item number as soon as first photo is added
      if (!itemNumber) {
        const generated = generateItemNumber();
        setItemNumber(generated);
      }

      try {
        const resizedBlob = await resizeImage(file, 1200, 0.8);
        const ext = file.name.split(".").pop() || "jpg";
        const fileName = `${Date.now()}-${slotIndex}.${ext}`;
        const filePath = `${currentUserId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("intake-photos")
          .upload(filePath, resizedBlob, {
            cacheControl: "3600",
            upsert: false,
            contentType: "image/jpeg",
          });

        if (uploadError) {
          console.error(uploadError);
          alert("Upload failed");
          return;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("intake-photos").getPublicUrl(filePath);

        const next = [...images];
        next[slotIndex] = {
          url: publicUrl,
          filePath,
          name: file.name,
        };
        setImages(next);
      } catch (err) {
        console.error(err);
        alert("Could not process image.");
      }
    };

    input.click();
  };

  // ---------- MAIN vs ADDITIONAL PHOTO HELPERS ----------
  const handleListingPhotoClick = () => {
    // use slot 0 as the hero listing photo
    handleReplaceImage(0);
  };

  const handleAddAdditionalPhotosClick = () => {
    // find first empty slot from 1–9
    const nextSlot = images.findIndex((img, idx) => idx > 0 && img === null);

    if (nextSlot === -1) {
      alert("You’ve reached the maximum of 9 additional photos.");
      return;
    }

    handleReplaceImage(nextSlot);
  };

  // ---------- PRINT CARD ----------
  function handlePrintCard() {
    const printContent = curatorNarrative || "";
    const itemId = itemNumber || "EMZCurator Card";

    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(itemId)}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      padding: 16px;
      background: #ffffff;
      color: #111827;
    }
    h1 {
      font-size: 18px;
      margin-bottom: 8px;
    }
    h2 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: #4b5563;
      margin-bottom: 12px;
    }
    pre {
      white-space: pre-wrap;
      font-size: 12px;
      line-height: 1.4;
      border: 1px solid #d1d5db;
      padding: 12px;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <h1>EMZLove Luxury</h1>
  <h2>EMZCurator Description · Print Card</h2>
  <pre>${escapeHtml(printContent)}</pre>
</body>
</html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  // ---------- AI LOOKUP ----------
  async function runAI() {
    const aiImages = images.filter((x) => x && x.url).map((x) => x.url);

    if (aiImages.length === 0) {
      alert("Upload at least one photo before running EMZCurator AI.");
      return;
    }

    if (!condition) {
      alert("Please grade the condition of the item before running EMZCurator AI.");
      return;
    }

    // Safety: if somehow no item number yet, generate it now
    let currentItemNumber = itemNumber;
    if (!currentItemNumber) {
      currentItemNumber = generateItemNumber();
      setItemNumber(currentItemNumber);
    }

    setIsAnalyzing(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const response = await fetch("/api/ai-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrls: aiImages,
          conditionGrade: condition,
          gradingNotes,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI API error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success || !result.data) {
        console.error("AI error:", result);
        alert("EMZCurator lookup did not return expected data.");
        return;
      }

      const data = result.data;
      setAiData(data);

      const identity = data.identity || {};

      // Fill identity-style fields from AI (only used internally, not shown)
      if (identity.brand) setBrand((prev) => prev || identity.brand);
      if (identity.model) setModel((prev) => prev || identity.model);
      if (identity.category_primary)
        setCategory((prev) => prev || identity.category_primary);
      if (identity.color) setColor((prev) => prev || identity.color);
      if (identity.material) setMaterial((prev) => prev || identity.material);

      // Dimensions (used only for typical measurements line)
      if (data.dimensions) {
        setDimensions((prev) => ({
          length: data.dimensions.length || prev.length,
          height: data.dimensions.height || prev.height,
          depth: data.dimensions.depth || prev.depth,
          strap_drop: data.dimensions.strap_drop || prev.strap_drop,
        }));
      }

      // Included items from AI → text with one per line
      if (Array.isArray(data.included_items)) {
        setIncludedText(data.included_items.join("\n"));
      }

      // Pricing preview
      if (data.pricing) {
        setPricingPreview({
          retail_price: data.pricing.retail_price || null,
          comp_low: data.pricing.comp_low || null,
          comp_high: data.pricing.comp_high || null,
          recommended_listing: data.pricing.recommended_listing || null,
          whatnot_start: data.pricing.whatnot_start || null,
          sources: data.pricing.sources || [],
        });
      }

      // Build unified EMZCurator Description that includes all AI facts + item number
      const narrative = buildCuratorNarrative({
        aiResult: data,
        override: {
          itemNumber: currentItemNumber,
          brand,
          model,
          category,
          color,
          material,
          condition,
          gradingNotes,
        },
      });

      setCuratorNarrative((prev) => (prev ? prev : narrative));
    } catch (err) {
      console.error(err);
      alert("EMZCurator AI lookup failed.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  // ---------- SAVE ITEM ----------
  async function handleSave() {
    setIsSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    if (!condition) {
      setErrorMsg("Please grade the condition of the item.");
      setIsSaving(false);
      return;
    }

    // Safety: ensure item number exists before save
    let currentItemNumber = itemNumber;
    if (!currentItemNumber) {
      currentItemNumber = generateItemNumber();
      setItemNumber(currentItemNumber);
    }

    const imagesPayload = images.filter((img) => img !== null);

    // identity object: prefer AI identity, but merge with hidden overrides
    const aiIdentity = aiData?.identity || {};
    const identity = {
      ...aiIdentity,
      brand: brand || aiIdentity.brand || null,
      model: model || aiIdentity.model || null,
      category_primary: category || aiIdentity.category_primary || null,
      color: color || aiIdentity.color || null,
      material: material || aiIdentity.material || null,
    };

    const pricing = aiData?.pricing || null;
    const seo = aiData?.seo
      ? { ...aiData.seo, user_override: false }
      : null;

    // included items as array
    const includedItemsArray = includedText
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);

    // future-friendly keyword field
    const search_keywords = buildSearchKeywords({
      identity,
      narrative: curatorNarrative,
      includedItems: includedItemsArray,
    });

    const payload = {
      user_id: currentUserId,
      sku: currentItemNumber,
      item_number: currentItemNumber,

      brand: identity.brand,
      model: identity.model,
      category: identity.category_primary,
      color: identity.color,
      material: identity.material,

      description: curatorNarrative || null,
      condition,
      condition_notes: gradingNotes || null,

      currency, // store chosen currency
      cost: cost ? Number(cost) : null,
      listing_price: listingPrice ? Number(listingPrice) : null,

      images: imagesPayload,
      identity,
      dimensions,
      included_items: includedItemsArray,
      pricing,
      seo,
      search_keywords,

      status: listForSale ? "ready_to_sell" : "intake",
      is_public: listForSale,
    };

    const { error } = await supabase.from("listings").insert(payload);

    if (error) {
      console.error(error);
      setErrorMsg("Could not save item.");
      setIsSaving(false);
      return;
    }

    setSuccessMsg(
      listForSale
        ? "Item added and marked ready to sell."
        : "Item saved to inventory."
    );

    // Reset form
    setItemNumber("");
    setBrand("");
    setModel("");
    setCategory("");
    setColor("");
    setMaterial("");
    setCondition("");
    setGradingNotes("");
    setCurrency("USD");
    setCost("");
    setListingPrice("");
    setCuratorNarrative("");
    setDimensions({ length: "", height: "", depth: "", strap_drop: "" });
    setIncludedText("");
    setPricingPreview({
      retail_price: null,
      comp_low: null,
      comp_high: null,
      recommended_listing: null,
      whatnot_start: null,
      sources: [],
    });
    setAiData(null);
    setImages(Array(10).fill(null));
    setListForSale(false);

    await loadInventory();

    setIsSaving(false);
  }

  // ---------- RENDER ----------
  return (
    <div
      className="min-h-screen px-4 py-4 text-slate-100"
      style={{
        background:
          "radial-gradient(circle at top, #0f172a 0, #020617 45%, #000000 100%)",
      }}
    >
      {/* HEADER */}
      <div className="mx-auto mb-4 max-w-5xl rounded-2xl border border-amber-400/40 bg-gradient-to-br from-white to-slate-50 px-6 py-4 shadow-[0_8px_22px_rgba(15,23,42,0.10),0_0_14px_rgba(56,189,248,0.16)]">
        <div className="flex items-center justify-between gap-6">
          {/* Logo + Title */}
          <div className="flex flex-1 items-center gap-5 min-w-0">
            <img
              src="/emz-loveluxury-logo-horizontal.png"
              alt="EMZLoveLuxury"
              className="h-16 w-auto"
            />
            <div className="flex min-w-0 flex-col justify-center translate-y-[2px]">
              <h1 className="truncate text-[30px] font-bold tracking-[0.03em] text-slate-900 sm:text-[34px]">
                EMZLove Intake{" "}
                <span className="font-normal text-slate-900"> — </span>
                <span className="text-xl font-medium tracking-[0.03em] text-slate-700">
                  Cataloging and Intake System
                </span>
              </h1>
              <div className="mt-1 h-0.5 w-full max-w-xs rounded-full bg-gradient-to-r from-amber-400 to-transparent" />
            </div>
          </div>

          {/* AI Badge */}
          <div className="flex shrink-0 items-start justify-end">
            <button
              type="button"
              className="rounded-full border border-amber-400 bg-amber-50/90 px-4 py-1 text-[10px] font-semibold text-amber-800 shadow-sm backdrop-blur"
            >
              Powered by EMZLoveLuxury AI
            </button>
          </div>
        </div>

        {/* Messages */}
        {errorMsg && (
          <p className="mt-2 text-xs text-red-700">{errorMsg}</p>
        )}
        {successMsg && (
          <p className="mt-1 text-xs text-green-700">{successMsg}</p>
        )}

        <div className="mt-2 border-t border-slate-200" />
      </div>

      {/* MAIN GRID */}
      <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[420px,minmax(0,1fr)]">
        {/* LEFT COLUMN */}
        <section className="max-w-[420px] rounded-2xl border border-blue-900/90 bg-slate-950/95 p-3 shadow-[0_0_25px_rgba(37,99,235,0.3)]">
          {/* PHOTOS & CONDITION CARD */}
          <div className="mb-3 rounded-2xl border border-sky-400/40 bg-gradient-to-br from-slate-900 via-slate-950 to-black p-4 shadow-[0_18px_45px_rgba(15,23,42,0.75)]">
            {/* Header */}
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-100">
                  Photos &amp; Condition
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  Listing photo sets identity. Extras show below as thumbnails.
                </div>
              </div>
            </div>
            <div className="mb-2 h-px bg-gradient-to-r from-slate-400/80 to-transparent" />

            {/* MAIN LISTING PHOTO */}
            <div className="mb-3">
              <div
                onClick={handleListingPhotoClick}
                className="relative aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-2xl bg-gradient-to-br from-amber-200 via-amber-400 to-amber-700 shadow-[0_18px_40px_rgba(0,0,0,0.55)] transition-transform duration-150 hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-[0_20px_44px_rgba(0,0,0,0.7)]"
              >
                {images[0] && images[0].url ? (
                  <>
                    <img
                      src={images[0].url}
                      alt="Listing photo"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-slate-50">
                      Click to update / replace
                    </span>
                  </>
                ) : (
                  <>
                    <div className="flex h-full w-full items-center justify-center">
                      <div className="relative flex aspect-square w-[72%] items-center justify-center rounded-2xl bg-[#f7f3e8] shadow-md">
                        <img
                          src="/emz-heart-gold.png"
                          alt="EMZ placeholder"
                          className="w-[70%] object-contain opacity-95 drop-shadow-md"
                        />
                      </div>
                    </div>
                    <span className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/90 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-900 shadow-md">
                      Click to Add Listing Photo
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="mb-2 h-px bg-gradient-to-r from-transparent to-slate-400/70" />

            {/* ADDITIONAL PHOTOS HEADER + BUTTON */}
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="whitespace-nowrap text-[11px] uppercase tracking-[0.14em] text-slate-100">
                Additional Photos
              </div>
              <button
                type="button"
                onClick={handleAddAdditionalPhotosClick}
                className="whitespace-nowrap rounded-full border border-sky-400/80 bg-gradient-to-br from-slate-900 to-slate-950 px-2.5 py-1 text-[10px] font-medium text-sky-100"
              >
                Add Additional Photos (up to 9)
              </button>
            </div>

            {/* THUMBNAILS */}
            {images.some((img, idx) => idx > 0 && img) && (
              <div className="flex flex-wrap gap-2">
                {images.map(
                  (img, idx) =>
                    idx > 0 &&
                    img && (
                      <div
                        key={idx}
                        onClick={() => handleReplaceImage(idx)}
                        className="relative aspect-[4/3] flex-[0_0_calc((100%-16px)/3)] cursor-pointer overflow-hidden rounded-xl bg-slate-950 shadow-[0_8px_24px_rgba(15,23,42,0.85)]"
                      >
                        <img
                          src={img.url}
                          alt={`Additional photo ${idx}`}
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] text-slate-50">
                          Click to update / replace
                        </span>
                      </div>
                    )
                )}
              </div>
            )}
          </div>

          {/* Currency */}
          <label className="mt-2 mb-1 block text-[11px] text-slate-400">
            Currency
          </label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-0"
          >
            <option value="USD">USD – US Dollar</option>
            <option value="PHP">PHP – Philippine Peso</option>
            <option value="JPY">JPY – Japanese Yen</option>
            <option value="EUR">EUR – Euro</option>
          </select>
          <p className="mt-[-4px] text-[10px] text-slate-400">
            Used for your cost and target listing price. Global inventory can
            normalize to USD later.
          </p>

          {/* Cost */}
          <label className="mt-2 mb-1 block text-[11px] text-slate-400">
            Cost (Your Buy-In, {currency})
          </label>
          <input
            type="number"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="e.g. 350"
            className="w-full rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-0"
          />

          {/* Condition & notes */}
          <label className="mt-2 mb-1 block text-[11px] text-slate-400">
            Condition Grade (required)
          </label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className="w-full rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-0"
          >
            <option value="">Select grade…</option>
            <option value="N">N – New</option>
            <option value="A">A – Pristine or Unused Condition</option>
            <option value="B">
              B – Excellent Preloved with Minor Callouts
            </option>
            <option value="C">C – Functional With Signs of Usage</option>
            <option value="D">D – Project</option>
            <option value="U">U – Contemporary Brand</option>
          </select>
          <p className="mt-[-4px] text-[10px] text-amber-300">
            EMZCurator will not run until you choose a grade.
          </p>

          <label className="mt-2 mb-1 block text-[11px] text-slate-400">
            Grading Notes (user only)
          </label>
          <textarea
            value={gradingNotes}
            onChange={(e) => setGradingNotes(e.target.value)}
            placeholder="Corner wear, hardware scratches, interior marks, odor notes, etc."
            className="min-h-[70px] w-full rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-0"
          />

          {/* Run AI */}
          <button
            type="button"
            onClick={runAI}
            disabled={isAnalyzing}
            className={`mt-3 w-full rounded-full border px-4 py-2 text-xs font-semibold text-slate-100 shadow-[0_0_25px_rgba(56,189,248,0.35),0_0_3px_rgba(37,99,235,0.9)] ${
              isAnalyzing
                ? "cursor-default border-slate-700 bg-slate-900"
                : "cursor-pointer border-sky-400 bg-indigo-700 hover:bg-indigo-600"
            }`}
          >
            {isAnalyzing ? "EMZCurator Thinking…" : "Run EMZCurator AI"}
          </button>
          <p className="mt-1 text-[10px] text-slate-400">
            Uses photos + your cost and grade to build a complete description
            you can print and read live.
          </p>
        </section>

        {/* RIGHT COLUMN */}
        <section className="flex flex-col gap-3">
          {/* Item number + Save */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Item #</span>
              <input
                type="text"
                value={itemNumber}
                onChange={(e) => setItemNumber(e.target.value)}
                placeholder="Auto-generated on first photo"
                className="min-w-[190px] rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-center text-[11px] text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-0"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  isSaving
                    ? "cursor-default border border-amber-300 bg-amber-300 text-slate-900"
                    : "cursor-pointer border border-amber-300 bg-amber-300 text-slate-900 hover:bg-amber-200"
                }`}
              >
                {isSaving
                  ? "Saving…"
                  : listForSale
                  ? "Save & Mark Ready to Sell"
                  : "Save to Inventory"}
              </button>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-100">
                <input
                  type="checkbox"
                  checked={listForSale}
                  onChange={(e) => setListForSale(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-500 bg-slate-900 text-amber-300 focus:ring-0"
                />
                Ready to Sell
              </label>
            </div>
          </div>

          {/* EMZCurator Description */}
          <div className="rounded-2xl border border-sky-400/90 bg-gradient-to-b from-sky-800/40 via-slate-950 to-slate-950 px-3 py-3 shadow-[0_0_30px_rgba(56,189,248,0.45),0_0_6px_rgba(250,204,21,0.4)]">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-sky-100">
                EMZCurator Description
              </h2>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-amber-300/60 bg-slate-900/80 px-2 py-0.5 text-[10px] text-amber-300">
                  Print Card Text
                </span>
                <button
                  type="button"
                  onClick={handlePrintCard}
                  className="rounded-full border border-sky-400/90 bg-slate-900/90 px-3 py-1 text-[10px] text-sky-100 hover:bg-slate-800"
                >
                  Print Card
                </button>
              </div>
            </div>
            <textarea
              ref={narrativeRef}
              value={curatorNarrative}
              onChange={(e) => setCuratorNarrative(e.target.value)}
              rows={12}
              className="w-full resize-none overflow-hidden rounded-md border border-slate-800 bg-slate-950/95 px-2 py-1 text-[11px] leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-0"
              placeholder="When you run EMZCurator AI, a complete description appears here: item number, identity, measurements, features, market note, value range, and sales-forward description — ready to print or read live."
            />
          </div>

          {/* Pricing & Status */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/95 px-3 py-3">
            <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-sky-300">
              Pricing &amp; Status
            </h2>

            <label className="mb-1 block text-[11px] text-slate-400">
              Target Listing Price ({currency})
            </label>
            <input
              type="number"
              value={listingPrice}
              onChange={(e) => setListingPrice(e.target.value)}
              placeholder="EMZCurator suggestion or your own"
              className="w-full rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-0"
            />

            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
              <strong className="text-[12px]">AI Pricing Preview</strong>
              <div className="mt-1 space-y-0.5 text-[11px] text-slate-400">
                {pricingPreview.retail_price && (
                  <p>
                    Retail (approx., likely USD):{" "}
                    {pricingPreview.retail_price}
                  </p>
                )}
                {pricingPreview.comp_low && (
                  <p>Comp Low: {pricingPreview.comp_low}</p>
                )}
                {pricingPreview.comp_high && (
                  <p>Comp High: {pricingPreview.comp_high}</p>
                )}
                {pricingPreview.recommended_listing && (
                  <p>
                    Recommended Listing:{" "}
                    {pricingPreview.recommended_listing}
                  </p>
                )}
                {pricingPreview.whatnot_start && (
                  <p>
                    Suggested Whatnot Start:{" "}
                    {pricingPreview.whatnot_start}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Included Items */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/95 px-3 py-3">
            <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-sky-300">
              Included Items
            </h2>
            <p className="mb-1 text-[11px] text-slate-400">
              One per line: dust bag, strap, box, authenticity card, inserts,
              etc.
            </p>
            <textarea
              ref={includedRef}
              value={includedText}
              onChange={(e) => setIncludedText(e.target.value)}
              placeholder={"Dust bag\nCrossbody strap\nBox"}
              className="min-h-[80px] w-full resize-none overflow-hidden rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-0"
            />
          </div>
        </section>
      </div>

      {/* INVENTORY SUMMARY */}
      <div className="mx-auto mt-5 max-w-5xl rounded-2xl border border-slate-800 bg-slate-950/95 px-3 py-3">
        <h3 className="mb-2 text-sm font-semibold">My Latest Intakes</h3>
        {userInventory.length === 0 ? (
          <p className="text-xs text-slate-400">
            No items yet. Save an intake to see it here.
          </p>
        ) : (
          <div className="max-h-[220px] overflow-y-auto rounded-lg border border-slate-900">
            <table className="min-w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-950">
                  <th className="px-2 py-1 text-left font-semibold">SKU</th>
                  <th className="px-2 py-1 text-left font-semibold">Brand</th>
                  <th className="px-2 py-1 text-left font-semibold">Model</th>
                  <th className="px-2 py-1 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {userInventory.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-950 bg-slate-950"
                  >
                    <td className="px-2 py-1">
                      {item.item_number || item.sku || "—"}
                    </td>
                    <td className="px-2 py-1">{item.brand || "—"}</td>
                    <td className="px-2 py-1">{item.model || "—"}</td>
                    <td className="px-2 py-1">
                      {item.status || "intake"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          Global inventory: {globalInventory.length} items
        </p>
      </div>
    </div>
  );
}

// ---------- HELPERS ----------

// Build one unified narrative that includes ALL facts
function buildCuratorNarrative({ aiResult, override }) {
  if (!aiResult) return "";

  const identity = aiResult.identity || {};
  const dims = aiResult.dimensions || {};
  const description = aiResult.description || {};
  const availability = aiResult.availability || {};
  const pricing = aiResult.pricing || {};

  const featureBullets = description.feature_bullets || [];

  const itemNumber = override.itemNumber || "";

  const brand = override.brand || identity.brand || "";
  const model = override.model || identity.model || "";
  const category =
    override.category || identity.category_primary || identity.category || "";
  const color = override.color || identity.color || "";
  const material = override.material || identity.material || "";
  const condition = override.condition || "";

  const gradingNotes = override.gradingNotes || "";

  // measurements line
  const measurementsParts = [];
  if (dims.length) measurementsParts.push(`L: ${dims.length}`);
  if (dims.height) measurementsParts.push(`H: ${dims.height}`);
  if (dims.depth) measurementsParts.push(`D: ${dims.depth}`);
  const measurementsLine =
    measurementsParts.length > 0 ? measurementsParts.join(" · ") : "";

  const lines = [];

  // Item number first for print card lookup
  if (itemNumber) {
    lines.push(`Item #: ${itemNumber}`);
  }

  // Header / identity
  if (brand || model) {
    lines.push(`Brand / Model: ${[brand, model].filter(Boolean).join(" · ")}`);
  }
  if (category) {
    lines.push(`Category: ${category}`);
  }
  if (color) {
    lines.push(`Color: ${color}`);
  }
  if (material) {
    lines.push(`Material: ${material}`);
  }
  if (identity.year_range) {
    lines.push(`Production Range: ${identity.year_range}`);
  }
  if (condition) {
    lines.push(`Condition Grade: ${condition}`);
  }
  if (gradingNotes) {
    lines.push(`Condition Notes: ${gradingNotes}`);
  }

  // Measurements
  if (measurementsLine) {
    lines.push("");
    lines.push("Typical Measurements:");
    lines.push(measurementsLine);
  }

  // Key features
  if (featureBullets.length > 0) {
    lines.push("");
    lines.push("Key Features:");
    featureBullets.forEach((feat) => {
      lines.push(`• ${feat}`);
    });
  }

  // Availability / market note
  const rarityLine =
    availability.market_rarity || aiResult.included_items_notes || "";
  if (rarityLine) {
    lines.push("");
    lines.push("Market Note:");
    lines.push(rarityLine);
  }

  // Pricing insight
  if (pricing.comp_low || pricing.comp_high) {
    const low = pricing.comp_low ?? "";
    const high = pricing.comp_high ?? "";
    lines.push("");
    lines.push("Pricing Insight:");
    lines.push(`Observed resale range: ${low} – ${high} (approx.)`);
  }

  if (pricing.retail_price) {
    lines.push(`Original retail (approx.): ${pricing.retail_price}`);
  }

  // Sales-forward description
  if (description.sales_forward) {
    lines.push("");
    lines.push("—");
    lines.push("Sales-Forward Description:");
    lines.push(description.sales_forward);
  }

  // Extra model / history / style notes if present
  if (description.model_notes || description.history || description.styling) {
    lines.push("");
    lines.push("—");
    lines.push("Model Notes & Analysis:");
    if (description.model_notes) lines.push(description.model_notes);
    if (description.history) lines.push(description.history);
    if (description.styling) lines.push(description.styling);
  }

  return lines.join("\n");
}

function buildSearchKeywords({ identity, narrative, includedItems }) {
  const keywords = new Set();

  if (identity.brand) keywords.add(identity.brand);
  if (identity.model) keywords.add(identity.model);
  if (identity.category_primary) keywords.add(identity.category_primary);
  if (identity.color) keywords.add(identity.color);
  if (identity.material) keywords.add(identity.material);

  (includedItems || []).forEach((itm) => {
    if (itm) keywords.add(itm);
  });

  if (narrative) {
    narrative
      .split(/[\s,./]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 2)
      .forEach((w) => keywords.add(w.toLowerCase()));
  }

  return Array.from(keywords);
}
