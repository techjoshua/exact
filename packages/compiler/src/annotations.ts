import type {
  BoundModule,
  ExpressionCallParameter,
  ExpressionDirective,
  ExpressionType,
  ExpressionTypeProperty,
  NodeRef
} from "@exact/expressions";

export type ExactAnnotationKey =
  | "key"
  | "cleanup"
  | "own"
  | "track"
  | "client"
  | "server"
  | "keep"
  | "consume";

export type ExactKeepPolicy = "server" | "client" | "secret";

export interface ExactAnnotationDiagnostic {
  readonly message: string;
  readonly start: number;
}

export interface ExactAnnotationPlan {
  readonly diagnostics: readonly ExactAnnotationDiagnostic[];
  readonly trackedCallbacks: ReadonlyMap<string, readonly ExactTrackedCallback[]>;
}

export interface ExactTrackedCallback {
  readonly parameter: number;
  readonly property?: string;
}

export interface ExactKeyContract {
  readonly member?: string;
  readonly method: boolean;
  readonly primitive: boolean;
}

const supported = new Set<ExactAnnotationKey>(["key", "cleanup", "own", "track", "client", "server", "keep", "consume"]);
const identifier = /^[A-Za-z_$][\w$]*$/;

/** Validates the closed directive language and indexes call-site callback contracts. */
export function analyzeExactAnnotations(module: BoundModule): ExactAnnotationPlan {
  const diagnostics: ExactAnnotationDiagnostic[] = [];
  const directiveSites = new Map<string, { reference: NodeRef; directive: ExpressionDirective }>();
  for (const reference of module.walk()) {
    for (const directive of reference.node.directives ?? []) {
      const identity = `${directive.span?.start ?? reference.node.span?.start ?? -1}:${directive.key}:${directive.value ?? ""}`;
      const existing = directiveSites.get(identity);
      const key = supported.has(directive.key as ExactAnnotationKey)
        ? directive.key as ExactAnnotationKey
        : undefined;
      const candidateValid = key ? validDirectiveLocation(key, reference.node.kind) : false;
      const existingValid = key && existing
        ? validDirectiveLocation(key, existing.reference.node.kind)
        : false;
      if (!existing
        || candidateValid && !existingValid
        || candidateValid === existingValid && nodeWidth(reference) < nodeWidth(existing.reference)) {
        directiveSites.set(identity, { reference, directive });
      }
    }
  }
  for (const { reference, directive } of directiveSites.values()) {
    const start = directive.span?.start ?? reference.node.span?.start ?? 0;
      // Namespaced directives are owned and validated by prepared compiler
      // plugins. Core keeps its own directive language closed.
      if (directive.key.includes(".")) continue;
      if (!supported.has(directive.key as ExactAnnotationKey)) {
        diagnostics.push({ message: `error: unknown @exact directive '${directive.key}'; supported directives are key, cleanup, own, track, client, server, keep, and consume`, start });
        continue;
      }
      if (directive.key === "keep") {
        if (!directive.value) {
          diagnostics.push({ message: "error: @exact keep requires one of server, client, or secret", start });
          continue;
        }
        if (!isExactKeepPolicy(directive.value)) {
          diagnostics.push({
            message: directive.value === "isomorphic"
              ? "error: @exact keep=isomorphic is not supported; safe isomorphic residency is inferred"
              : `error: unknown @exact keep policy '${directive.value}'; expected server, client, or secret`,
            start
          });
          continue;
        }
      } else if (directive.key === "consume") {
        if (directive.value !== "secret") {
          diagnostics.push({ message: "error: @exact consume requires the value secret", start });
          continue;
        }
      } else if ((directive.key === "own" || directive.key === "track" || directive.key === "client" || directive.key === "server") && directive.value !== undefined) {
        diagnostics.push({ message: `error: @exact ${directive.key} does not accept a value`, start });
      } else if (directive.value !== undefined && !identifier.test(directive.value)) {
        diagnostics.push({ message: `error: @exact ${directive.key} value must be a member identifier, not executable source`, start });
      } else if (!validDirectiveLocation(directive.key as ExactAnnotationKey, reference.node.kind)) {
        diagnostics.push({ message: `error: @exact ${directive.key} is not valid on ${reference.node.kind}`, start });
      } else if ((reference.node.kind === "InterfaceDeclaration" || reference.node.kind === "ClassDeclaration" || reference.node.kind === "TypeAliasDeclaration")
        && (directive.key === "key" || directive.key === "cleanup") && !directive.value) {
        diagnostics.push({ message: `error: type-level @exact ${directive.key} requires a member name`, start });
      }
      if ((directive.key === "keep" || directive.key === "consume")
        && !validDirectiveLocation(directive.key, reference.node.kind)) {
        diagnostics.push({ message: `error: @exact ${directive.key} is not valid on ${reference.node.kind}`, start });
      }
  }

  for (const reference of module.walk()) {
    if (hasExactDirective(reference.node.directives, "client") && hasExactDirective(reference.node.directives, "server")) {
      diagnostics.push({ message: "error: a declaration cannot be both @exact client and @exact server", start: reference.node.span?.start ?? 0 });
    }
    const keep = reference.node.directives?.filter(value => value.namespace === "exact" && value.key === "keep") ?? [];
    const policies = new Set(keep.map(value => value.value).filter(isExactKeepPolicy));
    if (policies.size > 1) diagnostics.push({
      message: "error: a declaration cannot have contradictory @exact keep policies",
      start: keep[0]?.span?.start ?? reference.node.span?.start ?? 0
    });
  }

  const trackedCallbacks = new Map<string, readonly ExactTrackedCallback[]>();
  for (const call of module.walk().calls()) {
    const signature = call.node.resolvedSignature;
    if (!signature) continue;
    const tracked = signature.parameters.flatMap((parameter, index): ExactTrackedCallback[] => [
      ...(hasExactDirective(parameter.directives, "track") ? [{ parameter: index }] : []),
      ...parameter.type.propertyTypes
        .filter(property => hasExactDirective(property.directives, "track"))
        .map(property => ({ parameter: index, property: property.name }))
    ]);
    if (!tracked.length) continue;
    for (const contract of tracked) {
      const parameter = signature.parameters[contract.parameter]!;
      const callbackType = contract.property
        ? parameter.type.propertyTypes.find(property => property.name === contract.property)?.type
        : parameter.type;
      if (!callbackType?.callable) diagnostics.push({
        message: `error: @exact track may only annotate a callable parameter`,
        start: call.node.span?.start ?? 0
      });
    }
    trackedCallbacks.set(call.node.id, Object.freeze(tracked));
  }

  for (const call of module.walk().calls()) {
    const cleanupDeclared = callDeclaresCleanup(call);
    const cleanup = exactCleanupForCall(call);
    if (cleanupDeclared && !cleanup) diagnostics.push({
      message: "error: @exact cleanup must identify a callable member on the owned value",
      start: call.node.span?.start ?? 0
    });
    if (exactOwnsReturn(call) && !cleanup && !call.type?.callable && !isStandardDisposable(call.type)) diagnostics.push({
      message: "error: @exact own requires a cleanup annotation, a callable cleanup result, or a standard disposable result",
      start: call.node.span?.start ?? 0
    });
  }

  const uniqueDiagnostics = [...new Map(diagnostics.map(diagnostic => [
    `${diagnostic.start}:${diagnostic.message}`,
    diagnostic
  ])).values()];
  return Object.freeze({ diagnostics: Object.freeze(uniqueDiagnostics), trackedCallbacks });
}

