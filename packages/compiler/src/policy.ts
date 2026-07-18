import type {
  BoundModule,
  ExpressionDirective,
  ExpressionType,
  NodeRef,
  Variable
} from "@exact/expressions";
import { exactKeepPolicy, type ExactKeepPolicy } from "./annotations.js";
import { expressionComponentIndex } from "./expression-component-index.js";
import type {
  CallableEffectPlan,
} from "./callable-effects.js";
import type {
  ExpressionComponentPlan,
  ExpressionComponentSite
} from "./expression-components.js";
import type {
  ExpressionTaskPlan,
  ExpressionTaskSite
} from "./expression-tasks.js";
import { stableId } from "./ids.js";
import type {
  ExactCompilerManifest,
  ExactCallableSummaryIR,
  ExactArtifactTarget,
  ExactComponentIR,
  ExactDataPolicyIR,
  ExactEnvironmentEffectSourceIR,
  ExactPolicyFlowIR,
  ExactPolicyManifestIR,
  ExactPolicySubjectIR,
  ExactStateEffect
} from "./types.js";

type PolicyRecord = Readonly<{
  policy: ExactDataPolicyIR;
  subjectId: string;
}>;

type StatePolicyRecord = PolicyRecord & Readonly<{
  component: string;
  path: string;
}>;

type PolicyInput = {
  variable: Variable;
  record: PolicyRecord;
  syntheticSource?: true;
};

export interface ExactPolicyMetadata {
  readonly subjects: readonly ExactPolicySubjectIR[];
  readonly declarationPolicies: ReadonlyMap<string, PolicyRecord>;
  readonly namedDeclarationPolicies: ReadonlyMap<string, PolicyRecord>;
  readonly callablePolicies: ReadonlyMap<string, PolicyRecord>;
  readonly contextCallEffects: ReadonlyMap<string, "server" | "client" | "isomorphic">;
  readonly contextPolicies: ReadonlyMap<string, PolicyRecord>;
  readonly statePolicies: readonly StatePolicyRecord[];
  readonly flows: readonly ExactPolicyFlowIR[];
  readonly diagnostics: readonly string[];
}

export interface ExactPolicyTaskResult {
  readonly tasks: ExpressionTaskPlan;
  readonly diagnostics: readonly string[];
}

export interface ExactPolicyCallableResult {
  readonly callables: CallableEffectPlan;
  readonly diagnostics: readonly string[];
}

export interface ExactPolicyManifestResult {
  readonly policy: ExactPolicyManifestIR;
  readonly diagnostics: readonly string[];
}

