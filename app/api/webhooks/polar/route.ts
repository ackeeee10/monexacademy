import { webhooks } from "@polar-sh/sdk/2026-10";
import { NextResponse } from "next/server";

import { handlePolarEvent, IgnoredEvent } from "@/lib/billing/webhook";
import { isSupabaseConfigured } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";

const json = (body: object, status: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Polar webhooks. The signature is checked on the raw body before anything
 * else; each delivery id is booked once, so retries never grant twice.
 * A 5xx answer makes Polar retry later.
 */
export async function POST(request: Request) {
  const secret = serverEnv.polarWebhookSecret();
  if (!secret) {
    console.error("[polar webhook] POLAR_WEBHOOK_SECRET missing");
    return json({ error: "not_configured" }, 503);
  }

  const body = await request.text();
  const headers = {
    "webhook-id": request.headers.get("webhook-id") ?? "",
    "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
    "webhook-signature": request.headers.get("webhook-signature") ?? "",
  };

  let event: Awaited<ReturnType<typeof webhooks.validateEvent>>;
  try {
    event = await webhooks.validateEvent(body, headers, secret);
  } catch (error) {
    if (error instanceof webhooks.PolarWebhookVerificationError) return json({ error: "invalid_signature" }, 403);
    // Events we don't subscribe to (or newer types) are acknowledged and ignored.
    if (error instanceof webhooks.PolarWebhookUnknownTypeError) return json({ received: true, ignored: true }, 202);
    console.error("[polar webhook] invalid payload", error);
    return json({ error: "invalid_payload" }, 400);
  }

  const admin = isSupabaseConfigured() ? createAdminClient() : null;
  if (!admin) {
    console.error("[polar webhook] Supabase secret key missing");
    return json({ error: "not_configured" }, 503);
  }

  const eventId = headers["webhook-id"];
  const { data: needed, error: recordError } = await admin.rpc("billing_record_event", {
    p_event_id: eventId,
    p_type: event.type,
    p_payload: JSON.parse(body),
  });
  if (recordError) {
    console.error("[polar webhook] record", recordError.message);
    return json({ error: "storage" }, 500);
  }
  if (!needed) return json({ received: true, duplicate: true }, 200);

  try {
    await handlePolarEvent(admin, event);
    await admin.rpc("billing_finish_event", { p_event_id: eventId, p_error: null });
    return json({ received: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof IgnoredEvent) {
      // Nothing to retry (unknown product, deleted account): keep the reason, stop retries.
      console.warn("[polar webhook] ignored", event.type, message);
      await admin.rpc("billing_finish_event", { p_event_id: eventId, p_error: null });
      return json({ received: true, ignored: true }, 200);
    }
    console.error("[polar webhook] failed", event.type, message);
    await admin.rpc("billing_finish_event", { p_event_id: eventId, p_error: message });
    return json({ error: "processing_failed" }, 500);
  }
}
