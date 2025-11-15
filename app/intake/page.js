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
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
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

export default function IntakePage() {
  // TODO: replace with actual Supabase auth
  const currentUserId = "demo-user-123";

  // FORM FIELDS
  const [itemNumber, setItemNumber] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [description, setDescription] = useState(""); // formerly notes
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("A");
  const [cost, setCost] = useState("");
  const [listingPrice, setListingPrice] = useState("");

  // NEW FIELDS: Dimensions
  const [dimensions, setDimensions] = useState({
    length: "",
    height: "",
    depth: "",
    strap_drop: "",
  });

  // NEW FIELDS: Included items (Option C)
  const [includedItems, setIncludedItems] = useState([]);

  // NEW FIELDS: Pricing preview from AI
  const [pricingPreview, setPricingPreview] = useState({
    retail_price: null,
    comp_low: null,
    comp_high: null,
    recommended_listing: null,
    whatnot_start: null,
    sources: [],
  });

  // "List for sale"
  const [listForSale, setListForSale] = useState(false);

  // AI output (full structured)
  const [aiData, setAiData] = useState(null);

  // 12 thumbnails
  const [images, setImages] = useState(Array(12).fill(null));

  // Status, errors
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
  }

  // ---------- REPLACE IMAGE ----------
  const handleReplaceImage = (slotIndex) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const resizedBlob = await resizeImage(file, 1200, 0.8);
        const filePath = `${currentUserId}/${Date.now()}-${slotIndex}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from("intake-photos")
          .upload(filePath, resizedBlob, {
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
          storagePath: filePath,
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

    try {
      setIsAnalyzing(true);

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
        if (data.identity.brand)
          setBrand((prev) => prev || data.identity.brand);

        if (data.identity.model)
          setModel((prev) => prev || data.identity.model);

        if (data.identity.category_primary)
          setCategory((prev) => prev || data.identity.category_primary);
      }

      // ---------- Description ----------
      if (data.description?.sales_forward)
        setDescription((prev) => prev || data.description.sales_forward);

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

        // If user hasn't typed a listing price yet, suggest one
        if (!listingPrice && data.pricing.recommended_listing) {
          setListingPrice(data.pricing.recommended_listing);
        }
      }
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

      // new structured fields
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
    setImages(Array(12).fill(null));
    setListForSale(false);
    setAiData(null);

    // reload user + global inventory
    loadInventory();
    setIsSaving(false);
  }

  // ---------- RENDER ----------
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f1f5f9",
        color: "#0f172a",
        padding: "16px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>
        EMZLove Luxury — Intake
      </h1>

      {/* PHOTO GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, 240px)",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        {placeholderImages.map((src, idx) => (
          <div
            key={idx}
            onClick={() => handleReplaceImage(idx)}
            style={{
              position: "relative",
              width: "240px",
              height: "240px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              background: "#e2e8f0",
              overflow: "hidden",
              cursor: "pointer",
            }}
          >
            <img
              src={images[idx]?.url || src}
              alt={`slot-${idx}`}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                background: "rgba(0,0,0,0.5)",
                color: "#fff",
                fontSize: "11px",
                textAlign: "center",
                padding: "4px",
              }}
            >
              {images[idx] ? "Replace Photo" : "Add Photo"}
            </div>
          </div>
        ))}
      </div>

      {/* MAIN FORM */}
      <div
        style={{
          maxWidth: "500px",
          background: "white",
          padding: "16px",
          borderRadius: "12px",
          border: "1px solid #cbd5e1",
        }}
      >
        <h2 style={{ fontSize: "15px", fontWeight: 600 }}>Item Details</h2>

        {/* CONDITION FIRST */}
        <label style={labelStyle}>Condition</label>
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

        {/* AI BUTTON */}
        <button
          onClick={runAI}
          disabled={isAnalyzing}
          style={{
            padding: "8px 14px",
            background: isAnalyzing ? "#7c3aedaa" : "#7c3aed",
            color: "white",
            border: "none",
            borderRadius: "6px",
            fontSize: "13px",
            cursor: "pointer",
            marginBottom: "12px",
          }}
        >
          {isAnalyzing ? "Analyzing…" : "AI Lookup"}
        </button>

        {/* MESSAGES */}
        {errorMsg && (
          <p style={{ fontSize: "11px", color: "#b91c1c" }}>{errorMsg}</p>
        )}
        {successMsg && (
          <p style={{ fontSize: "11px", color: "#15803d" }}>{successMsg}</p>
        )}

        {/* SKU */}
        <label style={labelStyle}>Item Number / SKU</label>
        <input
          value={itemNumber}
          onChange={(e) => setItemNumber(e.target.value)}
          style={inputStyle}
          placeholder="EMZ-0001"
        />

        {/* BRAND */}
        <label style={labelStyle}>Brand</label>
        <input
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          style={inputStyle}
          placeholder="Gucci, Chanel, Louis Vuitton…"
        />

        {/* MODEL */}
        <label style={labelStyle}>Model / Style</label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          style={inputStyle}
          placeholder="Soho Disco, Alma BB, Zippy Wallet…"
        />

        {/* DESCRIPTION */}
        <label style={labelStyle}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ ...inputStyle, minHeight: "90px" }}
          placeholder="AI Sales-forward description here…"
        />

        {/* CATEGORY */}
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

        {/* DIMENSIONS */}
        <h3 style={{ marginTop: "16px", fontSize: "14px", fontWeight: 600 }}>
          Dimensions
        </h3>

        <label style={labelStyle}>Length</label>
        <input
          value={dimensions.length}
          onChange={(e) =>
            setDimensions({ ...dimensions, length: e.target.value })
          }
          style={inputStyle}
          placeholder="e.g. 10 in"
        />

        <label style={labelStyle}>Height</label>
        <input
          value={dimensions.height}
          onChange={(e) =>
            setDimensions({ ...dimensions, height: e.target.value })
          }
          style={inputStyle}
          placeholder="e.g. 6 in"
        />

        <label style={labelStyle}>Depth</label>
        <input
          value={dimensions.depth}
          onChange={(e) =>
            setDimensions({ ...dimensions, depth: e.target.value })
          }
          style={inputStyle}
          placeholder="e.g. 3 in"
        />

        <label style={labelStyle}>Strap Drop</label>
        <input
          value={dimensions.strap_drop}
          onChange={(e) =>
            setDimensions({ ...dimensions, strap_drop: e.target.value })
          }
          style={inputStyle}
          placeholder="e.g. 21 in"
        />

        {/* INCLUDED ITEMS */}
        <h3 style={{ marginTop: "16px", fontSize: "14px", fontWeight: 600 }}>
          Included Items
        </h3>

        {includedItems.map((item, index) => (
          <div
            key={index}
            style={{ display: "flex", alignItems: "center", marginBottom: 8 }}
          >
            <input
              value={item}
              onChange={(e) => {
                const updated = [...includedItems];
                updated[index] = e.target.value;
                setIncludedItems(updated);
              }}
              style={{ ...inputStyle, marginBottom: 0 }}
            />
            <button
              onClick={() => {
                const updated = includedItems.filter((_, i) => i !== index);
                setIncludedItems(updated);
              }}
              style={{
                marginLeft: 6,
                fontSize: "12px",
                cursor: "pointer",
                background: "transparent",
                border: "none",
                color: "#b91c1c",
              }}
            >
              ❌
            </button>
          </div>
        ))}

        <button
          onClick={() => setIncludedItems([...includedItems, ""])}
          style={{
            fontSize: "12px",
            color: "#0f172a",
            background: "#e2e8f0",
            border: "1px solid #cbd5e1",
            borderRadius: "4px",
            padding: "4px 8px",
            cursor: "pointer",
            marginBottom: "12px",
          }}
        >
          + Add Item
        </button>

        {/* PRICING SECTION */}
        <h3 style={{ fontSize: "14px", fontWeight: 600 }}>Pricing</h3>

        <label style={labelStyle}>Cost (landed)</label>
        <input
          type="number"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          style={inputStyle}
          placeholder="e.g. 85.00"
        />

        <label style={labelStyle}>Listing Price (editable)</label>
        <input
          type="number"
          value={listingPrice}
          onChange={(e) => setListingPrice(e.target.value)}
          style={inputStyle}
          placeholder="AI suggested price"
        />

        {/* Pricing Preview */}
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            padding: "12px",
            marginTop: "12px",
          }}
        >
          <p style={{ fontSize: "12px", marginBottom: "4px" }}>
            <strong>AI Pricing Preview:</strong>
          </p>

          {pricingPreview.retail_price && (
            <p style={previewStyle}>
              Retail Price: {pricingPreview.retail_price}
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

        {/* LIST FOR SALE */}
        <div style={{ marginTop: "12px" }}>
          <label style={{ fontSize: "12px", display: "flex", gap: 6 }}>
            <input
              type="checkbox"
              checked={listForSale}
              onChange={(e) => setListForSale(e.target.checked)}
            />
            List for sale now (public listing)
          </label>
        </div>

        {/* SAVE BUTTON */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            marginTop: "12px",
            padding: "8px 14px",
            background: isSaving ? "#0f172a99" : "#0f172a",
            color: "white",
            borderRadius: "6px",
            border: "none",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          {isSaving ? "Saving…" : "Add to Inventory"}
        </button>
      </div>

      {/* INVENTORY FOOTER */}
      <div
        style={{
          maxWidth: "500px",
          background: "white",
          padding: "16px",
          borderRadius: "12px",
          border: "1px solid #cbd5e1",
          marginTop: "24px",
        }}
      >
        <h3 style={{ fontSize: "15px", fontWeight: 600 }}>My Latest Intakes</h3>

        {userInventory.length === 0 ? (
          <p style={{ fontSize: "11px", color: "#64748b" }}>
            No items yet.
          </p>
        ) : (
          <ul style={{ padding: 0, listStyle: "none" }}>
            {userInventory.map((item) => (
              <li
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 0",
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                {item.images && item.images.length > 0 ? (
                  <img
                    src={item.images[0].url || item.images[0]}
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "6px",
                      objectFit: "cover",
                      border: "1px solid #cbd5e1",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "6px",
                      border: "1px dashed #cbd5e1",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      fontSize: "9px",
                      color: "#94a3b8",
                    }}
                  >
                    no img
                  </div>
                )}

                <div>
                  <div style={{ fontSize: "13px", fontWeight: 500 }}>
                    {item.brand || "Unknown"} — {item.model || ""}
                  </div>
                  <div style={{ fontSize: "10px", color: "#64748b" }}>
                    {item.item_number ? `#${item.item_number}` : ""}
                    {item.is_public ? " • PUBLIC" : " • PRIVATE"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p style={{ fontSize: "10px", color: "#94a3b8", marginTop: "8px" }}>
          Global inventory: {globalInventory.length} items
        </p>
      </div>
    </div>
  );
}

// ---------- STYLE HELPERS ----------
const inputStyle = {
  width: "100%",
  padding: "6px 8px",
  fontSize: "12px",
  borderRadius: "6px",
  border: "1px solid #cbd5e1",
  marginBottom: "8px",
  background: "#f8fafc",
};

const labelStyle = {
  fontSize: "11px",
  marginTop: "8px",
  marginBottom: "4px",
  display: "block",
};

const previewStyle = {
  fontSize: "11px",
  margin: "2px 0",
  color: "#475569",
};
