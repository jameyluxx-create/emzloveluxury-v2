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

// ---------- PLACEHOLDER IMAGES (6 slots) ----------
const placeholderImages = [
  "/placeholders/Emzthumb-+AddMain.png",
  "/placeholders/Emzthumb-+AddFront.png",
  "/placeholders/Emzthumb-+AddBack.png",
  "/placeholders/Emzthumb-+AddInside.png",
  "/placeholders/Emzthumb-+AddLabel.png",
  "/placeholders/Emzthumb-+AddAuthTags.png",
];

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
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, #0f172a 0, #020617 45%, #000000 100%)",
        color: "#e5e7eb",
        padding: "16px",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* HEADER */}
      <div
        style={{
          maxWidth: "1180px",
          margin: "0 auto 16px auto",
          padding: "18px 24px 16px 24px",
          borderRadius: "20px",
          border: "1px solid rgba(212,175,55,0.35)", // soft gold edge
          background: "linear-gradient(135deg, #ffffff, #f9fafb)",
          boxShadow:
            "0 8px 22px rgba(15,23,42,0.10), 0 0 14px rgba(56,189,248,0.16)", // subtle blue glow
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "24px",
          }}
        >
          {/* Logo + Title (luxury left stack) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "18px",
              flex: 1,
              minWidth: 0,
            }}
          >
            {/* Logo */}
            <img
              src="/emz-loveluxury-logo-horizontal.png"
              alt="EMZLoveLuxury"
              style={{
                height: "60px",
                width: "auto",
                display: "block",
              }}
            />

            {/* Title + accent line */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                transform: "translateY(2px)",
                minWidth: 0,
              }}
            >
              <h1
                style={{
                  fontSize: "34px",
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                  color: "#111827",
                  margin: 0,
                  lineHeight: 1.1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                EMZLove Intake{" "}
                <span
                  style={{
                    fontWeight: 400,
                    color: "#111827",
                  }}
                >
                  —{" "}
                </span>
                <span
                  style={{
                    fontSize: "24px",
                    fontWeight: 500,
                    letterSpacing: "0.03em",
                    color: "#374151",
                  }}
                >
                  Cataloging and Intake System
                </span>
              </h1>

              {/* Gold accent underline */}
              <div
                style={{
                  height: "2px",
                  width: "100%",
                  maxWidth: "420px",
                  background:
                    "linear-gradient(to right, #d4af37, rgba(212,175,55,0.0))",
                  marginTop: "6px",
                  borderRadius: "999px",
                }}
              />
            </div>
          </div>

          {/* AI Upgrade Badge */}
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              style={{
                fontSize: "10px",
                padding: "6px 16px",
                borderRadius: "999px",
                border: "1px solid #d4af37",
                background: "rgba(255,251,235,0.9)",
                color: "#7a5f1a",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                backdropFilter: "blur(3px)",
              }}
            >
              Powered by EMZLoveLuxury AI
            </button>
          </div>
        </div>

        {/* Error / success messages */}
        {errorMsg && (
          <p
            style={{
              fontSize: "12px",
              color: "#b91c1c",
              marginTop: "8px",
              textAlign: "left",
            }}
          >
            {errorMsg}
          </p>
        )}
        {successMsg && (
          <p
            style={{
              fontSize: "12px",
              color: "#166534",
              marginTop: "6px",
              textAlign: "left",
            }}
          >
            {successMsg}
          </p>
        )}

        {/* Divider line under header */}
        <div
          style={{
            marginTop: "10px",
            borderTop: "1px solid #e5e7eb",
          }}
        />
      </div>

      {/* MAIN 2-COLUMN GRID */}
      <div
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "minmax(0, 420px) minmax(0, 1fr)",
          gap: "16px",
          alignItems: "flex-start",
        }}
      >
        {/* LEFT COLUMN – Photos + Currency + Cost + Condition + AI Button */}
        <section
          style={{
            background: "rgba(15,23,42,0.96)",
            borderRadius: "16px",
            border: "1px solid rgba(30,64,175,0.9)",
            padding: "12px",
            boxShadow: "0 0 25px rgba(37,99,235,0.3)",
            width: "100%",
            maxWidth: "420px",
          }}
        >
          {/* PHOTOS & CONDITION CARD */}
          <div
            style={{
              background:
                "radial-gradient(circle at top left, #0f172a, #020617)",
              borderRadius: "20px",
              padding: "16px 16px 18px 16px",
              border: "1px solid rgba(56,189,248,0.4)",
              boxShadow: "0 18px 45px rgba(15,23,42,0.75)",
              width: "100%",
              marginBottom: "12px",
            }}
          >
            {/* Top title bar */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "11px",
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "#e5e7eb",
                  }}
                >
                  Photos &amp; Condition
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#9ca3af",
                    marginTop: "2px",
                  }}
                >
                  Listing photo sets identity. Extras show below as thumbnails.
                </div>
              </div>
            </div>

            {/* Thin bar under header */}
            <div
              style={{
                height: "1px",
                background:
                  "linear-gradient(to right, rgba(148,163,184,0.8), rgba(15,23,42,0))",
                marginBottom: "10px",
              }}
            />

