# Temporal Halo Quiet Delivery Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved quiet-delivery contract so low-value Temporal Halo runs stay fully silent, medium-value runs update `HALO.md` silently, and only important changes produce a proactive user message.

**Architecture:** Land the OpenClaw runtime contract first by exposing `completionMode: "internal"` on `sessions_spawn` and by suppressing explicit silent/no-op completion payloads before user-delivery rewrite. Then tighten the plugin prompts and tests so dream workers emit only substantive findings or exact `NO_REPLY`, the final fan-in applies the low/medium/important truth table, and release/deployment happen only after both repos verify cleanly.

**Tech Stack:** TypeScript (ESM), Bun, Vitest, Biome, pnpm, Oxlint, GitHub Actions Trusted Publishing, OpenClaw CLI.

---

## Workspace Assumptions

This plan spans two repos without committing machine-specific absolute paths. Start in `openclaw-temporal-halo/`, then point `RUNTIME_REPO` at your local `openclaw/` checkout before running the runtime tasks.

```bash
export PLUGIN_REPO="$PWD"
export RUNTIME_REPO="<path-to-openclaw-checkout>"
```

Expected: no output.

## File Map

- `openclaw-temporal-halo/dream.ts`: dream-mode prompt contract; this is where the contradictory "always publish" and "last successful HALO refresh" wording must be rewritten.
- `openclaw-temporal-halo/tests/dream.test.ts`: prompt coverage for cron wake handling, `NO_REPLY`, proactive messaging, and new low/medium/important rules.
- `openclaw-temporal-halo/tests/publish.test.ts`: existing publish-tool baseline; keep read-only unless prompt changes expose a real publish-order gap.
- `openclaw-temporal-halo/.github/workflows/release.yml`: release behavior reference only; no workflow edits are planned.
- `openclaw/src/agents/tools/sessions-spawn-tool.ts`: add `completionMode` schema/validation and map `"internal"` to the existing non-user-delivery subagent path.
- `openclaw/src/config/zod-schema.agent-runtime.ts`: update only if the exported runtime/tool schema needs the new enum to stay in sync.
- `openclaw/src/agents/openclaw-tools.sessions.test.ts`: assert the public `sessions_spawn` schema exposes the new property correctly.
- `openclaw/src/agents/tools/sessions-spawn-tool.test.ts`: add acceptance/rejection coverage for `completionMode`.
- `openclaw/src/agents/subagent-announce.ts`: suppress exact `NO_REPLY`, `NO_CHANGES`, and `NO_[A-Z0-9_]+_DELTAS` completions before rewrite-for-user prompting.
- `openclaw/src/agents/subagent-announce-dispatch.ts`: keep internal completions on the requester-orchestration path and off direct user delivery.
- `openclaw/src/agents/subagent-spawn.ts`: touch only if tests show the existing `expectsCompletionMessage` plumbing is insufficient.
- `openclaw/src/agents/subagent-announce-dispatch.test.ts`: confirm queue-first behavior for internal completions still works.
- `openclaw/src/agents/subagent-announce.format.e2e.test.ts`: confirm the announce flow suppresses silent tokens and still delivers substantive completions.

## Chunk 1: OpenClaw Runtime Quiet Completion Contract

### Task 1: Expose `completionMode` on `sessions_spawn`

**Files:**
- Modify: `openclaw/src/agents/tools/sessions-spawn-tool.ts`
- Modify: `openclaw/src/agents/tools/sessions-spawn-tool.test.ts`
- Modify: `openclaw/src/agents/openclaw-tools.sessions.test.ts`
- Modify: `openclaw/src/config/zod-schema.agent-runtime.ts` (only if the schema-export test forces it)

- [ ] **Step 1: Write the failing validation tests**

