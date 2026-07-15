import { build } from "esbuild";
import { transformReactJsx } from "../packages/compiler/dist/index.js";

for (const target of [18, 19]) {
  const generated = transformReactJsx(
    'import { useState } from "react"; export const Counter = () => <button>{useState(0)[0]}</button>;',
    { filename: `counter-react${target}.tsx`, target, sourceMap: false }
  );
  const result = await build({
    stdin: { contents: generated.code, resolveDir: process.cwd(), sourcefile: `counter-react${target}.js` },
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    metafile: true
  });
  const inputs = Object.keys(result.metafile.inputs).map(file => file.replace(/\\/g, "/"));
  if (!inputs.some(file => file.endsWith(`/react-compat/dist/jsx-runtime${target}.js`))) {
    throw new Error(`React ${target} compatibility JSX runtime was not included in the bundle`);
  }
  if (result.outputFiles[0].text.includes("@exact/react-compat")) {
    throw new Error(`React ${target} compatibility imports remained external`);
  }
  console.log(`React ${target} automatic compiler output bundled ${inputs.length} modules`);
}
