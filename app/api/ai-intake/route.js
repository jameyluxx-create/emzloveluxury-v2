import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to build an AI prompt that matches our schema
function buildPrompt(imageUrls) {
  return `
You are EMZLoveLuxury AI — a professional luxury item identifier that must always follow this schema:

{
  "identity": {
    "brand": "",
    "model": "",
    "style": "",
    "color": "",
    "material": "",
    "hardware": "",
    "pattern": "",
    "year_range": "",
    "category_primary": "",
    "category_secondary": []
  },
  "dimensions": {
    "length": "",
    "height": "",
    "depth": "",
    "strap_drop": ""
  },
  "included_items": [],
  "description": {
    "sales_forward": "",
    "feature_bullets": []
  },
  "pricing": {
    "retail_price": null,
    "comp_low": null,
    "comp_high": null,
    "recommended_price": null,
    "suggested_whatnot_start": null,
    "comp_sources": []
  },
  "seo": {
    "keywords": [],
    "hashtags": [],
    "meta_title": "",
    "meta_description": "",
    "slug": ""
  }
}

TASKS:
1. Look at the photos and identify the item:
   - brand, model, style, color, material, hardware, pattern, year range

2. Search the web for matching listings (Fashionphile, TRR, Rebag, Vestiaire, eBay, etc.)
   - extract dimensions
   - extract included items
   - extract comps (3–6 real examples)
   - extract retail price if available

3. Build a sales-forward description (1–3 short paragraphs)
   - written in a way a live seller can speak fluently

4. Build 5–10 feature bullets

5. Generate SEO metadata:
   - short meta title
   - meta description (max 150 chars)
   - keywords list
   - hashtags list
   - slug (URL-safe)

6. Return JSON ONLY — no commentary, no text outside JSON.

Images provided:
${imageUrls.join("\n")}
  `;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { imageUrls } = body;

    if (!imageUrls || imageUrls.length === 0) {
      return NextResponse.json(
        { error: "No images provided." },
        { status: 400 }
      );
    }

    // AI CALL
    const response = await openai.chat.completions.create({
      model: "gpt-4.1", // full intelligence mode
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildPrompt(imageUrls) },
            ...imageUrls.map((url) => ({
              type: "input_image",
              image_url: url,
            })),
          ],
        },
      ],
      temperature: 0.3,
    });

    const rawOutput = response.choices[0].message.content;

    // Ensure JSON is parsed safely
    let parsed;
    try {
      parsed = JSON.parse(rawOutput);
    } catch (err) {
      console.error("JSON parse error:", err);
      return NextResponse.json(
        { error: "Invalid AI JSON format.", raw: rawOutput },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: parsed });
  } catch (err) {
    console.error("AI Intake Route Error:", err);
    return NextResponse.json({ error: "AI processing failed." }, { status: 500 });
  }
}
