const MAIL_FROM = process.env.MAIL_FROM?.trim() || 'moijia <hello@moijia.com>';
const SUPPORT_INBOX = process.env.SUPPORT_EMAIL?.trim() || 'whybegroup@gmail.com';

type OutboundMail = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
};

async function deliver(input: OutboundMail): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error('Email is not configured.');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn(`[mail] Resend ${res.status}: ${body}`);
    throw new Error('Could not send email.');
  }
}

export async function sendOwnerEmail(input: {
  to: string | null | undefined;
  subject: string;
  text: string;
}): Promise<void> {
  const to = input.to?.trim();
  if (!to || !to.includes('@')) {
    console.warn(`[mail] skip (no address): ${input.subject}`);
    return;
  }
  if (!process.env.RESEND_API_KEY?.trim()) {
    console.warn(`[mail] ${to} — ${input.subject}\n${input.text}`);
    return;
  }
  await deliver({ to, subject: input.subject, text: input.text }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Could not send email.';
    console.warn(`[mail] ${message}`);
  });
}

export async function sendSupportEmail(input: {
  name: string;
  email: string;
  message: string;
}): Promise<void> {
  const name = input.name.trim();
  const email = input.email.trim();
  const message = input.message.trim();
  await deliver({
    to: SUPPORT_INBOX,
    replyTo: email,
    subject: `moijia support from ${name}`,
    text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
  });
}
