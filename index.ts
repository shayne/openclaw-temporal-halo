import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import { parseConfig, temporalHaloConfigSchema } from "./config.ts"
import {
	buildDreamInstructions,
	buildHaloBlock,
	buildHaloUsageInstructions,
	isDreamPrompt,
} from "./dream.ts"
import { readHaloFile } from "./halo.ts"
import { registerTemporalHaloPublishTool } from "./tools/publish.ts"

export default {
	id: "openclaw-temporal-halo",
	name: "Temporal Halo",
	description: "Always-on temporal HALO.md context + cron-driven dreaming",
	configSchema: temporalHaloConfigSchema,

	register(api: OpenClawPluginApi) {
		const cfg = parseConfig(api.pluginConfig)

		if (!cfg.enabled) {
			api.logger.info("temporal-halo: disabled via plugin config")
			return
		}

		registerTemporalHaloPublishTool(api, cfg)

		api.on(
			"before_agent_start",
			async (event: Record<string, unknown>, ctx: Record<string, unknown>) => {
				const prompt = typeof event.prompt === "string" ? event.prompt : ""
				const isDream = isDreamPrompt(prompt, cfg.dreamMarker)

				let haloText: string | null = null
				try {
					haloText = await readHaloFile(cfg.haloPath)
				} catch (err) {
					api.logger.warn(
						`temporal-halo: failed reading HALO.md: ${String(err)}`,
					)
				}

				const parts: string[] = []
				parts.push(buildHaloUsageInstructions(cfg))
				if (isDream) {
					parts.push(buildDreamInstructions(cfg))
				}
				parts.push(buildHaloBlock({ haloPath: cfg.haloPath, haloText }))

				if (cfg.debug) {
					const sessionKey =
						typeof ctx.sessionKey === "string" ? ctx.sessionKey : ""
					api.logger.info(
						`temporal-halo: injecting HALO context (${haloText?.length ?? 0} chars) sessionKey=${sessionKey}`,
					)
				}

				return { prependContext: parts.join("\n\n") }
			},
		)
	},
}
