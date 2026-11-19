package exactcompiler

import (
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// This is the unchanged module row in NativeInputBindingSession. The source
// control inspects original events while their program/generation is active;
// the public Session row separately owns closure and emitted Node acceptance.
const nativeWriterInertModuleSource = `const value=Object.defineProperties({}, {x:{value:1}});const frozen=Object.freeze(value);export function invoke(){return frozen}`

func TestStagedNativeWriterInertModuleCapability(t *testing.T) {
	if !t.Run("original-named-module-positive", func(t *testing.T) {
		f := newExecutableFixture(t, map[string]string{"entry.ts": nativeWriterInertModuleSource})
		request := f.request("analyze", "entry.ts")

		withActiveModuleSourceWork(t, request, nativeWriter679FixtureSources(f), nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
			var source, rawSource *sourceStagedNativeGetSource
			var freeze *ast.Node
			for _, recipe := range work.operationRecipes {
				if recipe.nativeGet == nil || recipe.key != recipe.nativeGet.request.producer {
					continue
				}
				if recipe.nativeGet.kind == sourceNativeObjectFreeze {
					freeze = recipe.nativeGet.request.use
				}
				if recipe.nativeGet.kind != sourceNativeObjectDefineProperties {
					continue
				}
				rawSource = recipe.nativeGet
				current := work.nativeWriterSource(recipe.nativeGet.request)
				if current != nil {
					if source != nil && !sameOperationRequest(current.request, source.request) {
						t.Fatal("ambiguous original named module writer")
					}
					source = current
				}
			}
			t.Logf("source checkpoint rawDefine=%p canonical=%p Freeze=%p epoch=%p generation=%p", rawSource, source, freeze, work.operationEpoch, work.operationGeneration)
			if rawSource != nil {
				t.Logf("original DefineProperties request=%+v get=%p method=%p", rawSource.request, rawSource.get, rawSource.method)
			}
			if source == nil || freeze == nil || !ast.IsPropertyAccessExpression(freeze.Expression()) {
				t.Fatal("original module native source/Freeze UNREACHED")
			}
			eager := work.operationRecipes[nativeRootDebtRequest(source, "eager-inputs").producer].nativeGet
			t.Logf("eager source checkpoint source=%p", eager)
			if eager == nil {
				t.Fatal("original eager source absent; witness/construction/full capability UNREACHED")
			}
			inert := stagedMapInputsInert(eager)
			noAssociations := len(eager.keySources)+len(eager.moduleSources) == 0
			witnessCurrent := work.nativeEagerWitnessCurrent(eager)
			constructionCurrent := work.nativeWriterEagerCurrent(source)
			law, described := stagedEntryLawRequest(nativeRootDebtRequest(source, "algorithm"), stagedEntryLawNativeAlgorithm)
			receiptRequest, _ := nativeEagerReceiptRequest(source)
			receipt := work.entryLawReceipts[receiptRequest.producer]
			t.Logf("eager checkpoint inert=%t inputEffects=%t noKeyImports=%t witnessCurrent=%t constructionCurrent=%t sourceOwner=%p parentOwner=%p request=%+v", inert, eager.inputEffects, noAssociations, witnessCurrent, constructionCurrent, source.request.consumer, sourceStagedModuleOwner(freeze), eager.request)
			if receipt == nil || receipt.nativeEager == nil {
				t.Logf("original eager receipt=%p witness absent", receipt)
			} else {
				w := receipt.nativeEager
				t.Logf("original eager receipt=%p witness=%p selfIssuer=%p admitted=%t delivered=%t needsSourceAdmission=%t GetID=%+v epoch=%p proof=%+v required=%d observed=%d vector=%v evidence=%+v", receipt, w, w.issuer, w.admitted, w.delivered, w.needsSourceAdmission, w.get, w.epoch, w.proof, len(w.required), len(w.observed), w.vector, w.evidence)
			}
			if !inert || !eager.inputEffects || !noAssociations || !witnessCurrent || !constructionCurrent {
				t.Fatal("genuine inert module input/Get witness CURRENT positive UNREACHED; full capability/candidate/lifecycle UNREACHED")
			}
			wholeCurrent := described && work.nativeWriterCapabilitiesCurrent(source, law)
			t.Logf("whole checkpoint described=%t current=%t law=%+v", described, wholeCurrent, law)
			if !described || !wholeCurrent {
				t.Fatal("original module complete callee/descriptor/algorithm capability UNREACHED")
			}
			physicalRead := freeze.Expression().Expression()
			parentSource := work.operationRecipes[sourceStagedOperationKey{declaration: sourceStagedModuleOwner(freeze), operation: freeze, kind: relativeDemandEffects}].nativeGet
			if parentSource == nil {
				t.Fatal("original Freeze canonical parent factory absent")
			}
			observed, current := 0, 0
			for _, recipe := range work.operationRecipes {
				member := recipe.memberSource
				if member == nil || member.nativeWriter == nil || member.candidate.operation != source.request.use || member.parent.use != freeze || member.candidate.cut.operation != physicalRead || member.candidate.cut.reading != physicalRead {
					continue
				}
				observed++
				if member.nativeWriter.provenance != nativeWriterFreshTarget || member.candidate.cut != (sourceRelativeCut{operation: physicalRead, use: freeze, reading: physicalRead, initializing: freeze}) || !sameOperationRequest(member.parent, parentSource.request) {
					t.Fatal("original fresh-target event lost its exact module parent/full physical cut")
				}
				candidateCurrent := work.nativeWriterCapabilityCurrent(recipe)
				t.Logf("original cross-owner candidate key=%+v physicalCut=%+v payload=%+v current=%t", recipe.key, member.candidate.cut, member.nativeWriter, candidateCurrent)
				if candidateCurrent {
					current++
				}
			}
			t.Logf("candidate checkpoint writer=%p Freeze=%p physicalObjectRead=%p observed=%d current=%d", source.request.use, freeze, physicalRead, observed, current)
			if observed == 0 || current == 0 {
				t.Fatal("original earlier DefineProperties -> Freeze Object read event/candidate CURRENT UNREACHED", observed, current)
			}
			// Existing source controls begin from actual currency and exercise
			// wrong-cut/unobserved/clone refusal without installing any proof.
			assertNativeWriterFreshTargetLifecycle(t, work, facts, owner)
			assertOriginalNativeWriterCapability(t, work, facts, owner)
			t.Logf("original named module: genuine eager and whole CURRENT; exact writer/read payloads=%d current=%d", observed, current)
		}, activeModuleCompleteAnalysis)
	}) {
		return
	}
	if !t.Run("inherited-descriptor-getter", testNativeWriterInertInheritedGetter) {
		return
	}
	// Reuse the reviewed source fixtures verbatim. A refusal above the selected
	// event is explicitly UNREACHED, never coverage of a later capability guard.
	for _, row := range nativeWriterInertRefusalFixtures {
		if !row.forbidWhole {
			continue
		}
		if !t.Run(row.name, func(t *testing.T) {
			f := newExecutableFixture(t, map[string]string{"entry.ts": row.source})
			request := f.request("analyze", "entry.ts")

			if !nativeWriterInertPublicCompile(t, f, request) {
				return
			}
			withActiveModuleSourceWork(t, request, nativeWriter679FixtureSources(f), nil, func(_ []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
				assertNativeWriterInertRefusal(t, work, nativeWriterInertSelectedSource(t, work), owner)
			}, activeModuleCompleteAnalysis)
		}) {
			return
		}
	}
}