```ts
it("maps completionMode=internal to non-user-delivery subagent runs", async () => {
  await tool.execute("call-internal", {
    task: "scan inbox deltas",
    runtime: "subagent",
    completionMode: "internal",
  })

  expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
    expect.objectContaining({ expectsCompletionMessage: false }),
    expect.any(Object),
  )
})

it("keeps explicit deliver mode on the normal completion-delivery path", async () => {
  await tool.execute("call-deliver", {
    task: "scan inbox deltas",
    runtime: "subagent",
    completionMode: "deliver",
  })

  expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
    expect.objectContaining({ expectsCompletionMessage: true }),
    expect.any(Object),
  )
})

it("defaults to deliver mode when completionMode is omitted", async () => {
  await tool.execute("call-default", {
    task: "scan inbox deltas",
    runtime: "subagent",
  })

  expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
    expect.objectContaining({ expectsCompletionMessage: true }),
    expect.any(Object),
  )
})

it("rejects completionMode for runtime=acp", async () => {
  const result = await tool.execute("call-acp", {
    task: "scan inbox deltas",
    runtime: "acp",
    completionMode: "internal",
  })

  expect(result.details).toMatchObject({ status: "error" })
})

it("rejects invalid completionMode values", async () => {
  const result = await tool.execute("call-invalid", {
    task: "scan inbox deltas",
    runtime: "subagent",
    completionMode: "quiet",
  })

  expect(result.details).toMatchObject({ status: "error" })
})

it("exports completionMode on the public sessions_spawn schema", () => {
  const completionModeSchema = schemaProp("sessions_spawn", "completionMode")
  expect(completionModeSchema).toMatchObject({
    type: "string",
    enum: ["deliver", "internal"],
  })
})
```

- [ ] **Step 2: Run the targeted runtime schema tests**

Run: `cd "$RUNTIME_REPO" && pnpm vitest run src/agents/tools/sessions-spawn-tool.test.ts src/agents/openclaw-tools.sessions.test.ts`

Expected: FAIL because `completionMode` is unknown, not surfaced in the tool schema, or not rejected for non-`subagent` runtimes.

- [ ] **Step 3: Implement the smallest schema/plumbing change**

```ts
const SESSIONS_SPAWN_COMPLETION_MODES = ["deliver", "internal"] as const

const completionMode =
  params.completionMode === "internal" || params.completionMode === "deliver"
    ? params.completionMode
    : undefined

if ("completionMode" in params && completionMode === undefined) {
  return jsonResult({
    status: "error",
    error: `invalid completionMode: ${String(params.completionMode)}`,
  })
}

if (completionMode && runtime !== "subagent") {
  return jsonResult({
    status: "error",
    error: `completionMode is only supported for runtime=subagent; got runtime=${runtime}`,
  })
}

const expectsCompletionMessage = completionMode !== "internal"
```

Apply the schema change in the same step:

```ts
const SessionsSpawnToolSchema = Type.Object({
  // ...
  completionMode: optionalStringEnum(SESSIONS_SPAWN_COMPLETION_MODES),
})
```

If `openclaw-tools.sessions.test.ts` fails because the exported runtime schema is stale, mirror the same enum in `src/config/zod-schema.agent-runtime.ts`. Then thread `expectsCompletionMessage` into `spawnSubagentDirect(...)` instead of introducing a second runtime-only flag unless the tests prove the existing path is insufficient.

- [ ] **Step 4: Re-run the targeted runtime schema tests**

Run: `cd "$RUNTIME_REPO" && pnpm vitest run src/agents/tools/sessions-spawn-tool.test.ts src/agents/openclaw-tools.sessions.test.ts`

Expected: PASS with `completionMode` visible on `sessions_spawn`, accepted for `runtime="subagent"`, and rejected everywhere else.

- [ ] **Step 5: Commit the schema change**

```bash
cd "$RUNTIME_REPO"
git add src/agents/tools/sessions-spawn-tool.ts \
  src/agents/tools/sessions-spawn-tool.test.ts \
  src/agents/openclaw-tools.sessions.test.ts \
  src/config/zod-schema.agent-runtime.ts
git commit -m "feat: add internal subagent completion mode"
```

### Task 2: Lock internal completion delivery to orchestration-only paths

**Files:**
- Modify: `openclaw/src/agents/subagent-announce-dispatch.test.ts`
- Modify: `openclaw/src/agents/subagent-announce.format.e2e.test.ts`
- Modify: `openclaw/src/agents/subagent-announce-dispatch.ts` (only if the current queue/direct ordering is wrong for `completionMode: "internal"`)
- Modify: `openclaw/src/agents/subagent-announce.ts` (only if orchestration visibility fails)
- Modify: `openclaw/src/agents/subagent-spawn.ts` (only if the run record is missing data the announce flow needs)

