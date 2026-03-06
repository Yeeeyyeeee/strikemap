/**
 * In-process cron scheduler for self-hosted deployments.
 * Replaces Vercel cron jobs with setInterval-based scheduling.
 * Started once on server boot via instrumentation.ts.
 */

const CRON_JOBS = [
  { route: "/api/broadcast", intervalMs: 1 * 60 * 1000, name: "broadcast" },
  { route: "/api/cron", intervalMs: 2 * 60 * 1000, name: "cron" },
  { route: "/api/tracking/vessels/cron", intervalMs: 2 * 60 * 1000, name: "vessels-cron" },
  { route: "/api/satellite/cron", intervalMs: 10 * 60 * 1000, name: "satellite-cron" },
];

const timers: NodeJS.Timeout[] = [];

async function runJob(route: string, name: string) {
  const secret = process.env.CRON_SECRET;
  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  try {
    const res = await fetch(`${baseUrl}${route}`, {
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      signal: AbortSignal.timeout(55000),
    });
    console.log(`[cron] ${name} → ${res.status}`);
  } catch (err) {
    console.error(`[cron] ${name} failed:`, err instanceof Error ? err.message : err);
  }
}

export function startCronJobs() {
  console.log("[cron] Starting in-process cron scheduler");
  for (const job of CRON_JOBS) {
    // Stagger initial runs so they don't all fire at once
    const initialDelay = Math.random() * 10000 + 5000;
    setTimeout(() => {
      runJob(job.route, job.name);
      const timer = setInterval(() => runJob(job.route, job.name), job.intervalMs);
      timers.push(timer);
    }, initialDelay);
  }
}

export function stopCronJobs() {
  for (const timer of timers) clearInterval(timer);
  timers.length = 0;
}
