"use client";

import { useState, useEffect, useRef, Suspense } from "react";
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

// Escape HTML for print card
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Convert brand string → code
function brandCode(brand) {
  if (!brand) return "BR-GEN";
  const name = brand.toLowerCase();

  if (name.includes("louis") || name.includes("lv")) return "LV";
  if (name.includes("chanel")) return "CH";
  if (name.includes("gucci")) return "GC";
  if (name.includes("prada")) return "PR";
  if (name.includes("miu")) return "MM";
  if (name.includes("burberry")) return "BB";
  if (name.includes("coach")) return "CHC";
  if (name.includes("ferragamo")) return "FG";
  if (name.includes("ysl") || name.includes("saint laurent"))
    return "YSL";
  if (name.includes("celine")) return "CL";

  return "BR-GEN";
}

// Convert model string → code
function modelCode(model) {
  if (!model) return "GEN";
  let normalized = model.toLowerCase();

  if (normalized.includes("neverfull")) return "NVF";
  if (normalized.includes("alma")) return "ALM";
  if (normalized.includes("speedy")) return "SPD";
  if (normalized.includes("passy")) return "PSY";
  if (normalized.includes("pochette")) return "PCH";
  if (normalized.includes("wallet")) return "WLT";
  if (normalized.includes("zippy")) return "ZPY";

  normalized = normalized.replace(/\W+/g, "").toUpperCase();
  if (normalized.length >= 3) {
    return normalized.slice(0, 3);
  }
  if (normalized.length === 2) {
    return normalized + "X";
  }
  if (normalized.length === 1) {
    return normalized + "XX";
  }
  return "GEN";
}

// Sequence number fetch (per brand+model)
async function fetchNextSequence(supabaseClient, brandC, modelC) {
  const compositePrefix = `${brandC}-${modelC}`;

  const { data, error } = await supabaseClient
    .from("sequence_counters")
    .select("*")
    .eq("prefix", compositePrefix)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("Error reading sequence_counters:", error);
    throw error;
  }

  let nextValue = 1;
  if (!data) {
    const { data: inserted, error: insertErr } = await supabaseClient
      .from("sequence_counters")
      .insert({ prefix: compositePrefix, last_value: 1 })
      .select()
      .single();

    if (insertErr) {
      console.error("Error inserting new sequence prefix:", insertErr);
      throw insertErr;
    }
    nextValue = inserted.last_value || 1;
  } else {
    nextValue = (data.last_value || 0) + 1;
    const { error: updateErr } = await supabaseClient
      .from("sequence_counters")
      .update({ last_value: nextValue })
      .eq("prefix", compositePrefix);

    if (updateErr) {
      console.error("Error updating sequence prefix:", updateErr);
      throw updateErr;
    }
  }

  const padded = String(nextValue).padStart(3, "0");
  return padded;
}

// Model code mapping
const MODEL_CODE_MAP = {
  wallet: "WLT",
  "zippy wallet": "ZPY",
  "card holder": "CRD",
  belt: "BEL",
  "crossbody bag": "CRB",
  "shoulder bag": "SHL",
  "tote bag": "TOT",
  "mini bag": "MIN",
  clutch: "CLT",
};

// AI narrative builder
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

  const measurementsParts = [];
  if (dims.length) measurementsParts.push(`L: ${dims.length}`);
  if (dims.height) measurementsParts.push(`H: ${dims.height}`);
  if (dims.depth) measurementsParts.push(`D: ${dims.depth}`);
  const measurementsLine =
    measurementsParts.length > 0 ? measurementsParts.join(" · ") : "";

  const lines = [];

  if (itemNumber) {
    lines.push(`Item #: ${itemNumber}`);
  }

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

  if (measurementsLine) {
    lines.push("");
    lines.push("Typical Measurements:");
    lines.push(measurementsLine);
  }

  if (featureBullets.length > 0) {
    lines.push("");
    lines.push("Key Features:");
    featureBullets.forEach((feat) => {
      lines.push(`• ${feat}`);
    });
  }

  const rarityLine =
    availability.market_rarity || aiResult.included_items_notes || "";
  if (rarityLine) {
    lines.push("");
    lines.push("Market Note:");
    lines.push(rarityLine);
  }

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

  if (description.sales_forward) {
    lines.push("");
    lines.push("—");
    lines.push("Sales-Forward Description:");
    lines.push(description.sales_forward);
  }

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

