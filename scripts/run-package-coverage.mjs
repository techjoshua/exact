import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const arguments_ = [
  vitest,
  "run",
  "--coverage",
  "--coverage.provider=v8",
  "--coverage.reporter=text",
  "--coverage.reporter=json-summary",
  "--coverage.reporter=html",
  "--coverage.reportsDirectory=coverage",
  "--coverage.include=src/**/*.{ts,tsx}",
  "--coverage.exclude=src/**/*.test.{ts,tsx}",
  "--coverage.exclude=src/**/*.d.ts",
  "--coverage.exclude=src/**/fixtures/**",
  "--coverage.exclude=src/**/test-support/**",
  "--passWithNoTests",
  "--testTimeout=15000"
];

const child = spawn(process.execPath, arguments_, {
  cwd: process.cwd(),
  env: { ...process.env, EXACT_COVERAGE: "1" },
  stdio: "inherit"
});

child.once("error", error => {
  console.error(error);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal) {
    console.error(`Coverage process terminated by ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
