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

export type QuestionResult = SelectionResult | null;

const OTHER_PLACEHOLDER = "Type something";
const NEXT_LABEL = "Next";
const SUBMIT_LABEL = "Submit";
const SUBMIT_ANSWERS_LABEL = "Submit answers";
const CANCEL_LABEL = "Cancel";
const SELECTED_MARKER = "✓";
const CURSOR = "▌";
const FOCUS_MARKER = "❯";
const HELP_SINGLE = "Enter/Space to select · ↑/↓ to navigate · Esc to cancel";
const HELP_MULTI_QUESTION = "Enter/Space to select · Tab/Arrow keys to navigate · Esc to cancel";

const KB_UP = "tui.select.up" as const;
const KB_DOWN = "tui.select.down" as const;
const KB_CONFIRM = "tui.select.confirm" as const;

function boldText(theme: Theme, text: string): string {
	return `\x1b[1m${theme.bold(text)}\x1b[22m`;
}

function renderPlaceholderWithCursor(theme: Theme): string {
	return theme.inverse(OTHER_PLACEHOLDER[0]) + theme.fg("dim", OTHER_PLACEHOLDER.slice(1));
}

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

function buildItems(optionCount: number): QuestionItem[] {
	return [...Array.from({ length: optionCount }, () => ({ type: "option" as const })), { type: "input" }];
}

function getNumberShortcutIndex(data: string): number | undefined {
	if (!/^[1-9]$/.test(data)) return undefined;
	return Number(data) - 1;
}

