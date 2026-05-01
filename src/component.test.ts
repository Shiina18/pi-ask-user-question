import type { Theme } from "@mariozechner/pi-coding-agent";
import { matchesKey } from "@mariozechner/pi-tui";
import { describe, expect, it } from "vitest";
import { createQuestionComponent, type QuestionParams, type QuestionResult } from "./component.js";

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

type Done = (results: QuestionResult[] | null) => void;

function renderSnapshot(params: QuestionParams[]): { lines: string[]; result: unknown } {
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

function createComp(params: QuestionParams[], done: Done) {
	const theme = mockTheme();
	const kb = mockKb();
	const tui = mockTui();
	const comp = createQuestionComponent(params, theme, kb as never, tui as never, done) as TestComponent;
	return comp;
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
		const { lines } = renderSnapshot([baseParams]);

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
		const { lines } = renderSnapshot([
			{
				question: "Dark mode or light mode?",
				header: "Theme",
				options: [
					{ label: "Dark", description: "Easy on the eyes" },
					{ label: "Light", description: "Classic look" },
				],
			},
		]);

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
		const { lines } = renderSnapshot([
			{
				question: "Continue?",
				header: "Confirm",
				options: [{ label: "Yes", description: "Proceed with the action" }],
			},
		]);

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
		const comp = createComp([baseParams], () => {});
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
		const comp = createComp([baseParams], () => {});
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
		let captured: QuestionResult[] | null = null;
		const comp = createComp([baseParams], (r) => {
			captured = r;
		});
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

		expect(captured).toEqual([{ answer: "custom", selectedIndex: 3 }]);
	});

	it("no-ops on Enter with empty text", () => {
		let captured: unknown;
		const comp = createComp([baseParams], (r) => {
			captured = r;
		});
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("\r"); // Enter with empty text → no-op

		expect(captured).toBeUndefined();
		const lines = comp.render(80);
		expect(lines[9]).toBe("    ▌");
	});

	it("clears text on Escape when Other has text, then Escape cancels", () => {
		let captured: unknown;
		const comp = createComp([baseParams], (r) => {
			captured = r;
		});
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("x"); // type
		comp.handleInput("\x1b"); // Escape → clears text

		const lines = comp.render(80);
		expect(lines[9]).toBe("    ▌"); // text cleared, cursor remains
		expect(captured).toBeUndefined();

		comp.handleInput("\x1b");
		expect(captured).toBeNull();
	});

	it("navigates away from Other and keeps typed text for returning focus", () => {
		const comp = createComp([baseParams], () => {});
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("x"); // type
		comp.handleInput("\x1b[A"); // up → navigates away

		const lines = comp.render(80);
		expect(lines.length).toBe(12);
		expect(lines[8]).toBe("    Other");
		expect(lines[9]).toBe("    <dim>Type a custom answer</dim>");

		comp.handleInput("\x1b[B"); // down → returns to Other
		const returnedLines = comp.render(80);
		expect(returnedLines[9]).toBe("    x▌");
	});

	it("backspace deletes last character", () => {
		const comp = createComp([baseParams], () => {});
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
		const { lines } = renderSnapshot([multiParams]);

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
		const comp = createComp([multiParams], () => {});
		comp.handleInput(" "); // toggle first item on

		const lines = comp.render(80);
		expect(lines[2]).toBe("  <accent>❯</accent> [x] <b>Auth</b>");

		comp.handleInput(" "); // toggle first item off
		const lines2 = comp.render(80);
		expect(lines2[2]).toBe("  <accent>❯</accent> [ ] <b>Auth</b>");
	});

	it("toggles selection with Enter while focused on an option", () => {
		const comp = createComp([multiParams], () => {});
		comp.handleInput("\r"); // Enter toggles Auth in multi-select mode

		const lines = comp.render(80);
		expect(lines[2]).toBe("  <accent>❯</accent> [x] <b>Auth</b>");
	});

	it("selects multiple items and confirms from Submit with Enter", () => {
		let captured: QuestionResult[] | null = null;
		const comp = createComp([multiParams], (r) => {
			captured = r;
		});
		comp.handleInput(" "); // toggle Auth
		comp.handleInput("\x1b[B"); // down
		comp.handleInput(" "); // toggle Cache
		comp.handleInput("\x1b[B"); // down to Logger
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("\x1b[B"); // down to Submit
		comp.handleInput("\r"); // confirm

		expect(captured).toEqual([
			{
				answer: "Auth, Cache",
				selectedIndex: 0,
				answers: ["Auth", "Cache"],
				selectedIndices: [0, 1],
			},
		]);
	});

	it("no-ops on Submit with no selections", () => {
		let captured: unknown;
		const comp = createComp([multiParams], (r) => {
			captured = r;
		});
		comp.handleInput("\x1b[B"); // down to Cache
		comp.handleInput("\x1b[B"); // down to Logger
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("\x1b[B"); // down to Submit
		comp.handleInput("\r"); // confirm with nothing selected

		expect(captured).toBeUndefined();
	});

	it("renders only Submit as focused when Submit has focus", () => {
		const comp = createComp([multiParams], () => {});
		comp.handleInput("\x1b[B"); // down to Cache
		comp.handleInput("\x1b[B"); // down to Logger
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("\x1b[B"); // down to Submit

		const lines = comp.render(80);
		expect(lines[8]).toBe("    [ ] Other");
		expect(lines[10]).toBe("  <accent>❯</accent> <b>Submit</b>");
	});

	it("auto-selects Other with text in multi-select and appends it after regular options", () => {
		let captured: QuestionResult[] | null = null;
		const comp = createComp([multiParams], (r) => {
			captured = r;
		});
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

		expect(captured).toEqual([
			{
				answer: "Logger, custom",
				selectedIndex: 2,
				answers: ["Logger", "custom"],
				selectedIndices: [2, 3],
			},
		]);
	});

	it("auto-clears Other selection when text is deleted", () => {
		const comp = createComp([multiParams], () => {});
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("x"); // auto-select Other
		comp.handleInput("\x7f"); // clear

		const lines = comp.render(80);
		expect(lines[8]).toBe("  <accent>❯</accent> [ ] <b>Other</b>");
	});

	it("does not toggle Other with empty text", () => {
		const comp = createComp([multiParams], () => {});
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput(" "); // try toggle Other with empty text → no-op

		const lines = comp.render(80);
		expect(lines[8]).toBe("  <accent>❯</accent> [ ] <b>Other</b>");
	});

	it("Space is ignored in single-select mode", () => {
		const comp = createComp([baseParams], () => {});
		comp.handleInput(" "); // space in single-select → no-op

		const lines = comp.render(80);
		expect(lines[2]).toBe("  <accent>❯</accent> <b>React</b>");
	});

	it("renders checked items alongside focused but unchecked items", () => {
		const comp = createComp([multiParams], () => {});
		comp.handleInput(" "); // toggle Auth on
		comp.handleInput("\x1b[B"); // down to Cache

		const lines = comp.render(80);
		expect(lines[2]).toBe("    [x] Auth");
		expect(lines[4]).toBe("  <accent>❯</accent> [ ] <b>Cache</b>");
	});
});