/** Collects explicit residency metadata before placement and transfer analysis. */
export function analyzeExactPolicyMetadata(
  module: BoundModule,
  importedManifests: readonly ExactCompilerManifest[]
): ExactPolicyMetadata {
  const subjects: ExactPolicySubjectIR[] = [];
  const declarationPolicies = new Map<string, PolicyRecord>();
  const namedDeclarationPolicies = new Map<string, PolicyRecord>();
  const callablePolicies = new Map<string, PolicyRecord>();
  const contextCallEffects = new Map<string, "server" | "client" | "isomorphic">();
  const contextAliases = new Map<string, string>();
  const contextPolicies = new Map<string, PolicyRecord>();
  const statePolicies: StatePolicyRecord[] = [];
  const flows: ExactPolicyFlowIR[] = [];
  const diagnostics = new Set<string>();

  const localVariables = uniqueVariables(module);
  for (const variable of localVariables) {
    if (!["VariableDeclaration", "BindingElement", "Parameter"].includes(variable.declarationKind)) continue;
    const keep = exactKeepPolicy(variable.directives) ?? keepFromType(variable.type);
    if (!keep) continue;
    const subject = policySubject(module.filename, {
      kind: variable.declarationKind === "Parameter" ? "parameter" : "declaration",
      name: variable.name,
      policy: dataPolicy(keep),
      source: "annotation",
      ...(variable.declarationKind === "Parameter" ? {
        parameterIndex: parameterIndex(module, variable)
      } : {})
    });
    subjects.push(subject);
    const record = { policy: subject.policy, subjectId: subject.id };
    declarationPolicies.set(variable.id, record);
    namedDeclarationPolicies.set(variable.name, record);
    const declaration = module.walk().ofKind("VariableDeclaration").first(reference =>
      reference.children().first()?.variable?.id === variable.id
    );
    const initializer = declaration?.children().toArray().at(-1);
    if (initializer) callablePolicies.set(initializer.node.id, record);
  }

  for (const field of module.walk().where(reference =>
    reference.node.kind === "PropertySignature" || reference.node.kind === "PropertyDeclaration"
  )) {
    const keep = exactKeepPolicy(field.node.directives);
    if (!keep || !field.node.name) continue;
    subjects.push(policySubject(module.filename, {
      kind: "field",
      name: field.node.name,
      policy: dataPolicy(keep),
      source: "annotation"
    }));
  }

  const components = expressionComponentIndex(module);
  for (const component of components.functions) {
    const componentName = component.node.name!;
    const thisParameter = component.node.parameters.find(parameter => parameter.name === "this");
    const componentType = thisParameter?.type;
    const state = componentType?.propertyTypes.find(property => property.name === "state");
    if (!state) continue;
    const stateType = state.type.propertyTypes.length
      ? state.type
      : componentType?.typeArguments[0] ?? state.type;
    collectStateTypePolicies(
      module.filename,
      componentName,
      stateType,
      [],
      statePolicies,
      subjects,
      diagnostics,
      new Set()
    );
  }

  for (const call of module.walk().calls()) {
    if (!isCreateContextCall(call)) continue;
    const declaration = call.ancestors().ofKind("VariableDeclaration").first();
    const token = declaration?.children().first()?.name;
    if (!token) continue;
    const options = call.arguments[1];
    const parsed = parseContextPolicyOptions(options?.node.text);
    if (parsed.error) {
      diagnostics.add(`error: context ${token} ${parsed.error}`);
      continue;
    }
    const policy = parsed.keep ? dataPolicy(parsed.keep) : dataPolicy("isomorphic");
    const subject = policySubject(module.filename, {
      kind: "context",
      name: token,
      policy,
      source: parsed.keep ? "context-option" : "inference"
    });
    subjects.push(subject);
    const record = { policy: subject.policy, subjectId: subject.id };
    contextPolicies.set(token, record);
    const tokenVariable = declaration?.children().first()?.variable;
    if (tokenVariable) declarationPolicies.set(tokenVariable.id, record);
    namedDeclarationPolicies.set(token, record);
    const initializer = declaration?.children().toArray().at(-1);
    if (initializer && parsed.keep) callablePolicies.set(initializer.node.id, record);
  }

  for (const manifest of importedManifests) {
    for (const subject of manifest.policy.subjects) {
      if (subject.kind !== "context") continue;
      const imported = {
        ...subject,
        id: stableId(module.filename, `policy:import:${manifest.packageName ?? manifest.filename}:${subject.id}`),
        source: "import" as const
      };
      subjects.push(imported);
      const existing = contextPolicies.get(imported.name);
      if (existing && !samePolicy(existing.policy, imported.policy)) {
        diagnostics.add(`error: imported manifests declare conflicting policies for context ${imported.name}`);
      } else {
        contextPolicies.set(imported.name, { policy: imported.policy, subjectId: imported.id });
      }
    }
  }

  for (const declaration of module.walk().ofKind("VariableDeclaration")) {
    const variable = declaration.children().first()?.variable;
    const initializer = declaration.children().toArray().at(-1);
    if (!variable || initializer?.node.kind !== "CallExpression"
      || !initializer.target?.isMember("getContext")) continue;
    const token = initializer.arguments[0]?.node.text;
    if (token && contextPolicies.has(token)) contextAliases.set(variable.id, token);
  }
  for (const call of module.walk().calls()) {
    const receiver = call.target?.isMember() ? call.target.target?.rootVariable : undefined;
    const token = receiver ? contextAliases.get(receiver.id) : undefined;
    const policy = token ? contextPolicies.get(token)?.policy : undefined;
    if (!policy) continue;
    contextCallEffects.set(
      call.node.id,
      policy.secret ? "server" : policy.residency
    );
  }

  collectCallableReturnPolicies(
    module,
    declarationPolicies,
    namedDeclarationPolicies,
    callablePolicies,
    subjects,
    flows,
    diagnostics,
    false
  );
  propagateDeclarationPolicies(module, declarationPolicies, namedDeclarationPolicies, subjects, flows, diagnostics);
  collectCallableReturnPolicies(
    module,
    declarationPolicies,
    namedDeclarationPolicies,
    callablePolicies,
    subjects,
    flows,
    diagnostics,
    true
  );
  propagateDeclarationPolicies(module, declarationPolicies, namedDeclarationPolicies, subjects, flows, diagnostics);
  for (const [id, record] of declarationPolicies) {
    const variable = localVariables.find(candidate => candidate.id === id);
    if (variable) namedDeclarationPolicies.set(variable.name, record);
  }
  return Object.freeze({
    subjects: Object.freeze(sortSubjects(subjects)),
    declarationPolicies,
    namedDeclarationPolicies,
    callablePolicies,
    contextCallEffects,
    contextPolicies,
    statePolicies: Object.freeze([...statePolicies].sort(compareStatePolicy)),
    flows: Object.freeze([...flows].sort((left, right) => left.id.localeCompare(right.id))),
    diagnostics: Object.freeze([...diagnostics].sort())
  });
}

