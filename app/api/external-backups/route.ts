import { NextRequest, NextResponse } from "next/server";
import { createExternalBackup, listExternalBackups } from "@/lib/db";
import { checkAllExternalBackups } from "@/lib/externalBackups";

const VALID_TOOLS = ["restic", "borg", "rsync", "other"];

export async function GET() {
  return NextResponse.json(checkAllExternalBackups(listExternalBackups()));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = String(body.name || "").trim();
  const tool = String(body.tool || "").trim();
  const pathPrefix = String(body.pathPrefix || "").trim();
  const markerPath = String(body.markerPath || "").trim();
  const expectedIntervalHours = Number(body.expectedIntervalHours);

  if (!name || !tool || !pathPrefix || !markerPath || !expectedIntervalHours || expectedIntervalHours <= 0) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }
  if (!VALID_TOOLS.includes(tool)) {
    return NextResponse.json({ error: "Invalid tool type." }, { status: 400 });
  }
  if (!pathPrefix.startsWith("/") || !markerPath.startsWith("/")) {
    return NextResponse.json({ error: "The path prefix and marker path must start with /." }, { status: 400 });
  }

  const job = createExternalBackup({ name, tool, pathPrefix, markerPath, expectedIntervalHours });
  return NextResponse.json(job, { status: 201 });
}
