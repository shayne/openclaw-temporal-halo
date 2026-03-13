# Temporal Halo Quiet Delivery Design

## Goal

Stop recurring Temporal Halo cron runs from sending chatty status messages when nothing important changed, while still preserving useful context in `HALO.md`.

## Problem

The current system has two independent behaviors that combine badly:

1. Temporal Halo prompts already try to suppress low-signal updates, but workers can still produce quiet-status outputs or low-value findings.
2. OpenClaw subagent completion delivery can wrap those worker results in a "convert this into a user-facing update" prompt, which turns operational or no-op completions into visible messages.

The result is user-visible spam such as "quiet delta pass" updates, even when the real outcome should have been silent.

## Approved Policy

Temporal Halo should apply a three-tier value filter:

- `low`: Not useful for future understanding or disambiguation. Do not write it to `HALO.md`. Do not message.
- `medium`: Useful to keep in `HALO.md`, but does not change the user's immediate action set. Update `HALO.md` silently. This also includes time-only HALO maintenance when it changes section placement or removes expired items in a way that materially improves future disambiguation.
- `important`: Changes what the user should do now, or is urgent enough to interrupt. Update `HALO.md` and send one proactive message.

This policy is stricter than the current "high-impact delta" wording because it also defines what should be excluded from `HALO.md`, not just what should trigger messaging.

## Non-Goals

- Changing the cron schedule or wake mode
- Adding provider-specific logic to the plugin
- Introducing a new persistence layer for dedupe or delivery state
- Reworking HALO publish size enforcement
- Performing release, tagging, or local deployment in this spec phase

## Planning Scope

This work should be planned as one coordinated implementation effort spanning two repos:

- this plugin repo for Temporal Halo prompt and test changes
- the OpenClaw runtime repo for completion-delivery suppression changes

The plan should stay sequenced and explicit about repo boundaries rather than splitting into unrelated projects.

Required implementation order:

1. runtime completion-mode support and suppression changes in the OpenClaw runtime
2. plugin prompt and test changes in this repo
3. cross-repo verification using the existing recurring dream cron job

This keeps ownership, test execution, and rollout order clear while still treating the user-visible problem as one feature.

## Architecture

### 1. Temporal Halo Prompt Layer

The plugin remains responsible for content selection and message eligibility.

Responsibilities:

- Define the low/medium/important policy in the injected dream instructions
- Require workers to return only substantive findings or exact `NO_REPLY`
- Require the final fan-in step to decide whether to skip publish, publish silently, or publish and message
- Keep the plugin provider-agnostic and prompt-driven

Primary code surface:

- `dream.ts`
- `tests/dream.test.ts`

### 2. OpenClaw Completion Delivery Layer

The OpenClaw runtime remains responsible for deciding whether a completed subagent result should even enter the user-delivery rewrite path.

Responsibilities:

- Suppress non-deliverable completion results before generating a "rewrite for the user" prompt
- Treat exact `NO_REPLY` as silent
- Treat known legacy no-op sentinels as silent

Primary runtime surface:

- `src/agents/subagent-announce.ts`
- Related completion-delivery tests in the OpenClaw runtime

### 3. Boundary Between Layers

The plugin decides semantic value. The runtime decides transport eligibility.

That split keeps concerns clear:

- Temporal Halo owns whether a finding is low, medium, or important.
- OpenClaw owns whether a completion should be surfaced at all.

This avoids coupling plugin-specific policy to any single messaging transport while still preventing noisy completion rewrites globally.

Runtime suppression is intentionally narrow and deterministic. It applies only to subagent completion auto-delivery and only to explicit silent/no-op interfaces defined in this spec. The runtime should not attempt broad semantic classification of ordinary prose; that remains the plugin's job.

## Prompt Contract

### Worker Contract

Temporal Halo workers should return one of two outcomes:

- concise factual findings that are plausibly medium or important on their own, or could become medium or important when combined with sibling worker output or prior HALO state
- exact `NO_REPLY` when nothing medium-or-higher value changed

Workers should not emit custom quiet-status tokens such as:

- `NO_EMAIL_DELTAS`
- `NO_MESSAGE_DELTAS`
- `NO_CALENDAR_DELTAS`

Workers should also avoid prose that only describes scan windows, source passes, unchanged status, or orchestration progress.

