let cached: string | null = null;

/**
 * Returns the original circular KB logo as a PNG data URL. The PNG is drawn
 * once, preserving aspect ratio. It is never redrawn or restyled.
 */
export async function getLogoDataUrl(size = 256): Promise<string> {
  if (cached) return cached;
  const url = `${import.meta.env.BASE_URL}logo.png`;
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('logo load failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    cached = canvas.toDataURL('image/png');
  } catch {
    cached = url;
  }
  return cached;
}

export function logoSrc(): string {
  return `${import.meta.env.BASE_URL}logo.png`;
}