// Build search keywords (for future SEO & search)
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

const placeholderImages = [
  "/placeholders/Emzthumb-+AddMain.png",
  "/placeholders/Emzthumb-+AddFront.png",
  "/placeholders/Emzthumb-+AddBack.png",
  "/placeholders/Emzthumb-+AddInside.png",
  "/placeholders/Emzthumb-+AddLabel.png",
  "/placeholders/Emzthumb-+AddAuthTags.png",
];

// -------------------------- main component -------------------------
function IntakePageInner() {
  // User — we will later wire this to real auth
  const currentUserId = "demo-user-123";

  // e.g. "LV-PASSY-EMZ-001"
  const [itemNumber, setItemNumber] = useState("");
  const [brandCodeState, setBrandCodeState] = useState("");
  const [modelCodeState, setModelCodeState] = useState("");
  const [sequenceNum, setSequenceNum] = useState("");

  // Brand / model / identity
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [category, setCategory] = useState("");
  const [color, setColor] = useState("");
  const [material, setMaterial] = useState("");

  // Condition
  const [condition, setCondition] = useState("");
  const [gradingNotes, setGradingNotes] = useState("");

  // Currency & pricing
  const [currency, setCurrency] = useState("USD");
  const [cost, setCost] = useState("");
  const [listingPrice, setListingPrice] = useState("");

  // Curator narrative
  const [curatorNarrative, setCuratorNarrative] = useState("");

  // Dimensions
  const [dimensions, setDimensions] = useState({
    length: "",
    height: "",
    depth: "",
    strap_drop: "",
  });

  // Inclusions
  const [includedItems, setIncludedItems] = useState({
    dust_bag: false,
    box: false,
    strap: false,
    auth_card: false,
    tags: false,
    lock_and_key: false,
    extras: [],
  });
  const [includedFreeform, setIncludedFreeform] = useState("");

  const [pricingPreview, setPricingPreview] = useState({
    retail_price: null,
    comp_low: null,
    comp_high: null,
    recommended_listing: null,
    whatnot_start: null,
    sources: [],
  });

  // AI data
  const [aiData, setAiData] = useState(null);

  // listing vs intake status
  const [listForSale, setListForSale] = useState(false);

  // Listing photos
  const [images, setImages] = useState(Array(10).fill(null));

  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [userInventory, setUserInventory] = useState([]);
  const [globalInventory, setGlobalInventory] = useState([]);

  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryStatusFilter, setInventoryStatusFilter] =
    useState("all");

  const [showCompsModal, setShowCompsModal] = useState(false);

  const narrativeRef = useRef(null);
  const includedRef = useRef(null);

  useEffect(() => {
    loadInventory();
  }, []);

  useEffect(() => {
    if (narrativeRef.current) {
      const el = narrativeRef.current;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, [curatorNarrative]);

  useEffect(() => {
    if (includedRef.current) {
      const el = includedRef.current;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, [includedFreeform]);

  useEffect(() => {
    if (!brand) {
      setBrandCodeState("");
      updateItemNumber("", modelCodeState, sequenceNum);
      return;
    }
    const bc = brandCode(brand);
    setBrandCodeState(bc);
    updateItemNumber(bc, modelCodeState, sequenceNum);
  }, [brand]);

  useEffect(() => {
    if (!model) {
      setModelCodeState("");
      updateItemNumber(brandCodeState, "", sequenceNum);
      return;
    }

    const modelLower = model.toLowerCase().trim();
    let selected = "";

    let bestKey = "";
    Object.keys(MODEL_CODE_MAP).forEach((key) => {
      if (modelLower.includes(key) && key.length > bestKey.length) {
        bestKey = key;
      }
    });

    if (bestKey) {
      selected = MODEL_CODE_MAP[bestKey];
    } else {
      selected = modelCode(model);
    }

    setModelCodeState(selected);
    updateItemNumber(brandCodeState, selected, sequenceNum);
  }, [model]);

  useEffect(() => {
    updateItemNumber(brandCodeState, modelCodeState, sequenceNum);
  }, [sequenceNum]);

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

  function updateItemNumber(brandC, modelC, seq) {
    const bc = brandC || "BR-GEN";
    let mc = modelC || "GEN";

    if (!modelC && model) {
      mc = modelCode(model);
    }

    if (!seq) {
      setItemNumber(`${bc}-${mc}`);
      return;
    }

    setItemNumber(`${bc}-${mc}-EMZ-${seq}`);
  }

  function handleListingPhotoClick() {
    handleReplaceImage(0);
  }

  function handleAddAdditionalPhotosClick() {
    const nextSlot = images.findIndex((img, idx) => idx > 0 && img === null);
    if (nextSlot === -1) {
      alert("You’ve reached the maximum of 9 additional photos.");
      return;
    }
    handleReplaceImage(nextSlot);
  }

  function handleReplaceImage(slotIndex) {
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
  }

  function handleIncludedToggle(key) {
    setIncludedItems((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  function handleReadyToSellChange(e) {
    const checked = e.target.checked;
    if (checked) {
      const priceNum = Number(listingPrice || 0);
      if (!listingPrice || isNaN(priceNum) || priceNum <= 0) {
        alert(
          "Please Set Listing Price greater than zero before marking Ready to Sell."
        );
        return;
      }
    }
    setListForSale(checked);
  }

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

      if (identity.brand) setBrand((prev) => prev || identity.brand);
      if (identity.model) setModel((prev) => prev || identity.model);
      if (identity.category_primary)
        setCategory((prev) => prev || identity.category_primary);
      if (identity.color) setColor((prev) => prev || identity.color);
      if (identity.material) setMaterial((prev) => prev || identity.material);

      if (data.dimensions) {
        setDimensions((prev) => ({
          length: data.dimensions.length || prev.length,
          height: data.dimensions.height || prev.height,
          depth: data.dimensions.depth || prev.depth,
          strap_drop: data.dimensions.strap_drop || prev.strap_drop,
        }));
      }

      if (Array.isArray(data.included_items)) {
        const updated = { ...includedItems };
        const freeformExtras = [];

        data.included_items.forEach((inc) => {
          const normalized = inc.toLowerCase();
          if (normalized.includes("dust")) updated.dust_bag = true;
          else if (normalized.includes("box")) updated.box = true;
          else if (normalized.includes("strap"))
            updated.strap = true;
          else if (normalized.includes("auth") || normalized.includes("card"))
            updated.auth_card = true;
          else if (normalized.includes("tag")) updated.tags = true;
          else if (
            normalized.includes("lock") ||
            normalized.includes("key")
          )
            updated.lock_and_key = true;
          else freeformExtras.push(inc);
        });

        updated.extras = freeformExtras;
        setIncludedItems(updated);
        if (freeformExtras.length > 0) {
          setIncludedFreeform(freeformExtras.join("\n"));
        }
      }

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

      const narrative = buildCuratorNarrative({
        aiResult: data,
        override: {
          itemNumber,
          brand,
          model,
          category,
          color,
          material,
          condition,
          gradingNotes,
        },
      });

      if (!curatorNarrative) {
        setCuratorNarrative(narrative);
      }

      const identityForKeywords = {
        ...identity,
        brand: brand || identity.brand || null,
        model: model || identity.model || null,
        category_primary: category || identity.category_primary || null,
        color: color || identity.color || null,
        material: material || identity.material || null,
      };

      const includedList = data.included_items || [];

      const suggestedKeywords = buildSearchKeywords({
        identity: identityForKeywords,
        narrative: narrative,
        includedItems: includedList,
      });

      console.log("Suggested keywords:", suggestedKeywords);
    } catch (err) {
      console.error(err);
      alert("EMZCurator AI lookup failed.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    if (!condition) {
      setErrorMsg("Please grade the condition of the item.");
      setIsSaving(false);
      return;
    }

    if (listForSale) {
      const priceNum = Number(listingPrice || 0);
      if (!listingPrice || isNaN(priceNum) || priceNum <= 0) {
        setErrorMsg(
          "Please Set Listing Price greater than zero before saving as Ready to Sell."
        );
        setIsSaving(false);
        return;
      }
    }

    try {
      const brandC = brandCode(brand);
      const modelC = modelCode(model);
      const nextSequence = await fetchNextSequence(
        supabase,
        brandC,
        modelC
      );

      setBrandCodeState(brandC);
      setModelCodeState(modelC);
      setSequenceNum(nextSequence);

      const finalItemNumber = `${brandC}-${modelC}-EMZ-${nextSequence}`;
      setItemNumber(finalItemNumber);

      const imagesPayload = images.filter((img) => img !== null);
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

      const freeformLines = includedFreeform
        .split("\n")
        .map((x) => x.trim())
        .filter((x) => x.length > 0);

      const compiledIncluded = [
        includedItems.dust_bag ? "Dust bag" : null,
        includedItems.box ? "Box" : null,
        includedItems.strap ? "Strap" : null,
        includedItems.auth_card ? "Authenticity card" : null,
        includedItems.tags ? "Tags" : null,
        includedItems.lock_and_key ? "Lock and key set" : null,
        ...(includedItems.extras || []),
        ...freeformLines,
      ].filter(Boolean);

      const search_keywords = buildSearchKeywords({
        identity,
        narrative: curatorNarrative,
        includedItems: compiledIncluded,
      });

      const payload = {
        user_id: currentUserId,
        item_number: finalItemNumber,
        brand: identity.brand,
        model: identity.model,
        category: identity.category_primary,
        color: identity.color,
        material: identity.material,
        description: curatorNarrative || null,
        condition,
        condition_notes: gradingNotes || null,
        currency,
        cost: cost ? Number(cost) : null,
        listing_price: listingPrice ? Number(listingPrice) : null,
        images: imagesPayload,
        identity,
        dimensions,
        included_items: compiledIncluded,
        pricing,
        seo,
        search_keywords,
        status: listForSale ? "ready_to_sell" : "intake",
        is_public: listForSale,
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

      setSuccessMsg(
        listForSale
          ? "Item added and marked ready to sell."
          : "Item saved to inventory."
      );

      await loadInventory();
    } catch (err) {
      console.error(err);
      setErrorMsg("Could not save item.");
    } finally {
      setIsSaving(false);
    }
  }

  const latestFive = userInventory.slice(0, 5);

  const filteredInventory = userInventory.filter((item) => {
    const term = inventorySearch.trim().toLowerCase();
    if (inventoryStatusFilter !== "all") {
      if ((item.status || "intake") !== inventoryStatusFilter)
        return false;
    }
    if (!term) return true;
    const sku = (item.item_number || "").toLowerCase();
    const b = (item.brand || "").toLowerCase();
    const m = (item.model || "").toLowerCase();
    return (
      sku.includes(term) ||
      b.includes(term) ||
      m.includes(term)
    );
  });

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
      <div
        style={{
          maxWidth: "1180px",
          margin: "0 auto 16px auto",
          padding: "18px 24px 16px 24px",
          borderRadius: "20px",
          border: "1px solid rgba(212,175,55,0.35)",
          background: "linear-gradient(135deg, #ffffff, #f9fafb)",
          boxShadow:
            "0 8px 22px rgba(15,23,42,0.10), 0 0 14px rgba(56,189,248,0.16)",
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "18px",
              flex: 1,
              minWidth: 0,
            }}
          >
            <img
              src="/emz-loveluxury-logo-horizontal.png"
              alt="EMZLoveLuxury"
              style={{
                height: "60px",
                width: "auto",
                display: "block",
              }}
            />
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
                cursor: "default",
                whiteSpace: "nowrap",
                boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                backdropFilter: "blur(3px)",
              }}
            >
              Powered by EMZLoveLuxury AI
            </button>
          </div>
        </div>

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

        <div
          style={{
            marginTop: "10px",
            borderTop: "1px solid #e5e7eb",
          }}
        />
      </div>

      <div
        style={{
          maxWidth: "1180px",
          margin: "0 auto 12px auto",
          padding: "8px 12px",
          borderRadius: "999px",
          border: "1px solid rgba(30,64,175,0.6)",
          background:
            "linear-gradient(90deg, rgba(15,23,42,0.95), rgba(8,47,73,0.95))",
          boxShadow: "0 12px 28px rgba(15,23,42,0.8)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: "11px", color: "#9ca3af" }}>
            Item ID / SKU
          </span>
          <input
            type="text"
            value={itemNumber}
            readOnly
            placeholder="Generated when you save"
            style={{
              padding: "4px 10px",
              fontSize: "11px",
              borderRadius: "999px",
              border: "1px solid #1f2937",
              background: "#020617",
              color: "#e5e7eb",
              minWidth: "230px",
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
              : "Save to EMZ DB"}
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
              onChange={handleReadyToSellChange}
            />
            Ready to Sell
          </label>
        </div>
      </div>

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
            <div
              style={{
                height: "1px",
                background:
                  "linear-gradient(to right, rgba(148,163,184,0.8), rgba(15,23,42,0))",
                marginBottom: "10px",
              }}
            />
            <div style={{ marginBottom: "12px" }}>
              <div
                onClick={handleListingPhotoClick}
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "4 / 3",
                  borderRadius: "18px",
                  overflow: "hidden",
                  backgroundImage: "url('/emz-heart-gold.png')",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                  boxShadow: "0 18px 40px rgba(0,0,0,0.55)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition:
                    "transform 0.16s ease, box-shadow 0.16s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform =
                    "translateY(-1px) scale(1.01)";
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
            <div
              style={{
                height: "1px",
                background:
                  "linear-gradient(to right, rgba(15,23,42,0), rgba(148,163,184,0.7))",
                margin: "8px 0 10px 0",
              }}
            />
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
                  border: "1px solid rgba(56,189,248,0.8)",
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
                          flex: "0 0 calc((100% - 16px) / 3)",
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
                            background: "rgba(0,0,0,0.55)",
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

        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
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
                  Print Card and Tags
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
                "When you run EMZCurator AI, a complete description appears here: item number, identity, measurements, features, market note, comps, and the final sales-forward narration."
              }
            />
            <p
              style={{
                fontSize: "10px",
                color: "#bfdbfe",
                marginTop: "6px",
              }}
            >
              When you click <strong>Print Card and Tags</strong>, the
              system will generate the full 8.5×11 card with EMZCurator
              Description, Comparable Sales, Inclusions, and a detachable
              foldable tag with logo ×2, QR code, barcode, and the item ID.
            </p>
          </div>

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
              Set Listing Price ({currency})
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
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "4px",
                }}
              >
                <strong style={{ fontSize: "12px" }}>
                  Comparable Sales Listings
                </strong>
                {pricingPreview.sources &&
                  pricingPreview.sources.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowCompsModal(true)}
                      style={{
                        fontSize: "10px",
                        padding: "3px 8px",
                        borderRadius: "999px",
                        border: "1px solid rgba(56,189,248,0.9)",
                        background: "rgba(15,23,42,0.9)",
                        color: "#e0f2fe",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Show It
                    </button>
                  )}
              </div>
              {pricingPreview.retail_price && (
                <p style={previewStyle}>
                  Retail (approx., often USD): {pricingPreview.retail_price}
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
              {!pricingPreview.retail_price &&
                !pricingPreview.comp_low &&
                !pricingPreview.comp_high &&
                !pricingPreview.recommended_listing &&
                !pricingPreview.whatnot_start && (
                  <p style={previewStyle}>
                    Run EMZCurator AI to pull recent comparable sales and
                    suggested pricing.
                  </p>
                )}
            </div>
          </div>

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
              Inclusions
            </h2>
            <p
              style={{
                fontSize: "11px",
                color: "#9ca3af",
                marginBottom: "4px",
              }}
            >
              Check the standard items here, and add anything else in the
              freeform box below.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "4px",
                marginBottom: "8px",
              }}
            >
              <label style={checkLabelStyle}>
                <input
                  type="checkbox"
                  checked={includedItems.dust_bag}
                  onChange={() => handleIncludedToggle("dust_bag")}
                />
                Dust bag
              </label>
              <label style={checkLabelStyle}>
                <input
                  type="checkbox"
                  checked={includedItems.box}
                  onChange={() => handleIncludedToggle("box")}
                />
                Box
              </label>
              <label style={checkLabelStyle}>
                <input
                  type="checkbox"
                  checked={includedItems.strap}
                  onChange={() => handleIncludedToggle("strap")}
                />
                Strap
              </label>
              <label style={checkLabelStyle}>
                <input
                  type="checkbox"
                  checked={includedItems.auth_card}
                  onChange={() => handleIncludedToggle("auth_card")}
                />
                Auth card
              </label>
              <label style={checkLabelStyle}>
                <input
                  type="checkbox"
                  checked={includedItems.tags}
                  onChange={() => handleIncludedToggle("tags")}
                />
                Tags
              </label>
              <label style={checkLabelStyle}>
                <input
                  type="checkbox"
                  checked={includedItems.lock_and_key}
                  onChange={() => handleIncludedToggle("lock_and_key")}
                />
                Lock &amp; key
              </label>
            </div>
            <p
              style={{
                fontSize: "11px",
                color: "#9ca3af",
                marginBottom: "4px",
              }}
            >
              Freeform extras (one per line):
            </p>
            <textarea
              ref={includedRef}
              value={includedFreeform}
              onChange={(e) => setIncludedFreeform(e.target.value)}
              style={{
                ...inputStyle,
                minHeight: "80px",
                resize: "none",
                overflow: "hidden",
              }}
              placeholder={"Extra chain strap\nOrganizer insert\nCharm or keyfob"}
            />
          </div>
        </section>
      </div>

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
        <h3
          style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}
        >
          Inventory
        </h3>

        {userInventory.length === 0 ? (
          <p style={{ fontSize: "12px", color: "#9ca3af" }}>
            No items yet. Save an intake to see it here.
          </p>
        ) : (
          <>
            <p
              style={{
                fontSize: "11px",
                color: "#9ca3af",
                marginBottom: "6px",
              }}
            >
              Showing your 5 most recent intakes:
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                marginBottom: "12px",
              }}
            >
              {latestFive.map((item) => {
                const hero =
                  item.images &&
                  item.images[0] &&
                  (item.images[0].url ||
                    item.images[0].image_url ||
                    item.images[0].src);
                return (
                  <div
                    key={item.id}
                    style={{
                      flex: "0 0 min(180px, 100%)",
                      borderRadius: "10px",
                      overflow: "hidden",
                      border: "1px solid #111827",
                      background: "#020617",
                      boxShadow: "0 8px 20px rgba(0,0,0,0.6)",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "4 / 3",
                        background: "#020617",
                        overflow: "hidden",
                      }}
                    >
                      {hero ? (
                        <img
                          src={hero}
                          alt={item.model || item.brand || "Inventory item"}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "10px",
                            color: "#6b7280",
                          }}
                        >
                          No photo
                        </div>
                      )}
                    </div>
                    <div style={{ padding: "6px 8px" }}>
                      <div
                        style={{
                          fontSize: "10px",
                          color: "#9ca3af",
                          marginBottom: "2px",
                        }}
                      >
                        {item.item_number || "—"}
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#e5e7eb",
                        }}
                      >
                        {item.brand || "—"}
                      </div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: "#9ca3af",
                        }}
                      >
                        {item.model || "—"}
                      </div>
                      <div
                        style={{
                          fontSize: "10px",
                          marginTop: "4px",
                          color:
                            (item.status || "intake") === "ready_to_sell"
                              ? "#bbf7d0"
                              : "#fde68a",
                        }}
                      >
                        {(item.status || "intake") === "ready_to_sell"
                          ? "Ready to Sell"
                          : "Intake"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <input
                type="text"
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                placeholder="Search by SKU, brand, or model…"
                style={{
                  ...inputStyle,
                  marginBottom: 0,
                  flex: 1,
                  fontSize: "11px",
                }}
              />
              <select
                value={inventoryStatusFilter}
                onChange={(e) =>
                  setInventoryStatusFilter(e.target.value)
                }
                style={{
                  ...inputStyle,
                  marginBottom: 0,
                  width: "180px",
                  fontSize: "11px",
                }}
              >
                <option value="all">All statuses</option>
                <option value="intake">Intake</option>
                <option value="ready_to_sell">Ready to Sell</option>
              </select>
            </div>

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
                  {filteredInventory.map((item) => (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: "1px solid #020617",
                        background: "#020617",
                      }}
                    >
                      <td style={{ padding: "4px 8px" }}>
                        {item.item_number || "—"}
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
          </>
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

      {showCompsModal && (
        <div style={modalBackdropStyle}>
          <div style={modalWindowStyle}>
            <h3
              style={{
                fontSize: "14px",
                fontWeight: 600,
                marginBottom: "6px",
              }}
            >
              Comparable Sales Listings
            </h3>
            <p
              style={{
                fontSize: "11px",
                color: "#9ca3af",
                marginBottom: "8px",
              }}
            >
              Pulled from EMZCurator AI lookup. Use these as a quick feel for
              market range.
            </p>
            <div
              style={{
                maxHeight: "260px",
                overflowY: "auto",
                borderRadius: "8px",
                border: "1px solid #1f2937",
                padding: "8px",
                background: "#020617",
                fontSize: "11px",
              }}
            >
              {pricingPreview.sources && pricingPreview.sources.length > 0 ? (
                pricingPreview.sources.map((src, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "6px 4px",
                      borderBottom:
                        idx === pricingPreview.sources.length - 1
                          ? "none"
                          : "1px solid #111827",
                    }}
                  >
                    {typeof src === "string" ? (
                      <span>{src}</span>
                    ) : (
                      <pre
                        style={{
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {JSON.stringify(src, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              ) : (
                <p style={{ fontSize: "11px", color: "#9ca3af" }}>
                  No comparable listings were returned by EMZCurator for this
                  item yet.
                </p>
              )}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "10px",
              }}
            >
              <button
                type="button"
                onClick={() => setShowCompsModal(false)}
                style={{
                  padding: "6px 14px",
                  fontSize: "11px",
                  borderRadius: "999px",
                  border: "1px solid #38bdf8",
                  background: "#0f172a",
                  color: "#e0f2fe",
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

const checkLabelStyle = {
  fontSize: "11px",
  display: "flex",
  alignItems: "center",
  gap: "4px",
  color: "#e5e7eb",
};

const modalBackdropStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.75)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
};

const modalWindowStyle = {
  width: "min(480px, 100% - 32px)",
  borderRadius: "16px",
  border: "1px solid rgba(56,189,248,0.8)",
  background: "rgba(15,23,42,0.98)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.95)",
  padding: "14px 16px 12px 16px",
};

export default function IntakePage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            background: "#020617",
            color: "#e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          }}
        >
          Loading intake…
        </div>
      }
    >
      <IntakePageInner />
    </Suspense>
  );
}