/** Applies declaration/result residency to callable artifact reachability. */
export function applyExactPolicyToCallables(
  metadata: ExactPolicyMetadata,
  plan: CallableEffectPlan
): ExactPolicyCallableResult {
  const diagnostics = new Set<string>();
  const byNodeId = new Map<string, typeof plan.callables[number]>();
  const byId = new Map<string, typeof plan.callables[number]>();
  const restrictions = new Map<string, ExactDataPolicyIR>();

  for (const [nodeId, summary] of plan.byNodeId) {
    const policy = metadata.callablePolicies.get(nodeId)?.policy;
    const restriction = policy && isRestrictivePolicy(policy) ? policy : undefined;
    const next = restriction ? restrictCallable(summary, restriction, diagnostics) : summary;
    byNodeId.set(nodeId, next);
    byId.set(next.id, next);
    if (restriction) restrictions.set(next.id, restriction);
  }
  for (const summary of plan.callables) {
    if (!byId.has(summary.id)) byId.set(summary.id, summary);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const summary of plan.callables) {
      const dependencies = summary.calls
        .map(edge => edge.targetId ? restrictions.get(edge.targetId) : undefined)
        .filter((policy): policy is ExactDataPolicyIR => !!policy);
      if (!dependencies.length) continue;
      const combined = combinePolicies(dependencies);
      if (combined.conflict) {
        diagnostics.add(`error: callable ${summary.name} combines server-kept and client-kept dependencies`);
        continue;
      }
      if (!combined.policy) continue;
      const previous = restrictions.get(summary.id);
      if (previous && samePolicy(previous, combined.policy)) continue;
      const current = byId.get(summary.id) ?? summary;
      const next = restrictCallable(current, combined.policy, diagnostics);
      restrictions.set(summary.id, combined.policy);
      byId.set(summary.id, next);
      for (const [nodeId, candidate] of byNodeId) {
        if (candidate.id === summary.id) byNodeId.set(nodeId, next);
      }
      changed = true;
    }
  }

  const callables = plan.callables.map(summary => byId.get(summary.id) ?? summary);
  return Object.freeze({
    callables: Object.freeze({
      callables: Object.freeze(callables),
      byNodeId,
      callEffects: plan.callEffects
    }),
    diagnostics: Object.freeze([...diagnostics].sort())
  });
}

/**
 * Applies residency effects to inferred task placement. Explicit placement
 * remains authoritative only when it does not contradict the data policy.
 */
export function applyExactPolicyToTasks(
  metadata: ExactPolicyMetadata,
  tasks: ExpressionTaskPlan
): ExactPolicyTaskResult {
  const sites = new Map<string, ExpressionTaskSite>();
  const planDiagnostics = [...tasks.diagnostics];
  const diagnosticLocations = [...tasks.diagnosticLocations];
  const policyDiagnostics = new Set<string>();

  for (const [id, site] of tasks.sites) {
    const requirements: ExactDataPolicyIR[] = [];
    for (const effect of [...site.reads, ...site.writes]) {
      const policy = statePolicyForEffect(metadata, site.component, effect);
      if (policy) requirements.push(policy.policy);
    }
    for (const effect of site.contexts) {
      const policy = metadata.contextPolicies.get(effect.token);
      if (policy) requirements.push(policy.policy);
    }

    const needsServer = requirements.some(value => value.secret || value.residency === "server");
    const needsClient = requirements.some(value => value.residency === "client");
    const diagnostics = [...site.diagnostics];
    let placement = site.placement;
    let environmentEffect = site.environmentEffect;
    let serverEffects = site.serverEffects;
    let browserEffects = site.browserEffects;

    if (needsServer && needsClient) {
      diagnostics.push("error: task combines server-kept and client-kept values in one indivisible computation");
    } else if (needsServer) {
      if (site.requestedPlacement === "client" || site.placement === "client" && site.browserEffects) {
        diagnostics.push("error: client task reads or writes server-kept data");
      } else {
        placement = "server";
        environmentEffect = "server";
        serverEffects = true;
      }
    } else if (needsClient) {
      if (site.requestedPlacement === "server" || site.placement === "server" && site.serverEffects) {
        diagnostics.push("error: server task reads or writes client-kept data");
      } else {
        placement = "client";
        environmentEffect = "browser";
        browserEffects = true;
      }
    }

    for (const message of diagnostics) {
      if (!message.startsWith("error:") || site.diagnostics.includes(message)) continue;
      policyDiagnostics.add(message);
      planDiagnostics.push(message);
      diagnosticLocations.push({ message, start: site.start });
    }
    sites.set(id, Object.freeze({
      ...site,
      placement,
      environmentEffect,
      serverEffects,
      browserEffects,
      diagnostics: Object.freeze(diagnostics)
    }));
  }

  return Object.freeze({
    tasks: Object.freeze({
      ...tasks,
      sites,
      diagnostics: Object.freeze(planDiagnostics),
      diagnosticLocations: Object.freeze(diagnosticLocations)
    }),
    diagnostics: Object.freeze([...policyDiagnostics].sort())
  });
}

