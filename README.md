# DealRadar Georgia 🇬🇪

Live apartment **buy & rent** radar for Tbilisi and Batumi. One search fans out to **three Georgian real-estate sources in real time**, unifies the results, cross-detects the same apartment listed on several sites, and scores each offer against its district's market so you instantly see what's actually a deal — plus **local owner ads** with Telegram notifications.

**Live sources:** [korter.ge](https://korter.ge) · [ss.ge](https://ss.ge) · [myhome.ge](https://myhome.ge) — every search queries them live; nothing is served from a stale index.

## Features

- **Buy & rent search** across all sources with unified USD-normalised pricing
- **Real-time sync** — each query hits the source sites live (45s detail micro-cache smooths repeat views; manual *Sync now* always forces fresh)
- **Dedicated offer pages** — photo gallery, full parameters, description, seller info, 12-month market price history, auto-synced with the source every 60s while the tab is open
- **Deal scores** — each listing is scored against the district's median price-per-m² within the result set (Emerald / Amber / Slate badges)
- **Cross-source duplicate detection** — the same apartment on SS *and* MyHome is merged; cheaper price wins, both links kept
- **Extended filters** — rooms, bedrooms, floor range, price-per-m² range, new building, balcony, keyword, source selection
- **Map view** — Leaflet with price pins coloured by deal score
- **Local ads** — sign up, publish your own apartment, pair your Telegram and get notified when someone is interested
- **6 languages** — English, ქართული, Русский, Українська, עברית, العربية (full RTL)
- **Mobile-first** — every section responsive, touch gallery swipe, safe-area aware

## Architecture

```
src/
  app/api/
    explore/               unified live search (fan-out → merge → score)
    listing/[provider]/[id]/   live offer detail + price-drop tracking
    alerts/ notifications/ stats/   alerts pipeline
    auth/  ads/  telegram/         local ads, token auth, bot pairing
  lib/providers/           source adapters
    korter.ts              korter.ge native card API + SSR detail (cookie-warmed)
    tnet.ts                ss.ge + myhome.ge via the api-statements.tnet.ge gateway
    local-ads.ts           first-party listings from the DB
    index.ts               fan-out, cross-source merge, scoring dispatch
  components/radar/        all UI (feed, filters, map, detail, dashboard…)
mini-services/scanner/     poller: alert matching, price history, telegram bot
prisma/                    SQLite schema
```

### How the sources work

- **korter.ge** — private card API (`/pyapi/apartment/cards/sale|rent`); details come from the server-rendered page using a warmed cookie session (plain curl returns an empty shell).
- **ss.ge & myhome.ge** — both run on the tnet platform; one JSON gateway (`api-statements.tnet.ge`) serves both, selected by the `X-Website-Key` header. No browser automation needed anywhere.

Please use respectfully: results are cached briefly and requests are rate-limited per search — the tool is a thin live lens over the sources, not a crawler.

## Run it

```bash
bun install
bunx prisma db push          # SQLite at ./db/custom.db
bun run dev                  # app on :3000
cd mini-services/scanner && bun run dev   # poller on :3030
```

Environment (`.env`):

```
DATABASE_URL=file:/absolute/path/to/db/custom.db
TELEGRAM_BOT_TOKEN=      # optional — from @BotFather, enables owner notifications
TELEGRAM_BOT_USERNAME=   # bot handle shown in the pairing UI
TELEGRAM_WEBHOOK_SECRET= # optional — webhook mode instead of getUpdates polling
```

## Local ads & Telegram

1. Sign up in the app (email + password) — you receive a login token.
2. Publish an apartment (buy or rent) — it appears in the feed immediately, no external site involved.
3. Pair Telegram: generate a pairing code, send `/start <code>` to the bot.
4. When someone taps **I'm interested** on your ad, the bot messages you instantly (plus the interest stays in your dashboard).

## Disclaimer

Independent monitoring tool. Not affiliated with korter.ge, ss.ge or myhome.ge. All listing data and photos belong to their respective owners/sources. For demo and research purposes.

## License

[MIT](LICENSE)
