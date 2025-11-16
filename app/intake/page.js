"use client";

import { useState, useEffect } from "react";
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

// ---------- PLACEHOLDER IMAGES ----------
const placeholderImages = [
  "/placeholders/Emzthumb-+AddMain.png",
  "/placeholders/Emzthumb-+AddFront.png",
  "/placeholders/Emzthumb-+AddBack.png",
  "/placeholders/Emzthumb-+AddInside.png",
  "/placeholders/Emzthumb-+AddLabel.png",
  "/placeholders/Emzthumb-+AddAuthTags.png",
  "/placeholders/Emzthumb-+AddDetails.png",
  "/placeholders/Emzthumb-+AddDetails.png",
  "/placeholders/Emzthumb-+AddDetails.png",
  "/placeholders/Emzthumb-+AddDetails.png",
  "/placeholders/Emzthumb-+AddDetails.png",
  "/placeholders/Emzthumb-+AddDetails.png",
];

// ---------- QUICK FACTS SHAPE ----------
const emptyQuickFacts = {
  modelName: "",
  brand: "",
  category: "",
  productionYears: "",
  materials: "",
  colors: "",
  features: "",
  measurements: "",
  availabilityNote: "",
  valueLow: "",
  valueHigh: "",
  conditionHint: "",
};

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

  const [cost, setCost] = useState("");
  const [listingPrice, setListingPrice] = useState("");

  // Narrative (merged sales-forward + analysis)
  const [curatorNarrative, setCuratorNarrative] = useState("");

  // Included items
  const [includedItems, setIncludedItems] = useState([]);

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
  const [aiQuickFacts, setAiQuickFacts] = useState(emptyQuickFacts);

  // We still keep dimensions in state but do not show inputs
  const [dimensions, setDimensions] = useState({
    length: "",
    height: "",
    depth: "",
    strap_drop: "",
  });

  // Listing controls
  const [listForSale, setListForSale] = useState(false);

  // Photo grid (12 slots)
  const [images, setImages] = useState(Array(12).fill(null));

  // Flags
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Inventory summary
  const [userInventory, setUserInventory] = useState([]);
  const [globalInventory, setGlobalInventory] = useState([]);

  useEffect(() => {
    loadInventory();
  }, []);

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

  // ---------- AI LOOKUP ----------
  async function runAI() {
    const aiImages = images.filter((x) => x && x.url).map((x) => x.url);

    if (aiImages.length === 0) {
      alert("Upload at least one photo before running Curator AI.");
      return;
    }

    if (!condition) {
      alert(
        "Please grade the condition of the item before running Curator AI."
      );
      return;
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
        alert("AI lookup did not return expected data.");
        return;
      }

      const data = result.data;
      setAiData(data);

      const identity = data.identity || {};

      // Fill identity-style fields from AI (user can override)
      if (identity.brand) setBrand((prev) => prev || identity.brand);
      if (identity.model) setModel((prev) => prev || identity.model);
      if (identity.category_primary)
        setCategory((prev) => prev || identity.category_primary);
      if (identity.color) setColor((prev) => prev || identity.color);
      if (identity.material) setMaterial((prev) => prev || identity.material);

      // Dimensions (not shown as inputs, used only for typical measurements)
      if (data.dimensions) {
        setDimensions((prev) => ({
          length: data.dimensions.length || prev.length,
          height: data.dimensions.height || prev.height,
          depth: data.dimensions.depth || prev.depth,
          strap_drop: data.dimensions.strap_drop || prev.strap_drop,
        }));
      }

      // Included items
      if (Array.isArray(data.included_items)) {
        setIncludedItems(data.included_items);
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

      // Quick Facts panel
      const mappedFacts = mapResultToQuickFacts(data);
      setAiQuickFacts((prev) => ({
        ...prev,
        ...mappedFacts,
      }));

      // Curator Narrative (merged description + analysis)
      const narrative = buildCuratorNarrative(data);
      setCuratorNarrative((prev) => (prev ? prev : narrative));
    } catch (err) {
      console.error(err);
      alert("AI lookup failed.");
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

    const imagesPayload = images.filter((img) => img !== null);

    // identity object: prefer AI identity, but merge with user overrides
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

    // future-friendly keyword field (for "ladies fashion", "red wallet" search)
    const search_keywords = buildSearchKeywords({
      identity,
      narrative: curatorNarrative,
      includedItems,
    });

    const payload = {
      user_id: currentUserId,
      sku: itemNumber || null,
      item_number: itemNumber || null,

      brand: identity.brand,
      model: identity.model,
      category: identity.category_primary,
      color: identity.color,
      material: identity.material,

      description: curatorNarrative || null,
      condition,
      condition_notes: gradingNotes || null,

      cost: cost ? Number(cost) : null,
      listing_price: listingPrice ? Number(listingPrice) : null,

      images: imagesPayload,
      identity,
      dimensions,
      included_items: includedItems,
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
    setCost("");
    setListingPrice("");
    setCuratorNarrative("");
    setDimensions({ length: "", height: "", depth: "", strap_drop: "" });
    setIncludedItems([]);
    setPricingPreview({
      retail_price: null,
      comp_low: null,
      comp_high: null,
      recommended_listing: null,
      whatnot_start: null,
      sources: [],
    });
    setAiData(null);
    setAiQuickFacts(emptyQuickFacts);
    setImages(Array(12).fill(null));
    setListForSale(false);

    await loadInventory();

    setIsSaving(false);
  }

  // ---------- RENDER ----------
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#e5e7eb",
        padding: "16px",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* HEADER */}
      <div
        style={{
          maxWidth: "1180px",
          margin: "0 auto 16px auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "18px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            EMZLoveLuxury — Intake + Curator AI v2.0
          </h1>
          <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>
            Photos + your grade in, curated narrative and valuation out.
          </p>
          {errorMsg && (
            <p style={{ fontSize: "12px", color: "#fecaca", marginTop: "4px" }}>
              {errorMsg}
            </p>
          )}
          {successMsg && (
            <p style={{ fontSize: "12px", color: "#bbf7d0", marginTop: "4px" }}>
              {successMsg}
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: "8px 14px",
              fontSize: "12px",
              borderRadius: "999px",
              border: "1px solid #facc15",
              background: "#facc15",
              color: "#111827",
              fontWeight: 600,
              cursor: isSaving ? "default" : "pointer",
            }}
          >
            {isSaving
              ? "Saving…"
              : listForSale
              ? "Save & Mark Ready to Sell"
              : "Save to Inventory"}
          </button>
          <label
            style={{
              fontSize: "11px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "#e5e7eb",
            }}
          >
            <input
              type="checkbox"
              checked={listForSale}
              onChange={(e) => setListForSale(e.target.checked)}
            />
            Ready to Sell
          </label>
        </div>
      </div>

      {/* MAIN 2-COLUMN GRID */}
      <div
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1.1fr 1.4fr",
          gap: "16px",
          alignItems: "flex-start",
        }}
      >
        {/* LEFT COLUMN – Photos + Condition + AI Button */}
        <section
          style={{
            background: "#020617",
            borderRadius: "16px",
            border: "1px solid #1e293b",
            padding: "12px",
          }}
        >
          <h2
            style={{
              fontSize: "12px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "#9ca3af",
              marginBottom: "8px",
            }}
          >
            Photos & Condition
          </h2>
          <p style={{ fontSize: "11px", color: "#6b7280", marginBottom: "8px" }}>
            Load your best angles, then grade the item. Curator AI will use
            both your grade and the photos for valuation.
          </p>

          {/* Photo grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "8px",
              marginBottom: "10px",
            }}
          >
            {placeholderImages.map((src, idx) => {
              const img = images[idx];
              const isFilled = !!img;
              return (
                <div
                  key={idx}
                  onClick={() => handleReplaceImage(idx)}
                  style={{
                    position: "relative",
                    height: "150px",
                    borderRadius: "12px",
                    border: isFilled ? "1px solid #2563eb" : "1px solid #374151",
                    backgroundImage: isFilled
                      ? `url(${img.url})`
                      : `url(${src})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundColor: "#020617",
                    cursor: "pointer",
                    overflow: "hidden",
                  }}
                >
                  {!isFilled && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "11px",
                        color: "#9ca3af",
                        backdropFilter: "blur(2px)",
                        background:
                          "linear-gradient(to top, rgba(15,23,42,0.9), rgba(15,23,42,0.4))",
                      }}
                    >
                      Click to Add
                    </div>
                  )}
                  {isFilled && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        padding: "4px 6px",
                        fontSize: "10px",
                        color: "#e5e7eb",
                        background:
                          "linear-gradient(to top, rgba(15,23,42,0.9), transparent)",
                      }}
                    >
                      {img.name || "Uploaded image"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Condition & notes */}
          <label style={labelStyle}>Condition Grade (required)</label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            style={inputStyle}
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
          <p style={{ fontSize: "10px", color: "#facc15", marginTop: "-4px" }}>
            Curator AI will not run until you choose a grade.
          </p>

          <label style={labelStyle}>Grading Notes (user only)</label>
          <textarea
            value={gradingNotes}
            onChange={(e) => setGradingNotes(e.target.value)}
            style={{ ...inputStyle, minHeight: "70px" }}
            placeholder="Corner wear, hardware scratches, interior marks, odor notes, etc."
          />

          {/* Run AI button */}
          <button
            onClick={runAI}
            disabled={isAnalyzing}
            style={{
              marginTop: "10px",
              width: "100%",
              padding: "8px 14px",
              fontSize: "12px",
              borderRadius: "999px",
              border: "1px solid #2563eb",
              background: isAnalyzing ? "#1e293b" : "#1d4ed8",
              color: "#e5e7eb",
              fontWeight: 600,
              cursor: isAnalyzing ? "default" : "pointer",
              boxShadow: "0 0 0 1px rgba(37,99,235,0.4)",
            }}
          >
            {isAnalyzing ? "Curator AI Thinking…" : "Run Curator AI"}
          </button>
          <p style={{ fontSize: "10px", color: "#9ca3af", marginTop: "6px" }}>
            Uses photos + your grade to propose identity, narrative, and
            valuation. You can edit everything before saving.
          </p>
        </section>

        {/* RIGHT COLUMN – Curator Panel */}
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {/* Curator Narrative Hero */}
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(30,64,175,0.35), rgba(15,23,42,1))",
              borderRadius: "16px",
              border: "1px solid #facc15",
              padding: "12px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "4px",
              }}
            >
              <h2
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.16em",
                  color: "#facc15",
                }}
              >
                Curator Narrative
              </h2>
              <span
                style={{
                  fontSize: "10px",
                  borderRadius: "999px",
                  padding: "2px 8px",
                  border: "1px solid rgba(250,204,21,0.7)",
                  color: "#facc15",
                  background: "rgba(15,23,42,0.7)",
                }}
              >
                AI Draft · You Finalize
              </span>
            </div>
            <textarea
              value={curatorNarrative}
              onChange={(e) => setCuratorNarrative(e.target.value)}
              rows={8}
              style={{
                ...inputStyle,
                minHeight: "140px",
                fontSize: "11px",
                lineHeight: 1.45,
                background: "rgba(15,23,42,0.9)",
                borderColor: "#1e293b",
              }}
              placeholder="When you run Curator AI, a sales-forward description with model notes will appear here. You can edit this before listing or going live."
            />
          </div>

          {/* Identity Card */}
          <div
            style={{
              background: "#020617",
              borderRadius: "16px",
              border: "1px solid #1f2937",
              padding: "12px",
            }}
          >
            <h2
              style={{
                fontSize: "12px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "#9ca3af",
                marginBottom: "8px",
              }}
            >
              Identity & Indexing
            </h2>

            <label style={labelStyle}>Item Number / SKU</label>
            <input
              type="text"
              value={itemNumber}
              onChange={(e) => setItemNumber(e.target.value)}
              style={inputStyle}
              placeholder="Internal reference (optional)"
            />

            <label style={labelStyle}>Brand</label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              style={inputStyle}
              placeholder="Louis Vuitton, Chanel, Gucci…"
            />

            <label style={labelStyle}>Model / Line</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={inputStyle}
              placeholder="Favorite MM, Alma PM, Marmont, etc."
            />

            <label style={labelStyle}>Category (free text)</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={inputStyle}
              placeholder="women's wallet, mini shoulder bag, crossbody, etc."
            />

            <label style={labelStyle}>Color</label>
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={inputStyle}
              placeholder="Red, Noir, Monogram, etc."
            />

            <label style={labelStyle}>Material</label>
            <input
              type="text"
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              style={inputStyle}
              placeholder="Monogram canvas, calfskin leather, etc."
            />
          </div>

          {/* Pricing & Status Card */}
          <div
            style={{
              background: "#020617",
              borderRadius: "16px",
              border: "1px solid #1f2937",
              padding: "12px",
            }}
          >
            <h2
              style={{
                fontSize: "12px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "#9ca3af",
                marginBottom: "8px",
              }}
            >
              Pricing & Status
            </h2>

            <label style={labelStyle}>Cost (Your Buy-In, USD)</label>
            <input
              type="number"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              style={inputStyle}
              placeholder="e.g. 350"
            />

            <label style={labelStyle}>Target Listing Price (USD)</label>
            <input
              type="number"
              value={listingPrice}
              onChange={(e) => setListingPrice(e.target.value)}
              style={inputStyle}
              placeholder="AI suggested price or your own"
            />

            <div
              style={{
                marginTop: "10px",
                padding: "10px",
                borderRadius: "10px",
                border: "1px solid #1e293b",
                background: "#020617",
              }}
            >
              <strong style={{ fontSize: "12px" }}>AI Pricing Preview</strong>
              {pricingPreview.retail_price && (
                <p style={previewStyle}>
                  Retail: {pricingPreview.retail_price}
                </p>
              )}
              {pricingPreview.comp_low && (
                <p style={previewStyle}>
                  Comp Low: {pricingPreview.comp_low}
                </p>
              )}
              {pricingPreview.comp_high && (
                <p style={previewStyle}>
                  Comp High: {pricingPreview.comp_high}
                </p>
              )}
              {pricingPreview.recommended_listing && (
                <p style={previewStyle}>
                  Recommended Listing: {pricingPreview.recommended_listing}
                </p>
              )}
              {pricingPreview.whatnot_start && (
                <p style={previewStyle}>
                  Suggested Whatnot Start: {pricingPreview.whatnot_start}
                </p>
              )}
            </div>
          </div>

          {/* Quick Facts Card */}
          <div
            style={{
              background: "#020617",
              borderRadius: "16px",
              border: "1px solid #2563eb",
              padding: "12px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "4px",
              }}
            >
              <h2
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: "#bfdbfe",
                }}
              >
                AI Quick Facts
              </h2>
              <span
                style={{
                  fontSize: "10px",
                  borderRadius: "999px",
                  padding: "2px 8px",
                  border: "1px solid rgba(37,99,235,0.7)",
                  color: "#bfdbfe",
                  background: "rgba(15,23,42,0.7)",
                }}
              >
                Editable
              </span>
            </div>

            <label style={labelStyle}>Model Name</label>
            <input
              type="text"
              value={aiQuickFacts.modelName}
              onChange={(e) =>
                setAiQuickFacts((prev) => ({
                  ...prev,
                  modelName: e.target.value,
                }))
              }
              style={inputStyle}
              placeholder="Favorite MM, Alma PM, etc."
            />

            <label style={labelStyle}>Production Years</label>
            <input
              type="text"
              value={aiQuickFacts.productionYears}
              onChange={(e) =>
                setAiQuickFacts((prev) => ({
                  ...prev,
                  productionYears: e.target.value,
                }))
              }
              style={inputStyle}
              placeholder="2012–2016, etc."
            />

            <label style={labelStyle}>Typical Materials</label>
            <input
              type="text"
              value={aiQuickFacts.materials}
              onChange={(e) =>
                setAiQuickFacts((prev) => ({
                  ...prev,
                  materials: e.target.value,
                }))
              }
              style={inputStyle}
              placeholder="Monogram canvas, vachetta leather…"
            />

            <label style={labelStyle}>Common Colors</label>
            <input
              type="text"
              value={aiQuickFacts.colors}
              onChange={(e) =>
                setAiQuickFacts((prev) => ({
                  ...prev,
                  colors: e.target.value,
                }))
              }
              style={inputStyle}
              placeholder="Monogram, DA, DE, Noir…"
            />

            <label style={labelStyle}>Key Features (Live Selling)</label>
            <textarea
              rows={3}
              value={aiQuickFacts.features}
              onChange={(e) =>
                setAiQuickFacts((prev) => ({
                  ...prev,
                  features: e.target.value,
                }))
              }
              style={{ ...inputStyle, minHeight: "70px" }}
              placeholder={"• Magnetic flap closure\n• Detachable strap\n• Interior slip pocket"}
            />

            <label style={labelStyle}>Typical Measurements</label>
            <input
              type="text"
              value={aiQuickFacts.measurements}
              onChange={(e) =>
                setAiQuickFacts((prev) => ({
                  ...prev,
                  measurements: e.target.value,
                }))
              }
              style={inputStyle}
              placeholder='e.g. L: 10.6" · H: 6.3" · D: 1.8"'
            />

            <label style={labelStyle}>Availability / Market Note</label>
            <input
              type="text"
              value={aiQuickFacts.availabilityNote}
              onChange={(e) =>
                setAiQuickFacts((prev) => ({
                  ...prev,
                  availabilityNote: e.target.value,
                }))
              }
              style={inputStyle}
              placeholder="Discontinued; strong resale demand."
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "8px",
              }}
            >
              <div>
                <label style={labelStyle}>Value Low (USD)</label>
                <input
                  type="number"
                  value={aiQuickFacts.valueLow}
                  onChange={(e) =>
                    setAiQuickFacts((prev) => ({
                      ...prev,
                      valueLow: e.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="e.g. 650"
                />
              </div>
              <div>
                <label style={labelStyle}>Value High (USD)</label>
                <input
                  type="number"
                  value={aiQuickFacts.valueHigh}
                  onChange={(e) =>
                    setAiQuickFacts((prev) => ({
                      ...prev,
                      valueHigh: e.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="e.g. 950"
                />
              </div>
            </div>

            <label style={labelStyle}>AI Condition Hint (Optional)</label>
            <input
              type="text"
              value={aiQuickFacts.conditionHint}
              onChange={(e) =>
                setAiQuickFacts((prev) => ({
                  ...prev,
                  conditionHint: e.target.value,
                }))
              }
              style={inputStyle}
              placeholder="AI impression only – you override."
            />
          </div>

          {/* Included Items */}
          <div
            style={{
              background: "#020617",
              borderRadius: "16px",
              border: "1px solid #1f2937",
              padding: "12px",
            }}
          >
            <h2
              style={{
                fontSize: "12px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "#9ca3af",
                marginBottom: "8px",
              }}
            >
              Included Items
            </h2>
            <p
              style={{
                fontSize: "11px",
                color: "#9ca3af",
                marginBottom: "4px",
              }}
            >
              One per line: dust bag, strap, box, authenticity card, inserts,
              etc.
            </p>
            <textarea
              value={includedItems.join("\n")}
              onChange={(e) => {
                const lines = e.target.value
                  .split("\n")
                  .map((x) => x.trim())
                  .filter((x) => x.length > 0);
                setIncludedItems(lines);
              }}
              style={{ ...inputStyle, minHeight: "80px" }}
              placeholder={"Dust bag\nCrossbody strap\nBox"}
            />
          </div>
        </section>
      </div>

      {/* INVENTORY SUMMARY */}
      <div
        style={{
          maxWidth: "1180px",
          margin: "20px auto 0 auto",
          padding: "12px",
          borderRadius: "16px",
          border: "1px solid #1f2937",
          background: "#020617",
        }}
      >
        <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>
          My Latest Intakes
        </h3>
        {userInventory.length === 0 ? (
          <p style={{ fontSize: "12px", color: "#9ca3af" }}>
            No items yet. Save an intake to see it here.
          </p>
        ) : (
          <div
            style={{
              maxHeight: "220px",
              overflowY: "auto",
              borderRadius: "10px",
              border: "1px solid #111827",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "11px",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#020617",
                    borderBottom: "1px solid #111827",
                  }}
                >
                  <th
                    style={{
                      textAlign: "left",
                      padding: "6px 8px",
                      fontWeight: 600,
                    }}
                  >
                    SKU
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "6px 8px",
                      fontWeight: 600,
                    }}
                  >
                    Brand
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "6px 8px",
                      fontWeight: 600,
                    }}
                  >
                    Model
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "6px 8px",
                      fontWeight: 600,
                    }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {userInventory.map((item) => (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: "1px solid #020617",
                      background: "#020617",
                    }}
                  >
                    <td style={{ padding: "4px 8px" }}>
                      {item.item_number || item.sku || "—"}
                    </td>
                    <td style={{ padding: "4px 8px" }}>
                      {item.brand || "—"}
                    </td>
                    <td style={{ padding: "4px 8px" }}>
                      {item.model || "—"}
                    </td>
                    <td style={{ padding: "4px 8px" }}>
                      {item.status || "intake"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p
          style={{
            marginTop: "8px",
            fontSize: "11px",
            color: "#9ca3af",
          }}
        >
          Global inventory: {globalInventory.length} items
        </p>
      </div>
    </div>
  );
}

// ---------- HELPERS FOR AI MAPPING ----------
function mapResultToQuickFacts(aiResult) {
  if (!aiResult) return {};

  const identity = aiResult.identity || {};
  const pricing = aiResult.pricing || {};
  const dims = aiResult.dimensions || {};
  const availability = aiResult.availability || {};
  const featureBullets = aiResult.description?.feature_bullets || [];

  const measurementsParts = [];
  if (dims.length) measurementsParts.push(`L: ${dims.length}`);
  if (dims.height) measurementsParts.push(`H: ${dims.height}`);
  if (dims.depth) measurementsParts.push(`D: ${dims.depth}`);

  return {
    modelName: identity.model || "",
    brand: identity.brand || "",
    category: identity.category_primary || "",
    productionYears: identity.year_range || "",
    materials: identity.material || "",
    colors: identity.color || "",
    features: featureBullets.join("\n") || "",
    measurements: measurementsParts.join(" · "),
    availabilityNote:
      availability.market_rarity || aiResult.included_items_notes || "",
    valueLow:
      typeof pricing.comp_low === "number"
        ? pricing.comp_low.toString()
        : pricing.comp_low || "",
    valueHigh:
      typeof pricing.comp_high === "number"
        ? pricing.comp_high.toString()
        : pricing.comp_high || "",
    conditionHint: "",
  };
}

function buildCuratorNarrative(aiResult) {
  if (!aiResult) return "";

  const identity = aiResult.identity || {};
  const description = aiResult.description || {};
  const availability = aiResult.availability || {};
  const pricing = aiResult.pricing || {};

  const lines = [];

  const titleParts = [
    identity.brand,
    identity.model,
    identity.style,
    identity.color,
  ].filter(Boolean);

  if (titleParts.length) {
    lines.push(titleParts.join(" · "));
  }

  if (identity.year_range) {
    lines.push(`Approx. production range: ${identity.year_range}`);
  }

  if (description.sales_forward) {
    lines.push("");
    lines.push(description.sales_forward);
  }

  if (availability.market_rarity) {
    lines.push("");
    lines.push(`Rarity: ${availability.market_rarity}`);
  }

  if (pricing.comp_low || pricing.comp_high) {
    const low = pricing.comp_low ?? "";
    const high = pricing.comp_high ?? "";
    lines.push("");
    lines.push(`Observed resale range: ${low} – ${high} (approx.)`);
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

// ---------- STYLE HELPERS ----------
const inputStyle = {
  width: "100%",
  padding: "6px 8px",
  fontSize: "12px",
  borderRadius: "6px",
  border: "1px solid #1f2937",
  marginBottom: "8px",
  background: "#020617",
  color: "#e5e7eb",
};

const labelStyle = {
  fontSize: "11px",
  marginTop: "8px",
  marginBottom: "4px",
  display: "block",
  color: "#9ca3af",
};

const previewStyle = {
  fontSize: "11px",
  margin: "2px 0",
  color: "#9ca3af",
};
