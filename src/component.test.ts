import type { Theme } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { createQuestionComponent, type QuestionParams } from "./component.js";

function mockTheme(): Theme {
	return {
		bold: (s: string) => `<b>${s}</b>`,
		fg: (_color: string, s: string) => `<${_color}>${s}</${_color}>`,
	} as unknown as Theme;
}

function mockKb() {
	return { matches: () => false };
}

function mockTui() {
	const requested: number[] = [];
	return { requestRender: () => requested.push(1), _requested: requested };
}

type Done = (result: { answer: string; selectedIndex: number } | null) => void;

function renderSnapshot(params: QuestionParams): { lines: string[]; result: unknown } {
	const theme = mockTheme();
	const kb = mockKb();
	const tui = mockTui();
	let captured: unknown;
	const done: Done = (r) => {
		captured = r;
	};

	const comp = createQuestionComponent(params, theme, kb as never, tui as never, done);
	const lines = comp.render(80);
	return { lines, result: captured };
}

describe("render snapshot", () => {
	it("renders question with 3 options, first highlighted", () => {
		const { lines } = renderSnapshot({
			question: "Which framework should we use?",
			header: "Framework",
			options: [
				{ label: "React", description: "A JavaScript library for building UIs" },
				{ label: "Vue", description: "The progressive JavaScript framework" },
				{ label: "Svelte", description: "Cybernetically enhanced web apps" },
			],
		});

		expect(lines).toEqual([
			"<b>Which framework should we use?</b>",
			"",
			"  <accent>❯</accent> <b>React</b>",
			"    <muted>A JavaScript library for building UIs</muted>",
			"    Vue",
			"    <dim>The progressive JavaScript framework</dim>",
			"    Svelte",
			"    <dim>Cybernetically enhanced web apps</dim>",
		]);
	});

	it("renders question with 2 options", () => {
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
		]);
	});

	it("renders single option", () => {
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
		]);
	});
});
