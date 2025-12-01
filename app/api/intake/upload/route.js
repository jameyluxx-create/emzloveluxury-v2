import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // REQUIRED FOR SIGNED UPLOAD URL CREATION
);

const BUCKET = "emz-intake";

// FILE RULES
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_MB = 10;
const MAX_SIZE = MAX_MB * 1024 * 1024;

export async function POST(req) {
  try {
    const { fileName, fileType, itemNumber } = await req.json();

    if (!fileName || !fileType || !itemNumber) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    // Restrict MIME types
    if (!ALLOWED_TYPES.includes(fileType)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPG, PNG, and WEBP allowed." },
        { status: 400 }
      );
    }

    // Build safe storage path: itemNumber/photoName
    const objectKey = `${itemNumber}/${fileName}`;

    // Generate signed upload URL
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(objectKey, MAX_SIZE);

    if (error) {
      console.error("Signed URL error:", error);
      return NextResponse.json(
        { error: "Could not create upload URL." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        uploadUrl: data.signedUrl,
        objectKey,
        publicUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectKey}`,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Upload endpoint error:", err);
    return NextResponse.json(
      { error: "Upload route failed." },
      { status: 500 }
    );
  }
}
