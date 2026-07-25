"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Eye, EyeOff, Zap, ArrowRight, CheckCircle2, Loader2, Mail } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/auth.store";
import { useFlowWizardStore } from "@/stores/flow-wizard.store";
import { ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

const schema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Enter a valid email"),
    company: z.string().min(1, "Company name is required"),
    password: z
      .string()
      .min(8, "Must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain at least one uppercase letter")
      .regex(/[0-9]/, "Must contain at least one number"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

const PLAN_FEATURES = [
  "Up to 5 connectors free",
  "1 GB data processing / month",
  "Community support",
  "No credit card required",
];

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", pass: password.length >= 8 },
    { label: "Uppercase", pass: /[A-Z]/.test(password) },
    { label: "Number", pass: /[0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.pass).length;
  const colors = ["bg-rose-400", "bg-amber-400", "bg-emerald-400", "bg-emerald-500"];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < score ? colors[score] : "bg-border"
            )}
          />
        ))}
      </div>
      <div className="flex gap-3">
        {checks.map((c) => (
          <span
            key={c.label}
            className={cn(
              "flex items-center gap-1 text-[10px]",
              c.pass ? "text-emerald-600" : "text-muted-foreground/60"
            )}
          >
            <CheckCircle2 className="h-3 w-3" />
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerUser, isLoading } = useAuthStore();
  const { startWizard } = useFlowWizardStore();
  const [showPassword, setShowPassword] = React.useState(false);
  const [verificationSent, setVerificationSent] = React.useState(false);
  const [registeredEmail, setRegisteredEmail] = React.useState("");

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const password = watch("password", "");

  async function onSubmit(data: FormValues) {
    const success = await registerUser(data.name, data.email, data.company, data.password);
    if (success) {
      setRegisteredEmail(data.email);
      setVerificationSent(true);
      // Brief delay to show verification notice, then redirect
      await new Promise(r => setTimeout(r, 2200));
      startWizard();
      router.push(ROUTES.DASHBOARD);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel */}
      <div className="relative hidden lg:flex lg:w-[44%] flex-col bg-[#0e0f1a] overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(90deg, #6366f1 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="absolute top-0 right-0 h-80 w-80 rounded-full bg-brand-600/15 blur-[100px]" />
        <div className="absolute bottom-0 left-0 h-64 w-64 rounded-full bg-violet-600/10 blur-[80px]" />

        <div className="relative flex flex-col h-full p-10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white">CrossTecch</span>
          </div>

          <div className="flex-1 flex flex-col justify-center max-w-sm">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <h2 className="text-3xl font-bold text-white leading-tight">
                Start your
                <br />
                <span className="text-brand-400">free account</span>
              </h2>
              <p className="mt-3 text-sm text-white/50">
                No credit card. No setup fees. Your first sync in under 3 minutes.
              </p>

              <div className="mt-8 space-y-3">
                {PLAN_FEATURES.map((f) => (
                  <div key={f} className="flex items-center gap-2.5">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20">
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    </div>
                    <span className="text-sm text-white/70">{f}</span>
                  </div>
                ))}
              </div>

              <div className="mt-10 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <p className="text-xs text-white/40 mb-3 uppercase tracking-wider font-medium">What you get on day one</p>
                <div className="grid grid-cols-1 gap-y-2">
                  {[
                    "Your first sync runs in under 3 minutes",
                    "No schema mapping — we auto-detect it",
                    "Full run history from the very first sync",
                    "Errors surface instantly with context",
                  ].map((c) => (
                    <span key={c} className="text-xs text-white/60 flex items-start gap-2">
                      <span className="text-brand-400 mt-0.5">✓</span>{c}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-white dark:bg-[#070810]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          <div className="flex lg:hidden items-center gap-2 mb-8 justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-bold">CrossTecch</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Free to start — no credit card required
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" placeholder="Alex Rivera" {...register("name")} className={cn(errors.name && "border-rose-400")} />
                {errors.name && <p className="text-xs text-rose-500">{errors.name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input id="email" type="email" placeholder="you@company.com" {...register("email")} className={cn(errors.email && "border-rose-400")} />
                {errors.email && <p className="text-xs text-rose-500">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="company">Company name</Label>
                <Input id="company" placeholder="Acme Corp" {...register("company")} className={cn(errors.company && "border-rose-400")} />
                {errors.company && <p className="text-xs text-rose-500">{errors.company.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a strong password"
                    className={cn("pr-10", errors.password && "border-rose-400")}
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-rose-500">{errors.password.message}</p>}
                <PasswordStrength password={password} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Repeat your password"
                  className={cn(errors.confirmPassword && "border-rose-400")}
                  {...register("confirmPassword")}
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-rose-500">{errors.confirmPassword.message}</p>
                )}
              </div>
            </div>

            <AnimatePresence>
              {verificationSent && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3"
                >
                  <Mail className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Check your email</p>
                    <p className="text-xs text-emerald-600/80 dark:text-emerald-500 mt-0.5">
                      A verification link was sent to <span className="font-medium">{registeredEmail}</span>. Redirecting you now…
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <Button type="submit" className="w-full h-10 gap-2 mt-2" disabled={isLoading || verificationSent}>
              {isLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Creating account...</>
              ) : verificationSent ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Redirecting…</>
              ) : (
                <>Create account<ArrowRight className="h-4 w-4" /></>
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground leading-relaxed">
              By creating an account, you agree to our{" "}
              <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">Terms</Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>.
            </p>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href={ROUTES.LOGIN} className="font-medium text-brand-600 hover:text-brand-700">
              Sign in
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
