import { NextResponse } from "next/server";
import { getLocalState, listExternalBackups } from "@/lib/db";
import { detectDiskGroups } from "@/lib/simulate";
import { computeBackupStatus } from "@/lib/backup";
import { checkAllExternalBackups } from "@/lib/externalBackups";
import type { HostSnapshot } from "@/lib/docker";
import type { TrueNasBackupData } from "@/lib/truenas";

export async function GET() {
  const state = getLocalState();
  if (!state.lastSnapshot) {
    return NextResponse.json([]);
  }

  const snapshot = JSON.parse(state.lastSnapshot) as HostSnapshot;
  const diskGroups = detectDiskGroups(snapshot);

  const backupData: TrueNasBackupData[] = state.truenasBackupData
    ? [JSON.parse(state.truenasBackupData) as TrueNasBackupData]
    : [];
  const externalJobs = checkAllExternalBackups(listExternalBackups());
  const backupStatuses = computeBackupStatus(diskGroups, backupData, externalJobs);
  const backupByPrefix = new Map(backupStatuses.map((b) => [b.pathPrefix, b]));

  const result = diskGroups.map((g) => ({ ...g, backup: backupByPrefix.get(g.pathPrefix) ?? null }));

  return NextResponse.json(result);
}
