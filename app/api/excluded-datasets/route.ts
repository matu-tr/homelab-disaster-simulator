import { NextRequest, NextResponse } from "next/server";
import { excludeDataset, includeDataset, listExcludedDatasets } from "@/lib/db";

export async function GET() {
  return NextResponse.json(listExcludedDatasets());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const dataset = String(body.dataset || "").trim();
  const excluded = Boolean(body.excluded);

  if (!dataset) {
    return NextResponse.json({ error: "Dataset adı zorunludur." }, { status: 400 });
  }

  if (excluded) {
    excludeDataset(dataset);
  } else {
    includeDataset(dataset);
  }

  return NextResponse.json({ ok: true });
}
