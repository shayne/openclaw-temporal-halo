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
- `medium`: Useful to keep in `HALO.md`, but does not change the user's immediate action set. Update `HALO.md` silently.
- `important`: Changes what the user should do now, or is urgent enough to interrupt. Update `HALO.md` and allow one proactive message.

This policy is stricter than the current "high-impact delta" wording because it also defines what should be excluded from `HALO.md`, not just what should trigger messaging.

## Non-Goals

- Changing the cron schedule or wake mode
- Adding provider-specific logic to the plugin
- Introducing a new persistence layer for dedupe or delivery state
- Reworking HALO publish size enforcement
- Performing release, tagging, or local deployment in this spec phase

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
- Treat operational-only completion text as non-deliverable when it contains no user-facing substance

Primary runtime surface:

- `src/agents/subagent-announce.ts`
- Related completion-delivery tests in the OpenClaw runtime

### 3. Boundary Between Layers

The plugin decides semantic value. The runtime decides transport eligibility.

That split keeps concerns clear:

- Temporal Halo owns whether a finding is low, medium, or important.
- OpenClaw owns whether a completion should be surfaced at all.

This avoids coupling plugin-specific policy to any single messaging transport while still preventing noisy completion rewrites globally.

## Prompt Contract

### Worker Contract

Temporal Halo workers should return one of two outcomes:

- concise factual findings that might qualify as medium or important
- exact `NO_REPLY` when nothing medium-or-higher value changed

Workers should not emit custom quiet-status tokens such as:

- `NO_EMAIL_DELTAS`
- `NO_MESSAGE_DELTAS`
- `NO_CALENDAR_DELTAS`

Workers should also avoid prose that only describes scan windows, source passes, unchanged status, or orchestration progress.

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
  - optionally send one proactive message

The final fan-in step is the only point where a proactive user-visible message is allowed.

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

Write to `HALO.md` and allow one proactive message:

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
6. If the outcome is important, it may send one proactive message.
7. OpenClaw completion delivery suppresses silent or operational child completions before they reach rewrite-for-user prompts.

## Compatibility and Migration

The design should support both forward cleanup and backward compatibility.

Forward direction:

- Temporal Halo stops producing legacy no-op sentinel outputs.

Backward compatibility:

- OpenClaw still suppresses legacy no-op sentinels if they appear from older prompts, cached runs, or other automations.

This lets the system get quieter immediately after runtime changes, even before every prompt path is fully updated.

## Error Handling and Edge Cases

### Source Unavailable

If one source is unavailable, the run should continue with the available sources. This should not, by itself, trigger a user-facing message unless the failure changes a real-world commitment or blocks an immediate user decision.

### Legacy No-Op Results

If a worker returns an old no-op sentinel, the runtime should suppress delivery rather than asking the model to narrate it.

### Mixed Findings

If most workers return `NO_REPLY` and one worker returns a medium or important finding, the final fan-in should still classify based on the substantive finding only.

### Overlapping or Repeated Updates

Existing novelty and dedupe guidance remains in force. Repeated topic updates should not become repeated proactive messages unless severity increases.

### Oversize HALO

Existing `temporal_halo_publish` compaction behavior remains unchanged. This design only changes value filtering and delivery suppression.

## Testing

### Plugin Tests

Add or update tests in this repository to verify:

- dream instructions describe the low/medium/important policy clearly
- workers are instructed to return exact `NO_REPLY` for no-op outcomes
- medium findings are explicitly HALO-only
- important findings are the only class eligible for proactive messaging
- legacy no-op sentinel language is no longer encouraged by the prompt

Primary test target:

- `tests/dream.test.ts`

### OpenClaw Runtime Tests

Add or update runtime tests to verify:

- exact `NO_REPLY` completion results are suppressed before user delivery
- legacy no-op sentinel results are suppressed before rewrite-for-user prompting
- operational completion text with no user-facing substance is not surfaced
- substantive completions still reach the delivery path

Likely runtime test surfaces:

- `src/agents/subagent-announce.format.e2e.test.ts`
- `src/agents/subagent-announce.ts`-adjacent tests

## Rollout Plan

### Phase 1. Plugin Prompt Tightening

Update Temporal Halo prompts so new runs:

- classify findings by low/medium/important value
- stop producing custom quiet-status strings
- publish silently for medium findings
- message only for important findings

### Phase 2. Runtime Suppression

Update the OpenClaw completion delivery path so silent and operational child completions are dropped before rewrite-for-user prompting.

### Phase 3. Verification

Validate the end-to-end behavior with the existing recurring dream cron job:

- low-value runs remain fully silent and do not rewrite `HALO.md`
- medium-value runs update `HALO.md` silently
- important runs update `HALO.md` and send at most one useful proactive message

### Phase 4. Release and Local Upgrade

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
- the runtime stops turning silent or operational completions into user-visible chatter

That gives the user the intended behavior:

- low-value noise stays out of both chat and `HALO.md`
- medium-value context improves `HALO.md` without interruption
- important changes still break through when the user should know now
