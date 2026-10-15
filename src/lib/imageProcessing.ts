async function resizeAndCropImage(
  file: File,
  size = 200,
  quality = 0.85
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await loadImage(objectUrl);

    const minDim = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - minDim) / 2;
    const sy = (img.naturalHeight - minDim) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error("Impossible d'obtenir le contexte canvas");
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/webp', quality);
    });

    if (!blob) {
      throw new Error("Échec de la conversion en WebP");
    }

    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function processPassportPhoto(file: File): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await loadImage(objectUrl);

    const targetRatio = 3.5 / 4.5;
    const imgRatio = img.naturalWidth / img.naturalHeight;

    let sx: number, sy: number, sw: number, sh: number;

    if (imgRatio > targetRatio) {
      sh = img.naturalHeight;
      sw = sh * targetRatio;
      sx = (img.naturalWidth - sw) / 2;
      sy = 0;
    } else {
      sw = img.naturalWidth;
      sh = sw / targetRatio;
      sx = 0;
      sy = (img.naturalHeight - sh) / 2;
    }

    const maxHeight = 800;
    const outHeight = Math.min(maxHeight, sh);
    const outWidth = Math.round(outHeight * targetRatio);

    const canvas = document.createElement('canvas');
    canvas.width = outWidth;
    canvas.height = outHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error("Impossible d'obtenir le contexte canvas");
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outWidth, outHeight);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85);
    });

    if (!blob) {
      throw new Error("Échec de la conversion en JPEG");
    }

    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossible de charger l'image"));
    img.src = src;
  });
}


export { resizeAndCropImage, processPassportPhoto, resizeNewsImage, resizeTeamPhoto, prepareGalleryImage }

interface WebpOutput { blob: Blob; width: number; height: number }

async function drawToWebp(img: HTMLImageElement, maxSide: number, quality: number): Promise<WebpOutput> {
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (Math.max(w, h) > maxSide) {
    if (w >= h) { h = Math.round(h * (maxSide / w)); w = maxSide; }
    else { w = Math.round(w * (maxSide / h)); h = maxSide; }
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Impossible d'obtenir le contexte canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/webp', quality);
  });
  if (!blob || blob.type !== 'image/webp') {
    throw new Error('Votre navigateur ne sait pas produire des images WebP');
  }
  return { blob, width: w, height: h };
}

async function prepareGalleryImage(file: File): Promise<{ full: WebpOutput; thumb: WebpOutput }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl).catch(() => {
      throw new Error('Format non lisible par ce navigateur');
    });
    const full = await drawToWebp(img, 1600, 0.8);
    const thumb = await drawToWebp(img, 400, 0.8);
    return { full, thumb };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function resizeTeamPhoto(file: File, maxSide = 2400, quality = 0.85): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (Math.max(w, h) > maxSide) {
      if (w >= h) { h = Math.round(h * (maxSide / w)); w = maxSide; }
      else { w = Math.round(w * (maxSide / h)); h = maxSide; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Impossible d'obtenir le contexte canvas");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    let blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/webp', quality);
    });
    if (blob && blob.type === 'image/webp') return blob;
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    });
    if (!blob) throw new Error('Échec de la conversion');
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function resizeNewsImage(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (Math.max(w, h) > maxSide) {
      if (w >= h) { h = Math.round(h * (maxSide / w)); w = maxSide; }
      else { w = Math.round(w * (maxSide / h)); h = maxSide; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Impossible d'obtenir le contexte canvas");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    });
    if (!blob) throw new Error('Échec de la conversion en JPEG');
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}