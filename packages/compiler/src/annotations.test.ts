import { describe, expect, it } from "vitest";
import { clearExpressionProjectCache, expressionModuleFor } from "./expression-project.js";
import { analyzeExactAnnotations, exactCleanupForCall, exactKeyContract, exactOwnsReturn } from "./annotations.js";

describe("@exact compiler annotations", () => {
  it("projects key metadata from type members and merged declarations", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("annotated-key.ts", `
      interface Task { /** @exact key */ id: string; title: string }
      declare const tasks: Task[];
      tasks.map(task => task.title);
    `);
    const map = module.walk().calls().first(call => call.target?.isMember("map") === true)!;
    expect(exactKeyContract(map.target?.target?.type?.typeArguments[0])).toEqual({ member: "id", method: false, primitive: false });
  });

  it("supports type-level and method key contracts", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("annotated-key-method.ts", `
      /** @exact key=identity */ interface Task { identity(): string; title: string }
      declare const tasks: Task[];
      tasks.map(task => task.title);
    `);
    const map = module.walk().calls().first(call => call.target?.isMember("map") === true)!;
    expect(exactKeyContract(map.target?.target?.type?.typeArguments[0])).toEqual({ member: "identity", method: true, primitive: false });
  });

  it("aggregates annotations across declaration merging without wrapper types", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("merged-key.ts", `
      interface ExternalTask { externalId: string; title: string }
      /** @exact key=externalId */ interface ExternalTask {}
      declare const tasks: ExternalTask[];
      tasks.map(task => task.title);
    `);
    const map = module.walk().calls().first(call => call.target?.isMember("map") === true)!;
    expect(exactKeyContract(map.target?.target?.type?.typeArguments[0])).toEqual({ member: "externalId", method: false, primitive: false });
  });

  it("projects cleanup and ownership from return contracts", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("annotated-cleanup.ts", `
      interface Legacy { /** @exact cleanup */ unsubscribe(): void }
      declare function subscribe(): /** @exact own */ Legacy;
      subscribe();
    `);
    const call = module.walk().calls().first()!;
    expect(exactOwnsReturn(call)).toBe(true);
    expect(exactCleanupForCall(call)).toBe("unsubscribe");
  });

  it("rejects unknown keys and invalid directive values", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("invalid-annotations.ts", `
      /** @exact unicornName=Airy */ interface Pony {}
      /** @exact track=value */ declare function run(callback: () => void): void;
    `);
    expect(analyzeExactAnnotations(module).diagnostics.map(diagnostic => diagnostic.message)).toEqual([
      expect.stringContaining("unknown @exact directive 'unicornName'"),
      expect.stringContaining("@exact track does not accept a value")
    ]);
  });

  it("indexes tracked callback parameters", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("tracked-callback.ts", `
      declare function select<T>(/** @exact track */ callback: () => T): T;
      select(() => 1);
    `);
    const call = module.walk().calls().first()!;
    expect(analyzeExactAnnotations(module).trackedCallbacks.get(call.node.id)).toEqual([{ parameter: 0 }]);
  });

  it("indexes tracked callbacks declared on options properties", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("tracked-options.ts", `
      interface SelectOptions<T> { /** @exact track */ calculate: () => T }
      declare function select<T>(options: SelectOptions<T>): T;
      select({ calculate: () => 1 });
    `);
    const call = module.walk().calls().first()!;
    expect(analyzeExactAnnotations(module).trackedCallbacks.get(call.node.id)).toEqual([{ parameter: 0, property: "calculate" }]);
  });
});
