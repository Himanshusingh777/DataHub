"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";

// Helper: derive initials from a full name
function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Helper: derive a display name from an email if no name provided
function nameFromEmail(email: string) {
  const local = email.split("@")[0];
  return local!
    .replace(/[._-]/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function buildUser(name: string, email: string, _company?: string): User {
  return {
    id: "u-" + Math.random().toString(36).slice(2),
    name,
    email,
    role: "admin",
    createdAt: new Date().toISOString(),
  };
}

const DEMO_USER: User = {
  id: "demo-user",
  name: "Demo User",
  email: "demo@crosstecch.io",
  role: "admin",
  createdAt: new Date().toISOString(),
};

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  /** True when user entered via "Start for Free" or "Explore Demo" without registering */
  isDemoMode: boolean;
  isLoading: boolean;
  /** @deprecated — never store passwords client-side. Kept as readonly empty array for backwards compat. */
  registeredUsers: Array<{ email: string; user: User }>;

  setUser: (user: User) => void;
  setToken: (token: string) => void;
  login: (email: string, password: string) => Promise<boolean>;
  register: (
    name: string,
    email: string,
    company: string,
    password: string
  ) => Promise<boolean>;
  /** Enter demo mode — no credentials required */
  enterDemoMode: () => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isDemoMode: false,
      isLoading: false,
      registeredUsers: [],

      setUser: (user) => set({ user, isAuthenticated: true }),
      setToken: (token) => set({ accessToken: token }),

      /** Open the demo workspace immediately — no credentials, no server */
      enterDemoMode: () =>
        set({
          user: DEMO_USER,
          accessToken: "demo-token",
          isAuthenticated: true,
          isDemoMode: true,
        }),

      register: async (name, email, company, password) => {
        set({ isLoading: true });

        // Real backend (SQLite + scrypt + httpOnly session cookie)
        try {
          const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, name }),
          });
          const json = await res.json();
          if (json.ok) {
            set({
              user: buildUser(name, email, company),
              accessToken: "session",
              isAuthenticated: true,
              isDemoMode: false,
              isLoading: false,
            });
            return true;
          }
          // 409 = email already registered
          set({ isLoading: false });
          return false;
        } catch {
          // Network error — do NOT fall back to localStorage auth
          set({ isLoading: false });
          return false;
        }
      },

      login: async (email, password) => {
        set({ isLoading: true });

        // Real backend — httpOnly session cookie is set by the server
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
          const json = await res.json();
          if (json.ok) {
            set({
              user: buildUser(json.user?.name ?? nameFromEmail(email), email),
              accessToken: "session",
              isAuthenticated: true,
              isDemoMode: false,
              isLoading: false,
            });
            return true;
          }
          // 401 = wrong password, 404 = user not found
          set({ isLoading: false });
          return false;
        } catch {
          // Network error — do NOT fall back to accepting any password
          set({ isLoading: false });
          return false;
        }
      },

      logout: () => {
        // Destroy the server session too (fire-and-forget)
        try { fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          isDemoMode: false,
        });
      },

      setLoading: (loading) => set({ isLoading: loading }),
    }),
    {
      name: "crosstecch-auth-v3",
      // SECURITY: Never persist passwords, tokens, or sensitive credentials.
      // registeredUsers is excluded. accessToken is excluded (session lives in
      // a server-set httpOnly cookie; the client only needs to know who is logged
      // in for display purposes, not hold any token).
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        isDemoMode: state.isDemoMode,
      }),
    }
  )
);
