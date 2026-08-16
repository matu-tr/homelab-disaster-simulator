import { detectDiskGroups, type DiskFailureResult } from "./simulate";
import { computeDatasetBackupStatus, type FullDatasetBackupInfo } from "./backup";
import type { HostSnapshot } from "./docker";
import type { TrueNasBackupData, Dataset } from "./truenas";
import type { ExternalBackupWithFreshness } from "./externalBackups";
import type { Msg } from "./i18n";
import { msg } from "./i18n";

export type CriticalIssue = {
  severity: "critical" | "warning";
  text: Msg;
};

export type ScoreBreakdownItem = {
  label: Msg;
  score: number;
  max: number;
  note: Msg;
};

export type RecoveryScoreResult = {
  total: number;
  maxTotal: number;
  breakdown: ScoreBreakdownItem[];
  issues: CriticalIssue[];
};

function formatGB(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function computeDiskConcentration(
  diskGroups: DiskFailureResult[],
  totalContainers: number
): { item: ScoreBreakdownItem; issues: CriticalIssue[] } {
  const max = 25;
  const label = msg("score.category.diskConcentration");
  if (totalContainers === 0 || diskGroups.length === 0) {
    return {
      item: { label, score: max, max, note: msg("msg.diskConcentration.noContainers") },
      issues: [],
    };
  }

  const largest = diskGroups[0];
  const ratio = largest.affected.length / totalContainers;
  const score = Math.max(0, Math.round(max * (1 - ratio)));

  const issues: CriticalIssue[] = [];
  if (ratio >= 0.3) {
    issues.push({
      severity: ratio >= 0.5 ? "critical" : "warning",
      text: msg("msg.diskConcentration.affected", {
        path: largest.pathPrefix,
        percent: Math.round(ratio * 100),
        affected: largest.affected.length,
        total: totalContainers,
      }),
    });
  }

  return {
    item: {
      label,
      score,
      max,
      note: msg("msg.diskConcentration.note", { path: largest.pathPrefix, count: largest.affected.length }),
    },
    issues,
  };
}

/** Dataset backup durumlarını, konteynerlerin kullanıp kullanmadığına bakmaksızın TÜM verinin (byte) üzerinden değerlendirir. */
function computeSnapshotCoverage(
  datasetBackups: FullDatasetBackupInfo[]
): { item: ScoreBreakdownItem; issues: CriticalIssue[] } {
  const max = 25;
  const label = msg("score.category.snapshotCoverage");
  const totalBytes = datasetBackups.reduce((sum, d) => sum + d.usedBytes, 0);
  const issues: CriticalIssue[] = [];

  if (totalBytes === 0) {
    return { item: { label, score: max, max, note: msg("msg.snapshotCoverage.noData") }, issues };
  }

  let covered = 0;
  for (const d of datasetBackups) {
    if (d.usedBytes === 0) continue;
    if (d.status !== "none") {
      covered += d.usedBytes;
    } else {
      issues.push({
        severity: "critical",
        text: msg("msg.snapshotCoverage.missing", { dataset: d.dataset, gb: formatGB(d.usedBytes) }),
      });
    }
  }

  const ratio = covered / totalBytes;
  const score = Math.round(max * ratio);

  return {
    item: {
      label,
      score,
      max,
      note: msg("msg.snapshotCoverage.note", {
        percent: Math.round(ratio * 100),
        covered: formatGB(covered),
        total: formatGB(totalBytes),
      }),
    },
    issues,
  };
}

function computeReplicationIndependence(
  datasetBackups: FullDatasetBackupInfo[],
  truenasConfigured: boolean
): { item: ScoreBreakdownItem; issues: CriticalIssue[] } {
  const max = 25;
  const label = msg("score.category.replicationIndependence");
  const issues: CriticalIssue[] = [];

  if (!truenasConfigured) {
    return {
      item: { label, score: 0, max, note: msg("msg.replication.notConfiguredNote") },
      issues: [{ severity: "critical", text: msg("msg.replication.notConfiguredIssue") }],
    };
  }

  const totalBytes = datasetBackups.reduce((sum, d) => sum + d.usedBytes, 0);
  if (totalBytes === 0) {
    return { item: { label, score: max, max, note: msg("msg.replication.noData") }, issues };
  }

  let independent = 0;
  for (const d of datasetBackups) {
    if (d.usedBytes === 0) continue;
    if (d.status === "replicated") {
      independent += d.usedBytes;
      if (d.sameHostOnly) {
        issues.push({
          severity: "warning",
          text: msg("msg.replication.sameHostOnly", { dataset: d.dataset, gb: formatGB(d.usedBytes) }),
        });
      }
    } else if (d.status === "snapshot-only") {
      issues.push({
        severity: "warning",
        text: msg("msg.replication.snapshotOnly", { dataset: d.dataset, gb: formatGB(d.usedBytes) }),
      });
    }
  }

  const ratio = independent / totalBytes;
  const score = Math.round(max * ratio);

  return {
    item: {
      label,
      score,
      max,
      note: msg("msg.replication.note", {
        percent: Math.round(ratio * 100),
        independent: formatGB(independent),
        total: formatGB(totalBytes),
      }),
    },
    issues,
  };
}

/**
 * TrueNAS replikasyonu ile zaten bağımsız korunmayan veriler için, harici backup job'larının
 * (restic/borg/rsync — marker dosya tazeliğiyle doğrulanan) ek bir güvenlik ağı olup olmadığını ölçer.
 */
function computeExternalBackupFreshness(
  datasetBackups: FullDatasetBackupInfo[],
  hasExternalJobs: boolean
): { item: ScoreBreakdownItem; issues: CriticalIssue[] } {
  const max = 25;
  const label = msg("score.category.externalFreshness");
  const issues: CriticalIssue[] = [];

  const atRisk = datasetBackups.filter((d) => d.usedBytes > 0 && d.status !== "replicated");
  const totalBytes = atRisk.reduce((sum, d) => sum + d.usedBytes, 0);

  if (totalBytes === 0) {
    return { item: { label, score: max, max, note: msg("msg.externalFreshness.allCovered") }, issues };
  }

  if (!hasExternalJobs) {
    return {
      item: { label, score: 0, max, note: msg("msg.externalFreshness.noJobsNote") },
      issues: [{ severity: "warning", text: msg("msg.externalFreshness.noJobsIssue", { gb: formatGB(totalBytes) }) }],
    };
  }

  let covered = 0;
  for (const d of atRisk) {
    if (d.externalBackup?.status === "fresh") {
      covered += d.usedBytes;
    } else if (d.externalBackup?.status === "stale") {
      issues.push({
        severity: "warning",
        text: msg("msg.externalFreshness.stale", {
          dataset: d.dataset,
          gb: formatGB(d.usedBytes),
          jobName: d.externalBackup.jobName,
          days: Math.round((d.externalBackup.ageHours ?? 0) / 24),
        }),
      });
    } else if (d.externalBackup?.status === "missing") {
      issues.push({
        severity: "critical",
        text: msg("msg.externalFreshness.missing", {
          dataset: d.dataset,
          gb: formatGB(d.usedBytes),
          jobName: d.externalBackup.jobName,
        }),
      });
    } else {
      issues.push({
        severity: "critical",
        text: msg("msg.externalFreshness.uncovered", { dataset: d.dataset, gb: formatGB(d.usedBytes) }),
      });
    }
  }

  const ratio = covered / totalBytes;
  const score = Math.round(max * ratio);

  return {
    item: {
      label,
      score,
      max,
      note: msg("msg.externalFreshness.note", {
        percent: Math.round(ratio * 100),
        covered: formatGB(covered),
        total: formatGB(totalBytes),
      }),
    },
    issues,
  };
}

export function computeRecoveryScore(
  snapshot: HostSnapshot | null,
  backupData: TrueNasBackupData[],
  datasets: Dataset[],
  truenasConfigured: boolean,
  externalJobs: ExternalBackupWithFreshness[] = []
): RecoveryScoreResult {
  const diskGroups = snapshot ? detectDiskGroups(snapshot) : [];
  const totalContainers = snapshot?.containers.length ?? 0;
  const sortedDatasets = [...datasets].sort((a, b) => b.usedBytes - a.usedBytes);
  const datasetBackups = computeDatasetBackupStatus(sortedDatasets, backupData, externalJobs);

  const parts = [
    computeDiskConcentration(diskGroups, totalContainers),
    computeSnapshotCoverage(datasetBackups),
    computeReplicationIndependence(datasetBackups, truenasConfigured),
    computeExternalBackupFreshness(datasetBackups, externalJobs.length > 0),
  ];

  const breakdown = parts.map((p) => p.item);
  // En büyük etkiye sahip (veri hacmi büyük) sorunlar önce, aynı hacimde kritik olanlar uyarılardan önce.
  const issues = parts.flatMap((p) => p.issues).sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
  const total = breakdown.reduce((sum, b) => sum + b.score, 0);
  const maxTotal = breakdown.reduce((sum, b) => sum + b.max, 0);

  return { total, maxTotal, breakdown, issues };
}