func nativeWriterInertSelectedSource(t *testing.T, work *callableEffectWork) *sourceStagedNativeGetSource {
	t.Helper()
	var source *sourceStagedNativeGetSource
	for _, recipe := range work.operationRecipes {
		selected := recipe.nativeGet
		if selected == nil || selected.kind != sourceNativeObjectDefineProperties || recipe.key != selected.request.producer {
			continue
		}
		if source != nil && !sameOperationRequest(source.request, selected.request) {
			t.Fatal("ambiguous original DefineProperties")
		}
		source = selected
	}
	return source
}

func testNativeWriterInertInheritedGetter(t *testing.T) {
	const insertion = "Object.defineProperty(Object.prototype,'enumerable',{configurable:true,get(){Symbol.for=key=>Symbol(key);return false;}});\n"
	source := insertion + nativeWriterInertModuleSource
	if strings.TrimPrefix(source, insertion) != nativeWriterInertModuleSource {
		t.Fatal("derived negative changed original named source")
	}
	f := newExecutableFixture(t, map[string]string{"entry.ts": source})
	request := f.request("analyze", "entry.ts")

	if !nativeWriterInertPublicCompile(t, f, request) {
		return
	}
	withActiveModuleSourceWork(t, request, nativeWriter679FixtureSources(f), nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		file := owner.values.program.GetSourceFile(request.ID)
		var call, getter *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && node.Expression().Name().Text() == "defineProperties" {
				call = node
			}
			if ast.IsMethodDeclaration(node) && node.Name() != nil && callableNameText(node.Name()) == "get" && strings.Contains(sourceText(file, node), "Symbol.for=key=>Symbol(key)") {
				getter = node
			}
			return true
		})
		if call == nil || getter == nil {
			t.Fatal("original inherited getter/DefineProperties source missing")
		}
		actuals := restrictedInvocationArguments(call.AsCallExpression())
		if len(actuals) != 2 || !sourceInertValueCreation(actuals[0]) || !sourceInertValueCreation(actuals[1]) {
			t.Fatal("inherited getter negative lost original inert argument construction")
		}
		selected := nativeWriterInertSelectedSource(t, work)
		if selected == nil {
			t.Log("inherited descriptor owner UNREACHED: no downstream field/capability coverage")
			return
		}
		assertNativeWriterInertRefusal(t, work, selected, owner)
		invocations := 0
		for i := 1; i < len(work.operations); i++ {
			state := &work.operations[i]
			if state.fieldDisposition == nil || state.key.operation != call {
				continue
			}
			for _, invoked := range state.fieldDisposition.invoked {
				if invoked.declaration != getter {
					continue
				}
				invocations++
				retained := false
				for _, requirement := range state.getters {
					consumer, known := work.memberNodes[requirement.demand.request.consumer]
					producer, bodyKnown := work.memberNodes[getter]
					if requirement.declaration == getter && known && bodyKnown && facts[producer].node == getter {
						dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, requirement.edge}]
						retained = retained || dependency != nil && dependency.producer == producer
					}
				}
				if !retained {
					t.Fatal("actual inherited getter lost its original authored mutation summary")
				}
			}
		}
		// Creation of {x:{value:1}} is inert even though inherited descriptor
		// Has/Get may invoke an authored getter. No field/NoUser result is made
		// from that syntax, and fail-closed upstream is not downstream coverage.
		t.Logf("original map construction inert; whole capability refused; actual inherited getter field invocations=%d (zero means downstream UNREACHED)", invocations)
	}, activeModuleCompleteAnalysis)
}

