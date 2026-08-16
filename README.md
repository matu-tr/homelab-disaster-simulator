# HomeLab Disaster Simulator

A read-only simulation tool that answers "what happens if this disk dies, can I recover?" based on **real mount and backup data**, not configured limits.

Watches the Docker daemon of the machine it's installed on — no other hosts are added, no multi-node management. It never touches anything: it only reads from the Docker API and (optionally) the TrueNAS API, computes, and reports.

## How it works

1. Hit "Refresh" to pull the real RAM/CPU usage and bind mounts of currently running containers from Docker.
2. **Disk scenarios**: the "Disk / Mount Scenarios" section **automatically detects** likely disk boundaries (e.g. `/mnt/pool3`) from containers' real bind mount paths — nothing to enter manually. Click a group to see which containers would be affected if that disk/dataset failed.
3. **TrueNAS backup analysis (optional)**: enter a TrueNAS API key from the settings (⚙️) icon and the app reads Periodic Snapshot Tasks and Replication Tasks, sorting each disk group into one of three states:
   - **No backup** — no snapshot/replication task covers that dataset
   - **Snapshot only** — snapshots are taken, but on the same pool; if the pool/disk fails, the snapshot goes with it
   - **Replicated** — snapshots are replicated to a different pool (or pushed to a provider like S3/Google Drive/B2 via a **Cloud Sync Task**), i.e. genuine independent protection exists (if it's a different pool on the same physical machine, you're warned separately — that doesn't protect against losing the whole server/site). Cloud Sync Task OAuth tokens/credentials are never read, stored, or returned by the API — only the description, target provider, and last run status are used.
   - The "Data Backup" section shows **real physical disks** (TrueNAS pool topology + `/api/v2.0/disk`), not ZFS pools. If a pool is striped across multiple disks (no redundancy), those disks are listed as separate cards — each one independently threatens ALL of the pool's data. For mirror/RAIDZ member disks, losing one disk only degrades the array without losing data; this distinction is shown with a badge. Whether a disk is used as a backup target for another pool (e.g. "backup target for pool X") is also noted.
   - The eye icon on each disk card lets you **temporarily exclude** that disk/pool from the Recovery Score calculation (e.g. so a backup-target disk's own "protection ratio" doesn't skew the score for the actual data). The same eye icon exists on every **dataset** row — e.g. you can exclude a TimeMachine backup or another tool's already-backed-up output with "why would I back this up too". Excluded items are shown dimmed; the disk card's total size ("if it fails: X GB") doesn't change, only the protection-ratio calculation stops counting that data.
4. **External Backup Jobs (Restic/Borg/rsync)**: for backup tools TrueNAS can't see, the app doesn't connect to a central API — instead it checks the last-modified time of a **marker file** the job updates on every successful run. When registering a job you enter: the path it covers (e.g. `/mnt/pool3`), the marker file's full path, and the expected run frequency (in hours). The marker is flagged "stale" if it's older than the expected frequency with a 50% tolerance, or "no marker" if it can't be found at all. This method was deliberately kept safe — the app never runs any command, it only reads a file.
   - Just add a step like `touch /path/to/marker` at the end of your Restic/Borg/rsync job.
5. **Recovery Score**: a score at the top of the dashboard computed from four categories (25 points each) — disk concentration risk, snapshot coverage, replication independence, external backup freshness. The replication category stays at 0 if TrueNAS isn't connected, and the external backup category stays at 0 if no job is registered.
6. **System Disk**: TrueNAS's boot/OS disk (`/api/v2.0/boot/get_state`) — never appears in the list of normal data pools, so it's shown with a separate purple badge. Since it isn't a ZFS dataset, Snapshot/Replication Task logic doesn't apply to it; it's excluded from the Recovery Score and exists purely for visibility and as a reminder of TrueNAS's own "Save Config" feature.

## Creating a TrueNAS API key

In the TrueNAS UI: **Credentials → API Keys → Add**. A read-only key is recommended (use the scoped/read-only option if available). The key is stored in plain text in the app's own SQLite database — same trust boundary as access to the Docker socket, only run this in environments you trust.

## Development

```bash
npm install
npm run dev
```

Opens at `http://localhost:3000`. Use the `DOCKER_SOCKET` env variable to point at a different socket/TCP address (defaults to `unix:///var/run/docker.sock`). State is kept as SQLite in `data/homelab-disaster-sim.db`.

## Self-host (Docker)

```bash
docker compose up -d --build
```

`docker-compose.yml` mounts the host's Docker socket into the container read-only — this is required for the app to work, only run it in environments you trust.

For the app to read external backup jobs' marker files, the host path where those files live (e.g. `/mnt`) must also be mounted into the container read-only at the **same path** — this is already enabled by default in `docker-compose.yml`. Whatever absolute path the marker file is at on the host, enter that same absolute path when registering the job (not the path inside the container).

## Limitations (deliberate MVP decisions)

- Single-host only — doesn't manage multiple nodes on one dashboard.
- Only sees running containers, doesn't count stopped ones.
- CPU usage is based on a point-in-time `docker stats` sample; no continuous monitoring or historical graphs.
- External backup verification only checks marker file freshness — it doesn't verify that the job actually completed successfully or that the backup is intact (this corresponds to the doc's "restore test" goal, not yet implemented).
- Never actually stops/moves/restores anything — it's purely an "on-paper" calculator.
