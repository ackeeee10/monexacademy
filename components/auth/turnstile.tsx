"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useCallback, useRef, useState } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const TOKEN_TIMEOUT_MS = 12_000;

/**
 * Invisible Cloudflare Turnstile. Render `widget` inside the form and call
 * `getToken()` right before submitting; call `reset()` after each attempt,
 * because tokens are single-use. If Turnstile fails to load or errors, the
 * token is undefined and the server answers with a visible "captcha" error
 * instead of the form hanging.
 */
export function useTurnstile() {
  const ref = useRef<TurnstileInstance | undefined>(undefined);
  const failed = useRef(false);
  const [waiting, setWaiting] = useState(false);

  const getToken = useCallback(async (): Promise<string | undefined> => {
    if (!SITE_KEY || !ref.current || failed.current) return undefined;
    const existing = ref.current.getResponse();
    if (existing) return existing;
    setWaiting(true);
    try {
      return await ref.current.getResponsePromise(TOKEN_TIMEOUT_MS);
    } catch {
      return undefined;
    } finally {
      setWaiting(false);
    }
  }, []);

  const reset = useCallback(() => {
    failed.current = false;
    ref.current?.reset();
  }, []);

  const widget = SITE_KEY ? (
    <Turnstile
      ref={ref}
      siteKey={SITE_KEY}
      options={{ size: "invisible", theme: "auto", refreshExpired: "auto" }}
      onError={(code) => {
        failed.current = true;
        console.error("[turnstile] error", code);
      }}
      onUnsupported={() => {
        failed.current = true;
      }}
    />
  ) : null;

  return { widget, getToken, reset, waiting };
}
