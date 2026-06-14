import type { ChildProcess } from "node:child_process";

export const State = {
  currentAiModel: process.env.AI_MODEL || (await import("./config")).DEFAULT_MODEL,
  activeProcesses: new Map<number, ChildProcess>(),
  activeAbortControllers: new Map<number, AbortController>(),

  setCurrentModel(model: string) {
    this.currentAiModel = model;
  },

  abortRun(threadKey: number) {
    const controller = this.activeAbortControllers.get(threadKey);
    if (controller) {
      controller.abort();
      this.activeAbortControllers.delete(threadKey);
    }

    const child = this.activeProcesses.get(threadKey);
    if (child) {
      child.kill("SIGKILL");
      this.activeProcesses.delete(threadKey);
    }
  }
};

