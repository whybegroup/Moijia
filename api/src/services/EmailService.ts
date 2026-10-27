import fs from 'fs';
import path from 'path';

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL?.trim() || 'support@moijia.com';
const NOREPLY_EMAIL = process.env.NOREPLY_EMAIL?.trim() || 'noreply@moijia.com';
export const MAIL_FOOTER = [
  'Your right to cancel: You may cancel Pro at any time. Cancel at least 24 hours before the end of the current billing period to avoid the next charge. Pro stays active through the remainder of the paid period. Groups you own that are larger than Small become Small 15 days after Pro expires. Manage or cancel the subscription in your Apple App Store or Google Play account settings. Deleting the app does not cancel a subscription. Refunds and billing disputes are handled by the store that charged you. We reserve the right to change pricing and will try to notify you in advance of a change.',
  'moijia may use your data to operate and improve the Service and to send you information about your account. You can change notification preferences in the app. We use your data as described in our Privacy Policy at https://moijia.com/privacy.',
];
const MAIL_ICON_CID = 'favicon';
const MAIL_ICON_PATH = path.resolve(__dirname, '../../assets/favicon.png');

type MailAttachment = {
  filename: string;
  content: string;
  content_id: string;
  content_type: string;
};

function mailIconAttachment(): MailAttachment | null {
  try {
    if (!fs.existsSync(MAIL_ICON_PATH)) return null;
    return {
      filename: 'favicon.png',
      content: fs.readFileSync(MAIL_ICON_PATH).toString('base64'),
      content_id: MAIL_ICON_CID,
      content_type: 'image/png',
    };
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type ReceiptRow = { label: string; value: string };
export type ReceiptSection = { heading: string; rows: ReceiptRow[] };

export function buildReceiptHtml(input: {
  intro: string;
  sections: ReceiptSection[];
  note?: string;
}): string {
  const sections = input.sections
    .map((section) => {
      const heading = `
        <tr>
          <td colspan="2" align="center" bgcolor="#111111" style="padding:14px 20px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;letter-spacing:1.5px;color:#ffffff;">
            ${escapeHtml(section.heading)}
          </td>
        </tr>`;
      const rows = section.rows
        .map(
          (row) => `
        <tr>
          <td valign="top" width="46%" style="padding:12px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#555555;border-bottom:1px solid #eeeeee;">
            ${escapeHtml(row.label)}
          </td>
          <td valign="top" align="right" width="54%" style="padding:12px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111111;border-bottom:1px solid #eeeeee;">
            ${escapeHtml(row.value)}
          </td>
        </tr>`
        )
        .join('');
      return heading + rows;
    })
    .join('');

  const note = input.note
    ? `<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#666666;">${escapeHtml(input.note)}</p>`
    : '';
  const footer = MAIL_FOOTER.map(
    (paragraph, index) =>
      `<p style="margin:${index === 0 ? '28px' : '16px'} 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#8a8a8a;text-align:center;">${escapeHtml(paragraph)}</p>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>moijia</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
          <tr>
            <td align="center" style="padding:0 0 20px;">
              <img src="cid:${MAIL_ICON_CID}" width="96" height="96" alt="moijia" style="display:block;border:0;outline:none;width:96px;height:96px;border-radius:20px;" />
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#111111;">
              ${escapeHtml(input.intro)}
            </td>
          </tr>
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border:1px solid #dddddd;border-collapse:collapse;">
                ${sections}
              </table>
              ${note}
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

type OutboundMail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: MailAttachment[];
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
      from: input.from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
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
  html?: string;
  sections?: ReceiptSection[];
  intro?: string;
  note?: string;
}): Promise<void> {
  const to = input.to?.trim();
  if (!to || !to.includes('@')) {
    console.warn(`[mail] skip (no address): ${input.subject}`);
    return;
  }

  const html =
    input.html?.trim() ||
    (input.sections
      ? buildReceiptHtml({
          intro: input.intro ?? '',
          sections: input.sections,
          note: input.note,
        })
      : undefined);

  if (!process.env.RESEND_API_KEY?.trim()) {
    console.warn(`[mail] ${to} — ${input.subject}\n${input.text}`);
    return;
  }

  const icon = html ? mailIconAttachment() : null;
  await deliver({
    from: NOREPLY_EMAIL,
    to,
    subject: input.subject,
    text: input.text,
    html,
    attachments: icon ? [icon] : undefined,
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
    from: SUPPORT_EMAIL,
    to: SUPPORT_EMAIL,
    replyTo: email,
    subject: `moijia support from ${name}`,
    text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
  });
}
