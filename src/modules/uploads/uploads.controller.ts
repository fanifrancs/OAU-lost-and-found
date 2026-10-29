import { Request, Response } from 'express';
import { createSignedUpload } from './uploads.service';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function createSignedUploadHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!isObject(req.body) || typeof req.body.file_name !== 'string' || typeof req.body.content_type !== 'string') {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'file_name and content_type are required.' } });
      return;
    }
    const fileName = req.body.file_name.trim();
    const contentType = req.body.content_type.trim().toLowerCase();
    if (!fileName || fileName.length > 255 || !/^image\/[a-z0-9.+-]+$/.test(contentType)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Provide a valid image filename and MIME type.' } });
      return;
    }
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } });
      return;
    }

    const upload = await createSignedUpload(req.user.id, fileName, contentType);
    res.status(201).json({ success: true, data: {
      bucket: upload.bucket,
      path: upload.path,
      token: upload.token,
      expires_in: upload.expiresIn,
      public_url: upload.publicUrl,
    } });
  } catch (error) {
    if (error instanceof TypeError && error.message === 'INVALID_FILE_TYPE') {
      res.status(400).json({ success: false, error: { code: 'INVALID_FILE_TYPE', message: 'This image type is not allowed.' } });
      return;
    }
    console.error('Create signed upload error:', error);
    res.status(503).json({ success: false, error: { code: 'UPLOAD_UNAVAILABLE', message: 'Unable to create an upload token right now.' } });
  }
}
