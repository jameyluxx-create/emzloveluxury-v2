// components/upload/UploadButton.jsx

"use client";

import { useState, useCallback } from "react";
import { resizeImage } from "./ImageResizer";

export default function UploadButton({ label, onUpload }) {
  const [uploading, setUploading] = useState(false);

  const handleFiles = useCallback(
    async (files) => {
      if (!files || !files.length) return;

      const file = files[0]; // single file per upload button

      try {
        setUploading(true);

        // 1. Resize client-side
        const resizedBlob = await resizeImage(file);

        // 2. Ask server for signed upload URL
        const res = await fetch("/api/intake/upload", {
          method: "POST",
          body: JSON.stringify({
            filename: file.name,
            contentType: "image/jpeg",
          }),
        });

        const { uploadUrl, publicUrl, error } = await res.json();
        if (error) throw new Error(error);

        // 3. Upload resized blob to Supabase via signed URL
        const upload = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
          body: resizedBlob,
        });

        if (!upload.ok) throw new Error("Upload failed");

        // 4. Return the public URL up to the parent
        onUpload(publicUrl);
      } catch (err) {
        alert("Upload error: " + err.message);
      } finally {
        setUploading(false);
      }
    },
    [onUpload]
  );

  const onInput = (e) => {
    handleFiles(e.target.files);
  };

  const onDrop = (e) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e) => e.preventDefault();

  return (
    <div
      className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer bg-white hover:bg-slate-50 transition"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onClick={() => document.getElementById(label + "-file").click()}
    >
      <input
        id={label + "-file"}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onInput}
      />

      {uploading ? (
        <div className="text-sm text-blue-600 font-semibold">
          Uploading…
        </div>
      ) : (
        <div className="text-sm text-gray-600">
          Click or drag here to upload <br />
          <span className="font-bold">{label}</span>
        </div>
      )}
    </div>
  );
}
