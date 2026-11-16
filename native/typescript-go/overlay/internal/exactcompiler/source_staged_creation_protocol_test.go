package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Original creation/key/Get contributions must reach an adopted member source
// parent. This source-only journey does not execute stored methods or getters.
func TestStagedCreationProtocolMemberDelivery(t *testing.T) {
	for _, row := range []struct {
		name, source string
		class        bool
	}{
		{"class", `class Receiver{static [Symbol.hasInstance](_value:unknown){window.name;return true}}export function invoke(){return Object.freeze({})}`, true},
		{"getter literal", `const Receiver={get [Symbol.hasInstance](){window.name;return ()=>document.title}};export function invoke(){return Object.freeze({})}`, false},
		{"descriptor map", `const descriptors={[Symbol.hasInstance]:{value:()=>document.title}};export function invoke(){return Object.freeze({})}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withStagedCreationProtocolMember(t, row.source, func(work *callableEffectWork, facts []callableFacts, sources []sourceStagedOperationRequest) {
				closed := work.closedOperationDependencies()
				for _, source := range sources {
					if !closed[work.operationIDs[source.producer].index] {
						t.Fatal("original member source parent did not consume creation/key/Get producers", source.edge)
					}
				}
				class, computed, get := false, false, false
				for _, recipe := range work.operationRecipes {
					source := recipe.memberSource
					if source == nil || !source.candidate.protocol {
						continue
					}
					node := source.candidate.operation
					isClass := ast.IsClassDeclaration(node) || ast.IsClassExpression(node)
					isComputed := ast.IsComputedPropertyName(node)
					isGet := ast.IsPropertyAccessExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "Symbol" && node.Name().Text() == "hasInstance"
					if !isClass && !isComputed && !isGet {
						continue
					}
					class, computed, get = class || isClass, computed || isComputed, get || isGet
					semanticRoot := recipe.key.selector == (sourceStagedOperationSelector{})
					if !recipe.delta.extracted || !validOperationEnvelope(recipe) || len(recipe.delta.required) == 0 {
						t.Fatal("original creation/key/Get contribution has no required semantic producer", node.Kind)
					}
					if !semanticRoot && (source.protocolSource == nil || len(recipe.delta.required) != 1 || !validStagedMemberProtocolRecipe(recipe)) {
						t.Fatal("indexed source adapter did not retain exactly one original semantic root", node.Kind)
					}
					for _, child := range recipe.delta.required {
						if child.producer.kind != relativeDemandEffects || child.inputs != nil || child.consumer != child.producer.declaration || child.cut.operation != child.producer.operation || child.cut.reading != child.producer.operation {
							t.Fatal("source Effects child became a value or retargeted demand")
						}
						id, issued := work.operationIDs[child.producer]
						if !issued || !closed[id.index] {
							t.Fatal("locally admitted source prefix paid an unclosed original child")
						}
					}
				}
				if class != row.class || !computed || !get {
					t.Fatalf("source population omitted original creation/key/Get: class=%v computed=%v Get=%v", class, computed, get)
				}
				for _, fact := range facts {
					if fact.summary.Name != "invoke" {
						continue
					}
					for _, effect := range fact.summary.DirectEffectSources {
						if effect.Environment == "browser" || effect.Environment == "unknown" {
							t.Fatal("passive source contribution executed a stored body", effect)
						}
					}
				}
			})
		})
	}
}

// The original static initializer Call is represented by its own explicit
// external-declaration source owner. Its unknown module effect is not a reason
// to leave source discovery pending or to activate the stored class method.
func TestStagedCreationProtocolRepresentedStaticEager(t *testing.T) {
	const source = `declare function foreign():void;class Receiver{static eager=foreign();static [Symbol.hasInstance](_value:unknown){document.title;return true}}export function invoke(){return Object.freeze({})}`
	withStagedCreationProtocolMember(t, source, func(work *callableEffectWork, facts []callableFacts, sources []sourceStagedOperationRequest) {
		closed := work.closedOperationDependencies()
		for _, source := range sources {
			if !closed[work.operationIDs[source.producer].index] {
				t.Fatal("represented static initializer kept source parent pending")
			}
		}
		foreign := false
		for _, recipe := range work.operationRecipes {
			source := recipe.memberSource
			if source == nil || !source.candidate.protocol || recipe.key.selector == (sourceStagedOperationSelector{}) {
				continue
			}
			operation := source.candidate.operation
			if !ast.IsCallExpression(operation) || !ast.IsIdentifier(operation.Expression()) || operation.Expression().Text() != "foreign" {
				continue
			}
			if source.protocolSource == nil || !recipe.delta.extracted || len(recipe.delta.required) != 1 {
				t.Fatal("static initializer lost its exact original Call source child")
			}
			child := recipe.delta.required[0]
			id, issued := work.operationIDs[child.producer]
			if child.producer.operation != operation || child.producer.selector != (sourceStagedOperationSelector{}) || child.producer.kind != relativeDemandEffects || child.inputs != nil || !issued || !closed[id.index] {
				t.Fatal("static initializer was paid by another source occurrence")
			}
			foreign = true
		}
		unknown := false
		for _, fact := range facts {
			if runtimeModuleEvaluation(fact.node) {
				for _, effect := range fact.summary.EffectSources {
					unknown = unknown || effect.Environment == "unknown"
				}
			}
			for _, call := range fact.staged.calls {
				if call.invocation.declaration != nil && ast.IsMethodDeclaration(call.invocation.declaration) {
					t.Fatal("static initializer source delivery invoked stored method")
				}
			}
			if fact.summary.Name == "invoke" {
				for _, effect := range fact.summary.DirectEffectSources {
					if effect.Environment == "browser" {
						t.Fatal("static initializer source delivery invoked dormant document body")
					}
				}
			}
		}
		if !foreign || !unknown {
			t.Fatal("represented eager Call lost original source child or module unknown donor")
		}
	})
}

// Each unsupported source protocol retains its actual source-set debt. A type
// annotation or a known sibling cannot turn that debt into an intrinsic law.
func TestStagedCreationProtocolUnsupportedSources(t *testing.T) {
	for _, row := range []struct{ name, source string }{
		{"heritage", `declare function base():new()=>object;class Receiver extends base(){static [Symbol.hasInstance](_value:unknown){return true}}export function invoke(){return Object.freeze({})}`},
		{"decorator", `declare function decorate<T extends new(...args:any[])=>object>(value:T,context:ClassDecoratorContext<T>):T;@decorate class Receiver{static [Symbol.hasInstance](_value:unknown){return true}}export function invoke(){return Object.freeze({})}`},
		{"coercion", `declare function foreign():void;const key={toString(){window.name;foreign();return 'key'}};const descriptors={[key as unknown as symbol]:{value:()=>document.title}};export function invoke(){return Object.freeze({})}`},
		{"shadow Symbol", `const Symbol={hasInstance:'key'};const descriptors={[Symbol.hasInstance]:{value:()=>document.title}};export function invoke(){return Object.freeze({})}`},
		{"typed fake Symbol", `declare const fake:SymbolConstructor;const descriptors={[fake.hasInstance]:{value:()=>document.title}};export function invoke(){return Object.freeze({})}`},
		{"overwritten standard", `Object.defineProperty(Symbol,'hasInstance',{value:Symbol('replacement')});class Receiver{static [Symbol.hasInstance](_value:unknown){return true}}export function invoke(){return Object.freeze({})}`},
		{"replaced Symbol root", `const replacement={hasInstance:{toString(){window.name;return 'key'}}} as unknown as SymbolConstructor;Symbol=replacement;const descriptors={[Symbol.hasInstance]:{value:()=>document.title}};export function invoke(){return Object.freeze({})}`},
		{"replaced global Symbol root", `const replacement={hasInstance:{toString(){window.name;return 'key'}}} as unknown as SymbolConstructor;globalThis.Symbol=replacement;const descriptors={[Symbol.hasInstance]:{value:()=>document.title}};export function invoke(){return Object.freeze({})}`},
	} {
		t.Run(row.name, func(t *testing.T) {
			withStagedCreationProtocolMember(t, row.source, func(work *callableEffectWork, facts []callableFacts, sources []sourceStagedOperationRequest) {
				closed := work.closedOperationDependencies()
				pending := false
				for _, source := range sources {
					id := work.operationIDs[source.producer]
					state := &work.operations[id.index]
					if len(state.dependencies) == 0 {
						t.Fatal("unsupported source protocol lost its original child requirements")
					}
					pending = pending || !closed[id.index]
				}
				if !pending {
					t.Fatal("unsupported source creation/coercion/entry was silently covered")
				}
				if row.name == "coercion" {
					browser, unknown := false, false
					for _, fact := range facts {
						if fact.summary.Name != "toString" {
							continue
						}
						for _, effect := range fact.summary.EffectSources {
							browser = browser || effect.Environment == "browser"
							unknown = unknown || effect.Environment == "unknown"
						}
					}
					if !browser || !unknown {
						t.Fatal("original coercion body lost known browser or explicit foreign unknown prefix")
					}
				}
			})
		})
	}
}

// Reuse the actual native-reader/member adoption protocol. Cached facts retain
// their issued identities, then the fresh original Get lends its source sets.
func withStagedCreationProtocolMember(t *testing.T, source string, inspect func(*callableEffectWork, []callableFacts, []sourceStagedOperationRequest)) {
	t.Helper()
	withSourceCalleeWriteQueryStatus(t, source, func(q *sourceValueQuery, call *ast.Node) {
		var facts []callableFacts
		for _, analysis := range q.executable.project.callableCache.bySource {
			for _, fact := range analysis.facts {
				facts = append(facts, cloneProjectCallableFact(fact))
			}
		}
		work := newCallableEffectWork(facts)
		work.operationGeneration = q.owner.generation
		work.indexOperationSources(facts)
		var request sourceStagedNativeRequest
		for _, recipe := range work.operationRecipes {
			if recipe.nativeGet != nil && recipe.nativeGet.request.producer.operation == call {
				source := recipe.nativeGet
				request = sourceStagedNativeRequest{call: call, get: source.get, request: source.request, algorithmKind: source.kind}
				break
			}
		}
		revoke, installed := q.beginStagedNativeGetSource(&work, facts, request)
		if !installed {
			t.Fatal("original native reader source loan missing")
		}
		q.receiverCandidates(call, nil)
		sources := append([]sourceStagedOperationRequest(nil), q.stagedNativeGet.memberSources...)
		revoke()
		if len(sources) == 0 {
			t.Fatal("original reader source population absent")
		}
		for _, source := range sources {
			if !work.registerOperationUse(facts, sourceStagedOperationUse{request: source}) {
				t.Fatal("actual member source subscriber refused")
			}
		}
		work.prepareOperationUses(facts, q.executable)
		inspect(&work, facts, sources)
	}, true)
}
