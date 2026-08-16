import { NextRequest, NextResponse } from "next/server";
import { saveTrueNasConfig } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const apiUrl = String(body.apiUrl || "").trim() || null;
  const apiKey = String(body.apiKey || "").trim() || null;

  if ((apiUrl && !apiKey) || (!apiUrl && apiKey)) {
    return NextResponse.json({ error: "The API address and key must be provided together." }, { status: 400 });
  }
  if (apiUrl && !apiUrl.startsWith("http://") && !apiUrl.startsWith("https://")) {
    return NextResponse.json({ error: "The API address must start with http:// or https://." }, { status: 400 });
  }

  saveTrueNasConfig(apiUrl, apiKey);
  return NextResponse.json({ ok: true });
}
