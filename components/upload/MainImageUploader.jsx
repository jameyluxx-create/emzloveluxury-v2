"use client";

import { useRef, useState } from "react";
import { useImageCompression } from "./useImageCompression";

export default function MainImageUploader({ mainImage, setMainImage }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const { compressImage } = useImageCompression();

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      const compressed = await compressImage(file);

      // Get signed upload URL from API route
      const res = await fetch("/api/intake/upload", {
        method: "POST",
        body: JSON.stringify({
          fileName: "main.jpg",
          fileType: "image/jpeg",
        }),
      });

      const { uploadUrl, publicUrl, error } = await res.json();
      if (error) throw new Error(error);

      // Upload to Supabase Storage using the signed PUT URL
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: compressed,
      });

      if (!uploadRes.ok) throw new Error("Upload failed");

      setMainImage(publicUrl);
    } catch (err) {
      alert(err.message);
    }

    setUploading(false);
  }

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Main Photo</label>

      <div
        className="border-2 border-dashed p-6 text-center rounded-lg cursor-pointer hover:bg-slate-50"
        onClick={() => fileRef.current.click()}
      >
        {mainImage ? (
          <img
            src={mainImage}
            className="mx-auto w-48 h-48 object-cover rounded-lg shadow"
            alt="Main"
          />
        ) : (
          <div className="text-slate-400">Click to upload main photo</div>
        )}
      </div>

      <input
        type="file"
        accept="image/*"
        className="hidden"
        ref={fileRef}
        onChange={handleFileSelect}
      />

      {uploading && <p className="text-xs text-blue-600">Uploading...</p>}
    </div>
  );
}