function resolveResult(params: QuestionParams, state: QuestionState): SelectionResult {
	const multiSelect = params.multiSelect ?? false;
	const inputIndex = state.items.findIndex((item) => item.type === "input");

	if (multiSelect) {
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

	const selectedIndex = state.selectedIndex!;
	const selectedItem = state.items[selectedIndex];
	if (selectedItem?.type === "input") {
		return { answer: state.textInputValue, selectedIndex };
	}
	return { answer: params.options[selectedIndex].label, selectedIndex };
}

export function createQuestionComponent(
	params: QuestionParams[],
	theme: Theme,
	kb: KeybindingsManager,
	tui: TUI,
	done: (results: QuestionResult[] | null) => void,
): Component & { dispose?(): void } {
	const isMultiQuestion = params.length > 1;
	const totalQuestions = params.length;

	const questionStates: QuestionState[] = params.map((q) =>
		createInitialState(buildItems(q.options.length), q.multiSelect ?? false),
	);

	const collectedAnswers: QuestionResult[] = new Array(totalQuestions).fill(null);
	let currentIndex = 0;
	let reviewFocusedIndex = 0;
	let cachedLines: string[] | undefined;

	function refresh(): void {
		cachedLines = undefined;
		tui.requestRender();
	}

	function goToQuestion(index: number): void {
		currentIndex = index;
		if (currentIndex >= totalQuestions) {
			refresh();
			return;
		}
		const state = questionStates[currentIndex];
		if (!state.multiSelect && state.selectedIndex !== null) {
			questionStates[currentIndex] = {
				...state,
				highlightedIndex: state.selectedIndex,
				isSubmitFocused: false,
				confirmed: false,
			};
		} else if (state.confirmed) {
			questionStates[currentIndex] = { ...state, confirmed: false };
		}
		refresh();
	}

	function goToReview(): void {
		currentIndex = totalQuestions;
		reviewFocusedIndex = 0;
		refresh();
	}

	function goToNextQuestion(): void {
		if (currentIndex < totalQuestions - 1) {
			goToQuestion(currentIndex + 1);
		} else if (isMultiQuestion) {
			goToReview();
		}
	}

	function resolveAnswer(index: number): QuestionResult {
		const state = questionStates[index];
		if ((params[index].multiSelect ?? false) && state.selectedIndices.length === 0) {
			return null;
		}
		return resolveResult(params[index], state);
	}

	function recordAnswer(index: number): void {
		collectedAnswers[index] = resolveAnswer(index);
	}

	function hasAllAnswers(): boolean {
		return collectedAnswers.every((answer) => answer !== null && answer.answer.length > 0);
	}

	function dispatch(action: Action): void {
		questionStates[currentIndex] = reducer(questionStates[currentIndex], action);
		const state = questionStates[currentIndex];
		const multiSelect = params[currentIndex].multiSelect ?? false;

		if (multiSelect && !state.confirmed) {
			recordAnswer(currentIndex);
		}

		if (state.confirmed) {
			recordAnswer(currentIndex);

			if (currentIndex < totalQuestions - 1) {
				currentIndex++;
				refresh();
				return;
			}

			if (isMultiQuestion) {
				goToReview();
				return;
			}

			done(collectedAnswers);
			return;
		}
		refresh();
	}

	function focusItem(index: number): void {
		questionStates[currentIndex] = {
			...questionStates[currentIndex],
			highlightedIndex: index,
			isSubmitFocused: false,
			confirmed: false,
		};
	}

	function getMultiSelectConfirmLabel(): string {
		return currentIndex === totalQuestions - 1 ? SUBMIT_LABEL : NEXT_LABEL;
	}

	function renderHeaderTabs(): string {
		return params
			.map((q, index) => {
				const tab = `□ ${q.header}`;
				if (index === currentIndex) return theme.bg("selectedBg", tab);
				return theme.fg("dim", tab);
			})
			.join(" ");
	}

	function renderQuestionLines(q: QuestionParams, state: QuestionState): string[] {
		const multiSelect = q.multiSelect ?? false;
		const lines: string[] = [];

		for (let i = 0; i < state.items.length; i++) {
			const item = state.items[i];
			const focused = !state.isSubmitFocused && i === state.highlightedIndex;
			const checked = multiSelect && state.selectedIndices.includes(i);
			const selected = !multiSelect && state.selectedIndex === i;
			const chosen = checked || selected;
			const selectedMarker = selected ? ` ${theme.fg("success", SELECTED_MARKER)}` : "";
			const checkMarker = multiSelect ? `${checked ? "[x]" : "[ ]"} ` : "";
			const prefix = focused ? `${theme.fg("accent", FOCUS_MARKER)} ` : "  ";
			const numberPrefix = `${i + 1}. `;

			if (item.type === "option") {
				const opt = q.options[i];
				const descriptionPrefix = "     ";
				const descriptionStyle = chosen ? "success" : focused ? "muted" : "dim";
				if (focused) {
					const rowContent = `${numberPrefix}${checkMarker}${theme.bold(opt.label)}`;
					const row = chosen ? theme.fg("success", rowContent) : rowContent;
					lines.push(`${prefix}${row}${selectedMarker}`);
					lines.push(`${descriptionPrefix}${theme.fg(descriptionStyle, opt.description)}`);
				} else {
					const rowContent = `${numberPrefix}${checkMarker}${opt.label}`;
					const row = chosen ? theme.fg("success", rowContent) : rowContent;
					lines.push(`${prefix}${row}${selectedMarker}`);
					lines.push(`${descriptionPrefix}${theme.fg(descriptionStyle, opt.description)}`);
				}
				continue;
			}

			if (focused) {
				const hasInput = state.textInputValue.length > 0;
				const inputText = hasInput ? `${state.textInputValue}${CURSOR}` : renderPlaceholderWithCursor(theme);
				const label = hasInput ? theme.bold(inputText) : inputText;
				const rowContent = `${numberPrefix}${checkMarker}${label}`;
				const row = chosen ? theme.fg("success", rowContent) : rowContent;
				lines.push(`${prefix}${row}${selectedMarker}`);
			} else {
				const inputText = state.textInputValue.length > 0 ? state.textInputValue : theme.fg("dim", OTHER_PLACEHOLDER);
				const rowContent = `${numberPrefix}${checkMarker}${inputText}`;
				const row = chosen ? theme.fg("success", rowContent) : rowContent;
				lines.push(`${prefix}${row}${selectedMarker}`);
			}
		}

		if (multiSelect) {
			const confirmLabel = getMultiSelectConfirmLabel();
			if (state.isSubmitFocused) {
				lines.push(`${theme.fg("accent", FOCUS_MARKER)}    ${theme.bold(confirmLabel)}`);
			} else {
				lines.push(`     ${confirmLabel}`);
			}
		}

		return lines;
	}

	function renderReviewLines(): string[] {
		const lines: string[] = [];
		const allAnswered = hasAllAnswers();

		lines.push(theme.fg("dim", `Question ${totalQuestions + 1} of ${totalQuestions + 1}`));
		lines.push(theme.bold("Review your answers"));
		lines.push("");

		if (!allAnswered) {
			lines.push(theme.fg("warning", "You have not answered all questions"));
			lines.push("");
		}

		for (let i = 0; i < totalQuestions; i++) {
			const answer = collectedAnswers[i];
			if (!answer) continue;
			lines.push(`  ${params[i].question}`);
			lines.push(`    ${theme.fg("success", answer.answer)}`);
		}

		if (collectedAnswers.some((answer) => answer !== null)) {
			lines.push("");
		}

		const submitPrefix = reviewFocusedIndex === 0 ? `  ${theme.fg("accent", "❯")} ` : "    ";
		const cancelPrefix = reviewFocusedIndex === 1 ? `  ${theme.fg("accent", "❯")} ` : "    ";
		lines.push(`${submitPrefix}${reviewFocusedIndex === 0 ? theme.bold(SUBMIT_ANSWERS_LABEL) : SUBMIT_ANSWERS_LABEL}`);
		lines.push(`${cancelPrefix}${reviewFocusedIndex === 1 ? theme.bold(CANCEL_LABEL) : CANCEL_LABEL}`);
		lines.push("");
		lines.push(theme.fg("dim", "Enter/Space to select · ↑/↓ to navigate · ← to go back · Esc to cancel"));

		return lines;
	}

	function render(_width: number): string[] {
		if (cachedLines) return cachedLines;

		if (isMultiQuestion && currentIndex === totalQuestions) {
			cachedLines = renderReviewLines();
			return cachedLines;
		}

		const lines: string[] = [];
		const q = params[currentIndex];
		const state = questionStates[currentIndex];

		lines.push(renderHeaderTabs());
		lines.push("");

		lines.push(boldText(theme, q.question));
		lines.push("");

		lines.push(...renderQuestionLines(q, state));

		lines.push("");
		const helpText = isMultiQuestion ? HELP_MULTI_QUESTION : HELP_SINGLE;
		lines.push(theme.fg("dim", helpText));

		cachedLines = lines;
		return lines;
	}

	function handleReviewInput(data: string): void {
		if (matchesKey(data, Key.escape)) {
			done(null);
			return;
		}
		if (matchesKey(data, Key.left) || matchesKey(data, Key.shift("tab"))) {
			goToQuestion(totalQuestions - 1);
			return;
		}
		if (kb.matches(data, KB_UP) || kb.matches(data, KB_DOWN)) {
			reviewFocusedIndex = reviewFocusedIndex === 0 ? 1 : 0;
			refresh();
			return;
		}
		if (kb.matches(data, KB_CONFIRM) || matchesKey(data, Key.space)) {
			if (reviewFocusedIndex === 1) {
				done(null);
				return;
			}
			done(collectedAnswers);
		}
	}

	function handleInput(data: string): void {
		if (isMultiQuestion && currentIndex === totalQuestions) {
			handleReviewInput(data);
			return;
		}

		const state = questionStates[currentIndex];
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

		if (isMultiQuestion && matchesKey(data, Key.left) && !inputFocused) {
			if (currentIndex > 0) {
				goToQuestion(currentIndex - 1);
			}
			return;
		}

		if (isMultiQuestion && matchesKey(data, Key.shift("tab")) && !inputFocused) {
			if (currentIndex > 0) {
				goToQuestion(currentIndex - 1);
			}
			return;
		}

		if (isMultiQuestion && (matchesKey(data, Key.right) || matchesKey(data, Key.tab)) && !inputFocused) {
			goToNextQuestion();
			return;
		}

		if (
			isMultiQuestion &&
			params[currentIndex].multiSelect &&
			state.isSubmitFocused &&
			(kb.matches(data, KB_CONFIRM) || matchesKey(data, Key.space))
		) {
			recordAnswer(currentIndex);
			goToNextQuestion();
			return;
		}

		const shortcutIndex = getNumberShortcutIndex(data);
		if (shortcutIndex !== undefined && !inputFocused && !state.isSubmitFocused && shortcutIndex < state.items.length) {
			focusItem(shortcutIndex);
			if (state.items[shortcutIndex].type === "input") {
				refresh();
			} else {
				dispatch({ type: "selectCurrent" });
			}
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

		if (matchesKey(data, Key.space) && !inputFocused) {
			dispatch({ type: params[currentIndex].multiSelect ? "toggleSelection" : "selectCurrent" });
			return;
		}

		if (inputFocused) {
			if (matchesKey(data, Key.backspace)) {
				dispatch({ type: "updateTextInput", text: state.textInputValue.slice(0, -1) });
			} else if (matchesKey(data, Key.space) && state.textInputValue.length === 0) {
				return;
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
