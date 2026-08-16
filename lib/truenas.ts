import type { Msg } from "./i18n";
import { msg } from "./i18n";

export type SnapshotTask = {
  id: number;
  dataset: string;
  recursive: boolean;
  enabled: boolean;
  lifetimeValue: number;
  lifetimeUnit: string;
  scheduleSummary: Msg;
  lastSnapshot: string | null;
};

export type ReplicationTask = {
  id: number;
  name: string;
  enabled: boolean;
  transport: string;
  sourceDatasets: string[];
  targetDataset: string;
  lastSnapshot: string | null;
};

export type Dataset = {
  name: string;
  pool: string;
  mountpoint: string | null;
  usedBytes: number;
};

export type PhysicalDisk = {
  device: string;
  model: string | null;
  sizeBytes: number | null;
  serial: string | null;
  pool: string | null;
  vdevType: string | null;
  /** true = mirror/raidz üyesi (tek disk kaybı veri kaybettirmez, sadece degrade eder). false = redundancy yok. */
  redundant: boolean;
  /** true = TrueNAS'ın kendi işletim sistemi/boot diski (data pool'ları değil, sistemin kendisi). */
  isBootDisk: boolean;
};

export type CloudSyncTask = {
  id: number;
  description: string;
  path: string;
  provider: string;
  direction: string;
  enabled: boolean;
  lastState: string | null;
  lastFinishedAt: string | null;
};

export type TrueNasBackupData = {
  snapshotTasks: SnapshotTask[];
  replicationTasks: ReplicationTask[];
  cloudSyncTasks: CloudSyncTask[];
  datasets: Dataset[];
  physicalDisks: PhysicalDisk[];
  collectedAt: string;
};

function summarizeSchedule(schedule: { minute: string; hour: string; dom: string; month: string; dow: string }): Msg {
  const { minute, hour, dom, month, dow } = schedule;
  if (dom === "*" && month === "*" && dow === "*") {
    if (hour === "*") return msg("schedule.hourly", { minute });
    if (hour.includes(",")) {
      return msg("schedule.daily", { time: hour.split(",").map((h) => `${h}:00`).join(", ") });
    }
    return msg("schedule.daily", { time: `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}` });
  }
  return msg("schedule.daily", { time: `${minute} ${hour} ${dom} ${month} ${dow}` });
}

async function truenasFetch(apiUrl: string, apiKey: string, path: string): Promise<unknown> {
  const base = apiUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`TrueNAS API ${path} -> HTTP ${res.status}`);
  }
  return res.json();
}

type RawDataset = {
  name: string;
  pool: string;
  type: string;
  mountpoint: string | null;
  usedbydataset?: { parsed?: number };
  children?: RawDataset[];
};

function flattenDatasets(nodes: RawDataset[]): Dataset[] {
  const byName = new Map<string, Dataset>();
  function walk(list: RawDataset[]) {
    for (const n of list) {
      if (n.type === "FILESYSTEM" && !byName.has(n.name)) {
        byName.set(n.name, {
          name: n.name,
          pool: n.pool,
          mountpoint: n.mountpoint,
          // ZFS'in "used" alanı çocuk dataset'lerin ve snapshot'ların verisini de içerir (roll-up) —
          // bir pool'daki tüm dataset'leri (ebeveyn + çocuklar) toplarken bunu kullanmak veriyi
          // iki kere saydırır. "usedbydataset" sadece BU dataset'e özgü, çocuklara ait olmayan
          // veriyi verir — pool-seviyesi toplamlar için doğru olan budur.
          usedBytes: n.usedbydataset?.parsed ?? 0,
        });
      }
      if (n.children?.length) walk(n.children);
    }
  }
  walk(nodes);
  return [...byName.values()];
}

type RawVdev = {
  type: string;
  disk: string | null;
  children?: RawVdev[];
};

type RawPool = {
  name: string;
  topology: {
    data: RawVdev[];
  };
};

type RawDisk = {
  name: string;
  model: string | null;
  size: number | null;
  serial: string | null;
};

function flattenPhysicalDisks(pools: RawPool[], disks: RawDisk[], isBootDisk = false): PhysicalDisk[] {
  const diskByName = new Map(disks.map((d) => [d.name, d]));
  const result: PhysicalDisk[] = [];

  for (const pool of pools) {
    for (const vdev of pool.topology.data ?? []) {
      if (vdev.type === "DISK" && vdev.disk) {
        // Redundansız tekli disk vdev'i — bu diski kaybetmek pool'u (ve tüm dataset'lerini) kaybetmek demek.
        const meta = diskByName.get(vdev.disk);
        result.push({
          device: vdev.disk,
          model: meta?.model ?? null,
          sizeBytes: meta?.size ?? null,
          serial: meta?.serial ?? null,
          pool: pool.name,
          vdevType: "STRIPE",
          redundant: false,
          isBootDisk,
        });
      } else if (vdev.children?.length) {
        // MIRROR / RAIDZ* — üye disklerden biri kaybedilse bile pool ayakta kalır (degrade).
        for (const child of vdev.children) {
          if (child.type !== "DISK" || !child.disk) continue;
          const meta = diskByName.get(child.disk);
          result.push({
            device: child.disk,
            model: meta?.model ?? null,
            sizeBytes: meta?.size ?? null,
            serial: meta?.serial ?? null,
            pool: pool.name,
            vdevType: vdev.type,
            redundant: true,
            isBootDisk,
          });
        }
      }
    }
  }

  return result;
}