// nativeWriterInertPublicCompile uses the production Session boundary: only
// its owned replacement gap is recovered there; unrelated panics still escape.
// An error-only coverage refusal proves public fail-closed behavior, not that any
// downstream capability guard ran. Public success leaves the active-owner checks
// mandatory and does not lend this Session's cached graph to those checks.
func nativeWriterInertPublicCompile(t *testing.T, f *executableFixture, request Request) bool {
	t.Helper()
	compile := request
	compile.Kind = "compile"
	compile.Target = TargetClient
	response := f.session.Execute(compile)
	t.Logf("public negative preflight target=%s Error=%q diagnostics=%+v CodeBytes=%d", compile.Target, response.Error, response.Diagnostics, len(response.Code))
	if len(response.Diagnostics) != 0 {
		t.Fatal("negative fixture public compilation produced diagnostics", response.Diagnostics)
	}
	if response.Error != "" {
		if response.Code != "" || !strings.HasPrefix(response.Error, "Compiler analysis coverage gap:") {
			t.Fatal("negative fixture failed outside the error-only coverage-refusal contract", response.Error, len(response.Code))
		}
		t.Log("public fail-closed coverage refusal; active-source and downstream current-law guards UNREACHED")
		return false
	}
	if response.Code == "" {
		t.Fatal("public compile succeeded without an artifact")
	}
	t.Log("public compile succeeded; fresh active-owner capability/dormancy checks remain mandatory")
	return true
}

// These independent refusal fixtures retain their original source bytes.
// Normal Session refusal is upstream-only evidence; successful public entry
// still requires the original active source owner below.
type nativeWriterInertRefusalFixture struct {
	name, source, contract string
	forbidWhole            bool
}

