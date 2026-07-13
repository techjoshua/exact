import type { BoundModule, NodeRef, Variable } from "@exact/expressions";
import type { ExactProvenanceGraph } from "./provenance.js";

const asynchronousFunctions = new Set(["setTimeout", "setInterval", "queueMicrotask", "requestAnimationFrame"]);
const asynchronousMethods = new Set(["then", "catch", "finally"]);
const observers = new Set(["MutationObserver", "ResizeObserver", "IntersectionObserver"]);
const snapshotDiagnostic = "error: setup-time state snapshot captured by async callback; read state in the callback or wrap the snapshot in peek(() => ...)";

/** Finds unsafe captures using canonical variables and generic capture analysis. */
export function analyzeExpressionSafety(module: BoundModule, provenance: ExactProvenanceGraph): ReadonlyMap<string, readonly string[]> {
  const components = module.walk().functions()
    .where(reference => reference.node.kind === "FunctionDeclaration" && /^[A-Z]/.test(reference.node.name ?? ""))
    .toArray();
  const setupSnapshots = new Map<string, Set<Variable>>();
  for (const component of components) setupSnapshots.set(component.node.id, new Set());

  for (const declaration of module.walk().ofKind("VariableDeclaration")) {
    const owner = declaration.ancestors().functions().first();
    if (!owner || !setupSnapshots.has(owner.node.id)) continue;
    const binding = declaration.children().first()?.walk().references().first()?.variable;
    if (!binding) continue;
    const classification = provenance.get(binding)?.provenance;
    if (classification === "derived" || classification === "state" || classification === "props" || classification === "context") {
      setupSnapshots.get(owner.node.id)!.add(binding);
    }
  }

  const diagnostics = new Map<string, Set<string>>();
  for (const call of module.walk().calls().where(isAsyncCall)) {
    const callback = call.arguments[0];
    if (!callback || !isFunction(callback)) continue;
    const owner = call.ancestors().functions().first(reference => setupSnapshots.has(reference.node.id));
    if (!owner) continue;
    const snapshots = setupSnapshots.get(owner.node.id)!;
    if (!module.capturesOf(callback).some(variable => snapshots.has(variable))) continue;
    const values = diagnostics.get(owner.node.name!) ?? new Set<string>();
    values.add(snapshotDiagnostic);
    diagnostics.set(owner.node.name!, values);
  }

  return new Map([...diagnostics].map(([name, values]) => [name, Object.freeze([...values])]));
}

function isAsyncCall(call: NodeRef): boolean {
  if (call.node.kind === "NewExpression") return observers.has(call.target?.name ?? call.target?.node.text ?? "");
  if (call.target?.isMember()) return asynchronousMethods.has(call.target.name ?? "");
  return asynchronousFunctions.has(call.target?.name ?? call.target?.node.text ?? "");
}

function isFunction(reference: NodeRef): boolean {
  return reference.node.kind === "ArrowFunction" || reference.node.kind === "FunctionExpression";
}