Aggregation rule:

- workers should suppress pure no-change and pure operational status
- workers may forward borderline factual deltas when aggregation could raise their importance
- fan-in remains the only place allowed to make the final low/medium/important decision across all gathered evidence

Transport rule:

- dream worker completions are internal-only orchestration inputs
- they may auto-announce back to the parent dream run, but they must not enter the user-delivery rewrite path
- non-Halo subagents keep their normal completion-delivery behavior

Concrete contract:

- OpenClaw should add an optional `completionMode` parameter to `sessions_spawn` for `runtime="subagent"`
- allowed values:
  - `deliver` (default): existing completion-delivery behavior
  - `internal`: completion is delivered only as parent-session orchestration context and never enters user-delivery rewrite
- Temporal Halo dream prompts should set `completionMode: "internal"` for calendar, email, message, and optional worker spawns
- the runtime should key off that explicit spawn option rather than trying to infer whether a subagent belongs to Temporal Halo
- mixed-version strategy: use rollout sequencing only. Runtime support ships first, then the plugin release that emits `completionMode: "internal"` is deployed after that runtime update. No capability probe, config flag, or heuristic fallback is required in the plugin.

Interface details:

- `completionMode` is valid only for `runtime="subagent"`
- invalid values should fail tool validation
- using `completionMode` with a non-`subagent` runtime should fail tool validation
- for `completionMode: "internal"`, the child's final result must remain visible to the requester session as internal orchestration context
- if internal auto-announce delivery fails, parent orchestration should fall back to existing descendant-result retrieval paths rather than user delivery

The critical requirement is that dream worker findings reach fan-in without becoming direct user-facing completion rewrites.

### Final Fan-In Contract

The final dream run should classify findings as follows:

- no medium-or-higher findings:
  - do not rewrite `HALO.md`
  - reply `NO_REPLY`
- medium findings only:
  - publish updated `HALO.md`
  - reply `NO_REPLY`
- any important finding:
  - publish updated `HALO.md`
  - send one proactive message

The final fan-in step is the only point where a proactive user-visible message is allowed.

Truth table:

| Tier | Write `HALO.md` | User message | Notes |
|------|------------------|--------------|-------|
| `low` | No | No | Drop the finding entirely |
| `medium` | Yes | No | Keep it for future disambiguation |
| `important` | Yes | Yes | Interrupt once because action changed now |

Concrete time-only maintenance examples that count as `medium`:

- moving an item from `Near Future` into `Present` because it entered the next-24-hours window
- moving an elapsed item from `Present` into `Recent Past`
- pruning an expired `Present` item that is no longer useful context

Pure reformatting or reordering with no section-placement change remains `low` and should not trigger a silent publish.

## HALO Content Rules

### Low

Exclude from `HALO.md` and messaging:

- tiny tracker increments with no likely decision impact
- repeated "still true" facts
- routine confirmations that do not change understanding
- operational summaries of what was checked
- quiet restatements of unchanged threads or same-day scans

### Medium

Write silently to `HALO.md`, but do not message:

- unresolved loops that remain useful for future disambiguation
- material state changes with likely future relevance
- commitments or relationship context that help answer later ambiguous requests
- updates that matter for memory, but not for immediate interruption

### Important

Write to `HALO.md` and send one proactive message:

- immediate-action changes
- same-day disruptions
- urgent travel, booking, payment, delivery, or safety changes
- escalations where the user should act differently now

## Data Flow

1. A recurring dream cron run triggers the main session.
2. `before_agent_start` injects HALO usage rules and dream instructions.
3. Dream workers gather facts and return either substantive findings or `NO_REPLY`.
4. Final fan-in synthesizes the result set and applies the three-tier policy.
5. If the outcome is medium or important, it publishes `HALO.md`.
6. If the outcome is important, it sends one proactive message.
7. OpenClaw completion delivery suppresses explicit silent and legacy no-op child completions before they reach rewrite-for-user prompts.

Low-only silent runs do not advance any new persisted watermark. That is intentional. The persisted HALO snapshot on disk remains the last published source of truth.

Deterministic query-start algorithm after one or more silent low-only runs:

