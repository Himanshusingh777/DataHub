import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const envs = db.prepare(`
    SELECT e.id, e.name, e.slug, e.color,
           COUNT(s.id) AS secretCount,
           datetime(e.created_at / 1000, 'unixepoch') AS createdAt
    FROM environments e
    LEFT JOIN secrets s ON s.env_id = e.id AND s.workspace_id = ?
    WHERE e.workspace_id = ?
    GROUP BY e.id
    ORDER BY e.created_at ASC
  `).all(workspaceId, workspaceId);

  // Seed default environments for this workspace if empty
  if ((envs as unknown[]).length === 0) {
    const defaults = [
      { name: "Development", slug: "dev",     color: "#22C55E" },
      { name: "Staging",     slug: "staging", color: "#F59E0B" },
      { name: "Production",  slug: "prod",    color: "#EF4444" },
    ];
    for (const d of defaults) {
      db.prepare(`
        INSERT OR IGNORE INTO environments (id, workspace_id, name, slug, color, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), workspaceId, d.name, d.slug, d.color, Date.now());
    }
    const refetched = db.prepare(`
      SELECT e.id, e.name, e.slug, e.color, 0 AS secretCount,
             datetime(e.created_at / 1000, 'unixepoch') AS createdAt
      FROM environments e
      WHERE e.workspace_id = ?
      ORDER BY e.created_at ASC
    `).all(workspaceId);
    return NextResponse.json({ environments: refetched });
  }

  return NextResponse.json({ environments: envs });
}

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { name?: string; color?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const db = getDb();
  const id = randomUUID();
  const slug = body.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
  db.prepare(`
    INSERT INTO environments (id, workspace_id, name, slug, color, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, workspaceId, body.name.trim(), slug, body.color ?? "#6366F1", Date.now());

  const env = db.prepare("SELECT * FROM environments WHERE id = ?").get(id);
  return NextResponse.json({ environment: env });
}
