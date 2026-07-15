import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { reactCompatibilityAliases } from "../../react-compat/dist/plugin.js";

const root = path.resolve(import.meta.dirname, "../../..");
const outputDirectory = path.join(root, "packages", "react-dom-compat", "fixtures");
mkdirSync(outputDirectory, { recursive: true });

const aliases = reactCompatibilityAliases(19);
const aliasPlugin = {
  name: "exact-react-package-aliases",
  setup(bundle) {
    bundle.onResolve({ filter: /^(?:react(?:\/.*)?|react-dom(?:\/.*)?)$/ }, args => {
      const replacement = aliases[args.path];
      return replacement ? { path: replacement, external: true } : undefined;
    });
  }
};

async function buildFixture(name, contents) {
  await build({
    stdin: {
      contents,
      resolveDir: root,
      sourcefile: `${name}-react-packages.mjs`
    },
    outfile: path.join(outputDirectory, `${name}.mjs`),
    bundle: true,
    format: "esm",
    platform: "browser",
    plugins: [aliasPlugin]
  });
}

await buildFixture("phase2", `
      export { Airplay } from "lucide-react";
      export { useForm } from "react-hook-form";
      export { create } from "zustand";
`);

await buildFixture("phase3", `
  export * as Dialog from "@radix-ui/react-dialog";
  export { ThemeProvider, useTheme } from "@emotion/react";
  export { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
`);

await buildFixture("phase4", `
  export { ErrorBoundary, useErrorBoundary, withErrorBoundary } from "react-error-boundary";
`);
