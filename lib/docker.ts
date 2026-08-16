import Docker from "dockerode";

export type ContainerMount = {
  source: string;
  destination: string;
};

export type ContainerUsage = {
  id: string;
  name: string;
  image: string;
  memBytes: number;
  cpuCores: number;
  mounts: ContainerMount[];
};

export type HostSnapshot = {
  totalMemBytes: number;
  totalCpuCores: number;
  containers: ContainerUsage[];
  collectedAt: string;
};

function buildDockerClient(connectionUrl: string): Docker {
  if (connectionUrl.startsWith("unix://")) {
    return new Docker({ socketPath: connectionUrl.replace("unix://", "") });
  }
  const url = new URL(connectionUrl);
  const protocol = url.protocol === "tcps:" || url.protocol === "https:" ? "https" : "http";
  return new Docker({
    host: url.hostname,
    port: url.port ? Number(url.port) : protocol === "https" ? 2376 : 2375,
    protocol,
  });
}

function cpuCoresFromStats(stats: Docker.ContainerStats): number {
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - (stats.precpu_stats?.cpu_usage?.total_usage ?? 0);
  const systemDelta = (stats.cpu_stats.system_cpu_usage ?? 0) - (stats.precpu_stats?.system_cpu_usage ?? 0);
  const onlineCpus =
    stats.cpu_stats.online_cpus ?? stats.cpu_stats.cpu_usage.percpu_usage?.length ?? 1;
  if (systemDelta <= 0 || cpuDelta <= 0) return 0;
  return (cpuDelta / systemDelta) * onlineCpus;
}

function memBytesFromStats(stats: Docker.ContainerStats): number {
  const cache = stats.memory_stats.stats?.cache ?? stats.memory_stats.stats?.inactive_file ?? 0;
  return Math.max(0, (stats.memory_stats.usage ?? 0) - cache);
}

export async function collectHostSnapshot(connectionUrl: string): Promise<HostSnapshot> {
  const docker = buildDockerClient(connectionUrl);

  const info = await docker.info();
  const totalMemBytes = info.MemTotal ?? 0;
  const totalCpuCores = info.NCPU ?? 1;

  const containerList = await docker.listContainers({ all: false });

  const containers: ContainerUsage[] = await Promise.all(
    containerList.map(async (c) => {
      const container = docker.getContainer(c.Id);
      const stats = (await container.stats({ stream: false })) as Docker.ContainerStats;
      return {
        id: c.Id.slice(0, 12),
        name: c.Names[0]?.replace(/^\//, "") ?? c.Id.slice(0, 12),
        image: c.Image,
        memBytes: memBytesFromStats(stats),
        cpuCores: cpuCoresFromStats(stats),
        mounts: c.Mounts.filter((m) => m.Type === "bind").map((m) => ({
          source: m.Source,
          destination: m.Destination,
        })),
      };
    })
  );

  return {
    totalMemBytes,
    totalCpuCores,
    containers,
    collectedAt: new Date().toISOString(),
  };
}
