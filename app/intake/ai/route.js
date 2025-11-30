import { NextResponse } from "next/server";
  import OpenAI from "openai";

  export async function POST(req) {
    try {
      const body = await req.json();

      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const prompt = `
You are an expert luxury goods cataloger and SEO specialist.

Given this data:
${JSON.stringify(body, null, 2)}

Return a JSON object with:
{
  "identity": {
    "submodel": "...",
    "variant": "...",
    "material": "...",
    "color": "...",
    "pattern": "...",
    "hardware": "...",
    "gender": "...",
    "size": "...",
    "era": "...",
    "origin": "...",
    "notes": "..."
  },
  "seo": {
    "title": "...",
    "subtitle": "...",
    "bullets": ["...", "..."],
    "description": "..."
  },
  "searchKeywords": ["kw1", "kw2", "kw3"]
}
Only output JSON. No commentary.
`;

      const ai = await client.responses.create({
        model: "gpt-4.1",
        input: prompt,
        response_format: { type: "json_object" },
      });

      const json = ai.output[0].content[0].text;
      const parsed = JSON.parse(json);

      return NextResponse.json(parsed);
    } catch (err) {
      return NextResponse.json(
        { error: err.message || "AI route failed" },
        { status: 500 }
      );
    }
  }
