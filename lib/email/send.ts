import "server-only";

import { env } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";

export type SendResult = { ok: true } | { ok: false; reason: "not_configured" | "rejected" | "network"; detail?: string };

/** Sends one email through the Resend API (no SDK needed). */
export async function sendEmail(input: { to: string; subject: string; text: string; html: string }): Promise<SendResult> {
  const apiKey = serverEnv.resendApiKey();
  if (!apiKey) return { ok: false, reason: "not_configured", detail: "RESEND_API_KEY" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom(), to: [input.to], subject: input.subject, text: input.text, html: input.html }),
      cache: "no-store",
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    console.error("[email] Resend refused", res.status, body?.message);
    return { ok: false, reason: "rejected", detail: body?.message?.slice(0, 200) };
  } catch (error) {
    console.error("[email] network error", error);
    return { ok: false, reason: "network" };
  }
}
