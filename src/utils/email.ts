import nodemailer from 'nodemailer';

function createTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  if (!host || !user || !password) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass: password },
  });
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const ttlHours = Number(process.env.VERIFICATION_TOKEN_TTL_HOURS) || 24;
  const frontendUrl = process.env.FRONTEND_VERIFICATION_URL;
  const baseUrl = frontendUrl || `${process.env.APP_BASE_URL || 'http://localhost:3000'}/v1/auth/verify-email`;
  const verificationUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  const transporter = createTransport();

  if (!transporter) {
    if (process.env.NODE_ENV === 'production') throw new Error('Email delivery is not configured.');
    console.info(`Development verification link for ${email}: ${verificationUrl}`);
    return;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'OAU Lost & Found <no-reply@oaulostandfound.com>',
    to: email,
    subject: 'Verify your OAU Lost & Found account',
    text: `Verify your account using this link: ${verificationUrl}\nThis link expires in ${ttlHours} hours.`,
  });
}

export async function sendClaimNotification(email: string, itemTitle: string): Promise<void> {
  const transporter = createTransport();
  if (!transporter) {
    console.info(`Development notification: a student submitted a claim for "${itemTitle}"; notify ${email}.`);
    return;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'OAU Lost & Found <no-reply@oaulostandfound.com>',
    to: email,
    subject: 'A student submitted a claim for your OAU Lost & Found item',
    text: `A student submitted a claim for "${itemTitle}". Sign in to review it in the OAU Lost & Found app.`,
  });
}
