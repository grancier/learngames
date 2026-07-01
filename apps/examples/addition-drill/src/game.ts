import { BORDERS, Surface, rgb } from "@learn-engine/core";
import { renderBanner } from "@learn-engine/intents";
import type {
  InputFrame,
  LessonVerdict,
  StepResult,
} from "@learn-engine/runtime";

export interface TerminalDimensions {
  readonly columns: number;
  readonly rows: number;
}

export interface AdditionProblem {
  readonly a: number;
  readonly b: number;
  readonly answer: number;
}

export type AdditionStatus = "question" | "win" | "lose";

export interface AdditionGameState {
  readonly problem: AdditionProblem;
  readonly answerText: string;
  readonly attempts: number;
  readonly status: AdditionStatus;
}

export interface AdditionGame {
  init(): AdditionGameState;
  step(
    state: AdditionGameState,
    input: InputFrame,
    ctx: { readonly tick: number },
  ): StepResult<AdditionGameState>;
  score(state: AdditionGameState): number;
  attempts(state: AdditionGameState): number;
}

type BannerOutcome = Extract<AdditionStatus, "win" | "lose">;

const BG = rgb(43, 47, 58);
const BORDER = rgb(80, 200, 210);
const INK = rgb(230, 240, 255);
const RED = rgb(230, 60, 55);
const GREEN = rgb(90, 205, 85);
const OUTLINE = rgb(0, 0, 0);
const SHADOW = rgb(250, 204, 60);

export function createAdditionProblem(): AdditionProblem {
  return { a: 6, b: 6, answer: 12 };
}

export function formatAdditionPrompt(problem: AdditionProblem): string {
  return `What is ${problem.a}+${problem.b}?`;
}

export function renderOutcomeBanner(
  outcome: BannerOutcome,
  dimensions: TerminalDimensions,
): Surface {
  return outcome === "win"
    ? renderBanner(dimensions.columns, dimensions.rows, "YOU\nWIN!!!", {
        fill: GREEN,
        background: BG,
        outline: OUTLINE,
        shadow: SHADOW,
      })
    : renderBanner(dimensions.columns, dimensions.rows, "X", {
        fill: RED,
        background: BG,
        outline: OUTLINE,
      });
}

export function createAdditionLesson(
  dimensions: TerminalDimensions,
): AdditionGame {
  return {
    init(): AdditionGameState {
      return {
        problem: createAdditionProblem(),
        answerText: "",
        attempts: 0,
        status: "question",
      };
    },
    step(
      state: AdditionGameState,
      input: InputFrame,
      _ctx: { readonly tick: number },
    ): StepResult<AdditionGameState> {
      const next = advanceAdditionState(state, input);
      const surface = renderAdditionState(next, dimensions);
      const verdict = verdictFor(next);
      if (verdict === undefined) return { state: next, surface };
      return {
        state: next,
        surface,
        verdict,
      };
    },
    score(state: AdditionGameState): number {
      return state.status === "win" ? 10 : 0;
    },
    attempts(state: AdditionGameState): number {
      return state.attempts;
    },
  };
}

function advanceAdditionState(
  state: AdditionGameState,
  input: InputFrame,
): AdditionGameState {
  let answerText = state.answerText;
  let submitted = false;

  for (const edit of input.text) {
    switch (edit.kind) {
      case "insert":
        answerText = `${answerText}${edit.text.replace(/\D/g, "")}`.slice(0, 3);
        break;
      case "backspace":
        answerText = answerText.slice(0, -1);
        break;
      case "submit":
        submitted = true;
        break;
    }
  }

  if (!submitted || state.status !== "question") {
    return { ...state, answerText };
  }

  const status =
    Number.parseInt(answerText, 10) === state.problem.answer ? "win" : "lose";
  return {
    ...state,
    answerText,
    attempts: state.attempts + 1,
    status,
  };
}

function renderAdditionState(
  state: AdditionGameState,
  dimensions: TerminalDimensions,
): Surface {
  switch (state.status) {
    case "win":
    case "lose":
      return renderOutcomeBanner(state.status, dimensions);
    case "question":
      return renderQuestion(state, dimensions);
  }
}

function renderQuestion(
  state: AdditionGameState,
  dimensions: TerminalDimensions,
): Surface {
  const surface = Surface.create(dimensions.columns, dimensions.rows, {
    char: " ",
    fg: INK,
    bg: BG,
    bold: false,
  });
  const fieldHeight = Math.max(3, Math.floor(dimensions.rows * 0.25));
  const y = Math.max(0, dimensions.rows - fieldHeight);
  surface.drawBox(
    { x: 0, y, width: dimensions.columns, height: fieldHeight },
    BORDERS.bold,
    { fg: BORDER, bg: BG, bold: true },
  );
  surface.drawText(
    2,
    y + Math.floor(fieldHeight / 2),
    `${formatAdditionPrompt(state.problem)}  ${state.answerText}`,
    { fg: INK, bg: BG, bold: true },
  );
  return surface;
}

function verdictFor(state: AdditionGameState): LessonVerdict | undefined {
  switch (state.status) {
    case "win":
      return "win";
    case "lose":
      return "lose";
    case "question":
      return undefined;
  }
}

/* Big-glyph banners are composited by the @learn-engine/intents banner intent. */