var nativeWriterInertRefusalFixtures = []nativeWriterInertRefusalFixture{
	{"descriptor-getter-mutations", "export const events:string[]=[];\nconst value=Object.defineProperties({}, {x:{get value(){events.push('descriptor-get');Symbol.for=key=>Symbol(key);Object.defineProperty(Object.prototype,'phaseProbe',{value:1,configurable:true});return 1;}}});\nexport const frozen=Object.freeze(value);", "Descriptor value Get can enter authored code and mutate Symbol/Object.prototype; direct-target disjointness cannot pay whole capability.", true},
	{"computed-key-user-coercion", "export const events:string[]=[];\nconst key={ [Symbol.toPrimitive](){events.push('key-coercion');Object.defineProperty(Object.prototype,'phaseProbe',{value:1,configurable:true});return 'x';}};\nconst value=Object.defineProperties({}, {[`${key}`]:{value:1}});\nexport const frozen=Object.freeze(value);", "Computed key template coercion is eager authored entry before native call; no early target/callee event may erase it.", true},
	{"mixed-native-authored-unknown-callee", "declare const choice:number;declare const unknownDefine:typeof Object.defineProperties;\nfunction authored<T>(target:T,_descriptors:PropertyDescriptorMap):T{Object.defineProperty(Object.prototype,'phaseProbe',{value:1,configurable:true});return target;}\nconst define:typeof Object.defineProperties=choice===0?Object.defineProperties:choice===1?authored:unknownDefine;\nconst value=define({}, {x:{value:1}});export const frozen=Object.freeze(value);", "One selected native MAY alternative cannot certify authored and unknown callee alternatives; no name/type selection authority.", true},
	{"proxy-target", "export const events:string[]=[];\nconst target=new Proxy({}, {defineProperty(object,key,descriptor){events.push('define-trap');return Reflect.defineProperty(object,key,descriptor);},preventExtensions(object){events.push('prevent-trap');return Reflect.preventExtensions(object);}});\nconst value=Object.defineProperties(target,{x:{value:1}});export const frozen=Object.freeze(value);", "Proxy DefineOwnProperty/PreventExtensions enter traps despite complete original callee/Get and descriptor data.", true},
	{"known-beside-unresolved-entry", "declare const other:PropertyDescriptor;\nconst value=Object.defineProperties({}, {known:{value:1},other});export const frozen=Object.freeze(value);", "Known first map entry must not complete unknown other entry Has/Get/conversion/hidden-entry obligations.", true},
}

type nativeWriterInertRefusalReach struct {
	selected, currentGet, eager, algorithmDescription, wholeCurrent bool
}

func assertNativeWriterInertRefusal(t *testing.T, work *callableEffectWork, source *sourceStagedNativeGetSource, owner *executableBodyOwner) nativeWriterInertRefusalReach {
	t.Helper()
	result := nativeWriterInertRefusalReach{selected: source != nil}
	if work == nil || owner == nil || owner.project == nil || owner.values == nil || owner.project.activeGeneration != owner.values.generation {
		t.Fatal("negative control requires the original active module owner")
	}
	if source == nil {
		t.Log("selected native source UNREACHED; no downstream coverage")
		return result
	}
	if work.operationGeneration != owner.values.generation {
		t.Fatal("selected source lost its actual current graph generation")
	}
	result.currentGet = work.currentNativeCalleeEffects(source) != nil
	result.eager = work.nativeWriterEagerCurrent(source)
	law, described := stagedEntryLawRequest(nativeRootDebtRequest(source, "algorithm"), stagedEntryLawNativeAlgorithm)
	if described {
		_, result.algorithmDescription = work.operationRecipes[law.producer]
	}
	// Do not invent a law, Get receipt, observed bit, subscriber or DATA result.
	// The pure consumer itself preserves its actual fail-closed short circuit.
	if described {
		result.wholeCurrent = work.nativeWriterCapabilitiesCurrent(source, law)
	}
	if result.wholeCurrent {
		t.Fatal("unsafe whole native writer capability issued", result)
	}
	t.Logf("negative guards evaluated: selected=%t Get=%t eager=%t algorithmDescription=%t whole=%t; downstream facts only count when owning event reached", result.selected, result.currentGet, result.eager, result.algorithmDescription, result.wholeCurrent)
	return result
}
