import type { Theme } from "@mariozechner/pi-coding-agent";
import { matchesKey } from "@mariozechner/pi-tui";
import { describe, expect, it } from "vitest";
import { createQuestionComponent, type QuestionParams } from "./component.js";

function mockTheme(): Theme {
	return {
		bold: (s: string) => `<b>${s}</b>`,
		fg: (_color: string, s: string) => `<${_color}>${s}</${_color}>`,
	} as unknown as Theme;
}

function mockKb() {
	const bindingMap: Record<string, (data: string) => boolean> = {
		"tui.select.up": (d) => matchesKey(d, "up"),
		"tui.select.down": (d) => matchesKey(d, "down"),
		"tui.select.confirm": (d) => matchesKey(d, "enter"),
	};
	return {
		matches: (data: string, binding: string) => bindingMap[binding]?.(data) ?? false,
	};
}

function mockTui() {
	const requested: number[] = [];
	return { requestRender: () => requested.push(1), _requested: requested };
}

type TestComponent = ReturnType<typeof createQuestionComponent> & { handleInput(data: string): void };

type Done = (result: { answer: string; selectedIndex: number } | null) => void;

function renderSnapshot(params: QuestionParams): { lines: string[]; result: unknown } {
	const theme = mockTheme();
	const kb = mockKb();
	const tui = mockTui();
	let captured: unknown;
	const done: Done = (r) => {
		captured = r;
	};

	const comp = createQuestionComponent(params, theme, kb as never, tui as never, done) as TestComponent;
	const lines = comp.render(80);
	return { lines, result: captured };
}

const baseParams: QuestionParams = {
	question: "Which framework should we use?",
	header: "Framework",
	options: [
		{ label: "React", description: "A JavaScript library for building UIs" },
		{ label: "Vue", description: "The progressive JavaScript framework" },
		{ label: "Svelte", description: "Cybernetically enhanced web apps" },
	],
};

describe("render snapshot", () => {
	it("renders question with 3 options plus 'Other', first highlighted", () => {
		const { lines } = renderSnapshot(baseParams);

		expect(lines).toEqual([
			"<b>Which framework should we use?</b>",
			"",
			"  <accent>❯</accent> <b>React</b>",
			"    <muted>A JavaScript library for building UIs</muted>",
			"    Vue",
			"    <dim>The progressive JavaScript framework</dim>",
			"    Svelte",
			"    <dim>Cybernetically enhanced web apps</dim>",
			"    Other",
			"    <dim>Type a custom answer</dim>",
		]);
	});

	it("renders question with 2 options plus 'Other'", () => {
		const { lines } = renderSnapshot({
			question: "Dark mode or light mode?",
			header: "Theme",
			options: [
				{ label: "Dark", description: "Easy on the eyes" },
				{ label: "Light", description: "Classic look" },
			],
		});

		expect(lines).toEqual([
			"<b>Dark mode or light mode?</b>",
			"",
			"  <accent>❯</accent> <b>Dark</b>",
			"    <muted>Easy on the eyes</muted>",
			"    Light",
			"    <dim>Classic look</dim>",
			"    Other",
			"    <dim>Type a custom answer</dim>",
		]);
	});

	it("renders single option plus 'Other'", () => {
		const { lines } = renderSnapshot({
			question: "Continue?",
			header: "Confirm",
			options: [{ label: "Yes", description: "Proceed with the action" }],
		});

		expect(lines).toEqual([
			"<b>Continue?</b>",
			"",
			"  <accent>❯</accent> <b>Yes</b>",
			"    <muted>Proceed with the action</muted>",
			"    Other",
			"    <dim>Type a custom answer</dim>",
		]);
	});

	it("renders 'Other' with cursor when highlighted (no description)", () => {
		const theme = mockTheme();
		const kb = mockKb();
		const tui = mockTui();
		const done: Done = () => {};

		const comp = createQuestionComponent(baseParams, theme, kb as never, tui as never, done) as TestComponent;
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down to Other
		const lines = comp.render(80);

		// Other focused: shows cursor instead of description
		expect(lines[8]).toBe("  <accent>❯</accent> <b>Other</b>");
		expect(lines[9]).toBe("    ▌");
	});
});

