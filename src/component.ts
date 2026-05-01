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

const OTHER_LABEL = "Other";
const OTHER_DESCRIPTION = "Type a custom answer";
const NEXT_LABEL = "Next";
const SUBMIT_LABEL = "Submit";
const SUBMIT_ANSWERS_LABEL = "Submit answers";
const CANCEL_LABEL = "Cancel";
const SELECTED_MARKER = "✓";
const CURSOR = "▌";
const HELP_SINGLE = "Enter to select · ↑/↓ to navigate · Esc to cancel";
const HELP_MULTI = "Space/Enter to toggle · Submit to confirm · ↑/↓ to navigate · Esc to cancel";
const HELP_BACK = "← to go back · ";

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

function buildItems(optionCount: number): QuestionItem[] {
	return [...Array.from({ length: optionCount }, () => ({ type: "option" as const })), { type: "input" }];
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

	function getMultiSelectConfirmLabel(): string {
		return currentIndex === totalQuestions - 1 ? SUBMIT_LABEL : NEXT_LABEL;
	}

	function renderQuestionLines(q: QuestionParams, state: QuestionState): string[] {
		const multiSelect = q.multiSelect ?? false;
		const lines: string[] = [];

		for (let i = 0; i < state.items.length; i++) {
			const item = state.items[i];
			const focused = !state.isSubmitFocused && i === state.highlightedIndex;
			const checked = multiSelect && state.selectedIndices.includes(i);

			if (item.type === "option") {
				const opt = q.options[i];
				const marker = multiSelect ? (checked ? "[x]" : "[ ]") : "";
				const selected = !multiSelect && state.selectedIndex === i;
				const selectedMarker = selected ? ` ${theme.fg("success", SELECTED_MARKER)}` : "";
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
					const label = selected ? theme.fg("success", theme.bold(opt.label)) : theme.bold(opt.label);
					lines.push(`${prefix}${label}${selectedMarker}`);
					lines.push(`    ${selected ? theme.fg("success", opt.description) : theme.fg("muted", opt.description)}`);
				} else {
					const label = selected ? theme.fg("success", opt.label) : opt.label;
					lines.push(`    ${label}${selectedMarker}`);
					lines.push(`    ${selected ? theme.fg("success", opt.description) : theme.fg("dim", opt.description)}`);
				}
				continue;
			}

			const otherMarker = multiSelect ? (checked ? "[x] " : "[ ] ") : "";
			const selected = !multiSelect && state.selectedIndex === i;
			const selectedMarker = selected ? ` ${theme.fg("success", SELECTED_MARKER)}` : "";
			const otherLabel = selected ? theme.fg("success", OTHER_LABEL) : OTHER_LABEL;
			if (focused) {
				const label = selected ? theme.fg("success", theme.bold(OTHER_LABEL)) : theme.bold(OTHER_LABEL);
				lines.push(`  ${theme.fg("accent", "❯")} ${otherMarker}${label}${selectedMarker}`);
				lines.push(`    ${" ".repeat(multiSelect ? 4 : 0)}${state.textInputValue}${CURSOR}`);
			} else {
				lines.push(`    ${otherMarker}${otherLabel}${selectedMarker}`);
				lines.push(
					`    ${" ".repeat(multiSelect ? 4 : 0)}${
						selected ? theme.fg("success", OTHER_DESCRIPTION) : theme.fg("dim", OTHER_DESCRIPTION)
					}`,
				);
			}
		}

		if (multiSelect) {
			const confirmLabel = getMultiSelectConfirmLabel();
			if (state.isSubmitFocused) {
				lines.push(`  ${theme.fg("accent", "❯")} ${theme.bold(confirmLabel)}`);
			} else {
				lines.push(`    ${confirmLabel}`);
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
		lines.push(theme.fg("dim", "Enter to select · ↑/↓ to navigate · ← to go back · Esc to cancel"));

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
		const multiSelect = q.multiSelect ?? false;

		if (isMultiQuestion) {
			lines.push(theme.fg("dim", `Question ${currentIndex + 1} of ${totalQuestions}`));
		}

		lines.push(theme.bold(q.question));
		lines.push("");

		lines.push(...renderQuestionLines(q, state));

		lines.push("");
		let helpText = multiSelect ? HELP_MULTI : HELP_SINGLE;
		if (isMultiQuestion && currentIndex > 0) {
			helpText = HELP_BACK + helpText;
		}
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
		if (kb.matches(data, KB_CONFIRM)) {
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

		if (params[currentIndex].multiSelect && matchesKey(data, Key.space)) {
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
