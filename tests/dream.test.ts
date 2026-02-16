import { describe, expect, it } from "vitest"
import { parseConfig } from "../config.ts"
import { buildDreamInstructions } from "../dream.ts"

describe("buildDreamInstructions", () => {
	it("explicitly overrides cron reminder relay behavior", () => {
		const cfg = parseConfig({})
		const instructions = buildDreamInstructions(cfg)

		expect(instructions).toContain("A scheduled reminder has been triggered")
		expect(instructions).toContain("Do not send a reminder-style reply")
		expect(instructions).toContain("You must call `temporal_halo_publish`")
	})
})
