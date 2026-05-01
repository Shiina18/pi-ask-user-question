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
	multiSelect?: boolean;
}

export interface SelectionResult {
	answer: string;
	selectedIndex: number;
	answers?: string[];
	selectedIndices?: number[];
}

const OTHER_LABEL = "Other";
const OTHER_DESCRIPTION = "Type a custom answer";
const SUBMIT_LABEL = "Submit";
const CURSOR = "▌";
const HELP_SINGLE = "Enter to select · ↑/↓ to navigate · Esc to cancel";
const HELP_MULTI = "Space/Enter to toggle · Submit to confirm · ↑/↓ to navigate · Esc to cancel";

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
	const multiSelect = params.multiSelect ?? false;
	const items: QuestionItem[] = [...params.options.map(() => ({ type: "option" as const })), { type: "input" }];
	let state: QuestionState = createInitialState(items, multiSelect);
	let cachedLines: string[] | undefined;

	function refresh(): void {
		cachedLines = undefined;
		tui.requestRender();
	}

	function resolveMultiResult(): SelectionResult {
		const inputIndex = state.items.findIndex((item) => item.type === "input");
		const orderedIndices = state.selectedIndices.filter((idx) => idx !== inputIndex);
		if (inputIndex !== -1 && state.selectedIndices.includes(inputIndex) && state.textInputValue.length > 0) {
			orderedIndices.push(inputIndex);
		}
		const answers: string[] = [];
		for (const idx of orderedIndices) {
			const item = state.items[idx];
			if (item.type === "input") {
				answers.push(state.textInputValue);
			} else {
				answers.push(params.options[idx].label);
			}
		}
		return {
			answer: answers.join(", "),
			selectedIndex: orderedIndices[0],
			answers,
			selectedIndices: orderedIndices,
		};
	}

	function dispatch(action: Action): void {
		state = reducer(state, action);
		if (state.confirmed) {
			if (multiSelect) {
				done(resolveMultiResult());
			} else {
				const selectedIndex = state.selectedIndex!;
				const selectedItem = state.items[selectedIndex];
				if (selectedItem?.type === "input") {
					done({ answer: state.textInputValue, selectedIndex });
				} else {
					done({ answer: params.options[selectedIndex].label, selectedIndex });
				}
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
			const focused = !state.isSubmitFocused && i === state.highlightedIndex;
			const checked = multiSelect && state.selectedIndices.includes(i);

			if (item.type === "option") {
				const opt = params.options[i];
				const marker = multiSelect ? (checked ? "[x]" : "[ ]") : "";
				const prefix = focused ? `  ${theme.fg("accent", "❯")} ` : "    ";
				if (multiSelect) {
					if (focused) {
						lines.push(`${prefix}${marker} ${theme.bold(opt.label)}`);
						lines.push(`        ${theme.fg("muted", opt.description)}`);
					} else {
						lines.push(`${prefix}${marker} ${opt.label}`);
						lines.push(`        ${theme.fg("dim", opt.description)}`);
					}
				} else if (focused) {
					lines.push(`${prefix}${theme.bold(opt.label)}`);
					lines.push(`    ${theme.fg("muted", opt.description)}`);
				} else {
					lines.push(`    ${opt.label}`);
					lines.push(`    ${theme.fg("dim", opt.description)}`);
				}
				continue;
			}

			// "Other" input item
			const otherMarker = multiSelect ? (checked ? "[x] " : "[ ] ") : "";
			if (focused) {
				lines.push(`  ${theme.fg("accent", "❯")} ${otherMarker}${theme.bold(OTHER_LABEL)}`);
				lines.push(`    ${" ".repeat(multiSelect ? 4 : 0)}${state.textInputValue}${CURSOR}`);
			} else {
				lines.push(`    ${otherMarker}${OTHER_LABEL}`);
				lines.push(`    ${" ".repeat(multiSelect ? 4 : 0)}${theme.fg("dim", OTHER_DESCRIPTION)}`);
			}
		}

		if (multiSelect) {
			if (state.isSubmitFocused) {
				lines.push(`  ${theme.fg("accent", "❯")} ${theme.bold(SUBMIT_LABEL)}`);
			} else {
				lines.push(`    ${SUBMIT_LABEL}`);
			}
		}

		lines.push("");
		lines.push(theme.fg("dim", multiSelect ? HELP_MULTI : HELP_SINGLE));

		cachedLines = lines;
		return lines;
	}

	function handleInput(data: string): void {
		const focusedItem = state.items[state.highlightedIndex];
		const inputFocused = !state.isSubmitFocused && focusedItem?.type === "input";

		if (matchesKey(data, Key.escape)) {
			if (inputFocused && state.textInputValue.length > 0) {
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

		if (multiSelect && matchesKey(data, Key.space)) {
			dispatch({ type: "toggleSelection" });
			return;
		}

		if (inputFocused) {
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
