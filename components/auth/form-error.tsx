"use client";

import { useEffect, useRef } from "react";

import { Alert } from "@/components/ui/alert";

/** Error banner that scrolls itself into view (on phones it's often off-screen). */
export function FormError({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [message]);
  return (
    <div ref={ref}>
      <Alert variant="danger">{message}</Alert>
    </div>
  );
}
