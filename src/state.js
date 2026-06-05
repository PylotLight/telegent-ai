"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.State = void 0;
exports.State = {
    currentAiModel: process.env.AI_MODEL || (await Promise.resolve().then(function () { return require("./config"); })).DEFAULT_MODEL,
    setCurrentModel: function (model) {
        this.currentAiModel = model;
    }
};
