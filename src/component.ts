import type { Theme } from "@mariozechner/pi-coding-agent";
import { highlightCode } from "@mariozechner/pi-coding-agent";
import {
	type Component,
	decodeKittyPrintable,
	Key,
	type KeybindingsManager,
	Markdown,
	type MarkdownTheme,
	matchesKey,
	Text,
	type TUI,
	truncateToWidth,
	visibleWidth,
} from "@mariozechner/pi-tui";
import { type Action, createInitialState, type QuestionItem, type QuestionState, reducer } from "./state.js";
import { stripFenceMarkers } from "./stripFenceMarkers.js";

export interface QuestionParams {
	question: string;
	header: string;
	options: Array<{ label: string; description: string; preview?: string }>;
	multiSelect?: boolean;
}

export interface SelectionResult {
	answer: string;
	selectedIndex: number;
	preview?: string;
	notes?: string;
	answers?: string[];
	selectedIndices?: number[];
}

export type QuestionResult = SelectionResult | null;

const OTHER_PLACEHOLDER = "Type something";
const PREVIEW_NOTES_PLACEHOLDER = "Add notes on this design...";
const NEXT_LABEL = "Next";
const SUBMIT_LABEL = "Submit";
const SUBMIT_ANSWERS_LABEL = "Submit answers";
const CANCEL_LABEL = "Cancel";
const TAB_UNANSWERED = "☐";
const TAB_ANSWERED = "☒";
const SELECTED_MARKER = "✓";
const FOCUS_MARKER = "❯";
const HELP_SINGLE = "Enter/Space to select · ↑/↓ to navigate · Esc to cancel";
const HELP_MULTI_QUESTION = "Enter/Space to select · Tab/Arrow keys to navigate · Esc to cancel";

const KB_UP = "tui.select.up" as const;
const KB_DOWN = "tui.select.down" as const;
const KB_CONFIRM = "tui.select.confirm" as const;
const PREVIEW_LEFT_WIDTH = 30;
const PREVIEW_GAP = "    ";
const PREVIEW_MAX_LINES = 20;
const PREVIEW_MIN_WIDTH = 40;
const NO_PREVIEW = "No preview available";

function fitToWidth(text: string, width: number): string {
	return truncateToWidth(text, Math.max(1, width), "...", true).trimEnd();
}

function wrapPlainText(text: string, width: number): string[] {
	const maxWidth = Math.max(1, width);
	const words = text.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return [""];

	const lines: string[] = [];
	let current = "";

	for (const word of words) {
		const next = current.length > 0 ? `${current} ${word}` : word;
		if (visibleWidth(next) <= maxWidth) {
			current = next;
			continue;
		}

		if (current.length > 0) {
			lines.push(current);
			current = "";
		}

		if (visibleWidth(word) <= maxWidth) {
			current = word;
			continue;
		}

		// 一个“词”就超过整行宽度时（常见于没有空格分隔的 CJK 文本），
		// 按可见宽度逐字符断行，避免用省略号截断丢内容
		let segment = "";
		let segmentWidth = 0;
		for (const ch of word) {
			const chWidth = visibleWidth(ch);
			if (segmentWidth + chWidth > maxWidth && segment.length > 0) {
				lines.push(segment);
				segment = ch;
				segmentWidth = chWidth;
			} else {
				segment += ch;
				segmentWidth += chWidth;
			}
		}
		if (segment.length > 0) {
			lines.push(segment);
		}
	}

	if (current.length > 0) {
		lines.push(current);
	}

	return lines.length > 0 ? lines : [""];
}

function renderQuestionText(theme: Theme, text: string, width: number): string[] {
	// Text 会按宽度换行，保留全部换行结果，避免只取第一行而丢失问题内容
	return new Text(theme.bold(text), 0, 0).render(width).map((line) => line.trimEnd());
}

function renderPlaceholderWithCursor(theme: Theme, placeholder: string): string {
	return theme.inverse(placeholder[0]) + theme.fg("dim", placeholder.slice(1));
}

function clampCursor(cursor: number, text: string): number {
	return Math.max(0, Math.min(cursor, text.length));
}

function insertAtCursor(text: string, cursor: number, value: string): { text: string; cursor: number } {
	const safeCursor = clampCursor(cursor, text);
	return {
		text: `${text.slice(0, safeCursor)}${value}${text.slice(safeCursor)}`,
		cursor: safeCursor + value.length,
	};
}

