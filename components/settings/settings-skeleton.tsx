import { Skeleton } from "@/components/ui/skeleton";

export function SettingsSkeleton() {
  return (
    <div className="space-y-5 rounded-xl border border-border bg-surface p-6 sm:p-8">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <Skeleton className="h-10" />
      <Skeleton className="h-28" />
      <Skeleton className="h-10" />
    </div>
  );
}
