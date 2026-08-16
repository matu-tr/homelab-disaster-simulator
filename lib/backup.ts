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
  /** Kullanıcı bu dataset'i Recovery Score hesaplamasından bilinçli olarak çıkardı mı (ör. TimeMachine — zaten bir yedek). */
  excluded: boolean;
};

export type PhysicalDiskWithImpact = PhysicalDisk & {
  /** Diskteki TÜM verinin toplamı (hariç tutulan dataset'ler dahil) — "bu disk çökerse kaç GB kaybedilir" için. */
  totalBytes: number;
  /** Hesaplamaya dahil edilen (hariç tutulmamış) verinin toplamı — korunma oranının paydası. */
  scorableBytes: number;
  /** scorableBytes içindeki korunan kısım — korunma oranının payı. */
  protectedBytes: number;
  affectedContainers: AffectedContainerRef[];
  datasets: FullDatasetBackupInfo[];
  /** Bu disk, başka hangi pool'ların replikasyon HEDEFİ olarak kullanılıyor (bu diskin kendisi bir yedek). */
  backupTargetForPools: string[];
  /** Kullanıcı bu disk/pool'u Recovery Score hesaplamasından bilinçli olarak çıkardı mı. */
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

/** path, prefix'in kendisi veya bir alt yolu mu? (ör. "/mnt/media/Movies" prefix "/mnt/media" ile eşleşir) */
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

/** TrueNAS Cloud Sync Task'ları (S3/Google Drive/B2/...) yolu üzerinden eşleştirir. */
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

  // Aktif bir Cloud Sync (S3/Google Drive/...) push'u, ZFS replikasyonundan bile daha güvenilir bir
  // off-site kopya sayılır. "status !== replicated" şartıyla sınırlamıyoruz: ZFS replikasyonu zaten
  // aynı fiziksel makinede (LOCAL transport) status'u "replicated" yapmış olsa bile, dataset AYRICA
  // Cloud Sync ile de kapsanıyorsa gerçek off-site koruması var demektir — sameHostOnly'yi bu durumda
  // da temizlememek "hem ZFS hem Cloud Sync var ama hâlâ tek makinedeyiz" gibi yanlış bir uyarı üretirdi.
  if (cloudSync?.active) {
    status = "replicated";
    sameHostOnly = false;
  }

  return { dataset, status, matchedSnapshotTask, matchedReplicationTask, sameHostOnly, cloudSync };
}

/** "/mnt/pool1/Databases" -> "pool1/Databases" (ZFS dataset adı) */
function pathToDataset(pathPrefix: string): string {
  return pathPrefix.replace(/^\/mnt\//, "");
}

/** Docker konteynerlerinin bind mount'larından türetilen disk gruplarının backup durumu. */
export function computeBackupStatus(
  diskGroups: DiskFailureResult[],
  backupData: TrueNasBackupData[],
  externalJobs: ExternalBackupWithFreshness[] = []
): DiskBackupInfo[] {
  const snapshotTasks = backupData.flatMap((d) => d.snapshotTasks).filter((t) => t.enabled);
  const replicationTasks = backupData.flatMap((d) => d.replicationTasks).filter((t) => t.enabled);
  const cloudSyncTasks = backupData.flatMap((d) => d.cloudSyncTasks ?? []);
  // "/mnt/<pool>/<dataset>" -> "<pool>/<dataset>" çevirisi ix-apps için yanlış: TrueNAS onu her zaman
  // sabit "/mnt/.ix-apps/app_mounts" yoluna mount eder, gerçek ZFS adı ise "<pool>/ix-apps" gibi farklı
  // bir şeydir (ör. "pool2/ix-apps"). Path'ten isim üretmek yerine, mümkünse gerçek dataset
  // listesinden mountpoint eşleşmesiyle doğru ZFS adını buluyoruz.
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
        // Konteyner dataset'in kendisini VEYA onu kapsayan bir üst dizini mount etmiş olabilir (ör. "/mnt/pool3"
        // konteyneri, "/mnt/pool3/Media" dataset'ini de örtük olarak kapsar).
        (m) => pathMatchesPrefix(m.source, mountpoint) || pathMatchesPrefix(mountpoint, m.source)
      )
    )
    .map((c) => ({ id: c.id, name: c.name }));
}

/** Konteyner kullanımından bağımsız, TrueNAS'taki TÜM dataset'lerin backup durumu. */
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
 * Her fiziksel diski, bağlı olduğu pool'un TÜM dataset'leriyle ilişkilendirir. ZFS bir pool içindeki
 * redundansız (stripe) vdev'lerin verisini tüm disklere yayar — yani o disklerden biri bile kaybedilse
 * pool'un TÜMÜ (ve dolayısıyla tüm dataset'leri) risk altındadır.
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
      // Boot/OS diskinin normal ZFS dataset'leri (dolayısıyla backup task'ları) yok — bilinen bir
      // koruma mekanizması takip etmiyoruz, bu yüzden boyutunu kendi disk kaydından alıp %0 korunuyor
      // olarak dürüstçe gösteriyoruz (yanlışlıkla "%100 korunuyor" görünmesin diye).
      const totalBytes =
        poolDatasets.length > 0 ? poolDatasets.reduce((sum, d) => sum + d.usedBytes, 0) : (disk.sizeBytes ?? 0);
      const scorableDatasets = poolDatasets.filter((d) => !d.excluded);
      const scorableBytes =
        poolDatasets.length > 0 ? scorableDatasets.reduce((sum, d) => sum + d.usedBytes, 0) : totalBytes;
      // "Sadece snapshot" aynı disk/pool üzerinde durur — disk çökerse snapshot da gider, gerçek koruma
      // sağlamaz (bkz. README). Disk-ölümüne karşı korumada yalnızca "replicated" (farklı pool/off-site)
      // veya taze harici backup sayılmalı; snapshot-only'yi "korunuyor" saymak skoru yanıltıcı şekilde şişirir.
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
