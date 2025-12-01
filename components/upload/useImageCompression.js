// components/upload/useImageCompression.js

export function useImageCompression() {
  async function compressImage(file, maxSize = 1500) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");

        const scale = maxSize / Math.max(img.width, img.height);
        const width = img.width * scale;
        const height = img.height * scale;

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) return reject("Compression failed");
            resolve(blob);
          },
          "image/jpeg",
          0.85 // compression quality
        );
      };

      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  return { compressImage };
}
