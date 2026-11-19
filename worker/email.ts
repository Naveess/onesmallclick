// Sending the sign-in email: the only file that knows how (decision 14: Cloudflare Email Service).
// Switching to another service (Resend, say) means changing this file only.
//
// It needs, in production:
//   - a `send_email` binding named EMAIL in wrangler.jsonc ("send_email": [{ "name": "EMAIL" }]);
//   - EMAIL_FROM, the sender address on a domain onboarded in Email Service (e.g. signin@onesmallclick.io);
//   - Workers Paid.
// Until both are set, email sign-in says it isn't open yet (Google still works).

interface MailEnv {
  EMAIL?: SendEmail;
  EMAIL_FROM?: string;
}

/** True once the sender is set up. */
export function emailReady(env: Env): boolean {
  const e = env as unknown as MailEnv;
  return !!e.EMAIL && !!e.EMAIL_FROM;
}

/** Emails a sign-in link. Resolves false if it couldn't be sent. */
export async function sendSignInLink(env: Env, to: string, link: string): Promise<boolean> {
  const e = env as unknown as MailEnv;
  if (!e.EMAIL || !e.EMAIL_FROM) return false;
  const text = [
    "Here's your link to sign in to OneSmallClick:",
    "",
    link,
    "",
    "It works once, for 15 minutes. Open it on the device you want to sign in on.",
    "If you didn't ask for this, ignore this email: nothing happens unless the link is used.",
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#14244a">
<p>Here's your link to sign in to OneSmallClick:</p>
<p><a href="${link}" style="display:inline-block;padding:12px 18px;background:#0a1636;color:#8ccfff;border:2px solid #8ccfff;text-decoration:none;font-weight:600">Sign in to OneSmallClick</a></p>
<p>It works once, for 15 minutes. Open it on the device you want to sign in on.</p>
<p style="color:#44557d;font-size:14px">If you didn't ask for this, ignore this email: nothing happens unless the link is used.</p>
</body></html>`;
  try {
    await e.EMAIL.send({
      from: { email: e.EMAIL_FROM, name: "OneSmallClick" },
      to,
      subject: "Your OneSmallClick sign-in link",
      text,
      html,
    });
    return true;
  } catch (err) {
    console.error("sign-in email failed", err);
    return false;
  }
}