function nodeWidth(reference: NodeRef): number {
  const span = reference.node.span;
  return span ? span.end - span.start : Number.MAX_SAFE_INTEGER;
}

export function exactKeyContract(type: ExpressionType | undefined, local?: readonly ExpressionDirective[]): ExactKeyContract | undefined {
  if (!type) return undefined;
  const direct = consistentExactDirective(local, "key");
  if (direct === null) return undefined;
  if (direct?.value) return keyMemberContract(type, direct.value);
  if (type.kind === "string") return { method: false, primitive: true };
  if (type.unionMembers.length) {
    const contracts = type.unionMembers.map(member => exactKeyContract(member, local));
    const first = contracts[0];
    return first && contracts.every(contract => sameKeyContract(first, contract)) ? first : undefined;
  }
  const typeDirective = consistentExactDirective(type.directives, "key");
  if (typeDirective === null) return undefined;
  if (typeDirective?.value) return keyMemberContract(type, typeDirective.value);
  const annotated = type.propertyTypes.filter(property => hasExactDirective(property.directives, "key"));
  if (annotated.length !== 1) return undefined;
  return propertyKeyContract(annotated[0]!);
}

export function exactCleanup(type: ExpressionType | undefined): string | "call" | undefined {
  if (!type) return undefined;
  if (type.unionMembers.length) {
    const values = type.unionMembers.map(exactCleanup);
    const first = values[0];
    return first && values.every(value => value === first) ? first : undefined;
  }
  const directive = consistentExactDirective(type.directives, "cleanup");
  if (directive === null) return undefined;
  if (directive?.value) return validCleanupMember(type, directive.value) ? directive.value : undefined;
  const methods = type.propertyTypes.filter(property => hasExactDirective(property.directives, "cleanup"));
  if (methods.length === 1 && methods[0]!.type.callable) return methods[0]!.name;
  return hasExactDirective(type.directives, "cleanup") && type.callable ? "call" : undefined;
}