/** Builds manifest-visible inferred transfers after components and islands exist. */
export function createExactPolicyManifest(
  filename: string,
  metadata: ExactPolicyMetadata,
  components: readonly ExactComponentIR[],
  componentPlan: ExpressionComponentPlan,
  tasks: ExpressionTaskPlan
): ExactPolicyManifestResult {
  const componentIds = new Map(components.map(component => [component.name, component.id]));
  const stateComponentBySubject = new Map(metadata.statePolicies.map(record => [record.subjectId, record.component]));
  const subjects = metadata.subjects.map(subject => {
    const component = stateComponentBySubject.get(subject.id);
    const componentId = component ? componentIds.get(component) : undefined;
    return componentId ? { ...subject, componentId } : { ...subject };
  });
  const flows: ExactPolicyFlowIR[] = [...metadata.flows];
  const diagnostics = new Set<string>(metadata.diagnostics);
  const componentsByName = new Map(components.map(component => [component.name, component]));
  const subjectByState = new Map<string, ExactPolicySubjectIR>();

  for (const record of metadata.statePolicies) {
    const component = componentsByName.get(record.component);
    const subject = subjects.find(candidate => candidate.id === record.subjectId);
    if (component && subject) subjectByState.set(stateKey(record.component, record.path), subject);
  }

  for (const site of componentPlan.sites.values()) {
    const component = componentsByName.get(site.name);
    if (!component) continue;
    for (const island of site.clientIslands) {
      for (const path of island.stateReads) {
        const explicit = statePolicyForPath(metadata, site.name, path);
        const policy = explicit?.policy ?? dataPolicy("isomorphic");
        let subject = explicit ? subjects.find(candidate => candidate.id === explicit.subjectId) : undefined;
        if (!subject) {
          subject = policySubject(filename, {
            kind: "state",
            name: `${site.name}.state.${path}`,
            path,
            componentId: component.id,
            policy,
            source: "inference"
          });
          subjects.push(subject);
          subjectByState.set(stateKey(site.name, path), subject);
        }
        const authorized = policy.residency === "isomorphic" && !policy.secret;
        flows.push(policyFlow(filename, {
          kind: "transfer",
          from: [subject.id],
          to: `${component.id}:client-island:${island.index}:${path}`,
          policy,
          boundary: "client-island",
          authorized,
          ...(!authorized ? { reason: `${describePolicy(policy)} state cannot enter a client island` } : {})
        }));
        if (!authorized) diagnostics.add(
          `error: ${site.name} client island captures ${describePolicy(policy)} state path ${path}`
        );
      }
    }
  }

  for (const component of components) {
    const site = componentPlan.sites.get(component.name);
    if (!site) continue;
    const clientReads = new Set(site.clientIslands.flatMap(island => island.stateReads));
    for (const task of component.tasks) {
      if (task.placement !== "server") continue;
      for (const write of task.writes) {
        for (const clientPath of clientReads) {
          if (!pathsOverlap(write.path, clientPath)) continue;
          const record = statePolicyForPath(metadata, component.name, clientPath);
          const policy = record?.policy ?? dataPolicy("isomorphic");
          const subject = record
            ? subjects.find(candidate => candidate.id === record.subjectId)
            : subjectByState.get(stateKey(component.name, clientPath));
          if (!subject) continue;
          const authorized = policy.residency === "isomorphic" && !policy.secret;
          flows.push(policyFlow(filename, {
            kind: "projection",
            from: [task.id],
            to: subject.id,
            policy,
            boundary: "state",
            authorized,
            ...(!authorized ? { reason: `${describePolicy(policy)} task output cannot be projected to client state` } : {})
          }));
          if (!authorized) diagnostics.add(
            `error: server task ${task.id} writes ${describePolicy(policy)} state path ${clientPath} required by client behavior`
          );
        }
      }
    }
  }

  for (const component of components) {
    for (const effect of component.contexts) {
      const context = metadata.contextPolicies.get(effect.token);
      if (!context || effect.kind !== "read") continue;
      const isClient = component.placement === "client";
      const authorized = !isClient
        || context.policy.residency !== "server" && !context.policy.secret;
      flows.push(policyFlow(filename, {
        kind: "transfer",
        from: [context.subjectId],
        to: component.id,
        policy: context.policy,
        boundary: "context",
        authorized,
        ...(!authorized ? { reason: `${describePolicy(context.policy)} context cannot be read by a client component` } : {})
      }));
      if (!authorized) diagnostics.add(
        `error: client component ${component.name} reads ${describePolicy(context.policy)} context ${effect.token}`
      );
    }
  }

  return Object.freeze({
    policy: Object.freeze({
      version: 1,
      subjects: sortSubjects(subjects),
      flows: flows.sort((left, right) => left.id.localeCompare(right.id))
    }),
    diagnostics: Object.freeze([...diagnostics].sort())
  });
}

