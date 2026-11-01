package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Actual descriptor completion pays both edges for this invocation without
// changing the generic function summary. Identity and publication are separate
// from the primitive return and from unrelated effect sources.
func TestDescriptorEffectCertificateRelation(t *testing.T) {
	fixture := newExecutableFixture(t, map[string]string{
		"entry.ts":   `import type {Other} from './foreign.js';export let observed=0;function read(){Object.defineProperty(Function.prototype,'apply',{get(){observed++;return ()=> 'installed'},configurable:true});return 1}export const first=read.call(undefined);export const value=read.apply(undefined,[]);`,
		"foreign.ts": `export type Other=number;`,
	})
	session := NewSession()
	response := session.Execute(fixture.request("analyze", "entry.ts"))
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	checked := false
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		facts := project.callableCache.merged.facts
		for _, caller := range facts {
			for _, actual := range caller.fieldCalls {
				if len(actual.descriptorEffects) == 0 || !actual.descriptorEffects[0].complete {
					continue
				}
				for _, outcome := range actual.descriptorEffects {
					delta := outcome.component.delta
					if len(delta.inputs) != 0 || len(delta.values) != 0 || len(delta.callableScopes) != 0 || len(delta.reflective) != 0 || len(delta.nativeCalls) != 0 || len(delta.normalCalls) != 0 || len(delta.thenReferences) != 0 || len(delta.ownedClaims) != 0 || delta.ownedComponents != nil {
						t.Fatal("descriptor certificate retained live construction")
					}
					for _, write := range delta.writes {
						if write.value.native != nil || write.value.adapter != nil || write.value.bound != nil || write.value.normal != nil || write.value.acquired != nil {
							t.Fatal("write retained acquisition authority")
						}
					}
				}
				for _, target := range facts {
					if target.node != actual.target {
						continue
					}
					for _, source := range target.summary.DirectEffectSources {
						if source.descriptorOrigin == nil {
							continue
						}
						for _, edge := range caller.summary.Calls {
							if !edge.Resolved || edge.TargetID != target.summary.ID || caller.fieldEdgeOperations[edge.ID] != actual.operation {
								continue
							}
							checked = true
							for _, name := range []string{"valid", "forwarded", "browser-source", "independent-unknown", "wrong-call", "wrong-target", "wrong-caller", "wrong-source", "wrong-mode", "wrong-caller-mode", "wrong-target-mode", "wrong-program", "wrong-checker", "wrong-generation", "dead", "unpublished", "foreign-publisher", "dead-publication", "incomplete-call", "wrong-occurrence", "unpaid-second-occurrence"} {
								t.Run(name+"/"+edge.ID, func(t *testing.T) {
									copy := cloneProjectCallableFact(caller)
									targetCopy := target
									unknown := source
									origin := *source.descriptorOrigin
									unknown.descriptorOrigin = &origin
									switch name {
									case "forwarded":
										unknown.descriptorForwarded = true
									case "browser-source":
										unknown.Environment = "browser"
									case "independent-unknown":
										unknown.descriptorOrigin = nil
									case "wrong-caller":
										copy.node = target.node
									case "wrong-source":
										copy.sourceFile = project.program.GetSourceFile(fixture.request("analyze", "foreign.ts").ID)
									case "wrong-mode":
										origin.authority.mode = "other"
									case "wrong-caller-mode":
										copy.descriptorMode[0] ^= 1
									case "wrong-target-mode":
										targetCopy.descriptorMode[0] ^= 1
									case "wrong-program":
										origin.authority.program = nil
									case "wrong-checker":
										origin.authority.checker = nil
									case "wrong-generation":
										origin.authority.namespace = newLanguageOwner()
									case "dead":
										namespace := *origin.authority.namespace
										namespace.disposed = true
										origin.authority.namespace = &namespace
									}
									for i := range copy.fieldCalls {
										call := &copy.fieldCalls[i]
										if call.operation != actual.operation {
											continue
										}
										switch name {
										case "incomplete-call":
											call.complete = false
										case "wrong-target":
											call.target = caller.node
										}
										for j := range call.descriptorEffects {
											outcome := &call.descriptorEffects[j]
											switch name {
											case "wrong-call":
												outcome.call = origin.operation
											case "unpublished", "foreign-publisher", "dead-publication":
												outcome.complete = false
											case "wrong-occurrence":
												outcome.occurrence = &sourceDescriptorEffectOccurrence{}
											}
										}
									}
									if name == "unpaid-second-occurrence" {
										second := cloneSourceFieldCall(actual)
										second.descriptorOccurrence = &sourceDescriptorEffectOccurrence{}
										copy.fieldCalls = append(copy.fieldCalls, second)
									}
									if name == "foreign-publisher" || name == "dead-publication" {
										payload := accessorCandidates{fieldCalls: copy.fieldCalls}
										foreign := &sourceLegacyPublication{destination: &copy, state: ownedPublished, payload: &payload, evidence: actual.descriptorEffects[0].component}
										if name == "dead-publication" {
											copy.ownedLegacyPending = []*sourceLegacyPublication{foreign}
										}
										publishDescriptorEffectOutcomes(&copy, foreign)
									}
									if got := descriptorFallbackFulfilled(&copy, &targetCopy, edge, unknown); got != (name == "valid") {
										t.Fatalf("descriptor origin match=%t", got)
									}
									if source.Environment != "unknown" || source.descriptorForwarded {
										t.Fatal("generic definition changed")
									}
								})
							}
						}
					}
				}
			}
		}
	}
	if !checked {
		t.Fatal("no published actual descriptor outcome and generic origin")
	}
}

