// Photo upload (RN port of apps/web/src/lib/storage.ts). expo-image-manipulator
// downscales + re-encodes to JPEG (with base64) so we can hand raw bytes to
// Supabase Storage — fetch(file://) is unreliable in RN, base64→ArrayBuffer isn't.
import { decode } from 'base64-arraybuffer';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from './supabase';

const BUCKET = 'photos';
const MAX_DIM = 1280; // px, longest edge
const QUALITY = 0.8;

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e12).toString(36)}`;
}

/** Compress a local image URI to a JPEG and return its base64 payload. */
async function compress(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: MAX_DIM } }], {
    compress: QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  if (!result.base64) throw new Error('image-encode-failed');
  return result.base64;
}

/** Compress + upload local image URIs to the public photos bucket; returns public URLs. */
export async function uploadPhotos(uris: string[], prefix: string): Promise<string[]> {
  if (uris.length === 0) return [];
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('not-authenticated');
  const urls: string[] = [];
  for (const uri of uris) {
    const base64 = await compress(uri);
    const path = `${prefix}/${auth.user.id}/${randomId()}.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    urls.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  }
  return urls;
}
