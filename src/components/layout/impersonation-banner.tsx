"use client";

/**
 * ImpersonationBanner
 *
 * Shown at the very top of every page when the admin is working as a client.
 * Detects impersonation by checking for the ct_admin_session cookie (readable
 * client-side because it is NOT httpOnly — we need a flag cookie for this).
 *
 * Architecture:
 *  - We can't read httpOnly cookies in JS, so we use a separate non-httpOnly
 *    flag cookie "ct_impersonating" that just stores the client's name/email
 *    (no secret, no token — just display info).
 *  - The actual session swap uses httpOnly cookies (secure).
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Eye, LogOut, User } from "lucide-react";

interface ImpersonationInfo {
  email: string;
  name: string | null;
}

function readImpersonationCookie(): ImpersonationInfo | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)ct_impersonating=([^;]*)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function ImpersonationBanner() {
  const router = useRouter();
  const [info, setInfo]     = useState<ImpersonationInfo | null>(null);
  const [exiting, setExiting] = useState(false);

  // Poll the cookie every second (cookie changes don't fire events)
  useEffect(() => {
    setInfo(readImpersonationCookie());
    const timer = setInterval(() => setInfo(readImpersonationCookie()), 1000);
    return () => clearInterval(timer);
  }, []);

  const exit = useCallback(async () => {
    setExiting(true);
    try {
      await fetch("/api/admin/impersonate/exit", { method: "POST" });
      // Clear display cookie
      document.cookie = "ct_impersonating=; path=/; max-age=0";
      router.push("/admin");
      router.refresh();
    } finally {
      setExiting(false);
    }
  }, [router]);

  if (!info) return null;

  return (
    <div className="relative z-[100] flex items-center justify-between gap-4 bg-amber-500 px-4 py-2 text-white shadow-md">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Eye className="h-4 w-4 shrink-0" />
        <span>
          Working as client:{" "}
          <strong>{info.name ?? info.email}</strong>
          <span className="ml-1 font-normal opacity-80">({info.email})</span>
        </span>
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
          Any flows/connectors you create will belong to this client
        </span>
      </div>
      <button
        onClick={exit}
        disabled={exiting}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/30 transition-colors disabled:opacity-60"
      >
        <LogOut className="h-3.5 w-3.5" />
        {exiting ? "Exiting…" : "Exit — Back to Admin"}
      </button>
    </div>
  );
}