export async function collectTrueNasBackupData(apiUrl: string, apiKey: string): Promise<TrueNasBackupData> {
  const [rawSnapshotTasks, rawReplicationTasks, rawDatasets, rawPools, rawDisks, rawCloudSync, rawBootState] =
    await Promise.all([
      truenasFetch(apiUrl, apiKey, "/api/v2.0/pool/snapshottask"),
      truenasFetch(apiUrl, apiKey, "/api/v2.0/replication"),
      truenasFetch(apiUrl, apiKey, "/api/v2.0/pool/dataset"),
      truenasFetch(apiUrl, apiKey, "/api/v2.0/pool"),
      truenasFetch(apiUrl, apiKey, "/api/v2.0/disk"),
      truenasFetch(apiUrl, apiKey, "/api/v2.0/cloudsync"),
      truenasFetch(apiUrl, apiKey, "/api/v2.0/boot/get_state"),
    ]);

  const datasets = flattenDatasets(rawDatasets as RawDataset[]);

  // TrueNAS, uygulamaların iç yönetim dataset'ini (ix-apps) normal dataset listesinden bilerek gizler —
  // hangi diskte olduğunu görebilmek için Docker servis konfigürasyonundan ayrıca çekiyoruz. Boyutu bu
  // yoldan alınamıyor (0 olarak işaretlenir), sadece hangi pool'da olduğunu göstermek içindir.
  try {
    const rawDocker = (await truenasFetch(apiUrl, apiKey, "/api/v2.0/docker")) as {
      dataset?: string;
      pool?: string;
    };
    if (rawDocker.dataset && rawDocker.pool && !datasets.some((d) => d.name === rawDocker.dataset)) {
      // TrueNAS SCALE, pool adından bağımsız olarak bu dataset'i her zaman /mnt/.ix-apps/app_mounts altında mount eder.
      datasets.push({
        name: rawDocker.dataset,
        pool: rawDocker.pool,
        mountpoint: "/mnt/.ix-apps/app_mounts",
        usedBytes: 0,
      });
    }
  } catch {
    // Docker app servisi kurulu değilse veya endpoint yoksa sessizce atla — kritik bir veri değil.
  }

  const physicalDisks = [
    ...flattenPhysicalDisks(rawPools as RawPool[], rawDisks as RawDisk[]),
    // Boot/OS diski `/api/v2.0/pool` listesinde YOKTUR — ayrı bir endpoint'ten gelir. Data pool'larından
    // habersiz kalmaması için (sistemin kendisi de bir felaket senaryosudur) ayrıca ekliyoruz.
    ...flattenPhysicalDisks([rawBootState as RawPool], rawDisks as RawDisk[], true),
  ];

  type RawSnapshotTask = {
    id: number;
    dataset: string;
    recursive: boolean;
    enabled: boolean;
    lifetime_value: number;
    lifetime_unit: string;
    schedule: { minute: string; hour: string; dom: string; month: string; dow: string };
    state?: { last_snapshot?: string | null };
  };

  type RawReplicationTask = {
    id: number;
    name: string;
    enabled: boolean;
    transport: string;
    source_datasets: string[];
    target_dataset: string;
    state?: { last_snapshot?: string | null };
  };

  const snapshotTasks: SnapshotTask[] = (rawSnapshotTasks as RawSnapshotTask[]).map((t) => ({
    id: t.id,
    dataset: t.dataset,
    recursive: t.recursive,
    enabled: t.enabled,
    lifetimeValue: t.lifetime_value,
    lifetimeUnit: t.lifetime_unit,
    scheduleSummary: summarizeSchedule(t.schedule),
    lastSnapshot: t.state?.last_snapshot ?? null,
  }));

  const replicationTasks: ReplicationTask[] = (rawReplicationTasks as RawReplicationTask[]).map((t) => ({
    id: t.id,
    name: t.name,
    enabled: t.enabled,
    transport: t.transport,
    sourceDatasets: t.source_datasets,
    targetDataset: t.target_dataset,
    lastSnapshot: t.state?.last_snapshot ?? null,
  }));

  // ÖNEMLİ: raw cloudsync yanıtı `credentials.provider.token` altında OAuth access/refresh token'larını
  // düz metin içerir. Sadece aşağıdaki alanları çıkarıyoruz — token'a veya credentials objesinin
  // tamamına ASLA dokunmuyoruz, hiçbir yerde saklamıyoruz.
  type RawCloudSyncTask = {
    id: number;
    description: string;
    path: string;
    direction: string;
    enabled: boolean;
    credentials?: { provider?: { type?: string } };
    job?: { state?: string | null; time_finished?: { $date: number } | null };
  };

  const cloudSyncTasks: CloudSyncTask[] = (rawCloudSync as RawCloudSyncTask[]).map((t) => ({
    id: t.id,
    description: t.description,
    path: t.path,
    provider: t.credentials?.provider?.type ?? "UNKNOWN",
    direction: t.direction,
    enabled: t.enabled,
    lastState: t.job?.state ?? null,
    lastFinishedAt: t.job?.time_finished ? new Date(t.job.time_finished.$date).toISOString() : null,
  }));

  return {
    snapshotTasks,
    replicationTasks,
    cloudSyncTasks,
    datasets,
    physicalDisks,
    collectedAt: new Date().toISOString(),
  };
}
