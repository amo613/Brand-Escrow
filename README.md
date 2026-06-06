# PactPay — Autonomous Metric-Milestone Brand↔Creator Escrow on Algorand (x402)

> **Working name:** PactPay *(placeholder — alt: Cleared, Settl, Proofpay)*.
> **Event:** Algorand Builders Berlin — Agentic Commerce × x402 Hackathon (6–7 June 2026).
> **Track:** 🧠 **Agentic Commerce ($11k)** · **Category:** New Project.
> **Mandatory stack:** ✅ x402 on Algorand · ✅ topic = Agentic Commerce.
> **Status:** PLAN + DB live. Docs are the source of truth. Built on the reference repo `camohe90/x402`.

---

## 1. One-paragraph pitch

A brand funds a creator deal in USDC, held by an **Algorand smart contract**, with **milestones defined as social metrics** — *"5k likes → 2 USDC, 10k likes → 3 USDC."* The creator posts and submits the **link**; we **track that link via the platform API**. When a milestone's metric is hit, an **AI agent pays for the proof over x402**, confirms it against the brief, and the **contract releases that tranche** — but only ever to the bound creator, the exact amount, once, after a challenge window, and only if the metric truly cleared the threshold (re-checked **on-chain**). The API detects, the AI judges and pays via x402, the contract enforces. An autonomous agent that touches real money but **cannot mispay**.

**Why it wins Track 1:** an AI agent that **transacts over x402 on Algorand** to run an **agent-driven creator marketplace** — with a smart-contract guardrail that makes autonomous payouts safe.

---

## 2. The four powers (the trust split)

| Power | Who | Does | Trust |
|---|---|---|---|
| **Detect** | Platform-API tracking (oracle) | reads the post's metric (likes/views…) | off-chain, attested on-chain |
| **Judge & pay** | **AI Verify-Agent** | pays x402 for proof, confirms vs brief, attests verdict | fallible — but boxed in |
| **Enforce** | **Escrow smart contract** | holds USDC, releases each tranche within invariants | trustless, the last line |
| **Settle x402** | GoPlausible facilitator | verifies + settles agent payments on Algorand | partner-hosted |

> ### 🛡️ The guardrail — why an autonomous AI can touch real money
> The AI agent **judges**, but the **smart contract decides what moves**. When the agent attests a milestone, the contract **re-checks `observedValue ≥ threshold` AND `confidence ≥ min_confidence` itself, on-chain** — so **a hallucinating AI can never release an unreached milestone**. And even a `pass`-everything agent can only ever pay the **bound creator**, the **exact tranche amount**, **once**, and **after a challenge window** (during which the brand can dispute). The agent's entire power is *"attest a number + flip one boolean, inside a reversible window."* Everything else is enforced by the Algorand VM. That's how you let an autonomous agent move money safely.

---

## 3. What we are building (Phase 1 MVP)

1. **Login with social (Web3Auth)** → a non-custodial Algorand wallet, no seed phrase → **auto-airdropped test ALGO + USDC** (opt-in handled for you).
2. **Brand** creates a deal: **Full payment or metric milestones** (metric + threshold + amount, "+" for more), and **funds** the escrow.
3. **Creator** verifies their **@handle** (X / YouTube / TikTok OAuth — separate from login), applies, is accepted, posts, submits the **link**.
4. **Tracking → x402 proof → AI confirm → contract releases the tranche.** No-show → brand refund. Brand can dispute in the window.

Phase 2: Quest mode + x402-funded escrow. Phase 3: mainnet (the 50% milestone money). See [BUILD-PLAN.md](BUILD-PLAN.md).

---

## 🔩 How the smart contract works (step by step)

> `EscrowApp` (Algorand TypeScript) is the heart: it **holds the USDC** and is the **only** thing that can move it — within hard rules. Worked example: **Nike** pays **@maxfit** for a Reel — *5,000 likes → 2 USDC, 10,000 likes → 3 USDC* (total 5 USDC).

**Algorand basics that make this safe:** the app has its **own account** that holds the escrow; it pays out only via **inner transactions** whose recipient/amount are set in code (never by the caller); funding is proven via an **atomic group** (the contract reads the sibling payment); each deal's state lives in a **box** keyed by `dealId`.