function propagateDeclarationPolicies(
  module: BoundModule,
  policies: Map<string, PolicyRecord>,
  namedPolicies: Map<string, PolicyRecord>,
  subjects: ExactPolicySubjectIR[],
  flows: ExactPolicyFlowIR[],
  diagnostics: Set<string>
): void {
  const declarations = module.walk().ofKind("VariableDeclaration").toArray();
  let changed = true;
  for (let pass = 0; changed && pass <= declarations.length; pass++) {
    changed = false;
    for (const declaration of declarations) {
      const variable = declaration.children().first()?.variable;
      const initializer = declaration.children().toArray().at(-1);
      if (!variable || !initializer || policies.has(variable.id)) continue;
      const inputs = policyInputs(initializer, policies, namedPolicies);
      materializePolicyInputSubjects(inputs, subjects);
      const combined = combinePolicyRecords(inputs.map(input => input.record));
      if (combined.conflict) {
        diagnostics.add(`error: declaration ${variable.name} combines server-kept and client-kept values`);
        continue;
      }
      if (!combined.policy) continue;
      const subject = policySubject(module.filename, {
        kind: "declaration",
        name: variable.name,
        policy: combined.policy,
        source: "inference"
      });
      subjects.push(subject);
      const record = { policy: subject.policy, subjectId: subject.id };
      policies.set(variable.id, record);
      namedPolicies.set(variable.name, record);
      flows.push(policyFlow(module.filename, {
        kind: "propagation",
        from: inputs.map(input => input.record.subjectId).sort(),
        to: subject.id,
        policy: subject.policy,
        authorized: true
      }));
      changed = true;
    }
  }
}

