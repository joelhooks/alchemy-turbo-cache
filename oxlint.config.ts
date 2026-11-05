import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    ".agent_sources/**",
    ".agent-sources/**",
    "node_modules/**",
    ".brain/**",
    ".pi/**",
    "**/dist/**",
    "scripts/**",
  ],
  options: { typeAware: true },
  rules: {
    "typescript/promise-function-async": "off",
    "unicorn/throw-new-error": "off",
  },
});
