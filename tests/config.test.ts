import { describe, expect, it } from "vitest"
import { parseConfig } from "../config.ts"

describe("parseConfig", () => {
	it("defaults haloPath + size limits", () => {
		const cfg = parseConfig({})
		expect(cfg.maxChars).toBe(25_000)
		expect(cfg.compactTargetChars).toBe(20_000)
		expect(cfg.haloPath).toContain("HALO.md")
		expect(cfg.dreamMarker).toBe("[temporal-halo:dream]")
		expect(cfg.fullRefreshMarker).toBe("[temporal-halo:full-refresh]")
	})

	it("rejects unknown keys", () => {
		expect(() => parseConfig({ wat: true })).toThrow(/unknown keys/i)
	})
})
