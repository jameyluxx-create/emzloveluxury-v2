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

// Escape HTML for print card (safe for non-string input)
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
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
  if (name.includes("ysl") || name.includes("saint laurent")) return "YSL";
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

// EMZCurator narrative builder (sectioned, neutral, user-grade-aware)
function buildCuratorNarrative({ aiResult, override }) {
  if (!aiResult) {
    return "Run EMZCurator AI to generate a narrative for this item.";
  }

  const identity = aiResult.identity || {};
  const dims = aiResult.dimensions || {};
  const description = aiResult.description || {};
  const availability = aiResult.availability || {};

  const brand = override.brand || identity.brand || "";
  const model = override.model || identity.model || "";
  const category = override.category || identity.category_primary || "";
  const color = override.color || identity.color || "";
  const material = override.material || identity.material || "";
  const conditionGrade = override.condition || "";

  const measurementsParts = [];
  if (dims.length) measurementsParts.push(`L: ${dims.length}`);
  if (dims.height) measurementsParts.push(`H: ${dims.height}`);
  if (dims.depth) measurementsParts.push(`D: ${dims.depth}`);
  if (dims.strap_drop) measurementsParts.push(`Strap Drop: ${dims.strap_drop}`);

  const measurementsText =
    measurementsParts.length > 0 ? measurementsParts.join(" · ") : "";

  const clean = (txt) => (txt || "").trim().replace(/\s+/g, " ");

  const sections = [];

  // 1) IDENTITY & ORIGIN
  {
    const lines = [];
    const hasIdentityFields = brand || model || category || color || material;

    if (hasIdentityFields) {
      const nameParts = [];
      if (brand) nameParts.push(brand);
      if (model) nameParts.push(model);
      const identifier = nameParts.join(" ").trim();

      const role = category ? `a ${category} piece` : "an item";

      const surfaceParts = [];
      if (color) surfaceParts.push(color);
      if (material) surfaceParts.push(material);
      const surfaceText =
        surfaceParts.length > 0 ? ` in ${surfaceParts.join(" ")}` : "";

      const introSentence = identifier
        ? `${identifier} is identified as ${role}${surfaceText}.`
        : `This item is identified as ${role}${surfaceText}.`;

      lines.push(introSentence.trim());
    }

    if (clean(description.model_notes)) {
      lines.push(clean(description.model_notes));
    }

    if (measurementsText) {
      lines.push(
        `Typical measurements for this style are approximately ${measurementsText}.`
      );
    }

    if (lines.length > 0) {
      sections.push({
        header: "IDENTITY & ORIGIN",
        body: lines.join("\n\n"),
      });
    }
  }

  // 2) DESIGN & FUNCTION
  {
    const lines = [];

    if (clean(description.history)) {
      lines.push(clean(description.history));
    }

    if (clean(description.styling)) {
      lines.push(clean(description.styling));
    }

    if (lines.length > 0) {
      sections.push({
        header: "DESIGN & FUNCTION",
        body: lines.join("\n\n"),
      });
    }
  }

  // 3) MARKET & RARITY
  {
    const lines = [];

    const marketNote = clean(availability.market_rarity);
    const similar = availability.similar_items_found;

    if (marketNote) {
      lines.push(marketNote);
    }

    if (similar !== null && similar !== undefined) {
      lines.push(
        `Approximate comparable availability: ${similar} similar item${
          similar === 1 ? "" : "s"
        } observed in major resale markets.`
      );
    }

    if (clean(description.sales_forward)) {
      lines.push(clean(description.sales_forward));
    }

    if (lines.length > 0) {
      sections.push({
        header: "MARKET & RARITY",
        body: lines.join("\n\n"),
      });
    }
  }

  // 4) USER CONDITION GRADE
  if (conditionGrade) {
    const gradeMap = {
      S: "S – Brand New",
      SA: "SA – Unused",
      A: "A – Excellent",
      AB: "AB – Good",
      B: "B – Average",
      C: "C – Damaged",
      U: "U – Contemporary Brand",
    };

    sections.push({
      header: "USER CONDITION GRADE",
      body: gradeMap[conditionGrade] || conditionGrade,
    });
  }

  const finalNarrative = sections
    .map(
      (sec) => `${sec.header}\n${"-".repeat(sec.header.length)}\n${sec.body}`
    )
    .join("\n\n\n");

  return (
    finalNarrative ||
    "Run EMZCurator AI to generate a narrative for this item."
  );
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

// ----------------- slug helper (ITEMNUMBER-brand-model) -----------------
function buildInventorySlug(itemNumber, brand, model) {
  const parts = [];

  if (brand) parts.push(String(brand));
  if (model) parts.push(String(model));

  const base = parts.join(" ").toLowerCase();

  const simpleSlug = base
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

  if (!itemNumber && !simpleSlug) return "";
  if (!simpleSlug) return String(itemNumber).toLowerCase();
  if (!itemNumber) return simpleSlug;

  return `${String(itemNumber).toLowerCase()}-${simpleSlug}`;
}

// -------------------------- main component -------------------------

function IntakePageInner() {
  const [currentUserId, setCurrentUserId] = useState(null);

  // Tracking the DB row + SKU lock
  const [listingId, setListingId] = useState(null);
  const [skuLocked, setSkuLocked] = useState(false);

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

  // --------- auth: get real user id ----------
  useEffect(() => {
    async function fetchUser() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          console.error("Error fetching Supabase user", error);
          return;
        }
        if (data?.user?.id) {
          setCurrentUserId(data.user.id);
        }
      } catch (err) {
        console.error("Unexpected error getting user", err);
      }
    }
    fetchUser();
  }, []);

  // --------- load inventory once we know the user ----------
  useEffect(() => {
    if (!currentUserId) return;
    loadInventory(currentUserId);
  }, [currentUserId]);

  // --------- auto-resize narrative textarea ----------
  useEffect(() => {
    if (narrativeRef.current) {
      const el = narrativeRef.current;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, [curatorNarrative]);

  // --------- auto-resize included textarea ----------
  useEffect(() => {
    if (includedRef.current) {
      const el = includedRef.current;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, [includedFreeform]);

  // --------- brand / model / sequence → itemNumber ----------
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

  // ---------------- helpers inside component ----------------

  async function loadInventory(userIdOverride) {
    const userId = userIdOverride || currentUserId;
    if (!userId) return;

    try {
      const { data: allListings } = await supabase
        .from("inventory_items")
        .select("*")
        .order("created_at", { ascending: false });

      const { data: myListings } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (allListings) setGlobalInventory(allListings);
      if (myListings) setUserInventory(myListings);
    } catch (err) {
      console.error("Error loading inventory", err);
    }
  }

  function updateItemNumber(brandC, modelC, seq) {
    // Once a real SKU has been created, never auto-change it again
    if (skuLocked) return;

    const bc = brandC || "BR-GEN";
    let mc = modelC || "GEN";

    if (!modelC && model) {
      mc = modelCode(model);
    }

    if (!seq) {
      // Preview-style ID before a true SKU exists
      setItemNumber(`${bc}-${mc}`);
      return;
    }

    setItemNumber(`${bc}-${mc}-EMZ-${seq}`);
  }

  function handleListingPhotoClick() {
    handleReplaceImage(0);
  }

  function handleAddAdditionalPhotosClick() {
    const nextSlot = images.findIndex(
      (img, idx) => idx > 0 && img === null
    );
    if (nextSlot === -1) {
      alert("You’ve reached the maximum of 9 additional photos.");
      return;
    }
    handleReplaceImage(nextSlot);
  }

  async function handleReplaceImage(slotIndex) {
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
        const prefix = currentUserId || "anonymous";
        const filePath = `${prefix}/${fileName}`;

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

        // ---------- tie hero photo to SKU + DB row ----------
        if (slotIndex === 0) {
          // If no logged in user yet, just store in state; handleSave will create row later.
          if (!currentUserId) {
            return;
          }

          try {
            const imagesPayload = next.filter((img) => img !== null);

            if (listingId) {
              // Just update images on existing row
              const { error: updateErr } = await supabase
                .from("inventory_items")
                .update({ images: imagesPayload })
                .eq("id", listingId);

              if (updateErr) {
                console.error(
                  "Error updating inventory item images:",
                  updateErr
                );
              }
            } else {
              // First hero photo → generate SKU + create row
              const brandC = brandCode(brand);
              const modelC = modelCode(model);
              const nextSeq = await fetchNextSequence(
                supabase,
                brandC,
                modelC
              );

              const newItemNumber = `${brandC}-${modelC}-EMZ-${nextSeq}`;

              setBrandCodeState(brandC);
              setModelCodeState(modelC);
              setSequenceNum(nextSeq);
              setItemNumber(newItemNumber);
              setSkuLocked(true); // lock SKU from now on

              const { data, error: insertErr } = await supabase
                .from("inventory_items")
                .insert({
                  user_id: currentUserId,
                  item_number: newItemNumber,
                  brand: brand || null,
                  model: model || null,
                  category: category || null,
                  color: color || null,
                  material: material || null,
                  condition: condition || null,
                  condition_notes: gradingNotes || null,
                  currency,
                  cost: cost ? Number(cost) : null,
                  listing_price: listingPrice ? Number(listingPrice) : null,
                  images: imagesPayload,
                  status: "intake",
                  is_public: false,
                })
                .select()
                .single();

              if (insertErr) {
                console.error(
                  "Error creating new inventory item from main photo:",
                  insertErr
                );
              } else if (data) {
                setListingId(data.id);
                await loadInventory(currentUserId);
              }
            }
          } catch (err2) {
            console.error("Error handling main photo SKU/listing:", err2);
          }
        } else if (listingId) {
          // Additional photos: keep DB in sync
          try {
            const imagesPayload = next.filter((img) => img !== null);
            const { error: updateErr } = await supabase
              .from("inventory_items")
              .update({ images: imagesPayload })
              .eq("id", listingId);

            if (updateErr) {
              console.error(
                "Error updating inventory item with additional photo:",
                updateErr
              );
            }
          } catch (err3) {
            console.error(
              "Error updating inventory item with additional photo:",
              err3
            );
          }
        }
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
          else if (normalized.includes("strap")) updated.strap = true;
          else if (normalized.includes("auth") || normalized.includes("card"))
            updated.auth_card = true;
          else if (normalized.includes("tag")) updated.tags = true;
          else if (normalized.includes("lock") || normalized.includes("key"))
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

  // --------- SAVE: write intake → inventory_items ----------
  async function handleSave() {
    setIsSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    if (!currentUserId) {
      setErrorMsg("You must be logged in to save items.");
      setIsSaving(false);
      return;
    }

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

    // HARD RULE for *new* items: either already have a row, or we must have a hero photo
    const hero = images[0];
    if (!listingId && (!hero || !hero.url)) {
      setErrorMsg(
        "Add a listing photo (main image) or load an existing SKU before saving this item."
      );
      setIsSaving(false);
      return;
    }

    try {
      // 1) Ensure we have a FINAL SKU
      let finalItemNumber = itemNumber;
      let nextSeq = sequenceNum;

      if (
        !skuLocked ||
        !finalItemNumber ||
        finalItemNumber.startsWith("EMZ-TEMP")
      ) {
        const brandC = brandCode(brand);
        const modelC = modelCode(model);
        nextSeq = await fetchNextSequence(supabase, brandC, modelC);

        finalItemNumber = `${brandC}-${modelC}-EMZ-${nextSeq}`;

        setBrandCodeState(brandC);
        setModelCodeState(modelC);
        setSequenceNum(nextSeq);
        setItemNumber(finalItemNumber);
        setSkuLocked(true);
      }

      // 2) Build payload
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

      const freeformLines = (includedFreeform || "")
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

      // 3) UPDATE vs INSERT
      let data;
      let error;

      if (listingId) {
        ({ data, error } = await supabase
          .from("inventory_items")
          .update(payload)
          .eq("id", listingId)
          .select()
          .single());
      } else {
        ({ data, error } = await supabase
          .from("inventory_items")
          .insert(payload)
          .select()
          .single());
      }

      if (error) {
        console.error(error);
        setErrorMsg("Could not save item.");
        setIsSaving(false);
        return;
      }

      if (data?.id && !listingId) {
        setListingId(data.id);
      }

      setSuccessMsg(
        listForSale
          ? "Item added and marked ready to sell."
          : "Item saved to inventory."
      );

      await loadInventory(currentUserId);
    } catch (err) {
      console.error(err);
      setErrorMsg("Could not save item.");
    } finally {
      setIsSaving(false);
    }
  }

  function handlePrintCard() {
    const safeItemNumberRaw = itemNumber || "(not assigned yet)";
    const safeItemNumber = escapeHtml(safeItemNumberRaw);

    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://emzloveluxury.com";

    const rawItemNumber =
      itemNumber && itemNumber !== "(not assigned yet)" ? itemNumber : "";

    const slug = rawItemNumber
      ? buildInventorySlug(rawItemNumber, brand, model)
      : "pending";

    const itemUrl = `${origin}/item/${encodeURIComponent(slug)}`;

    const logoUrl =
      "https://emzloveluxury.com/emz-loveluxury-logo-horizontal.png";

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
      itemUrl
    )}&size=350x350&margin=0&format=png`;

    const barcodeText = rawItemNumber || "PENDING";
    const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(
      barcodeText
    )}&scale=3&includetext&background=ffffff`;

    const dimsParts = [];
    if (dimensions.length) dimsParts.push(`L: ${dimensions.length}`);
    if (dimensions.height) dimsParts.push(`H: ${dimensions.height}`);
    if (dimensions.depth) dimsParts.push(`D: ${dimensions.depth}`);
    if (dimensions.strap_drop)
      dimsParts.push(`Strap Drop: ${dimensions.strap_drop}`);

    const safeBrand = escapeHtml(brand || "");
    const safeModel = escapeHtml(model || "");
    const safeCategory = escapeHtml(category || "");
    const safeColor = escapeHtml(color || "");
    const safeMaterial = escapeHtml(material || "");
    const safeCondition = escapeHtml(condition || "");
    const safeNotes = escapeHtml(gradingNotes || "");
    const safeItemUrl = escapeHtml(itemUrl);
    const safeNarrative = escapeHtml(curatorNarrative || "").trim();

    const retailHighRaw =
      pricingPreview.comp_high !== null &&
      pricingPreview.comp_high !== undefined
        ? String(pricingPreview.comp_high)
        : "";
    const safeRetailHigh = retailHighRaw ? escapeHtml(retailHighRaw) : "";

    const emzSaleRaw =
      listingPrice && String(listingPrice).trim().length > 0
        ? `${currency} ${listingPrice}`
        : "";
    const safeEmzSale = emzSaleRaw ? escapeHtml(emzSaleRaw) : "";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Print Card — ${safeItemNumber}</title>

  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 30px;
      color: #333;
    }

    .noclip {
      page-break-inside: avoid;
    }

    h2 {
      font-size: 18px;
      margin-bottom: 4px;
      color: #000;
      letter-spacing: 0.5px;
    }

    .section-header {
      font-weight: bold;
      font-size: 14px;
      border-bottom: 1px solid #ddd;
      margin-top: 20px;
      margin-bottom: 8px;
      padding-bottom: 4px;
      color: #000;
    }

    .gold-box {
      border: 2px solid #facc15;
      padding: 18px;
      border-radius: 8px;
      margin-bottom: 40px;
    }

    .row {
      display: flex;
      justify-content: space-between;
      gap: 40px;
    }

    .col {
      flex: 1;
    }

    .tag-container {
      width: 100%;
      margin-top: 20px;
    }

    .tag-row {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      width: 100%;
      margin-bottom: 30px;
    }

    .tag {
      flex: 1;
      border: 2px solid #555;
      border-radius: 10px;
      padding: 20px;
      height: 240px;
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .tag-logo-center {
      width: 160px;
      opacity: 0.9;
    }

    .tag-info {
      font-size: 12px;
      line-height: 1.35;
      letter-spacing: 0.4px;
    }

    .tag-price {
      margin-top: 6px;
      font-size: 12px;
    }

    .barcode {
      width: 220px;
      height: 60px;
    }

    .qr {
      width: 90px;
      height: 90px;
    }

    footer {
      text-align: center;
      margin-top: 40px;
      font-size: 12px;
      color: #777;
    }
  </style>
</head>

<body>

  <div class="gold-box noclip">
    <h2>ITEM INFORMATION</h2>
    <div class="row">
      <div class="col">
        <p><strong>Item #:</strong> ${safeItemNumber}</p>
        <p><strong>Brand:</strong> ${safeBrand}</p>
        <p><strong>Model:</strong> ${safeModel}</p>
        <p><strong>Category:</strong> ${safeCategory}</p>
        <p><strong>Color:</strong> ${safeColor}</p>
        <p><strong>Material:</strong> ${safeMaterial}</p>
        <p><strong>Condition Grade:</strong> ${safeCondition}</p>
        <p><strong>Condition Notes:</strong> ${safeNotes}</p>
        ${
          dimsParts.length
            ? `<p><strong>Measurements:</strong> ${dimsParts.join(" • ")}</p>`
            : ""
        }
        <p><strong>Public URL:</strong> ${safeItemUrl}</p>
      </div>

      <div class="col">
        <h3 class="section-header">EMZCURATOR DESCRIPTION</h3>
        <p style="white-space: pre-wrap; font-size: 13px;">${safeNarrative}</p>
      </div>
    </div>
  </div>

  <div class="tag-container">
    <div class="tag-row noclip">
      <div class="tag">
        <div class="tag-info">
          <strong>ITEM #:</strong> ${safeItemNumber}<br/>
          <strong>Brand:</strong> ${safeBrand}<br/>
          <strong>Retail High (Comp):</strong> ${safeRetailHigh}<br/>
          ${
            safeEmzSale
              ? `<strong>EMZSale:</strong> ${safeEmzSale}<br/>`
              : ""
          }
        </div>

        <img src="${logoUrl}" class="tag-logo-center" />

        <div style="text-align:right;">
          <img class="barcode" src="${barcodeUrl}" />
        </div>
      </div>

      <div class="tag">
        <img src="${logoUrl}" class="tag-logo-center" />

        <div class="tag-info">
          <strong>ITEM #:</strong> ${safeItemNumber}<br/>
          <strong>Brand:</strong> ${safeBrand}<br/>
          <strong>Retail High (Comp):</strong> ${safeRetailHigh}<br/>
        </div>

        <div style="text-align:right;">
          <img class="qr" src="${qrUrl}" />
        </div>
      </div>
    </div>
  </div>

  <footer>EMZLoveLuxury.com</footer>

</body>
</html>
`;

    const printWindow = window.open(
      "printcard://emzloveluxury.com",
      "_blank"
    );
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    } else {
      alert("Popup blocked. Please allow popups for this site.");
    }
  }

  // --------- derived inventory views ----------
  const latestFive = userInventory.slice(0, 5);

  const filteredInventory = userInventory.filter((item) => {
    const term = inventorySearch.trim().toLowerCase();
    if (inventoryStatusFilter !== "all") {
      if ((item.status || "intake") !== inventoryStatusFilter) return false;
    }
    if (!term) return true;
    const sku = (item.item_number || "").toLowerCase();
    const b = (item.brand || "").toLowerCase();
    const m = (item.model || "").toLowerCase();
    return sku.includes(term) || b.includes(term) || m.includes(term);
  });

  const slugForHeader =
    itemNumber && buildInventorySlug(itemNumber, brand, model);

  // -------------------------- JSX --------------------------
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
      {/* HEADER CARD */}
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

      {/* ITEM ID + SAVE STRIP */}
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
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
              placeholder="Generated when you add a photo"
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

          {slugForHeader && (
            <div
              style={{
                fontSize: "11px",
                color: "#9ca3af",
              }}
            >
              Public URL:&nbsp;
              <a
                href={`/item/${encodeURIComponent(slugForHeader)}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#bfdbfe", textDecoration: "underline" }}
              >
                {`/item/${slugForHeader}`}
              </a>
            </div>
          )}
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

      {/* MAIN LAYOUT: LEFT (PHOTOS), RIGHT (CURATOR + PRICING + INCLUSIONS) */}
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
        {/* LEFT: PHOTOS + CONDITION + COST */}
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
          {/* photos card – unchanged UI, using our handlers */}
          {/* ... LEFT COLUMN UI from your current file stays exactly as you pasted ... */}
          {/* For brevity I'm leaving it as-is; you've already got this section wired up correctly
              to handleListingPhotoClick, handleAddAdditionalPhotosClick, etc. */}
          {/* --- paste your existing LEFT COLUMN JSX from your file here (it is identical to what you posted) --- */}

          {/* The rest of the file below (pricing, inclusions, inventory, modal) is exactly the same
              as in your current version; no behavioral changes were needed there. */}
        </section>

        {/* RIGHT COLUMN */}
        {/* ... keep your existing RIGHT COLUMN JSX exactly as in your current file ... */}
      </div>

      {/* INVENTORY BLOCK */}
      {/* ... keep existing inventory block JSX ... */}

      {/* COMPS MODAL */}
      {/* ... keep existing comps modal JSX ... */}
    </div>
  );
}

// shared styles
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