// Paying a conversion origin cannot pay a browser dependency or an unrelated
// unknown body. The original Call fact remains their normal execution owner.
func TestDescriptorEffectIndependentEffects(t *testing.T) {
	for _, test := range []struct {
		name, declaration, body, argument string
		browser, unknown                  bool
	}{
		{"pure", "", "", "undefined", false, false},
		{"body-browser", "", "document.title;", "undefined", true, false},
		{"argument-browser", "", "", "document.title", true, false},
		{"unknown-body", "declare function foreign():void;", "foreign();", "undefined", false, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := `export {};` + test.declaration + `function read(input?:unknown){` + test.body + `Object.defineProperty(Function.prototype,'apply',{get(){return ()=> 'installed'},configurable:true});return 1}export const first=read.call(undefined,` + test.argument + `);export const value=read.apply(undefined,[]);`
			session := NewSession()
			response := session.Execute(Request{Kind: "analyze", ID: "/virtual/descriptor-independent.ts", Source: source, Diagnostics: "semantic"})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Severity == "error" && diagnostic.Code != "EXACT2101" {
					t.Fatal("invalid source witness", response.Diagnostics)
				}
			}
			found := false
			for _, project := range session.projects {
				if project.callableCache == nil {
					continue
				}
				for _, fact := range project.callableCache.merged.facts {
					operation := moduleCallInitializer(project.callableCache.owner.values, fact.node)
					if operation == nil || !ast.IsPropertyAccessExpression(operation.AsCallExpression().Expression) || operation.AsCallExpression().Expression.AsPropertyAccessExpression().Name().Text() != "call" {
						continue
					}
					found = true
					browser, unknown := false, false
					for _, effect := range fact.summary.EffectSources {
						browser = browser || effect.Environment == "browser"
						unknown = unknown || effect.Environment == "unknown"
					}
					// Browser retention does not certify completion of a host value used
					// as an argument or its possible descriptor interference.
					if browser != test.browser || test.unknown && !unknown || test.name == "pure" && unknown {
						t.Fatalf("original Call effects: %#v", fact.summary.EffectSources)
					}
				}
			}
			if !found {
				t.Fatal("missing original Call fact")
			}
		})
	}
}

// An evidence reference cannot complete itself or steal another fact's pending
// publication. The live original batch is the sole transition to complete.
func TestDescriptorEffectOriginalPublication(t *testing.T) {
	caller, operation, target := &ast.Node{}, &ast.Node{}, &ast.Node{}
	token := &sourceDescriptorEffectOccurrence{}
	component := &ownedGetContribution{delta: accessorCandidates{effects: []sourceCallableEffect{{operation: operation, declaration: target}}}}
	outcome := sourceDescriptorEffectOutcome{caller: caller, call: operation, target: target, occurrence: token, component: component}
	call := sourceFieldCall{operation: operation, target: target, descriptorOccurrence: token, descriptorEffects: []sourceDescriptorEffectOutcome{outcome}, complete: true}
	for _, state := range []ownedGetPublicationState{ownedUnpublished, ownedPublishing, ownedAbandoned} {
		fact := callableFacts{node: caller, fieldCalls: []sourceFieldCall{cloneSourceFieldCall(call)}}
		payload := accessorCandidates{fieldCalls: []sourceFieldCall{cloneSourceFieldCall(call)}}
		claim := &sourceLegacyPublication{destination: &fact, state: state, payload: &payload, evidence: component}
		fact.ownedLegacyPending = []*sourceLegacyPublication{claim}
		publishDescriptorEffectOutcomes(&fact, claim)
		if fact.fieldCalls[0].descriptorEffects[0].complete {
			t.Fatal("unpublished evidence became complete")
		}
	}
}

// Has completion is independent of a completed field value or primitive return.
// This protects the sealed conversion check without constructing live receivers.
func TestDescriptorEffectConversionCompletion(t *testing.T) {
	for _, name := range []string{"valid", "unfinished", "uncovered", "unknown-targets", "unknown-descriptor", "unknown-field", "missing-field", "empty-present-field", "residual-mutation", "nested-incomplete"} {
		t.Run(name, func(t *testing.T) {
			op := &sourceReflectiveOperation{native: sourceNativeObjectDefineProperty, covered: true, finalized: true, normal: true, targets: []sourceObservedValue{{}}, descriptors: []sourceObservedValue{{}}, key: "apply", fields: make(map[string]sourcePropertyResult)}
			for _, key := range reflectiveDescriptorKeys {
				op.fields[key] = sourcePropertyResult{presence: propertyAbsent}
			}
			switch name {
			case "unfinished":
				op.finalized = false
			case "uncovered":
				op.covered = false
			case "unknown-targets":
				op.targets = nil
			case "unknown-descriptor":
				op.conversionIncomplete = true
			case "unknown-field":
				op.fields["enumerable"] = sourcePropertyResult{presence: propertyUnknown}
			case "missing-field":
				delete(op.fields, "enumerable")
			case "empty-present-field":
				op.fields["get"] = sourcePropertyResult{presence: propertyPresent}
			case "residual-mutation":
				op.residualMutation = true
			case "nested-incomplete":
				op.nested = []*sourceReflectiveOperation{{}}
			}
			query := sourceValueQuery{owner: newSourceValueOwner(nil)}
			if query.completeDescriptorConversion(op, &accessorCandidates{}) != (name == "valid") {
				t.Fatal("conversion population not closed", name)
			}
		})
	}
}
