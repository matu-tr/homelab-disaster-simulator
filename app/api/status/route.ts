import { NextResponse } from "next/server";
import { getLocalState } from "@/lib/db";

export async function GET() {
  const state = getLocalState();
  return NextResponse.json({
    lastSnapshot: state.lastSnapshot ? JSON.parse(state.lastSnapshot) : null,
    lastSnapshotAt: state.lastSnapshotAt,
    lastError: state.lastError,
    truenasConfigured: Boolean(state.truenasApiUrl && state.truenasApiKey),
    truenasApiUrl: state.truenasApiUrl,
    truenasError: state.truenasError,
    truenasBackupData: state.truenasBackupData ? JSON.parse(state.truenasBackupData) : null,
  });
}
