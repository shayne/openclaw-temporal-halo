import { describe, expect, it } from "vitest"
import { parseConfig } from "../config.ts"
import {
	buildDreamInstructions,
	buildHaloUsageInstructions,
	detectDreamMode,
} from "../dream.ts"

describe("buildDreamInstructions", () => {
	it("explicitly overrides cron reminder relay behavior", () => {
		const cfg = parseConfig({})
		const instructions = buildDreamInstructions(cfg)

		expect(instructions).toContain("A scheduled reminder has been triggered")
		expect(instructions).toContain("Do not send a reminder-style reply")
		expect(instructions).toContain("You MUST call `temporal_halo_publish`")
	})

	it("requires map/reduce fan-out with worker budgets before publish", () => {
		const cfg = parseConfig({})
		const instructions = buildDreamInstructions(cfg)

		expect(instructions).toContain("Execution contract (MUST):")
		expect(instructions).toContain(
			"MAP: fan out with `sessions_spawn` into focused workers",
		)
		expect(instructions).toContain("max 15 bullets and <=3000 chars per worker")
		expect(instructions).toContain(
			"Do not call `temporal_halo_publish` until fan-in synthesis is complete.",
		)
	})

	it("uses positive MUST-based steering with a strict output template", () => {
		const cfg = parseConfig({})
		const instructions = buildDreamInstructions(cfg)

		expect(instructions).toContain("Output template (MUST follow)")
		expect(instructions).toContain("## Present (Now to 24h)")
		expect(instructions).toContain("## Near Future (Next 14d)")
		expect(instructions).toContain("## Medium Future (15-60d)")
		expect(instructions).toContain("## Recent Past (Last 14d)")
		expect(instructions).toContain(
			"Include only sections with high-value content; omit empty sections.",
		)
		expect(instructions).toContain("Every bullet MUST be a real life fact")
		expect(instructions).toContain(
			"For SMS/RCS/iMessage identifiers, resolve phone numbers/chat handles to contact names when possible",
		)
		expect(instructions).toContain(
			"For email, prefer coverage across Inbox, Archive/All Mail, and Trash when tools support folder/label scoping",
		)
		expect(instructions).toContain(
			"Treat Trash as lower-priority signal, but still include high-value facts that affect user commitments",
		)
	})

	it("enforces urgent-only proactive messaging with distilled output", () => {
		const cfg = parseConfig({})
		const instructions = buildDreamInstructions(cfg)

		expect(instructions).toContain("Subagent announce handling (MUST):")
		expect(instructions).toContain("reply exactly: NO_REPLY")
		expect(instructions).toContain("Only the final fan-in step")
		expect(instructions).toContain("at most one proactive message")
		expect(instructions).toContain("Proactive user message policy (MUST):")
		expect(instructions).toContain(
			"Default: send no user-facing message after HALO publish.",
		)
		expect(instructions).toContain("Practical action-set changed")
		expect(instructions).toContain(
			"Suppress duplicate themes for 12h (source + thread/event id + normalized topic).",
		)
		expect(instructions).toContain(
			"1 short paragraph (1-2 sentences) and <=320 chars total.",
		)
		expect(instructions).toContain("Use natural conversational language.")
		expect(instructions).toContain(
			"Avoid rigid templates or machine-style labels.",
		)
		expect(instructions).toContain(
			"Routine receipts, order confirmations, shipment updates, and delivery confirmations belong in HALO only",
		)
		expect(instructions).toContain(
			"Do not message about internal timeouts, retries, or worker/runtime failures",
		)
		expect(instructions).toContain(
			"When in doubt, keep it in HALO and do not interrupt the user.",
		)
		expect(instructions).toContain(
			"Avoid quoting raw source metadata like tracking numbers, full street addresses, payment splits, mailbox paths, message ids, or tool/session labels",
		)
		expect(instructions).toContain(
			"Sound like a discreet personal assistant or EA",
		)
		expect(instructions).not.toContain("New change:")
		expect(instructions).not.toContain("Why now:")
		expect(instructions).not.toContain("Do now:")
		expect(instructions).toContain("Never emit NO_CHANGES")
		expect(instructions).not.toContain("NO_MATERIAL_DELTA")
		expect(instructions).not.toContain("Subagent ... finished")
		expect(instructions).toContain("NEVER include operational/meta text")
	})

	it("includes delta-mode guidance for scheduled refreshes", () => {
		const cfg = parseConfig({})
		const instructions = buildDreamInstructions(cfg, "delta")

		expect(instructions).toContain("Refresh mode: DELTA")
		expect(instructions).toContain(
			"update HALO using changes since the last successful HALO refresh",
		)
		expect(instructions).toContain("fallback to the last 30 minutes")
		expect(instructions).toContain("Apply a small overlap")
	})

	it("includes full-mode guidance for on-demand baseline rebuilds", () => {
		const cfg = parseConfig({})
		const instructions = buildDreamInstructions(cfg, "full")

		expect(instructions).toContain("Refresh mode: FULL")
		expect(instructions).toContain("on-demand full refresh/bootstrapping run")
		expect(instructions).toContain("scan at least the last 14 days")
		expect(instructions).toContain("upcoming 60 days")
	})
})

describe("buildHaloUsageInstructions", () => {
	it("tells the model to use HALO as temporal context rather than metadata", () => {
		const cfg = parseConfig({})
		const usage = buildHaloUsageInstructions(cfg)

		expect(usage).toContain("temporal map of the user's real life")
		expect(usage).toContain("Do not treat HALO.md as a metadata dump")
		expect(usage).toContain(
			"Treat subagent completion system messages as internal orchestration context.",
		)
		expect(usage).toContain("reply exactly: NO_REPLY")
		expect(usage).toContain(
			"Never emit internal status markers in user-facing content.",
		)
		expect(usage).toContain(
			"Never expose internal workflow labels like subagent, cron, session, timeout, signal, archive, or tool/runtime status to the user.",
		)
		expect(usage).toContain("Never emit NO_CHANGES")
		expect(usage).not.toContain("NO_MATERIAL_DELTA")
		expect(usage).toContain(
			"Never send user-facing updates that only report no changes",
		)
	})
})

describe("detectDreamMode", () => {
	it("detects delta mode with dream marker", () => {
		const cfg = parseConfig({})
		const mode = detectDreamMode({
			prompt: "please run [temporal-halo:dream]",
			dreamMarker: cfg.dreamMarker,
			fullRefreshMarker: cfg.fullRefreshMarker,
		})
		expect(mode).toBe("delta")
	})

	it("detects full mode with full refresh marker", () => {
		const cfg = parseConfig({})
		const mode = detectDreamMode({
			prompt: "please run [temporal-halo:full-refresh]",
			dreamMarker: cfg.dreamMarker,
			fullRefreshMarker: cfg.fullRefreshMarker,
		})
		expect(mode).toBe("full")
	})

	it("prefers full mode when both markers are present", () => {
		const cfg = parseConfig({})
		const mode = detectDreamMode({
			prompt:
				"run [temporal-halo:dream] and [temporal-halo:full-refresh] together",
			dreamMarker: cfg.dreamMarker,
			fullRefreshMarker: cfg.fullRefreshMarker,
		})
		expect(mode).toBe("full")
	})
})
