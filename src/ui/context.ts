import type { Repo } from "../db/repo";
import type { Student } from "../core/types";

export interface Ctx {
  repo: Repo;
  /** Currently selected class, or null for none yet. */
  classId: number | null;
  setClass(id: number | null): void;
  rerender(): void;
  toast(message: string): void;
  roster(): Student[];
  /** Write the database to IndexedDB now (used before a wipe or reload). */
  flush(): void;
  resetAll(): Promise<void>;
}

export const API_KEY_STORAGE = "chronicle.anthropicKey";
