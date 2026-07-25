"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import {
  Eye,
  EyeOff,
  Zap,
  ArrowRight,
  Plug,
  GitBranch,
  BarChart3,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/auth.store";
import { ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type FormValues = z.infer<typeof schema>;

const FEATURES = [
  { icon: Plug, label: "40+ data connectors", desc: "Shopify, Stripe, Meta Ads, HubSpot, and more" },
  { icon: GitBranch, label: "Automated data flows", desc: "Source → destination, no code required" },
  { icon: BarChart3, label: "Full sync visibility", desc: "Every run, row count, and error in one place" },
];

const LOGOS = ["Shopify", "Stripe", "HubSpot", "BigQuery", "Snowflake", "PostgreSQL"];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const [showPassword, setShowPassword] = React.useState(false);
  const [loginError, setLoginError] = React.useState("");
  const [rememberMe, setRememberMe] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormValues) {
    setLoginError("");
    const success = await login(data.email, data.password);
    if (success) {
      router.push(ROUTES.DASHBOARD);
    } else {
      setLoginError("Invalid email or password. Please try again.");
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Left panel ── */}
      <div className="relative hidden lg:flex lg:w-[52%] flex-col bg-[#0e0f1a] overflow-hidden">
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(90deg, #6366f1 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Glow blobs */}
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand-600/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-violet-600/15 blur-[100px]" />

        <div className="relative flex flex-col h-full p-10">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">CrossTecch</span>
          </div>

          <div className="flex-1 flex flex-col justify-center max-w-md">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.div variants={itemVariants}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
                  Now in production
                </span>
              </motion.div>

              <motion.h2
                variants={itemVariants}
                className="mt-5 text-3xl font-bold leading-tight text-white"
              >
                Your data, finally
                <br />
                <span className="text-brand-400">working together.</span>
              </motion.h2>

              <motion.p variants={itemVariants} className="mt-3 text-base text-white/50 leading-relaxed">
                Connect every data source, build reliable pipelines, and
                surface insights — all from one intelligent platform.
              </motion.p>

              <motion.div variants={containerVariants} className="mt-8 space-y-4">
                {FEATURES.map((f) => (
                  <motion.div
                    key={f.label}
                    variants={itemVariants}
                    className="flex items-start gap-3"
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600/20 border border-brand-500/20">
                      <f.icon className="h-4 w-4 text-brand-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{f.label}</p>
                      <p className="text-xs text-white/40 mt-0.5">{f.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          </div>

          {/* Connector logos */}
          <div className="mt-auto">
            <p className="text-xs text-white/30 mb-3 uppercase tracking-wider font-medium">
              Connect to
            </p>
            <div className="flex flex-wrap gap-2">
              {LOGOS.map((logo) => (
                <span
                  key={logo}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/50 backdrop-blur"
                >
                  {logo}
                </span>
              ))}
              <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/50">
                +34 more
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-white dark:bg-[#070810]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-sm"
        >
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 mb-8 justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-bold text-foreground">CrossTecch</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Welcome back
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Sign in to continue to your workspace
            </p>
          </div>

          {/* Social login buttons */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {["Google", "GitHub"].map((provider) => (
              <button
                key={provider}
                disabled
                title="Coming soon"
                className="flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background text-sm font-medium text-muted-foreground shadow-sm cursor-not-allowed opacity-50"
              >
                {provider === "Google" ? (
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                )}
                {provider}
              </button>
            ))}
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-muted-foreground dark:bg-[#070810]">
                or sign in with email
              </span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                className={cn(errors.email && "border-rose-400 focus-visible:ring-rose-400")}
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-rose-500">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href={ROUTES.FORGOT_PASSWORD}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={cn(
                    "pr-10",
                    errors.password && "border-rose-400 focus-visible:ring-rose-400"
                  )}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-rose-500">{errors.password.message}</p>
              )}
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={rememberMe}
                onClick={() => setRememberMe(v => !v)}
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                  rememberMe
                    ? "border-brand-600 bg-brand-600"
                    : "border-border bg-transparent hover:border-brand-400"
                )}
              >
                {rememberMe && (
                  <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3">
                    <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <label
                onClick={() => setRememberMe(v => !v)}
                className="text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
              >
                Remember me for 30 days
              </label>
            </div>

            {loginError && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 rounded-lg px-3 py-2"
              >
                {loginError}
              </motion.p>
            )}

            <Button
              type="submit"
              className="w-full h-10 gap-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href={ROUTES.REGISTER}
              className="font-medium text-brand-600 hover:text-brand-700"
            >
              Start for free
            </Link>
          </p>

          {/* Trust badges */}
          <div className="mt-8 flex items-center justify-center gap-4">
            {["SOC 2 Type II", "GDPR", "99.9% Uptime"].map((badge) => (
              <div key={badge} className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                {badge}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