function collectCallableReturnPolicies(
  module: BoundModule,
  declarationPolicies: ReadonlyMap<string, PolicyRecord>,
  namedPolicies: Map<string, PolicyRecord>,
  callablePolicies: Map<string, PolicyRecord>,
  subjects: ExactPolicySubjectIR[],
  flows: ExactPolicyFlowIR[],
  diagnostics: Set<string>,
  infer: boolean
): void {
  for (const fn of module.walk().functions()) {
    if (!fn.node.name || callablePolicies.has(fn.node.id)) continue;
    const direct = policyFromDirectives(fn.node.directives)
      ?? policyFromDirectives(fn.type?.callSignatures[0]?.returnDirectives);
    let policy = direct;
    if (!policy && infer) {
      const inputs = fn.descendants({ nestedFunctions: false })
        .ofKind("ReturnStatement")
        .toArray()
        .flatMap(statement => {
          const value = statement.children().toArray().at(-1);
          return value ? policyInputs(value, declarationPolicies, namedPolicies).map(input => input.record) : [];
        });
      const combined = combinePolicyRecords(inputs);
      if (combined.conflict) {
        diagnostics.add(`error: return value of ${fn.node.name} combines server-kept and client-kept values`);
        continue;
      }
      policy = combined.policy;
    }
    if (!policy) continue;
    const subject = policySubject(module.filename, {
      kind: "return",
      name: fn.node.name,
      callableId: stableId(module.filename, "callable", fn.node.id),
      policy,
      source: direct ? "annotation" : "inference"
    });
    subjects.push(subject);
    const record = { policy, subjectId: subject.id };
    callablePolicies.set(fn.node.id, record);
    namedPolicies.set(fn.node.name, record);
    if (!direct) {
      const inputs = fn.descendants({ nestedFunctions: false })
        .ofKind("ReturnStatement")
        .toArray()
        .flatMap(statement => {
          const value = statement.children().toArray().at(-1);
          return value ? policyInputs(value, declarationPolicies, namedPolicies) : [];
        });
      materializePolicyInputSubjects(inputs, subjects);
      flows.push(policyFlow(module.filename, {
        kind: "propagation",
        from: inputs.map(input => input.record.subjectId).sort(),
        to: subject.id,
        policy: subject.policy,
        authorized: true
      }));
    }
  }
}

function policyInputs(
  expression: NodeRef,
  policies: ReadonlyMap<string, PolicyRecord>,
  namedPolicies: ReadonlyMap<string, PolicyRecord> = new Map()
): PolicyInput[] {
  const values = new Map<string, PolicyInput>();
  for (const reference of expression.walk({ types: false }).references()) {
    const variable = reference.variable;
    const record = variable ? policies.get(variable.id) : undefined;
    if (variable && record) values.set(variable.id, { variable, record });
  }
  const expressionPolicy = policyFromType(expression.type);
  if (expressionPolicy) {
    const synthetic = {
      id: `${expression.node.id}:type-policy`,
      name: expression.node.text ?? "typed value"
    } as Variable;
    values.set(synthetic.id, {
      variable: synthetic,
      record: {
        policy: expressionPolicy,
        subjectId: stableId(expression.node.id, "policy:type")
      },
      syntheticSource: true
    });
  }
  const returnPolicy = expression.node.kind === "CallExpression" || expression.node.kind === "NewExpression"
    ? policyFromDirectives(expression.node.resolvedSignature?.returnDirectives)
    : undefined;
  if (returnPolicy) {
    const synthetic = {
      id: `${expression.node.id}:return`,
      name: expression.target?.node.text ?? "return"
    } as Variable;
    values.set(synthetic.id, {
      variable: synthetic,
      record: {
        policy: returnPolicy,
        subjectId: stableId(expression.node.id, "policy:return")
      },
      syntheticSource: true
    });
  }
  if ((expression.node.kind === "CallExpression" || expression.node.kind === "NewExpression")
    && expression.target?.name) {
    const record = namedPolicies.get(expression.target.name);
    if (record) {
      const synthetic = {
        id: `${expression.node.id}:local-return`,
        name: expression.target.name
      } as Variable;
      values.set(synthetic.id, { variable: synthetic, record });
    }
  }
  return [...values.values()];
}

function materializePolicyInputSubjects(
  inputs: readonly PolicyInput[],
  subjects: ExactPolicySubjectIR[]
): void {
  const existing = new Set(subjects.map(subject => subject.id));
  for (const input of inputs) {
    if (!input.syntheticSource || existing.has(input.record.subjectId)) continue;
    subjects.push({
      id: input.record.subjectId,
      kind: "return",
      name: input.variable.name,
      policy: input.record.policy,
      source: "inference"
    });
    existing.add(input.record.subjectId);
  }
}

function collectStateTypePolicies(
  filename: string,
  component: string,
  type: ExpressionType,
  path: readonly string[],
  records: StatePolicyRecord[],
  subjects: ExactPolicySubjectIR[],
  diagnostics: Set<string>,
  seen: Set<string>
): void {
  const identity = `${type.id}:${path.join(".")}`;
  if (seen.has(identity) || path.length > 32) return;
  seen.add(identity);
  for (const property of type.propertyTypes) {
    const nextPath = [...path, property.name];
    const keep = exactKeepPolicy(property.directives) ?? keepFromType(property.type);
    if (keep) {
      const policy = dataPolicy(keep);
      const ancestor = records
        .filter(record => record.component === component && isAncestorPath(record.path, nextPath.join(".")))
        .sort((left, right) => right.path.length - left.path.length)[0];
      if (ancestor && residencyConflict(ancestor.policy, policy)) {
        diagnostics.add(`error: state path ${component}.${nextPath.join(".")} contradicts ancestor policy on ${ancestor.path}`);
      }
      const subject = policySubject(filename, {
        kind: "state",
        name: `${component}.state.${nextPath.join(".")}`,
        path: nextPath.join("."),
        policy,
        source: "annotation"
      });
      subjects.push(subject);
      records.push({
        component,
        path: nextPath.join("."),
        policy,
        subjectId: subject.id
      });
    }
    collectStateTypePolicies(filename, component, property.type, nextPath, records, subjects, diagnostics, seen);
  }
}

