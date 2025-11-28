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

  // Coerce everything to string first
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

  // Identity fields (prioritizing override, then AI)
  const brand = override.brand || identity.brand || "";
  const model = override.model || identity.model || "";
  const category = override.category || identity.category_primary || "";
  const color = override.color || identity.color || "";
  const material = override.material || identity.material || "";

  // User-supplied condition grade (S, SA, A, AB, B, C, U)
  const conditionGrade = override.condition || "";

  // Measurements
  const measurementsParts = [];
  if (dims.length) measurementsParts.push(`L: ${dims.length}`);
  if (dims.height) measurementsParts.push(`H: ${dims.height}`);
  if (dims.depth) measurementsParts.push(`D: ${dims.depth}`);
  if (dims.strap_drop) measurementsParts.push(`Strap Drop: ${dims.strap_drop}`);

  const measurementsText =
    measurementsParts.length > 0 ? measurementsParts.join(" · ") : "";

  // Small helper to normalize whitespace
  const clean = (txt) =>
    (txt || "").trim().replace(/\s+/g, " ");

  const sections = [];

  //
  // 1) IDENTITY & ORIGIN
  //
  {
    const lines = [];

    const hasIdentityFields = brand || model || category || color || material;

    if (hasIdentityFields) {
      const nameParts = [];
      if (brand) nameParts.push(brand);
      if (model) nameParts.push(model);
      const identifier = nameParts.join(" ").trim();

      const role = category
        ? `a ${category} piece`
        : "an item";

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

  //
  // 2) DESIGN & FUNCTION
  //
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

  //
  // 3) MARKET & RARITY
  //
  {
    const lines = [];

    const marketNote = clean(availability.market_rarity);
    const similar = availability.similar_items_found;

    if (marketNote) {
      lines.push(marketNote);
    }

    if (similar !== null && similar !== undefined) {
      lines.push(
        `Approximate comparable availability: ${similar} similar item${similar === 1 ? "" : "s"} observed in major resale markets.`
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

  //
  // 4) USER CONDITION GRADE (user-entered, not AI)
  //
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

  //
  // Final output — headers + underlines for readability in <pre>
  //
  const finalNarrative = sections
    .map(
      (sec) =>
        `${sec.header}\n${"-".repeat(sec.header.length)}\n${sec.body}`
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

// ----------------- slug helper (Option C: ITEMNUMBER-brand-model) -----------------
function buildInventorySlug(itemNumber, brand, model) {
  const parts = [];

  if (brand) parts.push(String(brand));
  if (model) parts.push(String(model));

  const base = parts.join(" ").toLowerCase();

  const simpleSlug = base
    .normalize("NFKD") // strip accents
    .replace(/[^\w\s-]/g, "") // remove non-word chars
    .trim()
    .replace(/\s+/g, "-"); // spaces → dashes

  if (!itemNumber && !simpleSlug) return "";

  if (!simpleSlug) return String(itemNumber).toLowerCase();

  if (!itemNumber) return simpleSlug;

  // Option C: ITEMNUMBER-brand-model
  return `${String(itemNumber).toLowerCase()}-${simpleSlug}`;
}


// -------------------------- main component -------------------------

function IntakePageInner() {

  const [currentUserId, setCurrentUserId] = useState(null);
  const [listingId, setListingId] = useState(null); // existing if you already added it
  const [skuLocked, setSkuLocked] = useState(false); // existing if you already added it

  // NEW — for database tracking + locking the SKU
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

// REMOVE the old: useEffect(() => { loadInventory(); }, []);

useEffect(() => {
  if (!currentUserId) return;
  loadInventory(currentUserId);
}, [currentUserId]);


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

async function loadInventory(userIdOverride) {
  const userId = userIdOverride || currentUserId;
  if (!userId) return; // nothing to load until we know who you are

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

    // Full SKU pattern once we have a sequence value
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

  async function handleReplaceImage(slotIndex) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      try {
        // Resize on client first
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

        // ---------- NEW: tie hero photo to SKU + listing ----------
        if (slotIndex === 0) {
          try {
            // If a listing already exists, just update its images
            if (listingId) {
              const { error: updateErr } = await supabase
                .from("listings")
                .update({ images: next })
                .eq("id", listingId);

              if (updateErr) {
                console.error("Error updating listing images:", updateErr);
              }
            } else {
              // First-ever hero photo -> generate SKU + create listing row
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
              setSkuLocked(true); // From now on, don’t auto-change SKU

              const imagesPayload = next.filter((img) => img !== null);

              const { data, error: insertErr } = await supabase
                .from("listings")
                .insert({
                  user_id: currentUserId,
                  item_number: newItemNumber,
                  brand: brand || null,
                  model: model || null,
                  category: category || null,
                  color: color || null,
                  material: material || null,
                  description: curatorNarrative || null,
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
                  "Error creating new listing from main photo:",
                  insertErr
                );
              } else if (data) {
                setListingId(data.id);
              }
            }
          } catch (err2) {
            console.error("Error handling main photo SKU/listing:", err2);
          }
        } else if (listingId) {
          // Additional photos -> keep listing in sync
          try {
            const { error: updateErr } = await supabase
              .from("listings")
              .update({ images: next })
              .eq("id", listingId);

            if (updateErr) {
              console.error(
                "Error updating listing images with additional photo:",
                updateErr
              );
            }
          } catch (err3) {
            console.error(
              "Error updating listing with additional photo:",
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

  async function saveInventoryItem({
  itemNumber,
  brand,
  model,
  category,
  color,
  material,
  conditionGrade,
  gradingNotes,
  dimensions,
  aiData,
  images,
  pricingPreview,
  listingPrice,
  currency,
}) {
  try {
    if (!itemNumber) return;

    const fullSlug = buildInventorySlug(itemNumber, brand, model);

    const aiIdentity = aiData?.identity || {};
    const mergedIdentity = {
      ...aiIdentity,
      brand: brand || aiIdentity.brand || null,
      model: model || aiIdentity.model || null,
      category_primary: category || aiIdentity.category_primary || null,
      color: color || aiIdentity.color || null,
      material: material || aiIdentity.material || null,
    };

    const retail_price =
      pricingPreview?.comp_high ??
      pricingPreview?.retail_price ??
      null;

    const emzSaleNumber =
      listingPrice && String(listingPrice).trim().length > 0
        ? Number(listingPrice)
        : pricingPreview?.recommended_listing ?? null;

    const { error } = await supabase
      .from("inventory_items")
      .upsert(
        [
          {
            item_number: itemNumber,
            slug: fullSlug.replace(/^[^-]+-/, ""), // brand-model part
            full_slug: fullSlug,

            brand: mergedIdentity.brand,
            model: mergedIdentity.model,
            style: mergedIdentity.style || null,
            color: mergedIdentity.color,
            material: mergedIdentity.material,
            hardware: aiIdentity.hardware || null,
            pattern: aiIdentity.pattern || null,
            year_range: aiIdentity.year_range || null,
            category_primary: mergedIdentity.category_primary,
            category_secondary:
              aiIdentity.category_secondary || null,

            condition_grade: conditionGrade || null,
            condition_notes: gradingNotes || null,

            length: dimensions?.length || "",
            height: dimensions?.height || "",
            depth: dimensions?.depth || "",
            strap_drop: dimensions?.strap_drop || "",

            ai_data: aiData || null,
            images: images && images.length ? images : null,

            retail_price,
            comp_low: pricingPreview?.comp_low ?? null,
            comp_high: pricingPreview?.comp_high ?? null,
            emz_sale: emzSaleNumber,
            currency: currency || "USD",

            source: "intake",
            notes: null,
          },
        ],
        { onConflict: "item_number" }
      );

    if (error) {
      console.error("Error saving inventory_items:", error);
    }

    return fullSlug;
  } catch (err) {
    console.error("Unexpected error in saveInventoryItem:", err);
    // don’t throw — listings save should still succeed
    return null;
  }
}

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

  try {
    // ---------- 1) Ensure we have a FINAL SKU ----------
    let finalItemNumber = itemNumber;
    let nextSeq = sequenceNum;

    // If SKU is not locked yet, or is still a temp SKU, generate a real one now
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

    // ---------- 2) Build payload ----------
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
    const seo = aiData?.seo ? { ...aiData.seo, user_override: false } : null;

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

    // ---------- 3) UPDATE vs INSERT ----------
    let data;
    let error;

    if (listingId) {
      // Existing row (e.g. temp row from first photo) → UPDATE it
      ({ data, error } = await supabase
        .from("inventory_items")
        .update(payload)
        .eq("id", listingId)
        .select()
        .single());
    } else {
      // No row yet → INSERT new one
      ({ data, error } = await supabase
        .from("inventory_items")
        .insert(payload)
        .select()
        .single());

      if (data?.id) {
        setListingId(data.id); // remember it for future updates
      }
    }

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

    await loadInventory(currentUserId);
  } catch (err) {
    console.error(err);
    setErrorMsg("Could not save item.");
  } finally {
    setIsSaving(false);
  }
}

    // HARD RULE: new items must have a main photo
    const hero = images[0];
    if (!listingId && (!hero || !hero.url)) {
      setErrorMsg(
        "Add a listing photo (main image) or load an existing SKU before saving this item."
      );
      setIsSaving(false);
      return;
    }

    try {
      // If somehow we have a photo but no SKU yet, generate it as a fallback
      let finalItemNumber = itemNumber;
      if (!finalItemNumber) {
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

        finalItemNumber = `${brandC}-${modelC}-EMZ-${nextSequence}`;
        setItemNumber(finalItemNumber);
        setSkuLocked(true);
      }

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

      const payloadCommon = {
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
        item_number: finalItemNumber,
      };

      let dbError = null;

      if (listingId) {
        // UPDATE existing listing
        const { error } = await supabase
          .from("listings")
          .update(payloadCommon)
          .eq("id", listingId);

        dbError = error || null;
      } else {
        // FALLBACK CREATE (photo exists, SKU now generated above)
        const { data, error } = await supabase
          .from("listings")
          .insert({
            user_id: currentUserId,
            ...payloadCommon,
          })
          .select()
          .single();

        dbError = error || null;
        if (!error && data) {
          setListingId(data.id);
        }
      }

      if (dbError) {
        console.error(dbError);
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

 function handlePrintCard() {
  const safeItemNumberRaw = itemNumber || "(not assigned yet)";
  const safeItemNumber = escapeHtml(safeItemNumberRaw);

  // Real site origin for public QR URL
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://emzloveluxury.com";

  // Build slug for URL (Option C: ITEMNUMBER-brand-model)
  const rawItemNumber =
    itemNumber && itemNumber !== "(not assigned yet)" ? itemNumber : "";

  const slug = rawItemNumber
    ? buildInventorySlug(rawItemNumber, brand, model)
    : "pending";

  const itemUrl = `${origin}/item/${encodeURIComponent(slug)}`;

  // Logo on tag
  const logoUrl =
    "https://emzloveluxury.com/emz-loveluxury-logo-horizontal.png";

  // QR code for PUBLIC URL
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
    itemUrl
  )}&size=350x350&margin=0&format=png`;

  // BARCODE still uses pure item_number (SKU)
  const barcodeText = rawItemNumber || "PENDING";
  const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(
    barcodeText
  )}&scale=3&includetext&background=ffffff`;

  // Safe fields
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

  // ------------------------- HTML TEMPLATE ------------------------------

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
      height: 240px; /* ← TALLER TAGS */
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

  <!-- ===================================== -->
  <!--        PRINT CARD (Gold Box)          -->
  <!-- ===================================== -->

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
      </div>

      <div class="col">
        <h3 class="section-header">EMZCURATOR DESCRIPTION</h3>
        <p style="white-space: pre-wrap; font-size: 13px;">${safeNarrative}</p>
      </div>
    </div>
  </div>

  <!-- ===================================== -->
  <!--                TAGS                   -->
  <!-- ===================================== -->

  <div class="tag-container">

    <!-- TOP TAG STRIP -->
    <div class="tag-row noclip">
      <!-- LEFT TAG (Barcode side) -->
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

      <!-- RIGHT TAG (QR code side) -->
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

  // OPEN PRINT WINDOW
  const printWindow = window.open("printcard://emzloveluxury.com", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  } else {
    alert("Popup blocked. Please allow popups for this site.");
  }
}


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
        
        {itemNumber && (
  <div
    style={{
      fontSize: "11px",
      color: "#9ca3af",
      marginTop: "4px",
    }}
  >
    Public URL:&nbsp;
    <a
      href={`/item/${encodeURIComponent(itemNumber)}`}
      target="_blank"
      rel="noreferrer"
      style={{ color: "#bfdbfe", textDecoration: "underline" }}
    >
      {`/item/${itemNumber}`}
    </a>
  </div>
)}

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
                          boxShadow: "0 8px 24px rgba(15,23,42,0.85)",
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

          {/* Currency & basic intake fields */}
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
  <option value="S">S – Brand New</option>
  <option value="SA">SA – Unused</option>
  <option value="A">A – Excellent</option>
  <option value="AB">AB – Good</option>
  <option value="B">B – Average</option>
  <option value="C">C – Damaged</option>
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

        {/* RIGHT COLUMN */}
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {/* EMZCurator Description + Print Card */}
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
                "When you run EMZCurator AI, a complete neutral summary appears here. This exact text becomes the right column on the print card."
              }
            />
            <p
              style={{
                fontSize: "10px",
                color: "#bfdbfe",
                marginTop: "6px",
              }}
            >
              When you click <strong>Print Card and Tags</strong>, the system
              generates an 8.5×11 card with all item details on the left,
              EMZCurator summary on the right, and two identical detachable
              tags with QR and barcode at the bottom.
            </p>
          </div>

          {/* Pricing & Status */}
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

          {/* Inclusions */}
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

      {/* INVENTORY BLOCK */}
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

      {/* COMPS MODAL */}
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
