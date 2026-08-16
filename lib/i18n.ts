export type Locale = "tr" | "en";

/** Skor/backup motorlarının ürettiği, henüz bir dile biçimlendirilmemiş yapılandırılmış mesaj. */
export type Msg = { key: string; params?: Record<string, string | number> };

export function msg(key: string, params?: Record<string, string | number>): Msg {
  return { key, params };
}

const dict: Record<Locale, Record<string, string>> = {
  tr: {
    "app.title": "HomeLab Disaster Simulator",
    "app.lastUpdate": "Son güncelleme: {{time}}",
    "app.neverUpdated": "Henüz veri çekilmedi",
    "app.loading": "Yükleniyor...",

    "nav.overview": "Genel Bakış",
    "nav.diskScenarios": "Disk Senaryoları",
    "nav.dataBackup": "Veri Yedekleme",
    "nav.externalJobs": "Harici Backup Job'ları",
    "nav.containers": "Konteynerler",
    "nav.settings": "Ayarlar",

    "topbar.refresh": "Yenile",
    "topbar.refreshing": "Taranıyor...",

    "settings.title": "TrueNAS API Bağlantısı (opsiyonel)",
    "settings.description":
      "Periodic Snapshot Task'ları ve Replication Task'ları okuyarak backup analizini etkinleştirir. Salt-okunur bir API key kullanman önerilir.",
    "settings.apiUrl": "API adresi",
    "settings.apiKey": "API key",
    "settings.apiKeySet": "•••••••• (değiştirmek için gir)",
    "settings.save": "Kaydet",
    "settings.cancel": "Vazgeç",
    "settings.lastError": "Son hata: {{error}}",

    "empty.title": "Henüz veri yok",
    "empty.desc": "Bu uygulama kurulu olduğu makinenin Docker'ını izler. Başlamak için \"Yenile\"ye bas.",

    "score.title": "Recovery Score",
    "score.category.diskConcentration": "Disk yoğunlaşma riski",
    "score.category.snapshotCoverage": "Snapshot kapsamı",
    "score.category.replicationIndependence": "Replikasyon bağımsızlığı",
    "score.category.externalFreshness": "Harici backup tazeliği",
    "score.issuesTitle": "Kritik sorunlar",
    "score.showMore": "+{{count}} tane daha göster",
    "score.showLess": "Daha az göster",

    "system.title": "Sistem",
    "system.summary": "{{ram}} RAM · {{cores}} core · {{count}} konteyner çalışıyor",

    "diskScenarios.title": "Disk / Mount Senaryoları",
    "diskScenarios.desc":
      "Konteynerlerin gerçek bind mount'larından otomatik tespit edildi. Bir gruba tıklayınca o disk/dataset çökerse hangi konteynerlerin etkileneceğini ve backup durumunu görürsün.",
    "diskScenarios.none": "Bind mount kullanan konteyner bulunamadı.",
    "diskScenarios.affected": "— {{count}} konteyner etkilenir",
    "diskScenarios.affectedServices": "Bu disk çökerse etkilenen servisler",
    "diskScenarios.noMatch": "Eşleşen bir snapshot/replication task bulunamadı.",
    "diskScenarios.snapshotInfo": "Snapshot: {{schedule}} · saklama {{value}} {{unit}} · son: {{last}}",
    "diskScenarios.replicationInfo": "Replikasyon: {{name}} → {{target}} ({{transport}})",
    "diskScenarios.cloudSyncInfo": "Cloud Sync: {{desc}} ({{provider}}) — {{state}}",

    "badge.replicated": "Replicated",
    "badge.snapshotOnly": "Sadece snapshot",
    "badge.none": "Backup yok",
    "badge.excluded": "Hesaplama dışı",
    "badge.fresh": "Taze",
    "badge.stale": "Bayat",
    "badge.markerMissing": "Marker yok",
    "badge.neverRan": "hiç çalışmadı",

    "dataBackup.title": "Veri Yedekleme",
    "dataBackup.desc":
      "Fiziksel disklere göre gruplandı. ZFS bir pool'u birden fazla diske stripe edebilir — bu durumda disklerden HERHANGİ biri kaybedilirse pool'un tamamı gider (mirror/RAIDZ üyeleri bunun dışında, onlarda tek disk kaybı sadece degrade eder).",
    "dataBackup.notConfigured": "TrueNAS API bağlı değil. Sol menüdeki Ayarlar'dan bağlantı kurabilirsin.",
    "dataBackup.none": "Fiziksel disk bulunamadı.",
    "dataBackup.affected": "— çökerse {{count}} servis etkilenir",
    "dataBackup.bootDisk": "Sistem Diski (TrueNAS OS + config)",
    "dataBackup.bootDiskDesc":
      "Bu disk TrueNAS'ın işletim sistemini ve sistem ayarlarını (kullanıcılar, ağ, servis tanımları) tutar — normal ZFS dataset'leri yok, bu yüzden Snapshot/Replication Task'ları buraya uygulanmaz. Kaybedilirse TrueNAS'ı sıfırdan kurup bir config dosyasından geri yüklemen gerekir. Sistem > Genel Ayarlar > \"Save Config\" ile periyodik olarak indirip başka bir yerde saklamanı öneririz.",
    "dataBackup.backupTarget": "{{pools}} pool'unun yedek hedefi",
    "dataBackup.redundant": "{{vdev}} üyesi — tek disk kaybı degrade eder",
    "dataBackup.noRedundancy": "Redundancy yok — tek disk pool'u götürür",
    "dataBackup.protected": "%{{percent}} korunuyor",
    "dataBackup.includeToggle": "Hesaplamaya dahil et",
    "dataBackup.excludeToggle": "Hesaplamadan çıkar",
    "dataBackup.excludeDatasetToggle": "Hesaplamadan çıkar (ör. zaten bir yedek)",
    "dataBackup.datasetServices": "· {{count}} servis",
    "dataBackup.noContainers": "Hiçbir konteyner bu dataset'i kullanmıyor.",

    "externalJobs.title": "Harici Backup Job'ları (Restic/Borg/rsync)",
    "externalJobs.desc":
      "TrueNAS API'sinin göremediği backup'lar için: job'ın çalıştığında güncellediği bir marker dosyanın son değiştirilme zamanına bakarak tazeliği doğrular. Uygulamanın bu dosyayı görebilmesi için ilgili yolun container'a mount edilmiş olması gerekir.",
    "externalJobs.add": "Job Ekle",
    "externalJobs.name": "İsim",
    "externalJobs.namePlaceholder": "Örn. Medya restic backup",
    "externalJobs.tool": "Araç",
    "externalJobs.pathPrefix": "Kapsadığı yol",
    "externalJobs.intervalHours": "Beklenen sıklık (saat)",
    "externalJobs.markerPath": "Marker dosya yolu",
    "externalJobs.save": "Kaydet",
    "externalJobs.cancel": "Vazgeç",
    "externalJobs.none": "Henüz job kaydedilmedi.",
    "externalJobs.delete": "Sil",
    "externalJobs.ageHours": "· {{hours}}sa önce",

    "containers.title": "Konteynerler",
    "containers.colName": "Konteyner",
    "containers.colDisk": "Fiziksel Disk",
    "containers.colDataset": "Dataset",
    "containers.colStats": "RAM / CPU",

    "schedule.hourly": "saatte bir (dakika: {{minute}})",
    "schedule.daily": "her gün {{time}}",

    "msg.diskConcentration.affected": "{{path}} çökerse çalışan konteynerlerin %{{percent}}'i ({{affected}}/{{total}}) etkilenir.",
    "msg.diskConcentration.noContainers": "Bind mount kullanan konteyner bulunamadı.",
    "msg.diskConcentration.note": "En kritik disk: {{path}} ({{count}} konteyner).",

    "msg.snapshotCoverage.noData": "TrueNAS'ta veri içeren dataset bulunamadı.",
    "msg.snapshotCoverage.missing": "{{dataset}} ({{gb}}) için hiçbir snapshot/backup bulunamadı.",
    "msg.snapshotCoverage.note": "Toplam verinin %{{percent}}'i ({{covered}} / {{total}}) en az bir snapshot task'ı ile korunuyor.",

    "msg.replication.notConfiguredNote": "TrueNAS API bağlı değil — backup'ların gerçekten bağımsız olup olmadığı bilinmiyor.",
    "msg.replication.notConfiguredIssue":
      "TrueNAS API bağlantısı yapılandırılmadı. Bir backup'ın var olması onu geri yüklenebilir/bağımsız yapmaz — bu bağlanmadan doğrulanamaz.",
    "msg.replication.noData": "TrueNAS'ta veri içeren dataset bulunamadı.",
    "msg.replication.sameHostOnly":
      "{{dataset}} ({{gb}}) başka bir pool'a replicate ediliyor ama aynı fiziksel makinede — tüm sunucu/site kaybına karşı korumuyor.",
    "msg.replication.snapshotOnly":
      "{{dataset}} ({{gb}}) sadece aynı disk üzerinde snapshot alıyor — disk çökerse snapshot da gider, replikasyon yok.",
    "msg.replication.note": "Toplam verinin %{{percent}}'i ({{independent}} / {{total}}) farklı bir pool'a replicate ediliyor.",

    "msg.externalFreshness.allCovered": "Tüm veri zaten TrueNAS replikasyonuyla bağımsız korunuyor.",
    "msg.externalFreshness.noJobsNote": "Hiçbir restic/borg/rsync job'ı kayıtlı değil.",
    "msg.externalFreshness.noJobsIssue": "TrueNAS replikasyonuyla korunmayan {{gb}} veri için harici backup job'ı kaydedilmedi.",
    "msg.externalFreshness.stale": "{{dataset}} ({{gb}}) için \"{{jobName}}\" backup'ı bayatlamış ({{days}} gün önce).",
    "msg.externalFreshness.missing": "{{dataset}} ({{gb}}) için \"{{jobName}}\" marker dosyası bulunamadı.",
    "msg.externalFreshness.uncovered": "{{dataset}} ({{gb}}) TrueNAS replikasyonuyla korunmuyor ve hiçbir harici backup job'ı da kapsamıyor.",
    "msg.externalFreshness.note": "TrueNAS ile korunmayan verinin %{{percent}}'i ({{covered}} / {{total}}) taze bir harici backup ile kapsanıyor.",
  },
  en: {
    "app.title": "HomeLab Disaster Simulator",
    "app.lastUpdate": "Last updated: {{time}}",
    "app.neverUpdated": "No data fetched yet",
    "app.loading": "Loading...",

    "nav.overview": "Overview",
    "nav.diskScenarios": "Disk Scenarios",
    "nav.dataBackup": "Data Backup",
    "nav.externalJobs": "External Backup Jobs",
    "nav.containers": "Containers",
    "nav.settings": "Settings",

    "topbar.refresh": "Refresh",
    "topbar.refreshing": "Scanning...",

    "settings.title": "TrueNAS API Connection (optional)",
    "settings.description":
      "Reads Periodic Snapshot Tasks and Replication Tasks to enable backup analysis. A read-only API key is recommended.",
    "settings.apiUrl": "API address",
    "settings.apiKey": "API key",
    "settings.apiKeySet": "•••••••• (enter to change)",
    "settings.save": "Save",
    "settings.cancel": "Cancel",
    "settings.lastError": "Last error: {{error}}",

    "empty.title": "No data yet",
    "empty.desc": "This app watches the Docker daemon of the machine it's installed on. Hit \"Refresh\" to start.",

    "score.title": "Recovery Score",
    "score.category.diskConcentration": "Disk concentration risk",
    "score.category.snapshotCoverage": "Snapshot coverage",
    "score.category.replicationIndependence": "Replication independence",
    "score.category.externalFreshness": "External backup freshness",
    "score.issuesTitle": "Critical issues",
    "score.showMore": "+{{count}} more",
    "score.showLess": "Show less",

    "system.title": "System",
    "system.summary": "{{ram}} RAM · {{cores}} cores · {{count}} containers running",

    "diskScenarios.title": "Disk / Mount Scenarios",
    "diskScenarios.desc":
      "Automatically detected from containers' real bind mounts. Click a group to see which containers would be affected if that disk/dataset fails, and its backup status.",
    "diskScenarios.none": "No containers using bind mounts found.",
    "diskScenarios.affected": "— {{count}} containers affected",
    "diskScenarios.affectedServices": "Services affected if this disk fails",
    "diskScenarios.noMatch": "No matching snapshot/replication task found.",
    "diskScenarios.snapshotInfo": "Snapshot: {{schedule}} · retention {{value}} {{unit}} · last: {{last}}",
    "diskScenarios.replicationInfo": "Replication: {{name}} → {{target}} ({{transport}})",
    "diskScenarios.cloudSyncInfo": "Cloud Sync: {{desc}} ({{provider}}) — {{state}}",

    "badge.replicated": "Replicated",
    "badge.snapshotOnly": "Snapshot only",
    "badge.none": "No backup",
    "badge.excluded": "Excluded",
    "badge.fresh": "Fresh",
    "badge.stale": "Stale",
    "badge.markerMissing": "No marker",
    "badge.neverRan": "never ran",

    "dataBackup.title": "Data Backup",
    "dataBackup.desc":
      "Grouped by physical disk. ZFS can stripe a pool across multiple disks — in that case losing ANY one of them takes down the whole pool (mirror/RAIDZ members are the exception: losing one only degrades them).",
    "dataBackup.notConfigured": "TrueNAS API not connected. Connect it from Settings in the sidebar.",
    "dataBackup.none": "No physical disks found.",
    "dataBackup.affected": "— {{count}} services affected if it fails",
    "dataBackup.bootDisk": "System Disk (TrueNAS OS + config)",
    "dataBackup.bootDiskDesc":
      "This disk holds TrueNAS's operating system and system settings (users, network, service definitions) — it has no normal ZFS datasets, so Snapshot/Replication Tasks don't apply here. If lost, you'll need to reinstall TrueNAS from scratch and restore from a config file. We recommend periodically downloading one via System > General > \"Save Config\" and storing it elsewhere.",
    "dataBackup.backupTarget": "backup target for {{pools}}",
    "dataBackup.redundant": "{{vdev}} member — losing one disk only degrades it",
    "dataBackup.noRedundancy": "No redundancy — losing this disk takes the whole pool",
    "dataBackup.protected": "{{percent}}% protected",
    "dataBackup.includeToggle": "Include in calculation",
    "dataBackup.excludeToggle": "Exclude from calculation",
    "dataBackup.excludeDatasetToggle": "Exclude from calculation (e.g. already a backup)",
    "dataBackup.datasetServices": "· {{count}} services",
    "dataBackup.noContainers": "No container uses this dataset.",

    "externalJobs.title": "External Backup Jobs (Restic/Borg/rsync)",
    "externalJobs.desc":
      "For backups the TrueNAS API can't see: freshness is verified by checking the last-modified time of a marker file the job updates on each run. The app must have that path mounted to see it.",
    "externalJobs.add": "Add Job",
    "externalJobs.name": "Name",
    "externalJobs.namePlaceholder": "e.g. Media restic backup",
    "externalJobs.tool": "Tool",
    "externalJobs.pathPrefix": "Covered path",
    "externalJobs.intervalHours": "Expected interval (hours)",
    "externalJobs.markerPath": "Marker file path",
    "externalJobs.save": "Save",
    "externalJobs.cancel": "Cancel",
    "externalJobs.none": "No jobs registered yet.",
    "externalJobs.delete": "Delete",
    "externalJobs.ageHours": "· {{hours}}h ago",

    "containers.title": "Containers",
    "containers.colName": "Container",
    "containers.colDisk": "Physical Disk",
    "containers.colDataset": "Dataset",
    "containers.colStats": "RAM / CPU",

    "schedule.hourly": "hourly (minute: {{minute}})",
    "schedule.daily": "daily {{time}}",

    "msg.diskConcentration.affected": "If {{path}} fails, {{percent}}% of running containers ({{affected}}/{{total}}) are affected.",
    "msg.diskConcentration.noContainers": "No containers using bind mounts found.",
    "msg.diskConcentration.note": "Most critical disk: {{path}} ({{count}} containers).",

    "msg.snapshotCoverage.noData": "No datasets with data found on TrueNAS.",
    "msg.snapshotCoverage.missing": "No snapshot/backup found for {{dataset}} ({{gb}}).",
    "msg.snapshotCoverage.note": "{{percent}}% of total data ({{covered}} / {{total}}) is covered by at least one snapshot task.",

    "msg.replication.notConfiguredNote": "TrueNAS API not connected — whether backups are truly independent is unknown.",
    "msg.replication.notConfiguredIssue":
      "TrueNAS API connection isn't configured. A backup existing doesn't make it restorable/independent — this can't be verified without connecting.",
    "msg.replication.noData": "No datasets with data found on TrueNAS.",
    "msg.replication.sameHostOnly":
      "{{dataset}} ({{gb}}) is replicated to another pool but on the same physical machine — doesn't protect against losing the whole server/site.",
    "msg.replication.snapshotOnly":
      "{{dataset}} ({{gb}}) is only snapshotted on the same disk — if the disk fails the snapshot goes with it, no replication.",
    "msg.replication.note": "{{percent}}% of total data ({{independent}} / {{total}}) is replicated to a different pool.",

    "msg.externalFreshness.allCovered": "All data is already independently protected via TrueNAS replication.",
    "msg.externalFreshness.noJobsNote": "No restic/borg/rsync job registered.",
    "msg.externalFreshness.noJobsIssue": "No external backup job registered for {{gb}} of data not covered by TrueNAS replication.",
    "msg.externalFreshness.stale": "The \"{{jobName}}\" backup for {{dataset}} ({{gb}}) is stale ({{days}} days ago).",
    "msg.externalFreshness.missing": "Marker file for \"{{jobName}}\" not found for {{dataset}} ({{gb}}).",
    "msg.externalFreshness.uncovered": "{{dataset}} ({{gb}}) isn't covered by TrueNAS replication or any external backup job.",
    "msg.externalFreshness.note": "{{percent}}% of data not covered by TrueNAS ({{covered}} / {{total}}) is covered by a fresh external backup.",
  },
};

export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const template = dict[locale][key] ?? key;
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => String(params[name] ?? ""));
}

export function tm(locale: Locale, m: Msg | null | undefined): string {
  if (!m) return "";
  return t(locale, m.key, m.params);
}
