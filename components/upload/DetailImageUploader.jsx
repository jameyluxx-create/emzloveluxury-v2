"use client";

import { useRef, useState } from "react";
import { useImageCompression } from "./useImageCompression";

export default function DetailImageUploader({
  detailImages,
  setDetailImages,
}) {
  const fileRef = useRef(null);
  const { compressImage } = useImageCompression();
  const [uploading, setUploading] = useState(false);

  async function uploadOneDetail(file) {
    const compressed = await compressImage(file);

    const res = await fetch("/api/intake/upload", {
      method: "POST",
      body: JSON.stringify({
        fileName: `detail-${Date.now()}.jpg`,
        fileType: "image/jpeg",
      }),
    });

    const { uploadUrl, publicUrl, error } = await res.json();
    if (error) throw new Error(error);

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: compressed,
    });

    if (!uploadRes.ok) throw new Error("Upload failed");

    return publicUrl;
  }

  async function handleMultiple(e) {
    const files = Array.from(e.target.files || []);

    setUploading(true);

    const uploadedUrls = [];
    for (let f of files) {
      try {
        const url = await uploadOneDetail(f);
        uploadedUrls.push(url);
      } catch (err) {
        alert(err.message);
      }
    }

    setDetailImage([...detailImages, ...uploadedUrls].slice(0, 10));

    setUploading(false);
  }

  function removeImage(url) {
    setDetailImages(detailImages.filter((x) => x !== url));
  }

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Detail Photos (up to 10)</label>

      <div
        className="border-2 border-dashed p-4 text-center rounded-lg cursor-pointer hover:bg-slate-50"
        onClick={() => fileRef.current.click()}
      >
        <div className="text-slate-400">Click to upload detail photos</div>
      </div>

      <input
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        ref={fileRef}
        onChange={handleMultiple}
      />

      {uploading && <p className="text-xs text-blue-600">Uploading...</p>}

      <div className="grid grid-cols-3 gap-3 mt-4">
        {detailImages.map((url, idx) => (
          <div key={url} className="relative">
            <img
              src={url}
              alt={`Detail ${idx + 1}`}
              className="w-full h-32 object-cover rounded-lg shadow"
            />
            <button
              onClick={() => removeImage(url)}
              className="absolute top-1 right-1 bg-red-600 text-white text-xs px-2 py-1 rounded"
            >
              X
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
