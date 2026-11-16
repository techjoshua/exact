package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// ECMA-262 Object.freeze delegates to SetIntegrityLevel, whose internal methods
// may run Proxy traps. Lack of a direct Call of the argument is neither absence
// of user entry nor permission to erase a trap's own invocation of that value.
// https://tc39.es/ecma262/#sec-object.freeze
// https://tc39.es/ecma262/#sec-setintegritylevel
func TestStagedFreezeInputInvocationSemanticSessionAndArtifacts(t *testing.T) {
	const source = `function callback(){navigator.userAgent}
export function quiet(){return Object.freeze(callback)}
export function trapping(){const proxy=new Proxy(callback,{preventExtensions(target){document.title;return Reflect.preventExtensions(target)}});return Object.freeze(proxy)}
export function throwing(){const proxy=new Proxy(callback,{preventExtensions(){window.name;throw new Error('freeze-trap')}});return Object.freeze(proxy)}
export function transitive(){const proxy=new Proxy(callback,{preventExtensions(target){document.title;callback();return Reflect.preventExtensions(target)}});return Object.freeze(proxy)}
function authored(value:()=>void){window.name;value();return value}
export function replacement(){return authored(callback)}
declare const choose:boolean;declare const external:(value:()=>void)=>unknown;
export function mixed(){const freeze=choose?Object.freeze:external;return freeze(callback)}`
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/freeze-direct-input.ts", Source: source, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatal(target, response.Error, response.Diagnostics)
		}
		for _, row := range []struct {
			name, required string
			callback       bool
		}{{"quiet", "", false}, {"trapping", "document", false}, {"throwing", "window", false}, {"transitive", "document", true}, {"replacement", "window", true}} {
			known, callback := row.required == "", false
			for _, effect := range executableSummary(t, response, row.name).EffectSources {
				known = known || effect.Environment == "browser" && effect.Description == row.required
				callback = callback || effect.Environment == "browser" && effect.Description == "navigator"
			}
			if !known || callback != row.callback {
				t.Fatal("direct input law lost trap/transitive effects or invoked dormant argument", row.name, executableSummary(t, response, row.name))
			}
		}
		unknown := false
		for _, effect := range executableSummary(t, response, "mixed").EffectSources {
			unknown = unknown || effect.Environment == "unknown"
		}
		if !unknown {
			t.Fatal("mixed native/unknown selection gained whole-call exclusion")
		}
		file := filepath.Join(t.TempDir(), "freeze-direct-input.mts")
		if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		const runner = `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';const events=[];globalThis.document={get title(){events.push('trap');return'trap'}};globalThis.window={get name(){events.push('window');return'window'}};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{get userAgent(){events.push('callback');return'callback'}}});globalThis.choose=true;globalThis.external=value=>{events.push('foreign');value();return value};const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(events,[]);const fn=m.quiet();assert.equal(typeof fn,'function');assert.equal(Object.isFrozen(fn),true);assert.deepEqual(events,[]);const p=m.trapping();assert.equal(Object.isFrozen(p),true);assert.deepEqual(events,['trap']);events.length=0;assert.throws(()=>m.throwing(),/freeze-trap/);assert.deepEqual(events,['window']);events.length=0;m.transitive();assert.deepEqual(events,['trap','callback']);events.length=0;assert.equal(m.replacement(),fn);assert.deepEqual(events,['window','callback']);events.length=0;assert.equal(m.mixed(),fn);assert.deepEqual(events,[]);globalThis.choose=false;assert.equal(m.mixed(),fn);assert.deepEqual(events,['foreign','callback']);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("%s direct/trap invocation or Throw: %v %s", target, err, output)
		}
	}
}

// Original algorithm admission is a pending description. Only the later complete
// callee Get observes the local law; the whole Freeze and every Get premise stay
// required independently of argument shape, effects or normal completion.
func TestStagedFreezeInputInvocationOriginalSource(t *testing.T) {
	for _, row := range []struct {
		name, prefix, input string
		pending             bool
	}{
		{"literal", "", `{callback(){navigator.userAgent}}`, false},
		{"callable", `function callback(){navigator.userAgent}`, `callback`, false},
		{"unavailable input", `declare const input:object;`, `input`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := row.prefix + `export function invoke(){return Object.freeze(` + row.input + `)}`
			withReflectiveRelevanceSource(t, source, func(owner *executableBodyOwner, file *ast.SourceFile) {
				var call *ast.Node
				walkNode(file.AsNode(), func(node *ast.Node) bool {
					if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && node.Expression().Name().Text() == "freeze" {
						call = node
					}
					return true
				})
				if call == nil {
					t.Fatal("original Freeze missing")
				}
				facts := stagedReturnSourceFacts(file)
				work := registerCallableEffectWork(facts)
				restore := registerWriterInputFacts(owner, facts)
				defer restore()
				caller := work.memberNodes[enclosingCallableNode(call)]
				request, ok := sourceStagedOccurrenceRequest(&facts[caller], call, relativeDemandEffects, "freeze-input-law")
				if !ok {
					t.Fatal("original request unavailable")
				}
				query := newSourceDependencyQuery(call, owner.checker, owner, facts[caller].node)
				occurrence := &sourceStagedNativeOccurrence{}
				admissions := 0
				revoke, installed := query.beginStagedNativeGetSource(&work, facts, sourceStagedNativeRequest{algorithmKind: sourceNativeObjectFreeze, call: call, get: call.Expression(), request: request, occurrence: occurrence}, func(selection sourceStagedNativeSelection, _ func(sourceStagedNativeDescriptorPlan) bool) {
					admissions++
					source := work.operationRecipes[request.producer].nativeGet
					role := nativeInputInvocationRequest(source)
					recipe := work.operationRecipes[role.producer]
					if !validNativeInputInvocationRecipe(recipe) || recipe.delta.extracted || work.nativeInputInvocationCurrent(recipe) {
						t.Fatal("algorithm admission supplied completed Get authority")
					}
					copied := *query
					if _, accepted := work.admitStagedNativeInputInvocation(facts, &copied, source, &selection); accepted {
						t.Fatal("copied issuer gained algorithm authority")
					}
					if _, accepted := work.admitStagedNativeInputInvocation(facts, query, source, &selection); accepted {
						t.Fatal("copied selection envelope gained original event authority")
					}
				})
				if !installed {
					t.Fatal("original native Get loan unavailable")
				}
				defer revoke()
				borrow := query.stagedNativeGet
				query.receiverCandidates(call, nil)
				if admissions != 1 || occurrence.source == nil {
					t.Fatal("original selected algorithm event absent", admissions)
				}
				source := occurrence.source
				role := nativeInputInvocationRequest(source)
				recipe := work.operationRecipes[role.producer]
				if !work.nativeInputInvocationCurrent(recipe) {
					t.Fatal("original complete callee event not observed")
				}
				proof := recipe.nativeGet.inputInvocation
				if proof.input.expression != restrictedInvocationArguments(call.AsCallExpression())[0] || proof.input.producer != call || proof.input.cut != request.cut || proof.cut != (sourceRelativeCut{operation: call, reading: call, initializing: call}) {
					t.Fatal("input source or physical observation cut changed")
				}
				for _, expected := range nativeInputInvocationRequirements(recipe.nativeGet) {
					found := false
					for _, actual := range recipe.delta.required {
						found = found || sameOperationRequest(expected, actual)
					}
					if !found {
						t.Fatal("local method law lost full original Effects prerequisite", expected.producer.selector.field)
					}
				}
				if len(work.operationIDs) != 0 || len(facts[caller].staged.operationUses) != 0 || len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.effects)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 {
					t.Fatal("source law activated a Call or supplied output/effects")
				}
				if row.pending {
					// A late semantic consumer can receive the actual local law
					// while the same required full Call still lacks input Effects.
					id, required := work.requireOperation(facts, role)
					if !required {
						t.Fatal("current source disposition could not register late requirement")
					}
					work.prepareOperationUses(facts, owner)
					state := &work.operations[id.index]
					root := work.operationIDs[source.request.producer]
					closed := work.closedOperationDependencies()
					if state.revision == 0 || !state.delta.extracted || root.index == 0 || closed[root.index] || closed[id.index] {
						t.Fatal("local delivery required whole-Call closure or paid unavailable input Effects", state.revision, state.delta.extracted)
					}
				}
				generation := work.operationGeneration
				work.operationGeneration = new(projectGeneration)
				if work.nativeInputInvocationCurrent(recipe) {
					t.Fatal("old generation observation remained current")
				}
				work.operationGeneration = generation
				bad := recipe
				copySource, copyProof := *recipe.nativeGet, *proof
				copyProof.cut.use = call // A logical request cut cannot replace the function's physical Get cut.
				copySource.inputInvocation, bad.nativeGet = &copyProof, &copySource
				if work.nativeInputInvocationCurrent(bad) {
					t.Fatal("changed original physical cut remained current")
				}
				cloned := make([]callableFacts, len(facts))
				for i := range facts {
					cloned[i] = cloneProjectCallableFact(facts[i])
				}
				fresh := registerCallableEffectWork(cloned)
				fresh.operationGeneration = generation
				if fresh.nativeInputInvocationCurrent(fresh.operationRecipes[role.producer]) {
					t.Fatal("cloned description inherited actual Get observation")
				}
				revoke()
				if borrow.inputSelection != nil || borrow.inputInvocation != nil || borrow.observedGet != nil || borrow.observedCallee != nil {
					t.Fatal("revocation retained original event pointers")
				}
				restoreClone := registerWriterInputFacts(owner, cloned)
				defer restoreClone()
				freshQuery := newSourceDependencyQuery(call, owner.checker, owner, facts[caller].node)
				freshRevoke, installed := freshQuery.beginStagedNativeGetSource(&fresh, cloned, sourceStagedNativeRequest{algorithmKind: sourceNativeObjectFreeze, call: call, get: call.Expression(), request: request, occurrence: &sourceStagedNativeOccurrence{}}, func(sourceStagedNativeSelection, func(sourceStagedNativeDescriptorPlan) bool) {})
				if !installed {
					t.Fatal("fresh original Get source could not reissue")
				}
				defer freshRevoke()
				freshQuery.receiverCandidates(call, nil)
				if !fresh.nativeInputInvocationCurrent(fresh.operationRecipes[role.producer]) {
					t.Fatal("fresh actual callee Get failed to renew cloned description")
				}
			})
		})
	}
}

// A familiar method name or one genuine native MAY cannot issue a whole-call
// disposition. Other builtin algorithms keep their independent contracts.
func TestStagedFreezeInputInvocationRequiresOriginalSelection(t *testing.T) {
	for _, source := range []string{
		`const owner={freeze(value:object){window.name;return value}};export function invoke(){return owner.freeze({})}`,
		`declare const choose:boolean;declare const foreign:(value:object)=>object;const owner={freeze:choose?Object.freeze:foreign};export function invoke(){return owner.freeze({})}`,
		`export function invoke(){return Object.create(null)}`,
	} {
		withReflectiveRelevanceSource(t, source, func(owner *executableBodyOwner, file *ast.SourceFile) {
			var call *ast.Node
			walkNode(file.AsNode(), func(node *ast.Node) bool {
				if ast.IsCallExpression(node) && enclosingCallableNode(node) != nil && enclosingCallableNode(node).Name() != nil && enclosingCallableNode(node).Name().Text() == "invoke" {
					call = node
				}
				return true
			})
			facts := stagedReturnSourceFacts(file)
			work := registerCallableEffectWork(facts)
			restore := registerWriterInputFacts(owner, facts)
			defer restore()
			caller := work.memberNodes[enclosingCallableNode(call)]
			request, ok := sourceStagedOccurrenceRequest(&facts[caller], call, relativeDemandEffects, "freeze-input-selection")
			if !ok {
				t.Fatal("original request unavailable")
			}
			query := newSourceDependencyQuery(call, owner.checker, owner, facts[caller].node)
			revoke, installed := query.beginStagedNativeGetSource(&work, facts, sourceStagedNativeRequest{call: call, get: call.Expression(), request: request, occurrence: &sourceStagedNativeOccurrence{}}, func(sourceStagedNativeSelection, func(sourceStagedNativeDescriptorPlan) bool) {})
			if !installed {
				t.Fatal("original source interval unavailable")
			}
			defer revoke()
			query.receiverCandidates(call, nil)
			for _, recipe := range work.operationRecipes {
				if recipe.nativeGet != nil && recipe.nativeGet.inputInvocation != nil && work.nativeInputInvocationCurrent(recipe) {
					t.Fatal("non-Freeze/authored/mixed selection gained complete input law")
				}
			}
		})
	}
}
