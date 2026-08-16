import type { DiskFailureResult } from "./simulate";
import type { TrueNasBackupData, SnapshotTask, ReplicationTask, CloudSyncTask, Dataset, PhysicalDisk } from "./truenas";
import type { ExternalBackupWithFreshness, FreshnessStatus } from "./externalBackups";
import type { ContainerUsage } from "./docker";

export type BackupStatus = "replicated" | "snapshot-only" | "none";

export type ExternalCoverage = {
  jobId: number;
  jobName: string;
  tool: string;
  status: FreshnessStatus;
  lastModified: string | null;
  ageHours: number | null;
};

export type CloudSyncCoverage = {
  taskId: number;
  description: string;
  provider: string;
  active: boolean;
  lastState: string | null;
  lastFinishedAt: string | null;
};

export type DatasetBackupInfo = {
  dataset: string;
  status: BackupStatus;
  matchedSnapshotTask: SnapshotTask | null;
  matchedReplicationTask: ReplicationTask | null;
  sameHostOnly: boolean;
  externalBackup: ExternalCoverage | null;
  cloudSync: CloudSyncCoverage | null;
};

export type DiskBackupInfo = DatasetBackupInfo & { pathPrefix: string };

export type AffectedContainerRef = { id: string; name: string };

export type FullDatasetBackupInfo = DatasetBackupInfo & {
  pool: string;
  mountpoint: string | null;
  usedBytes: number;
  affectedContainers: AffectedContainerRef[];
  /** Did the user deliberately exclude this dataset from the Recovery Score (e.g. TimeMachine — already a backup). */
  excluded: boolean;
};

export type PhysicalDiskWithImpact = PhysicalDisk & {
  /** Total of ALL data on the disk (excluded datasets included) — for "how many GB are lost if this disk dies". */
  totalBytes: number;
  /** Total of the data included in the calculation (not excluded) — the denominator of the protection ratio. */
  scorableBytes: number;
  /** The protected share of scorableBytes — the numerator of the protection ratio. */
  protectedBytes: number;
  affectedContainers: AffectedContainerRef[];
  datasets: FullDatasetBackupInfo[];
  /** Which other pools use this disk as a replication TARGET (i.e. this disk is itself a backup). */
  backupTargetForPools: string[];
  /** Did the user deliberately exclude this disk/pool from the Recovery Score calculation. */
  excluded: boolean;
};

function poolOf(dataset: string): string {
  return dataset.split("/")[0];
}

function datasetCoversPath(taskDataset: string, recursive: boolean, targetDataset: string): boolean {
  if (taskDataset === targetDataset) return true;
  if (recursive && (targetDataset.startsWith(`${taskDataset}/`) || taskDataset.startsWith(`${targetDataset}/`))) {
    return true;
  }
  return false;
}

/** Is path the prefix itself or a path below it? (e.g. "/mnt/media/Movies" matches prefix "/mnt/media") */
function pathMatchesPrefix(path: string, prefix: string): boolean {
  const normalized = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return path === normalized || path.startsWith(`${normalized}/`);
}

function findExternalCoverage(path: string | null, jobs: ExternalBackupWithFreshness[]): ExternalCoverage | null {
  if (!path) return null;
  const job = jobs.find((j) => pathMatchesPrefix(path, j.pathPrefix));
  if (!job) return null;
  return {
    jobId: job.id,
    jobName: job.name,
    tool: job.tool,
    status: job.freshness.status,
    lastModified: job.freshness.lastModified,
    ageHours: job.freshness.ageHours,
  };
}

/** Matches TrueNAS Cloud Sync Tasks (S3/Google Drive/B2/...) by path. */
function findCloudSyncCoverage(path: string | null, tasks: CloudSyncTask[]): CloudSyncCoverage | null {
  if (!path) return null;
  const task = tasks.find(
    (t) => t.enabled && t.direction === "PUSH" && (pathMatchesPrefix(path, t.path) || pathMatchesPrefix(t.path, path))
  );
  if (!task) return null;
  return {
    taskId: task.id,
    description: task.description,
    provider: task.provider,
    active: task.lastState === "SUCCESS" || task.lastState === "RUNNING",
    lastState: task.lastState,
    lastFinishedAt: task.lastFinishedAt,
  };
}

