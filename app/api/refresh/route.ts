import { NextResponse } from "next/server";
import { getLocalState, saveError, saveSnapshot, saveTrueNasBackupData, saveTrueNasError } from "@/lib/db";
import { collectHostSnapshot } from "@/lib/docker";
import { collectTrueNasBackupData } from "@/lib/truenas";

const DOCKER_SOCKET = process.env.DOCKER_SOCKET || "unix:///var/run/docker.sock";

export async function POST() {
  const state = getLocalState();

  if (state.truenasApiUrl && state.truenasApiKey) {
    try {
      const backupData = await collectTrueNasBackupData(state.truenasApiUrl, state.truenasApiKey);
      saveTrueNasBackupData(JSON.stringify(backupData));
    } catch (err) {
      saveTrueNasError(err instanceof Error ? err.message : "TrueNAS API hatası");
    }
  }

  try {
    const snapshot = await collectHostSnapshot(DOCKER_SOCKET);
    saveSnapshot(JSON.stringify(snapshot));
    return NextResponse.json({ ok: true, snapshot });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    saveError(message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
