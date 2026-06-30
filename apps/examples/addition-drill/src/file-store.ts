import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Progress,
  type ProgressStore,
  type Result,
  type SaveKey,
  type StoreError,
  decodeSave,
  encodeSave,
  err,
  ok,
} from "@learn-engine/lessons";

/**
 * Node filesystem `ProgressStore` (the §11.4 runtime adapter, vendored into the example).
 * Lives outside `@learn-engine/lessons` so the core stays free of `node:fs`.
 */
export class FileProgressStore implements ProgressStore {
  constructor(private readonly dir: string) {}

  private path(key: SaveKey): string {
    return join(this.dir, `${encodeURIComponent(key)}.json`);
  }

  async load(key: SaveKey): Promise<Result<Progress | null, StoreError>> {
    try {
      const raw: unknown = JSON.parse(await readFile(this.path(key), "utf8"));
      return decodeSave(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return ok(null);
      return err({ kind: "io", cause: e });
    }
  }

  async save(key: SaveKey, p: Progress): Promise<Result<void, StoreError>> {
    try {
      await mkdir(this.dir, { recursive: true });
      await writeFile(this.path(key), JSON.stringify(encodeSave(p)), "utf8");
      return ok(undefined);
    } catch (e) {
      return err({ kind: "io", cause: e });
    }
  }

  async list(): Promise<Result<readonly SaveKey[], StoreError>> {
    try {
      const files = await readdir(this.dir);
      return ok(
        files
          .filter((f) => f.endsWith(".json"))
          .map((f) => decodeURIComponent(f.slice(0, -5)) as SaveKey),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return ok([]);
      return err({ kind: "io", cause: e });
    }
  }

  async delete(key: SaveKey): Promise<Result<void, StoreError>> {
    try {
      await unlink(this.path(key));
      return ok(undefined);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return ok(undefined);
      return err({ kind: "io", cause: e });
    }
  }
}
