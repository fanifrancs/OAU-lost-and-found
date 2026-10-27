import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { AppError } from './errors';

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const verificationUrl = env.frontendVerificationUrl
    ? `${env.frontendVerificationUrl}${env.frontendVerificationUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
    : `${env.appBaseUrl}/v1/auth/verify-email?token=${encodeURIComponent(token)}`;

  if (!env.smtpHost || !env.smtpUser || !env.smtpPassword) {
    if (env.nodeEnv === 'production') throw new AppError(503, 'EMAIL_UNAVAILABLE', 'Email verification is temporarily unavailable.');
    console.info(`Development verification link for ${email}: ${verificationUrl}`);
    return;
  }

  const transporter = createTransport();
  await transporter.sendMail({
    from: env.smtpFrom,
    to: email,
    subject: 'Verify your OAU Lost & Found account',
    text: `Verify your account using this link: ${verificationUrl}\nThis link expires in ${env.verificationTokenTtlHours} hours.`,
  });
}

export async function sendClaimNotification(email: string, itemTitle: string): Promise<void> {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPassword) {
    console.info(`Development notification: a student submitted a claim for "${itemTitle}"; notify ${email}.`);
    return;
  }
  await createTransport().sendMail({
    from: env.smtpFrom,
    to: email,
    subject: 'A student submitted a claim for your OAU Lost & Found item',
    text: `A student submitted a claim for "${itemTitle}". Sign in to review the claim in the OAU Lost & Found app.`,
  });
}

function createTransport(): Transporter {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPassword) {
    throw new AppError(503, 'EMAIL_UNAVAILABLE', 'Email delivery is temporarily unavailable.');
  }
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: { user: env.smtpUser, pass: env.smtpPassword },
  });
}
