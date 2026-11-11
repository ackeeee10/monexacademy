import { cn } from "@/lib/utils";

type AvatarProps = {
  name: string | null;
  src?: string | null;
  className?: string;
};

/** Profile picture with an initials fallback on the brand navy. */
export function Avatar({ name, src, className }: AvatarProps) {
  const initials = (name ?? "?").replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "?";
  return (
    <span
      className={cn(
        "relative inline-flex size-9 shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-border bg-brand text-xs font-semibold text-[#EEF1F6]",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- external avatars (Google) of unknown size
        <img src={src} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </span>
  );
}
