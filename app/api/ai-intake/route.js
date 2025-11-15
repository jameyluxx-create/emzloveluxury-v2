import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Build the prompt for the model
function buildPrompt(imageUrls) {
  return `
You are EMZLoveLuxury AI — a professional luxury item identifier and pricing assistant.

You MUST respond with VALID JSON ONLY. No markdown, no comments, no extra text.
Use this exact schema and include ALL keys:

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
    "recommended_listing": null,
    "whatnot_start": null,
    "sources": []
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
1. Look carefully at all provided photos and identify:
   - brand, model, style, color, material, hardware, pattern, and approximate year range.
   - primary category (bag, wallet/SLG, accessory, other) plus any useful secondary categories.

2. Imagine you can also search common luxury resale sites
   (Fashionphile, Rebag, The RealReal, Vestiaire, eBay, etc.) for this item or extremely similar items.
   From those imaginary matches, infer:
   - typical dimensions (length, height, depth, strap drop).
   - common included items (dust bag, card, strap, box, paperwork).

3. Build a sales-forward description (1–2 short paragraphs) that a live seller can read out loud smoothly.
   Also provide 5–10 short bullet points in "feature_bullets".

4. Pricing:
   - Estimate a realistic retail price for this model if known (or null if unknown).
   - Estimate a reasonable low comp (comp_low) and high comp (comp_high) in USD.
   - Suggest a recommended listing price in USD for a good condition example (recommended_listing).
   - Suggest a Whatnot auction starting price in USD (whatnot_start).
   - "sources" can be an array of short text notes like
     ["Based on similar sold listings on major resale platforms"].

5. SEO:
   - keywords: array of important search phrases.
   - hashtags: array of social hashtags (no "#", just words like "prada", "saffiano", "crossbody").
   - meta_title: short SEO title including brand and model.
   - meta_description: 1 short sentence (max ~150 characters).
   - slug: URL-safe slug like "prada-saffiano-red-wallet".

Return ONLY the JSON object, nothing else.

Images provided (URLs):
${imageUrls.join("\n")}
`;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { imageUrls } = body;

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json(
        { error: "No images provided." },
        { status: 400 }
      );
    }

    // Correct multimodal format: type: "text" and type: "image_url"
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.3,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildPrompt(imageUrls),
            },
            ...imageUrls.map((url) => ({
              type: "image_url",
              image_url: { url },
            })),
          ],
        },
      ],
    });

    const content = completion?.choices?.[0]?.message?.content;
    let raw = "";

    // Newer API can return content as string or as array of content parts
    if (typeof content === "string") {
      raw = content;
    } else if (Array.isArray(content)) {
      raw = content
        .map((part) => {
          if (typeof part === "string") return part;
          if (part.type === "text" && part.text) return part.text;
          return "";
        })
        .join("\n");
    } else {
      raw = "";
    }

    raw = (raw || "").trim();

    // Try to extract pure JSON from the model output
    let jsonString = raw;
    const firstBrace = jsonString.indexOf("{");
    const lastBrace = jsonString.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonString = jsonString.slice(firstBrace, lastBrace + 1);
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (err) {
      console.error("JSON parse error from AI:", err, "RAW:", raw);
      return NextResponse.json(
        { error: "Invalid JSON from AI.", raw },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: parsed });
  } catch (err) {
    console.error("AI Intake Route Error:", err);
    return NextResponse.json(
      { error: "AI processing failed.", details: String(err) },
      { status: 500 }
    );
  }
}
