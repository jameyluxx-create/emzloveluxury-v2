import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  try {
    const { imageUrls } = await req.json();

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json(
        { error: "imageUrls[] is required" },
        { status: 400 }
      );
    }

    const messages = [
      {
        role: "system",
        content:
          "You are an expert in luxury handbags and small leather goods. You identify brand, model, category, apparent condition, and write clear descriptions. Always answer in compact JSON.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `
You are looking at multiple photos of ONE luxury item (handbag, wallet, or accessory).

Use ALL photos together to:
- Identify likely brand and model (or best guess)
- Identify category (bag, wallet/SLG, accessory, other)
- Estimate condition using this scale: A (store ready), B (light wear), C (needs cleaning/hardware), D (restoration project), E (parts/salvage)
- Write a short, factual description we can use as a starting point for a sales listing (no prices).

Respond ONLY as JSON with keys:
{
  "brand": string,
  "model": string,
  "category": "bag" | "wallet" | "accessory" | "other",
  "condition": "A" | "B" | "C" | "D" | "E",
  "description": string
}
            `.trim(),
          },
          ...imageUrls.map((url) => ({
            type: "image_url",
            image_url: { url },
          })),
        ],
      },
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.3,
    });

    const raw = completion.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        console.error("Could not parse AI JSON:", raw);
        return NextResponse.json(
          { error: "AI response could not be parsed" },
          { status: 500 }
        );
      }
    }

    const safeResponse = {
      brand: parsed.brand || "",
      model: parsed.model || "",
      category: parsed.category || "other",
      condition: parsed.condition || "B",
      description:
        parsed.description ||
        "No detailed description returned, please describe this item manually.",
    };

    return NextResponse.json(safeResponse);
  } catch (err) {
    console.error("AI intake error:", err);
    return NextResponse.json(
      { error: "Server error in AI intake route" },
      { status: 500 }
    );
  }
}
