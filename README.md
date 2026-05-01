# pi-ask-user-question

Pi coding agent extension for `ask_user_question`, an interactive tool that asks the user 1-4 focused multiple-choice questions and returns the selected answers to the agent.

This README records the current UI and interaction contract implemented by the extension.

## Tool Contract

The extension registers one tool:

```text
ask_user_question
```

Input shape:

- `questions`: 1-4 questions.
- `question`: full question text. It should be clear, specific, and end with `?`.
- `header`: short tab label, 12 characters or fewer.
- `options`: 2-4 configured options.
- `options[].label`: concise option label.
- `options[].description`: explanatory text rendered under the option.
- `options[].preview`: accepted by the schema, but not rendered by the current UI.
- `multiSelect`: optional boolean. Defaults to `false`.

Question texts must be unique. Option labels must be unique within each question.

The UI always adds one inline custom input row after the configured options. The caller should not add an extra option for that row.

## Page Layout

Every question page uses the same top-to-bottom structure:

```text
[HeaderA] [HeaderB]

Question text?

> 1. [ ] Option A
     Description for option A
  2. [ ] Option B
     Description for option B
  3. [ ] Type something
     Submit

Enter/Space to select · Tab/Arrow keys to navigate · Esc to cancel
```

Single-select questions omit the checkbox column and submit row:

```text
[Header]

Question text?

> 1. Option A
     Description for option A
  2. Option B
     Description for option B
  3. Type something

Enter/Space to select · ↑/↓ to navigate · Esc to cancel
```

Current visual rules:

- Every question page renders header tabs.
- A single question renders one selected header tab.
- Multiple questions render all tabs side by side. The active tab uses selected styling, inactive tabs use dim styling.
- The question text is forced bold.
- Every selectable option row is numbered.
- The focus marker is at the left edge of the component line.
- The custom input row displays `Type something`; it does not display `Other`.
- `Type something` is dim text, not a highlighted background.
- Option descriptions are dim when unfocused and muted/bold-adjacent when focused.
- Selected or checked options use success styling for the whole option row, including the number, checkbox, label, and description.
- Description text is indented to align with the option content column.

## Single Question

For a single question, both single-select and multi-select pages use this footer:

```text
Enter/Space to select · ↑/↓ to navigate · Esc to cancel
```

Single-select behavior:

- `↑` / `↓` moves focus through configured options and the custom input row.
- `Enter` or `Space` on a configured option submits that answer immediately.
- `Enter` on the custom input row submits only when text has been typed.
- Empty custom input does not submit.
- `Esc` cancels the request, unless it first clears typed custom input.

Multi-select behavior:

- `↑` / `↓` moves focus through configured options, the custom input row, and `Submit`.
- `Enter` on a configured option toggles it.
- `Enter` on `Submit` submits selected answers.
- `Submit` does nothing when no answer is selected.
- Typing custom input automatically includes the custom row in the selected answers.
- Clearing custom input removes that row from the selected answers.

## Multiple Questions

Question pages in a multi-question flow use this footer:

```text
Enter/Space to select · Tab/Arrow keys to navigate · Esc to cancel
```

Navigation behavior:

- `Tab` or `Right` moves to the next question. On the last question it opens review.
- `Shift+Tab` or `Left` moves to the previous question.
- Left/right question navigation is disabled while the custom input row is focused, so typed text is not interrupted.
- Single-select `Enter` or `Space` confirms the focused row and advances to the next question or review.
- Multi-select `Submit` advances to the next question or review.
- Multi-question navigation can move forward before every question has an answer; review warns when answers are missing.

The review page is still separate from question pages. It shows collected answers plus:

```text
Submit answers
Cancel

Enter/Space to select · ↑/↓ to navigate · ← to go back · Esc to cancel
```

## Custom Input

The custom input row is inline.

Unfocused and empty:

```text
  3. Type something
```

Focused and empty:

```text
> 3. Type something
```

The cursor is rendered brightly on the `T` cell itself, so the placeholder text does not shift to the right.

Focused with typed text:

```text
> 3. custom text▌
```

For multi-select, the same row keeps the checkbox column:

```text
> 3. [ ] Type something
```

The placeholder text remains dim, except for the focused cursor cell.

## Keyboard Shortcuts

Supported keys on question pages:

- `↑` / `↓`: move focus within the current question.
- `Enter`: select, toggle, submit, or advance depending on the focused row.
- `Space`: selects regular single-select rows, toggles multi-select option rows, confirms focused submit/review rows, and types a space inside non-empty custom input.
- `Esc`: clears typed custom input when that input is focused and non-empty; otherwise cancels.
- `1`-`9`: direct action for the visible numbered row.
- `Tab` / `Right`: next question in multi-question flows.
- `Shift+Tab` / `Left`: previous question in multi-question flows.

Number key behavior:

- On a configured option, the number performs the same action as focusing that row and pressing `Enter`.
- On the custom input row, the number focuses the input row without submitting.
- While the custom input row is focused, number keys type digits instead of acting as shortcuts.

Space behavior:

- `Space` on an empty custom input row is ignored.
- While the custom input row is focused, `Space` types a space after text has started instead of toggling selection.

## Result Format

On success, the tool returns text content like:

```text
User has answered your questions: "Question text?"="Selected answer". You can now continue with the user's answers in mind.
```

It also returns structured `details`:

```json
{
  "questions": [
    {
      "question": "Question text?",
      "header": "Header",
      "options": [
        {
          "label": "Option A",
          "description": "Description"
        }
      ],
      "multiSelect": false
    }
  ],
  "answers": {
    "Question text?": "Selected answer"
  }
}
```

For multi-select answers, the display answer is a comma-separated string in selection order. The component internally tracks selected labels and indices, but the registered tool currently exposes the formatted answer map in `details.answers`.

If the user cancels, the tool throws `User cancelled`.

## Deferred Or Unsupported

The current UI does not implement or display:

- `ctrl+g` / Notepad editing.
- A `Chat about this` action.
- Annotation or notes entry after selection.
- Option preview rendering.

Unsupported actions are omitted from the footer so the UI only advertises working behavior.
