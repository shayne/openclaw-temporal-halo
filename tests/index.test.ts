import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import { describe, expect, it } from "vitest"
import { resolveHaloDeltaPath } from "../halo.ts"
import plugin from "../index.ts"

type BeforeAgentStartHandler = (
	event: Record<string, unknown>,
	ctx: Record<string, unknown>,
) => Promise<{ prependContext: string }>

function makeApiMock(pluginConfig: Record<string, unknown>) {
	let beforeAgentStartHandler: BeforeAgentStartHandler | null = null

	const api = {
		pluginConfig,
		logger: {
			info: () => {},
			warn: () => {},
			error: () => {},
		},
		runtime: {
			system: {
				enqueueSystemEvent: () => {},
			},
		},
		on: (eventName: string, handler: BeforeAgentStartHandler) => {
			if (eventName === "before_agent_start") {
				beforeAgentStartHandler = handler
			}
		},
		registerTool: () => {},
		registerService: () => {},
	} as unknown as OpenClawPluginApi

	return {
		api,
		getBeforeAgentStartHandler: () => {
			if (!beforeAgentStartHandler) {
				throw new Error("before_agent_start handler was not registered")
			}
			return beforeAgentStartHandler
		},
	}
}

describe("Temporal Halo before_agent_start", () => {
	it("injects the sidecar delta block before the full HALO snapshot for delta dream runs", async () => {
		const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "halo-"))
		const haloPath = path.join(tmpDir, "HALO.md")
		const haloDeltaPath = resolveHaloDeltaPath(haloPath)
		await fs.writeFile(
			haloPath,
			"# Temporal Halo\n\n## Present\n- Current item",
			"utf-8",
		)
		await fs.writeFile(
			haloDeltaPath,
			"# Temporal Halo Delta\n\n## Retired\n- Removed stale item",
			"utf-8",
		)

		const { api, getBeforeAgentStartHandler } = makeApiMock({ haloPath })
		plugin.register(api)

		const result = await getBeforeAgentStartHandler()(
			{ prompt: "[temporal-halo:dream] Refresh HALO.md with recent changes." },
			{ sessionKey: "agent:main" },
		)

		const deltaIndex = result.prependContext.indexOf("<temporal-halo:delta>")
		const haloIndex = result.prependContext.indexOf("<temporal-halo:file>")

		expect(deltaIndex).toBeGreaterThan(-1)
		expect(haloIndex).toBeGreaterThan(-1)
		expect(deltaIndex).toBeLessThan(haloIndex)
		expect(result.prependContext).toContain("## Retired\n- Removed stale item")
		expect(result.prependContext).toContain("## Present\n- Current item")
	})

	it("omits the sidecar delta block for normal user turns", async () => {
		const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "halo-"))
		const haloPath = path.join(tmpDir, "HALO.md")
		const haloDeltaPath = resolveHaloDeltaPath(haloPath)
		await fs.writeFile(
			haloPath,
			"# Temporal Halo\n\n## Present\n- Current item",
			"utf-8",
		)
		await fs.writeFile(
			haloDeltaPath,
			"# Temporal Halo Delta\n\n## Added\n- New item",
			"utf-8",
		)

		const { api, getBeforeAgentStartHandler } = makeApiMock({ haloPath })
		plugin.register(api)

		const result = await getBeforeAgentStartHandler()(
			{ prompt: "what is next today?" },
			{ sessionKey: "agent:main" },
		)

		expect(result.prependContext).not.toContain("<temporal-halo:delta>")
		expect(result.prependContext).toContain("<temporal-halo:file>")
		expect(result.prependContext).toContain("## Present\n- Current item")
	})
})
