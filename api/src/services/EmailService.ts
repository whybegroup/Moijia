const MAIL_FROM = process.env.MAIL_FROM?.trim() || 'moijia <hello@moijia.com>';

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

  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    console.warn(`[mail] ${to} — ${input.subject}\n${input.text}`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [to],
      subject: input.subject,
      text: input.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn(`[mail] Resend ${res.status}: ${body}`);
  }
}