export function exactCleanupForCall(call: NodeRef): string | undefined {
  const local = directInitializerDeclaration(call);
  const localDirective = exactDirective(local?.node.directives, "cleanup");
  if (localDirective?.value) return validCleanupMember(call.type, localDirective.value) ? localDirective.value : undefined;
  if (localDirective && call.type?.callable) return "call";
  const returned = exactDirective(call.node.resolvedSignature?.returnDirectives, "cleanup");
  if (returned?.value) return validCleanupMember(call.type, returned.value) ? returned.value : undefined;
  if (returned && call.type?.callable) return "call";
  return exactCleanup(call.type);
}

export function exactOwnsReturn(call: NodeRef): boolean {
  return hasExactDirective(directInitializerDeclaration(call)?.node.directives, "own")
    || hasExactDirective(call.node.resolvedSignature?.returnDirectives, "own")
    || hasExactDirective(call.type?.directives, "own");
}

export function trackedParameter(parameter: ExpressionCallParameter): boolean {
  return hasExactDirective(parameter.directives, "track");
}

export function trackedCallbackArguments(call: NodeRef): readonly NodeRef[] {
  const signature = call.node.resolvedSignature;
  if (!signature) return [];
  const callbacks: NodeRef[] = [];
  signature.parameters.forEach((parameter, index) => {
    const argument = call.arguments[index];
    if (!argument) return;
    if (trackedParameter(parameter)) callbacks.push(argument);
    for (const property of parameter.type.propertyTypes.filter(candidate => hasExactDirective(candidate.directives, "track"))) {
      const assignment = argument.children().first(child => child.node.kind === "PropertyAssignment" && child.node.name === property.name);
      const callback = assignment?.children().toArray().at(-1);
      if (callback) callbacks.push(callback);
    }
  });
  return callbacks;
}

export function exactDirective(values: readonly ExpressionDirective[] | undefined, key: ExactAnnotationKey): ExpressionDirective | undefined {
  return values?.find(value => value.namespace === "exact" && value.key === key);
}

export function hasExactDirective(values: readonly ExpressionDirective[] | undefined, key: ExactAnnotationKey): boolean {
  return exactDirective(values, key) !== undefined;
}

export function exactKeepPolicy(values: readonly ExpressionDirective[] | undefined): ExactKeepPolicy | undefined {
  const matches = values?.filter(value => value.namespace === "exact" && value.key === "keep") ?? [];
  const policies = new Set(matches.map(value => value.value).filter(isExactKeepPolicy));
  return policies.size === 1 ? [...policies][0] : undefined;
}

export function exactConsumesSecret(values: readonly ExpressionDirective[] | undefined): boolean {
  return values?.some(value => value.namespace === "exact" && value.key === "consume" && value.value === "secret") ?? false;
}

function isExactKeepPolicy(value: string | undefined): value is ExactKeepPolicy {
  return value === "server" || value === "client" || value === "secret";
}

function consistentExactDirective(values: readonly ExpressionDirective[] | undefined, key: ExactAnnotationKey): ExpressionDirective | null | undefined {
  const matches = values?.filter(value => value.namespace === "exact" && value.key === key) ?? [];
  if (!matches.length) return undefined;
  const first = matches[0]!;
  return matches.every(value => value.value === first.value) ? first : null;
}