- [ ] **Step 1: Add failing behavior tests for internal completions**

```ts
it("uses queue-first delivery for internal completions", async () => {
  const result = await runSubagentAnnounceDispatch({
    expectsCompletionMessage: false,
    queue,
    direct,
  })

  expect(queue).toHaveBeenCalledTimes(1)
  expect(direct).not.toHaveBeenCalled()
  expect(result.path).toBe("queued")
})

it("keeps deliverable completions on the direct-first path", async () => {
  const result = await runSubagentAnnounceDispatch({
    expectsCompletionMessage: true,
    queue,
    direct,
  })

  expect(direct).toHaveBeenCalledTimes(1)
  expect(queue).not.toHaveBeenCalled()
  expect(result.path).toBe("direct")
})

it("falls back to descendant-result retrieval when internal announce delivery fails", async () => {
  readLatestAssistantReplyMock.mockResolvedValue(undefined)
  subagentRegistryMock.listSubagentRunsForRequester.mockReturnValue([
    {
      runId: "run-leaf-internal",
      childSessionKey: "agent:main:subagent:leaf",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "scan inbox deltas",
      cleanup: "keep",
      createdAt: 10,
      frozenResultText: "BentoBox installs increased",
      outcome: { status: "ok" },
    },
  ])

  await runSubagentAnnounceFlow({
    childSessionKey: "agent:main:subagent:leaf",
    childRunId: "run-leaf-internal",
    requesterSessionKey: "agent:main:main",
    requesterDisplayKey: "main",
    ...defaultOutcomeAnnounce,
    expectsCompletionMessage: false,
  })

  expect(agentSpy).toHaveBeenCalledTimes(1)
  expect(sendSpy).not.toHaveBeenCalled()
  expect(subagentRegistryMock.listSubagentRunsForRequester).toHaveBeenCalledWith(
    "agent:main:subagent:leaf",
    expect.objectContaining({ requesterRunId: "run-leaf-internal" }),
  )
  const call = agentSpy.mock.calls[0]?.[0] as { params?: { message?: string } }
  expect(call?.params?.message).toContain("BentoBox installs increased")
})
```

Add a matching success-path e2e test in `subagent-announce.format.e2e.test.ts`:

```ts
it("injects internal completion findings into the requester session without external delivery", async () => {
  readLatestAssistantReplyMock.mockResolvedValue("BentoBox installs increased")

  const didAnnounce = await runSubagentAnnounceFlow({
    childSessionKey: "agent:main:subagent:leaf",
    childRunId: "run-leaf-internal",
    requesterSessionKey: "agent:main:main",
    requesterDisplayKey: "main",
    ...defaultOutcomeAnnounce,
    expectsCompletionMessage: false,
  })

  expect(didAnnounce).toBe(true)
  expect(agentSpy).toHaveBeenCalledTimes(1)
  expect(sendSpy).not.toHaveBeenCalled()
  const call = agentSpy.mock.calls[0]?.[0] as { params?: { message?: string } }
  expect(call?.params?.message).toContain("BentoBox installs increased")
})
```

Together, these two tests prove the requester session still receives the internal orchestration message, even when the live completion reply is unavailable and recovery has to come from `frozenResultText`.

- [ ] **Step 2: Run the internal-delivery tests**

Run: `cd "$RUNTIME_REPO" && pnpm vitest run src/agents/subagent-announce-dispatch.test.ts src/agents/subagent-announce.format.e2e.test.ts`

Expected: FAIL if internal completions still hit direct user delivery or if the parent loses access to the child result.

- [ ] **Step 3: Implement the minimum announce-flow fix**

```ts
let recoveredInternalReply: string | undefined
if (!reply?.trim() && !expectsCompletionMessage) {
  const directChildren = subagentRegistryRuntime?.listSubagentRunsForRequester?.(
    params.childSessionKey,
    { requesterRunId: params.childRunId },
  )
  recoveredInternalReply = directChildren
    ?.find((run) => run.runId === params.childRunId)
    ?.frozenResultText?.trim()
}

const delivery = await runSubagentAnnounceDispatch({
  expectsCompletionMessage,
  queue: queueAnnouncement,
  direct: deliverAnnouncement,
})

const findings = childCompletionFindings || reply || recoveredInternalReply || "(no output)"
```

