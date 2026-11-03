import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../../config/db';
import { sendVerificationEmail } from '../../utils/email';

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export interface RegistrationInput {
  fullName: string;
  email: string;
  phoneNumber: string;
  whatsappNumber: string;
  matricNumber: string;
  department: string;
  password: string;
}

export async function registerStudent(input: RegistrationInput): Promise<{ id: string; email: string }> {
  const token = randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(input.password, 12);
  const ttlHours = Number(process.env.VERIFICATION_TOKEN_TTL_HOURS) || 24;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ($9 * INTERVAL '1 hour') is used to set the verification_expires_at column to the current time plus the TTL in hours. INTERVAL is a data type for a length of time—a duration, rather than a specific date or moment.
    // $9 represents the ttlHours parameter, which is passed to the query as an argument. This allows the TTL to be dynamically set based on the environment variable or default value.
    const query = `
      INSERT INTO users (full_name, email, phone_number, whatsapp_number, matric_number, department, password_hash, verification_token_hash, verification_expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + ($9 * INTERVAL '1 hour'))
      RETURNING id, email
    `;
    const values = [
      input.fullName,
      input.email,
      input.phoneNumber,
      input.whatsappNumber,
      input.matricNumber,
      input.department,
      passwordHash,
      hashToken(token),
      ttlHours,
    ];
    const result = await client.query<{ id: string; email: string }>(query, values);

    // there should be a resend verification email function in case of token expiration, but it is not implemented yet.
    await sendVerificationEmail(result.rows[0].email, token);

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyStudentEmail(token: string): Promise<boolean> {
  const query = ` UPDATE users SET is_verified = TRUE, verification_token_hash = NULL, verification_expires_at = NULL
  WHERE verification_token_hash = $1 AND verification_expires_at > NOW() AND is_verified = FALSE
  RETURNING id
  `;
  const values = [hashToken(token)];
  const result = await pool.query(query, values);

  return result.rowCount === 1;
}

export async function loginStudent(email: string, password: string): Promise<{
  token: string;
  user: { id: string; full_name: string; email: string; department: string };
  verified: boolean;
} | null> {
  const query = 'SELECT id, full_name, email, department, password_hash, is_verified FROM users WHERE email = $1';
  const values = [email];
  const result = await pool.query<{
    id: string;
    full_name: string;
    email: string;
    department: string;
    password_hash: string;
    is_verified: boolean;
  }>(query, values);

  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return null;
  
  const safeUser = {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    department: user.department,
  };
  if (!user.is_verified) return { token: '', user: safeUser, verified: false };

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured.');
  
  const token = jwt.sign(
    { email: user.email },
    secret,
    { subject: user.id, expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions,
  );

  return {
    token,
    user: safeUser,
    verified: true,
  };
}

export async function logoutStudent(userId: string, token: string): Promise<void> {
  const decoded = jwt.decode(token);
  if (typeof decoded !== 'object' || decoded === null || typeof decoded.exp !== 'number') {
    throw new Error('Token does not include an expiration timestamp.');
  }

  await pool.query(
    `
      INSERT INTO revoked_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, TO_TIMESTAMP($3))
      ON CONFLICT (user_id, token_hash) DO NOTHING
    `,
    [userId, hashToken(token), decoded.exp],
  );
}
