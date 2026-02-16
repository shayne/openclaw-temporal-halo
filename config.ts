import os from "node:os"
import path from "node:path"

export type TemporalHaloConfig = {
	enabled: boolean
	haloPath: string
	dreamMarker: string
	maxChars: number
	compactTargetChars: number
	debug: boolean
}

const ALLOWED_KEYS = [
	"enabled",
	"haloPath",
	"dreamMarker",
	"maxChars",
	"compactTargetChars",
	"debug",
]

function assertAllowedKeys(
	value: Record<string, unknown>,
	allowed: string[],
	label: string,
): void {
	const unknown = Object.keys(value).filter((k) => !allowed.includes(k))
	if (unknown.length > 0) {
		throw new Error(`${label} has unknown keys: ${unknown.join(", ")}`)
	}
}

function resolveEnvVars(value: string): string {
	return value.replace(/\$\{([^}]+)\}/g, (_, envVar: string) => {
		const envValue = process.env[envVar]
		if (!envValue) {
			throw new Error(`Environment variable ${envVar} is not set`)
		}
		return envValue
	})
}

function expandTilde(p: string): string {
	const trimmed = p.trim()
	if (trimmed === "~") return os.homedir()
	if (trimmed.startsWith("~/")) return path.join(os.homedir(), trimmed.slice(2))
	return trimmed
}

function defaultHaloPath(): string {
	return path.join(os.homedir(), ".openclaw", "temporal-halo", "HALO.md")
}

export function parseConfig(raw: unknown): TemporalHaloConfig {
	const cfg =
		raw && typeof raw === "object" && !Array.isArray(raw)
			? (raw as Record<string, unknown>)
			: {}

	if (Object.keys(cfg).length > 0) {
		assertAllowedKeys(cfg, ALLOWED_KEYS, "temporal-halo config")
	}

	const enabled = typeof cfg.enabled === "boolean" ? cfg.enabled : true
	const haloPathRaw =
		typeof cfg.haloPath === "string" && cfg.haloPath.trim()
			? resolveEnvVars(cfg.haloPath)
			: defaultHaloPath()

	const maxChars =
		typeof cfg.maxChars === "number" && Number.isFinite(cfg.maxChars)
			? Math.trunc(cfg.maxChars)
			: 25_000
	const compactTargetChars =
		typeof cfg.compactTargetChars === "number" &&
		Number.isFinite(cfg.compactTargetChars)
			? Math.trunc(cfg.compactTargetChars)
			: 20_000

	if (compactTargetChars > maxChars) {
		throw new Error(
			`temporal-halo: compactTargetChars (${compactTargetChars}) must be <= maxChars (${maxChars})`,
		)
	}

	return {
		enabled,
		haloPath: path.resolve(expandTilde(haloPathRaw)),
		dreamMarker:
			typeof cfg.dreamMarker === "string" && cfg.dreamMarker.trim()
				? cfg.dreamMarker.trim()
				: "[temporal-halo:dream]",
		maxChars,
		compactTargetChars,
		debug: typeof cfg.debug === "boolean" ? cfg.debug : false,
	}
}

export const temporalHaloConfigSchema = {
	parse: parseConfig,
}