Prefer reusing the existing `expectsCompletionMessage: false` semantics. Put this recovery branch in `subagent-announce.ts` immediately before `internalEvents`/`triggerMessage` are built so internal completions still inject a `task_completion` event into the requester session via `agentSpy`, but never use `sendSpy` or any other direct external-delivery path.

- [ ] **Step 4: Re-run the internal-delivery tests**

Run: `cd "$RUNTIME_REPO" && pnpm vitest run src/agents/subagent-announce-dispatch.test.ts src/agents/subagent-announce.format.e2e.test.ts`

Expected: PASS with queue-first/no-direct behavior for internal completions and unchanged direct-first behavior for normal deliverable completions.

- [ ] **Step 5: Commit the delivery-path change**

```bash
cd "$RUNTIME_REPO"
git add src/agents/subagent-announce-dispatch.ts \
  src/agents/subagent-announce.ts \
  src/agents/subagent-spawn.ts \
  src/agents/subagent-announce-dispatch.test.ts \
  src/agents/subagent-announce.format.e2e.test.ts
git commit -m "feat: keep internal subagent completions off user delivery"
```

### Task 3: Suppress explicit silent and legacy no-op completion tokens

**Files:**
- Modify: `openclaw/src/agents/subagent-announce.ts`
- Modify: `openclaw/src/agents/subagent-announce.format.e2e.test.ts`

- [ ] **Step 1: Add failing suppression tests**

```ts
it.each(["NO_REPLY", "NO_CHANGES", "NO_EMAIL_DELTAS", "  NO_MESSAGE_DELTAS  "])(
  "suppresses exact silent completion token %s",
  async (replyText) => {
    readLatestAssistantReplyMock.mockResolvedValue(replyText)
    await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-child",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      ...defaultOutcomeAnnounce,
    })
    expect(agentSpy).not.toHaveBeenCalled()
    expect(sendSpy).not.toHaveBeenCalled()
  },
)

it("does not suppress normal prose that merely contains the word delta", async () => {
  readLatestAssistantReplyMock.mockResolvedValue("The install delta matters now")
  await runSubagentAnnounceFlow({
    childSessionKey: "agent:main:subagent:test",
    childRunId: "run-child",
    requesterSessionKey: "agent:main:main",
    requesterDisplayKey: "main",
    ...defaultOutcomeAnnounce,
  })
  expect(agentSpy).toHaveBeenCalledTimes(1)
})

it("does not suppress prose that only embeds a legacy token", async () => {
  readLatestAssistantReplyMock.mockResolvedValue("Summary: NO_EMAIL_DELTAS")
  await runSubagentAnnounceFlow({
    childSessionKey: "agent:main:subagent:test",
    childRunId: "run-child",
    requesterSessionKey: "agent:main:main",
    requesterDisplayKey: "main",
    ...defaultOutcomeAnnounce,
  })
  expect(agentSpy).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run the announce suppression test**

Run: `cd "$RUNTIME_REPO" && pnpm vitest run src/agents/subagent-announce.format.e2e.test.ts`

Expected: FAIL because legacy no-op tokens still enter the rewrite-for-user path.

- [ ] **Step 3: Implement exact-token suppression**

```ts
const trimmedReply = rawReply.trim()
const isLegacyNoOp =
  trimmedReply === "NO_REPLY" ||
  trimmedReply === "NO_CHANGES" ||
  /^NO_[A-Z0-9_]+_DELTAS$/.test(trimmedReply)

if (isLegacyNoOp) {
  return ANNOUNCE_SKIP
}
```

Keep the guard narrow: trim whitespace, match the whole string, and apply it only inside subagent completion auto-delivery.

- [ ] **Step 4: Re-run the announce suppression test**

Run: `cd "$RUNTIME_REPO" && pnpm vitest run src/agents/subagent-announce.format.e2e.test.ts src/agents/subagent-announce-dispatch.test.ts`

Expected: PASS with silent tokens skipped and substantive completions still delivered.

- [ ] **Step 5: Commit the suppression change**

```bash
cd "$RUNTIME_REPO"
git add src/agents/subagent-announce.ts \
  src/agents/subagent-announce.format.e2e.test.ts \
  src/agents/subagent-announce-dispatch.test.ts
