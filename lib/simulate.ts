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
 * Derives likely "disk" boundaries (e.g. /mnt/<pool>/<dataset>) from the containers'
 * real bind mounts, without asking the user for any input.
 */
export function detectDiskGroups(snapshot: HostSnapshot, depth = 3): DiskFailureResult[] {
  const groups = new Map<string, Map<string, AffectedContainer>>();

  for (const container of snapshot.containers) {
    const byPrefix = new Map<string, Set<string>>();
    for (const mount of container.mounts ?? []) {
      // The app's own infra mounts (watching the Docker socket and reading external backup
      // marker files) are not real "disk/dataset" boundaries — skipped so they don't show up
      // as noise in the disk scenarios.
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
