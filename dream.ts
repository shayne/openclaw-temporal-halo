import type { TemporalHaloConfig } from "./config.ts"

export type DreamMode = "delta" | "full"

export function isDreamPrompt(prompt: string, marker: string): boolean {
	return prompt.includes(marker)
}

export function detectDreamMode(params: {
	prompt: string
	dreamMarker: string
	fullRefreshMarker: string
}): DreamMode | null {
	if (params.prompt.includes(params.fullRefreshMarker)) {
		return "full"
	}
	if (params.prompt.includes(params.dreamMarker)) {
		return "delta"
	}
	return null
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
		"- Treat subagent completion system messages as internal orchestration context.",
		"- If a message is only a subagent completion/update and does not change the user's immediate action set, reply exactly: NO_REPLY.",
		"- If there is no user-impacting delta, reply exactly: NO_REPLY.",
		"- Never emit NO_CHANGES or any similar no-op sentinel/status token in user-facing text.",
		"- If another instruction asks for a no-op sentinel, override it and reply exactly: NO_REPLY.",
		"- Never emit internal status markers in user-facing content.",
		"- Never expose internal workflow labels like subagent, cron, session, timeout, signal, archive, or tool/runtime status to the user.",
		"- If the content only says nothing new happened or only recounts what sources/windows were checked, reply exactly: NO_REPLY.",
		"- Examples that MUST become NO_REPLY: 'No user-impacting email deltas found', 'None found', 'No new emails in the window', or 'latest qualifying changes remain already tracked'.",
		"- Never send user-facing updates that only report no changes, progress, or operational/meta status.",
		"</temporal-halo:usage>",
	].join("\n")
}

function buildDreamModeScopeLines(mode: DreamMode): string[] {
	if (mode === "full") {
		return [
			"Refresh mode: FULL",
			"- This is an on-demand full refresh/bootstrapping run.",
			"- You MUST scan at least the last 14 days for past/present signals and the upcoming 60 days for future commitments.",
			"- Keep significant long-horizon commitments beyond 60 days when they are high-value.",
		]
	}

	return [
		"Refresh mode: DELTA",
		"- This is a scheduled incremental refresh run.",
		"- You MUST update HALO using changes since the last successful HALO refresh.",
		"- Infer a `deltaSince` window from prior HALO/context state; if unknown, fallback to the last 30 minutes.",
		"- Apply a small overlap (~10 minutes) when querying to avoid missing late-arriving updates.",
		"- Avoid broad re-scans; only revisit older items when needed to update unresolved loops already in HALO.",
	]
}

