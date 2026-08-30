import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // AI-agent tooling, not part of the product (see AI_ARTIFACTS.md).
    ".claude/**",
    ".claude-flow/**",
    ".swarm/**",
    ".agents/**",
    ".windsurf/**",
    ".playwright-mcp/**",
    ".playwright-cli/**",
  ]),
]);

export default eslintConfig;