{/* MAIN LISTING PHOTO (slot 0) */}
<div style={{ marginBottom: "12px" }}>
  <div
    onClick={handleListingPhotoClick}
    style={{
      position: "relative",
      width: "100%",
      aspectRatio: "4 / 3",
      borderRadius: "18px",
      overflow: "hidden",
      background:
        "linear-gradient(135deg, #f6e3a5 0%, #d4af37 40%, #b68b22 100%)",
      boxShadow: "0 18px 40px rgba(0,0,0,0.55)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      transition: "transform 0.16s ease, box-shadow 0.16s ease",
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = "translateY(-1px) scale(1.01)";
      e.currentTarget.style.boxShadow =
        "0 20px 44px rgba(0,0,0,0.70)";
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = "none";
      e.currentTarget.style.boxShadow =
        "0 18px 40px rgba(0,0,0,0.55)";
    }}
  >
    {images[0] && images[0].url ? (
      <>
        <img
          src={images[0].url}
          alt="Listing photo"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
        <span
          style={{
            position: "absolute",
            bottom: "10px",
            right: "10px",
            fontSize: "10px",
            padding: "3px 8px",
            borderRadius: "999px",
            background: "rgba(0,0,0,0.55)",
            color: "#f9fafb",
          }}
        >
          Click to update / replace
        </span>
      </>
    ) : (
      <>
        {/* Center cream panel with EMZ heart */}
        <div
          style={{
            width: "72%",
            aspectRatio: "1 / 1",
            borderRadius: "16px",
            background: "#f7f3e8",
            boxShadow: "0 8px 18px rgba(0,0,0,0.28)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <img
            src="/emz-heart-gold.png"
            alt="EMZ placeholder"
            style={{
              width: "70%",
              height: "auto",
              objectFit: "contain",
              opacity: 0.98,
              filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.25))",
            }}
          />
        </div>

        {/* Overlay label */}
        <span
          style={{
            position: "absolute",
            bottom: "14px",
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: "12px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#111827",
            background: "rgba(255,255,255,0.9)",
            padding: "4px 12px",
            borderRadius: "999px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.28)",
            whiteSpace: "nowrap",
          }}
        >
          Click to Add Listing Photo
        </span>
      </>
    )}
  </div>
