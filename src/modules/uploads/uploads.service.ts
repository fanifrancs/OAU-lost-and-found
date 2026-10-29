import { randomUUID } from 'node:crypto';

export interface SignedUpload {
  bucket: string;
  path: string;
  token: string;
  expiresIn: number;
  publicUrl: string;
}

export async function createSignedUpload(userId: string, fileName: string, contentType: string): Promise<SignedUpload> {
  const projectUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'item-images';
  if (!projectUrl || !serviceRoleKey) throw new Error('Supabase Storage is not configured.');

  const allowedTypes = (process.env.SUPABASE_ALLOWED_IMAGE_TYPES || 'image/jpeg,image/png,image/webp')
    .split(',').map((type) => type.trim().toLowerCase());
  if (!allowedTypes.includes(contentType.toLowerCase())) throw new TypeError('INVALID_FILE_TYPE');

  const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';
  const safeExtension = extension && /^[a-z0-9]{1,8}$/.test(extension) ? `.${extension}` : '';
  const path = `users/${userId}/${randomUUID()}${safeExtension}`;
  const signedUrlEndpoint = `${projectUrl}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(signedUrlEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ upsert: false }),
  });
  const payload = await response.json() as { token?: string; signedURL?: string; error?: string; message?: string };
  if (!response.ok || !payload.token) {
    throw new Error(payload.message || payload.error || `Supabase Storage returned ${response.status}.`);
  }

  const publicUrl = `${projectUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`;
  return { bucket, path, token: payload.token, expiresIn: 7200, publicUrl };
}