git commit -m "feat: suppress silent subagent completion tokens"
```

## Chunk 2: Temporal Halo Prompt Policy And Tests

### Task 4: Encode the approved policy in prompt tests before rewriting the prompt

**Files:**
- Modify: `openclaw-temporal-halo/tests/dream.test.ts`

- [ ] **Step 1: Add failing assertions for the three-tier policy and runtime handoff**

```ts
expect(instructions).toContain("low")
expect(instructions).toContain("medium")
expect(instructions).toContain("important")
expect(instructions).toContain('completionMode: "internal"')
expect(instructions).toContain("workers should return exact `NO_REPLY`")
expect(instructions).not.toContain("last successful HALO refresh")
expect(instructions).not.toContain("You MUST gather context and publish an updated HALO.md in this run.")
```

Also add assertions for the silent-medium path (`publish updated HALO.md` + `reply NO_REPLY`) and for removal of legacy worker sentinel suggestions such as `NO_EMAIL_DELTAS`.

- [ ] **Step 2: Run the prompt test file**

Run: `cd "$PLUGIN_REPO" && mise x -- bunx vitest run tests/dream.test.ts`

Expected: FAIL because the current prompt still says every scheduled run must publish, still anchors delta queries to the "last successful HALO refresh", and does not mention `completionMode: "internal"` or the low/medium/important truth table.

- [ ] **Step 3: Commit the failing test-only change**

```bash
cd "$PLUGIN_REPO"
git add tests/dream.test.ts
git commit -m "test: lock quiet delivery dream prompt contract"
```

### Task 5: Rewrite `dream.ts` to match the approved low/medium/important contract

**Files:**
- Modify: `openclaw-temporal-halo/dream.ts`
- Modify: `openclaw-temporal-halo/tests/dream.test.ts`
- Verify only: `openclaw-temporal-halo/tests/publish.test.ts`

- [ ] **Step 1: Rewrite the contradictory dream prompt sections**

Replace these current rules in `dream.ts`:

- `"You MUST update HALO using changes since the last successful HALO refresh."`
- `"You MUST gather context and publish an updated HALO.md in this run."`
- `"You MUST call \`temporal_halo_publish\` with the full markdown for HALO.md."`
- `"Low-value FYI/admin chatter MUST stay in HALO only."`

with prompt text that matches the approved policy:

```ts
"Workers should return either substantive findings or exact `NO_REPLY`.",
"Spawn dream workers with `completionMode: \"internal\"`.",
"Final fan-in truth table:",
"- low: do not write HALO.md; reply exactly NO_REPLY.",
"- medium: publish HALO.md silently; reply exactly NO_REPLY.",
"- important: publish HALO.md, then send one proactive message.",
"For silent low-only runs, anchor the next delta query from the newest visible dream wake/completion timestamp; if none exists, use the most recent 30 minutes plus overlap.",
```

Keep the worker/fan-in split clear: workers may surface borderline factual deltas, but only final fan-in can decide low vs medium vs important or send a proactive message.

- [ ] **Step 2: Remove prompt encouragement for legacy quiet-status chatter**

Delete or rewrite examples and phrasing that encourage:

- scan-window narration
- unchanged-status summaries
- legacy sentinels such as `NO_EMAIL_DELTAS`
- blanket "publish every run" behavior

Make sure `buildHaloUsageInstructions(...)` and `buildDreamInstructions(...)` both converge on exact `NO_REPLY` for no-op outcomes and on internal-only handling for worker completions.

- [ ] **Step 3: Run plugin verification**

Run: `cd "$PLUGIN_REPO" && mise run lint && mise run check-types && mise x -- bunx vitest run tests/dream.test.ts tests/publish.test.ts`

Expected: PASS. `tests/dream.test.ts` should confirm the new three-tier policy, and `tests/publish.test.ts` should remain green without tool-behavior changes.

- [ ] **Step 4: Commit the prompt rewrite**

```bash
cd "$PLUGIN_REPO"
git add dream.ts tests/dream.test.ts
git commit -m "feat: quiet temporal halo dream delivery"
```

## Chunk 3: Cross-Repo Verification, Release, And Local Rollout

### Task 6: Run the full verification set before release

**Files:**
- Verify only: `openclaw-temporal-halo/dream.ts`
- Verify only: `openclaw-temporal-halo/tests/dream.test.ts`
- Verify only: `openclaw/src/agents/tools/sessions-spawn-tool.ts`
- Verify only: `openclaw/src/agents/subagent-announce.ts`

- [ ] **Step 1: Run runtime verification from the OpenClaw repo**

Run: `cd "$RUNTIME_REPO" && pnpm lint && pnpm vitest run src/agents/tools/sessions-spawn-tool.test.ts src/agents/openclaw-tools.sessions.test.ts src/agents/subagent-announce-dispatch.test.ts src/agents/subagent-announce.format.e2e.test.ts`

Expected: PASS with no schema regressions and no announce-flow failures.

- [ ] **Step 2: Run full plugin verification from this repo**

Run: `cd "$PLUGIN_REPO" && mise install && mise run lint && mise run check-types && mise run test`

Expected: PASS.

- [ ] **Step 3: Inspect both worktrees before publishing**

Run: `cd "$RUNTIME_REPO" && git status --short && cd "$PLUGIN_REPO" && git status --short`

Expected: only the intentional quiet-delivery changes are staged/committed; no unrelated files remain dirty.

### Task 7: Commit, tag, push, and wait for plugin release CI

**Files:**
- Verify only: `openclaw-temporal-halo/.github/workflows/release.yml`
- Verify only: `openclaw-temporal-halo/openclaw.plugin.json`
- Verify only: `openclaw-temporal-halo/package.json`

- [ ] **Step 1: Push the runtime changes**

```bash
cd "$RUNTIME_REPO"
git push origin HEAD
```

Expected: the OpenClaw runtime branch updates successfully.

- [ ] **Step 2: Choose and create the plugin release tag**

```bash
cd "$PLUGIN_REPO"
git tag vX.Y.Z
```

Expected: no output. Use the next semver that matches the scope of the prompt-contract change.

- [ ] **Step 3: Push the plugin branch and tag**

```bash
cd "$PLUGIN_REPO"
git push origin HEAD
git push origin vX.Y.Z
```

Expected: the branch push succeeds, then the tag push triggers the `Release` workflow in `.github/workflows/release.yml`.

- [ ] **Step 4: Wait for CI and npm publish completion**

Run: `cd "$PLUGIN_REPO" && gh run list --workflow release.yml --limit 5`

Expected: a recent `Release` run for `vX.Y.Z` appears.

Run: `cd "$PLUGIN_REPO" && gh run watch <run-id> --exit-status`

Expected: the workflow exits successfully after `Lint + typecheck + test` and `Publish npm package (prod)` complete.

### Task 8: Update the locally running plugin and verify quiet behavior with the existing cron job

**Files:**
- Verify only: local OpenClaw plugin install for id `openclaw-temporal-halo`
- Verify only: local configured `HALO.md` file (do not commit local paths)

- [ ] **Step 1: Update the installed npm plugin**

Run: `openclaw plugins update openclaw-temporal-halo`

Expected: the installed plugin updates to the newly published tag.

- [ ] **Step 2: Restart the local gateway so the updated plugin code loads**

Run: `openclaw gateway restart`

Expected: the gateway restarts cleanly.

- [ ] **Step 3: Confirm the installed plugin version**

Run: `openclaw plugins info openclaw-temporal-halo`

Expected: the reported version matches `vX.Y.Z` (or the corresponding package version) and still points at the expected install source.

- [ ] **Step 4: Trigger the existing Temporal Halo cron job manually**

Run: `openclaw cron list`

Expected: the existing Temporal Halo dream job is listed; copy its id from the table.

Run: `openclaw cron run <job-id> --expect-final --timeout 120000`

Expected: the run completes without emitting a no-op status message into the main thread.

- [ ] **Step 5: Inspect the last few cron runs**

Run: `openclaw cron runs --id <job-id> --limit 3`

Expected: the latest run is recorded successfully. Use the main-thread transcript and the configured `HALO.md` file to confirm the policy:

- low-only run: no message, no `HALO.md` rewrite
- medium-only run: `HALO.md` changed silently, no message
- important run: `HALO.md` changed and exactly one useful proactive message was sent

- [ ] **Step 6: Record the rollout result in both repos**

```bash
cd "$PLUGIN_REPO"
git status --short
cd "$RUNTIME_REPO"
git status --short
```

Expected: both repos remain clean after rollout verification.
