import type { ContainerUsage, HostSnapshot } from "./docker";

export type AffectedContainer = {
  container: ContainerUsage;
  matchedPaths: string[];
};

export type DiskFailureResult = {
  pathPrefix: string;
  affected: AffectedContainer[];
};

function pathGroupKey(sourcePath: string, depth: number): string {
  const segments = sourcePath.split("/").filter(Boolean);
  if (segments.length <= depth) return `/${segments.join("/")}`;
  return `/${segments.slice(0, depth).join("/")}`;
}

/**
 * Konteynerlerin gerçek bind mount'larından, kullanıcıdan hiçbir giriş almadan
 * olası "disk" sınırlarını (ör. /mnt/<pool>/<dataset>) çıkarır.
 */
export function detectDiskGroups(snapshot: HostSnapshot, depth = 3): DiskFailureResult[] {
  const groups = new Map<string, Map<string, AffectedContainer>>();

  for (const container of snapshot.containers) {
    const byPrefix = new Map<string, Set<string>>();
    for (const mount of container.mounts ?? []) {
      // Uygulamanın kendi altyapı mount'ları (Docker socket'i izlemek ve harici backup marker
      // dosyalarını okumak için) gerçek bir "disk/dataset" sınırı değil — disk senaryolarına
      // gürültü olarak karışmasın diye atlanıyor.
      if (mount.source === "/var/run/docker.sock" || mount.source === "/mnt") continue;
      const prefix = pathGroupKey(mount.source, depth);
      if (!byPrefix.has(prefix)) byPrefix.set(prefix, new Set());
      byPrefix.get(prefix)!.add(mount.source);
    }
    for (const [prefix, matchedPaths] of byPrefix) {
      if (!groups.has(prefix)) groups.set(prefix, new Map());
      groups.get(prefix)!.set(container.id, { container, matchedPaths: [...matchedPaths] });
    }
  }

  return [...groups.entries()]
    .map(([pathPrefix, affectedMap]) => ({ pathPrefix, affected: [...affectedMap.values()] }))
    .sort((a, b) => b.affected.length - a.affected.length);
}
