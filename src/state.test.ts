import { describe, expect, it } from "vitest";
import { createInitialState, type QuestionItem, reducer } from "./state.js";

function items(optionCount: number): QuestionItem[] {
	return [...Array.from({ length: optionCount }, () => ({ type: "option" as const })), { type: "input" }];
}

describe("createInitialState", () => {
	it("initializes with first option highlighted", () => {
		const stateItems = items(3);
		const state = createInitialState(stateItems);
		expect(state).toEqual({
			questionIndex: 0,
			highlightedIndex: 0,
			selectedIndex: null,
			confirmed: false,
			items: stateItems,
			textInputValue: "",
		});
	});

	it("works with minimum 1 option", () => {
		const state = createInitialState(items(1));
		expect(state.highlightedIndex).toBe(0);
		expect(state.items).toHaveLength(2);
	});

	it("works with 4 options", () => {
		const state = createInitialState(items(4));
		expect(state.items).toHaveLength(5);
	});

	it("rejects an empty item list", () => {
		expect(() => createInitialState([])).toThrow("Question state requires at least one item");
	});
});

describe("navigateDown", () => {
	it("moves highlight to next option", () => {
		const state = createInitialState(items(3));
		const next = reducer(state, { type: "navigateDown" });
		expect(next.highlightedIndex).toBe(1);
	});

	it("wraps around from 'Other' to first", () => {
		let state = createInitialState(items(3));
		state = reducer(state, { type: "navigateDown" }); // 0->1
		state = reducer(state, { type: "navigateDown" }); // 1->2
		state = reducer(state, { type: "navigateDown" }); // 2->3 (Other)
		state = reducer(state, { type: "navigateDown" }); // 3->0 (wrap)
		expect(state.highlightedIndex).toBe(0);
	});

	it("navigates to 'Other' at last index", () => {
		let state = createInitialState(items(2));
		state = reducer(state, { type: "navigateDown" }); // 0->1
		state = reducer(state, { type: "navigateDown" }); // 1->2 (Other)
		expect(state.highlightedIndex).toBe(2);
	});

	it("stays at 0 with single option pressing once", () => {
		let state = createInitialState(items(1));
		state = reducer(state, { type: "navigateDown" }); // 0->1 (Other)
		expect(state.highlightedIndex).toBe(1);
		state = reducer(state, { type: "navigateDown" }); // 1->0 (wrap)
		expect(state.highlightedIndex).toBe(0);
	});

	it("keeps text input when navigating away from Other", () => {
		let state = createInitialState(items(3));
		state = { ...state, highlightedIndex: 3, textInputValue: "typed" };
		state = reducer(state, { type: "navigateDown" }); // Other->0
		expect(state.textInputValue).toBe("typed");
	});
});

describe("navigateUp", () => {
	it("moves highlight to previous option", () => {
		let state = createInitialState(items(3));
		state = reducer(state, { type: "navigateDown" }); // 0->1
		state = reducer(state, { type: "navigateUp" }); // 1->0
		expect(state.highlightedIndex).toBe(0);
	});

	it("wraps around from first to 'Other'", () => {
		const state = createInitialState(items(3));
		const next = reducer(state, { type: "navigateUp" });
		expect(next.highlightedIndex).toBe(3);
	});

	it("keeps text input when navigating away from Other", () => {
		let state = createInitialState(items(3));
		state = { ...state, highlightedIndex: 3, textInputValue: "typed" };
		state = reducer(state, { type: "navigateUp" }); // Other->2
		expect(state.textInputValue).toBe("typed");
	});
});

