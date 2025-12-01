// components/upload/ImagePreviewGrid.jsx

"use client";

export default function ImagePreviewGrid({ mainImage, detailImages, onRemoveDetail }) {
  return (
    <div className="space-y-4">
      {/* Main Image */}
      {mainImage && (
        <div>
          <div className="text-sm font-medium mb-1">Main Image</div>
          <img
            src={mainImage}
            className="w-full max-w-xs rounded-xl border shadow-sm"
          />
        </div>
      )}

      {/* Detail Images */}
      <div>
        <div className="text-sm font-medium mb-2">Detail Images</div>

        <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
          {detailImages.map((url, i) => (
            <div key={i} className="relative group">
              <img
                src={url}
                className="w-full h-24 object-cover rounded-lg border shadow-sm"
              />
              <button
                onClick={() => onRemoveDetail(i)}
                className="absolute top-1 right-1 bg-red-600 text-white rounded-full text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition"
              >
                X
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
