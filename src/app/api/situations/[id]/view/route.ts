import { NextResponse } from "next/server";

// SituationView table dropped — view tracking is no longer server-side.
export async function POST() {
  return NextResponse.json({ ok: true });
}
