export const State = {
  currentAiModel: process.env.AI_MODEL || (await import("./config")).DEFAULT_MODEL,
  setCurrentModel(model: string) {
    this.currentAiModel = model;
  }
};
