import { NextRequest, NextResponse } from "next/server";
import { excludePool, includePool, listExcludedPools } from "@/lib/db";

export async function GET() {
  return NextResponse.json(listExcludedPools());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const pool = String(body.pool || "").trim();
  const excluded = Boolean(body.excluded);

  if (!pool) {
    return NextResponse.json({ error: "Pool adı zorunludur." }, { status: 400 });
  }

  if (excluded) {
    excludePool(pool);
  } else {
    includePool(pool);
  }

  return NextResponse.json({ ok: true });
}
