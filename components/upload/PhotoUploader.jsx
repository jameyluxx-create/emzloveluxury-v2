// components/upload/PhotoUploader.jsx

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { compressImage } from "./ImageCompressor";

export default function PhotoUploader({
  label = "Upload Photo",
  max = 10,
  onUploadComplete,
  existing = [],
}) {
  const [preview, setPreview] = useState(existing ?? []);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e) {
    const files = Array.from(e.target.files || []);

    if (files.length === 0) return;

    const finalUrls = [];

    setUploading(true);

    for (const file of files.slice(0, max)) {
      // 1) compress
      const compressedBlob = await compressImage(file, 1500, 0.8);

      const renamed = new File([compressedBlob], file.name, {
        type: "image/jpeg",
      });

      // 2) request signed URL
      const res = await fetch("/api/intake/upload", {
        method: "POST",
        body: JSON.stringify({
          filename: renamed.name,
        }),
      });

      const { uploadUrl, publicUrl, error } = await res.json();
      if (error) {
        console.error("Upload URL error:", error);
        continue;
      }

      // 3) PUT actual bytes
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "image/jpeg",
        },
        body: renamed,
      });

      if (!putRes.ok) {
        console.error("Upload failed");
        continue;
      }

      finalUrls.push(publicUrl);
    }

    setUploading(false);
    setPreview((prev) => [...prev, ...finalUrls]);

    if (onUploadComplete) onUploadComplete([...preview, ...finalUrls]);
  }

  return (
    <div className="space-y-4">
      <label className="text-sm font-medium">{label}</label>

      <input
        type="file"
        accept="image/*"
        multiple
        onChange={handleUpload}
        className="block w-full text-sm text-gray-600"
      />

      {uploading && (
        <p className="text-sm text-blue-600">Uploading... please wait</p>
      )}

      {preview.length > 0 && (
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mt-3">
          {preview.map((url, idx) => (
            <div
              key={idx}
              className="w-full h-32 rounded overflow-hidden border"
            >
              <img
                src={url}
                alt={`Uploaded-${idx}`}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
