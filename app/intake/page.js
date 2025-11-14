"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();

  // Auth
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

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

  // Load auth + inventory
  useEffect(() => {
    async function init() {
      const { data, error } = await supabase.auth.getUser();

      if (!error && data?.user) {
        setCurrentUser(data.user);
        await loadInventory(data.user.id);
      } else {
        setCurrentUser(null);
      }

      setAuthChecked(true);
    }

    init();
  }, []);

  async function loadInventory(userId) {
    if (!userId) return;

    const { data: allListings } = await supabase
      .from("listings")
      .select("*")
      .order("created_at", { ascending: false });

    const { data: myListings } = await supabase
      .from("listings")
      .select("*")
      .eq("user_id", userId)
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
        const userFolder = currentUser?.id || "guest";
        const filePath = `${userFolder}/${Date.now()}-${slotIndex}.jpg`;

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

  // AI lookup: use ALL uploaded photos (not just first)
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

      // Only fill fields that are currently empty (basic hybrid behavior for now)
      if (result.brand) setBrand((prev) => prev || result.brand);
      if (result.model) setModel((prev) => prev || result.model);
      if (result.category) setCategory((prev) => prev || result.category);
      if (result.condition) setCondition((prev) => prev || result.condition);
      if (result.description) setNotes((prev) => prev || result.description);
    } catch (err) {
      console.error(err);
      alert("AI lookup failed.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  // Save to Supabase and go to listing page
  async function handleSave() {
    setIsSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    if (!currentUser) {
      setErrorMsg("Please log in to save this item.");
      setIsSaving(false);
      return;
    }

    const payload = {
      user_id: currentUser.id,
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
      images: images.filter((img) => img !== null),
    };

    const { data, error } = await supabase
      .from("listings")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error(error);
      setErrorMsg("Could not save item.");
      setIsSaving(false);
      return;
    }

    // New listing row returned from Supabase
    const newListing = data;

    setSuccessMsg("Item saved — Ready to Sell ✅");

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

    // Refresh inventory lists
    await loadInventory(currentUser.id);

    setIsSaving(false);

    // Go to listing page for sales logistics
    if (newListing?.id) {
      // Assumes you'll create app/listing/[id]/page.js later
      router.push(`/listing/${newListing.id}`);
    }
  }

  // ---------------- RENDER ----------------

  if (!authChecked) {
    // Simple loading state while we check auth
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
        <p style={{ fontSize: "13px" }}>Checking your login…</p>
      </div>
    );
  }

  if (!currentUser) {
    // User not logged in
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
        <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "12px" }}>
          Please log in to use the intake page.
        </p>
        <button
          onClick={() => router.push("/login")}
          style={{
            padding: "8px 14px",
            background: "#0f172a",
            color: "#fff",
            borderRadius: "6px",
            fontSize: "13px",
            border: "none",
            cursor: "pointer",
          }}
        >
          Go to login
        </button>
      </div>
    );
  }

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
        12-photo intake grid • AI lookup • Supabase save • Ready-to-sell flow.
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
          <p style={{ fontSize: "11px", color: "#b91c1c", marginBottom: "6px" }}>
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
          placeholder="Chloe, Gucci, LV…"
        />

        <label style={labelStyle}>Model / Style</label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          style={inputStyle}
          placeholder="Soho Disco, WOC, Zippy Wallet…"
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

        <label style={labelStyle}>Condition (A–E)</label>
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          style={inputStyle}
        >
          <option value="A">A — Store ready</option>
          <option value="B">B — Light wear</option>
          <option value="C">C — Needs cleaning / hardware</option>
          <option value="D">D — Restoration project</option>
          <option value="E">E — Parts / salvage</option>
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

        <label style={labelStyle}>Internal notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ ...inputStyle, minHeight: "90px", resize: "vertical" }}
          placeholder="AI can help fill this, then you tweak for listing…"
        />

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
          {isSaving ? "Saving…" : "Ready to Sell"}
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
