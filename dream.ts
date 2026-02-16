import type { TemporalHaloConfig } from "./config.ts"

export function isDreamPrompt(prompt: string, marker: string): boolean {
	return prompt.includes(marker)
}

export function buildHaloUsageInstructions(_cfg: TemporalHaloConfig): string {
	return [
		"<temporal-halo:usage>",
		"HALO.md is a temporal map of the user's real life.",
		"You MUST treat HALO.md as first-pass context for ambiguous requests.",
		"Do not treat HALO.md as a metadata dump.",
		"- Prefer HALO.md for disambiguation (recent past / now / upcoming).",
		"- Use concrete facts first (dates, times, locations, names, confirmations) when answering ambiguous questions.",
		"- Use inline source hints attached to each item to retrieve deeper detail when needed.",
		"- Do not hallucinate missing identifiers; retrieve or ask the user.",
		"</temporal-halo:usage>",
	].join("\n")
}

export function buildDreamInstructions(cfg: TemporalHaloConfig): string {
	return [
		"<temporal-halo:dream>",
		"You are in Temporal Halo Dream mode.",
		"You MUST refresh HALO.md from the user's digital life using available tools/skills.",
		"HALO.md MUST prioritize high-value life context that helps resolve ambiguous user requests without extra back-and-forth.",
		"",
		"Acquisition priority:",
		"1) Calendar/schedule (today, next 14d, next 60d, plus important long-horizon items)",
		"2) Email/receipts (travel, reservations, shipments, invoices, confirmations, time-sensitive threads)",
		"3) Messages/chats (commitments, decisions, open loops)",
		"4) Tasks/docs/notes (if tools exist)",
		"5) Prior OpenClaw sessions (only for user commitments and open loops; do not copy meta logs)",
		"",
		"Cron wake handling:",
		"- If the base prompt says 'A scheduled reminder has been triggered', treat it as a wake signal only.",
		"- Do not send a reminder-style reply.",
		"- You MUST gather context and publish an updated HALO.md in this run.",
		"",
		"Content rules:",
		"- Every bullet MUST be a real life fact (who/what/when/where and identifiers when useful).",
		"- Add short inline source hints on each real-world bullet (email thread, calendar event id/title, message chat/person, task/doc reference).",
		"- For SMS/RCS/iMessage identifiers, resolve phone numbers/chat handles to contact names when possible.",
		"- Focus on real-world user context, not operational/plugin/runtime metadata.",
		"- If a source is unavailable, continue with available sources and keep output content-focused.",
		"",
		"Output template (MUST follow):",
		"# Temporal Halo",
		"<Write a 2-4 sentence overview describing how to use this HALO and what it contains.>",
		"",
		"## Present (Now to 24h)",
		"- ...",
		"",
		"## Near Future (Next 14d)",
		"- ...",
		"",
		"## Medium Future (15-60d)",
		"- ...",
		"",
		"## Long Horizon (60d+ high-value only)",
		"- ...",
		"",
		"## Recent Past (Last 14d)",
		"- ...",
		"",
		"Template rules:",
		"- Include only sections with high-value content; omit empty sections.",
		"- Keep bullets concise and concrete.",
		`- Hard max size: ${cfg.maxChars} chars. Aim for <=${cfg.compactTargetChars} chars.`,
		"",
		"Publishing:",
		"- You must call `temporal_halo_publish` with the full markdown for HALO.md.",
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
