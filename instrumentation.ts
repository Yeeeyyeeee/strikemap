export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Validate critical environment variables on startup
  const required = [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "CRON_SECRET",
    "TELEGRAM_BOT_TOKEN",
    "NEXT_PUBLIC_MAPBOX_TOKEN",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.warn(`[startup] Missing env vars: ${missing.join(", ")}`);
  }

  // In-process cron only for self-hosted (Docker) deployments
  // Vercel uses vercel.json cron config instead
  if (
    process.env.NODE_ENV === "production" &&
    process.env.SELF_HOSTED === "true"
  ) {
    const { startCronJobs } = await import("@/lib/cron");
    startCronJobs();
  }
}