function keyMemberContract(type: ExpressionType, member: string): ExactKeyContract | undefined {
  const property = type.propertyTypes.find(candidate => candidate.name === member);
  return property ? propertyKeyContract(property) : undefined;
}

function propertyKeyContract(property: ExpressionTypeProperty): ExactKeyContract | undefined {
  if (property.type.callable) {
    const signatures = property.type.callSignatures;
    if (!signatures.length || signatures.some(signature => signature.parameters.some(parameter => !parameter.optional && !parameter.rest))) return undefined;
    if (signatures.some(signature => signature.returnType.kind !== "string"
      && (!signature.returnType.unionMembers.length || !signature.returnType.unionMembers.every(member => member.kind === "string")))) return undefined;
    return { member: property.name, method: true, primitive: false };
  }
  if (property.type.kind !== "string"
    && (!property.type.unionMembers.length || !property.type.unionMembers.every(member => member.kind === "string"))) return undefined;
  return { member: property.name, method: false, primitive: false };
}

function sameKeyContract(left: ExactKeyContract, right: ExactKeyContract | undefined): boolean {
  return !!right && left.member === right.member && left.method === right.method && left.primitive === right.primitive;
}

function directInitializerDeclaration(call: NodeRef): NodeRef | undefined {
  const declaration = call.ancestors().ofKind("VariableDeclaration").first();
  if (!declaration) return undefined;
  return declaration.children().toArray().at(-1)?.node === call.node ? declaration : undefined;
}

function validCleanupMember(type: ExpressionType | undefined, member: string): boolean {
  if (!type) return false;
  if (type.unionMembers.length) return type.unionMembers.every(candidate => validCleanupMember(candidate, member));
  return type.propertyTypes.some(property => property.name === member && property.type.callable);
}

function callDeclaresCleanup(call: NodeRef): boolean {
  const local = directInitializerDeclaration(call);
  return hasExactDirective(local?.node.directives, "cleanup")
    || hasExactDirective(call.node.resolvedSignature?.returnDirectives, "cleanup")
    || typeDeclares(call.type, "cleanup");
}

function typeDeclares(type: ExpressionType | undefined, key: ExactAnnotationKey): boolean {
  if (!type) return false;
  return hasExactDirective(type.directives, key)
    || type.propertyTypes.some(property => hasExactDirective(property.directives, key))
    || type.unionMembers.some(member => typeDeclares(member, key));
}

function isStandardDisposable(type: ExpressionType | undefined): boolean {
  if (!type) return false;
  return /\b(?:Async)?Disposable\b/.test(type.display)
    || type.properties.some(property => /(?:async)?dispose/i.test(property))
    || type.unionMembers.some(isStandardDisposable);
}

function validDirectiveLocation(key: ExactAnnotationKey, kind: string): boolean {
  if (key === "client" || key === "server") return ["FunctionDeclaration", "MethodDeclaration", "MethodSignature", "FunctionType"].includes(kind);
  if (key === "keep") return [
    "VariableDeclaration", "Parameter", "PropertySignature", "PropertyDeclaration",
    "MethodSignature", "MethodDeclaration", "FunctionDeclaration", "FunctionType",
    "TypeReference", "ParenthesizedType", "TypeLiteral", "InterfaceDeclaration",
    "ClassDeclaration", "TypeAliasDeclaration"
  ].includes(kind);
  if (key === "consume") return kind === "VariableDeclaration";
  if (key === "key") return ["PropertySignature", "PropertyDeclaration", "MethodSignature", "MethodDeclaration", "InterfaceDeclaration", "ClassDeclaration", "TypeAliasDeclaration", "TypeLiteral", "VariableDeclaration"].includes(kind);
  if (key === "cleanup") return ["PropertySignature", "PropertyDeclaration", "MethodSignature", "MethodDeclaration", "InterfaceDeclaration", "ClassDeclaration", "TypeAliasDeclaration", "TypeLiteral", "VariableDeclaration", "FunctionType", "ParenthesizedType", "TypeReference"].includes(kind);
  if (key === "own") return ["VariableDeclaration", "TypeReference", "FunctionType", "ParenthesizedType", "TypeLiteral"].includes(kind);
  return ["Parameter", "PropertySignature", "PropertyDeclaration"].includes(kind);
}