describe("multi-question navigation", () => {
	const q1: QuestionParams = {
		question: "Which language?",
		header: "Language",
		options: [
			{ label: "TypeScript", description: "Typed JavaScript" },
			{ label: "Python", description: "General purpose" },
		],
	};
	const q2: QuestionParams = {
		question: "Which framework?",
		header: "Framework",
		options: [
			{ label: "React", description: "UI library" },
			{ label: "Vue", description: "Progressive framework" },
		],
	};
	const q3: QuestionParams = {
		question: "Deploy target?",
		header: "Deploy",
		options: [
			{ label: "Vercel", description: "Edge platform" },
			{ label: "AWS", description: "Cloud provider" },
		],
		multiSelect: true,
	};

	it("shows progress indicator for multi-question", () => {
		const { lines } = renderSnapshot([q1, q2]);

		expect(lines[0]).toBe("<dim>Question 1 of 2</dim>");
		expect(lines[1]).toBe("<b>Which language?</b>");
	});

	it("does not show progress indicator for single question", () => {
		const { lines } = renderSnapshot([q1]);

		expect(lines[0]).toBe("<b>Which language?</b>");
	});

	it("shows back hint on second question but not first", () => {
		const comp = createComp([q1, q2], () => {});

		// First question: no back hint
		const lines1 = comp.render(80);
		expect(lines1[lines1.length - 1]).toBe("<dim>Enter to select · ↑/↓ to navigate · Esc to cancel</dim>");

		// Answer first question to advance
		comp.handleInput("\r"); // select TypeScript

		// Second question: has back hint
		const lines2 = comp.render(80);
		expect(lines2[0]).toBe("<dim>Question 2 of 2</dim>");
		expect(lines2[lines2.length - 1]).toBe(
			"<dim>← to go back · Enter to select · ↑/↓ to navigate · Esc to cancel</dim>",
		);
	});

	it("auto-advances after answering each question", () => {
		let captured: QuestionResult[] | null = null;
		const comp = createComp([q1, q2], (r) => {
			captured = r;
		});

		// Answer Q1
		comp.handleInput("\r"); // select TypeScript

		// Should now show Q2
		const lines = comp.render(80);
		expect(lines[0]).toBe("<dim>Question 2 of 2</dim>");
		expect(lines[1]).toBe("<b>Which framework?</b>");

		// Answer Q2
		comp.handleInput("\r"); // select React

		const reviewLines = comp.render(80);
		expect(reviewLines[1]).toBe("<b>Review your answers</b>");
		expect(captured).toBeNull();

		comp.handleInput("\r"); // submit answers
		expect(captured).toEqual([
			{ answer: "TypeScript", selectedIndex: 0 },
			{ answer: "React", selectedIndex: 0 },
		]);
	});

	it("submits all answers after answering last question", () => {
		let captured: QuestionResult[] | null = null;
		const comp = createComp([q1, q2, q3], (r) => {
			captured = r;
		});

		// Answer Q1
		comp.handleInput("\r"); // TypeScript
		// Answer Q2
		comp.handleInput("\r"); // React
		// Q3 is multi-select: toggle two options and submit
		comp.handleInput(" "); // toggle Vercel
		comp.handleInput("\x1b[B"); // down to AWS
		comp.handleInput(" "); // toggle AWS
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("\x1b[B"); // down to Submit
		comp.handleInput("\r"); // confirm

		const reviewLines = comp.render(80);
		expect(reviewLines[1]).toBe("<b>Review your answers</b>");
		expect(captured).toBeNull();

		comp.handleInput("\r"); // submit answers
		expect(captured).toEqual([
			{ answer: "TypeScript", selectedIndex: 0 },
			{ answer: "React", selectedIndex: 0 },
			{
				answer: "Vercel, AWS",
				selectedIndex: 0,
				answers: ["Vercel", "AWS"],
				selectedIndices: [0, 1],
			},
		]);
	});

	it("shows Next for non-final multi-select confirmation and Submit on the last question", () => {
		const comp = createComp([q3, q2], () => {});

		// First question is multi-select and not final: confirmation row is Next.
		comp.handleInput("\x1b[B"); // down to AWS
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("\x1b[B"); // down to Next
		let lines = comp.render(80);
		expect(lines).toContain("  <accent>❯</accent> <b>Next</b>");

		comp.handleInput("\r"); // continue even with nothing selected
		lines = comp.render(80);
		expect(lines[1]).toBe("<b>Which framework?</b>");

		const singleFinal = createComp([q1, q3], () => {});
		singleFinal.handleInput("\r"); // advance to final multi-select question
		singleFinal.handleInput("\x1b[B"); // down to AWS
		singleFinal.handleInput("\x1b[B"); // down to Other
		singleFinal.handleInput("\x1b[B"); // down to Submit
		const finalLines = singleFinal.render(80);
		expect(finalLines).toContain("  <accent>❯</accent> <b>Submit</b>");
	});

	it("goes back to previous question with Left arrow", () => {
		const comp = createComp([q1, q2], () => {});

		// Answer Q1 to advance
		comp.handleInput("\r"); // select TypeScript
		const lines2 = comp.render(80);
		expect(lines2[1]).toBe("<b>Which framework?</b>");

		// Go back to Q1
		comp.handleInput("\x1b[D"); // Left arrow
		const lines1 = comp.render(80);
		expect(lines1[0]).toBe("<dim>Question 1 of 2</dim>");
		expect(lines1[1]).toBe("<b>Which language?</b>");
	});

	it("shows the selected answer when returning to an answered single-select question", () => {
		const comp = createComp([q1, q2], () => {});

		comp.handleInput("\x1b[B"); // focus Python
		comp.handleInput("\r"); // answer Q1 and advance
		comp.handleInput("\x1b[D"); // return to Q1

		const lines = comp.render(80);
		expect(lines).toContain("  <accent>❯</accent> <success><b>Python</b></success> <success>✓</success>");
		expect(lines).toContain("    <success>General purpose</success>");
	});

	it("focuses the selected answer when returning to an answered single-select question", () => {
		const comp = createComp([q1, q2], () => {});

		comp.handleInput("\x1b[B"); // focus Python
		comp.handleInput("\r"); // answer Q1 and advance
		comp.handleInput("\x1b[D"); // return to Q1
		comp.handleInput("\x1b[A"); // browse away from the selected answer
		comp.handleInput("\x1b[C"); // go to Q2
		comp.handleInput("\x1b[D"); // return to Q1 again

		const lines = comp.render(80);
		expect(lines).toContain("  <accent>❯</accent> <success><b>Python</b></success> <success>✓</success>");
		expect(lines).not.toContain("  <accent>❯</accent> <b>TypeScript</b>");
	});

	it("goes forward to later questions with Right arrow and Tab before answering", () => {
		const comp = createComp([q1, q2, q3], () => {});

		let lines = comp.render(80);
		expect(lines[1]).toBe("<b>Which language?</b>");

		comp.handleInput("\x1b[C"); // Q1 -> Q2
		lines = comp.render(80);
		expect(lines[1]).toBe("<b>Which framework?</b>");

		comp.handleInput("\t"); // Q2 -> Q3
		lines = comp.render(80);
		expect(lines[1]).toBe("<b>Deploy target?</b>");
	});

	it("does not go forward beyond the last question", () => {
		const comp = createComp([q1, q2], () => {});

		comp.handleInput("\x1b[C");
		comp.handleInput("\t");
		const after = comp.render(80);

		expect(after[1]).toBe("<b>Review your answers</b>");
	});

	it("shows a review warning instead of submitting incomplete answers from the last question", () => {
		let captured: QuestionResult[] | null | undefined;
		const comp = createComp([q1, q2, q3], (r) => {
			captured = r;
		});

		comp.handleInput("\x1b[C"); // Q1 -> Q2, unanswered
		comp.handleInput("\x1b[C"); // Q2 -> Q3, unanswered
		comp.handleInput(" "); // select Vercel on Q3
		comp.handleInput("\x1b[B"); // down to AWS
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("\x1b[B"); // down to Submit
		comp.handleInput("\r"); // cannot submit because Q1 and Q2 are unanswered

		const lines = comp.render(80);
		expect(captured).toBeUndefined();
		expect(lines[0]).toBe("<dim>Question 4 of 4</dim>");
		expect(lines[1]).toBe("<b>Review your answers</b>");
		expect(lines).toContain("<warning>You have not answered all questions</warning>");
	});

	it("keeps a multi-select answer when navigating away before pressing Next", () => {
		let captured: QuestionResult[] | null = null;
		const comp = createComp([q3, q1], (r) => {
			captured = r;
		});

		comp.handleInput(" "); // select Vercel on Q1
		comp.handleInput("\t"); // leave the multi-select question without using Next
		expect(comp.render(80)[1]).toBe("<b>Which language?</b>");

		comp.handleInput("\r"); // answer Q2 and go to review
		const reviewLines = comp.render(80);
		expect(reviewLines[1]).toBe("<b>Review your answers</b>");
		expect(reviewLines).toContain("    <success>Vercel</success>");

		comp.handleInput("\r"); // submit answers
		expect(captured).toEqual([
			{
				answer: "Vercel",
				selectedIndex: 0,
				answers: ["Vercel"],
				selectedIndices: [0],
			},
			{ answer: "TypeScript", selectedIndex: 0 },
		]);
	});

	it("re-answer previous question after going back", () => {
		let captured: QuestionResult[] | null = null;
		const comp = createComp([q1, q2], (r) => {
			captured = r;
		});

		// Answer Q1: TypeScript
		comp.handleInput("\r");
		// Go back
		comp.handleInput("\x1b[D");
		// Navigate to Python and select
		comp.handleInput("\x1b[B"); // down to Python
		comp.handleInput("\r"); // select Python

		// Should now show Q2 again
		const lines = comp.render(80);
		expect(lines[1]).toBe("<b>Which framework?</b>");

		// Answer Q2
		comp.handleInput("\r"); // React

		expect(comp.render(80)[1]).toBe("<b>Review your answers</b>");
		comp.handleInput("\r"); // submit answers

		expect(captured).toEqual([
			{ answer: "Python", selectedIndex: 1 },
			{ answer: "React", selectedIndex: 0 },
		]);
	});

	it("Left arrow is no-op on first question", () => {
		const comp = createComp([q1, q2], () => {});
		const before = comp.render(80);

		comp.handleInput("\x1b[D"); // Left arrow on Q1 → no-op
		const after = comp.render(80);

		expect(before).toEqual(after);
	});

	it("Left arrow does not navigate while typing in Other input", () => {
		const comp = createComp([q1, q2], () => {});

		// Navigate to Other on Q1
		comp.handleInput("\x1b[B"); // down to Python
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("x"); // type

		// Left arrow should NOT navigate back — input is focused
		comp.handleInput("\x1b[D");
		const lines = comp.render(80);
		expect(lines[1]).toBe("<b>Which language?</b>"); // still on Q1
	});

	it("Escape cancels entire multi-question flow", () => {
		let captured: QuestionResult[] | null = null;
		const comp = createComp([q1, q2], (r) => {
			captured = r;
		});

		comp.handleInput("\r"); // answer Q1
		comp.handleInput("\x1b"); // Escape on Q2

		expect(captured).toBeNull();
	});

	it("single question still returns array of one result", () => {
		let captured: QuestionResult[] | null = null;
		const comp = createComp([q1], (r) => {
			captured = r;
		});

		comp.handleInput("\r"); // select TypeScript

		expect(captured).toEqual([{ answer: "TypeScript", selectedIndex: 0 }]);
	});

	it("max 4 questions flow works end-to-end", () => {
		let captured: QuestionResult[] | null = null;
		const comp = createComp([q1, q2, q3, q1], (r) => {
			captured = r;
		});

		comp.handleInput("\r"); // Q1: TypeScript
		comp.handleInput("\r"); // Q2: React
		// Q3: multi-select
		comp.handleInput(" "); // toggle Vercel
		comp.handleInput("\x1b[B"); // down to AWS
		comp.handleInput("\x1b[B"); // down to Other
		comp.handleInput("\x1b[B"); // down to Submit
		comp.handleInput("\r"); // confirm
		// Q4
		comp.handleInput("\r"); // TypeScript
		expect(comp.render(80)[1]).toBe("<b>Review your answers</b>");
		comp.handleInput("\r"); // submit answers

		expect(captured).toHaveLength(4);
		expect(captured![0]?.answer).toBe("TypeScript");
		expect(captured![1]?.answer).toBe("React");
		expect(captured![2]?.answer).toBe("Vercel");
		expect(captured![3]?.answer).toBe("TypeScript");
	});
});