describe("freeform input on Other", () => {
	it("types directly when Other is highlighted (no Enter needed)", () => {
		const theme = mockTheme();
		const kb = mockKb();
		const tui = mockTui();
		const done: Done = () => {};

		const comp = createQuestionComponent(baseParams, theme, kb as never, tui as never, done) as TestComponent;
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("h"); // type directly
		comp.handleInput("i"); // type

		const lines = comp.render(80);
		expect(lines[8]).toBe("  <accent>❯</accent> <b>Other</b>");
		expect(lines[9]).toBe("    hi▌");
	});

	it("returns typed text as answer on Enter", () => {
		const theme = mockTheme();
		const kb = mockKb();
		const tui = mockTui();
		let captured: { answer: string; selectedIndex: number } | null = null;
		const done: Done = (r) => {
			captured = r;
		};

		const comp = createQuestionComponent(baseParams, theme, kb as never, tui as never, done) as TestComponent;
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("c"); // type
		comp.handleInput("u"); // type
		comp.handleInput("s"); // type
		comp.handleInput("t"); // type
		comp.handleInput("o"); // type
		comp.handleInput("m"); // type
		comp.handleInput("\r"); // confirm

		expect(captured).toEqual({ answer: "custom", selectedIndex: 3 });
	});

	it("no-ops on Enter with empty text", () => {
		const theme = mockTheme();
		const kb = mockKb();
		const tui = mockTui();
		let captured: unknown;
		const done: Done = (r) => {
			captured = r;
		};

		const comp = createQuestionComponent(baseParams, theme, kb as never, tui as never, done) as TestComponent;
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("\r"); // Enter with empty text → no-op

		expect(captured).toBeUndefined();
		// Still on Other, still showing cursor
		const lines = comp.render(80);
		expect(lines[9]).toBe("    ▌");
	});

	it("clears text on Escape when Other has text, then Escape cancels", () => {
		const theme = mockTheme();
		const kb = mockKb();
		const tui = mockTui();
		let captured: unknown;
		const done: Done = (r) => {
			captured = r;
		};

		const comp = createQuestionComponent(baseParams, theme, kb as never, tui as never, done) as TestComponent;
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("x"); // type
		comp.handleInput("\x1b"); // Escape → clears text

		const lines = comp.render(80);
		expect(lines[9]).toBe("    ▌"); // text cleared, cursor remains
		expect(captured).toBeUndefined();

		// Second Escape cancels the whole question
		comp.handleInput("\x1b");
		expect(captured).toBeNull();
	});

	it("navigates away from Other and keeps typed text for returning focus", () => {
		const theme = mockTheme();
		const kb = mockKb();
		const tui = mockTui();
		const done: Done = () => {};

		const comp = createQuestionComponent(baseParams, theme, kb as never, tui as never, done) as TestComponent;
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("x"); // type
		comp.handleInput("\x1b[A"); // up → navigates away

		const lines = comp.render(80);
		expect(lines.length).toBe(10); // question + blank + 3 options * 2 + Other * 2
		expect(lines[8]).toBe("    Other");
		expect(lines[9]).toBe("    <dim>Type a custom answer</dim>");

		comp.handleInput("\x1b[B"); // down → returns to Other
		const returnedLines = comp.render(80);
		expect(returnedLines[9]).toBe("    x▌");
	});

	it("backspace deletes last character", () => {
		const theme = mockTheme();
		const kb = mockKb();
		const tui = mockTui();
		const done: Done = () => {};

		const comp = createQuestionComponent(baseParams, theme, kb as never, tui as never, done) as TestComponent;
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("a"); // type
		comp.handleInput("b"); // type
		comp.handleInput("\x7f"); // backspace

		const lines = comp.render(80);
		expect(lines[9]).toBe("    a▌");
	});
});
