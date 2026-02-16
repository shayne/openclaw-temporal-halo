import type { TemporalHaloConfig } from "./config.ts"

export function isDreamPrompt(prompt: string, marker: string): boolean {
	return prompt.includes(marker)
}

export function buildHaloUsageInstructions(_cfg: TemporalHaloConfig): string {
	return [
		"<temporal-halo:usage>",
		"Use the injected HALO.md below as high-signal temporal context.",
		"HALO.md should primarily contain the user's real-world context (schedule, travel, commitments, key identifiers), not assistant/system meta.",
		"- Prefer HALO.md for disambiguation (recent past / now / upcoming).",
		"- Use Key Identifiers first for concrete values (confirmations, locators, etc.).",
		"- If a needed detail is missing, follow Retrieval Recipes to look it up using available tools/skills.",
		"- Do not hallucinate missing identifiers; retrieve or ask the user.",
		"</temporal-halo:usage>",
	].join("\n")
}

export function buildDreamInstructions(cfg: TemporalHaloConfig): string {
	return [
		"<temporal-halo:dream>",
		"You are in Temporal Halo Dream mode.",
		"Your job: refresh HALO.md with high-signal, real-world context by surveying the user’s digital life using whatever tools/skills are available.",
		"Do NOT fill HALO.md with assistant/system/plugin meta.",
		"",
		"Priority order (most important first):",
		"1) Calendar/schedule (today, next 14d, next 60d, plus important long-horizon items)",
		"2) Email/receipts (travel, reservations, shipments, invoices, confirmations, time-sensitive threads)",
		"3) Messages/chats (commitments, decisions, open loops)",
		"4) Tasks/docs/notes (if tools exist)",
		"5) Prior OpenClaw sessions (only for user commitments and open loops; do not copy meta logs)",
		"",
		"First step (capability scan):",
		"- Quickly identify which installed tools/skills can read calendar, email, and messages for THIS user.",
		"- If you have multiple choices, prefer the most direct/authoritative sources (calendar API > summaries).",
		"",
		"Hard exclusions (do not write these into HALO.md):",
		"- Cron job ids, session ids/keys, internal file paths/directories, tool allowlist/policy details.",
		"- Self-referential notes about being a bot/agent, or notes about plugin development/runtime debugging.",
		"",
		"If a source is unavailable (missing tool/auth/permissions):",
		"- Add a very small 'Access Gaps' section with 1-3 bullets: what is missing and how the user can connect/authorize it.",
		"- Still write Retrieval Recipes so a future agent (or the user) can fetch the missing details.",
		"",
		"HALO horizons:",
		"- Past: last 14 days",
		"- Future: next 60 days",
		"- Keep long-horizon exceptions if they are significant (e.g. big trip).",
		"",
		"HALO requirements:",
		"- HALO.md should be scannable and packed with real-world facts: dates, times, locations, people, join links, confirmations, tracking ids.",
		"- Use the stable schema: Present / Near Future / Medium Future / Long Horizon / Recent Past.",
		"- Include Retrieval Recipes: how to locate original sources when details are missing.",
		"- Include Key Identifiers with full values when important (sensitive allowed).",
		"- Prune any assistant/system meta from prior versions of HALO.md; keep only user-relevant content.",
		"- Keep the document compact and scannable (short bullets; no long transcripts).",
		`- Hard max size: ${cfg.maxChars} chars. Aim for <=${cfg.compactTargetChars} chars.`,
		"",
		"Publishing:",
		"- When you have the updated markdown for the entire file, call the tool `temporal_halo_publish` with the full markdown.",
		`- If the tool reports the content is oversize, compact to <=${cfg.compactTargetChars} chars and call the tool again exactly once.`,
		"- If the second publish attempt is still oversize, stop; a warning will be sent to the user and HALO.md will remain unchanged.",
		"</temporal-halo:dream>",
	].join("\n")
}

export function buildHaloBlock(params: {
	haloPath: string
	haloText: string | null
}): string {
	if (!params.haloText?.trim()) {
		return [
			"<temporal-halo:file>",
			`HALO.md not found (yet): ${params.haloPath}`,
			"To create/update it, run the Temporal Halo dream cron job.",
			"</temporal-halo:file>",
		].join("\n")
	}

	return [
		"<temporal-halo:file>",
		`Path: ${params.haloPath}`,
		"----- HALO.md BEGIN -----",
		params.haloText.trimEnd(),
		"----- HALO.md END -----",
		"</temporal-halo:file>",
	].join("\n")
}
