import { describe, expect, it } from "vitest"
import { parseConfig } from "../config.ts"
import { buildDreamInstructions, buildHaloUsageInstructions } from "../dream.ts"

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
	})
})

describe("buildHaloUsageInstructions", () => {
	it("tells the model to use HALO as temporal context rather than metadata", () => {
		const cfg = parseConfig({})
		const usage = buildHaloUsageInstructions(cfg)

		expect(usage).toContain("temporal map of the user's real life")
		expect(usage).toContain("Do not treat HALO.md as a metadata dump")
	})
})
