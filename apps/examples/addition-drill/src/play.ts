import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  type Level,
  type LocaleBundle,
  type LocaleId,
  Localizer,
  type Progress,
  type Response,
  Scheduler,
  type Seat,
  type SeatProgress,
  configure,
  makeRng,
  nextChallenge,
  parseContentPack,
  parsePlayerName,
  saveKeyForPlayer,
  start,
  streakPolicy,
  submit,
} from "@learn-engine/lessons";
import { parse as parseYaml } from "yaml";
import { FileProgressStore } from "./file-store.js";
import { ADD, AdditionSource } from "./source.js";

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

async function main(): Promise<void> {
  // 2/5. content pack + locales
  const pack = parseContentPack(
    parseYaml(await readFile(here("../content/pack.yaml"), "utf8")),
  );
  if (!pack.ok) throw new Error(`content: ${JSON.stringify(pack.error)}`);

  const bundles: LocaleBundle[] = await Promise.all(
    pack.value.locales.map(async (locale) => ({
      locale,
      messages: JSON.parse(
        await readFile(here(`../content/${locale}.json`), "utf8"),
      ) as Record<string, string>,
    })),
  );
  const i18n = new Localizer(bundles, pack.value.defaultLocale);
  const locale = "en" as LocaleId;

  // 1/4. player + store (+ resume if a save exists)
  const name = parsePlayerName("Ada");
  if (!name.ok) throw new Error("bad name");
  const store = new FileProgressStore(here("../.saves"));
  const key = saveKeyForPlayer(name.value);

  const loaded = await store.load(key);
  if (!loaded.ok) throw new Error(`load: ${JSON.stringify(loaded.error)}`);
  const resume: ReadonlyMap<Seat, Partial<SeatProgress>> | undefined =
    loaded.value
      ? new Map([
          [
            "one",
            {
              level: loaded.value.levels.get(ADD) ?? (0 as Level),
              mastery: loaded.value.mastery,
            },
          ],
        ])
      : undefined;

  // 6. configure session
  let session = start(
    configure(
      {
        roster: { kind: "solo", player: { name: name.value } },
        scheduler: new Scheduler([{ source: new AdditionSource(), weight: 1 }]),
        policy: streakPolicy(3),
        startLevel: 0 as Level,
      },
      resume,
    ),
  );

  // 7. deterministic headless loop — an auto-player that always answers correctly
  const rng = makeRng(1234);
  for (let turn = 0; turn < 5; turn++) {
    const challenge = nextChallenge(session, rng);
    console.log(
      i18n.format(challenge.prompt.key, locale, challenge.prompt.params),
    );
    const correctAnswer =
      challenge.answer.kind === "integer" ? challenge.answer.value : 0;
    const response: Response = { kind: "number", value: correctAnswer };
    const out = submit(session, challenge, response, Date.now());
    session = out.session;
    console.log(
      i18n.format("ui.feedback", locale, { outcome: out.result.outcome }),
    );
  }

  // persist
  const seat = session.seats.get("one");
  if (!seat) throw new Error("missing seat");
  const progress: Progress = {
    player: name.value,
    levels: new Map([[ADD, seat.level]]),
    mastery: seat.mastery,
    highScore: Math.max(loaded.value?.highScore ?? 0, seat.score),
    updatedAt: Date.now(),
  };
  const saved = await store.save(key, progress);
  if (!saved.ok) throw new Error(`save: ${JSON.stringify(saved.error)}`);

  console.log(
    i18n.format("ui.score", locale, { name: name.value, score: seat.score }),
  );
}

void main();
