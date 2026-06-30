import { BORDERS, Surface, rasterizeToAnsi, rgb } from "@learn-engine/core";

const width = 60;
const height = 18;
const screen = Surface.create(width, height);

screen.drawBox({ x: 0, y: 0, width, height }, BORDERS.bold, {
  fg: rgb(90, 90, 90),
});
screen.drawText(4, 2, "SURFACE DEMO", { fg: rgb(0, 255, 128), bold: true });
screen.fillRect(
  { x: 2, y: 6, width: width - 4, height: 5 },
  { char: ".", fg: rgb(40, 90, 40), bg: "default", bold: false },
);

const sprite = Surface.transparent(5, 1);
sprite.drawText(0, 0, "(o_o)", { fg: rgb(255, 80, 80) });
screen.blit(sprite, 6, 8);

screen.drawText(4, 13, "RED", { fg: rgb(255, 0, 0) });
screen.drawText(7, 13, "GRN", { fg: rgb(0, 255, 0) });
screen.drawText(10, 13, "BLU", { fg: rgb(80, 120, 255) });

process.stdout.write(`${rasterizeToAnsi(screen).join("\n")}\n`);
