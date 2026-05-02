const ANSI_SGR_RE = /\x1b\[[0-9;]*m/g;
const ANSI_OSC8_RE = /\x1b\]8;[^\x07\x1b]*(?:\x07|\x1b\\)/g;
/** Matches pi-tui code-block opener/closer after probes strip ANSI and XML-like theme wrappers. */
const FENCE_PREFIX_RE = /^`{3}/;

/** How many physical rows may belong to one fence delimiter after `wrapTextWithAnsi`. */
const MAX_FENCE_LINE_MERGE = 8;

/**
 * Removes fenced-code delimiter lines from pi-tui `Markdown.render` output.
 * Opener/closer are passed through `codeBlockBorder`, so rows may be plain ```lang (terminal)
 * or wrapped by theme markup (e.g. tests); see pi-tui `markdown.js` `case "code"`.
 * Adjacent rows without a newline in the source are merged for matching when the TUI wrapper
 * splits a long styled fence across widths.
 */
export function stripFenceMarkers(lines: readonly string[]): string[] {
	const out: string[] = [];
	let i = 0;
	while (i < lines.length) {
		const limit = Math.min(MAX_FENCE_LINE_MERGE, lines.length - i);
		let skipped = false;
		for (let span = 1; span <= limit; span++) {
			const chunk = lines.slice(i, i + span).join("");
			if (isFenceDelimiterLine(chunk)) {
				i += span;
				skipped = true;
				break;
			}
		}
		if (skipped) continue;
		out.push(lines[i]!);
		i++;
	}
	return out;
}

function isFenceDelimiterLine(line: string): boolean {
	const noAnsi = line.replace(ANSI_SGR_RE, "").replace(ANSI_OSC8_RE, "");
	const unwrapped = noAnsi.replace(/<\/?[^>\s]+>/g, "").trim();
	// When a styled fence row is split mid-tag (for example `</mdCodeBl` + `ockBorder>`),
	// the first physical row already starts with ``` after wrapper stripping. Reject any
	// chunk that still contains raw angle brackets so we only drop it after the merged
	// rows form a complete wrapper; otherwise we would swallow the next code line too.
	if (unwrapped.includes("<") || unwrapped.includes(">")) return false;
	return FENCE_PREFIX_RE.test(unwrapped);
}
