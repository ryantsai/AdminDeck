export const CONNECTION_ICON_IMAGE_SIZE = 384;

export function fitImageDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxSize = CONNECTION_ICON_IMAGE_SIZE,
) {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("image dimensions must be positive");
  }

  const scale = Math.min(maxSize / sourceWidth, maxSize / sourceHeight);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export async function resizeImageBlobToIconDataUrl(blob: Blob) {
  const sourceDataUrl = await blobToDataUrl(blob);
  const image = await loadImage(sourceDataUrl);
  const { width, height } = fitImageDimensions(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("image canvas is unavailable");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string" && result.startsWith("data:image/")) {
        resolve(result);
        return;
      }
      reject(new Error("invalid image data"));
    };
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("image load failed"));
    image.onload = () => resolve(image);
    image.src = src;
  });
}
