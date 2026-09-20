import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { RposStore } from "./store.js"
import { emptyRposState } from "./store.js"
import type { RposState } from "./types.js"

export class JsonFileRposStore implements RposStore {
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async load(): Promise<RposState> {
    try {
      return JSON.parse(await readFile(this.filePath, "utf8")) as RposState
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyRposState()
      throw error
    }
  }

  async save(state: RposState): Promise<void> {
    const write = async () => {
      await mkdir(dirname(this.filePath), { recursive: true })
      const temporaryPath = `${this.filePath}.tmp`
      await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8")
      await rename(temporaryPath, this.filePath)
    }
    this.writeQueue = this.writeQueue.then(write, write)
    await this.writeQueue
  }
}
