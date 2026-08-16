import { NextRequest, NextResponse } from "next/server";
import { savePublicUrl } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  let publicUrl = String(body.publicUrl || "").trim() || null;

  if (publicUrl && !publicUrl.startsWith("http://") && !publicUrl.startsWith("https://")) {
    publicUrl = `https://${publicUrl}`;
  }

  savePublicUrl(publicUrl);
  return NextResponse.json({ ok: true, publicUrl });
}
