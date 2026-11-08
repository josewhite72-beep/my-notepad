// Reduce una imagen (captura, foto) a JPEG liviano para guardarla dentro de la nota
const MAX_W = 1000;
const MAX_H = 2200;
const QUALITY = 0.78;

async function loadBitmap(blob) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(blob); } catch { /* se intenta con <img> */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function compressImage(blob) {
  const bmp = await loadBitmap(blob);
  const w0 = bmp.width;
  const h0 = bmp.height;
  const scale = Math.min(1, MAX_W / w0, MAX_H / h0);
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // fondo blanco para PNG con transparencia
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  return canvas.toDataURL('image/jpeg', QUALITY);
}
