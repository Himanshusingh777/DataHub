/**
 * Transactional email — shared by password reset and Automation's "email"
 * action. Uses Resend if RESEND_API_KEY is set; logs to console otherwise
 * (development fallback, not a fake send — no email is silently dropped,
 * the intended content is always visible in server logs).
 */

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;

  if (!resendKey) {
    console.log(`[email] (RESEND_API_KEY not set) Would send to ${to}: "${subject}"\n${html}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? "noreply@crosstecch.io",
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend API error ${res.status}: ${await res.text()}`);
  }
}
