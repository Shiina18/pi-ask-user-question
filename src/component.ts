import type { Theme } from "@mariozechner/pi-coding-agent";
import {
	type Component,
	decodeKittyPrintable,
	Key,
	type KeybindingsManager,
	matchesKey,
	Text,
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

function renderQuestionText(theme: Theme, text: string, width: number): string {
	return new Text(theme.bold(text), 0, 0).render(width)[0]?.trimEnd() ?? "";
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
	const isSingleQuestionMultiSelect = totalQuestions === 1 && (params[0].multiSelect ?? false);

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
		if (state.highlightedIndex !== 0 || state.isSubmitFocused || state.confirmed) {
			questionStates[currentIndex] = {
				...state,
				highlightedIndex: 0,
				isSubmitFocused: false,
				confirmed: false,
			};
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
		} else if (isSingleQuestionMultiSelect) {
			questionStates[currentIndex] = {
				...questionStates[currentIndex],
				isSubmitFocused: true,
				confirmed: false,
			};
			refresh();
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
				goToQuestion(currentIndex + 1);
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
		const questionTabs = params.map((q, index) => {
			const answered = collectedAnswers[index] !== null;
			const box = answered ? "[x]" : "[ ]";
			const tab = `  ${box} ${q.header} `;
			if (index === currentIndex) return theme.bg("selectedBg", theme.fg("text", tab));
			return theme.fg(answered ? "success" : "dim", tab);
		});
		const showSubmitTab = isMultiQuestion || isSingleQuestionMultiSelect;
		if (!showSubmitTab) return questionTabs.join(" ");

		const activeQuestionSubmit =
			isMultiQuestion &&
			currentIndex === totalQuestions - 1 &&
			(params[currentIndex].multiSelect ?? false) &&
			questionStates[currentIndex].isSubmitFocused;
		const activeSubmit =
			currentIndex === totalQuestions ||
			(!isMultiQuestion && questionStates[0].isSubmitFocused) ||
			activeQuestionSubmit;
		const readyToSubmit = hasAllAnswers();
		const submitBox = readyToSubmit ? "[x]" : "[ ]";
		const submitTab = `  ${submitBox} ${SUBMIT_LABEL} `;
		const styledSubmit = activeSubmit
			? theme.bg("selectedBg", theme.fg("text", submitTab))
			: theme.fg(readyToSubmit ? "success" : "dim", submitTab);
		return [...questionTabs, styledSubmit].join(" ");
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
			const prefix = focused ? `${theme.fg("success", FOCUS_MARKER)} ` : "  ";
			const numberPrefix = theme.fg("dim", `${i + 1}. `);

			if (item.type === "option") {
				const opt = q.options[i];
				const descriptionPrefix = "     ";
				const descriptionStyle = chosen || focused ? "success" : "dim";
				const label = focused ? theme.bold(opt.label) : opt.label;
				const rowRest = `${checkMarker}${label}`;
				const row = `${numberPrefix}${chosen || focused ? theme.fg("success", rowRest) : rowRest}`;
				if (focused) {
					lines.push(`${prefix}${row}${selectedMarker}`);
					lines.push(`${descriptionPrefix}${theme.fg(descriptionStyle, opt.description)}`);
				} else {
					lines.push(`${prefix}${row}${selectedMarker}`);
					lines.push(`${descriptionPrefix}${theme.fg(descriptionStyle, opt.description)}`);
				}
				continue;
			}

			if (focused) {
				const hasInput = state.textInputValue.length > 0;
				const inputText = hasInput ? `${state.textInputValue}${CURSOR}` : renderPlaceholderWithCursor(theme);
				const label = hasInput ? theme.bold(inputText) : inputText;
				const rowRest = `${checkMarker}${label}`;
				const row = `${numberPrefix}${chosen || focused ? theme.fg("success", rowRest) : rowRest}`;
				lines.push(`${prefix}${row}${selectedMarker}`);
			} else {
				const inputText = state.textInputValue.length > 0 ? state.textInputValue : theme.fg("dim", OTHER_PLACEHOLDER);
				const rowRest = `${checkMarker}${inputText}`;
				const row = `${numberPrefix}${chosen ? theme.fg("success", rowRest) : rowRest}`;
				lines.push(`${prefix}${row}${selectedMarker}`);
			}
		}

		if (multiSelect) {
			const confirmLabel = getMultiSelectConfirmLabel();
			if (state.isSubmitFocused) {
				lines.push(`${theme.fg("success", FOCUS_MARKER)}    ${theme.fg("success", theme.bold(confirmLabel))}`);
			} else {
				lines.push(`     ${confirmLabel}`);
			}
		}

		return lines;
	}

	function renderReviewLines(): string[] {
		const lines: string[] = [];
		const allAnswered = hasAllAnswers();

		lines.push(renderHeaderTabs());
		lines.push("");
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

		const submitPrefix = reviewFocusedIndex === 0 ? `  ${theme.fg("success", "❯")} ` : "    ";
		const cancelPrefix = reviewFocusedIndex === 1 ? `  ${theme.fg("success", "❯")} ` : "    ";
		lines.push(
			`${submitPrefix}${reviewFocusedIndex === 0 ? theme.fg("success", theme.bold(SUBMIT_ANSWERS_LABEL)) : SUBMIT_ANSWERS_LABEL}`,
		);
		lines.push(
			`${cancelPrefix}${reviewFocusedIndex === 1 ? theme.fg("success", theme.bold(CANCEL_LABEL)) : CANCEL_LABEL}`,
		);
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

		lines.push(renderQuestionText(theme, q.question, _width));
		lines.push("");

		lines.push(...renderQuestionLines(q, state));

		lines.push("");
		const helpText = isMultiQuestion || isSingleQuestionMultiSelect ? HELP_MULTI_QUESTION : HELP_SINGLE;
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

		if ((isMultiQuestion || isSingleQuestionMultiSelect) && matchesKey(data, Key.left) && !inputFocused) {
			if (isSingleQuestionMultiSelect && state.isSubmitFocused) {
				goToQuestion(currentIndex);
				return;
			}
			if (currentIndex > 0) {
				goToQuestion(currentIndex - 1);
			}
			return;
		}

		if ((isMultiQuestion || isSingleQuestionMultiSelect) && matchesKey(data, Key.shift("tab")) && !inputFocused) {
			if (isSingleQuestionMultiSelect && state.isSubmitFocused) {
				goToQuestion(currentIndex);
				return;
			}
			if (currentIndex > 0) {
				goToQuestion(currentIndex - 1);
			}
			return;
		}

		if (
			(isMultiQuestion || isSingleQuestionMultiSelect) &&
			(matchesKey(data, Key.right) || matchesKey(data, Key.tab)) &&
			!inputFocused
		) {
			if (isSingleQuestionMultiSelect && state.isSubmitFocused) {
				return;
			}
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
