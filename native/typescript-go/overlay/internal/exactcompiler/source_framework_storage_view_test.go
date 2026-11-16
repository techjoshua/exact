package exactcompiler

import (
	"context"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// This uses the real declaration-only package selection and ordinary nested
// binder/default/creator route. It qualifies description transport only; the
// original strict Core collector and complete result membership remain gates.
func TestFrameworkStorageViewOriginalDefaultSource(t *testing.T) {
	const source = `/// <reference lib="dom" />
import {reactiveObjects} from '@exactjs/reactive/framework/objects';
 function createErrorContext(errors:object[]=[]){return createErrorContextWithLimit(errors)}
 function createErrorContextWithLimit(errors:object[]){return reactiveObjects(errors)}
 export function invoke(){return createErrorContext()}`
	withFrameworkViewProgram(t, source, func(owner *executableBodyOwner, generation *projectGeneration) {
		var start, inner, call, initial *ast.Node
		walkNode(generation.sourceFile.AsNode(), func(n *ast.Node) bool {
			if ast.IsArrayLiteralExpression(n) {
				initial = n
			}
			if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) {
				switch n.Expression().Text() {
				case "createErrorContext":
					start = n
				case "createErrorContextWithLimit":
					inner = n
				case "reactiveObjects":
					call = n
				}
			}
			return true
		})
		if start == nil || inner == nil || call == nil || initial == nil {
			t.Fatal("original source associations missing")
		}
		q := newSourceDependencyQuery(start, generation.checker, owner, enclosingCallableNode(start))
		reached := false
		q.projectSourceCallReturns(start, nil, sourceCallResultInterest{purpose: resultSourceProjection}, func(v sourceValue, bound sourceValueBindings) {
			if v.node != inner {
				t.Fatal("outer return changed")
			}
			q.projectSourceCallReturns(inner, bound, sourceCallResultInterest{purpose: resultSourceProjection}, func(v sourceValue, current sourceValueBindings) {
				if v.node != call || q.inputs == nil || q.inputs.invocation != inner || len(q.creators) == 0 || len(current) == 0 {
					t.Fatal("original default/input/creator chain absent")
				}
				views := 0
				invocationDebt := q.projectSourceCallReturnsWithViews(call, current, sourceCallResultInterest{purpose: resultSourceProjection},
					func(sourceValue, sourceValueBindings) {
						t.Fatal("framework view flattened into ordinary return source")
					},
					func(view sourceFrameworkStorageView, captures sourceValueBindings) {
						views++
						if len(captures) == 0 || q.inputs == nil || len(q.creators) == 0 {
							t.Fatal("actual consumer lost original input/creator interval")
						}
						input := view.input
						if view.inputGap != relativeInputsSupported || input.unknown || len(input.sources) != 1 || input.sources[0].expression != initial || input.sources[0].creation != start {
							t.Fatalf("actual empty default source missing: %+v", input)
						}
						if !stagedSourceDataValue(initial) || sourceInertValueCreation(initial) {
							t.Fatal("array source admission was confused with native inertness")
						}
						actual := restrictedInvocationArguments(call.AsCallExpression())[0]
						if view.call != call || view.argument != actual || view.generation != generation || view.cut != q.relativeInputCut(call) {
							t.Fatal("view lost original input source/cut")
						}
						before := cloneSourceRelativeBinding(input)
						projected := projectFrameworkStorageView(view, []string{"length"})
						if len(view.projection) != 0 || len(projected.projection) != 1 || projected.input.sources[0].expression != initial {
							t.Fatal("view projection flattened or borrowed source storage")
						}
						projected.input.sources[0].projection = append(projected.input.sources[0].projection, "mutated")
						if !reflect.DeepEqual(before, view.input) {
							t.Fatal("view borrowed mutable input description")
						}
						marker := accessorCandidates{}
						q.retainFrameworkView(view, nil, "", accessorAcquire, false, &marker)
						if len(marker.values) != 1 || marker.values[0].node != nil || marker.values[0].frameworkView == nil || !marker.valueIncomplete {
							t.Fatal("view transport promoted raw normal output")
						}
						binding, gap := describeRelativeBoundValues(marker.values, input.target, view.cut)
						if gap != relativeInputsSupported || len(binding.sources) != 1 || binding.sources[0].kind != relativeEndpointFrameworkView || binding.sources[0].expression != nil {
							t.Fatal("source binding discarded/flattened view marker")
						}
						badMarker := marker.values[0]
						badMarker.node = initial
						if _, gap := describeRelativeBoundValues([]sourceValue{badMarker}, input.target, view.cut); gap == relativeInputsSupported {
							t.Fatal("mixed raw/view carrier laundered into source binding")
						}
						stronger := accessorCandidates{}
						q.retainFrameworkView(view, nil, "length", accessorRead, false, &stronger)
						if !stronger.opaque || !stronger.valueIncomplete {
							t.Fatal("unimplemented strong member consumer borrowed ordinary array authority")
						}
						declarations := []*ast.Node{view.declaration}
						wrong := view.cut
						wrong.reading = initial
						if _, ok := describeReactiveObjectsStorageView(call, declarations, input, view.inputGap, wrong, owner); ok {
							t.Fatal("foreign input cut admitted")
						}
						if _, ok := describeReactiveObjectsStorageView(call, nil, input, view.inputGap, view.cut, owner); ok {
							t.Fatal("unresolved arm became a framework relation")
						}
						if _, ok := describeReactiveObjectsStorageView(call, append(declarations, view.declaration), input, view.inputGap, view.cut, owner); ok {
							t.Fatal("mixed declaration arms collapsed")
						}
					}, func() { t.Fatal("framework description invoked implementation recovery") })
				if views != 1 || !invocationDebt.valueIncomplete || !invocationDebt.opaque {
					t.Fatalf("view description paid ordinary acquisition/selection debt: views=%d incomplete=%t opaque=%t", views, invocationDebt.valueIncomplete, invocationDebt.opaque)
				}
				reached = true
			}, func() { t.Fatal("inner ordinary return relation unavailable") })
		}, func() { t.Fatal("outer default return relation unavailable") })
		if !reached {
			t.Fatal("real default/creator view description unreached")
		}
	})
}

