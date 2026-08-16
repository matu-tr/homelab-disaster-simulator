import { NextRequest, NextResponse } from "next/server";
import { deleteExternalBackup } from "@/lib/db";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  deleteExternalBackup(id);
  return NextResponse.json({ ok: true });
}