**1 · `create_deal` — brand funds (atomic group).** Brand signs `[ axfer Nike→App 5 USDC ] + [ create_deal(1, deadline, metrics=[LIKES,LIKES], thresholds=[5000,10000], amounts=[2,3]) ]`. The contract proves the funding:
```
assert axfer.receiver == app && axfer.amount == 5 USDC && axfer.asset == usdc
→ Box[1] = { brand:Nike, creator:ZERO, total:5, status:FUNDED,
             milestones:[{LIKES,5000,2,PENDING},{LIKES,10000,3,PENDING}] }
```
It doesn't *trust* it was funded — it *proves* it by reading the grouped payment. 5 USDC now sit in the app account.

**2 · `accept_application` — bind the creator.** Brand accepts @maxfit → `Box[1].creator = @maxfit` (settable once, never re-bindable). Every future payout reads **this** address.

**3 · off-chain** — creator posts, submits the link; tracking sees ~5,140 likes; the **agent pays $0.01 via x402** for the real proof; the LLM confirms it's on-brief and the handle matches.

**4 · `submit_milestone_verdict` — the agent's ONLY power (oracle-signed):**
```
assert sender == agent_oracle
if (pass && confidence >= min_confidence && observedValue >= milestone.threshold)   // 93≥80 ✓, 5140≥5000 ✓
   → milestone.status = REACHED_PENDING ; approved_at = now      // starts the timelock — NO money yet
```
The agent supplies `observedValue`, but **the contract re-checks it against the stored threshold itself** — a hallucinated low number can't approve, and a high number still moves nothing here.

**5 · `release_milestone` — guardrailed payout (permissionless, after the window):**
```
assert REACHED_PENDING && now >= approved_at + window && deal != DISPUTED && !released
inner axfer: app → Box[1].creator , amount = milestone.amount    // recipient & amount from the BOX, never params
→ @maxfit receives exactly 2 USDC ; milestone RELEASED
```
Milestone 2 repeats at 10k likes → 3 USDC → deal RELEASED. Two tranches, fully automatic, all visible on Lora.

**Safety branches:** `dispute(dealId,i)` (brand, in window) freezes the release → `resolve_dispute` (admin) pays the right side. `refund(dealId)` (brand, after deadline) returns every **un-released** tranche to the brand. Funds are never stuck, never forfeited.

**On-chain vs oracle (the honest boundary):** the chain can't read X/TikTok, so the **agent reads + attests** the metric (an off-chain oracle); the **contract enforces** the rules — threshold re-check, recipient/amount binding, oracle-only attestation, timelock, per-tranche replay latch, deadline refund. A wrong oracle still **cannot mispay**.

---

## 🧪 Local testing, Admin Test Console & data sources

- **LocalNet first:** the contract is developed + tested on **AlgoKit LocalNet** (every guardrail has a negative test) before TestNet. Manual + scripted **end-to-end** runs; the oracle metric is faked in tests.
- **Admin Test Console** (visible only when the **ADMIN wallet** is logged in): we have no real viral posts during the hackathon, so the admin can **inject the metric value** (likes/views/comments) for a deal's post. Crucially the post + profile are **really fetched** (author, caption, thumbnail, live count shown) — only the threshold-driving number is on a slider. So the **full pipeline runs for real** (fetch → x402 proof → AI confirm → contract release); only the count is simulated. Off in production.
- **Data sources:** post metrics come from the platform APIs **+ Apify `clockworks~tiktok-scraper`** for TikTok (per-post playCount/diggCount/comments/shares that TikTok's own API doesn't expose) — same pattern + key as the web3-equity project (`APIFY_API_TOKEN`). X via public metrics/Apify; YouTube via the Data API.

---

## 4. Tech stack (decided)

| Layer | Choice |
|---|---|
| Chain | **Algorand TestNet** |
| Contract | **Algorand TypeScript (PuyaTs)** via AlgoKit |
| Payments | **x402** — `@x402/avm@^2.12 @x402/core @x402/fetch @x402/hono` + **GoPlausible facilitator** |
| Stablecoin | **USDC ASA** testnet `10458941` |
| Login | **Web3Auth** `@web3auth/modal` v10 (social/email, non-custodial Algorand key) — **LOCKED**; `@txnlab/use-wallet` (Pera/Defly) optional later |
| New users | backend **dispenser** airdrops test ALGO + USDC + auto opt-in |
| Social verify | **direct OAuth** (X PKCE / YouTube-Google / TikTok), AES tokens — **no Privy** |
| Backend | **Fastify + TypeScript** |
| AI | **OpenRouter** → `google/gemini-3.1-flash-lite` (multimodal: verifies image/video deliverables) |
| DB | **Neon Postgres + Prisma** ✅ live |
| Frontend | **Next.js 14 + Tailwind** (or Vite SPA like the reference `ui/`) |

