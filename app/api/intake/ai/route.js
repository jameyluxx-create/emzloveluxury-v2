// app/api/intake/ai/route.js

import { NextResponse } from "next/server";
import OpenAI from "openai";

// Make sure you have OPENAI_API_KEY in your environment (Vercel + .env.local)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Utility to safely parse JSON-ish strings if you ever need it
function safeParseJSON(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function POST(req) {
  try {
    const body = await req.json();

    // New intake payload shape
    const {
      brand = "",
      model = "",
      identity: incomingIdentity = null,
      notes = "",
      seo: incomingSeo = null,
      searchKeywords: incomingSearchKeywords = [],
      // support older fields too, just in case
      submodel = "",
      variant = "",
      category = "",
      color = "",
      material = "",
      size = "",
      condition_grade = "",
      existingIdentity = null,
      existingSeo = null,
    } = body || {};

    // Merge any old-style identity into the main identity blob
    const identityObj =
      safeParseJSON(incomingIdentity, {}) ||
      safeParseJSON(existingIdentity, {}) ||
      {};

    const seoObj =
      safeParseJSON(incomingSeo, {}) ||
      safeParseJSON(existingSeo, {}) ||
      {};

    const searchKeywords =
      Array.isArray(incomingSearchKeywords) && incomingSearchKeywords.length
        ? incomingSearchKeywords
        : [];

    // Build a base description for the AI
    const baseDescription = `
Brand: ${brand || "N/A"}
Model: ${model || "N/A"}
Submodel: ${submodel || identityObj.submodel || "N/A"}
Variant: ${variant || identityObj.variant || "N/A"}
Category: ${category || identityObj.category || "N/A"}
Color: ${color || identityObj.color || "N/A"}
Material: ${material || identityObj.material || "N/A"}
Size / Dimensions: ${size || identityObj.size || "N/A"}
Condition Grade: ${condition_grade || identityObj.condition_grade || "N/A"}
Internal Notes: ${notes || "N/A"}
Existing Search Keywords: ${
      searchKeywords.length ? searchKeywords.join(", ") : "None"
    }
`.trim();

    const systemPrompt = `
You are an expert luxury resale copywriter and product taxonomist for EMZLoveLuxury.
You output STRICT machine-readable JSON only, no markdown, no prose.
`.trim();

    const userPrompt = `
You are helping to prepare an intake item for an online luxury and midrange resale shop.

Here is the raw item summary:

${baseDescription}

Use or refine any existing identity / SEO data if present:

Existing identity JSON (may be null):
${JSON.stringify(identityObj, null, 2)}

Existing SEO JSON (may be null):
${JSON.stringify(seoObj, null, 2)}

You must respond ONLY with strict JSON, in this exact shape:

{
  "identity": {
    "brand": string,
    "model": string,
    "submodel": string,
    "variant": string,
    "category": string,
    "color": string,
    "material": string,
    "size": string,
    "era": string,
    "origin": string,
    "notes": string
  },
  "seo": {
    "title": string,
    "description": string,
    "h1": string,
    "meta": {
      "keywords": string,
      "og_title": string,
      "og_description": string
    }
  },
  "search_keywords": string[],
  "quick_facts": string,
  "title": string
}

Guidelines:

- "identity" should be concise but precise, not hypey, and should reflect what a bag nerd would want to see.
- "era" can be approximate like "2000s", "2010s", "Vintage 1990s", or "Unknown".
- "origin" is country/region of likely origin or brand origin; if unknown, say "Unknown".
- "notes" can include construction details, lining type, hardware color, etc. Keep it short.

- "seo.title": strong e-commerce title for Google and internal search, not clickbait.
- "seo.description": 1–3 sentences; emphasize pre-owned, condition, and style.
- "seo.h1": similar to title but slightly more human reading.
- "seo.meta.keywords": short comma-separated phrase list.
- "seo.meta.og_title": a social-preview title.
- "seo.meta.og_description": 1–2 sentences, friendly but still professional.

- "search_keywords": 8–25 lowercased keywords & short phrases, no duplicates, no brand spam.
  Examples: ["lv monogram wallet", "brown coated canvas", "zip around wallet", "preowned luxury slg"]

- "quick_facts": 3–8 bullet-style lines in ONE string separated by line breaks.
  Example:
  "• Classic monogram coated canvas\\n• Zip-around closure with multiple card slots\\n• Great everyday wallet with light wear"

- "title": this will be used directly as the listing title on the website.

IMPORTANT:
- DO NOT wrap the JSON in markdown.
- DO NOT include any explanation before or after the JSON.
- DO NOT add any extra fields not listed in the schema.
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("Failed to parse AI JSON:", err, raw);
      return NextResponse.json(
        {
          error: "AI returned invalid JSON",
          raw,
        },
        { status: 500 }
      );
    }

    const outIdentity = parsed.identity || {};
    const outSeo = parsed.seo || {};
    const outSearchKeywords = Array.isArray(parsed.search_keywords)
      ? parsed.search_keywords
      : [];

    const quick_facts = parsed.quick_facts || "";
    const title = parsed.title || outSeo.title || "";

    // IMPORTANT: match the frontend expectations:
    // - identity
    // - seo
    // - searchKeywords (camelCase)
    return NextResponse.json(
      {
        identity: outIdentity,
        seo: outSeo,
        searchKeywords: outSearchKeywords,
        quickFacts: quick_facts,
        title,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error in /api/intake/ai:", err);
    return NextResponse.json(
      {
        error: "Failed to run AI curator",
        details: err?.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}
