import { NextResponse } from "next/server";
import { getLocalState, listExternalBackups, listExcludedPools, listExcludedDatasets } from "@/lib/db";
import { computeDatasetBackupStatus, computeDiskImpact } from "@/lib/backup";
import { checkAllExternalBackups } from "@/lib/externalBackups";
import type { TrueNasBackupData } from "@/lib/truenas";
import type { HostSnapshot } from "@/lib/docker";

export async function GET() {
  const state = getLocalState();
  if (!state.truenasBackupData) {
    return NextResponse.json([]);
  }

  const backupData = JSON.parse(state.truenasBackupData) as TrueNasBackupData;
  const externalJobs = checkAllExternalBackups(listExternalBackups());
  const containers = state.lastSnapshot ? (JSON.parse(state.lastSnapshot) as HostSnapshot).containers : [];
  const excludedDatasets = new Set(listExcludedDatasets());
  const datasetBackups = computeDatasetBackupStatus(
    backupData.datasets,
    [backupData],
    externalJobs,
    containers,
    excludedDatasets
  );
  const excludedPools = new Set(listExcludedPools());

  return NextResponse.json(
    computeDiskImpact(backupData.physicalDisks, datasetBackups, backupData.replicationTasks, excludedPools)
  );
}
