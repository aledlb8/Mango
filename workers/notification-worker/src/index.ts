const intervalMs = Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS ?? 30_000);

console.log(`notification-worker started (interval: ${intervalMs}ms)`);

setInterval(() => {
  console.log(`[notification-worker] heartbeat ${new Date().toISOString()}`);
}, intervalMs);
