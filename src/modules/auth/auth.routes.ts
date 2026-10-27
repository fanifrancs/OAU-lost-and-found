import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { pool } from '../../config/db';
import { env } from '../../config/env';
import { asyncHandler } from '../../middleware/async-handler';
import { AppError, requestBody, requireString } from '../../utils/errors';
import { sendVerificationEmail } from '../../utils/email';

const router = Router();
const emailPattern = /^[^\s@]+@(student\.oauife\.edu\.ng|oauife\.edu\.ng)$/i;
const phonePattern = /^0\d{10}$/;
const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');

router.post('/register', asyncHandler(async (req, res) => {
  const body = requestBody(req.body);
  const fullName = requireString(body.full_name, 'full_name', 2, 160);
  const email = requireString(body.email, 'email', 3, 254).toLowerCase();
  const phone = requireString(body.phone_number, 'phone_number', 11, 20);
  const whatsapp = requireString(body.whatsapp_number, 'whatsapp_number', 11, 20);
  const matric = requireString(body.matric_number, 'matric_number', 3, 40).toUpperCase();
  const department = requireString(body.department, 'department', 2, 160);
  const password = requireString(body.password, 'password', 10, 128);

  if (!emailPattern.test(email)) throw new AppError(400, 'INVALID_EMAIL_DOMAIN', 'Registration is restricted to verified OAU student emails (@student.oauife.edu.ng or @oauife.edu.ng).');
  if (!phonePattern.test(phone) || !phonePattern.test(whatsapp)) throw new AppError(400, 'INVALID_PHONE_NUMBER', 'Phone numbers must use the local Nigerian format, for example 08123456789.');
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) throw new AppError(400, 'WEAK_PASSWORD', 'Password must contain uppercase, lowercase, and numeric characters.');

  const token = randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(password, 12);
  const expiresAt = new Date(Date.now() + env.verificationTokenTtlHours * 60 * 60 * 1000);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: string; email: string }>(
      `INSERT INTO users (full_name, email, phone_number, whatsapp_number, matric_number, department, password_hash, verification_token_hash, verification_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, email`,
      [fullName, email, phone, whatsapp, matric, department, passwordHash, tokenHash(token), expiresAt],
    );
    await sendVerificationEmail(email, token);
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Registration successful. Please check your OAU email to verify your account.', data: { user_id: result.rows[0].id, email: result.rows[0].email } });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}));

router.get('/verify-email', asyncHandler(async (req, res) => {
  const token = requireString(req.query.token, 'token', 32, 256);
  const result = await pool.query(
    `UPDATE users SET is_verified = TRUE, verification_token_hash = NULL, verification_expires_at = NULL
     WHERE verification_token_hash = $1 AND verification_expires_at > NOW() AND is_verified = FALSE RETURNING id`,
    [tokenHash(token)],
  );
  if (result.rowCount !== 1) throw new AppError(400, 'INVALID_VERIFICATION_TOKEN', 'The verification token is invalid, expired, or already used.');
  res.json({ success: true, message: 'Email successfully verified. You can now log in.' });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const body = requestBody(req.body);
  const email = requireString(body.email, 'email', 3, 254).toLowerCase();
  const password = requireString(body.password, 'password', 1, 128);
  const result = await pool.query<{ id: string; full_name: string; email: string; department: string; password_hash: string; is_verified: boolean }>(
    'SELECT id, full_name, email, department, password_hash, is_verified FROM users WHERE email = $1', [email],
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  if (!user.is_verified) throw new AppError(401, 'ACCOUNT_NOT_VERIFIED', 'Verify your OAU email before logging in.');
  const token = jwt.sign({ email: user.email }, env.jwtSecret, { subject: user.id, expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
  res.json({ success: true, data: { token, user: { id: user.id, full_name: user.full_name, email: user.email, department: user.department } } });
}));

export default router;
