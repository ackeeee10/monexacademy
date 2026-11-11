import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** GDPR export: the signed-in user's personal data as a JSON download. */
export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase.rpc("export_my_data");
  if (error) return NextResponse.json({ error: "export_failed" }, { status: 500 });

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="monex-academy-data-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
