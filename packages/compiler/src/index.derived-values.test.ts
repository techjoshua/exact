import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { build as esbuild, type Plugin } from "esbuild";
import { createTestWorkspace } from "./test-support/workspace.js";
import {
  analyzeSource,
  analyzeSemanticGraph,
  assertExactArtifactTarget,
  createClientIslandRegistryEntries,
  createClientIslandRegistryModule,
  createExactArtifactDevState,
  createExactArtifactGraph,
  createExactArtifactPlan,
  createExactArtifactRegistryModules,
  createExactHydrationRegistrationModule,
  createServerPartRegistryModule,
  compileArtifactPlanEntries,
  compileFile,
  compileFileArtifacts,
  compileProject,
  compileProjectArtifacts,
  createPackageExportMap,
  createServerPartRegistryEntries,
  diffExactArtifactPlans,
  exactExportConditions,
  exactCompilerManifestVersion,
  generatedComponentName,
  parseExactCompilerManifest,
  preprocessPropPunning,
  readExactArtifactManifestEntries,
  resolveExactArtifactImport,
  transform,
  transformSource,
  updateExactArtifactDevState
} from "./index.js";

describe("@exact/compiler: derived values", () => {
  it("shares cached derived consts across reactive JSX children", () => {
    const output = transform(`
      function View(this: Component<{ first: string; last: string }>) {
        const fullName = \`\${this.state.first} \${this.state.last}\`;
        return () => <p>{fullName}</p>;
      }
    `);

    expect(output).toContain("const fullName = __exactDerived(() => `${this.state.first} ${this.state.last}`);");
    expect(output).toContain("__exactDynamic(() => fullName.get())");
  });

  it("inlines safe derived const chains inside reactive JSX props", () => {
    const output = transform(`
      function View(this: Component<{ first: string; last: string }>) {
        const first = this.state.first;
        const fullName = \`\${first} \${this.state.last}\`;
        return () => <p title={fullName}>User</p>;
      }
    `);

    expect(output).toContain("const first = __exactDerived(() => this.state.first);");
    expect(output).toContain("const fullName = __exactDerived(() => `${first.get()} ${this.state.last}`);");
    expect(output).toContain("title: __exactExpression(() => fullName.get())");
  });

  it("inlines safe prop-derived consts inside reactive JSX children", () => {
    const output = transform(`
      function View(props: { user: { first: string; last: string } }) {
        const fullName = \`\${props.user.first} \${props.user.last}\`;
        return () => <p>{fullName}</p>;
      }
    `);

    expect(output).toContain("const fullName = __exactDerived(() => `${props.user.first} ${props.user.last}`);");
    expect(output).toContain("__exactDynamic(() => fullName.get())");
  });

  it("inlines safe destructured prop-derived consts inside reactive JSX props", () => {
    const output = transform(`
      function View({ user }: { user: { first: string; last: string } }) {
        const fullName = \`\${user.first} \${user.last}\`;
        return () => <p title={fullName}>User</p>;
      }
    `);

    expect(output).toContain("const fullName = __exactDerived(() => `${user.first} ${user.last}`);");
    expect(output).toContain("title: __exactExpression(() => fullName.get())");
  });

  it("does not assume an unresolved call in a derived const is environment-neutral", () => {
    expect(() => transform(`
      function View(this: Component<{ first: string }>) {
        const label = format(this.state.first);
        return () => <p>{label}</p>;
      }
    `)).toThrow(/opaque call \(View → format\)/);
  });

  it("does not infer mutable derived locals", () => {
    const output = transform(`
      function View(this: Component<{ first: string }>) {
        let label = this.state.first;
        return () => <p>{label}</p>;
      }
    `);

    expect(output).toContain("__exactDynamic(() => label)");
    expect(output).not.toContain("__exactDynamic(() => (this.state.first))");
  });

  it("does not infer derived consts with assignment initializers", () => {
    const output = transform(`
      function View(this: Component<{ first: string }>) {
        let value = "";
        const label = value = this.state.first;
        return () => <p>{label}</p>;
      }
    `);

    expect(output).toContain("__exactDynamic(() => label)");
    expect(output).not.toContain("__exactDynamic(() => (value = this.state.first))");
  });

  it("inlines safe derived consts inside task dependency captures", () => {
    const output = transform(`
      function View(this: Component<{ query: string }>) {
        const label = \`\${this.state.query}!\`;
        this.task(label, async value => {});
      }
    `);

    expect(output).toContain("const label = __exactDerived(() => `${this.state.query}!`);");
    expect(output).toContain("this.task(label, async (value) => { });");
  });

  it("inlines safe prop-derived consts inside task dependency captures", () => {
    const output = transform(`
      function View(props: { query: string }) {
        const label = \`\${props.query}!\`;
        this.task(label, async value => {});
      }
    `);

    expect(output).toContain("const label = __exactDerived(() => `${props.query}!`);");
    expect(output).toContain("this.task(label, async (value) => { });");
  });

  it("inlines safe derived consts declared inside render functions", () => {
    const output = transform(`
      function View(this: Component<{ first: string; last: string }>) {
        return () => {
          const fullName = \`\${this.state.first} \${this.state.last}\`;
          return <p>{fullName}</p>;
        };
      }
    `);

    expect(output).toContain("__exactDynamic(() => (`${this.state.first} ${this.state.last}`))");
  });

  it("inlines safe derived consts declared inside map render callbacks", () => {
    const output = transform(`
      function View(this: Component<{ tasks: { id: string; title: string }[] }>) {
        return () => this.map(this.state.tasks, task => task.id, task => {
          const title = task.title;
          return <li>{title}</li>;
        });
      }
    `, { filename: "View.tsx" });

    expect(output).toContain("__exactDynamic(() => (task.title))");
  });

  it("inlines safe derived consts inside explicit reactive captures", () => {
    const output = transform(`
      function View(this: Component<{ query: string }>) {
        const label = \`\${this.state.query}!\`;
        const reactiveLabel = this.reactive(label);
      }
    `);

    expect(output).toContain("const label = __exactDerived(() => `${this.state.query}!`);");
    expect(output).toContain("this.reactive(() => label.get())");
  });

  it("adds stable compiler ids to this.map list boundaries", () => {
    const output = transform(`
      function View(this: Component<{}>) {
        return () => this.map(items, item => item.id, item => <li>{item.title}</li>);
      }
    `, { filename: "View.tsx" });

    expect(output).toMatch(/this\.map\(items, item => item\.id, item => __exactVNode\("li", \{ "data-exact-id": "x[A-Za-z0-9_-]{22}" \}, __exactDynamic\(\(\) => item\.title\)\), "x[A-Za-z0-9_-]{22}", undefined, "member:id"\)/);
  });

  it("does not recapture existing reactive lambdas or run-once tasks", () => {
    const output = transform("function View() { this.reactive(() => this.state.query); this.task(({ signal }) => {}); }");

    expect(output).toContain("this.reactive(() => this.state.query)");
    expect(output).toContain("this.task(({ signal }) => { });");
    expect(output).not.toContain("this.reactive(() => () => this.state.query)");
  });

  it("preprocesses Svelte-like prop punning", () => {
    expect(preprocessPropPunning("<UserCard {user} {selected} />")).toBe("<UserCard user={user} selected={selected} />");
  });

  it("does not preprocess puns inside strings or comments", () => {
    const source = [
      "const text = \"<UserCard {user} />\";",
      "// <UserCard {commented} />",
      "const view = <UserCard {user} label=\"{raw}\" />;"
    ].join("\n");

    expect(preprocessPropPunning(source)).toContain("\"<UserCard {user} />\"");
    expect(preprocessPropPunning(source)).toContain("// <UserCard {commented} />");
    expect(preprocessPropPunning(source)).toContain("<UserCard user={user} label=\"{raw}\" />");
  });

  it("preserves directive prologues before helper imports", () => {
    const output = transform("\"use client\";\nconst view = <span />;");

    expect(output.trimStart().startsWith("\"use client\";")).toBe(true);
    expect(output.indexOf("\"use client\";")).toBeLessThan(output.indexOf("import {"));
  });

  it("avoids helper alias collisions with user identifiers", () => {
    const output = transform("const __exactVNode = 1; const view = <span />;");

    expect(output).toContain("createCompiledVNode as __exactVNode_1");
    expect(output).toContain("__exactVNode_1(\"span\"");
    expect(output).toContain("const __exactVNode = 1");
  });

  it("scans complete JSX expressions before recognizing tag boundaries", () => {
    const source = '<View value={{ compare: 2 > 1, text: `${`inner ${3 > 2}`}`, match: (() => { return /[>]/.test(">") })() }} {selected} />';
    const output = preprocessPropPunning(source);
    expect(output).toContain("compare: 2 > 1");
    expect(output).toContain("/[>]/.test");
    expect(output).toContain("selected={selected}");
  });

  it("returns source maps from transformSource when requested", () => {
    const result = transformSource("const view = <span />;", {
      filename: "view.tsx",
      sourceMap: true
    });

    expect(result.map).toMatchObject({
      version: 3,
      sources: ["view.tsx"],
      sourcesContent: ["const view = <span />;"],
      names: []
    });
    expect(result.map?.mappings).toBeTruthy();
    // The generated helper import has no source location; the first retained
    // token therefore need not map to generated column zero ("AAAA").
    expect(result.map?.mappings.split(";").some(line => line.length > 0)).toBe(true);
  });
});