function deleteBeforeCursor(text: string, cursor: number): { text: string; cursor: number } {
	const safeCursor = clampCursor(cursor, text);
	if (safeCursor === 0) return { text, cursor: safeCursor };
	return {
		text: `${text.slice(0, safeCursor - 1)}${text.slice(safeCursor)}`,
		cursor: safeCursor - 1,
	};
}

function renderTextInputWithCursor(theme: Theme, text: string, cursor: number): string {
	const safeCursor = clampCursor(cursor, text);
	const cursorCell = safeCursor < text.length ? text[safeCursor] : " ";
	const afterCursor = safeCursor < text.length ? text.slice(safeCursor + 1) : "";
	return `${text.slice(0, safeCursor)}${theme.inverse(cursorCell)}${afterCursor}`;
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

function isPreviewQuestion(q: QuestionParams): boolean {
	return !(q.multiSelect ?? false) && q.options.some((option) => option.preview !== undefined);
}

function buildItemsForQuestion(q: QuestionParams): QuestionItem[] {
	if (isPreviewQuestion(q)) {
		return Array.from({ length: q.options.length }, () => ({ type: "option" as const }));
	}
	return buildItems(q.options.length);
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
	const selectedOption = params.options[selectedIndex];
	return {
		answer: selectedOption.label,
		selectedIndex,
		preview: selectedOption.preview,
		notes: isPreviewQuestion(params) && state.textInputValue.length > 0 ? state.textInputValue : undefined,
	};
}

function padEndAnsi(text: string, width: number): string {
	const visibleLength = visibleWidth(text);
	return `${text}${" ".repeat(Math.max(0, width - visibleLength))}`;
}

function createMarkdownTheme(theme: Theme): MarkdownTheme {
	return {
		heading: (text) => theme.fg("mdHeading", theme.bold(text)),
		link: (text) => theme.fg("mdLink", text),
		linkUrl: (text) => theme.fg("mdLinkUrl", text),
		code: (text) => theme.fg("mdCode", text),
		codeBlock: (text) => theme.fg("mdCodeBlock", text),
		codeBlockBorder: (text) => theme.fg("mdCodeBlockBorder", text),
		quote: (text) => theme.fg("mdQuote", text),
		quoteBorder: (text) => theme.fg("mdQuoteBorder", text),
		hr: (text) => theme.fg("mdHr", text),
		listBullet: (text) => theme.fg("mdListBullet", text),
		bold: (text) => theme.bold(text),
		italic: (text) => theme.italic?.(text) ?? text,
		strikethrough: (text) => theme.strikethrough?.(text) ?? text,
		underline: (text) => theme.underline?.(text) ?? text,
		highlightCode,
		codeBlockIndent: "",
	};
}

function renderMarkdownPreviewContent(theme: Theme, content: string, width: number): string[] {
	const raw = new Markdown(content, 0, 0, createMarkdownTheme(theme)).render(width);
	return stripFenceMarkers(raw);
}

function renderPreviewBox(theme: Theme, content: string, availableWidth: number): string[] {
	const boxWidth = Math.max(8, availableWidth);
	const innerWidth = Math.max(4, boxWidth - 4);
	const sourceLines = renderMarkdownPreviewContent(theme, content, Math.max(innerWidth, 120));
	const isTruncated = sourceLines.length > PREVIEW_MAX_LINES;
	const contentLines = isTruncated ? sourceLines.slice(0, PREVIEW_MAX_LINES) : sourceLines;
	const contentWidth = Math.max(PREVIEW_MIN_WIDTH, ...contentLines.map((line) => visibleWidth(line)));
	const fittedBoxWidth = Math.max(8, Math.min(contentWidth + 4, availableWidth));
	const fittedInnerWidth = Math.max(4, fittedBoxWidth - 4);
	const horizontal = "─".repeat(fittedBoxWidth - 2);
	const lines = [theme.fg("dim", `┌${horizontal}┐`)];

	for (const line of contentLines) {
		const displayLine = truncateToWidth(line, fittedInnerWidth, "", true);
		lines.push(`${theme.fg("dim", "│ ")}${displayLine}${theme.fg("dim", " │")}`);
	}

	if (isTruncated) {
		const hiddenCount = sourceLines.length - PREVIEW_MAX_LINES;
		const label = `─── ✂ ─── ${hiddenCount} lines hidden `;
		const labelWidth = visibleWidth(label);
		const fillWidth = Math.max(0, fittedBoxWidth - 2 - labelWidth);
		lines.push(theme.fg("warning", `├${label}${"─".repeat(fillWidth)}┤`));
	}

	lines.push(theme.fg("dim", `└${horizontal}┘`));
	return lines;
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
		createInitialState(buildItemsForQuestion(q), q.multiSelect ?? false),
	);
	const textInputCursors = params.map(() => 0);

	const collectedAnswers: QuestionResult[] = new Array(totalQuestions).fill(null);
	let currentIndex = 0;
	let reviewFocusedIndex = 0;
	let isPreviewNotesFocused = false;
	let cachedLines: string[] | undefined;
	let cachedWidth: number | undefined;

	function refresh(): void {
		cachedLines = undefined;
		cachedWidth = undefined;
		tui.requestRender();
	}

	function goToQuestion(index: number): void {
		currentIndex = index;
		isPreviewNotesFocused = false;
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
		isPreviewNotesFocused = false;
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
		isPreviewNotesFocused = false;
		const targetState = questionStates[currentIndex];
		if (targetState.items[index]?.type === "input") {
			textInputCursors[currentIndex] = targetState.textInputValue.length;
		}
		questionStates[currentIndex] = {
			...targetState,
			highlightedIndex: index,
			isSubmitFocused: false,
			confirmed: false,
		};
	}

	function getMultiSelectConfirmLabel(): string {
		return currentIndex === totalQuestions - 1 ? SUBMIT_LABEL : NEXT_LABEL;
	}

	function renderHeaderTabs(width: number): string {
		// 先校验裸文本宽度：正常情况按主题样式渲染；仅在极端窄终端时降级为无色截断行，
		// 避免多色彩拼接行超出终端宽度导致 pi 核心渲染崩溃
		const bareTabWidth = (header: string, box: string) => visibleWidth(`  ${box} ${header} `);
		let bareWidth = params.reduce((sum, q) => sum + bareTabWidth(q.header, TAB_UNANSWERED) + 1, -1);
		if (isMultiQuestion || isSingleQuestionMultiSelect) {
			bareWidth += bareTabWidth(SUBMIT_LABEL, TAB_UNANSWERED) + 1;
		}
		if (bareWidth > width) {
			const bareTabs = params.map((q, index) => {
				const box = collectedAnswers[index] !== null ? TAB_ANSWERED : TAB_UNANSWERED;
				return `  ${box} ${q.header} `;
			});
			if (isMultiQuestion || isSingleQuestionMultiSelect) {
				bareTabs.push(`  ${TAB_UNANSWERED} ${SUBMIT_LABEL} `);
			}
			return fitToWidth(bareTabs.join(" "), width);
		}

		const questionTabs = params.map((q, index) => {
			const answered = collectedAnswers[index] !== null;
			const box = answered ? TAB_ANSWERED : TAB_UNANSWERED;
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
		const submitBox = readyToSubmit ? TAB_ANSWERED : TAB_UNANSWERED;
		const submitTab = `  ${submitBox} ${SUBMIT_LABEL} `;
		const styledSubmit = activeSubmit
			? theme.bg("selectedBg", theme.fg("text", submitTab))
			: theme.fg(readyToSubmit ? "success" : "dim", submitTab);
		return [...questionTabs, styledSubmit].join(" ");
	}

	function renderQuestionLines(q: QuestionParams, state: QuestionState, width: number): string[] {
		const multiSelect = q.multiSelect ?? false;
		const lines: string[] = [];

		for (let i = 0; i < state.items.length; i++) {
			const item = state.items[i];
			const focused = !state.isSubmitFocused && i === state.highlightedIndex;
			const checked = multiSelect && state.selectedIndices.includes(i);
			const selected = !multiSelect && state.selectedIndex === i;
			const chosen = checked || selected;
			const selectedMarker = selected ? ` ${theme.fg("accent", SELECTED_MARKER)}` : "";
			const checkMarker = multiSelect ? `${checked ? "[x]" : "[ ]"} ` : "";
			const prefix = focused ? `${theme.fg("accent", FOCUS_MARKER)} ` : "  ";
			const numberPrefix = theme.fg("dim", `${i + 1}. `);

			if (item.type === "option") {
				const opt = q.options[i];
				const descriptionPrefix = "     ";
				// 选项行与自由输入行都在裸文本层按终端宽度截断，避免可见宽度超过终端宽度导致 pi 核心渲染崩溃
				const labelBudget = Math.max(
					1,
					width -
						2 -
						(String(i + 1).length + 2) -
						visibleWidth(checkMarker) -
						(selected ? visibleWidth(` ${SELECTED_MARKER}`) : 0),
				);
				let labelText = opt.label;
				if (visibleWidth(labelText) > labelBudget) {
					labelText = fitToWidth(labelText, labelBudget);
				}
				const label = focused ? theme.bold(labelText) : labelText;
				const rowRest = `${checkMarker}${label}`;
				const row = `${numberPrefix}${chosen || focused ? theme.fg("accent", rowRest) : rowRest}`;
				lines.push(`${prefix}${row}${selectedMarker}`);
				// description 按终端宽度换行，避免其可见宽度超过终端宽度导致 pi 核心渲染崩溃
				const descWidth = Math.max(1, width - visibleWidth(descriptionPrefix));
				for (const desc of wrapPlainText(opt.description, descWidth)) {
					lines.push(`${descriptionPrefix}${theme.fg("dim", desc)}`);
				}
				continue;
			}

			const inputBudget = Math.max(
				1,
				width -
					2 -
					(String(i + 1).length + 2) -
					visibleWidth(checkMarker) -
					(selected ? visibleWidth(` ${SELECTED_MARKER}`) : 0),
			);
			const clipInput = (value: string): string =>
				visibleWidth(value) > inputBudget ? fitToWidth(value, inputBudget) : value;

			if (focused) {
				const hasInput = state.textInputValue.length > 0;
				const displayValue = clipInput(state.textInputValue);
				const inputText = hasInput
					? renderTextInputWithCursor(theme, displayValue, clampCursor(getCurrentTextInputCursor(), displayValue))
					: renderPlaceholderWithCursor(theme, OTHER_PLACEHOLDER);
				const label = hasInput ? theme.bold(inputText) : inputText;
				const rowRest = `${checkMarker}${label}`;
				const row = `${numberPrefix}${chosen || focused ? theme.fg("accent", rowRest) : rowRest}`;
				lines.push(`${prefix}${row}${selectedMarker}`);
			} else {
				const inputText =
					state.textInputValue.length > 0 ? clipInput(state.textInputValue) : theme.fg("dim", OTHER_PLACEHOLDER);
				const rowRest = `${checkMarker}${inputText}`;
				const row = `${numberPrefix}${chosen ? theme.fg("accent", rowRest) : rowRest}`;
				lines.push(`${prefix}${row}${selectedMarker}`);
			}
		}

		if (multiSelect) {
			const confirmLabel = getMultiSelectConfirmLabel();
			if (state.isSubmitFocused) {
				lines.push(`${theme.fg("accent", FOCUS_MARKER)}    ${theme.fg("accent", theme.bold(confirmLabel))}`);
			} else {
				lines.push(`     ${confirmLabel}`);
			}
		}

		return lines;
	}

	function getCurrentTextInputCursor(): number {
		return clampCursor(textInputCursors[currentIndex], questionStates[currentIndex].textInputValue);
	}

	function setCurrentTextInputCursor(cursor: number): void {
		textInputCursors[currentIndex] = clampCursor(cursor, questionStates[currentIndex].textInputValue);
		refresh();
	}

	function updateFocusedInputText(text: string, cursor: number): void {
		textInputCursors[currentIndex] = clampCursor(cursor, text);
		dispatch({ type: "updateTextInput", text });
	}

	function updatePreviewNotes(text: string): void {
		questionStates[currentIndex] = {
			...questionStates[currentIndex],
			textInputValue: text,
		};
		refresh();
	}

	function renderPreviewNotesLine(state: QuestionState, width: number, leftWidth: number): string {
		const label = theme.fg("accent", "Notes");
		const prefix = `${" ".repeat(leftWidth)}${PREVIEW_GAP}`;
		let line: string;
		if (isPreviewNotesFocused) {
			if (state.textInputValue.length === 0) {
				line = `${prefix}${label}: ${renderPlaceholderWithCursor(theme, PREVIEW_NOTES_PLACEHOLDER)}`;
			} else {
				line = `${prefix}${label}: ${theme.fg("accent", renderTextInputWithCursor(theme, state.textInputValue, getCurrentTextInputCursor()))}`;
			}
		} else if (state.textInputValue.length > 0) {
			line = `${prefix}${label}: ${state.textInputValue}`;
		} else {
			line = `${prefix}${label}: ${theme.fg("dim", "press n to add notes")}`;
		}
		return fitToWidth(line, width);
	}

	function renderPreviewQuestionLines(q: QuestionParams, state: QuestionState, width: number): string[] {
		const leftWidth = Math.min(PREVIEW_LEFT_WIDTH, Math.max(12, width - PREVIEW_GAP.length - 8));
		const optionLines: string[] = [];

		for (let index = 0; index < q.options.length; index++) {
			const option = q.options[index];
			const focused = !state.isSubmitFocused && index === state.highlightedIndex;
			const selected = state.selectedIndex === index;
			const prefix = focused ? `${theme.fg("accent", FOCUS_MARKER)} ` : "  ";
			const numberPrefix = theme.fg("dim", `${index + 1}. `);
			const selectedMarker = selected ? ` ${theme.fg("accent", SELECTED_MARKER)}` : "";
			const prefixWidth = 2;
			const numberPrefixWidth = String(index + 1).length + 2;
			const selectedMarkerWidth = selected ? 2 : 0;
			const firstLineLabelWidth = Math.max(1, leftWidth - prefixWidth - numberPrefixWidth - selectedMarkerWidth);
			const continuationIndent = " ".repeat(prefixWidth + numberPrefixWidth);
			const labelLines = wrapPlainText(option.label, firstLineLabelWidth);
			const style = focused
				? (text: string) => theme.fg("accent", theme.bold(text))
				: selected
					? (text: string) => theme.fg("success", text)
					: (text: string) => text;
			for (const [lineIndex, segment] of labelLines.entries()) {
				if (lineIndex === 0) {
					optionLines.push(`${prefix}${numberPrefix}${style(segment)}${selectedMarker}`);
					continue;
				}
				optionLines.push(`${continuationIndent}${style(segment)}`);
			}
		}

		const focusedOption = q.options[state.highlightedIndex];
		const previewLines = renderPreviewBox(
			theme,
			focusedOption?.preview ?? NO_PREVIEW,
			Math.max(8, width - leftWidth - PREVIEW_GAP.length),
		);
		const rowCount = Math.max(optionLines.length, previewLines.length);
		const lines: string[] = [];

		for (let i = 0; i < rowCount; i++) {
			const left = optionLines[i] ?? "";
			const right = previewLines[i] ?? "";
			lines.push(`${padEndAnsi(left, leftWidth)}${PREVIEW_GAP}${right}`.trimEnd());
		}

		lines.push("");
		lines.push(renderPreviewNotesLine(state, width, leftWidth));

		return lines;
	}

	function renderReviewLines(width: number): string[] {
		const lines: string[] = [];
		const allAnswered = hasAllAnswers();

		lines.push(renderHeaderTabs(width));
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
			// 问题与答案都按终端宽度换行，避免长文本导致 pi 核心渲染崩溃
			for (const questionLine of wrapPlainText(params[i].question, Math.max(1, width - 2))) {
				lines.push(`  ${questionLine}`);
			}
			for (const answerLine of wrapPlainText(answer.answer, Math.max(1, width - 4))) {
				lines.push(`    ${theme.fg("success", answerLine)}`);
			}
		}

		if (collectedAnswers.some((answer) => answer !== null)) {
			lines.push("");
		}

		const submitPrefix = reviewFocusedIndex === 0 ? `  ${theme.fg("accent", "❯")} ` : "    ";
		const cancelPrefix = reviewFocusedIndex === 1 ? `  ${theme.fg("accent", "❯")} ` : "    ";
		lines.push(
			`${submitPrefix}${reviewFocusedIndex === 0 ? theme.fg("accent", theme.bold(SUBMIT_ANSWERS_LABEL)) : SUBMIT_ANSWERS_LABEL}`,
		);
		lines.push(
			`${cancelPrefix}${reviewFocusedIndex === 1 ? theme.fg("accent", theme.bold(CANCEL_LABEL)) : CANCEL_LABEL}`,
		);
		lines.push("");
		lines.push(
			theme.fg("dim", fitToWidth("Enter/Space to select · ↑/↓ to navigate · ← to go back · Esc to cancel", width)),
		);

		return lines;
	}

	function render(_width: number): string[] {
		if (cachedLines && cachedWidth === _width) return cachedLines;

		if (isMultiQuestion && currentIndex === totalQuestions) {
			cachedLines = renderReviewLines(_width);
			cachedWidth = _width;
			return cachedLines;
		}

		const lines: string[] = [];
		const q = params[currentIndex];
		const state = questionStates[currentIndex];

		lines.push(renderHeaderTabs(_width));
		lines.push("");

		lines.push(...renderQuestionText(theme, q.question, _width));
		lines.push("");

		if (isPreviewQuestion(q)) {
			lines.push(...renderPreviewQuestionLines(q, state, _width));
		} else {
			lines.push(...renderQuestionLines(q, state, _width));
		}

		lines.push("");
		const helpText = isMultiQuestion || isSingleQuestionMultiSelect ? HELP_MULTI_QUESTION : HELP_SINGLE;
		// 帮助行也是静态文本，窄终端下需截断避免超宽
		lines.push(theme.fg("dim", fitToWidth(helpText, _width)));

		cachedLines = lines;
		cachedWidth = _width;
		return cachedLines;
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
		const previewMode = isPreviewQuestion(params[currentIndex]);
		const focusedItem = state.items[state.highlightedIndex];
		const inputFocused = !previewMode && !state.isSubmitFocused && focusedItem?.type === "input";

		if (previewMode && isPreviewNotesFocused) {
			if (matchesKey(data, Key.escape)) {
				isPreviewNotesFocused = false;
				refresh();
				return;
			}
			if (kb.matches(data, KB_UP)) {
				isPreviewNotesFocused = false;
				dispatch({ type: "navigateUp" });
				return;
			}
			if (kb.matches(data, KB_DOWN)) {
				isPreviewNotesFocused = false;
				dispatch({ type: "navigateDown" });
				return;
			}
			if (matchesKey(data, Key.left)) {
				setCurrentTextInputCursor(getCurrentTextInputCursor() - 1);
				return;
			}
			if (matchesKey(data, Key.right)) {
				setCurrentTextInputCursor(getCurrentTextInputCursor() + 1);
				return;
			}
			if (kb.matches(data, KB_CONFIRM)) {
				dispatch({ type: "selectCurrent" });
				return;
			}
			if (matchesKey(data, Key.backspace)) {
				const updated = deleteBeforeCursor(state.textInputValue, getCurrentTextInputCursor());
				textInputCursors[currentIndex] = updated.cursor;
				updatePreviewNotes(updated.text);
				return;
			}
			const ch = getPrintableChar(data);
			if (ch !== undefined) {
				const updated = insertAtCursor(state.textInputValue, getCurrentTextInputCursor(), ch);
				textInputCursors[currentIndex] = updated.cursor;
				updatePreviewNotes(updated.text);
			}
			return;
		}

		if (matchesKey(data, Key.escape)) {
			if (inputFocused && state.textInputValue.length > 0) {
				updateFocusedInputText("", 0);
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

		if (previewMode && data === "n") {
			textInputCursors[currentIndex] = state.textInputValue.length;
			isPreviewNotesFocused = true;
			refresh();
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
			if (previewMode || state.items[shortcutIndex].type === "input") {
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
				const updated = deleteBeforeCursor(state.textInputValue, getCurrentTextInputCursor());
				updateFocusedInputText(updated.text, updated.cursor);
			} else if (matchesKey(data, Key.left)) {
				setCurrentTextInputCursor(getCurrentTextInputCursor() - 1);
			} else if (matchesKey(data, Key.right)) {
				setCurrentTextInputCursor(getCurrentTextInputCursor() + 1);
			} else if (matchesKey(data, Key.space) && state.textInputValue.length === 0) {
				return;
			} else {
				const ch = getPrintableChar(data);
				if (ch !== undefined) {
					const updated = insertAtCursor(state.textInputValue, getCurrentTextInputCursor(), ch);
					updateFocusedInputText(updated.text, updated.cursor);
				}
			}
		}
	}

	function invalidate(): void {
		cachedLines = undefined;
		cachedWidth = undefined;
	}

	return { render, handleInput, invalidate };
}
