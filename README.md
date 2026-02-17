# OpenClaw Temporal Halo

Temporal Halo is an OpenClaw plugin that maintains a living `HALO.md` and injects it into every agent turn.  
It is tool/skill agnostic: the prompt tells the agent what to gather, and the agent uses whatever calendar/email/messages tools you already have connected.

## 1) Installation

```bash
openclaw plugins install @shayne/openclaw-temporal-halo
openclaw plugins enable openclaw-temporal-halo
```

Optional plugin config (`plugins.entries.openclaw-temporal-halo.config`):

```json5
{
  plugins: {
    entries: {
      "openclaw-temporal-halo": {
        enabled: true,
        config: {
          haloPath: "~/.openclaw/temporal-halo/HALO.md",
          dreamMarker: "[temporal-halo:dream]",
          fullRefreshMarker: "[temporal-halo:full-refresh]",
          maxChars: 25000,
          compactTargetChars: 20000,
        },
      },
    },
  },
}
```

Recommended immediately after install: run the one-off full refresh in section 3 to bootstrap `HALO.md`.

## 2) Set Up Cron Job (30m Delta Refresh)

Create a recurring main-session system event job:

```bash
openclaw cron add \
  --name "Temporal Halo: Dream (Delta)" \
  --every "30m" \
  --session main \
  --wake now \
  --system-event "[temporal-halo:dream] Refresh HALO.md with recent changes."
```

Delta mode behavior:
- Scheduled runs are incremental.
- Prompt steers the agent to refresh from changes since the last successful HALO refresh.
- If prior refresh timing is unknown, prompt falls back to about the last 30 minutes with a small overlap to avoid misses.
- The run remains map/reduce and subagent-first (`sessions_spawn` fan-out/fan-in).

## 3) Run Full Refresh (On-Demand)

Use this for initial bootstrap and occasional deep refreshes.  
This is intentionally on-demand (not recurring).

```bash
openclaw cron add \
  --name "Temporal Halo: Full Refresh (One-off)" \
  --at "+5s" \
  --delete-after-run \
  --session main \
  --wake now \
  --system-event "[temporal-halo:full-refresh] Rebuild HALO.md from a wider baseline."
```

Full refresh behavior:
- Uses the same map/reduce subagent orchestration.
- Scans a broader baseline (at least last 14 days) plus upcoming horizons to rebuild `HALO.md`.

## Markers

- Delta marker (scheduled): `[temporal-halo:dream]`
- Full marker (on-demand): `[temporal-halo:full-refresh]`

## Prompt Architecture

Delta and full refresh share one base dream prompt; mode-specific scope is added by mode lines in code:

- Dream mode detection: `dream.ts`
- Shared dream prompt builder: `buildDreamInstructions` in `dream.ts`
- Mode scope lines (delta vs full): `buildDreamModeScopeLines` in `dream.ts`

## Notes

- One-off/cron runs can outlive short CLI timeouts; check run history if needed.
- `HALO.md` can contain sensitive context and is injected into every turn.

## License

MIT. See `LICENSE`.