function matchBackup(
  dataset: string,
  path: string | null,
  snapshotTasks: SnapshotTask[],
  replicationTasks: ReplicationTask[],
  cloudSyncTasks: CloudSyncTask[]
): Omit<DatasetBackupInfo, "externalBackup"> {
  const matchedSnapshotTask = snapshotTasks.find((t) => datasetCoversPath(t.dataset, t.recursive, dataset)) ?? null;
  const matchedReplicationTask =
    replicationTasks.find((t) => t.sourceDatasets.some((sd) => datasetCoversPath(sd, true, dataset))) ?? null;
  const cloudSync = findCloudSyncCoverage(path, cloudSyncTasks);

  let status: BackupStatus = "none";
  let sameHostOnly = false;

  if (matchedReplicationTask) {
    const sourcePool = poolOf(dataset);
    const targetPool = poolOf(matchedReplicationTask.targetDataset);
    if (targetPool !== sourcePool) {
      status = "replicated";
      sameHostOnly = matchedReplicationTask.transport === "LOCAL";
    } else if (matchedSnapshotTask) {
      status = "snapshot-only";
    }
  } else if (matchedSnapshotTask) {
    status = "snapshot-only";
  }

  // An active Cloud Sync (S3/Google Drive/...) push counts as an off-site copy that is even more
  // reliable than ZFS replication. We deliberately don't gate this on "status !== replicated": even
  // if ZFS replication on the same physical machine (LOCAL transport) already set the status to
  // "replicated", a dataset ALSO covered by Cloud Sync does have genuine off-site protection — not
  // clearing sameHostOnly here would produce the bogus warning "both ZFS and Cloud Sync exist, but
  // we're still on a single machine".
  if (cloudSync?.active) {
    status = "replicated";
    sameHostOnly = false;
  }

  return { dataset, status, matchedSnapshotTask, matchedReplicationTask, sameHostOnly, cloudSync };
}

