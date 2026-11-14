"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useCallback, useRef, useState } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const TOKEN_TIMEOUT_MS = 12_000;

/** Plain-English hints for the most common Turnstile error codes. */
function describe(code: string): string {
  if (code.startsWith("1102")) return `Turnstile ${code}: this website address isn't allowed in the Turnstile widget`;
  if (code.startsWith("1101") || code.startsWith("4000")) return `Turnstile ${code}: the site key isn't valid`;
  if (code.startsWith("3")) return `Turnstile ${code}: the browser challenge failed`;
  if (code.startsWith("6")) return `Turnstile ${code}: verification was blocked`;
  return `Turnstile ${code}`;
}

/**
 * Invisible Cloudflare Turnstile. Render `widget` inside the form and call
 * `getToken()` right before submitting; call `reset()` after each attempt,
 * because tokens are single-use. `lastError()` explains why no token was
 * produced, so problems can be diagnosed from the form itself.
 */
export function useTurnstile() {
  const ref = useRef<TurnstileInstance | undefined>(undefined);
  const errorCode = useRef<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  const getToken = useCallback(async (): Promise<string | undefined> => {
    if (!SITE_KEY) return undefined;
    const widget = ref.current;
    if (!widget) {
      errorCode.current = "not-loaded";
      return undefined;
    }
    const existing = widget.getResponse();
    if (existing) return existing;
    // After an error, try once more with a fresh challenge.
    if (errorCode.current) widget.reset();
    setWaiting(true);
    try {
      return await widget.getResponsePromise(TOKEN_TIMEOUT_MS);
    } catch {
      errorCode.current ??= "timeout";
      return undefined;
    } finally {
      setWaiting(false);
    }
  }, []);

  const reset = useCallback(() => ref.current?.reset(), []);

  const lastError = useCallback((): string | undefined => {
    const code = errorCode.current;
    if (!SITE_KEY) return "Turnstile site key is missing";
    if (!code) return undefined;
    if (code === "not-loaded") return "Turnstile didn't load (blocked by the browser or an extension?)";
    if (code === "timeout") return "Turnstile didn't answer in time";
    return describe(code);
  }, []);

  const widget = SITE_KEY ? (
    <Turnstile
      ref={ref}
      siteKey={SITE_KEY}
      options={{ size: "invisible", theme: "auto", refreshExpired: "auto" }}
      onSuccess={() => {
        errorCode.current = null;
      }}
      onError={(code) => {
        errorCode.current = String(code);
        console.error("[turnstile] error", code);
      }}
      onUnsupported={() => {
        errorCode.current = "unsupported";
      }}
    />
  ) : null;

  return { widget, getToken, reset, waiting, lastError };
}
