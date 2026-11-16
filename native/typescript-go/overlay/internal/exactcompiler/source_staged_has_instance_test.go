package exactcompiler

import (
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// These controls enter through the ordinary collector and original source Get.
// A source-selected default method does not authenticate operand/prototype work.
func TestStagedHasInstanceOriginalDefault(t *testing.T) {
	for _, row := range []struct {
		name, source string
		closed       bool
	}{
		{"null", `export function invoke(){return (null as unknown as object) instanceof WeakMap}`, true},
		{"genuine saved", `const Receiver=WeakMap;export function invoke(){return (null as unknown as object) instanceof Receiver}`, true},
		{"ordinary", `export function invoke(){return ({get dormant(){return window.name},callback:()=>document.title}) instanceof WeakMap}`, true},
		{"formal pending", `export function invoke(value:object){return value instanceof WeakMap}`, false},
		{"global result pending", `export function invoke(){return globalThis.location instanceof WeakMap}`, false},
		{"Proxy input pending", `export function invoke(){return new Proxy({}, {}) instanceof WeakMap}`, false},
		{"special prototype pending", `export function invoke(){return ({__proto__:new Proxy({}, {})}) instanceof WeakMap}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withHasInstanceSource(t, row.source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
				consumer := installationFactIndex(t, facts, q.effectOwner)
				work := newCallableEffectWork(facts)
				if !work.stageHasInstance(facts, consumer, operation, q.executable) {
					t.Fatal("original operator not adopted")
				}
				work.prepareOperationUses(facts, q.executable)
				var root sourceStagedOperationRecipe
				for _, recipe := range facts[consumer].staged.operationRecipes {
					if recipe.hasInstance != nil && recipe.hasInstance.role == "" && recipe.key.operation == operation {
						root = recipe
					}
				}
				if root.hasInstance == nil || len(root.delta.required) != len(stagedHasInstanceRoles) {
					t.Fatal("operand/Get/prototype roles missing before source reading")
				}
				id := work.operationIDs[root.key]
				if work.closedOperationDependencies()[id.index] != row.closed {
					t.Fatalf("operator closure mismatch, want %v: %#v", row.closed, work.operations[id.index])
				}
				for _, role := range stagedHasInstanceRoles {
					request := stagedHasInstanceRequest(root.hasInstance.root, role)
					child := work.operationRecipes[request.producer]
					if !validStagedHasInstanceRecipe(child) || !sameOperationRequest(child.hasInstance.request, request) {
						t.Fatal("original phase request lost", role)
					}
				}
				for _, call := range facts[consumer].summary.Calls {
					if strings.Contains(call.Name, "dormant") || strings.Contains(call.Name, "callback") {
						t.Fatal("stored left body invoked")
					}
				}
				// An actually issued source recipe remains descriptive in a fresh graph.
				clone := cloneProjectCallableFact(facts[consumer])
				for i := range clone.staged.operationRecipes {
					if clone.staged.operationRecipes[i].hasInstance != nil {
						cloned := clone.staged.operationRecipes[i].hasInstance
						if cloned == root.hasInstance {
							t.Fatal("operator metadata not detached")
						}
					}
				}
				fresh := newCallableEffectWork(facts)
				fresh.operationGeneration = q.owner.generation
				fresh.indexOperationSources(facts)
				clonedID, issued := fresh.requireOperation(facts, root.hasInstance.request)
				if !issued || fresh.closedOperationDependencies()[clonedID.index] {
					t.Fatal("cached operator recipe authenticated new graph")
				}
				invalid := root
				changed := *root.hasInstance
				changed.root.cut.reading = operation.AsBinaryExpression().Left
				invalid.hasInstance = &changed
				if validStagedHasInstanceRecipe(invalid) {
					t.Fatal("wrong original cut accepted")
				}
			})
		})
	}
}

func TestStagedHasInstanceCustomBodyAndPendingBoundaries(t *testing.T) {
	for _, source := range []string{
		`class Receiver{static [Symbol.hasInstance](value:unknown){window.name;return true}}export function invoke(){return (()=>document.title) instanceof Receiver}`,
		`const Receiver={get [Symbol.hasInstance](){window.name;return (_value:unknown)=>true}};export function invoke(){return (()=>document.title) instanceof Receiver}`,
		`declare const flag:boolean;declare const other:{[Symbol.hasInstance](value:unknown):boolean};const Receiver=flag?{[Symbol.hasInstance](_value:unknown){window.name;return true}}:other;export function invoke(){return (()=>document.title) instanceof Receiver}`,
		`const WeakMap={ [Symbol.hasInstance](_value:unknown){window.name;return true}};export function invoke(){return (()=>document.title) instanceof WeakMap}`,
	} {
		withHasInstanceSource(t, source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
			consumer := installationFactIndex(t, facts, q.effectOwner)
			work := newCallableEffectWork(facts)
			if !work.stageHasInstance(facts, consumer, operation, q.executable) {
				t.Fatal("original custom protocol not registered")
			}
			work.prepareOperationUses(facts, q.executable)
			root := work.operationRecipes[sourceStagedOperationKey{declaration: q.effectOwner, operation: operation, kind: relativeDemandEffects}]
			if root.hasInstance == nil {
				t.Fatal("custom branch disappeared")
			}
			boundBodies := 0
			for _, call := range facts[consumer].staged.calls {
				if call.invocation.operation == operation {
					boundBodies++
				}
				if call.invocation.operation == operation && len(call.invocation.actuals) == 1 && call.inputs != nil && call.inputs.relative.unsupported != relativeInputsSupported {
					t.Fatalf("capture-free dormant actual remained compiler-pending: %v", call.inputs.relative.unsupported)
				}
				if call.invocation.operation == operation && (call.inputs == nil || !call.inputs.delivered || call.inputs.request.operation != operation || call.inputs.bound.operation != operation) {
					t.Fatal("synthetic or detached implicit binder")
				}
			}
			if boundBodies == 0 {
				t.Fatal("original custom Get supplied no canonical body/B prefix")
			}
			for _, edge := range facts[consumer].summary.Calls {
				if edge.TargetID != "" {
					for _, body := range facts {
						if body.summary.ID == edge.TargetID && ast.IsArrowFunction(body.node) && strings.Contains(sourceText(body.sourceFile, body.node), "document.title") {
							t.Fatal("left callback invoked by instanceof")
						}
					}
				}
			}
		})
	}
}

func withHasInstanceSource(t *testing.T, source string, inspect func(*sourceValueQuery, *ast.Node, []callableFacts)) {
	t.Helper()
	const id = "/virtual/staged-has-instance.ts"
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"})
	pending := strings.HasPrefix(response.Error, "Compiler analysis coverage gap: required staged effect contribution")
	if hasErrorDiagnostic(response.Diagnostics) || response.Error != "" && !pending {
		t.Fatal(response.Error, response.Diagnostics)
	}
	for _, project := range session.projects {
		file := project.program.GetSourceFile(id)
		if file == nil || project.callableCache == nil {
			continue
		}
		var operation *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsBinaryExpression(node) && node.AsBinaryExpression().OperatorToken.Kind == ast.KindInstanceOfKeyword && enclosingCallableNode(node) != nil && callableNameText(enclosingCallableNode(node).Name()) == "invoke" {
				operation = node
			}
			return true
		})
		if operation == nil {
			t.Fatal("original operator absent")
		}
		owner := project.callableCache.owner
		q := newSourceDependencyQuery(operation, owner.checker, owner, enclosingCallableNode(operation))
		facts := installationSourceFacts(q)
		inspect(q, operation, facts)
		return
	}
	t.Fatal("original source project absent")
}

// These are borrow transport controls beside actual source-body journeys above.
// Matching source metadata does not substitute for the issuing query/Get.
func TestStagedHasInstanceGetLifetime(t *testing.T) {
	const source = `class Receiver{static [Symbol.hasInstance](_value:unknown){return true}}export function invoke(){return ({}) instanceof Receiver}`
	withHasInstanceSource(t, source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
		var member, origin *ast.Node
		walkNode(ast.GetSourceFileOfNode(operation).AsNode(), func(n *ast.Node) bool {
			if ast.IsMethodDeclaration(n) {
				member = n
				origin = n.Parent
			}
			return true
		})
		key, symbol := q.nativeWellKnownKey("hasInstance", &accessorCandidates{})
		get := &sourceGetInputs{operation: operation, receiver: sourceValue{node: origin}, propertyKey: key, symbol: symbol}
		calls := 0
		b := &sourceStagedHasInstanceGetBorrow{issuer: q, owner: q.owner, generation: q.owner.generation, get: get, key: key, receiver: get.receiver, cut: q.relativeInputCut(operation), accounted: true, complete: true, consume: func(*ast.Node, *sourceGetInputs, acquiredCallableScope, *accessorCandidates) bool {
			calls++
			return true
		}}
		revoke := q.beginStagedHasInstanceGet(b)
		defer revoke()
		if !q.observeStagedHasInstanceMember(origin, member, get, get.receiver, acquiredCallableScope{}, []string{key}, "", accessorAcquire, true, &accessorCandidates{}) || calls != 1 {
			t.Fatal("original member loan not observed")
		}
		copiedQuery := *q
		copiedGet := *get
		if copiedQuery.liveStagedHasInstanceGet(get) || q.liveStagedHasInstanceGet(&copiedGet) || q.observeStagedHasInstanceMember(origin, member, &copiedGet, copiedGet.receiver, acquiredCallableScope{}, []string{key}, "", accessorAcquire, true, &accessorCandidates{}) {
			t.Fatal("copied query/Get borrowed source rights")
		}
		selected := *get
		if !q.withStagedHasInstanceSelectedGet(&selected, func() bool {
			return b.selected == &selected && q.liveStagedHasInstanceGet(&selected)
		}) || b.selected != nil || q.liveStagedHasInstanceGet(&selected) {
			t.Fatal("selected Get pointer loan escaped its semantic branch")
		}
		innerGet := *get
		inner := *b
		inner.get = &innerGet
		inner.selected = nil
		releaseInner := q.beginStagedHasInstanceGet(&inner)
		if q.liveStagedHasInstanceGet(get) || !q.liveStagedHasInstanceGet(&innerGet) {
			t.Fatal("nested Get retained previous issuer rights")
		}
		releaseInner()
		if q.stagedHasInstance != b || !q.liveStagedHasInstanceGet(get) || q.liveStagedHasInstanceGet(&innerGet) {
			t.Fatal("nested Get did not restore exact prior borrow")
		}
		previous := q.reading
		q.reading = member
		if q.liveStagedHasInstanceGet(get) {
			t.Fatal("different physical cut accepted")
		}
		q.reading = previous
		oldGeneration := b.generation
		b.generation = nil
		if q.liveStagedHasInstanceGet(get) {
			t.Fatal("generation mismatch retained Get source rights")
		}
		b.generation = oldGeneration
		b.finished = true
		if q.observeStagedHasInstanceMember(origin, member, get, get.receiver, acquiredCallableScope{}, []string{key}, "", accessorAcquire, true, &accessorCandidates{}) || calls != 1 {
			t.Fatal("finished observation retained callback rights")
		}
		revoke()
		if q.liveStagedHasInstanceGet(get) {
			t.Fatal("revoked Get remained live")
		}
	})
}

// These boundaries retain source debt rather than manufacturing an invoked
// unknown from an unresolved value. Existing source consumers own those inputs.
func TestStagedHasInstanceUnrepresentedInputsStayRequired(t *testing.T) {
	for _, row := range []struct{ name, source string }{
		{"captured dormant lhs", `export function invoke(saved:string){class Receiver{static [Symbol.hasInstance](_value:unknown){return true}}return (()=>saved) instanceof Receiver}`},
		{"ambient lhs", `declare const value:object;export function invoke(){return value instanceof WeakMap}`},
		{"getter returned capture", `export function invoke(callback:()=>boolean){const Receiver={get [Symbol.hasInstance](){return (_value:unknown)=>callback()}};return ({}) instanceof Receiver}`},
		{"method capture", `export function invoke(callback:()=>void){const Receiver={ [Symbol.hasInstance](_value:unknown){callback();return true}};return ({}) instanceof Receiver}`},
		{"Proxy RHS", `const Receiver=new Proxy({[Symbol.hasInstance](_value:unknown){window.name;return true}},{get(target,key,receiver){window.name;return Reflect.get(target,key,receiver)}});export function invoke(){return ({}) instanceof Receiver}`},
		{"aliased Proxy lhs", `const value=new Proxy({},{getPrototypeOf(){window.name;return null}});export function invoke(){return value instanceof WeakMap}`},
	} {
		t.Run(row.name, func(t *testing.T) {
			withHasInstanceSource(t, row.source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
				consumer := installationFactIndex(t, facts, q.effectOwner)
				work := newCallableEffectWork(facts)
				if !work.stageHasInstance(facts, consumer, operation, q.executable) {
					t.Fatal("original pending operator not registered")
				}
				work.prepareOperationUses(facts, q.executable)
				key := sourceStagedOperationKey{declaration: q.effectOwner, operation: operation, kind: relativeDemandEffects}
				root := work.operationRecipes[key]
				id := work.operationIDs[key]
				if root.hasInstance == nil || work.closedOperationDependencies()[id.index] {
					t.Fatal("unrepresented input/protocol became covered")
				}
				for _, recipe := range facts[consumer].staged.operationRecipes {
					if recipe.hasInstance != nil && recipe.key.operation == operation {
						if len(recipe.delta.residuals) != 0 {
							t.Fatal("compiler-pending input became runtime unknown")
						}
						for _, effect := range recipe.delta.effects {
							if effect.Environment == "unknown" {
								t.Fatal("opaque result became source runtime terminal")
							}
						}
					}
				}
			})
		})
	}
}

func TestStagedHasInstanceReturnedMethodOriginalAssociation(t *testing.T) {
	const source = `class Receiver{static get [Symbol.hasInstance](){return (_value:unknown)=>true}}export function invoke(){return (({}) instanceof Receiver)||(({}) instanceof Receiver)}`
	withHasInstanceSource(t, source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
		consumer := installationFactIndex(t, facts, q.effectOwner)
		work := newCallableEffectWork(facts)
		if !work.stageHasInstance(facts, consumer, operation, q.executable) {
			t.Fatal("original operator not issued")
		}
		work.prepareOperationUses(facts, q.executable)
		id := work.operationIDs[sourceStagedOperationKey{declaration: q.effectOwner, operation: operation, kind: relativeDemandEffects}]
		state := work.operations[id.index].hasInstance
		if state == nil || len(state.returned) == 0 {
			t.Fatal("actual getter return source not retained")
		}
		for _, alternative := range state.returned {
			endpoint := alternative.endpoint
			if endpoint.creation != operation || endpoint.returning == nil || endpoint.producer == nil || !ast.IsGetAccessorDeclaration(endpoint.producer) || alternative.creating == nil || !alternative.creating.delivered || alternative.creating.request.operation != operation || alternative.creating.bound.cut != endpoint.cut {
				t.Fatal("getter creation/return association retargeted")
			}
			methodBound := false
			for _, inputs := range state.methods {
				methodBound = methodBound || inputs.delivered && inputs.request.operation == operation && inputs.request.declaration == endpoint.expression && inputs.bound.cut == endpoint.cut
			}
			if !methodBound {
				t.Fatal("returned method lacked its distinct original implicit B")
			}
		}
	})
}

func TestStagedHasInstanceInheritedSourceGet(t *testing.T) {
	const source = `const Receiver={get [Symbol.hasInstance](){window.name;return (_value:unknown)=>true}};export function invoke(){return (()=>document.title) instanceof Receiver}`
	withHasInstanceSource(t, source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
		consumer := installationFactIndex(t, facts, q.effectOwner)
		work := newCallableEffectWork(facts)
		if !work.stageHasInstance(facts, consumer, operation, q.executable) {
			t.Fatal("original inherited-source Get not adopted")
		}
		work.prepareOperationUses(facts, q.executable)
		root := work.operationRecipes[sourceStagedOperationKey{declaration: q.effectOwner, operation: operation, kind: relativeDemandEffects}].hasInstance.root
		get := work.operationRecipes[stagedHasInstanceRequest(root, "has-instance-get").producer]
		if !get.delta.extracted {
			t.Fatal("accounted conditional Get still requires normal output")
		}
		found := false
		for _, required := range get.delta.required {
			child := work.operationRecipes[required.producer]
			if child.hasInstance == nil || child.hasInstance.role != "lookup-prototype" {
				continue
			}
			found = true
			if !validStagedHasInstanceRecipe(child) || !stagedOrdinaryLiteralPrototype(child.hasInstance.lookup, child.hasInstance.standard) || len(child.delta.required) != 1 || work.operationRecipes[child.delta.required[0].producer].memberSource == nil {
				t.Fatal("inherited source omitted original member/prototype/open-source membership")
			}
			id := work.operationIDs[required.producer]
			if work.operations[id.index].hasInstance == nil || !work.operations[id.index].hasInstance.observed {
				t.Fatal("fresh original Get source disposition absent")
			}
			fresh := newCallableEffectWork(facts)
			fresh.operationGeneration = q.owner.generation
			fresh.indexOperationSources(facts)
			copyID, issued := fresh.requireOperation(facts, required)
			if !issued || fresh.closedOperationDependencies()[copyID.index] {
				t.Fatal("cloned premise replaced fresh original Get")
			}
		}
		if !found {
			t.Fatal("computed own getter bypassed inherited-source requirement")
		}
	})
}

func TestStagedHasInstanceExplicitPrototypeRemainsPending(t *testing.T) {
	const source = `const Receiver={__proto__:new Proxy({},{get(){window.name;return undefined}}),get [Symbol.hasInstance](){return (_value:unknown)=>true}};export function invoke(){return (()=>document.title) instanceof Receiver}`
	withHasInstanceSource(t, source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
		consumer := installationFactIndex(t, facts, q.effectOwner)
		work := newCallableEffectWork(facts)
		if !work.stageHasInstance(facts, consumer, operation, q.executable) {
			t.Fatal("original pending Get not registered")
		}
		work.prepareOperationUses(facts, q.executable)
		for _, recipe := range facts[consumer].staged.operationRecipes {
			if recipe.hasInstance != nil && recipe.key.operation == operation && recipe.hasInstance.role == "lookup-prototype" && recipe.delta.extracted {
				t.Fatal("explicit prototype/Proxy acquired default-link coverage")
			}
		}
	})
}

func TestStagedHasInstanceGetEffectsDoNotRequireReturnValue(t *testing.T) {
	const source = `const Receiver={get [Symbol.hasInstance]():((value:unknown)=>boolean){window.name;throw 'stop'}};export function invoke(){return (()=>document.title) instanceof Receiver}`
	withHasInstanceSource(t, source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
		consumer := installationFactIndex(t, facts, q.effectOwner)
		work := newCallableEffectWork(facts)
		if !work.stageHasInstance(facts, consumer, operation, q.executable) {
			t.Fatal("original getter operation not issued")
		}
		work.prepareOperationUses(facts, q.executable)
		root := work.operationRecipes[sourceStagedOperationKey{declaration: q.effectOwner, operation: operation, kind: relativeDemandEffects}].hasInstance.root
		get := work.operationRecipes[stagedHasInstanceRequest(root, "has-instance-get").producer]
		if !get.delta.extracted {
			t.Fatal("Get Effects waited for normal return/output")
		}
		algorithm := work.operationRecipes[stagedHasInstanceRequest(root, "algorithm").producer]
		if algorithm.delta.extracted {
			t.Fatal("missing method result became normal/completion authority")
		}
	})
}

// The original checker-owned protocol key does not turn an authored unique
// symbol annotation into a delivered key value. Default Effects need their own
// actual class Get and immediate function-creation contributions.
func TestStagedHasInstanceTypedKeyRetainsAlternateProtocol(t *testing.T) {
	for _, source := range []string{
		`declare const key:typeof Symbol.hasInstance;class Receiver{static [key](_value:unknown){window.name;return true}}export function invoke(){return (()=>document.title) instanceof Receiver}`,
		`declare const name:'hasInstance';class Receiver{static [Symbol[name]](_value:unknown){window.name;return true}}export function invoke(){return (()=>document.title) instanceof Receiver}`,
	} {
		withHasInstanceSource(t, source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
			consumer := installationFactIndex(t, facts, q.effectOwner)
			work := newCallableEffectWork(facts)
			if !work.stageHasInstance(facts, consumer, operation, q.executable) {
				t.Fatal("conditional original key source omitted")
			}
			work.prepareOperationUses(facts, q.executable)
			root := work.operationRecipes[sourceStagedOperationKey{declaration: q.effectOwner, operation: operation, kind: relativeDemandEffects}].hasInstance.root
			known := false
			for _, call := range facts[consumer].staged.calls {
				known = known || call.invocation.operation == operation && call.inputs != nil && call.inputs.delivered
			}
			if !known {
				t.Fatal("conditional method body/B prefix dropped")
			}
			if !work.operationRecipes[stagedHasInstanceRequest(root, "algorithm").producer].delta.extracted {
				t.Fatal("conditional body Effects demanded exclusive key selection")
			}
			prototype := stagedHasInstanceRequest(root, "prototype")
			state := &work.operations[work.operationIDs[prototype.producer].index]
			if !work.operationRecipes[prototype.producer].delta.extracted || state.hasInstance == nil || !validStagedHasInstanceDefault(state.hasInstance.defaultProof, root, q.owner.generation) {
				t.Fatal("conditional default Effects lost original creation/Get contributions")
			}
			if len(work.operationRecipes[prototype.producer].delta.required) == 0 || len(work.operationRecipes[prototype.producer].delta.exposures) != 0 {
				t.Fatal("default Effects replaced source dependencies or delivered key identity")
			}

		})
	}
}
