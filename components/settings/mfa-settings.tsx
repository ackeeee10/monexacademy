"use client";

import { ShieldCheck, ShieldOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { useErrorMessage } from "@/components/auth/use-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { confirmMfaEnrollment, disableMfa, startMfaEnrollment } from "@/lib/auth/actions";
import { runAction } from "@/components/auth/run-action";

type Enrollment = { factorId: string; qrCode: string; secret: string };

function CodeInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <Input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="000000"
      className="tabular h-12 max-w-48 text-center text-lg tracking-[0.4em]"
    />
  );
}

export function MfaSettings({ enabled: initialEnabled }: { enabled: boolean }) {
  const t = useTranslations("Settings.security");
  const tAuth = useTranslations("Auth");
  const errorMessage = useErrorMessage();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  async function begin() {
    setPending(true);
    setError(undefined);
    setNotice(undefined);
    const result = await runAction(() => startMfaEnrollment());
    setPending(false);
    if (result.ok) setEnrollment(result.data);
    else setError(errorMessage(result.error));
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!enrollment) return;
    setPending(true);
    setError(undefined);
    const result = await runAction(() => confirmMfaEnrollment({ factorId: enrollment.factorId, code }));
    setPending(false);
    if (result.ok) {
      setEnabled(true);
      setEnrollment(null);
      setCode("");
      setNotice(t("turnedOn"));
    } else setError(errorMessage(result.error));
  }

  async function turnOff(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    const result = await runAction(() => disableMfa({ code }));
    setPending(false);
    if (result.ok) {
      setEnabled(false);
      setDisabling(false);
      setCode("");
      setNotice(t("turnedOff"));
    } else setError(errorMessage(result.error));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 text-sm">
        {enabled ? (
          <ShieldCheck className="size-5 text-success" aria-hidden />
        ) : (
          <ShieldOff className="size-5 text-muted" aria-hidden />
        )}
        <span className={enabled ? "text-text" : "text-muted"}>{enabled ? t("enabled") : t("disabled")}</span>
      </div>

      {notice && <Alert variant="success">{notice}</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}

      {!enabled && !enrollment && (
        <Button onClick={begin} disabled={pending}>
          {pending && <Spinner />}
          {t("enable")}
        </Button>
      )}

      {enrollment && (
        <form onSubmit={confirm} className="space-y-5">
          <p className="text-sm text-muted">{t("scan")}</p>
          <div className="inline-block rounded-lg bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URI from Supabase */}
            <img src={enrollment.qrCode} alt="" width={176} height={176} className="size-44" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-muted">{t("manual")}</p>
            <code className="block break-all rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs text-text">
              {enrollment.secret}
            </code>
          </div>
          <Field id="enroll-code" label={tAuth("mfa.code")}>
            <CodeInput id="enroll-code" value={code} onChange={setCode} />
          </Field>
          <div className="flex gap-3">
            <Button type="submit" disabled={pending || code.length !== 6}>
              {pending && <Spinner />}
              {t("confirm")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEnrollment(null)}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}

      {enabled && !disabling && (
        <Button variant="secondary" onClick={() => { setDisabling(true); setNotice(undefined); }}>
          {t("disable")}
        </Button>
      )}

      {enabled && disabling && (
        <form onSubmit={turnOff} className="space-y-5">
          <p className="text-sm text-muted">{t("disableBody")}</p>
          <Field id="disable-code" label={tAuth("mfa.code")}>
            <CodeInput id="disable-code" value={code} onChange={setCode} />
          </Field>
          <div className="flex gap-3">
            <Button type="submit" variant="secondary" disabled={pending || code.length !== 6}>
              {pending && <Spinner />}
              {t("disable")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDisabling(false)}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
