# OpenClaw Temporal Halo

Temporal Halo is an OpenClaw plugin that maintains a living markdown document (`HALO.md`) describing your recent past, present, and future. The plugin injects `HALO.md` into every agent turn and provides a scheduled “dream” flow to keep it up to date.

This plugin is intentionally tool/skill agnostic: it does not hardcode email/calendar/chat APIs. Instead, a dream run tells the agent what to look for (calendar, email, messages, etc.) and the agent uses whatever tools/skills you have installed and authorized.

## How It Works

- **Always-on context:** `HALO.md` is prepended to every agent turn.
- **Scheduled dreaming:** OpenClaw cron triggers a dream run that refreshes `HALO.md`.
- **Guardrails:** the plugin enforces a size budget and will compact and/or skip writes rather than growing without bound.

## Install

```bash
openclaw plugins install @shayne/openclaw-temporal-halo
openclaw plugins enable openclaw-temporal-halo
```

## Configure (Optional)

Plugin config lives under `plugins.entries.openclaw-temporal-halo.config` in your OpenClaw config.

Common keys:
- `haloPath` (default: `~/.openclaw/temporal-halo/HALO.md`)
- `dreamMarker` (default: `[temporal-halo:dream]`)

Example:

```json5
{
  plugins: {
    entries: {
      "openclaw-temporal-halo": {
        enabled: true,
        config: {
          haloPath: "~/.openclaw/temporal-halo/HALO.md",
          dreamMarker: "[temporal-halo:dream]",
        },
      },
    },
  },
}
```

## Set Up Dreaming (OpenClaw Cron)

Temporal Halo uses OpenClaw’s built-in cron scheduler (no OS cron). Any cron message that contains the marker (default `[temporal-halo:dream]`) will run in “dream mode” and refresh `HALO.md`.

Recommended: create a repeating **main-session system event** job (every 30 minutes). This keeps dream runs aligned with your main agent context and avoids isolated-session drift. Keep the event text short: the plugin injects the detailed dream instructions automatically.

```bash
openclaw cron add \
  --name "Temporal Halo: Dream" \
  --every "30m" \
  --session main \
  --wake now \
  --system-event "[temporal-halo:dream] Refresh HALO.md from calendar, email, messages, and recent conversations."
```

## What Dreaming Will Try To Pull In

Dream runs are intentionally provider-agnostic. They use whichever tools/skills you’ve connected to gather high-signal, real-world context such as:

- Calendar and schedule (today, next 14 days, next 60 days)
- Email and receipts (reservations, confirmations, shipments, invoices)
- Messages and chats (commitments, decisions, open loops)
- Tasks/notes/docs (if you have tools for them)

If a source isn’t available (missing tool, missing auth, permissions), the dream prompt instructs the agent to record the gap in `HALO.md` and include “retrieval recipes” so you can fill it in later.

## HALO.md Shape (High Level)

`HALO.md` is maintained in a stable, scannable structure so agents can quickly find:

- Present (Now to 24h)
- Near Future (Next 14d)
- Medium Future (15–60d)
- Long Horizon (60d+ important)
- Recent Past (Last 14d)
- Retrieval Recipes (tool/skill agnostic pointers)
- Key Identifiers (full values allowed: confirmations, locators, etc.)

## Prompt Sources

The exact prompt text is in this repo:

- Dream instructions: [`buildDreamInstructions`](./dream.ts#L20)
- Usage/injection instructions: [`buildHaloUsageInstructions`](./dream.ts#L7)

## Security Notes

- `HALO.md` may contain sensitive personal identifiers and is injected into every agent turn.
- Treat this as equivalent to pasting `HALO.md` into every prompt.
- If you don’t want that, don’t enable this plugin.

## License

MIT. See `LICENSE`.