func TestEmptyArrayDataOriginalBinding(t *testing.T) {
	const fixture = `function factory(){const stored:unknown[]=[];return stored}export function invoke(){return factory()}`
	withStagedReturnProgram(t, fixture, func(owner *executableBodyOwner, call *ast.Node) {
		source, ok := describeStagedInputSubstitution(call, enclosingCallableNode(call), owner)
		if !ok {
			t.Fatal("original input association unavailable")
		}
		association := sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: source.invocation, sourceInputs: source}
		plan, ok := describeStagedCallReturnSources(association, owner)
		if !ok {
			t.Fatal("original return association unavailable")
		}
		projected := describeStagedReturnBindings(plan, owner)
		if !projected.locallyRepresented || len(projected.branches) != 1 {
			t.Fatal("original lexical binding incomplete")
		}
		branch := projected.branches[0]
		if branch.pending || !stagedEmptyArrayDataConstruction(branch.endpoint.expression) || branch.endpoint.creation != call || branch.endpoint.returning == nil || branch.endpoint.producer == nil {
			t.Fatal("empty construction lost original producer/return/cut")
		}
	})
	for _, fixture := range []string{`const x=[1]`, `const x=[...foreign]`, `const x=[foreign()]`} {
		file := parseNormalizationSource("/virtual/g5-array-data-refuser.ts", fixture)
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsArrayLiteralExpression(n) && stagedEmptyArrayDataConstruction(n) {
				t.Fatal("unrepresented element/spread evaluation admitted")
			}
			return true
		})
	}
}

