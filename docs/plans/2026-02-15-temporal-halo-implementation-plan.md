# Temporal Halo Implementation Plan

> For implementers: execute this plan step-by-step and run verification commands before committing.

**Goal:** Ship an OpenClaw plugin that injects `HALO.md` into every turn and supports a cron-triggered dream flow that updates `HALO.md` via an agent-looping publish tool with strict size controls.

**Architecture:** TypeScript plugin module (`index.ts`) with a `before_agent_start` hook for context injection and a required plugin tool `temporal_halo_publish` to atomically write `HALO.md` with the 25k/20k compaction loop + warnings.

**Tech Stack:** TypeScript (ESM), OpenClaw plugin SDK, TypeBox for tool schemas, Biome for lint/format, Vitest for unit tests, mise for tooling/tasks.

---

### Task 1: Repo Scaffold (tooling + metadata)

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `.gitignore`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `biome.json`
- Create: `mise.toml`
- Create: `openclaw.plugin.json`
- Create: `.github/workflows/ci.yml`

**Step 1: Write the failing test**

N/A (scaffold only)

**Step 2: Verify tooling commands exist**

Run:
- `mise --version`
- `mise tasks`

Expected:
- Mise installed (or user installs it); tasks are listed after `mise install`.

**Step 3: Commit**

```bash
git add .
git commit -m "chore: scaffold temporal halo plugin repo"
```

### Task 2: Plugin Config + Path Resolution

**Files:**
- Create: `config.ts`
- Test: `tests/config.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseConfig } from "../config";

describe("parseConfig", () => {
  it("defaults haloPath + size limits", () => {
    const cfg = parseConfig({});
    expect(cfg.maxChars).toBe(25_000);
    expect(cfg.compactTargetChars).toBe(20_000);
    expect(cfg.haloPath).toContain("HALO.md");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run`
Expected: FAIL (module not found / parseConfig missing)

**Step 3: Implement minimal code to pass**

Implement `parseConfig` + defaults.

**Step 4: Run tests**

Run: `bunx vitest run`
Expected: PASS

**Step 5: Commit**

```bash
git add config.ts tests/config.test.ts
git commit -m "feat: add plugin config parsing"
```

### Task 3: HALO IO Utilities (read + atomic write)

**Files:**
- Create: `halo.ts`
- Test: `tests/halo.test.ts`

**Step 1: Write the failing test**

Test atomic write (write temp + rename) and that directories are created.

**Step 2: Run test to verify it fails**

Run: `bunx vitest run`
Expected: FAIL

**Step 3: Implement minimal code**

Implement `readHalo()`, `writeHaloAtomic()`.

**Step 4: Run tests**

Run: `bunx vitest run`
Expected: PASS

**Step 5: Commit**

```bash
git add halo.ts tests/halo.test.ts
git commit -m "feat: add HALO read/write utilities"
```

### Task 4: Publish Tool (25k/20k compaction loop + warning)

**Files:**
- Create: `tools/publish.ts`
- Test: `tests/publish.test.ts`

**Step 1: Write the failing test**

- First oversize attempt returns a “compact and retry” message and does not write.
- Second oversize attempt enqueues a warning and does not write.
- Successful size writes file.

**Step 2: Run test to verify it fails**

Run: `bunx vitest run`
Expected: FAIL

**Step 3: Implement minimal code**

Implement factory-created tool with per-run attempt counter.

**Step 4: Run tests**

Run: `bunx vitest run`
Expected: PASS

**Step 5: Commit**

```bash
git add tools/publish.ts tests/publish.test.ts
git commit -m "feat: add HALO publish tool with size enforcement"
```

### Task 5: before_agent_start Hook (inject HALO + dream instructions)

**Files:**
- Create: `index.ts`
- Modify: `README.md`
- Test: `tests/inject.test.ts`

**Step 1: Write the failing test**

- When `HALO.md` exists, `before_agent_start` returns `prependContext` containing it.
- When prompt contains `[temporal-halo:dream]`, prepend includes dream instructions.

**Step 2: Run test to verify it fails**

Run: `bunx vitest run`
Expected: FAIL

**Step 3: Implement minimal code**

Register hook + tool, wire config, implement injection blocks.

**Step 4: Run tests**

Run: `bunx vitest run`
Expected: PASS

**Step 5: Commit**

```bash
git add index.ts tests/inject.test.ts README.md
git commit -m "feat: inject HALO context and dream instructions"
```

### Task 6: CI + Verification

**Files:**
- Modify: `.github/workflows/ci.yml`

**Step 1: Run local checks**

Run:
- `mise install`
- `mise run lint`
- `mise run check-types`
- `mise run test`

Expected: all PASS

**Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint/typecheck/test workflow"
```
