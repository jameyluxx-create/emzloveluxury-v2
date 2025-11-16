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

  // FORM FIELDS
  const [itemNumber, setItemNumber] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [description, setDescription] = useState(""); // sales-forward
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("A");
  const [cost, setCost] = useState("");
  const [listingPrice, setListingPrice] = useState("");

  // Dimensions
  const [dimensions, setDimensions] = useState({
    length: "",
    height: "",
    depth: "",
    strap_drop: "",
  });

  // Included items (from AI, editable list of strings)
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

  // Listing controls
  const [listForSale, setListForSale] = useState(false);

  // AI output (full structured)
  const [aiData, setAiData] = useState(null);

  // NEW: AI Quick Facts (editable panel)
  const [aiQuickFacts, setAiQuickFacts] = useState(emptyQuickFacts);
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);

  // Photo grid (12 slots)
  const [images, setImages] = useState(Array(12).fill(null));

  // Flags
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Inventory summary (bottom section)
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
      alert("Upload at least one photo before running AI lookup.");
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const response = await fetch("/api/ai-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrls: aiImages }),
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

      // ---------- Fill top-level fields ----------
      if (data.identity) {
        if (data.identity.brand) {
          setBrand((prev) => prev || data.identity.brand);
        }
        if (data.identity.model) {
          setModel((prev) => prev || data.identity.model);
        }
        if (data.identity.category_primary) {
          setCategory((prev) => prev || data.identity.category_primary);
        }
      }

      // ---------- Description ----------
      if (data.description?.sales_forward) {
        setDescription((prev) => prev || data.description.sales_forward);
      }

      // ---------- Dimensions ----------
      if (data.dimensions) {
        setDimensions((prev) => ({
          length: data.dimensions.length || prev.length,
          height: data.dimensions.height || prev.height,
          depth: data.dimensions.depth || prev.depth,
          strap_drop: data.dimensions.strap_drop || prev.strap_drop,
        }));
      }

      // ---------- Included Items ----------
      if (Array.isArray(data.included_items)) {
        setIncludedItems(data.included_items);
      }

      // ---------- Pricing Preview ----------
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

      // ---------- Quick Facts Panel ----------
      const mappedFacts = mapResultToQuickFacts(data);
      setAiQuickFacts((prev) => ({
        ...prev,
        ...mappedFacts,
      }));

      // ---------- Full Analysis Text ----------
      const analysisText = buildAnalysisText(data);
      setAiAnalysis(analysisText);
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

    const imagesPayload = images.filter((img) => img !== null);

    // Build final structured fields
    const identity = aiData?.identity || {
      brand: brand || null,
      model: model || null,
      category_primary: category || null,
      style: "",
      color: "",
      material: "",
      hardware: "",
      pattern: "",
      year_range: "",
      category_secondary: [],
    };

    const pricing = aiData?.pricing || null;

    const seo = aiData?.seo
      ? { ...aiData.seo, user_override: false }
      : null;

    const payload = {
      user_id: currentUserId,
      sku: itemNumber || null,
      item_number: itemNumber || null,
      brand: brand || null,
      model: model || null,
      description,
      category: category || null,
      condition,
      cost: cost ? Number(cost) : null,
      listing_price: listingPrice ? Number(listingPrice) : null,
      images: imagesPayload,

      // structured fields from AI
      identity,
      dimensions,
      included_items: includedItems,
      pricing,
      seo,

      // listing/public flags
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
    setDescription("");
    setCategory("");
    setCondition("A");
    setCost("");
    setListingPrice("");
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
    setAiAnalysis("");
    setImages(Array(12).fill(null));
    setListForSale(false);

    // refresh inventory summary
    await loadInventory();

    setIsSaving(false);
  }

  // ---------- RENDER ----------
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
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
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            EMZLoveLuxury — Intake + Curator AI v2.0
          </h1>
          <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>
            Upload. Identify. Prepare for listing. AI assists — you decide.
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
            onClick={runAI}
            disabled={isAnalyzing}
            style={{
              padding: "8px 14px",
              fontSize: "12px",
              borderRadius: "999px",
              border: "1px solid #22c55e",
              background: isAnalyzing ? "#14532d" : "transparent",
              color: "#bbf7d0",
              cursor: isAnalyzing ? "default" : "pointer",
            }}
          >
            {isAnalyzing ? "AI Thinking…" : "Run Curator AI"}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: "8px 16px",
              fontSize: "12px",
              borderRadius: "999px",
              border: "none",
              background: "#22c55e",
              color: "#022c22",
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
        </div>
      </div>

      {/* MAIN 3-COLUMN GRID */}
      <div
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1.05fr 1.15fr 0.9fr",
          gap: "16px",
          alignItems: "flex-start",
        }}
      >
        {/* LEFT COLUMN – Photos */}
        <section
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
              letterSpacing: "0.12em",
              color: "#9ca3af",
              marginBottom: "8px",
            }}
          >
            Photos & AI Input
          </h2>
          <p style={{ fontSize: "11px", color: "#6b7280", marginBottom: "8px" }}>
            Tap a tile to upload or replace. Front, back, interior, logo, and
            date code give the AI its best shot.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "8px",
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
                    border: isFilled ? "1px solid #4ade80" : "1px solid #374151",
                    backgroundImage: isFilled
                      ? `url(${img.url})`
                      : `url(${src})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundColor: "#111827",
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
        </section>

        {/* MIDDLE COLUMN – Intake Form */}
        <section
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
              letterSpacing: "0.12em",
              color: "#9ca3af",
              marginBottom: "8px",
            }}
          >
            Intake Details
          </h2>

          {/* SKU / Item number */}
          <label style={labelStyle}>Item Number / SKU</label>
          <input
            type="text"
            value={itemNumber}
            onChange={(e) => setItemNumber(e.target.value)}
            style={inputStyle}
            placeholder="Internal reference (optional)"
          />

          {/* Brand & Model */}
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

          {/* Category & Condition */}
          <label style={labelStyle}>Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={inputStyle}
          >
            <option value="">Select</option>
            <option value="bag">Bag</option>
            <option value="wallet">Wallet / SLG</option>
            <option value="accessory">Accessory</option>
            <option value="other">Other</option>
          </select>

          <label style={labelStyle}>Condition Grade</label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            style={inputStyle}
          >
            <option value="N">New</option>
            <option value="A">Unused</option>
            <option value="B">Excellent Preloved</option>
            <option value="C">Functional, Signs of Use</option>
            <option value="D">Project (Not Public)</option>
            <option value="U">Contemporary Brand</option>
          </select>

          {/* Cost & Listing Price */}
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

          {/* Dimensions */}
          <h3
            style={{
              marginTop: "16px",
              fontSize: "13px",
              fontWeight: 600,
              color: "#e5e7eb",
            }}
          >
            Dimensions
          </h3>

          <label style={labelStyle}>Length</label>
          <input
            type="text"
            value={dimensions.length}
            onChange={(e) =>
              setDimensions((prev) => ({ ...prev, length: e.target.value }))
            }
            style={inputStyle}
            placeholder='e.g. 10.6"'
          />

          <label style={labelStyle}>Height</label>
          <input
            type="text"
            value={dimensions.height}
            onChange={(e) =>
              setDimensions((prev) => ({ ...prev, height: e.target.value }))
            }
            style={inputStyle}
            placeholder='e.g. 6.3"'
          />

          <label style={labelStyle}>Depth</label>
          <input
            type="text"
            value={dimensions.depth}
            onChange={(e) =>
              setDimensions((prev) => ({ ...prev, depth: e.target.value }))
            }
            style={inputStyle}
            placeholder='e.g. 1.8"'
          />

          <label style={labelStyle}>Strap Drop</label>
          <input
            type="text"
            value={dimensions.strap_drop}
            onChange={(e) =>
              setDimensions((prev) => ({ ...prev, strap_drop: e.target.value }))
            }
            style={inputStyle}
            placeholder='e.g. 21"'
          />

          {/* Included Items */}
          <h3
            style={{
              marginTop: "16px",
              fontSize: "13px",
              fontWeight: 600,
              color: "#e5e7eb",
            }}
          >
            Included Items
          </h3>
          <p style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>
            Example: dust bag, strap, box, authenticity card. One per line.
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

          {/* Description */}
          <label style={labelStyle}>Sales-Forward Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...inputStyle, minHeight: "90px" }}
            placeholder="AI sales-forward description here…"
          />

          {/* List for sale */}
          <div style={{ marginTop: "8px" }}>
            <label
              style={{
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <input
                type="checkbox"
                checked={listForSale}
                onChange={(e) => setListForSale(e.target.checked)}
              />
              Mark as ready to sell (public listing)
            </label>
          </div>

          {/* AI Pricing Preview */}
          <div
            style={{
              marginTop: "12px",
              padding: "10px",
              borderRadius: "10px",
              border: "1px solid #1e293b",
              background: "#020617",
            }}
          >
            <strong style={{ fontSize: "12px" }}>AI Pricing Preview:</strong>
            {pricingPreview.retail_price && (
              <p style={previewStyle}>
                Retail: {pricingPreview.retail_price}
              </p>
            )}
            {pricingPreview.comp_low && (
              <p style={previewStyle}>Comp Low: {pricingPreview.comp_low}</p>
            )}
            {pricingPreview.comp_high && (
              <p style={previewStyle}>Comp High: {pricingPreview.comp_high}</p>
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
        </section>

        {/* RIGHT COLUMN – AI Quick Facts + Analysis */}
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {/* Quick Facts Panel */}
          <div
            style={{
              background: "#022c22",
              borderRadius: "16px",
              border: "1px solid #22c55e",
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
                  color: "#bbf7d0",
                }}
              >
                AI Quick Facts
              </h2>
              <span
                style={{
                  fontSize: "10px",
                  borderRadius: "999px",
                  padding: "2px 8px",
                  border: "1px solid #22c55e",
                  color: "#bbf7d0",
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

            <label style={labelStyle}>Brand</label>
            <input
              type="text"
              value={aiQuickFacts.brand}
              onChange={(e) =>
                setAiQuickFacts((prev) => ({
                  ...prev,
                  brand: e.target.value,
                }))
              }
              style={inputStyle}
              placeholder="Louis Vuitton, Chanel…"
            />

            <label style={labelStyle}>Category</label>
            <input
              type="text"
              value={aiQuickFacts.category}
              onChange={(e) =>
                setAiQuickFacts((prev) => ({
                  ...prev,
                  category: e.target.value,
                }))
              }
              style={inputStyle}
              placeholder="Shoulder bag, crossbody, wallet…"
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
              placeholder='e.g. 10.6" x 6.3" x 1.8"'
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

          {/* Full AI Model Analysis */}
          <div
            style={{
              background: "#020617",
              borderRadius: "16px",
              border: "1px solid #1f2937",
              padding: "10px",
            }}
          >
            <button
              type="button"
              onClick={() => setShowFullAnalysis((s) => !s)}
              style={{
                width: "100%",
                border: "none",
                background: "transparent",
                color: "#e5e7eb",
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
              }}
            >
              <span>AI Full Model Analysis</span>
              <span style={{ color: "#6b7280" }}>
                {showFullAnalysis ? "−" : "+"}
              </span>
            </button>
            {showFullAnalysis && (
              <div style={{ marginTop: "8px" }}>
                <textarea
                  value={aiAnalysis}
                  onChange={(e) => setAiAnalysis(e.target.value)}
                  rows={10}
                  style={{
                    ...inputStyle,
                    minHeight: "140px",
                    fontSize: "11px",
                    lineHeight: 1.4,
                    background: "#020617",
                  }}
                  placeholder="Curator-style narrative, model notes, history, styling notes…"
                />
              </div>
            )}
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
  if (dims.strap_drop) measurementsParts.push(`Strap: ${dims.strap_drop}`);

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

function buildAnalysisText(aiResult) {
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
