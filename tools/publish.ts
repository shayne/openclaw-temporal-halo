import { Type } from "@sinclair/typebox"
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk"
import type { TemporalHaloConfig } from "../config.ts"
import { writeHaloAtomic } from "../halo.ts"

type RegisteredTool = Parameters<OpenClawPluginApi["registerTool"]>[0]
type ExtractFn<T> = T extends (...args: infer Args) => infer Result
	? (...args: Args) => Result
	: never
type OpenClawPluginToolFactory = ExtractFn<RegisteredTool>

export type TemporalHaloToolContext = Parameters<OpenClawPluginToolFactory>[0]

function normalizeToken(value: string | undefined | null): string {
	return (value ?? "").trim().toLowerCase()
}

function normalizeMainKey(value: string | undefined | null): string {
	const trimmed = (value ?? "").trim()
	return trimmed ? trimmed.toLowerCase() : "main"
}

function normalizeAgentId(value: string | undefined | null): string {
	const raw = (value ?? "").trim()
	if (!raw) return "main"
	const lowered = raw.toLowerCase()
	const normalized = lowered
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "")
	return normalized.slice(0, 64) || "main"
}

function resolveAgentIdFromSessionKey(
	sessionKey: string | undefined | null,
): string | null {
	const raw = (sessionKey ?? "").trim()
	if (!raw) return null
	const lowered = raw.toLowerCase()
	if (!lowered.startsWith("agent:")) return null
	const parts = lowered.split(":")
	return parts.length >= 2 ? (parts[1] ?? null) : null
}

export function resolveWarningSessionKey(
	toolCtx: TemporalHaloToolContext,
): string | null {
	const cfg = toolCtx.config as unknown as {
		session?: { scope?: unknown; mainKey?: unknown }
	} | null

	if (cfg?.session?.scope === "global") {
		return "global"
	}

	const agentId =
		normalizeToken(toolCtx.agentId) ||
		normalizeToken(resolveAgentIdFromSessionKey(toolCtx.sessionKey)) ||
		"main"
	const mainKey = normalizeMainKey(
		typeof cfg?.session?.mainKey === "string" ? cfg.session.mainKey : null,
	)

	return `agent:${normalizeAgentId(agentId)}:${mainKey}`
}

export function createTemporalHaloPublishTool(params: {
	api: OpenClawPluginApi
	cfg: TemporalHaloConfig
	toolCtx: TemporalHaloToolContext
}): AnyAgentTool {
	let oversizeAttempts = 0

	return {
		name: "temporal_halo_publish",
		label: "Temporal Halo Publish",
		description: "Atomically write HALO.md with strict size enforcement.",
		parameters: Type.Object({
			markdown: Type.String({
				description: "Full markdown content for HALO.md",
			}),
		}),
		async execute(_toolCallId: string, args: { markdown: string }) {
			const markdown = typeof args.markdown === "string" ? args.markdown : ""
			const trimmed = markdown.trimEnd()
			if (!trimmed.trim()) {
				return {
					content: [
						{
							type: "text" as const,
							text: "temporal_halo_publish: markdown required",
						},
					],
					details: { ok: false, error: "markdown_required" },
				}
			}

			const chars = trimmed.length
			if (chars > params.cfg.maxChars) {
				oversizeAttempts += 1
				if (oversizeAttempts === 1) {
					return {
						content: [
							{
								type: "text" as const,
								text:
									`HALO draft is ${chars} chars (max ${params.cfg.maxChars}). ` +
									`Compact it to <=${params.cfg.compactTargetChars} chars and call temporal_halo_publish again.`,
							},
						],
						details: {
							ok: false,
							published: false,
							error: "oversize",
							chars,
							maxChars: params.cfg.maxChars,
							next: "compact_and_retry",
							targetChars: params.cfg.compactTargetChars,
							attempt: oversizeAttempts,
						},
					}
				}

				const warnKey =
					resolveWarningSessionKey(params.toolCtx) ??
					(params.toolCtx.sessionKey ? params.toolCtx.sessionKey : null)
				if (warnKey) {
					try {
						params.api.runtime.system.enqueueSystemEvent(
							`Temporal Halo warning: HALO publish still oversize (${chars} chars) after compaction attempt. HALO.md was not updated.`,
							{ sessionKey: warnKey, contextKey: "temporal-halo" },
						)
					} catch (err) {
						params.api.logger.warn(
							`temporal-halo: failed to enqueue warning system event: ${String(err)}`,
						)
					}
				}

				return {
					content: [
						{
							type: "text" as const,
							text:
								`HALO draft is still ${chars} chars (max ${params.cfg.maxChars}). ` +
								"Warning sent. HALO.md was not updated.",
						},
					],
					details: {
						ok: false,
						published: false,
						error: "oversize_after_retry",
						chars,
						maxChars: params.cfg.maxChars,
						attempt: oversizeAttempts,
						warned: Boolean(warnKey),
					},
				}
			}

			await writeHaloAtomic(params.cfg.haloPath, trimmed)
			oversizeAttempts = 0

			return {
				content: [
					{
						type: "text" as const,
						text: `Published HALO.md (${chars} chars) to ${params.cfg.haloPath}`,
					},
				],
				details: {
					ok: true,
					published: true,
					path: params.cfg.haloPath,
					chars,
				},
			}
		},
	}
}

export function registerTemporalHaloPublishTool(
	api: OpenClawPluginApi,
	cfg: TemporalHaloConfig,
) {
	api.registerTool(
		(toolCtx: TemporalHaloToolContext) =>
			createTemporalHaloPublishTool({ api, cfg, toolCtx }),
		{ name: "temporal_halo_publish" },
	)
}
