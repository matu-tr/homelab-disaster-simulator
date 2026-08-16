import { NextResponse } from "next/server";
import { getLocalState, listExternalBackups, listExcludedPools, listExcludedDatasets } from "@/lib/db";
import { computeRecoveryScore } from "@/lib/score";
import { checkAllExternalBackups } from "@/lib/externalBackups";
import type { HostSnapshot } from "@/lib/docker";
import type { TrueNasBackupData } from "@/lib/truenas";

export async function GET() {
  const state = getLocalState();
  const snapshot = state.lastSnapshot ? (JSON.parse(state.lastSnapshot) as HostSnapshot) : null;
  const truenasConfigured = Boolean(state.truenasApiUrl && state.truenasApiKey);
  const backupData: TrueNasBackupData[] = state.truenasBackupData
    ? [JSON.parse(state.truenasBackupData) as TrueNasBackupData]
    : [];
  const excludedPools = new Set(listExcludedPools());
  const excludedDatasets = new Set(listExcludedDatasets());
  const datasets = backupData
    .flatMap((d) => d.datasets)
    .filter((d) => !excludedPools.has(d.pool) && !excludedDatasets.has(d.name));
  const externalJobs = checkAllExternalBackups(listExternalBackups());

  return NextResponse.json(computeRecoveryScore(snapshot, backupData, datasets, truenasConfigured, externalJobs));
}
