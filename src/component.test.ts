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
			"",
			"<dim>Enter to select · ↑/↓ to navigate · Esc to cancel</dim>",
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
			"",
			"<dim>Enter to select · ↑/↓ to navigate · Esc to cancel</dim>",
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
			"",
			"<dim>Enter to select · ↑/↓ to navigate · Esc to cancel</dim>",
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
		expect(lines.length).toBe(12); // question + blank + 3 options * 2 + Other * 2 + help footer
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

describe("multi-select", () => {
	const multiParams: QuestionParams = {
		question: "Which features do you want?",
		header: "Features",
		options: [
			{ label: "Auth", description: "User authentication" },
			{ label: "Cache", description: "Response caching" },
			{ label: "Logger", description: "Request logging" },
		],
		multiSelect: true,
	};

	it("renders checkboxes and multi-select help text", () => {
		const { lines } = renderSnapshot(multiParams);

		expect(lines).toEqual([
			"<b>Which features do you want?</b>",
			"",
			"  <accent>❯</accent> [ ] <b>Auth</b>",
			"        <muted>User authentication</muted>",
			"    [ ] Cache",
			"        <dim>Response caching</dim>",
			"    [ ] Logger",
			"        <dim>Request logging</dim>",
			"    [ ] Other",
			"        <dim>Type a custom answer</dim>",
			"    Submit",
			"",
			"<dim>Space/Enter to toggle · Submit to confirm · ↑/↓ to navigate · Esc to cancel</dim>",
		]);
	});

	it("toggles selection with Space", () => {
		const theme = mockTheme();
		const kb = mockKb();
		const tui = mockTui();
		const done: Done = () => {};

		const comp = createQuestionComponent(multiParams, theme, kb as never, tui as never, done) as TestComponent;
		comp.handleInput(" "); // toggle first item on

		const lines = comp.render(80);
		expect(lines[2]).toBe("  <accent>❯</accent> [x] <b>Auth</b>");

		comp.handleInput(" "); // toggle first item off
		const lines2 = comp.render(80);
		expect(lines2[2]).toBe("  <accent>❯</accent> [ ] <b>Auth</b>");
	});

	it("toggles selection with Enter while focused on an option", () => {
		const theme = mockTheme();
		const kb = mockKb();
		const tui = mockTui();
		const done: Done = () => {};

		const comp = createQuestionComponent(multiParams, theme, kb as never, tui as never, done) as TestComponent;
		comp.handleInput("\r"); // Enter toggles Auth in multi-select mode

		const lines = comp.render(80);
		expect(lines[2]).toBe("  <accent>❯</accent> [x] <b>Auth</b>");
	});

	it("selects multiple items and confirms from Submit with Enter", () => {
		const theme = mockTheme();
		const kb = mockKb();
		const tui = mockTui();
		let captured: unknown;
		const done: Done = (r) => {
			captured = r;
		};

		const comp = createQuestionComponent(multiParams, theme, kb as never, tui as never, done) as TestComponent;
		comp.handleInput(" "); // toggle Auth
		comp.handleInput("\x1b[B"); // down
		comp.handleInput(" "); // toggle Cache
		comp.handleInput("\x1b[B"); // down to Logger
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("\x1b[B"); // down to Submit
		comp.handleInput("\r"); // confirm

		expect(captured).toEqual({
			answer: "Auth, Cache",
			selectedIndex: 0,
			answers: ["Auth", "Cache"],
			selectedIndices: [0, 1],
		});
	});

	it("no-ops on Submit with no selections", () => {
		const theme = mockTheme();
		const kb = mockKb();
		const tui = mockTui();
		let captured: unknown;
		const done: Done = (r) => {
			captured = r;
		};

		const comp = createQuestionComponent(multiParams, theme, kb as never, tui as never, done) as TestComponent;
		comp.handleInput("\x1b[B"); // down to Cache
		comp.handleInput("\x1b[B"); // down to Logger
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("\x1b[B"); // down to Submit
		comp.handleInput("\r"); // confirm with nothing selected

		expect(captured).toBeUndefined();
	});

	it("renders only Submit as focused when Submit has focus", () => {
		const theme = mockTheme();
		const kb = mockKb();
		const tui = mockTui();
		const done: Done = () => {};

		const comp = createQuestionComponent(multiParams, theme, kb as never, tui as never, done) as TestComponent;
		comp.handleInput("\x1b[B"); // down to Cache
		comp.handleInput("\x1b[B"); // down to Logger
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("\x1b[B"); // down to Submit

		const lines = comp.render(80);
		expect(lines[8]).toBe("    [ ] Other");
		expect(lines[10]).toBe("  <accent>❯</accent> <b>Submit</b>");
	});

	it("auto-selects Other with text in multi-select and appends it after regular options", () => {
		const theme = mockTheme();
		const kb = mockKb();
		const tui = mockTui();
		let captured: unknown;
		const done: Done = (r) => {
			captured = r;
		};

		const comp = createQuestionComponent(multiParams, theme, kb as never, tui as never, done) as TestComponent;
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("c"); // type
		comp.handleInput("u"); // type
		comp.handleInput("s"); // type
		comp.handleInput("t"); // type
		comp.handleInput("o"); // type
		comp.handleInput("m"); // type

		const lines = comp.render(80);
		expect(lines[8]).toBe("  <accent>❯</accent> [x] <b>Other</b>");

		comp.handleInput("\x1b[A"); // up to Logger
		comp.handleInput(" "); // toggle Logger
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("\x1b[B"); // down to Submit
		comp.handleInput("\r"); // confirm

		expect(captured).toEqual({
			answer: "Logger, custom",
			selectedIndex: 2,
			answers: ["Logger", "custom"],
			selectedIndices: [2, 3],
		});
	});

	it("auto-clears Other selection when text is deleted", () => {
		const theme = mockTheme();
		const kb = mockKb();
		const tui = mockTui();
		const done: Done = () => {};

		const comp = createQuestionComponent(multiParams, theme, kb as never, tui as never, done) as TestComponent;
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("x"); // auto-select Other
		comp.handleInput("\x7f"); // clear

		const lines = comp.render(80);
		expect(lines[8]).toBe("  <accent>❯</accent> [ ] <b>Other</b>");
	});

	it("does not toggle Other with empty text", () => {
		const theme = mockTheme();
		const kb = mockKb();
		const tui = mockTui();
		const done: Done = () => {};

		const comp = createQuestionComponent(multiParams, theme, kb as never, tui as never, done) as TestComponent;
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput(" "); // try toggle Other with empty text → no-op

		const lines = comp.render(80);
		expect(lines[8]).toBe("  <accent>❯</accent> [ ] <b>Other</b>");
	});

	it("Space is ignored in single-select mode", () => {
		const theme = mockTheme();
		const kb = mockKb();
		const tui = mockTui();
		const done: Done = () => {};

		const comp = createQuestionComponent(baseParams, theme, kb as never, tui as never, done) as TestComponent;
		comp.handleInput(" "); // space in single-select → no-op

		const lines = comp.render(80);
		// Should look same as initial render — no checkboxes
		expect(lines[2]).toBe("  <accent>❯</accent> <b>React</b>");
	});

	it("renders checked items alongside focused but unchecked items", () => {
		const theme = mockTheme();
		const kb = mockKb();
		const tui = mockTui();
		const done: Done = () => {};

		const comp = createQuestionComponent(multiParams, theme, kb as never, tui as never, done) as TestComponent;
		comp.handleInput(" "); // toggle Auth on
		comp.handleInput("\x1b[B"); // down to Cache

		const lines = comp.render(80);
		// Auth is checked but not focused
		expect(lines[2]).toBe("    [x] Auth");
		// Cache is focused but not checked
		expect(lines[4]).toBe("  <accent>❯</accent> [ ] <b>Cache</b>");
	});
});
