"use client";

import React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, ArrowLeft, Zap, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [submittedEmail, setSubmittedEmail] = React.useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormValues) {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 300));
    setSubmittedEmail(data.email);
    setIsLoading(false);
    setSubmitted(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-brand-500/5 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 h-64 w-64 rounded-full bg-violet-500/5 blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-foreground">CrossTecch</span>
        </div>

        <div className="rounded-2xl border border-border bg-white dark:bg-[#0e0f1a] shadow-card p-8">
          <AnimatePresence mode="wait">
            {!submitted ? (
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-950/40 mb-6">
                  <Mail className="h-6 w-6 text-brand-600 dark:text-brand-400" />
                </div>

                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Forgot your password?
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  No worries — we&apos;ll send a reset link to your email address.
                </p>

                <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email address</Label>
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

                  <Button type="submit" className="w-full h-10" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending link...
                      </>
                    ) : (
                      "Send reset link"
                    )}
                  </Button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                  className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 mx-auto mb-6"
                >
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </motion.div>

                <h2 className="text-xl font-bold text-foreground">Check your email</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  We&apos;ve sent a password reset link to{" "}
                  <span className="font-medium text-foreground">{submittedEmail}</span>
                </p>

                <div className="mt-6 rounded-xl bg-muted/50 p-4 text-left">
                  <p className="text-xs text-muted-foreground">
                    Didn&apos;t receive the email? Check your spam folder, or{" "}
                    <button
                      onClick={() => setSubmitted(false)}
                      className="text-brand-600 hover:text-brand-700 font-medium"
                    >
                      try a different email address
                    </button>
                    .
                  </p>
                </div>

                <p className="mt-4 text-xs text-muted-foreground">
                  The link expires in 24 hours for security reasons.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-6 text-center">
          <Link
            href={ROUTES.LOGIN}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
