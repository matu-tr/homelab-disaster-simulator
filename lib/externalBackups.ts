import fs from "fs";
import type { ExternalBackupRow } from "./db";

export type FreshnessStatus = "fresh" | "stale" | "missing";

export type ExternalBackupFreshness = {
  status: FreshnessStatus;
  lastModified: string | null;
  ageHours: number | null;
  error: string | null;
};

/** Judges a backup job's freshness from the marker file's last-modified time. */
export function checkFreshness(markerPath: string, expectedIntervalHours: number): ExternalBackupFreshness {
  try {
    const stat = fs.statSync(markerPath);
    const ageMs = Date.now() - stat.mtime.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    // 50% tolerance so a single missed run in the schedule is not immediately called "stale".
    const status: FreshnessStatus = ageHours <= expectedIntervalHours * 1.5 ? "fresh" : "stale";
    return { status, lastModified: stat.mtime.toISOString(), ageHours, error: null };
  } catch {
    return { status: "missing", lastModified: null, ageHours: null, error: "Marker file not found or unreadable." };
  }
}

export type ExternalBackupWithFreshness = ExternalBackupRow & { freshness: ExternalBackupFreshness };

export function checkAllExternalBackups(jobs: ExternalBackupRow[]): ExternalBackupWithFreshness[] {
  return jobs.map((job) => ({ ...job, freshness: checkFreshness(job.markerPath, job.expectedIntervalHours) }));
}
