# Temporal Halo (HALO.md) Design

**Goal:** Provide an always-on, agent-readable “temporal memory” document (`HALO.md`) that tracks recent past, present, and future, and is injected into every OpenClaw turn.

**Key Idea:** A scheduled “dream” agent turn periodically refreshes `HALO.md` by surveying the user’s digital life (email, calendar, chats, prior OpenClaw sessions, etc.) using whatever tools/skills the user has installed. The plugin stays tool-agnostic: it provides the prompting, the schema, and the publish mechanics, but does not hardcode provider APIs.

## Goals

- Keep an up-to-date, living temporal context document in markdown: `HALO.md`.
- Inject `HALO.md` (verbatim) into every agent run to reduce tool use and disambiguate user intent.
- Support a scheduled “dreaming” refresh every ~30 minutes via OpenClaw cron (isolated session).
- Enforce a size budget: `HALO.md` should stay under 25k characters, with an agent-driven compaction loop.
- Maintain “first-order retrieval rules”: if a fact is important, include the fact itself or a concrete recipe/pointer for fetching the source.

## Non-Goals

- No first-party email/calendar/chat integrations in this plugin.
- No deterministic compaction algorithm; compaction is LLM-driven.
- No encryption or redaction layer (sensitive identifiers are allowed and are injected verbatim).

## Storage & Location

- Global path (default):
  - `~/.openclaw/temporal-halo/HALO.md`
- The plugin reads this file on every agent start and prepends it into context.
- The dream process overwrites this file via a plugin tool to ensure size enforcement and atomic writes.

## HALO.md Schema (Stable Sections)

`HALO.md` is markdown with a stable structure so the agent can reliably scan:

- Header metadata
  - Last updated timestamp
  - Timezone (best-effort)
  - Retention horizons (Past 14d, Future 60d, plus long-horizon exceptions)
- **Present (Now to 24h)**
- **Near Future (Next 14d)**
- **Medium Future (15–60d)**
- **Long Horizon (60d+ important)**
- **Recent Past (Last 14d)**
- **Retrieval Recipes**
  - Tool/skill agnostic “how to look it up” instructions (search email, check calendar, scan prior sessions, etc.)
- **Key Identifiers**
  - Full sensitive identifiers permitted (confirmation numbers, tracking IDs, reservation locators, etc.)

The dream step is responsible for moving items between time buckets, rewriting summaries, and pruning irrelevant/stale content.

## Plugin Behavior

### Always-on Context Injection

Hook: `before_agent_start`

- Read `HALO.md` (if missing, inject a small note).
- Prepend:
  - Minimal usage rules (“treat HALO as current; use it first for disambiguation; follow retrieval recipes when missing; don’t hallucinate”).
  - The verbatim `HALO.md` content in a clearly delimited block.

### Dream Mode

Trigger: `event.prompt` contains a stable marker, e.g. `[temporal-halo:dream]`.

When detected, `before_agent_start` also prepends a “dreaming” instruction block telling the agent to:

1. Survey sources (email/calendar/chats/prior sessions) using whatever tools/skills exist.
2. Update `HALO.md` to match the schema and horizons.
3. Publish via the plugin tool `temporal_halo_publish`.
4. If publish rejects due to size, compact and retry.

The cron job runs as an isolated session and is configured to be silent by default (`--no-deliver`).

## Publishing & Size Enforcement (25k/20k Rule)

Mechanic: plugin tool `temporal_halo_publish`

- Input: full markdown for the new `HALO.md`.
- Hard rule: never write an oversized `HALO.md` to disk.
- If the first publish attempt is >25,000 chars:
  - Tool refuses to write and instructs the agent to compact to <=20,000 chars and retry.
- If the second publish attempt is still >25,000 chars:
  - Tool still refuses to write.
  - Tool enqueues a warning system event to the agent’s main session key (“HALO compaction failed; HALO not updated”).
  - Tool returns a non-throwing tool result (no hard failure of the agent run).

Rationale: This creates an “agent loop” within the same dream run, while keeping the on-disk HALO bounded and avoiding hard failures.

## Cron Scheduling (OpenClaw Cron Only)

Recommended cron job (every 30 minutes, isolated session, no delivery) will be documented in the repo README.

## Security & Privacy Notes

- `HALO.md` may contain sensitive personal data and will be injected into every turn verbatim.
- Users should treat this as equivalent to having those identifiers in the system prompt.
- Plugin is intentionally provider-agnostic; any access to external systems is mediated by the user’s installed tools/skills and their own credentials.

## Testing Strategy

- Unit tests for:
  - Size enforcement + attempt counting behavior.
  - Warning session key resolution behavior.
  - Atomic write behavior (writes do not partially overwrite).
- Manual verification:
  - Enable plugin, create a dummy `HALO.md`, confirm it is injected.
  - Run a cron dream job once, confirm it updates `HALO.md`.
  - Force oversize publish attempts and confirm: no oversized file is written, second attempt warns.

