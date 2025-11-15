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

// Placeholder image paths (using your filenames)
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
  // TODO: replace this with real auth user id later
  const currentUserId = "demo-user-123";

  // Form fields
  const [itemNumber, setItemNumber] = useState("");
  const [source, setSource] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [condition, setCondition] = useState("A");
  const [notes, setNotes] = useState("");
  const [cost, setCost] = useState("");
  const [laborHours, setLaborHours] = useState("");
  const [platform, setPlatform] = useState("");
  const [category, setCategory] = useState("");
  const [restorationNeeded, setRestorationNeeded] = useState("");

  // "List for sale now" toggle
  const [listForSale, setListForSale] = useState(false);

  // Holds the full AI schema output so we can save identity/dimensions/pricing/seo
  const [aiData, setAiData] = useState(null);

  // 12 thumbnail slots
  const [images, setImages] = useState(Array(12).fill(null));

  // Status
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Inventory (basic)
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

  // Clicking a slot → choose file → RESIZE → upload to Supabase → save public URL
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

  // ---------- AI lookup: use ALL uploaded photos (not just first) ----------
  async function runAI() {
    const aiImages = images.filter((x) => x && x.url).map((x) => x.url);

    if (aiImages.length === 0) {
      alert("Upload at least one image before running AI lookup.");
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
        console.error("AI result missing data", result);
        alert("AI lookup did not return structured data.");
        return;
      }

      const data = result.data;
      setAiData(data); // save full schema for handleSave()

      const identity = data.identity || {};
      const description = data.description || {};
      const dimensions = data.dimensions || {};
      const included = data.included_items || [];

      // Only fill fields that are currently empty (user override wins)
      if (identity.brand) setBrand((prev) => prev || identity.brand);
      if (identity.model) setModel((prev) => prev || identity.model);
      if (identity.category_primary) {
        setCategory((prev) => prev || identity.category_primary);
      }

      // Put the sales-forward description into notes if notes are empty
      if (description.sales_forward) {
        setNotes((prev) => prev || description.sales_forward);
      }

      // If cost is empty but pricing suggests something, we leave it for now
      // (You can decide later whether to auto-fill cost or just listing price.)

      console.log("AI dimensions:", dimensions);
      console.log("AI included items:", included);
    } catch (err) {
      console.error(err);
      alert("AI lookup failed.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  // ---------- Save to Supabase ----------
  async function handleSave() {
    setIsSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    // Build identity/dimensions/etc from aiData if available
    const identity = aiData?.identity || {
      brand: brand || null,
      model: model || null,
      style: null,
      color: null,
      material: null,
      hardware: null,
      pattern: null,
      year_range: null,
      category_primary: category || null,
      category_secondary: [],
    };

    const dimensions = aiData?.dimensions || null;
    const included_items = aiData?.included_items || null;
    const pricing = aiData?.pricing || null;
    const seo = aiData?.seo
      ? { ...aiData.seo, user_override: false }
      : null;

    const imagesPayload = images.filter((img) => img !== null);

    const payload = {
      user_id: currentUserId,
      sku: itemNumber || null,
      item_number: itemNumber || null,
      source: source || null,
      brand: brand || null,
      model: model || null,
      condition,
      notes,
      cost: cost ? Number(cost) : null,
      labor_hours: laborHours ? Number(laborHours) : null,
      platform: platform || null,
      category: category || null,
      restoration_needed: restorationNeeded || null,
      images: imagesPayload,

      // new schema fields
      status: listForSale ? "ready_to_sell" : "intake",
      is_public: listForSale,
      identity,
      dimensions,
      included_items,
      pricing,
      seo,
    };

    const { error } = await supabase.from("listings").insert(payload);

    if (error) {
      console.error(error);
      setErrorMsg("Could not save item.");
    } else {
      setSuccessMsg(
        listForSale
          ? "Item added to inventory and marked ready to list ✅"
          : "Item saved to EMZlove inventory ✅"
      );

      // Clear form for next intake
      setItemNumber("");
      setSource("");
      setBrand("");
      setModel("");
      setCondition("A");
      setNotes("");
      setCost("");
      setLaborHours("");
      setPlatform("");
      setCategory("");
      setRestorationNeeded("");
      setImages(Array(12).fill(null));
      setListForSale(false);
      setAiData(null);

      // Refresh inventory lists
      loadInventory();
    }

    setIsSaving(false);
  }

  // ---------------- RENDER ----------------
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f1f5f9",
        color: "#0f172a",
        padding: "16px",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>
        EMZlove Luxury — Intake
      </h1>
      <p style={{ fontSize: "11px", color: "#64748b", marginBottom: "16px" }}>
        12-photo intake grid • AI lookup • Supabase save.
      </p>

      {/* AI button */}
      <button
        onClick={runAI}
        disabled={isAnalyzing}
        style={{
          padding: "8px 14px",
          background: isAnalyzing ? "#7c3aedaa" : "#7c3aed",
          color: "#fff",
          borderRadius: "6px",
          fontSize: "13px",
          border: "none",
          cursor: "pointer",
          marginBottom: "16px",
        }}
      >
        {isAnalyzing ? "Analyzing…" : "AI Lookup from All Photos"}
      </button>

      {/* 12-slot grid with hard 240×240 tiles */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, 240px)",
          gap: "12px",
          marginBottom: "24px",
          alignItems: "start",
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
            title={`Slot ${idx + 1}`}
          >
            <img
              src={images[idx]?.url || src}
              alt={`slot-${idx + 1}`}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(15,23,42,0.7)",
                color: "#e5e7eb",
                fontSize: "11px",
                textAlign: "center",
                padding: "4px 6px",
              }}
            >
              {images[idx] ? "Replace photo" : "Click to add photo"}
            </div>
          </div>
        ))}
      </div>

      {/* Item details */}
      <div
        style={{
          maxWidth: "480px",
          padding: "16px",
          background: "#ffffff",
          borderRadius: "10px",
          border: "1px solid #cbd5e1",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "8px",
          }}
        >
          <h2
            style={{
              fontSize: "15px",
              fontWeight: 600,
            }}
          >
            Item details
          </h2>
          <span
            style={{
              fontSize: "10px",
              color: "#6366f1",
              background: "#eef2ff",
              padding: "2px 6px",
              borderRadius: "999px",
            }}
          >
            AI + manual
          </span>
        </div>

        {errorMsg && (
          <p
            style={{ fontSize: "11px", color: "#b91c1c", marginBottom: "6px" }}
          >
            {errorMsg}
          </p>
        )}
        {successMsg && (
          <p
            style={{ fontSize: "11px", color: "#15803d", marginBottom: "6px" }}
          >
            {successMsg}
          </p>
        )}

        <label style={labelStyle}>Item # / SKU</label>
        <input
          value={itemNumber}
          onChange={(e) => setItemNumber(e.target.value)}
          style={inputStyle}
          placeholder="EMZ-0001"
        />

        <label style={labelStyle}>Source</label>
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          style={inputStyle}
          placeholder="Buyee, J-DIRECT, client consignment…"
        />

        <label style={labelStyle}>Brand</label>
        <input
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          style={inputStyle}
          placeholder="Chanel, Gucci, Lois Vuitton, Fendi…"
        />

        <label style={labelStyle}>Model / Style</label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          style={inputStyle}
          placeholder="Shoulder, Crossbody, Sling, Wallet…"
        />

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

        <label style={labelStyle}>Condition (N / A / B / C / D / U)</label>
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          style={inputStyle}
        >
          <option value="N">N — New</option>
          <option value="A">A — Pristine/Unused</option>
          <option value="B">B — Excellent Preloved</option>
          <option value="C">C — Functional, Signs of Usage</option>
          <option value="D">D — Project / No Public Listing</option>
          <option value="U">U — Contemporary Brand</option>
        </select>

        <label style={labelStyle}>Cost (landed)</label>
        <input
          type="number"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          style={inputStyle}
          placeholder="85.00"
        />

        <label style={labelStyle}>Labor hours (estimated)</label>
        <input
          type="number"
          value={laborHours}
          onChange={(e) => setLaborHours(e.target.value)}
          style={inputStyle}
          placeholder="e.g. 1.5"
        />

        <label style={labelStyle}>Platform / planned sale channel</label>
        <input
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          style={inputStyle}
          placeholder="Whatnot, EMZLoveLuxury.com, eBay, etc."
        />

        <label style={labelStyle}>Restoration needed (summary)</label>
        <input
          value={restorationNeeded}
          onChange={(e) => setRestorationNeeded(e.target.value)}
          style={inputStyle}
          placeholder="Clean vachetta, re-plate hardware, interior dye…"
        />

        <label style={labelStyle}>Internal notes / listing draft</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ ...inputStyle, minHeight: "90px", resize: "vertical" }}
          placeholder="AI can help fill this, then you tweak for listing…"
        />

        {/* List for sale toggle */}
        <div
          style={{
            marginTop: "8px",
            marginBottom: "4px",
            fontSize: "11px",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={listForSale}
              onChange={(e) => setListForSale(e.target.checked)}
            />
            <span>List for sale now (create public listing)</span>
          </label>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            marginTop: "12px",
            padding: "8px 14px",
            background: isSaving ? "#0f172a99" : "#0f172a",
            color: "#fff",
            borderRadius: "6px",
            fontSize: "13px",
            border: "none",
            cursor: "pointer",
          }}
        >
          {isSaving ? "Saving…" : "Add to Inventory"}
        </button>
      </div>

      {/* My latest intakes */}
      <div
        style={{
          maxWidth: "480px",
          background: "#ffffff",
          borderRadius: "10px",
          border: "1px solid #cbd5e1",
          padding: "16px",
        }}
      >
        <h2 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "8px" }}>
          My latest intakes
        </h2>
        {userInventory.length === 0 ? (
          <p style={{ fontSize: "11px", color: "#64748b" }}>
            Nothing saved yet.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
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
                    alt="thumb"
                    style={{
                      width: "40px",
                      height: "40px",
                      objectFit: "cover",
                      borderRadius: "6px",
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
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "9px",
                      color: "#94a3b8",
                    }}
                  >
                    no img
                  </div>
                )}
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 500 }}>
                    {item.brand || "No brand"}
                    {item.model ? ` — ${item.model}` : ""}
                  </div>
                  <div style={{ fontSize: "10px", color: "#64748b" }}>
                    {item.item_number ? `#${item.item_number} • ` : ""}
                    {item.source || "—"}
                    {item.is_public ? " • PUBLIC" : " • PRIVATE"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {globalInventory && globalInventory.length > 0 && (
          <p
            style={{
              fontSize: "10px",
              color: "#94a3b8",
              marginTop: "8px",
            }}
          >
            Global EMZ inventory: {globalInventory.length} items
          </p>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "6px 8px",
  fontSize: "12px",
  borderRadius: "6px",
  border: "1px solid #cbd5e1",
  marginBottom: "8px",
  boxSizing: "border-box",
  background: "#f8fafc",
};

const labelStyle = {
  fontSize: "11px",
  display: "block",
  marginBottom: 4,
  marginTop: 4,
};
