import type { Theme } from "@mariozechner/pi-coding-agent";
import type { TUI } from "@mariozechner/pi-tui";
import { type Component, Key, type KeybindingsManager, matchesKey } from "@mariozechner/pi-tui";
import { type Action, createInitialState, type QuestionState, reducer } from "./state.js";

export interface QuestionParams {
	question: string;
	header: string;
	options: Array<{ label: string; description: string }>;
}

export interface SelectionResult {
	answer: string;
	selectedIndex: number;
}

const KB_UP = "tui.select.up" as const;
const KB_DOWN = "tui.select.down" as const;
const KB_CONFIRM = "tui.select.confirm" as const;

export function createQuestionComponent(
	params: QuestionParams,
	theme: Theme,
	kb: KeybindingsManager,
	tui: TUI,
	done: (result: SelectionResult | null) => void,
): Component & { dispose?(): void } {
	const optionCount = params.options.length;
	let state: QuestionState = createInitialState(optionCount);
	let cachedLines: string[] | undefined;

	function refresh(): void {
		cachedLines = undefined;
		tui.requestRender();
	}

	function dispatch(action: Action): void {
		state = reducer(state, action);
		if (state.confirmed) {
			done({
				answer: params.options[state.selectedIndex!].label,
				selectedIndex: state.selectedIndex!,
			});
			return;
		}
		refresh();
	}

	function render(_width: number): string[] {
		if (cachedLines) return cachedLines;

		const lines: string[] = [];

		lines.push(theme.bold(params.question));
		lines.push("");

		for (let i = 0; i < params.options.length; i++) {
			const opt = params.options[i];
			const focused = i === state.highlightedIndex && !state.confirmed;

			if (focused) {
				lines.push(`  ${theme.fg("accent", "❯")} ${theme.bold(opt.label)}`);
				lines.push(`    ${theme.fg("muted", opt.description)}`);
			} else {
				lines.push(`    ${opt.label}`);
				lines.push(`    ${theme.fg("dim", opt.description)}`);
			}
		}

		cachedLines = lines;
		return lines;
	}

	function handleInput(data: string): void {
		if (matchesKey(data, Key.escape)) {
			done(null);
			return;
		}
		if (kb.matches(data, KB_UP)) {
			dispatch({ type: "navigateUp" });
		} else if (kb.matches(data, KB_DOWN)) {
			dispatch({ type: "navigateDown" });
		} else if (kb.matches(data, KB_CONFIRM)) {
			dispatch({ type: "selectCurrent" });
		}
	}

	function invalidate(): void {
		cachedLines = undefined;
	}

	return { render, handleInput, invalidate };
}
