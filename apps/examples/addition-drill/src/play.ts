import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { rasterizeToAnsi } from "@learn-engine/core";
import { EMPTY_INPUT } from "@learn-engine/runtime";
import type { InputFrame, Key } from "@learn-engine/runtime";
import {
  createAdditionLesson,
  createAdditionProblem,
  formatAdditionPrompt,
} from "./game.js";

const dimensions = {
  columns: output.columns ?? 80,
  rows: output.rows ?? 24,
};

const lesson = createAdditionLesson(dimensions);
let state = lesson.init();
const promptFrame = lesson.step(state, EMPTY_INPUT, { tick: 0 });
state = promptFrame.state;

output.write(`${rasterizeToAnsi(promptFrame.surface).join("\n")}\n\n`);

const readline = createInterface({ input, output });
const answer = await readline.question(
  `${formatAdditionPrompt(createAdditionProblem())} `,
);
readline.close();

const result = lesson.step(
  state,
  {
    edges: [],
    held: new Set<Key>(),
    text: [{ kind: "insert", text: answer }, { kind: "submit" }],
  } satisfies InputFrame,
  { tick: 1 },
);

output.write("\x1b[2J\x1b[H");
output.write(`${rasterizeToAnsi(result.surface).join("\n")}\n`);
