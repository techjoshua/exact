import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileFile, compileProject, preprocessPropPunning, transform, transformSource } from "./index.js";

describe("@exact/compiler", () => {
  it("lowers JSX to eXact compiled vnode helpers", () => {
    const output = transform("const view = <button title={label}>Save</button>;");

    expect(output).toContain("createCompiledVNode as __exactVNode");
    expect(output).toContain("createDynamicChild as __exactDynamic");
    expect(output).toContain("__exactVNode(\"button\"");
    expect(output).toContain("title: __exactExpression(() => label)");
    expect(output).toContain("\"Save\"");
  });

  it("returns transform results for generic adapters", () => {
    const result = transformSource("const view = <span />;", { filename: "view.tsx" });

    expect(result.filename).toBe("view.tsx");
    expect(result.map).toBeNull();
    expect(result.code).toContain("__exactVNode(\"span\"");
  });

  it("lowers shorthand and underscore fragments", () => {
    const output = transform("const view = <_ key={id}><span /></_>; const next = <>tail</>;");

    expect(output).toContain("__exactFragment({ key: id }");
    expect(output).toContain("__exactVNode(\"span\"");
    expect(output).toContain("__exactFragment({}");
  });

  it("lowers expression children to dynamic child boundaries", () => {
    const output = transform("const view = <section>{show ? <span>A</span> : <strong>B</strong>}</section>;");

    expect(output).toContain("__exactDynamic(() => show ? __exactVNode(\"span\"");
    expect(output).toContain(": __exactVNode(\"strong\"");
  });

  it("preserves event handlers as direct functions", () => {
    const output = transform("const view = <button onClick={() => save()} disabled={disabled} />;");

    expect(output).toContain("onClick: () => save()");
    expect(output).toContain("disabled: __exactExpression(() => disabled)");
  });

  it("preserves ref bindings as direct values", () => {
    const output = transform("const view = <button ref={this.ref(button)} title={title} />;");

    expect(output).toContain("ref: this.ref(button)");
    expect(output).toContain("title: __exactExpression(() => title)");
    expect(output).not.toContain("ref: __exactExpression");
  });

  it("quotes non-identifier JSX prop names", () => {
    const output = transform("const view = <div data-task-id={task.id} aria-label=\"Task\" />;");

    expect(output).toContain("\"data-task-id\": __exactExpression(() => task.id)");
    expect(output).toContain("\"aria-label\": \"Task\"");
  });

  it("captures this.reactive value arguments as expressions", () => {
    const output = transform("function View() { const query = this.reactive(this.state.query); }");

    expect(output).toContain("this.reactive(() => this.state.query)");
  });

  it("captures this.reactive tagged templates as expressions", () => {
    const output = transform("function View() { const name = this.reactive`${this.state.first} ${this.state.last}`; }");

    expect(output).toContain("this.reactive(() => `${this.state.first} ${this.state.last}`)");
  });

  it("captures this.task dependency arguments as component reactive values", () => {
    const output = transform("function View() { this.task(this.state.query, this.state.page, async (query, page) => {}); }");

    expect(output).toContain("this.task(this.reactive(() => this.state.query), this.reactive(() => this.state.page), async (query, page) => { });");
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

  it("compiles a single TSX file to an output directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-compiler-"));
    const input = path.join(root, "src", "view.tsx");
    const outDir = path.join(root, "out");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, "const view = <span />;");

    const result = await compileFile(input, { outDir, rootDir: path.join(root, "src") });
    const output = await readFile(result.outputFile!, "utf8");

    expect(result.outputFile).toBe(path.join(outDir, "view.ts"));
    expect(output).toContain("__exactVNode(\"span\"");
  });

  it("compiles TSX and JSX files from directories", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-project-"));
    await writeFile(path.join(root, "one.tsx"), "const one = <span />;");
    await writeFile(path.join(root, "two.jsx"), "const two = <strong />;");
    await writeFile(path.join(root, "skip.ts"), "const skip = 1;");

    const results = await compileProject([root], { outDir: path.join(root, "out") });

    expect(results.map(result => path.basename(result.outputFile ?? ""))).toEqual(["one.ts", "two.js"]);
  });
});