/** "/mnt/pool1/Databases" -> "pool1/Databases" (the ZFS dataset name) */
function pathToDataset(pathPrefix: string): string {
  return pathPrefix.replace(/^\/mnt\//, "");
}

/** Backup status of the disk groups derived from the Docker containers' bind mounts. */
export function computeBackupStatus(
  diskGroups: DiskFailureResult[],
  backupData: TrueNasBackupData[],
  externalJobs: ExternalBackupWithFreshness[] = []
): DiskBackupInfo[] {
  const snapshotTasks = backupData.flatMap((d) => d.snapshotTasks).filter((t) => t.enabled);
  const replicationTasks = backupData.flatMap((d) => d.replicationTasks).filter((t) => t.enabled);
  const cloudSyncTasks = backupData.flatMap((d) => d.cloudSyncTasks ?? []);
  // The "/mnt/<pool>/<dataset>" -> "<pool>/<dataset>" translation is wrong for ix-apps: TrueNAS
  // always mounts it at the fixed path "/mnt/.ix-apps/app_mounts", while its real ZFS name is
  // something else like "<pool>/ix-apps" (e.g. "pool2/ix-apps"). Instead of deriving the name from
  // the path, we find the correct ZFS name by matching mountpoints against the real dataset list.
  const datasetNameByMountpoint = new Map(
    backupData.flatMap((d) => d.datasets).map((ds) => [ds.mountpoint, ds.name] as const)
  );

  return diskGroups.map((group) => {
    const dataset = datasetNameByMountpoint.get(group.pathPrefix) ?? pathToDataset(group.pathPrefix);
    return {
      ...matchBackup(dataset, group.pathPrefix, snapshotTasks, replicationTasks, cloudSyncTasks),
      pathPrefix: group.pathPrefix,
      externalBackup: findExternalCoverage(group.pathPrefix, externalJobs),
    };
  });
}

function findAffectedContainers(mountpoint: string | null, containers: ContainerUsage[]): AffectedContainerRef[] {
  if (!mountpoint) return [];
  return containers
    .filter((c) =>
      (c.mounts ?? []).some(
        // A container may mount the dataset itself OR a parent directory containing it (e.g. a
        // container on "/mnt/pool3" implicitly covers the "/mnt/pool3/Media" dataset too).
        (m) => pathMatchesPrefix(m.source, mountpoint) || pathMatchesPrefix(mountpoint, m.source)
      )
    )
    .map((c) => ({ id: c.id, name: c.name }));
}

/** Backup status of ALL datasets on TrueNAS, regardless of container usage. */
export function computeDatasetBackupStatus(
  datasets: Dataset[],
  backupData: TrueNasBackupData[],
  externalJobs: ExternalBackupWithFreshness[] = [],
  containers: ContainerUsage[] = [],
  excludedDatasets: Set<string> = new Set()
): FullDatasetBackupInfo[] {
  const snapshotTasks = backupData.flatMap((d) => d.snapshotTasks).filter((t) => t.enabled);
  const replicationTasks = backupData.flatMap((d) => d.replicationTasks).filter((t) => t.enabled);
  const cloudSyncTasks = backupData.flatMap((d) => d.cloudSyncTasks ?? []);

  return datasets.map((ds) => ({
    ...matchBackup(ds.name, ds.mountpoint, snapshotTasks, replicationTasks, cloudSyncTasks),
    pool: ds.pool,
    mountpoint: ds.mountpoint,
    usedBytes: ds.usedBytes,
    externalBackup: findExternalCoverage(ds.mountpoint, externalJobs),
    affectedContainers: findAffectedContainers(ds.mountpoint, containers),
    excluded: excludedDatasets.has(ds.name),
  }));
}

/**
 * Associates each physical disk with ALL datasets of the pool it belongs to. ZFS spreads the data of
 * a pool's non-redundant (stripe) vdevs across every disk — so losing even one of those disks puts
 * the ENTIRE pool (and therefore all of its datasets) at risk.
 */
export function computeDiskImpact(
  physicalDisks: PhysicalDisk[],
  datasetBackups: FullDatasetBackupInfo[],
  replicationTasks: ReplicationTask[] = [],
  excludedPools: Set<string> = new Set()
): PhysicalDiskWithImpact[] {
  const datasetsByPool = new Map<string, FullDatasetBackupInfo[]>();
  for (const d of datasetBackups) {
    if (!datasetsByPool.has(d.pool)) datasetsByPool.set(d.pool, []);
    datasetsByPool.get(d.pool)!.push(d);
  }

  const targetPoolsByPool = new Map<string, Set<string>>();
  for (const t of replicationTasks.filter((t) => t.enabled)) {
    const targetPool = poolOf(t.targetDataset);
    for (const sd of t.sourceDatasets) {
      const sourcePool = poolOf(sd);
      if (sourcePool === targetPool) continue;
      if (!targetPoolsByPool.has(targetPool)) targetPoolsByPool.set(targetPool, new Set());
      targetPoolsByPool.get(targetPool)!.add(sourcePool);
    }
  }

  return physicalDisks
    .map((disk) => {
      const poolDatasets = (disk.pool ? datasetsByPool.get(disk.pool) : undefined) ?? [];
      // The boot/OS disk has no normal ZFS datasets (and therefore no backup tasks) — we don't track
      // any known protection mechanism for it, so we take its size from its own disk record and
      // honestly report it as 0% protected (rather than having it look "100% protected" by accident).
      const totalBytes =
        poolDatasets.length > 0 ? poolDatasets.reduce((sum, d) => sum + d.usedBytes, 0) : (disk.sizeBytes ?? 0);
      const scorableDatasets = poolDatasets.filter((d) => !d.excluded);
      const scorableBytes =
        poolDatasets.length > 0 ? scorableDatasets.reduce((sum, d) => sum + d.usedBytes, 0) : totalBytes;
      // "Snapshot only" lives on the same disk/pool — if the disk dies the snapshot goes with it, so
      // it is not real protection (see README). Against disk death only "replicated" (different
      // pool/off-site) or a fresh external backup should count; counting snapshot-only as "protected"
      // would inflate the score misleadingly.
      const protectedBytes = scorableDatasets
        .filter((d) => d.status === "replicated" || d.externalBackup?.status === "fresh")
        .reduce((sum, d) => sum + d.usedBytes, 0);
      const affectedMap = new Map<string, AffectedContainerRef>();
      for (const d of poolDatasets) {
        for (const c of d.affectedContainers) affectedMap.set(c.id, c);
      }

      return {
        ...disk,
        totalBytes,
        scorableBytes,
        protectedBytes,
        affectedContainers: [...affectedMap.values()],
        datasets: [...poolDatasets].sort((a, b) => b.usedBytes - a.usedBytes),
        backupTargetForPools: disk.pool ? [...(targetPoolsByPool.get(disk.pool) ?? [])] : [],
        excluded: disk.pool ? excludedPools.has(disk.pool) : false,
      };
    })
    .sort((a, b) => b.totalBytes - a.totalBytes);
}