</div>

    {/* Center cream panel with EMZ heart */}
    <div
      style={{
        width: "72%",
        aspectRatio: "1 / 1",
        borderRadius: "16px",
        background: "#f7f3e8",
        boxShadow: "0 8px 18px rgba(0,0,0,0.28)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        src="/emz-heart-gold.png"
        alt="EMZ placeholder"
        style={{
          width: "70%",
          height: "auto",
          objectFit: "contain",
          opacity: 0.98,
          filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.25))",
        }}
      />
    </div>

    {/* Overlay label */}
    <span
      style={{
        position: "absolute",
        bottom: "14px",
        left: "50%",
        transform: "translateX(-50%)",
        fontSize: "12px",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "#111827",
        background: "rgba(255,255,255,0.9)",
        padding: "4px 12px",
        borderRadius: "999px",
        boxShadow: "0 2px 6px rgba(0,0,0,0.28)",
        whiteSpace: "nowrap",
      }}
    >
      Click to Add Listing Photo
    </span>
  </>
)}
                  <>
                    {/* EMZ heart logo on brushed-gold background */}
                    <img
                      src="/emz-heart-gold.png"
                      alt="EMZ placeholder"
                      style={{
                        height: "90px",
                        width: "auto",
                        opacity: 0.9,
                        filter:
                          "drop-shadow(0 4px 8px rgba(0,0,0,0.35))",
                      }}
                    />

                    {/* Overlay label */}
                    <span
                      style={{
                        position: "absolute",
                        bottom: "14px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        fontSize: "12px",
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "#111827",
                        background: "rgba(255,255,255,0.9)",
                        padding: "4px 12px",
                        borderRadius: "999px",
                        boxShadow:
                          "0 2px 6px rgba(0,0,0,0.28)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Click to Add Listing Photo
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Thin bar between main & additional */}
            <div
              style={{
                height: "1px",
                background:
                  "linear-gradient(to right, rgba(15,23,42,0), rgba(148,163,184,0.7))",
                margin: "8px 0 10px 0",
              }}
            />

            {/* ADDITIONAL PHOTOS HEADER + BUTTON */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "6px",
                gap: "8px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#e5e7eb",
                  whiteSpace: "nowrap",
                }}
              >
                Additional Photos
              </div>
              <button
                type="button"
                onClick={handleAddAdditionalPhotosClick}
                style={{
                  fontSize: "10px",
                  padding: "4px 10px",
                  borderRadius: "999px",
                  border:
                    "1px solid rgba(56,189,248,0.8)",
                  background:
                    "radial-gradient(circle at top left, #0f172a, #020617)",
                  color: "#e0f2fe",
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Add Additional Photos (up to 9)
              </button>
            </div>

            {/* THUMBNAIL GRID – only shown when there ARE additional photos */}
            {images.some((img, idx) => idx > 0 && img) && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                {images.map(
                  (img, idx) =>
                    idx > 0 &&
                    img && (
                      <div
                        key={idx}
                        onClick={() => handleReplaceImage(idx)}
                        style={{
                          position: "relative",
                          flex: "0 0 calc((100% - 16px) / 3)", // 3 across
                          aspectRatio: "4 / 3",
                          borderRadius: "12px",
                          overflow: "hidden",
                          background: "#020617",
                          cursor: "pointer",
                          boxShadow:
                            "0 8px 24px rgba(15,23,42,0.85)",
                        }}
                      >
                        <img
                          src={img.url}
                          alt={`Additional photo ${idx}`}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                        <span
                          style={{
                            position: "absolute",
                            bottom: "6px",
                            right: "6px",
                            fontSize: "9px",
                            padding: "2px 6px",
                            borderRadius: "999px",
                            background:
                              "rgba(0,0,0,0.55)",
                            color: "#f9fafb",
                          }}
                        >
                          Click to update / replace
                        </span>
                      </div>
                    )
                )}
              </div>
            )}
          </div>

          {/* Currency */}
          <label style={labelStyle}>Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            style={inputStyle}
          >
            <option value="USD">USD – US Dollar</option>
            <option value="PHP">PHP – Philippine Peso</option>
            <option value="JPY">JPY – Japanese Yen</option>
            <option value="EUR">EUR – Euro</option>
          </select>
          <p
            style={{
              fontSize: "10px",
              color: "#9ca3af",
              marginTop: "-4px",
            }}
          >
            Used for your cost and target listing price. Global inventory
            can normalize to USD later.
          </p>

          {/* Cost */}
          <label style={labelStyle}>
            Cost (Your Buy-In, {currency})
          </label>
          <input
            type="number"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            style={inputStyle}
            placeholder="e.g. 350"
          />

          {/* Condition & notes */}
          <label style={labelStyle}>Condition Grade (required)</label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            style={inputStyle}
          >
            <option value="">Select grade…</option>
            <option value="N">N – New</option>
            <option value="A">
              A – Pristine or Unused Condition
            </option>
            <option value="B">
              B – Excellent Preloved with Minor Callouts
            </option>
            <option value="C">
              C – Functional With Signs of Usage
            </option>
            <option value="D">D – Project</option>
            <option value="U">U – Contemporary Brand</option>
          </select>
          <p
            style={{
              fontSize: "10px",
              color: "#facc15",
              marginTop: "-4px",
            }}
          >
            EMZCurator will not run until you choose a grade.
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
            type="button"
            onClick={runAI}
            disabled={isAnalyzing}
            style={{
              marginTop: "10px",
              width: "100%",
              padding: "8px 14px",
              fontSize: "12px",
              borderRadius: "999px",
              border: "1px solid #38bdf8",
              background: isAnalyzing ? "#0f172a" : "#1d4ed8",
              color: "#e5e7eb",
              fontWeight: 600,
              cursor: isAnalyzing ? "default" : "pointer",
              boxShadow:
                "0 0 25px rgba(56,189,248,0.35), 0 0 3px rgba(37,99,235,0.9)",
              textShadow: "0 0 6px rgba(15,23,42,0.9)",
            }}
          >
            {isAnalyzing ? "EMZCurator Thinking…" : "Run EMZCurator AI"}
          </button>
          <p
            style={{
              fontSize: "10px",
              color: "#9ca3af",
              marginTop: "6px",
            }}
          >
            Uses photos + your cost and grade to build a complete
            description you can print and read live.
          </p>
        </section>

        {/* RIGHT COLUMN – Item # + EMZCurator Description + Pricing + Included Items */}
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {/* Item number + Save + Ready to Sell */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                Item #
              </span>
              <input
                type="text"
                value={itemNumber}
                onChange={(e) => setItemNumber(e.target.value)}
                placeholder="Auto-generated on first photo"
                style={{
                  padding: "4px 10px",
                  fontSize: "11px",
                  borderRadius: "999px",
                  border: "1px solid #1f2937",
                  background: "#020617",
                  color: "#e5e7eb",
                  minWidth: "190px",
                  textAlign: "center",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                style={{
                  padding: "8px 14px",
                  fontSize: "12px",
                  borderRadius: "999px",
                  border: "1px solid #facc15",
                  background: "#facc15",
                  color: "#020617",
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

          {/* EMZCurator Description Hero (Print Card) */}
          <div
            style={{
              background:
                "radial-gradient(circle at top, rgba(56,189,248,0.4), rgba(15,23,42,1))",
              borderRadius: "16px",
              border: "1px solid rgba(56,189,248,0.9)",
              padding: "12px",
              boxShadow:
                "0 0 30px rgba(56,189,248,0.45), 0 0 6px rgba(250,204,21,0.4)",
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
                  color: "#e0f2fe",
                }}
              >
                EMZCurator Description
              </h2>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span
                  style={{
                    fontSize: "10px",
                    borderRadius: "999px",
                    padding: "2px 8px",
                    border: "1px solid rgba(250,204,21,0.6)",
                    color: "#facc15",
                    background: "rgba(15,23,42,0.85)",
                  }}
                >
                  Print Card Text
                </span>
                <button
                  type="button"
                  onClick={handlePrintCard}
                  style={{
                    fontSize: "10px",
                    padding: "4px 10px",
                    borderRadius: "999px",
                    border: "1px solid rgba(56,189,248,0.9)",
                    background: "rgba(15,23,42,0.9)",
                    color: "#e0f2fe",
                    cursor: "pointer",
                  }}
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
              style={{
                ...inputStyle,
                fontSize: "11px",
                lineHeight: 1.45,
                background: "rgba(15,23,42,0.96)",
                borderColor: "#1e293b",
                color: "#e5e7eb",
                resize: "none",
                overflow: "hidden",
              }}
              placeholder={
                "When you run EMZCurator AI, a complete description appears here: item number, identity, measurements, features, market note, value range, and sales-forward description — ready to print or read live."
              }
            />
          </div>

          {/* Pricing & Status Card (Listing Price + AI Preview) */}
          <div
            style={{
              background: "rgba(15,23,42,0.96)",
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
                color: "#93c5fd",
                marginBottom: "8px",
              }}
            >
              Pricing & Status
            </h2>

            <label style={labelStyle}>
              Target Listing Price ({currency})
            </label>
            <input
              type="number"
              value={listingPrice}
              onChange={(e) => setListingPrice(e.target.value)}
              style={inputStyle}
              placeholder="EMZCurator suggestion or your own"
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
                  Retail (approx., likely USD): {pricingPreview.retail_price}
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

          {/* Included Items */}
          <div
            style={{
              background: "rgba(15,23,42,0.96)",
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
                color: "#93c5fd",
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
              ref={includedRef}
              value={includedText}
              onChange={(e) => setIncludedText(e.target.value)}
              style={{
                ...inputStyle,
                minHeight: "80px",
                resize: "none",
                overflow: "hidden",
              }}
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
          background: "rgba(15,23,42,0.96)",
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
