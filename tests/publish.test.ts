import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import { describe, expect, it, vi } from "vitest"
import type { TemporalHaloConfig } from "../config.ts"
import {
	createTemporalHaloPublishTool,
	resolveWarningSessionKey,
	type TemporalHaloToolContext,
} from "../tools/publish.ts"

function makeApiMock(params?: {
	enqueue?: (
		text: string,
		opts: { sessionKey: string; contextKey?: string | null },
	) => void
}): OpenClawPluginApi {
	return {
		runtime: {
			system: {
				enqueueSystemEvent: params?.enqueue ?? (() => {}),
			},
		},
		logger: {
			info: () => {},
			warn: () => {},
			error: () => {},
		},
		on: () => {},
		registerTool: () => {},
		registerService: () => {},
		pluginConfig: {},
	} as unknown as OpenClawPluginApi
}

describe("resolveWarningSessionKey", () => {
	it("uses global when session scope is global", () => {
		const toolCtx: TemporalHaloToolContext = {
			config: { session: { scope: "global" } } as never,
			agentId: "main",
			sessionKey: "agent:main:cron:job-1:run:abc",
		}
		expect(resolveWarningSessionKey(toolCtx)).toBe("global")
	})

	it("derives agent main session key", () => {
		const toolCtx: TemporalHaloToolContext = {
			config: { session: { mainKey: "main" } } as never,
			agentId: "ops",
			sessionKey: "agent:ops:cron:job-1:run:abc",
		}
		expect(resolveWarningSessionKey(toolCtx)).toBe("agent:ops:main")
	})
})

describe("temporal_halo_publish", () => {
	it("rejects oversize on first attempt and prompts for compaction", async () => {
		const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "halo-"))
		const haloPath = path.join(tmpDir, "HALO.md")

		const cfg: TemporalHaloConfig = {
			enabled: true,
			haloPath,
			dreamMarker: "[temporal-halo:dream]",
			maxChars: 25_000,
			compactTargetChars: 20_000,
			debug: false,
		}

		const api = makeApiMock()
		const tool = createTemporalHaloPublishTool({
			api,
			cfg,
			toolCtx: {
				config: { session: { mainKey: "main" } } as never,
				agentId: "main",
			},
		})

		const oversize = "x".repeat(25_001)
		const res = await tool.execute("t1", { markdown: oversize })
		expect(res.details).toMatchObject({
			ok: false,
			error: "oversize",
			attempt: 1,
		})
		await expect(fs.readFile(haloPath, "utf-8")).rejects.toMatchObject({
			code: "ENOENT",
		})
	})

	it("warns and does not write on second oversize attempt (no hard failure)", async () => {
		const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "halo-"))
		const haloPath = path.join(tmpDir, "HALO.md")

		const enqueue = vi.fn()
		const api = makeApiMock({ enqueue })

		const cfg: TemporalHaloConfig = {
			enabled: true,
			haloPath,
			dreamMarker: "[temporal-halo:dream]",
			maxChars: 25_000,
			compactTargetChars: 20_000,
			debug: false,
		}

		const tool = createTemporalHaloPublishTool({
			api,
			cfg,
			toolCtx: {
				config: { session: { mainKey: "main" } } as never,
				agentId: "main",
				sessionKey: "agent:main:cron:job-1:run:abc",
			},
		})

		const oversize = "x".repeat(25_001)
		await tool.execute("t1", { markdown: oversize })
		const res2 = await tool.execute("t2", { markdown: oversize })

		expect(res2.details).toMatchObject({
			ok: false,
			error: "oversize_after_retry",
			attempt: 2,
		})
		expect(enqueue).toHaveBeenCalled()
		await expect(fs.readFile(haloPath, "utf-8")).rejects.toMatchObject({
			code: "ENOENT",
		})
	})

	it("writes when within limit", async () => {
		const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "halo-"))
		const haloPath = path.join(tmpDir, "HALO.md")

		const api = makeApiMock()
		const cfg: TemporalHaloConfig = {
			enabled: true,
			haloPath,
			dreamMarker: "[temporal-halo:dream]",
			maxChars: 25_000,
			compactTargetChars: 20_000,
			debug: false,
		}

		const tool = createTemporalHaloPublishTool({
			api,
			cfg,
			toolCtx: {
				config: { session: { mainKey: "main" } } as never,
				agentId: "main",
			},
		})

		const md = "# HALO\n\nok\n"
		const res = await tool.execute("t1", { markdown: md })
		expect(res.details).toMatchObject({ ok: true, published: true })
		expect(await fs.readFile(haloPath, "utf-8")).toBe(md.trimEnd())
	})
})
