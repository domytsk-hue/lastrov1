/**
 * Turns any photo the user picks into a small square JPEG data URL:
 * center-cropped, EXIF orientation respected, ~320px — small enough for local storage.
 */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export async function photoToAvatar(file: File, size = 320, quality = 0.85): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("not-image");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("too-large");

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Fallback for browsers/formats where createImageBitmap fails.
    source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("unreadable"));
      };
      img.src = url;
    });
  }

  const w = source.width;
  const h = source.height;
  if (!w || !h) throw new Error("unreadable");
  const side = Math.min(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("unreadable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
  if ("close" in source) source.close();
  return canvas.toDataURL("image/jpeg", quality);
}
