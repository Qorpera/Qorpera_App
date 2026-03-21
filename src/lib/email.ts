import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  react?: React.ReactElement;
  html?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.log(
      `[email] Dev mode — skipping email to ${params.to}: ${params.subject}`
    );
    return { success: true };
  }

  try {
    const resend = getResend();
    const base = {
      from: process.env.EMAIL_FROM || "Qorpera <noreply@qorpera.com>",
      to: params.to,
      subject: params.subject,
    };

    const { error } = params.react
      ? await resend.emails.send({ ...base, react: params.react })
      : await resend.emails.send({ ...base, html: params.html || "" });

    if (error) {
      console.error("[email] Resend error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error("[email] Failed to send:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
