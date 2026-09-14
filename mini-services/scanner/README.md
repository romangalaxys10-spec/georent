# Scanner mini-service (port 3030)
Real-time korter.ge poller: socket.io (path `/`, events `scan_status` + `new_matches`) and a REST router on the same HTTP server; polls 3 pages × 20 cards per city every 90s (backs off to 180s after 3 consecutive failures), upserts Listings, matches Alerts → NotificationRecords (deduped), recomputes DistrictStat p10/p25/p50 per district, emits to all socket clients.
Run: `cd mini-services/scanner && bun run dev` (supervisor starts this in production; deps resolve from the parent project's node_modules — no local install).
`GET /health` → `{ok, lastScanAt, scansCount, listingsTracked, activeAlerts, consecutiveErrors}`.
`POST /scan` → triggers an immediate poll cycle: `{started:true}` or `{started:false,reason:"in_progress"}`.