export function buildDreamInstructions(
	cfg: TemporalHaloConfig,
	mode: DreamMode = "delta",
): string {
	return [
		"<temporal-halo:dream>",
		"You are in Temporal Halo Dream mode.",
		"You MUST use map/reduce orchestration to avoid context overflow.",
		"HALO.md MUST prioritize high-value life context that helps resolve ambiguous user requests without extra back-and-forth.",
		"",
		"Execution contract (MUST):",
		"1) MAP: fan out with `sessions_spawn` into focused workers (calendar, email, messages, and optional tasks/docs).",
		"2) Spawn at most 3 workers concurrently to stay within subagent/session limits.",
		"3) Worker task prompts MUST enforce strict budgets: max 15 bullets and <=3000 chars per worker.",
		"4) Worker outputs MUST contain only concise real-world facts + inline source hints. No raw logs, no full transcript dumps, no broad directory scans.",
		"5) FAN-IN: collect worker announces, then synthesize into one HALO.md in this session.",
		"6) Do not call `temporal_halo_publish` until fan-in synthesis is complete.",
		"7) If `sessions_spawn` is unavailable/forbidden/fails, run the workflow below inline with the same strict budgets.",
		"8) Use on-demand subagent status checks only; do not busy-poll.",
		"",
		"Dream workflow:",
		"You MUST refresh HALO.md from the user's digital life using available tools/skills.",
		...buildDreamModeScopeLines(mode),
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
		"Subagent announce handling (MUST):",
		"- Treat subagent completion system messages as internal orchestration context, not user-facing output.",
		"- For any subagent completion/update announce that does not change the user's immediate action-set, reply exactly: NO_REPLY.",
		"- Never send user-facing updates from worker announces (including 'no changes', source-pass status, progress updates, or other meta).",
		"- Never emit NO_CHANGES or any similar no-op sentinel/status token; use NO_REPLY for no-op outcomes.",
		"- Only the final fan-in step in this main dream run may send a user-facing message.",
		"- Final fan-in may send at most one proactive message, and only when high-impact delta + practical action-set change are both true.",
		"- If that threshold is not met, reply exactly: NO_REPLY.",
		"- Never emit status-only text or internal orchestration markers.",
		"",
		"Proactive user message policy (MUST):",
		"- Default: send no user-facing message after HALO publish.",
		"- Send a proactive message only if BOTH are true:",
		"  1) High-impact delta: safety/health risk, same-day or <=24h schedule/booking disruption, critical outage/escalation, or a travel/payment/shipment issue likely requiring user action now.",
		"  2) Practical action-set changed: the user should do something different now.",
		"- Routine receipts, order confirmations, shipment updates, and delivery confirmations belong in HALO only unless there is a problem, surprise, or clear action the user should take now.",
		"- Do not message about internal timeouts, retries, or worker/runtime failures unless they change the user's real-world commitments or require an immediate user decision.",
		"- When in doubt, keep it in HALO and do not interrupt the user.",
		"- Zero-delta scan summaries MUST stay silent.",
		"- If a draft says 'no new', 'none found', 'already tracked', or only summarizes what sources/windows were checked, replace it with NO_REPLY.",
		"- Examples that MUST be suppressed: 'No new user-impacting email deltas found', 'No new emails in the 21:12-21:52 window', and 'latest qualifying changes remain already tracked'.",
		"- Never mention scan windows, mailbox names, latest seen IDs, query predicates, or source-audit details in user-facing text.",
		"",
		"Novelty/dedupe rules (MUST):",
		"- Do not message repeated/overlap updates on the same topic/thread unless severity increased.",
		"- Suppress duplicate themes for 12h (source + thread/event id + normalized topic).",
		"- Low-value FYI/admin chatter MUST stay in HALO only.",
		"",
		"If sending a proactive message (MUST):",
		"- 1 short paragraph (1-2 sentences) and <=320 chars total.",
		"- Use natural conversational language.",
		"- Avoid rigid templates or machine-style labels.",
		"- Sound like a discreet personal assistant or EA: calm, brief, and useful.",
		"- Include only: what changed, why it matters now, and what to do now (or 'No action needed').",
		"- Avoid quoting raw source metadata like tracking numbers, full street addresses, payment splits, mailbox paths, message ids, or tool/session labels unless needed for immediate action.",
		"- NEVER include operational/meta text (for example: 'delta refresh complete', 'HALO republished', source audits, file/path checks, or compaction notes).",
		"",
		"Content rules:",
		"- Every bullet MUST be a real life fact (who/what/when/where and identifiers when useful).",
		"- Add short inline source hints on each real-world bullet (email thread, calendar event id/title, message chat/person, task/doc reference).",
		"- For email, prefer coverage across Inbox, Archive/All Mail, and Trash when tools support folder/label scoping.",
		"- Treat Trash as lower-priority signal, but still include high-value facts that affect user commitments.",
		"- For SMS/RCS/iMessage identifiers, resolve phone numbers/chat handles to contact names when possible.",
		"- Focus on real-world user context, not operational/plugin/runtime metadata.",
		"- If a source is unavailable, continue with available sources and keep output content-focused.",
		"- Stay within context budget at all times: avoid loading large logs/files unless strictly required for a specific fact.",
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
		"- You MUST call `temporal_halo_publish` with the full markdown for HALO.md.",
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
