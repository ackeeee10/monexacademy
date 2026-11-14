"use client";

import { useEffect, useRef } from "react";

import { Alert } from "@/components/ui/alert";

/** Error banner that scrolls itself into view (on phones it's often off-screen). */
export function FormError({ message, detail }: { message: string; detail?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [message, detail]);
  return (
    <div ref={ref}>
      <Alert variant="danger">
        {message}
        {detail && <span className="mt-1 block font-mono text-xs text-muted">{detail}</span>}
      </Alert>
    </div>
  );
}
