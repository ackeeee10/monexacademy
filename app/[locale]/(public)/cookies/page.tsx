import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ComingSoon } from "@/components/layout/coming-soon";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pages");
  return { title: t("cookies") };
}

export default function Page() {
  return <ComingSoon page="cookies" />;
}
