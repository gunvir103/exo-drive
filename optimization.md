# Exodrive – Performance & Cost Optimisation Playbook

> **Status:** Ready for Implementation · Last updated December 13, 2024  
> Proposes performance optimizations and Redis-based improvements with estimated performance gains.

---

## 1. Summary of Existing Gains

| Area | Technique | Est. Improvement | Source Doc |
|------|-----------|------------------|------------|
| **Catalogue fetch** | GraphQL nested query replacing 4–6 REST calls | ▼80 % HTTP requests, ▼150 ms TTFB | `graphql.md` |
| **Car detail page** | GraphQL single query + fragment cache | ▼75 % requests, ▼200 ms TTFB | `graphql.md` |
| **Concurrent booking** | Redis distributed lock | Eliminates double-book race; ▼50 ms p95 | `redis.md` |
| **GraphQL cache in Redis** | 30 s TTL on hot queries | ▼60–80 % Postgres reads | `redis.md` |
| **Rate limiting via Redis** | Lua sliding window | O(1) ops, negligible DB load | `redis.md` |

Cumulatively these deliver **~35 % lower average server response time** and **~50 % lower database QPS** for public traffic.

---

## 2. Additional Optimisations

| # | Optimisation | Scope | Effort | Gain Estimate |
|---|-------------|-------|--------|---------------|
| 1 | **Postgres Index Audit** | Add indexes on `car_availability(car_id, status, date)` and `bookings(customer_id, status)` | M | ▼30–40 % query latency for admin dashboards |
| 2 | **Edge Image Optimisation** | Use Vercel Image Optimization for car images | L | ▼70 % bandwidth, faster LCP |
| 3 | **HTTP/3 & Compression** | Enable Brotli + HTTP/3 in Vercel config | S | ▼10–15 % page weight |
| 4 | **Incremental Static Regeneration (ISR)** | Pre-render `/cars` list every 60 s | M | Near-0 ms server time for cached paths |
| 5 | **Client-side Prefetch** | Next.js `<Link prefetch>` + GraphQL persisted queries | S | ▼80–100 ms navigation delay |
| 6 | **Connection Pooler** | PgBouncer or Supabase pgcat | M | Allows 10× concurrent serverless connections |
| 7 | **Background Media Transcode** | Queue in Redis Stream, process with ffmpeg worker | H | Offloads CPU heavy tasks from API; keeps p95 <100 ms |
| 8 | **Browser Hinting** | `priority` images, `fetchpriority=high` | S | ▼100 ms LCP on mobile |
| 9 | **Vary Cache-Control** | Public GraphQL GET responses (`s-maxage=30`) | S | Offload additional 20 % traffic via Vercel CDN |

Legend – Effort: S=Small (<1 dev-day), M=Medium (1-3 days), H=High (>3 days).

---

## 3. Phased Roll-out Timeline

| Phase | Items | Owner | KPI Target |
|-------|-------|-------|-----------|
| 1 | GraphQL catalogue reads, Redis lock, basic rate limit | FE + BE | p95 API <250 ms |
| 2 | Redis GraphQL cache, ISR, CDN cache headers | DevOps | ▲PageSpeed score >90 mobile |
| 3 | Index audit, connection pooler, image optimisation | DBA + Ops | ▼DB CPU 40 %, ▼bandwidth 60 % |
| 4 | Background media transcode, prefetch tuning | Media team | ▼TTI on car detail 200 ms |

---

## 4. Monitoring & Verification

1. **Metrics** via Supabase logs, Upstash console, Vercel Analytics.
2. **Synthetic tests** with k6 for concurrency & Artillery for CDN hits.
3. **Real-user metrics** (Web-Vitals) monitored in Vercel Speed Insights.
4. **Rollback plan**: feature flags per optimisation.

---

## 5. Open Questions

* Should GraphQL cache also be stored in Vercel Edge Config for even lower latency?
* Can we co-locate Redis worker in the same region as Supabase to minimise network hops?
* Evaluate cost ceiling on Upstash pay-per-request vs reserved throughput.

---

> End of document – PRs welcome. 