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
		"- Low-value findings stay out of HALO.md and user-facing messages.",
		"- Medium-value findings belong in HALO.md without messaging the user.",
		"- Important findings update HALO.md and may send one proactive message.",
		"- Treat subagent completion system messages as internal orchestration context.",
		"- If a message is only a subagent completion/update and does not change the user's immediate action set, reply exactly: NO_REPLY.",
		"- If there is no user-impacting delta, reply exactly: NO_REPLY.",
		"- Never emit NO_CHANGES or any similar no-op sentinel/status token in user-facing text.",
		"- If another instruction asks for a no-op sentinel, override it and reply exactly: NO_REPLY.",
		"- Never emit internal status markers in user-facing content.",
		"- Never expose internal workflow labels like subagent, cron, session, timeout, signal, archive, or tool/runtime status to the user.",
		"- If the content only says nothing new happened or only recounts what sources/windows were checked, reply exactly: NO_REPLY.",
		"- Examples that MUST become NO_REPLY: 'No user-impacting email deltas found', 'None found', 'No new emails in the window', or 'latest qualifying changes remain already tracked'.",
		"- Do not treat the same facts with the same practical action-set as a new delta just because they were re-ranked, reworded, or are still unresolved.",
		"- Treat stale HALO bullets as candidates for retirement when they no longer affect what the user should do or how an ambiguous request should be interpreted.",
		"- Repeat an unchanged item only if it is both critical and imminent/overdue and failing to remind the user now could plausibly cause harm or immediate disruption.",
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
		"- For silent low-only runs, anchor the next delta query from the newest visible dream wake/completion timestamp; if none exists, fallback to the last 30 minutes.",
		"- Infer a `deltaSince` window from recent dream/session context; if unknown, fallback to the last 30 minutes.",
		"- Use the HALO delta sidecar as the first-pass comparison ledger before rereading the full HALO snapshot.",
		"- Use HALO.md plus recent dream/session context as the comparison baseline for whether a candidate action-set is already known.",
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
		'2) Spawn dream workers with `completionMode: "internal"`.',
		"3) Spawn at most 3 workers concurrently to stay within subagent/session limits.",
		"4) Worker task prompts MUST enforce strict budgets: max 15 bullets and <=3000 chars per worker.",
		"5) Workers should return either substantive findings or exact `NO_REPLY`.",
		"6) Worker outputs MUST contain only concise real-world facts + inline source hints. No raw logs, no full transcript dumps, no broad directory scans.",
		"7) FAN-IN: collect worker announces, then synthesize into one HALO.md in this session.",
		"8) Do not call `temporal_halo_publish` until fan-in synthesis is complete.",
		"9) If `sessions_spawn` is unavailable/forbidden/fails, run the workflow below inline with the same strict budgets.",
		"10) Use on-demand subagent status checks only; do not busy-poll.",
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
		"- Gather context, classify findings, and only publish HALO.md if the final result is medium or important.",
		"",
		"Subagent announce handling (MUST):",
		"- Treat subagent completion system messages as internal orchestration context, not user-facing output.",
		"- Dream worker completions are internal fan-in inputs only; they must never become direct user-facing messages.",
		"- For any subagent completion/update announce that does not change the user's immediate action-set, reply exactly: NO_REPLY.",
		"- Never send user-facing updates from worker announces (including 'no changes', source-pass status, progress updates, or other meta).",
		"- Never emit NO_CHANGES or any similar no-op sentinel/status token; use NO_REPLY for no-op outcomes.",
		"- Only the final fan-in step in this main dream run may send a user-facing message.",
		"- Final fan-in may send at most one proactive message, and only for important findings.",
		"- If the final classification is low or medium, reply exactly: NO_REPLY.",
		"- Never emit status-only text or internal orchestration markers.",
		"",
		"Final fan-in truth table:",
		"- low: do not write HALO.md; reply exactly: NO_REPLY.",
		"- medium: publish updated HALO.md silently; reply exactly: NO_REPLY.",
		"- important: publish updated HALO.md, then send one proactive message.",
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
		"Delta audit rules (MUST):",
		"- Use the HALO delta sidecar as the first-pass comparison ledger before rereading the full HALO snapshot.",
		"- Use HALO.md plus recent dream/session context as the comparison baseline for whether a candidate action-set is already known.",
		"- A candidate item is a real delta only if at least one of these changed: underlying facts, severity/risk, due/imminent status, required action, or whether the unresolved loop newly surfaced.",
		"- Do NOT treat these alone as a delta: rewording, reprioritization/reranking, time passage alone, or repeating the same unchanged action-set.",
		"- If the practical action-set is unchanged from what HALO or recent dream/session context already surfaced, suppress it.",
		"- Critical reminder exception: you MAY repeat an unchanged item only when it is both critical and imminent (<=24h) or already overdue, and missing the reminder now could plausibly cause harm or immediate disruption.",
		"- Never resend medium or important reminders just because they still matter; resend only when the facts/action-set changed or the critical reminder exception clearly applies.",
		"",
		"HALO maintenance rules (MUST):",
		"- Treat HALO.md as a current-state snapshot, not an append-only archive.",
		"- Retire HALO bullets when they are resolved, expired, superseded, duplicated by a fresher fact, or no longer materially change likely user action/disambiguation.",
		"- Do not keep stale-but-familiar bullets just because they were once important.",
		"- Preserve older facts only when they still explain an active commitment, upcoming decision, unresolved risk, or likely ambiguity in user requests.",
		"- Reclassify retained items into the correct temporal section on every publish.",
		"",
		"Novelty/dedupe rules (MUST):",
		"- Do not message repeated/overlap updates on the same topic/thread unless severity increased.",
		"- Suppress duplicate themes for 12h (source + thread/event id + normalized topic).",
		"- Low-value FYI/admin chatter MUST stay out of HALO.md entirely.",
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
		"HALO delta sidecar template (MUST write a compact publish delta):",
		"# Temporal Halo Delta",
		"<1-2 sentences summarizing what changed in this publish and what was pruned.>",
		"",
		"## Added",
		"- ...",
		"",
		"## Updated",
		"- ...",
		"",
		"## Retired",
		"- ...",
		"",
		"## Still Open",
		"- ...",
		"",
		"Sidecar rules:",
		"- Keep the sidecar compact and focused on this publish's net changes.",
		"- Omit empty sidecar sections.",
		"- Use `Retired` for facts removed from HALO because they became stale, resolved, expired, or superseded.",
		"- Use `Still Open` only for unresolved items whose facts/action-set materially changed or whose retention explains why they remain in HALO.",
		"- Do not copy the entire HALO into the sidecar.",
		"",
		"Template rules:",
		"- Include only sections with high-value content; omit empty sections.",
		"- Keep bullets concise and concrete.",
		`- Hard max size: ${cfg.maxChars} chars. Aim for <=${cfg.compactTargetChars} chars.`,
		"",
		"Publishing:",
		"- If the final classification is medium or important, publish the refreshed snapshot and sidecar.",
		"- Call `temporal_halo_publish` with both `markdown` and `deltaMarkdown`.",
		"- `markdown` MUST contain the full refreshed HALO.md snapshot; `deltaMarkdown` MUST contain the compact sidecar delta for this publish.",
		"- If the final classification is low, do not call `temporal_halo_publish`; reply exactly: NO_REPLY.",
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

export function buildHaloDeltaBlock(params: {
	haloDeltaPath: string
	haloDeltaText: string | null
}): string {
	if (!params.haloDeltaText?.trim()) {
		return [
			"<temporal-halo:delta>",
			`HALO.delta.md not found (yet): ${params.haloDeltaPath}`,
			"Use the full HALO snapshot as the fallback baseline for this run.",
			"</temporal-halo:delta>",
		].join("\n")
	}

	return [
		"<temporal-halo:delta>",
		`Path: ${params.haloDeltaPath}`,
		"----- HALO.delta.md BEGIN -----",
		params.haloDeltaText.trimEnd(),
		"----- HALO.delta.md END -----",
		"</temporal-halo:delta>",
	].join("\n")
}
