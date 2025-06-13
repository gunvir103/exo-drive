# Redis Integration Strategy for Exodrive

> **Status:** Partially Implemented · Last updated December 13, 2024
>
> Redis has been introduced as a *multi-purpose edge cache & coordination layer* that complements Supabase Postgres. This document lists the concrete use-cases, expected performance gains, and operational considerations.

---

## 1. Hosting & Connectivity

| Option | Latency (p99) from Vercel (us-east-1) | Free tier? | Notes |
|--------|---------------------------------------|------------|-------|
| **Upstash Redis** | ~1–2 ms (same AWS region) | ✔ | Built-in REST & TLS; pay-per-request; Serverless-friendly. |
| AWS ElastiCache | ~0.3 ms (within VPC) | ✖ | Requires self-managed VPC + NAT; more ops burden. |

*Recommendation*: **Upstash** to match serverless deployment model; can migrate later if throughput outgrows pay-per-request.

---

## 2. Use-Cases & Efficiency Impact

| # | Purpose | Data Model / Commands | Benefit | Efficiency Estimate |
|---|---------|----------------------|---------|---------------------|
| 1 | **Distributed booking lock** | `SET lock:car:{car_id}:{date_hash} nx px 30000` | Prevent double-booking race without DB advisory locks. | Removes ~100 ms extra round-trip where two users compete; race probability → ~0%.
| 2 | **Rate limiting** (API, uploads) | Sliding window + Lua script (`INCR`, `EXPIRE`) | Protects infra from abuse/DoS. | Constant-time O(1); 5–10× cheaper vs DB counter tables.
| 3 | **GraphQL result cache** | `GET cache:gql:{query_hash}:{vars}` (TTL 30 s–5 min) | Offload read traffic for catalogue pages. | 60-80 % fewer Postgres reads on hot pages.
| 4 | **Edge session cache** (optional) | Store decoded JWT / customer snapshot (`JSON`) | Saves re-querying `customers` table on every request. | ~2 ms saved per SSR request.
| 5 | **Background job queue** | Streams (`XADD booking_emails ...`) processed by worker | Decouple long-running tasks (PDF gen, email send). | Keeps API <50 ms; tasks handled async.
| 6 | **Analytics counters** | `PFADD`, `INCRBY` for page views | Real-time stats without hitting analytics SaaS. | Write fan-out O(1) vs analytics pixel 200 ms.

### 2.1 Detailed Flow – Booking Lock

1. FE hits `/api/bookings/create`.
2. Server forms `date_hash = sha1(start+end)` & tries `SETNX`.
3. If **OK** ➜ proceed to Postgres transaction.
4. If **nil** ➜ respond *409 Already booked*.
5. Lock auto-expires in 30 s to avoid orphan locks.

> With ~50 concurrent users, Upstash p99 = 3 ms; DB row-level lock alternative adds ~50 ms due to contention.

---

## 3. Data Expiration & Memory Cost

| Key Pattern | Expected Volume | TTL | Memory Footprint |
|-------------|----------------|-----|------------------|
| `lock:car:*` | 10–100 live | 30 s | ~5 KB |
| `cache:gql:*` | 1 k–5 k | 30 s–5 min | <25 MB |
| `ratelimit:*` | #unique IPs × endpoints | 1 h | Depends on traffic; ~1 MB / 10 k IPs |
| `session:*` | Active users | 24 h | 0.5 KB per user |

Total with current scale ≈ **<64 MB**, well under Upstash free tier (256 MB / 10 k req-mo).

---

## 4. Client Libraries

* **Serverless API routes**: `@upstash/redis` – fetch-based, cold-start-friendly.
* **Edge functions**: same lib (works under V8 isolates).
* **Workers**: `ioredis` or `bullmq` for job processing.

---

## 5. Operational Considerations

1. **Observability**: Upstash console provides latency & QPS; integrate with Datadog for alerts (>100 ms p95).
2. **Secrets rotation**: Store UPSTASH_REDIS_REST_URL & TOKEN in Vercel env; rotate quarterly.
3. **Local dev**: `docker compose up redis`; provide `.env.development` with `REDIS_URL=redis://localhost:6379`.
4. **Back-pressure**: Implement circuit-breaker; if Redis unavailable, fallback to DB (locks) with warning logs.

---

## 6. Roll-out Plan

| Phase | Task | Verification |
|-------|------|--------------|
| 1 | Provision Upstash database | Ping healthcheck endpoint. |
| 2 | Implement booking lock wrapper (`lib/redisLock.ts`) | Simulated 100 concurrent bookings – expect zero double-bookings. |
| 3 | Add rate limiter middleware | k6 load test; 429 responses after threshold. |
| 4 | Cache GraphQL catalogue queries | Compare Postgres read count via pg_stat_statements – expect 60 % drop. |
| 5 | Migrate background tasks (email) to Redis stream | Observe queue latency <1 s. |

---

## 7. Risks & Mitigations

* **Lock lost due to eviction** → keep TTL short + idempotent booking DB function.
* **Cold-start latency** → REST mode adds ~1 ms; acceptable.
* **Complexity creep** → limit use to outlined cases; one abstraction layer.

---

> End of file – ready for team review. 