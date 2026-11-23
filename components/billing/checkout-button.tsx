"use client";

import { useState, useTransition, type ReactNode } from "react";

import { runAction } from "@/components/auth/run-action";
import { useErrorMessage } from "@/components/auth/use-error";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { openBillingPortalAction, startCheckoutAction, type BillingRedirect } from "@/lib/billing/actions";
import type { ProductKey } from "@/lib/billing/catalog";
import type { ActionResult } from "@/lib/auth/types";

type Props = Omit<ButtonProps, "onClick" | "children"> & {
  /** A product to buy, or "portal" for the billing portal. */
  product: ProductKey | "portal";
  children: ReactNode;
};

/** Sends the user to Polar's checkout (or billing portal) in the same tab. */
export function CheckoutButton({ product, children, className, ...props }: Props) {
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);

  const go = () => {
    setError(null);
    startTransition(async () => {
      const result: ActionResult<BillingRedirect> | { ok: false; error: "unexpected" } = await runAction(() =>
        product === "portal" ? openBillingPortalAction() : startCheckoutAction({ product }),
      );
      if (!result.ok) {
        setError(errorMessage(result.error) ?? null);
        return;
      }
      if (result.data.external) {
        setLeaving(true);
        window.location.assign(result.data.url);
      } else {
        router.push(result.data.url);
      }
    });
  };

  const busy = pending || leaving;
  return (
    <div className={className}>
      <Button {...props} className="w-full" onClick={go} disabled={busy || props.disabled} aria-busy={busy}>
        {busy && <Spinner />}
        {children}
      </Button>
      {error && <p role="alert" className="mt-2 text-center text-xs text-danger">{error}</p>}
    </div>
  );
}