1. inspect current main-session context for the newest visible dream wake or dream completion timestamp
2. if such a timestamp is available, use it as the next delta query start, plus the existing overlap window
3. if such a timestamp is not available, query only the most recent 30 minutes plus overlap, matching the documented default recurring cadence in this plugin

This avoids unbounded query growth after multiple silent runs without introducing a new persistence store. Some recent low-value material may still be re-scanned, which is acceptable because:

- low-value findings are intentionally discardable
- the overlap window already exists to avoid misses
- this spec explicitly avoids adding new persistence only to remember discarded noise

Planners should preserve narrow delta queries and avoid broad rescans, but they do not need to invent a new refresh-state store for low-only silent runs.

Failure ordering:

- `low`:
  - no publish attempt
  - no user message
  - persisted HALO snapshot remains unchanged
- `medium`:
  - attempt HALO publish
  - do not send a user message
  - if publish fails, the run stays silent and the persisted HALO snapshot remains unchanged
- `important`:
  - attempt HALO publish first
  - if publish succeeds, send the proactive user message
  - if publish fails, still attempt the proactive user message because the user-facing urgency matters now, but the persisted HALO snapshot remains unchanged
  - if message delivery fails after a successful publish, keep the HALO update and rely on existing runtime delivery behavior; do not add a new plugin-level retry store
  - if a later run re-sees the same urgent event after publish failure, retry HALO publish while using recent main-session message history as the dedupe source so the HALO write can still recover without sending a duplicate proactive message unless the facts changed or severity increased

## Compatibility and Migration

The design should support both forward cleanup and backward compatibility.

Forward direction:

- Temporal Halo stops producing legacy no-op sentinel outputs.

Backward compatibility:

- OpenClaw still suppresses legacy no-op sentinels if they appear from older prompts, cached runs, or other automations.

This lets the system get quieter immediately after runtime changes, even before every prompt path is fully updated.

Initial suppression contract for runtime delivery:

- exact `NO_REPLY`
- exact `NO_CHANGES`
- exact all-caps tokens matching `NO_[A-Z0-9_]+_DELTAS`

Examples that should be suppressed by exact-token matching:

- `NO_EMAIL_DELTAS`
- `NO_MESSAGE_DELTAS`
- `NO_CALENDAR_DELTAS`

Normalization rules:

- trim surrounding whitespace
- compare exact-token matches after trimming
- apply the `NO_[A-Z0-9_]+_DELTAS` pattern only when the entire completion text is that token

Guardrails:

- this suppression applies only to subagent completion auto-delivery
- it must not rewrite or suppress normal assistant replies outside the completion-delivery path
- it must not suppress substantive completions just because they contain the word "delta" inside normal prose

## Error Handling and Edge Cases

### Source Unavailable

If one source is unavailable, the run should continue with the available sources. This should not, by itself, trigger a user-facing message unless the failure changes a real-world commitment or blocks an immediate user decision.

### All Sources Unavailable

If all relevant sources are unavailable for a run:

- do not publish a new `HALO.md` unless time-only maintenance alone still justifies a silent rollover update
- do not send a user-facing message unless the outage itself is urgent and user-impacting
- keep the persisted HALO snapshot unchanged
- on the next run, anchor queries using the same recent-main-session-history or 30-minute fallback described in the data-flow section

### Legacy No-Op Results

If a worker returns an old no-op sentinel, the runtime should suppress delivery rather than asking the model to narrate it.

### Mixed Findings

If most workers return `NO_REPLY` and one worker returns a medium or important finding, the final fan-in should still classify based on the substantive finding only.

### Overlapping or Repeated Updates

Existing novelty and dedupe guidance remains in force. Repeated topic updates should not become repeated proactive messages unless severity increases.

Authoritative baseline for planners:

- current novelty and proactive-message prompt contract: `dream.ts`
- current prompt coverage tests: `tests/dream.test.ts`
- current HALO publish and compaction contract: `tools/publish.ts`
- current publish behavior tests: `tests/publish.test.ts`

### Oversize HALO

Existing `temporal_halo_publish` compaction behavior remains unchanged. This design only changes value filtering and delivery suppression.

## Testing

### Plugin Tests

Add or update tests in this repository to verify:

