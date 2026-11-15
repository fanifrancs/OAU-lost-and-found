import { Request, Response } from 'express';
import { loginStudent, logoutStudent, registerStudent, verifyStudentEmail } from './auth.service';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) return String(error.code);
  return undefined;
}

export async function registerHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!isObject(req.body)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Request body must be a JSON object.' } });
      return;
    }

    const { full_name, email, phone_number, whatsapp_number, matric_number, department, password } = req.body;
    if (!stringValue(full_name, 6, 160) || !stringValue(email, 14, 254) || !stringValue(phone_number, 11, 11)
      || !stringValue(whatsapp_number, 11, 20) || !stringValue(matric_number, 12, 12)
      || !stringValue(department, 2, 160) || !stringValue(password, 8, 128)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'All registration fields must be provided with valid lengths.' } });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@(student\.oauife\.edu\.ng|oauife\.edu\.ng)$/.test(normalizedEmail)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_EMAIL_DOMAIN', message: 'Registration is restricted to OAU student email addresses.' } });
      return;
    }
    if (!/^0\d{10}$/.test(phone_number.trim()) || !/^0\d{10}$/.test(whatsapp_number.trim())) {
      res.status(400).json({ success: false, error: { code: 'INVALID_PHONE_NUMBER', message: 'Phone numbers must use the Nigerian format, for example 08123456789.' } });
      return;
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      res.status(400).json({ success: false, error: { code: 'WEAK_PASSWORD', message: 'Password must contain uppercase, lowercase, and numeric characters.' } });
      return;
    }

    const user = await registerStudent({
      fullName: full_name.trim(), email: normalizedEmail, phoneNumber: phone_number.trim(),
      whatsappNumber: whatsapp_number.trim(), matricNumber: matric_number.trim().toUpperCase(),
      department: department.trim(), password,
    });

    res.status(201).json({
      success: true,
      message: process.env.EMAIL_VERIFICATION_ENABLED === 'true'
        ? 'Registration successful. Please check your OAU email to verify your account.'
        : 'Registration successful. You can now log in.',
      data: { user_id: user.id, email: user.email },
    });
  } catch (error) {
    const code = errorCode(error);
    if (code === '23505') {
      let constraint = '';
      if ('constraint' in (error as object)) {
        constraint = String((error as { constraint?: string }).constraint);
      } else {
        constraint = '';
      }
      const matricConflict = constraint.includes('matric');
      res.status(409).json({ success: false, error: { code: matricConflict ? 'MATRIC_NUMBER_ALREADY_REGISTERED' : 'EMAIL_ALREADY_REGISTERED', message: matricConflict ? 'This matric number is already registered.' : 'This email address is already registered.' } });
      return;
    }
    console.error('Register error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to register the account right now.' } });
  }
}

export async function verifyEmailHandler(req: Request, res: Response): Promise<void> {
  try {
    const token = req.query.token;
    if (!stringValue(token, 32, 256)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'A valid verification token is required.' } });
      return;
    }

    const verified = await verifyStudentEmail(token);
    if (!verified) {
      res.status(400).json({ success: false, error: { code: 'INVALID_OR_EXPIRED_TOKEN', message: 'The verification token is invalid, expired, or already used.' } });
      return;
    }

    res.status(200).json({ success: true, message: 'Email successfully verified. You can now log in.' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to verify the email right now.' } });
  }
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!isObject(req.body) || !stringValue(req.body.email, 14, 254) || !stringValue(req.body.password, 1, 128)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Email and password are required.' } });
      return;
    }

    const result = await loginStudent(req.body.email.trim().toLowerCase(), req.body.password);
    if (!result) {
      res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
      return;
    }
    if (!result.verified) {
      res.status(403).json({ success: false, error: { code: 'ACCOUNT_UNVERIFIED', message: 'Verify your OAU email before logging in.' } });
      return;
    }
    
    res.status(200).json({ success: true, data: { token: result.token, user: result.user } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to log in right now.' } });
  }
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  try {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'A bearer token is required.' } });
      return;
    }

    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'You must be signed in to log out.' } });
      return;
    }

    const token = authorization.slice(7).trim();
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'A valid bearer token is required.' } });
      return;
    }

    await logoutStudent(req.user.id, token);
    res.status(200).json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to log out right now.' } });
  }
}
