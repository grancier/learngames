import { BORDERS, Surface, rgb } from "@learn-engine/core";
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

const BG = rgb(10, 14, 28);
const BORDER = rgb(80, 200, 210);
const INK = rgb(230, 240, 255);
const RED = rgb(230, 40, 40);
const GREEN = rgb(80, 220, 60);

const FONT_HEIGHT = 7;
const SPACE_GLYPH = ["   ", "   ", "   ", "   ", "   ", "   ", "   "] as const;
const FONT: Record<string, readonly string[]> = {
  "!": ["#", "#", "#", "#", "#", " ", "#"],
  I: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "#####"],
  N: ["#   #", "##  #", "# # #", "#  ##", "#   #", "#   #", "#   #"],
  O: [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  U: ["#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  W: ["#   #", "#   #", "#   #", "# # #", "# # #", "## ##", "#   #"],
  X: ["#   #", " # # ", "  #  ", "  #  ", "  #  ", " # # ", "#   #"],
  Y: ["#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
  " ": SPACE_GLYPH,
};

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
  const surface = Surface.create(dimensions.columns, dimensions.rows, {
    char: " ",
    fg: INK,
    bg: BG,
    bold: false,
  });
  drawBannerText(
    surface,
    outcome === "win" ? "YOU WIN!!!" : "X",
    outcome === "win" ? GREEN : RED,
  );
  return surface;
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

function drawBannerText(
  surface: Surface,
  text: string,
  fg: typeof GREEN,
): void {
  const rows = composeTextRows(text);
  const targetHeight = Math.max(1, Math.floor(surface.height * 0.85));
  const targetWidth = Math.min(
    surface.width,
    Math.max(
      1,
      Math.round(((rows[0] as string).length * targetHeight) / FONT_HEIGHT),
    ),
  );
  const originX = Math.floor((surface.width - targetWidth) / 2);
  const originY = Math.floor((surface.height - targetHeight) / 2);

  for (let y = 0; y < targetHeight; y++) {
    const sourceY = Math.floor((y / targetHeight) * FONT_HEIGHT);
    const row = rows[sourceY] as string;
    for (let x = 0; x < targetWidth; x++) {
      const sourceX = Math.floor((x / targetWidth) * row.length);
      const char = row[sourceX] as string;
      if (char !== " ") {
        surface.set(originX + x, originY + y, {
          char,
          fg,
          bg: BG,
          bold: true,
        });
      }
    }
  }
}

function composeTextRows(text: string): readonly string[] {
  const rows = Array.from({ length: FONT_HEIGHT }, () => "");
  for (const char of text) {
    const glyph = FONT[char] as readonly string[];
    for (let y = 0; y < FONT_HEIGHT; y++) {
      const glyphRow = glyph[y] as string;
      rows[y] = `${rows[y]}${glyphRow.replaceAll("#", char)} `;
    }
  }
  return rows.map((row) => row.trimEnd());
}
