"use client";

import { useEffect, useState } from "react";
import {
  RefreshCw,
  Skull,
  AlertTriangle,
  HardDriveDownload,
  ChevronDown,
  ShieldAlert,
  Settings,
  DatabaseBackup,
  Database,
  Plus,
  Trash2,
  HardDrive,
  EyeOff,
  Eye,
  LayoutDashboard,
  Boxes,
  Languages,
  Globe,
} from "lucide-react";
import type { HostSnapshot } from "@/lib/docker";
import type { DiskFailureResult } from "@/lib/simulate";
import type { RecoveryScoreResult } from "@/lib/score";
import type { DiskBackupInfo, ExternalCoverage, PhysicalDiskWithImpact } from "@/lib/backup";
import type { ExternalBackupWithFreshness, FreshnessStatus } from "@/lib/externalBackups";
import { formatBytes, formatCores } from "@/lib/format";
import { t, tm, type Locale } from "@/lib/i18n";

type DiskGroupWithBackup = DiskFailureResult & { backup: DiskBackupInfo | null };

const TOOL_LABELS: Record<string, string> = { restic: "Restic", borg: "Borg", rsync: "rsync", other: "Other" };

type Section = "overview" | "disks" | "backup" | "external" | "containers" | "settings";

/** Color classes by score ratio (0-1) — shows a good/medium/bad distinction instead of a fixed brand color. */
function scoreColorClasses(ratio: number): { text: string; border: string; bar: string } {
  if (ratio >= 0.8) {
    return { text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/40", bar: "bg-emerald-500" };
  }
  if (ratio >= 0.5) {
    return { text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/40", bar: "bg-amber-500" };
  }
  return { text: "text-red-600 dark:text-red-400", border: "border-red-500/40", bar: "bg-red-500" };
}

function freshnessBadge(locale: Locale, status: FreshnessStatus) {
  switch (status) {
    case "fresh":
      return { label: t(locale, "badge.fresh"), className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" };
    case "stale":
      return { label: t(locale, "badge.stale"), className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" };
    default:
      return { label: t(locale, "badge.markerMissing"), className: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300" };
  }
}

const DISK_TAG_COLORS = [
  "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300",
  "bg-pink-100 text-pink-800 dark:bg-pink-500/15 dark:text-pink-300",
  "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300",
  "bg-lime-100 text-lime-800 dark:bg-lime-500/15 dark:text-lime-300",
  "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300",
];

/** Assigns each disk/dataset name a color that stays the same as long as the name does. */
function diskTagColor(disk: string): string {
  let hash = 0;
  for (let i = 0; i < disk.length; i++) hash = (hash * 31 + disk.charCodeAt(i)) | 0;
  return DISK_TAG_COLORS[Math.abs(hash) % DISK_TAG_COLORS.length];
}

function coverageBadgeClass(ratio: number): string {
  if (ratio >= 0.9) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
  if (ratio >= 0.5) return "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
  return "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300";
}

function externalCoverageNote(locale: Locale, ext: ExternalCoverage | null) {
  if (!ext) return null;
  const badge = freshnessBadge(locale, ext.status);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
      <HardDrive size={11} />
      {ext.jobName} · {badge.label}
    </span>
  );
}

type Status = {
  lastSnapshot: HostSnapshot | null;
  lastSnapshotAt: string | null;
  lastError: string | null;
  truenasConfigured: boolean;
  truenasApiUrl: string | null;
  truenasError: string | null;
  publicUrl: string | null;
  version?: string;
};

function backupBadge(locale: Locale, status: DiskBackupInfo["status"] | undefined) {
  switch (status) {
    case "replicated":
      return { label: t(locale, "badge.replicated"), className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" };
    case "snapshot-only":
      return { label: t(locale, "badge.snapshotOnly"), className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" };
    default:
      return { label: t(locale, "badge.none"), className: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300" };
  }
}

const NAV_ITEMS: { id: Section; icon: typeof LayoutDashboard; labelKey: string }[] = [
  { id: "overview", icon: LayoutDashboard, labelKey: "nav.overview" },
  { id: "disks", icon: HardDriveDownload, labelKey: "nav.diskScenarios" },
  { id: "backup", icon: Database, labelKey: "nav.dataBackup" },
  { id: "external", icon: HardDrive, labelKey: "nav.externalJobs" },
  { id: "containers", icon: Boxes, labelKey: "nav.containers" },
  { id: "settings", icon: Settings, labelKey: "nav.settings" },
];

export default function Home() {
  const [locale, setLocale] = useState<Locale>("en");
  const [activeSection, setActiveSection] = useState<Section>("overview");

  const [status, setStatus] = useState<Status | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const [diskGroups, setDiskGroups] = useState<DiskGroupWithBackup[]>([]);
  const [expandedPrefixes, setExpandedPrefixes] = useState<Set<string>>(new Set());
  const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(new Set());
  const [expandedPools, setExpandedPools] = useState<Set<string>>(new Set());

  const [physicalDisks, setPhysicalDisks] = useState<PhysicalDiskWithImpact[]>([]);

  const [score, setScore] = useState<RecoveryScoreResult | null>(null);
  const [showAllIssues, setShowAllIssues] = useState(false);

  const [truenasApiUrl, setTruenasApiUrl] = useState("");
  const [truenasApiKey, setTruenasApiKey] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const [publicUrl, setPublicUrl] = useState("");
  const [savingPublicUrl, setSavingPublicUrl] = useState(false);

  const [externalBackups, setExternalBackups] = useState<ExternalBackupWithFreshness[]>([]);
  const [showAddExternalBackup, setShowAddExternalBackup] = useState(false);
  const [ebName, setEbName] = useState("");
  const [ebTool, setEbTool] = useState("restic");
  const [ebPathPrefix, setEbPathPrefix] = useState("");
  const [ebMarkerPath, setEbMarkerPath] = useState("");
  const [ebIntervalHours, setEbIntervalHours] = useState("24");
  const [ebError, setEbError] = useState<string | null>(null);
  const [savingEb, setSavingEb] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("locale");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time locale restore from localStorage on mount
    if (saved === "tr" || saved === "en") setLocale(saved);
  }, []);

  useEffect(() => {
    // Keep <html lang> in sync with the locale: a stale "tr" makes the browser apply the Turkish
    // uppercase rule (I -> İ) even to English text.
    document.documentElement.lang = locale;
  }, [locale]);

  function changeLocale(next: Locale) {
    setLocale(next);
    window.localStorage.setItem("locale", next);
  }

  async function loadStatus() {
    const res = await fetch("/api/status");
    const data = await res.json();
    setStatus(data);
    setTruenasApiUrl(data.truenasApiUrl ?? "");
    setPublicUrl(data.publicUrl ?? "");
    setStatusLoading(false);
  }

  async function loadDiskGroups() {
    const res = await fetch("/api/disks");
    setDiskGroups(await res.json());
  }

  async function loadPhysicalDisks() {
    const res = await fetch("/api/physical-disks");
    setPhysicalDisks(await res.json());
  }

  async function loadScore() {
    const res = await fetch("/api/recovery-score");
    setScore(await res.json());
  }

  async function loadExternalBackups() {
    const res = await fetch("/api/external-backups");
    setExternalBackups(await res.json());
  }

  async function loadAll() {
    await Promise.all([loadStatus(), loadDiskGroups(), loadPhysicalDisks(), loadScore(), loadExternalBackups()]);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, []);

  function toggleExpanded(prefix: string) {
    setExpandedPrefixes((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
  }

  function toggleDataset(dataset: string) {
    setExpandedDatasets((prev) => {
      const next = new Set(prev);
      if (next.has(dataset)) next.delete(dataset);
      else next.add(dataset);
      return next;
    });
  }

  function togglePool(pool: string) {
    setExpandedPools((prev) => {
      const next = new Set(prev);
      if (next.has(pool)) next.delete(pool);
      else next.add(pool);
      return next;
    });
  }

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshError(null);
    const res = await fetch("/api/refresh", { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setRefreshError(body.error || "Something went wrong.");
    }
    await loadAll();
    setRefreshing(false);
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsError(null);
    setSavingSettings(true);
    const res = await fetch("/api/truenas-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiUrl: truenasApiUrl, apiKey: truenasApiKey }),
    });
    setSavingSettings(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setSettingsError(body.error || "Something went wrong.");
      return;
    }
    setTruenasApiKey("");
    await loadStatus();
  }

  async function handleSavePublicUrl(e: React.FormEvent) {
    e.preventDefault();
    setSavingPublicUrl(true);
    const res = await fetch("/api/app-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicUrl }),
    });
    setSavingPublicUrl(false);
    if (res.ok) {
      const body = await res.json();
      setPublicUrl(body.publicUrl ?? "");
    }
  }

  async function handleAddExternalBackup(e: React.FormEvent) {
    e.preventDefault();
    setEbError(null);
    setSavingEb(true);
    const res = await fetch("/api/external-backups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: ebName,
        tool: ebTool,
        pathPrefix: ebPathPrefix,
        markerPath: ebMarkerPath,
        expectedIntervalHours: Number(ebIntervalHours),
      }),
    });
    setSavingEb(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setEbError(body.error || "Something went wrong.");
      return;
    }
    setEbName("");
    setEbPathPrefix("");
    setEbMarkerPath("");
    setEbIntervalHours("24");
    setShowAddExternalBackup(false);
    await Promise.all([loadExternalBackups(), loadScore(), loadDiskGroups(), loadPhysicalDisks()]);
  }

  async function handleDeleteExternalBackup(id: number) {
    if (!confirm("Are you sure you want to remove this backup job?")) return;
    await fetch(`/api/external-backups/${id}`, { method: "DELETE" });
    await Promise.all([loadExternalBackups(), loadScore(), loadDiskGroups(), loadPhysicalDisks()]);
  }

  async function handleToggleExcluded(pool: string, excluded: boolean) {
    await fetch("/api/excluded-pools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pool, excluded }),
    });
    await Promise.all([loadScore(), loadPhysicalDisks()]);
  }

  async function handleToggleDatasetExcluded(dataset: string, excluded: boolean) {
    await fetch("/api/excluded-datasets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset, excluded }),
    });
    await Promise.all([loadScore(), loadPhysicalDisks()]);
  }

  const hasData = status?.lastSnapshot != null;
  const T = (key: string, params?: Record<string, string | number>) => t(locale, key, params);
  const activeNav = NAV_ITEMS.find((n) => n.id === activeSection)!;

  // A pool may be striped across several physical disks (e.g. pool3) — so a single pool can map
  // to more than one physical disk (the real device/model).
  const disksByPool = new Map<string, { device: string; model: string | null }[]>();
  for (const pd of physicalDisks) {
    if (!pd.pool) continue;
    const list = disksByPool.get(pd.pool) ?? [];
    list.push({ device: pd.device, model: pd.model });
    disksByPool.set(pd.pool, list);
  }

  // The "/mnt/<pool>/<dataset>" -> pool/dataset assumption is wrong for ix-apps: TrueNAS always
  // mounts it at the fixed path "/mnt/.ix-apps/app_mounts" while the real pool is a different one
  // (e.g. "pool2"). We find the correct pool/dataset name by matching mountpoints against the real
  // dataset list, and fall back to guessing from the path.
  const poolByMountpoint = new Map<string, { pool: string; name: string }>();
  for (const pd of physicalDisks) {
    for (const ds of pd.datasets) {
      if (ds.mountpoint) poolByMountpoint.set(ds.mountpoint, { pool: ds.pool, name: ds.dataset });
    }
  }

  // Used to show, in the containers list, which disk group (the same pathPrefix as in Disk Scenarios)
  // a container is attached to — a container can appear in several disk groups (e.g. both the app and
  // the media disk). "pool" is the ZFS pool name (resolved to the real device in the Physical Disk
  // column), "dataset" is the full ZFS dataset name.
  const disksByContainer = new Map<string, { pool: string; dataset: string | null }[]>();
  for (const g of diskGroups) {
    const known = poolByMountpoint.get(g.pathPrefix);
    let pool: string;
    let dataset: string | null;
    if (known) {
      pool = known.pool;
      dataset = known.name === known.pool ? null : known.name.slice(known.pool.length + 1);
    } else {
      const stripped = g.pathPrefix.replace(/^\/mnt\//, "");
      const slash = stripped.indexOf("/");
      pool = slash === -1 ? stripped : stripped.slice(0, slash);
      dataset = slash === -1 ? null : stripped.slice(slash + 1);
    }
    for (const a of g.affected) {
      const list = disksByContainer.get(a.container.id) ?? [];
      list.push({ pool, dataset });
      disksByContainer.set(a.container.id, list);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface-2">
        <div className="flex flex-col gap-1 border-b border-border px-4 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-white">
              <Skull size={16} />
            </div>
            <span className="text-sm font-semibold leading-tight">{T("app.title")}</span>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`flex items-center gap-2.5 rounded-md border-l-2 px-2.5 py-2 text-left text-sm transition-colors ${
                  active
                    ? "border-brand bg-brand/10 font-medium text-foreground"
                    : "border-transparent text-muted hover:bg-background hover:text-foreground"
                }`}
              >
                <Icon size={15} />
                {T(item.labelKey)}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-border p-2">
          {status?.version && (
            <div className="pb-2 text-center text-[11px] text-muted">v{status.version}</div>
          )}
          {/* AGPL-3.0 §13: network users must be offered access to the source code. */}
          <div className="pb-2 text-center text-[11px] text-muted">
            AGPL-3.0 ·{" "}
            <a
              href="https://github.com/matu-tr/homelab-disaster-simulator"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-foreground"
            >
              {T("app.sourceCode")}
            </a>
          </div>
          <div className="flex items-center gap-1 rounded-md bg-background p-1 text-xs">
            <Languages size={13} className="ml-1 text-muted" />
            {(["tr", "en"] as Locale[]).map((l) => (
              <button
                key={l}
                onClick={() => changeLocale(l)}
                className={`flex-1 rounded px-2 py-1 font-medium uppercase ${
                  locale === l ? "bg-brand text-white" : "text-muted hover:text-foreground"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-5 py-2.5">
          <div>
            <h1 className="text-sm font-semibold leading-tight">{T(activeNav.labelKey)}</h1>
            <p className="text-xs text-muted leading-tight">
              {status?.lastSnapshotAt ? T("app.lastUpdate", { time: status.lastSnapshotAt }) : T("app.neverUpdated")}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? T("topbar.refreshing") : T("topbar.refresh")}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-4">
          {statusLoading ? (
            <p className="text-sm text-muted">{T("app.loading")}</p>
          ) : !hasData ? (
            <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-10 text-center">
              <Skull size={22} className="text-brand" />
              <p className="mt-4 text-sm font-medium">{T("empty.title")}</p>
              <p className="mt-1 text-sm text-muted">{T("empty.desc")}</p>
              {status?.lastError && (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-red-600">
                  <AlertTriangle size={14} />
                  {status.lastError}
                </p>
              )}
            </div>
          ) : (
            <>
              {activeSection === "overview" && (
                <>
                  {score && (
                    <section className="mb-4 rounded-md border border-border bg-surface p-4 shadow-sm">
                      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                        <div className="flex shrink-0 flex-col items-center">
                          <div
                            className={`flex h-20 w-20 flex-col items-center justify-center rounded-full border-4 ${scoreColorClasses(score.total / score.maxTotal).border}`}
                          >
                            <span className={`text-2xl font-bold ${scoreColorClasses(score.total / score.maxTotal).text}`}>
                              {score.total}
                            </span>
                            <span className="text-[10px] text-muted">/ {score.maxTotal}</span>
                          </div>
                          <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">{T("score.title")}</p>
                        </div>

                        <div className="flex-1">
                          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                            {score.breakdown.map((b) => {
                              const colors = scoreColorClasses(b.score / b.max);
                              return (
                                <li key={b.label.key} className="rounded-md border border-border p-2 text-sm">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium">{tm(locale, b.label)}</span>
                                    <span className={colors.text}>
                                      {b.score}/{b.max}
                                    </span>
                                  </div>
                                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-background">
                                    <div className={`h-full ${colors.bar}`} style={{ width: `${(b.score / b.max) * 100}%` }} />
                                  </div>
                                  <p className="mt-1 text-xs text-muted">{tm(locale, b.note)}</p>
                                </li>
                              );
                            })}
                          </ul>

                          {score.issues.length > 0 && (
                            <div className="mt-3">
                              <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                                <ShieldAlert size={13} />
                                {T("score.issuesTitle")}
                              </h3>
                              <ul className="mt-1.5 flex flex-col gap-1">
                                {(showAllIssues ? score.issues : score.issues.slice(0, 6)).map((issue, i) => (
                                  <li
                                    key={i}
                                    className={`flex items-start gap-1.5 text-sm ${
                                      issue.severity === "critical"
                                        ? "text-red-700 dark:text-red-400"
                                        : "text-amber-700 dark:text-amber-400"
                                    }`}
                                  >
                                    <span>{issue.severity === "critical" ? "🔴" : "🟡"}</span>
                                    <span>{tm(locale, issue.text)}</span>
                                  </li>
                                ))}
                              </ul>
                              {score.issues.length > 6 && (
                                <button
                                  onClick={() => setShowAllIssues((v) => !v)}
                                  className="mt-2 text-xs font-medium text-brand hover:underline"
                                >
                                  {showAllIssues ? T("score.showLess") : T("score.showMore", { count: score.issues.length - 6 })}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </section>
                  )}

                  <section className="rounded-md border border-border bg-surface p-4 shadow-sm">
                    <h2 className="text-xs font-medium uppercase tracking-wide text-muted">{T("system.title")}</h2>
                    <p className="mt-1 text-sm text-muted">
                      {T("system.summary", {
                        ram: formatBytes(status!.lastSnapshot!.totalMemBytes),
                        cores: status!.lastSnapshot!.totalCpuCores,
                        count: status!.lastSnapshot!.containers.length,
                      })}
                    </p>
                    {refreshError && (
                      <p className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
                        <AlertTriangle size={14} />
                        {refreshError}
                      </p>
                    )}
                  </section>
                </>
              )}

              {activeSection === "disks" && (
                <section>
                  <p className="text-sm text-muted">{T("diskScenarios.desc")}</p>

                  {diskGroups.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">{T("diskScenarios.none")}</p>
                  ) : (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {diskGroups.map((g) => {
                        const expanded = expandedPrefixes.has(g.pathPrefix);
                        const badge = backupBadge(locale, g.backup?.status);
                        return (
                          <li key={g.pathPrefix} className="rounded-md border border-border bg-surface overflow-hidden">
                            <button
                              onClick={() => toggleExpanded(g.pathPrefix)}
                              className="flex w-full items-center justify-between gap-3 p-2.5 text-left"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-sm">{g.pathPrefix}</span>
                                <span className="text-xs text-muted">{T("diskScenarios.affected", { count: g.affected.length })}</span>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                                  {badge.label}
                                </span>
                              </div>
                              <ChevronDown
                                size={16}
                                className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
                              />
                            </button>
                            {expanded && (
                              <div className="border-t border-border p-2.5">
                                {g.backup && (
                                  <div className="mb-2 rounded-md bg-background p-2 text-xs text-muted">
                                    {g.backup.matchedSnapshotTask && (
                                      <p>
                                        {T("diskScenarios.snapshotInfo", {
                                          schedule: tm(locale, g.backup.matchedSnapshotTask.scheduleSummary),
                                          value: g.backup.matchedSnapshotTask.lifetimeValue,
                                          unit: g.backup.matchedSnapshotTask.lifetimeUnit,
                                          last: g.backup.matchedSnapshotTask.lastSnapshot ?? "—",
                                        })}
                                      </p>
                                    )}
                                    {g.backup.matchedReplicationTask && (
                                      <p>
                                        {T("diskScenarios.replicationInfo", {
                                          name: g.backup.matchedReplicationTask.name,
                                          target: g.backup.matchedReplicationTask.targetDataset,
                                          transport: g.backup.matchedReplicationTask.transport,
                                        })}
                                      </p>
                                    )}
                                    {g.backup.cloudSync && (
                                      <p>
                                        {T("diskScenarios.cloudSyncInfo", {
                                          desc: g.backup.cloudSync.description,
                                          provider: g.backup.cloudSync.provider,
                                          state: g.backup.cloudSync.lastState ?? T("badge.neverRan"),
                                        })}
                                      </p>
                                    )}
                                    {g.backup.status === "none" && <p>{T("diskScenarios.noMatch")}</p>}
                                    {g.backup.externalBackup && (
                                      <div className="mt-1">{externalCoverageNote(locale, g.backup.externalBackup)}</div>
                                    )}
                                  </div>
                                )}
                                <ul className="flex flex-col gap-1.5">
                                  {g.affected.map((a) => (
                                    <li key={a.container.id} className="rounded-md border border-border p-2 text-sm">
                                      <span className="font-medium">{a.container.name}</span>
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {a.matchedPaths.map((p) => (
                                          <span
                                            key={p}
                                            className="rounded bg-background px-1.5 py-0.5 font-mono text-xs text-muted border border-border"
                                          >
                                            {p}
                                          </span>
                                        ))}
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              )}

              {activeSection === "backup" && (
                <section>
                  <p className="text-sm text-muted">{T("dataBackup.desc")}</p>

                  {!status?.truenasConfigured ? (
                    <p className="mt-3 text-sm text-muted">{T("dataBackup.notConfigured")}</p>
                  ) : physicalDisks.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">{T("dataBackup.none")}</p>
                  ) : (
                    <div className="mt-2 flex flex-col gap-2">
                      {physicalDisks.map((disk) => {
                        const ratio = disk.scorableBytes > 0 ? disk.protectedBytes / disk.scorableBytes : 1;
                        const diskExpanded = expandedPools.has(disk.device);
                        return (
                          <div
                            key={disk.device}
                            className={`rounded-md border border-border bg-surface overflow-hidden ${disk.excluded ? "opacity-50" : ""}`}
                          >
                            <div className="flex w-full flex-wrap items-center justify-between gap-2 p-2.5">
                              <button
                                onClick={() => togglePool(disk.device)}
                                className="flex flex-1 flex-wrap items-center gap-2 text-left"
                              >
                                <HardDrive size={14} className="text-muted" />
                                <span className="text-sm font-medium">{disk.device}</span>
                                {disk.model && <span className="text-xs text-muted">{disk.model}</span>}
                                <span className="text-xs text-muted">→ {disk.pool}</span>
                                <span className="text-xs text-muted">{formatBytes(disk.totalBytes)}</span>
                                {disk.isBootDisk ? (
                                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-500/15 dark:text-purple-300">
                                    {T("dataBackup.bootDisk")}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted">
                                    {T("dataBackup.affected", { count: disk.affectedContainers.length })}
                                  </span>
                                )}
                                {disk.backupTargetForPools.length > 0 && (
                                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-500/15 dark:text-blue-300">
                                    {T("dataBackup.backupTarget", { pools: disk.backupTargetForPools.join(", ") })}
                                  </span>
                                )}
                                {disk.excluded && (
                                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-gray-300">
                                    {T("badge.excluded")}
                                  </span>
                                )}
                              </button>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {disk.redundant ? (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                                    {T("dataBackup.redundant", { vdev: disk.vdevType ?? "" })}
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-500/15 dark:text-red-300">
                                    {T("dataBackup.noRedundancy")}
                                  </span>
                                )}
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${coverageBadgeClass(ratio)}`}>
                                  {T("dataBackup.protected", { percent: Math.round(ratio * 100) })}
                                </span>
                                <button
                                  onClick={() => disk.pool && handleToggleExcluded(disk.pool, !disk.excluded)}
                                  title={disk.excluded ? T("dataBackup.includeToggle") : T("dataBackup.excludeToggle")}
                                  className="rounded-md p-1.5 text-muted hover:bg-background hover:text-foreground"
                                >
                                  {disk.excluded ? <Eye size={15} /> : <EyeOff size={15} />}
                                </button>
                                <button onClick={() => togglePool(disk.device)} className="p-1">
                                  <ChevronDown
                                    size={16}
                                    className={`text-muted transition-transform ${diskExpanded ? "rotate-180" : ""}`}
                                  />
                                </button>
                              </div>
                            </div>
                            {diskExpanded && (
                              <div className="border-t border-border p-2.5">
                                {disk.isBootDisk && (
                                  <p className="mb-2 rounded-md bg-purple-50 p-2 text-xs text-purple-800 dark:bg-purple-500/10 dark:text-purple-300">
                                    {T("dataBackup.bootDiskDesc")}
                                  </p>
                                )}
                                {disk.affectedContainers.length > 0 && (
                                  <div className="mb-2">
                                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                                      {T("diskScenarios.affectedServices")}
                                    </p>
                                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                                      {disk.affectedContainers.map((c) => (
                                        <li
                                          key={c.id}
                                          className="rounded-full bg-background px-2 py-1 text-xs text-muted border border-border"
                                        >
                                          {c.name}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                <ul className="flex flex-col gap-1.5">
                                  {disk.datasets.map((d) => {
                                    const badge = backupBadge(locale, d.status);
                                    const expanded = expandedDatasets.has(d.dataset);
                                    return (
                                      <li
                                        key={d.dataset}
                                        className={`rounded-md border border-border bg-surface overflow-hidden ${d.excluded ? "opacity-50" : ""}`}
                                      >
                                        <div className="flex w-full flex-wrap items-center justify-between gap-2 p-2.5 text-sm">
                                          <button
                                            onClick={() => toggleDataset(d.dataset)}
                                            className="flex flex-1 flex-wrap items-center gap-2 text-left"
                                          >
                                            <span className="font-mono text-xs">{d.dataset}</span>
                                            <span className="text-xs text-muted">{formatBytes(d.usedBytes)}</span>
                                            <span className="text-xs text-muted">
                                              {T("dataBackup.datasetServices", { count: d.affectedContainers.length })}
                                            </span>
                                            {d.excluded && (
                                              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-gray-300">
                                                {T("badge.excluded")}
                                              </span>
                                            )}
                                          </button>
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                                              {badge.label}
                                            </span>
                                            {externalCoverageNote(locale, d.externalBackup)}
                                            <button
                                              onClick={() => handleToggleDatasetExcluded(d.dataset, !d.excluded)}
                                              title={d.excluded ? T("dataBackup.includeToggle") : T("dataBackup.excludeDatasetToggle")}
                                              className="rounded-md p-1 text-muted hover:bg-background hover:text-foreground"
                                            >
                                              {d.excluded ? <Eye size={13} /> : <EyeOff size={13} />}
                                            </button>
                                            <button onClick={() => toggleDataset(d.dataset)} className="p-0.5">
                                              <ChevronDown
                                                size={14}
                                                className={`text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
                                              />
                                            </button>
                                          </div>
                                        </div>
                                        {expanded && (
                                          <div className="border-t border-border p-2.5">
                                            {(d.matchedSnapshotTask || d.matchedReplicationTask || d.cloudSync) && (
                                              <div className="mb-2.5 rounded-md bg-background p-2 text-xs text-muted">
                                                {d.matchedSnapshotTask && (
                                                  <p>
                                                    {T("diskScenarios.snapshotInfo", {
                                                      schedule: tm(locale, d.matchedSnapshotTask.scheduleSummary),
                                                      value: d.matchedSnapshotTask.lifetimeValue,
                                                      unit: d.matchedSnapshotTask.lifetimeUnit,
                                                      last: d.matchedSnapshotTask.lastSnapshot ?? "—",
                                                    })}
                                                  </p>
                                                )}
                                                {d.matchedReplicationTask && (
                                                  <p>
                                                    {T("diskScenarios.replicationInfo", {
                                                      name: d.matchedReplicationTask.name,
                                                      target: d.matchedReplicationTask.targetDataset,
                                                      transport: `${d.matchedReplicationTask.transport}${d.sameHostOnly ? ", same host" : ""}`,
                                                    })}
                                                  </p>
                                                )}
                                                {d.cloudSync && (
                                                  <p>
                                                    {T("diskScenarios.cloudSyncInfo", {
                                                      desc: d.cloudSync.description,
                                                      provider: d.cloudSync.provider,
                                                      state: d.cloudSync.lastState ?? T("badge.neverRan"),
                                                    })}
                                                    {d.cloudSync.lastFinishedAt &&
                                                      ` · ${new Date(d.cloudSync.lastFinishedAt).toLocaleString(locale === "tr" ? "tr-TR" : "en-US")}`}
                                                  </p>
                                                )}
                                              </div>
                                            )}
                                            {d.affectedContainers.length === 0 ? (
                                              <p className="text-xs text-muted">{T("dataBackup.noContainers")}</p>
                                            ) : (
                                              <ul className="flex flex-wrap gap-1.5">
                                                {d.affectedContainers.map((c) => (
                                                  <li
                                                    key={c.id}
                                                    className="rounded-full bg-background px-2 py-1 text-xs text-muted border border-border"
                                                  >
                                                    {c.name}
                                                  </li>
                                                ))}
                                              </ul>
                                            )}
                                          </div>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {activeSection === "external" && (
                <section>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted">{T("externalJobs.desc")}</p>
                    <button
                      onClick={() => setShowAddExternalBackup((v) => !v)}
                      className="ml-4 inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface"
                    >
                      <Plus size={13} />
                      {T("externalJobs.add")}
                    </button>
                  </div>

                  {showAddExternalBackup && (
                    <form
                      onSubmit={handleAddExternalBackup}
                      className="mt-2 rounded-md border border-border bg-surface p-4 shadow-sm"
                    >
                      <div className="grid grid-cols-2 gap-4">
                        <label className="flex flex-col gap-1.5">
                          <span className="text-sm font-medium">{T("externalJobs.name")}</span>
                          <input
                            value={ebName}
                            onChange={(e) => setEbName(e.target.value)}
                            required
                            placeholder={T("externalJobs.namePlaceholder")}
                            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-sm font-medium">{T("externalJobs.tool")}</span>
                          <select
                            value={ebTool}
                            onChange={(e) => setEbTool(e.target.value)}
                            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                          >
                            <option value="restic">Restic</option>
                            <option value="borg">Borg</option>
                            <option value="rsync">rsync</option>
                            <option value="other">{TOOL_LABELS.other}</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-sm font-medium">{T("externalJobs.pathPrefix")}</span>
                          <input
                            value={ebPathPrefix}
                            onChange={(e) => setEbPathPrefix(e.target.value)}
                            required
                            placeholder="/mnt/pool3"
                            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-sm font-medium">{T("externalJobs.intervalHours")}</span>
                          <input
                            type="number"
                            min={1}
                            value={ebIntervalHours}
                            onChange={(e) => setEbIntervalHours(e.target.value)}
                            required
                            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                          />
                        </label>
                        <label className="col-span-2 flex flex-col gap-1.5">
                          <span className="text-sm font-medium">{T("externalJobs.markerPath")}</span>
                          <input
                            value={ebMarkerPath}
                            onChange={(e) => setEbMarkerPath(e.target.value)}
                            required
                            placeholder="/mnt/pool3/.restic-last-run"
                            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                          />
                        </label>
                      </div>
                      {ebError && <p className="mt-3 text-sm text-red-600">{ebError}</p>}
                      <div className="mt-4 flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={savingEb}
                          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                        >
                          {T("externalJobs.save")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAddExternalBackup(false)}
                          className="rounded-md px-4 py-2 text-sm font-medium text-muted hover:text-foreground"
                        >
                          {T("externalJobs.cancel")}
                        </button>
                      </div>
                    </form>
                  )}

                  {externalBackups.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">{T("externalJobs.none")}</p>
                  ) : (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {externalBackups.map((job) => {
                        const badge = freshnessBadge(locale, job.freshness.status);
                        return (
                          <li
                            key={job.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface p-2.5 text-sm"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{job.name}</span>
                              <span className="text-xs text-muted">
                                {TOOL_LABELS[job.tool] ?? job.tool} · {job.pathPrefix}
                              </span>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                                {badge.label}
                                {job.freshness.ageHours != null && T("externalJobs.ageHours", { hours: Math.round(job.freshness.ageHours) })}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDeleteExternalBackup(job.id)}
                              title={T("externalJobs.delete")}
                              className="rounded-md p-2 text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                            >
                              <Trash2 size={15} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              )}

              {activeSection === "containers" && (
                <section>
                  <div className="overflow-hidden rounded-md border border-border bg-surface">
                    <div className="grid grid-cols-[2fr_1.2fr_1.2fr_1fr] gap-2 border-b border-border bg-surface-2 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                      <span>{T("containers.colName")}</span>
                      <span>{T("containers.colDisk")}</span>
                      <span>{T("containers.colDataset")}</span>
                      <span className="text-right">{T("containers.colStats")}</span>
                    </div>
                    <div className="flex flex-col">
                      {status!.lastSnapshot!.containers.map((c) => {
                        const disks = disksByContainer.get(c.id) ?? [];
                        return (
                          <div
                            key={c.id}
                            className="grid grid-cols-[2fr_1.2fr_1.2fr_1fr] items-center gap-2 border-b border-border px-2.5 py-1.5 text-sm last:border-b-0 hover:bg-background"
                          >
                            <span className="font-mono text-xs">{c.name}</span>
                            <div className="flex flex-wrap items-center gap-1">
                              {disks.flatMap((d) =>
                                (disksByPool.get(d.pool) ?? [{ device: d.pool, model: null }]).map((pd, i) => (
                                  <span
                                    key={`${d.pool}-${i}`}
                                    title={pd.model ?? undefined}
                                    className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium ${diskTagColor(d.pool)}`}
                                  >
                                    {pd.model ?? pd.device}
                                  </span>
                                ))
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {disks.map((d, i) => (
                                <span
                                  key={i}
                                  className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium ${diskTagColor(d.pool)}`}
                                >
                                  {d.dataset ? `${d.pool}/${d.dataset}` : d.pool}
                                </span>
                              ))}
                            </div>
                            <span className="text-right text-xs text-muted">
                              {formatBytes(c.memBytes)} / {formatCores(c.cpuCores)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              )}

              {activeSection === "settings" && (
                <section className="flex flex-col gap-4">
                  <form onSubmit={handleSavePublicUrl} className="rounded-md border border-border bg-surface p-4 shadow-sm">
                    <h2 className="flex items-center gap-2 text-sm font-semibold mb-1">
                      <Globe size={16} />
                      {T("settings.addressTitle")}
                    </h2>
                    <p className="text-sm text-muted mb-2.5">{T("settings.addressDescription")}</p>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">{T("settings.address")}</span>
                      <input
                        value={publicUrl}
                        onChange={(e) => setPublicUrl(e.target.value)}
                        placeholder="hds.matu.tr"
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                      />
                    </label>
                    <div className="mt-4 flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={savingPublicUrl}
                        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                      >
                        {T("settings.save")}
                      </button>
                    </div>
                  </form>

                  <form onSubmit={handleSaveSettings} className="rounded-md border border-border bg-surface p-4 shadow-sm">
                    <h2 className="flex items-center gap-2 text-sm font-semibold mb-1">
                      <DatabaseBackup size={16} />
                      {T("settings.title")}
                    </h2>
                    <p className="text-sm text-muted mb-2.5">{T("settings.description")}</p>
                    <div className="grid grid-cols-2 gap-4">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium">{T("settings.apiUrl")}</span>
                        <input
                          value={truenasApiUrl}
                          onChange={(e) => setTruenasApiUrl(e.target.value)}
                          placeholder="http://192.168.1.10:8080"
                          className="rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium">{T("settings.apiKey")}</span>
                        <input
                          value={truenasApiKey}
                          onChange={(e) => setTruenasApiKey(e.target.value)}
                          type="password"
                          placeholder={status?.truenasConfigured ? T("settings.apiKeySet") : "1-xxxxxxxx..."}
                          className="rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                        />
                      </label>
                    </div>
                    {settingsError && <p className="mt-3 text-sm text-red-600">{settingsError}</p>}
                    {status?.truenasError && (
                      <p className="mt-3 text-sm text-amber-600">{T("settings.lastError", { error: status.truenasError })}</p>
                    )}
                    <div className="mt-4 flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={savingSettings}
                        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                      >
                        {T("settings.save")}
                      </button>
                    </div>
                  </form>
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