- dream instructions describe the low/medium/important policy clearly
- workers are instructed to return exact `NO_REPLY` for no-op outcomes
- workers may surface borderline factual deltas for final aggregation
- medium findings are explicitly HALO-only
- important findings are the only class eligible for proactive messaging
- legacy no-op sentinel language is no longer encouraged by the prompt

Primary test target:

- `tests/dream.test.ts`

### OpenClaw Runtime Tests

Add or update runtime tests to verify:

- `completionMode: "internal"` preserves parent-session visibility without user delivery
- invalid `completionMode` values are rejected
- using `completionMode` with a non-`subagent` runtime is rejected
- exact `NO_REPLY` completion results are suppressed before user delivery
- legacy no-op sentinel results are suppressed before rewrite-for-user prompting
- internal auto-announce delivery failure falls back to descendant-result retrieval
- substantive completions still reach the delivery path

Likely runtime test surfaces:

- `src/agents/subagent-announce.format.e2e.test.ts`
- `src/agents/subagent-announce.ts`-adjacent tests

### Acceptance Matrix

The implementation should be accepted only if the following scenarios are covered by tests or explicit verification:

| Scenario | HALO write | User message | Runtime suppression expected |
|----------|------------|--------------|------------------------------|
| low-only findings | No | No | Not needed if plugin returns `NO_REPLY` |
| time-only HALO rollover/pruning (`medium` subclass) | Yes | No | Not needed if fan-in returns `NO_REPLY` |
| medium-only findings | Yes | No | Not needed if fan-in returns `NO_REPLY` |
| important findings | Yes | Yes | No |
| mixed medium + important findings | Yes | Yes | No |
| borderline worker findings that become important only in aggregate | Yes | Yes | No |
| substantive Halo worker completion reaches fan-in | Depends on final classification | No direct worker message | Yes, via internal-only completion mode |
| `completionMode: "internal"` on a Halo worker | Parent sees internal orchestration result | No direct worker message | Yes |
| legacy exact-token no-op completion | No user-visible effect | No | Yes |
| whitespace-padded silent token | No user-visible effect | No | Yes |
| source unavailable but no urgent user impact | Depends on remaining findings | No | No special suppression |
| all sources unavailable | No new persisted update | No unless the outage itself is urgent | No special suppression |
| HALO publish fails on medium | No persisted update | No | No |
| HALO publish fails on important | No persisted update | Yes | No |
| rerun after important publish failure with unchanged facts | Retry HALO publish if still relevant | No repeat message | No |
| invalid `completionMode` value | No run | No | Validation error |
| `completionMode` used with non-`subagent` runtime | No run | No | Validation error |
| internal auto-announce delivery failure | Parent can still recover result | No direct worker message | Descendant-result fallback |
| non-Halo subagent completion with substantive content | N/A | Yes if otherwise deliverable | No |

## Rollout Plan

### Phase 1. Runtime Completion Contract

Update the OpenClaw runtime first so:

- `sessions_spawn` supports `completionMode: "internal"` for subagents
- Temporal Halo dream workers can stay internal-only
- explicit silent and legacy no-op child completions are dropped before rewrite-for-user prompting

### Phase 2. Plugin Prompt Tightening

Update Temporal Halo prompts so new runs:

- classify findings by low/medium/important value
- stop producing custom quiet-status strings
- use `completionMode: "internal"` for dream workers once runtime support is present
- intend silent handling for medium findings
- message only for important findings in plugin-controlled outputs

### Phase 3. Verification

Validate the end-to-end behavior with the existing recurring dream cron job:

- low-value runs remain fully silent and do not rewrite `HALO.md`
- medium-value runs update `HALO.md` silently
- important runs update `HALO.md` and send exactly one useful proactive message

### Post-Implementation Follow-Up

After implementation and verification are complete:

- commit implementation changes
- tag and push the plugin release
- wait for CI and publish completion
- update the installed plugin in the local OpenClaw instance
- verify the running local instance picked up the quieter behavior

These release tasks are intentionally downstream from implementation and are not part of this spec-only step.

## Why This Design

This design fixes the problem at both failure points:

- the plugin stops treating low-signal material as something worth narrating
- the runtime stops turning explicit silent or legacy no-op completions into user-visible chatter

That gives the user the intended behavior:

- low-value noise stays out of both chat and `HALO.md`
- medium-value context improves `HALO.md` without interruption
- important changes still break through when the user should know now
