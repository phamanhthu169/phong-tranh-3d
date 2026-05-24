import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://rfbntpadxbviolqyihib.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmYm50cGFkeGJ2aW9scXlpaGliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MDc4MjEsImV4cCI6MjA5NTE4MzgyMX0.MNGH2Gq0LAtEuORq4cqmjxVx_kBzuKeeSuLSvSggWA4'
);

export const STORAGE_BUCKET = 'patbk';
export const GALLERY_NAME   = 'main';

const SUPABASE_BASE = 'https://rfbntpadxbviolqyihib.supabase.co';
const CDN_BASE      = 'https://storage-proxy.anhthupham1609.workers.dev';

// Chuyển URL Supabase storage sang Cloudflare CDN để giảm egress
export function toCDN(url) {
  if (!url || typeof url !== 'string') return url;
  return url.replace(SUPABASE_BASE, CDN_BASE);
}

// Nén ảnh xuống WebP trước khi upload — giảm ~50-70% dung lượng
// Bỏ qua video, 3D model, SVG và ảnh đã nhỏ sẵn
export async function compressImage(file, { maxWidth = 2000, quality = 0.85 } = {}) {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (!blob || blob.size >= file.size) return resolve(file);
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }));
      }, 'image/webp', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