---

## 5. Document index — read in order

| Doc | What |
|---|---|
| **[CLAUDE.md](CLAUDE.md)** | Read first. Stack, hard rules, constants/IDs, package imports, contract surface. |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Topology, Web3Auth login + airdrop, the **metric-milestone contract + guardrails**, x402, tracking, data model. |
| **[HOW-IT-WORKS.md](HOW-IT-WORKS.md)** | Every flow with sequence diagrams (login → fund → track → x402 → release / refund / dispute). |
| **[SECURITY.md](SECURITY.md)** | Key handling, on-chain guardrails, dispenser, oracle integrity, x402, sessions, secrets. |
| **[BUILD-PLAN.md](BUILD-PLAN.md)** | Locked decisions, ticket breakdown, 36h timeline. |

---

## 6. Project status

- ✅ **Database** provisioned on Neon — 9 tables live (`User, SocialAccount, Deal, Milestone, Application, Verdict, MetricCheck, Dispute, EscrowEvent`). `prisma/schema.prisma` + `npm run db:push`.
- ✅ **`.env`** created (git-ignored) with all vars + placeholders; `.env.example` mirrors it.
- ✅ **Reference repo** studied (`camohe90/x402`): `seller/` (x402 server), `buyer/` (x402 agent), `ui/useWeb3Auth` (login), `skills/` (Algorand agent skills).
- ⏭️ **Next:** scaffold `contracts/` (AlgoKit), `backend/` (Fastify), `web/` per [BUILD-PLAN.md](BUILD-PLAN.md) P0.

## 7. Quickstart (target)
```bash
algokit localnet start                       # local Algorand
algokit init -t typescript                   # contracts/ (PuyaTs)
# backend:
npm i fastify @fastify/cookie @fastify/jwt @prisma/client @x402/avm @x402/core @x402/fetch @x402/hono tweetnacl algosdk
# ⚠️ algokit-utils: pin the v10-alpha that @x402/avm uses — stable 9.2.0 LACKS generateAddressWithSigners:
npm i @algorandfoundation/algokit-utils@10.0.0-alpha.46
# web (login + x402 client):
# ⚠️ Web3Auth MUST be v10 — the useWeb3Auth hook is v10 API; npm-latest is v11 and breaks the build:
npm i @web3auth/modal@^10.16.0 @web3auth/no-modal@^10 @txnlab/use-wallet-react @x402/fetch @x402/avm
# fund the dispenser once:  https://bank.testnet.algorand.network  +  https://faucet.circle.com
```

## 8. Verified resources
- x402 on Algorand: <https://algorand.co/agentic-commerce/x402/developers> · reference: `camohe90/x402`
- Facilitator: <https://facilitator.goplausible.xyz> (`/verify` `/settle` `/supported`)
- Web3Auth: <https://dashboard.web3auth.io> (Sapphire Devnet) · use-wallet: <https://github.com/TxnLab/use-wallet>
- AlgoKit: <https://github.com/algorandfoundation/algokit-cli> · Explorer: <https://lora.algokit.io/testnet>
- Faucets: ALGO <https://bank.testnet.algorand.network> · USDC <https://faucet.circle.com>
- Bonus: Quantoz EURQ <https://docs.ai.quantozpay.com/hackathon/guide/> · Folks xALGO · Alpha Arcade

> ⚠️ **Version pins (verified, or it breaks `npm i`):** `@web3auth/modal@^10.16.0` + `@web3auth/no-modal@^10` (latest is v11 → incompatible with the v10 `useWeb3Auth` hook); `@algorandfoundation/algokit-utils@10.0.0-alpha.46` (stable 9.2.0 lacks `generateAddressWithSigners`; this alpha is exactly what `@x402/avm@2.14` pulls). `@x402/*` `^2.12` resolves to `2.14` ✓. Also `GET facilitator.goplausible.xyz/supported` to confirm USDC ASA `10458941`.