// withFrameworkViewProgram owns a genuine active generation until inspection
// returns. Resolver inputs are the retained real package fixture; this helper
// performs no Session fallback or post-release currentness inspection.
func withFrameworkViewProgram(t *testing.T, source string, inspect func(*executableBodyOwner, *projectGeneration), strict ...bool) {
	t.Helper()
	const root = "/home/techj/.t3/worktrees/exact/t3-5179cb70/.tmp/staged-analysis-first-slice/m08-fresh-runtime-provider-build/source/packages/core"

	id := filepath.Join(root, "src/component/g5-framework-view-control.ts")
	request := Request{Kind: "analyze", ID: id, Source: source, Root: root, ConfigFile: filepath.Join(root, "tsconfig.json"), Diagnostics: "semantic"}
	request.stagedReplacement = len(strict) != 0 && strict[0]
	project, ds, err := newProjectStateWithSources(request, id, map[string]string{id: source})
	if err != nil || len(ds) != 0 {
		t.Fatal(err, ds)
	}
	generation, err := project.advance(context.Background(), id, source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	if ds := generation.checker.GetDiagnostics(context.Background(), generation.sourceFile); len(ds) != 0 {
		t.Fatal(ds)
	}
	owner := newExecutableBodyOwner(project, generation.checker)
	restore := registerWriterInputFacts(owner, stagedReturnSourceFacts(generation.sourceFile))
	defer restore()
	inspect(owner, generation)
}

// A real original constructor Get discovers the earlier authored write target.
// Its framework-return reader is issued before the unchanged strict invocation
// fallback. The queue must retain DATA/Effects work, not certify an empty result.
func TestStagedFrameworkViewOriginalMemberReader(t *testing.T) {
	const source = `/// <reference lib="dom" />
import {reactiveObjects} from '@exactjs/reactive/framework/objects';
 function overwrite(){Object.defineProperty(reactiveObjects([]),'WeakMap',{value:()=>document.title})}
 export function invoke(){overwrite();return new WeakMap()}`
	withFrameworkViewProgram(t, source, func(owner *executableBodyOwner, generation *projectGeneration) {
		file := generation.sourceFile
		var original, viewCall *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsNewExpression(n) {
				original = n
			}
			if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "reactiveObjects" {
				viewCall = n
			}
			return true
		})
		if original == nil || viewCall == nil {
			t.Fatal("original Get/return source missing")
		}
		facts := stagedReturnSourceFacts(file)
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		work := newCallableEffectWork(facts)
		consumer := work.memberNodes[enclosingCallableNode(original)]
		root, registered := work.registerStagedConstructionEffects(facts, consumer, original, owner)
		if !registered {
			t.Fatal("genuine original constructor source refused")
		}
		request := stagedCallResultRequest(viewCall, enclosingCallableNode(viewCall))
		recipe, registered := work.operationRecipes[request.producer]
		if !registered || recipe.callResult == nil || recipe.callResult.frameworkView == nil || len(recipe.callResult.readings) == 0 || !validStagedFrameworkResultRecipe(recipe) {
			t.Fatal("strict original member fallback preceded framework DATA registration")
		}
		for _, reading := range recipe.callResult.readings {
			if _, ok := work.requireOperation(facts, reading); !ok {
				t.Fatal("original issued DATA reader refused")
			}
		}
		work.prepareOperationUses(facts, owner)
		// The actual source reader may issue before the original Effects producer.
		// Preserve both the explicit view prefix and the exact missing source work.
		recipe = work.operationRecipes[request.producer]
		if !recipe.delta.extracted || len(recipe.delta.exposures) != 1 || len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], stagedFrameworkEffectsRequest(viewCall, enclosingCallableNode(viewCall))) {
			t.Fatal("conditional source-domain membership or original Call Effects requirement missing")
		}
		endpoint := recipe.delta.exposures[0].endpoint
		if endpoint.kind != relativeEndpointFrameworkView || endpoint.expression != nil || endpoint.frameworkView == nil || endpoint.frameworkView.argument != restrictedInvocationArguments(viewCall.AsCallExpression())[0] {
			t.Fatal("view promoted to raw argument/native source")
		}
		dataID, adopted := work.operationIDs[request.producer]
		if !adopted || !work.closedOperationDependencies()[dataID.index] {
			t.Fatal("actual queued view DATA/input/Effects closure did not complete")
		}
		runtimeRows := 0
		for _, candidate := range work.operationRecipes {
			if candidate.memberSource == nil || candidate.memberSource.frameworkRead == nil {
				continue
			}
			if candidate.memberSource.candidate.origin != viewCall {
				continue
			}
			runtimeRows++
			if !validFrameworkViewMemberRecipe(candidate) || !candidate.memberSource.candidate.runtimeUnknown || len(candidate.delta.residuals) != 1 || len(candidate.delta.required) != 1 {
				t.Fatal("actual view reader lost runtime alternative or original DATA dependency")
			}
			reading := *candidate.memberSource.frameworkRead
			bad := candidate
			bad.memberSource = cloneStagedMemberSource(candidate.memberSource)
			badReading := reading
			badReading.cut.initializing = original
			bad.memberSource.frameworkRead = &badReading
			if validFrameworkViewMemberRecipe(bad) {
				t.Fatal("changed reader cut accepted framework runtime row")
			}
		}
		if runtimeRows == 0 {
			t.Fatal("original consumer did not receive ready view DATA/runtime alternative; later acceptance UNREACHED")
		}
		if work.operationRecipes[stagedConstructionRequest(root, "algorithm").producer].delta.extracted {
			t.Fatal("conditional view granted native constructor selection")
		}
		clone := cloneStagedCallResultSource(recipe.callResult)
		clone.frameworkView.input.sources[0].projection = append(clone.frameworkView.input.sources[0].projection, "changed")
		if len(recipe.callResult.frameworkView.input.sources[0].projection) != 0 {
			t.Fatal("cloned description borrowed original input slice")
		}
		for _, reading := range recipe.callResult.readings {
			bad := reading
			bad.cut.initializing = original
			if acceptedStagedCallResultRequest(recipe.callResult, bad) {
				t.Fatal("changed original cut accepted")
			}
		}
	}, true)
}
