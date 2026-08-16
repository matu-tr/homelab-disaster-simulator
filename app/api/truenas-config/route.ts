import { NextRequest, NextResponse } from "next/server";
import { saveTrueNasConfig } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const apiUrl = String(body.apiUrl || "").trim() || null;
  const apiKey = String(body.apiKey || "").trim() || null;

  if ((apiUrl && !apiKey) || (!apiUrl && apiKey)) {
    return NextResponse.json({ error: "API adresi ve key birlikte girilmeli." }, { status: 400 });
  }
  if (apiUrl && !apiUrl.startsWith("http://") && !apiUrl.startsWith("https://")) {
    return NextResponse.json({ error: "API adresi http:// veya https:// ile başlamalı." }, { status: 400 });
  }

  saveTrueNasConfig(apiUrl, apiKey);
  return NextResponse.json({ ok: true });
}
