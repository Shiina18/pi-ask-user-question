import type { Theme } from "@mariozechner/pi-coding-agent";
import {
	type Component,
	decodeKittyPrintable,
	Key,
	type KeybindingsManager,
	matchesKey,
	type TUI,
} from "@mariozechner/pi-tui";
import { type Action, createInitialState, type QuestionItem, type QuestionState, reducer } from "./state.js";

export interface QuestionParams {
	question: string;
	header: string;
	options: Array<{ label: string; description: string }>;
}

export interface SelectionResult {
	answer: string;
	selectedIndex: number;
}

const OTHER_LABEL = "Other";
const OTHER_DESCRIPTION = "Type a custom answer";
const CURSOR = "▌";
const HELP_TEXT = "Enter to select · ↑/↓ to navigate · Esc to cancel";

const KB_UP = "tui.select.up" as const;
const KB_DOWN = "tui.select.down" as const;
const KB_CONFIRM = "tui.select.confirm" as const;

function getPrintableChar(data: string): string | undefined {
	const kitty = decodeKittyPrintable(data);
	if (kitty !== undefined) return kitty;
	const hasControlChars = [...data].some((ch) => {
		const code = ch.charCodeAt(0);
		return code < 32 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
	});
	if (!hasControlChars && data.length > 0) return data;
	return undefined;
}

export function createQuestionComponent(
	params: QuestionParams,
	theme: Theme,
	kb: KeybindingsManager,
	tui: TUI,
	done: (result: SelectionResult | null) => void,
): Component & { dispose?(): void } {
	const items: QuestionItem[] = [...params.options.map(() => ({ type: "option" as const })), { type: "input" }];
	let state: QuestionState = createInitialState(items);
	let cachedLines: string[] | undefined;

	function refresh(): void {
		cachedLines = undefined;
		tui.requestRender();
	}

	function dispatch(action: Action): void {
		state = reducer(state, action);
		if (state.confirmed) {
			const selectedIndex = state.selectedIndex!;
			const selectedItem = state.items[selectedIndex];
			if (selectedItem?.type === "input") {
				done({ answer: state.textInputValue, selectedIndex });
			} else {
				done({ answer: params.options[selectedIndex].label, selectedIndex });
			}
			return;
		}
		refresh();
	}

	function render(_width: number): string[] {
		if (cachedLines) return cachedLines;

		const lines: string[] = [];
		lines.push(theme.bold(params.question));
		lines.push("");

		for (let i = 0; i < state.items.length; i++) {
			const item = state.items[i];
			const focused = i === state.highlightedIndex;

			if (item.type === "option") {
				const opt = params.options[i];
				if (focused) {
					lines.push(`  ${theme.fg("accent", "❯")} ${theme.bold(opt.label)}`);
					lines.push(`    ${theme.fg("muted", opt.description)}`);
				} else {
					lines.push(`    ${opt.label}`);
					lines.push(`    ${theme.fg("dim", opt.description)}`);
				}
				continue;
			}

			if (focused) {
				lines.push(`  ${theme.fg("accent", "❯")} ${theme.bold(OTHER_LABEL)}`);
				lines.push(`    ${state.textInputValue}${CURSOR}`);
			} else {
				lines.push(`    ${OTHER_LABEL}`);
				lines.push(`    ${theme.fg("dim", OTHER_DESCRIPTION)}`);
			}
		}

		lines.push("");
		lines.push(theme.fg("dim", HELP_TEXT));

		cachedLines = lines;
		return lines;
	}

	function handleInput(data: string): void {
		const focusedItem = state.items[state.highlightedIndex];

		if (matchesKey(data, Key.escape)) {
			if (focusedItem?.type === "input" && state.textInputValue.length > 0) {
				dispatch({ type: "updateTextInput", text: "" });
				return;
			}
			done(null);
			return;
		}

		if (kb.matches(data, KB_UP)) {
			dispatch({ type: "navigateUp" });
			return;
		}
		if (kb.matches(data, KB_DOWN)) {
			dispatch({ type: "navigateDown" });
			return;
		}
		if (kb.matches(data, KB_CONFIRM)) {
			dispatch({ type: "selectCurrent" });
			return;
		}

		if (focusedItem?.type === "input") {
			if (matchesKey(data, Key.backspace)) {
				dispatch({ type: "updateTextInput", text: state.textInputValue.slice(0, -1) });
			} else {
				const ch = getPrintableChar(data);
				if (ch !== undefined) {
					dispatch({ type: "updateTextInput", text: state.textInputValue + ch });
				}
			}
		}
	}

	function invalidate(): void {
		cachedLines = undefined;
	}

	return { render, handleInput, invalidate };
}