describe("selectCurrent", () => {
	it("confirms the highlighted real option", () => {
		const stateItems = items(3);
		const state = createInitialState(stateItems);
		const result = reducer(state, { type: "selectCurrent" });
		expect(result).toEqual({
			questionIndex: 0,
			highlightedIndex: 0,
			selectedIndex: 0,
			confirmed: true,
			items: stateItems,
			textInputValue: "",
		});
	});

	it("confirms whichever real option is highlighted", () => {
		let state = createInitialState(items(3));
		state = reducer(state, { type: "navigateDown" }); // highlight 1
		state = reducer(state, { type: "selectCurrent" });
		expect(state.selectedIndex).toBe(1);
		expect(state.confirmed).toBe(true);
	});

	it("confirms with text input when 'Other' has text", () => {
		let state = createInitialState(items(3));
		state = { ...state, highlightedIndex: 3, textInputValue: "my answer" };
		const result = reducer(state, { type: "selectCurrent" });
		expect(result.confirmed).toBe(true);
		expect(result.selectedIndex).toBe(3);
		expect(result.textInputValue).toBe("my answer");
	});

	it("no-ops when 'Other' has empty text", () => {
		let state = createInitialState(items(3));
		state = { ...state, highlightedIndex: 3, textInputValue: "" };
		const result = reducer(state, { type: "selectCurrent" });
		expect(result).toEqual(state);
	});
});

describe("updateTextInput", () => {
	it("sets text when Other is highlighted", () => {
		let state = createInitialState(items(3));
		state = { ...state, highlightedIndex: 3 };
		const result = reducer(state, { type: "updateTextInput", text: "hello" });
		expect(result.textInputValue).toBe("hello");
	});

	it("is no-op when a regular option is highlighted", () => {
		const state = createInitialState(items(3));
		const result = reducer(state, { type: "updateTextInput", text: "hello" });
		expect(result).toEqual(state);
	});

	it("appends characters incrementally", () => {
		let state = createInitialState(items(3));
		state = { ...state, highlightedIndex: 3 };
		state = reducer(state, { type: "updateTextInput", text: "h" });
		state = reducer(state, { type: "updateTextInput", text: "he" });
		state = reducer(state, { type: "updateTextInput", text: "hel" });
		expect(state.textInputValue).toBe("hel");
	});
});

describe("confirmed state blocks actions", () => {
	it("ignores navigateDown after confirmed", () => {
		let state = createInitialState(items(3));
		state = reducer(state, { type: "selectCurrent" });
		const after = reducer(state, { type: "navigateDown" });
		expect(after).toEqual(state);
	});

	it("ignores navigateUp after confirmed", () => {
		let state = createInitialState(items(3));
		state = reducer(state, { type: "selectCurrent" });
		const after = reducer(state, { type: "navigateUp" });
		expect(after).toEqual(state);
	});

	it("ignores selectCurrent after confirmed", () => {
		let state = createInitialState(items(3));
		state = reducer(state, { type: "selectCurrent" });
		const after = reducer(state, { type: "selectCurrent" });
		expect(after).toEqual(state);
	});
});

describe("round-trip: navigate to Other, type, confirm", () => {
	it("navigates to Other, types, confirms", () => {
		let state = createInitialState(items(2));
		state = reducer(state, { type: "navigateUp" }); // wrap to Other (index 2)
		state = reducer(state, { type: "updateTextInput", text: "custom" });
		state = reducer(state, { type: "selectCurrent" });
		expect(state.confirmed).toBe(true);
		expect(state.textInputValue).toBe("custom");
		expect(state.selectedIndex).toBe(2);
	});
});

describe("round-trip: type on Other, clear with escape, navigate away", () => {
	it("types on Other, escape clears text, navigate away clears nothing extra", () => {
		let state = createInitialState(items(3));
		state = { ...state, highlightedIndex: 3 };
		state = reducer(state, { type: "updateTextInput", text: "typed" });
		expect(state.textInputValue).toBe("typed");
		// simulate escape clearing text (done in component)
		state = reducer(state, { type: "updateTextInput", text: "" });
		expect(state.textInputValue).toBe("");
		// navigate away
		state = reducer(state, { type: "navigateUp" });
		expect(state.highlightedIndex).toBe(2);
		expect(state.textInputValue).toBe("");
	});
});