function parseContextPolicyOptions(text: string | undefined): {
  keep?: ExactKeepPolicy;
  error?: string;
} {
  if (!text || !/\bkeep\s*:/.test(text)) return {};
  const match = /\bkeep\s*:\s*(["'])([^"']+)\1/.exec(text);
  if (!match) return { error: "keep option must be a static string literal" };
  const keep = match[2];
  if (keep === "isomorphic") return { error: "cannot use keep=isomorphic; safe isomorphic residency is inferred" };
  if (keep !== "server" && keep !== "client" && keep !== "secret") {
    return { error: `has unknown keep option '${keep}'; expected server, client, or secret` };
  }
  return { keep };
}

function isCreateContextCall(call: NodeRef): boolean {
  if (call.target?.name !== "createContext" && call.target?.node.text !== "createContext") return false;
  const variable = call.target?.rootVariable ?? call.target?.variable;
  return !variable?.importedFrom || variable.importedFrom === "@exact/core";
}

function uniqueVariables(module: BoundModule): Variable[] {
  const values = new Map<string, Variable>();
  for (const reference of module.walk().references()) {
    if (reference.variable?.id.startsWith(`${module.filename}:`)) values.set(reference.variable.id, reference.variable);
  }
  return [...values.values()];
}

function parameterIndex(module: BoundModule, variable: Variable): number | undefined {
  const declaration = module.walk().ofKind("Parameter").first(reference =>
    reference.children().first()?.variable?.id === variable.id
  );
  const owner = declaration?.ancestors().functions().first();
  return owner?.node.parameters.findIndex(parameter => parameter.id === variable.id);
}

function statePolicyForEffect(
  metadata: ExactPolicyMetadata,
  component: string | undefined,
  effect: ExactStateEffect
): StatePolicyRecord | undefined {
  return component ? statePolicyForPath(metadata, component, effect.path) : undefined;
}

function statePolicyForPath(
  metadata: ExactPolicyMetadata,
  component: string,
  path: string
): StatePolicyRecord | undefined {
  return metadata.statePolicies
    .filter(record => record.component === component && pathsOverlapForPolicy(record.path, path))
    .sort((left, right) => right.path.length - left.path.length)[0];
}

function pathsOverlapForPolicy(policyPath: string, accessedPath: string): boolean {
  return accessedPath === "*" || policyPath === accessedPath
    || accessedPath.startsWith(`${policyPath}.`)
    || policyPath.startsWith(`${accessedPath}.`);
}

function pathsOverlap(left: string, right: string): boolean {
  return left === "*" || right === "*" || left === right
    || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}

function isAncestorPath(ancestor: string, descendant: string): boolean {
  return descendant === ancestor || descendant.startsWith(`${ancestor}.`);
}

function dataPolicy(keep: ExactKeepPolicy | "isomorphic"): ExactDataPolicyIR {
  if (keep === "secret") return Object.freeze({ residency: "server", secret: true });
  return Object.freeze({ residency: keep, secret: false });
}

function keepForPolicy(policy: ExactDataPolicyIR): ExactKeepPolicy {
  return policy.secret ? "secret" : policy.residency === "isomorphic" ? "server" : policy.residency;
}

function policyFromDirectives(directives: readonly ExpressionDirective[] | undefined): ExactDataPolicyIR | undefined {
  const keep = exactKeepPolicy(directives);
  return keep ? dataPolicy(keep) : undefined;
}

function policyFromType(type: ExpressionType | undefined): ExactDataPolicyIR | undefined {
  if (!type) return undefined;
  const direct = exactKeepPolicy(type.directives);
  if (direct) return dataPolicy(direct);
  const combined = combinePolicies(type.unionMembers
    .map(member => policyFromType(member))
    .filter((policy): policy is ExactDataPolicyIR => !!policy));
  return combined.conflict ? undefined : combined.policy;
}

function keepFromType(type: ExpressionType | undefined): ExactKeepPolicy | undefined {
  const policy = policyFromType(type);
  return policy ? keepForPolicy(policy) : undefined;
}

function combinePolicyRecords(records: readonly PolicyRecord[]): {
  policy?: ExactDataPolicyIR;
  conflict: boolean;
} {
  if (!records.length) return { conflict: false };
  const secret = records.some(record => record.policy.secret);
  const residencies = new Set(records.map(record => record.policy.residency).filter(value => value !== "isomorphic"));
  if (residencies.size > 1) return { conflict: true };
  const residency = secret ? "server" : [...residencies][0] ?? "isomorphic";
  return { policy: Object.freeze({ residency, secret }), conflict: false };
}

function combinePolicies(policies: readonly ExactDataPolicyIR[]): {
  policy?: ExactDataPolicyIR;
  conflict: boolean;
} {
  return combinePolicyRecords(policies.map((policy, index) => ({
    policy,
    subjectId: `combined:${index}`
  })));
}

function restrictCallable(
  summary: ExactCallableSummaryIR,
  policy: ExactDataPolicyIR,
  diagnostics: Set<string>
): ExactCallableSummaryIR {
  const target: ExactArtifactTarget = policy.residency === "client" ? "client" : "server";
  const environment = target === "client" ? "browser" : "server";
  const opposite = target === "client" ? "server" : "browser";
  if (summary.effectSources.some(source => source.environment === opposite)) {
    diagnostics.add(
      `error: ${describePolicy(policy)} declaration ${summary.name} has ${opposite}-only execution effects`
    );
  }
  const source: ExactEnvironmentEffectSourceIR = {
    environment,
    description: `${describePolicy(policy)} data policy`,
    path: [summary.name, `${describePolicy(policy)} data policy`]
  };
  return Object.freeze({
    ...summary,
    directEffect: summary.directEffect === "neutral" ? environment : summary.directEffect,
    effect: summary.effect === "neutral" ? environment : summary.effect,
    directEffectSources: uniquePolicyEffectSources([...summary.directEffectSources, source]),
    effectSources: uniquePolicyEffectSources([...summary.effectSources, source]),
    artifactTargets: [target]
  });
}

function isRestrictivePolicy(policy: ExactDataPolicyIR): boolean {
  return policy.secret || policy.residency !== "isomorphic";
}

function uniquePolicyEffectSources(
  values: readonly ExactCallableSummaryIR["effectSources"][number][]
): ExactCallableSummaryIR["effectSources"] {
  return [...new Map(values.map(value => [
    `${value.environment}:${value.description}:${value.path.join(":")}`,
    value
  ])).values()];
}

function residencyConflict(left: ExactDataPolicyIR, right: ExactDataPolicyIR): boolean {
  return left.residency !== "isomorphic"
    && right.residency !== "isomorphic"
    && left.residency !== right.residency;
}

function samePolicy(left: ExactDataPolicyIR, right: ExactDataPolicyIR): boolean {
  return left.residency === right.residency && left.secret === right.secret;
}

function describePolicy(policy: ExactDataPolicyIR): string {
  return policy.secret ? "secret" : `${policy.residency}-kept`;
}

function policySubject(
  filename: string,
  input: Omit<ExactPolicySubjectIR, "id">
): ExactPolicySubjectIR {
  const identity = [
    input.kind,
    input.name,
    input.path ?? "",
    input.componentId ?? "",
    input.callableId ?? "",
    input.parameterIndex ?? ""
  ].join(":");
  return {
    id: stableId(filename, `policy:subject:${identity}`),
    ...input
  };
}

function policyFlow(
  filename: string,
  input: Omit<ExactPolicyFlowIR, "id">
): ExactPolicyFlowIR {
  return {
    id: stableId(filename, `policy:flow:${input.kind}:${input.from.join(",")}:${input.to}:${input.boundary ?? ""}`),
    ...input
  };
}

function sortSubjects(subjects: readonly ExactPolicySubjectIR[]): ExactPolicySubjectIR[] {
  return [...new Map(subjects.map(subject => [subject.id, subject])).values()]
    .sort((left, right) => left.id.localeCompare(right.id));
}

function compareStatePolicy(left: StatePolicyRecord, right: StatePolicyRecord): number {
  return left.component.localeCompare(right.component) || left.path.localeCompare(right.path);
}

function stateKey(component: string, path: string): string {
  return `${component}:${path}`;
}
