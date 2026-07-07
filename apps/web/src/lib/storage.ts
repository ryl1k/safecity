import { supabase } from './supabase';

const BUCKET = 'photos';
const MAX_DIM = 1280; // px, longest edge
const QUALITY = 0.8;

/** Downscale + re-encode an image client-side to keep uploads small. */
export async function compressImage(file: File): Promise<Blob> {
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/jpeg', QUALITY));
    return blob ?? file;
  } catch {
    return file; // fall back to the original on any decode failure
  }
}

/** Compress + upload images to the public photos bucket; returns their public URLs. */
export async function uploadPhotos(files: File[], prefix: string): Promise<string[]> {
  if (files.length === 0) return [];
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('not-authenticated');
  const urls: string[] = [];
  for (const file of files) {
    const blob = await compressImage(file);
    const path = `${prefix}/${auth.user.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    urls.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  }
  return urls;
}
