/**
 * Next.js instrumentation — runs once when the server boots.
 * Starts the background sync scheduler and the job worker pool (Node runtime
 * only — this hook also fires in the Edge runtime, which can't touch SQLite).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/server/scheduler");
    const { startWorkers } = await import("@/lib/server/worker");
    startScheduler();
    // CT_JOB_CONCURRENCY lets an operator tune parallelism per deployment
    // without a code change — defaults to 3 concurrent workers.
    const concurrency = Number(process.env.CT_JOB_CONCURRENCY) || 3;
    startWorkers(concurrency);
  }
}
