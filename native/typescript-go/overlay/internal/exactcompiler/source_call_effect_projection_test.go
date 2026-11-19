package exactcompiler

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

const componentCallProjectionSource = `import {createContext,type Component} from '@exactjs/core';const Token=createContext<number>('projection');function read(owner:Component<{}>){return owner.hasContext(Token)}export function Page(this:Component<{}>){const first=read.call(undefined,this);const second=read.call(undefined,this);return()=> <output>{String(first&&second)}</output>}`

// Actual per-use consumers may pay their source obligation without making the
// exported/generic declaration pure. Reading a summary issues no execution loan.
func TestComponentCallEffectProjectionOriginalUses(t *testing.T) {
	session := NewSession()
	response := session.Execute(Request{Kind: "compile", ID: "component-call-projection.tsx", Source: componentCallProjectionSource, Target: TargetClient, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
		t.Fatal(response.Error, response.Diagnostics)
	}
	if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" {
		t.Fatal("original component source consumer UNREACHED", response.Analysis.Components)
	}
	checkLocalPageContextAttachment(t, response.Code)
	analysis, file := collectComponentCallProjection(t, "component-call-projection.tsx", componentCallProjectionSource)
	checkComponentCallEffectProjection(t, analysis, file)
}

// componentCallProjectionID retains normal repository-ancestor package resolution.
// The source stays an overlay; no fixture or framework declaration is fabricated.
func componentCallProjectionID(t *testing.T, name string) string {
	t.Helper()
	directory, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	return filepath.Join(directory, filepath.Base(name))
}

// componentCallProjectionInputs gives the fixture its ordinary JSX type provider.
// The explicit one-entry config avoids unrelated corpus roots or synthetic types.
func componentCallProjectionInputs(t *testing.T, id, source string) (Request, map[string]string) {
	t.Helper()
	id = componentCallProjectionID(t, id)
	configID := id + ".json"
	config, err := json.Marshal(map[string]any{
		"compilerOptions": map[string]any{"allowJs": true, "jsx": "preserve", "jsxImportSource": "@exactjs/jsx", "module": "esnext", "moduleResolution": "bundler", "target": "es2022", "noEmit": true, "skipLibCheck": true},
		"files":           []string{filepath.Base(id)},
	})
	if err != nil {
		t.Fatal(err)
	}
	request := Request{Kind: "analyze", ID: id, Source: source, ConfigFile: configID, Target: TargetClient, Diagnostics: "semantic"}
	return request, map[string]string{id: source, configID: string(config)}
}

// checkLocalPageContextAttachment checks the emitted same-module token contract.
// Imported dependencies retain their separate reader-helper controls.
func checkLocalPageContextAttachment(t *testing.T, code string) {
	t.Helper()
	compactCode := strings.Join(strings.Fields(code), "")
	for _, expected := range []string{"attachCompiledEnhancementContexts", "__exactAttachEnhancementContexts_1(Page,", "optionallyConsumes:[Token.id]"} {
		if !strings.Contains(compactCode, expected) {
			t.Fatalf("local component context attachment is missing %q:\n%s", expected, code)
		}
	}
}

// collectComponentCallProjection uses the actual publication API. cache.merged
// is a reusable description with no owner; the collector supplies the source
// view under the real checker/Program lease rather than a test-invented owner.
func collectComponentCallProjection(t *testing.T, id, source string) (callableAnalysis, *ast.SourceFile) {
	t.Helper()
	request, inputs := componentCallProjectionInputs(t, id, source)
	id = request.ID
	project, diagnostics, err := newProjectStateWithSources(request, id, inputs)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), id, source)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(generation.release)
	if diagnostics := generation.checker.GetDiagnostics(context.Background(), generation.sourceFile); len(diagnostics) != 0 {
		t.Fatal("fixture semantic preflight", diagnostics)
	}
	analysis := collectProjectCallableEffects(project, generation.sourceFile, generation.checker, collectComponents(generation.sourceFile), nil, nil, nil, assetAnalysis{}, nil)
	return analysis, generation.sourceFile
}

func checkComponentCallEffectProjection(t *testing.T, analysis callableAnalysis, source *ast.SourceFile) {
	t.Helper()
	var page, read *callableFacts
	for i := range analysis.facts {
		f := &analysis.facts[i]
		if f.summary.Name == "Page" {
			page = f
		}
		if f.summary.Name == "read" {
			read = f
		}
	}
	if page == nil || read == nil {
		t.Fatal("actual Page/read facts UNREACHED")
	}
	if source == nil {
		source = page.sourceFile
	}
	if !callableSourceProjectionCurrent(analysis, source) || page.staged.operationsPending {
		t.Fatal("current source projection ownership/closure UNREACHED")
	}
	generic := false
	for _, effect := range read.summary.EffectSources {
		generic = generic || effect.Environment == "unknown" && effect.provenanceIncomplete && effect.fieldOrigin != nil
	}
	if !generic || read.summary.Effect != "unknown" {
		t.Fatal("per-use projection changed generic helper definition")
	}
	before := callableAnalysisFingerprint(analysis)
	uses := make(map[*ast.Node]bool)
	for _, edge := range page.summary.Calls {
		op := page.fieldEdgeOperations[edge.ID]
		if !edge.Resolved || edge.TargetID != read.summary.ID || op == nil || !ast.IsCallExpression(op) || ast.GetSourceFileOfNode(op) != source {
			continue
		}
		view, found := callableEffectForCall(analysis, source, op.Pos())
		if !found || view.Effect != "neutral" || len(view.EffectSources) != 0 {
			t.Fatal("actual per-call source projection UNREACHED", found, view)
		}
		uses[op] = true
	}
	if len(uses) != 2 {
		t.Fatal("two distinct authentic uses UNREACHED", len(uses))
	}
	if before != callableAnalysisFingerprint(analysis) {
		t.Fatal("descriptive consumer changed canonical/state/dependency/owned summaries")
	}
}

// Browser work and a real runtime-unknown call stay independent of a paid
// component field. This control reads the existing public consumer, not a
// fabricated edge/flag or a target-wide opacity waiver.
func TestComponentCallEffectProjectionKeepsIndependentSources(t *testing.T) {
	const source = `import {createContext,type Component} from '@exactjs/core';declare function foreign():number;const Token=createContext<number>('projection');function read(owner:Component<{}>){owner.hasContext(Token);document.title;foreign();return false}export function Page(this:Component<{}>){const value=read.call(undefined,this);return()=> <output>{String(value)}</output>}`
	session := NewSession()
	r := session.Execute(Request{Kind: "compile", ID: "component-call-independent.tsx", Source: source, Target: TargetClient, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
		t.Fatal(r.Error, r.Diagnostics)
	}
	analysis, _ := collectComponentCallProjection(t, "component-call-independent.tsx", source)
	checked := false
	for _, caller := range analysis.facts {
		if caller.summary.Name != "Page" {
			continue
		}
		for _, edge := range caller.summary.Calls {
			op := caller.fieldEdgeOperations[edge.ID]
			if op == nil || !ast.IsCallExpression(op) || ast.GetSourceFileOfNode(op) != caller.sourceFile {
				continue
			}
			view, found := callableEffectForCall(analysis, caller.sourceFile, op.Pos())
			if !found {
				continue
			}
			browser, unknown := false, false
			for _, effect := range view.EffectSources {
				browser = browser || effect.Environment == "browser" && effect.Description == "document"
				unknown = unknown || effect.Environment == "unknown"
			}
			if !browser || !unknown {
				t.Fatal("paid field erased independent browser/runtime-unknown contributions", view)
			}
			checked = true
		}
	}
	if !checked {
		t.Fatal("actual independent source call consumer UNREACHED")
	}
}

// The clone API retains source descriptions only. It receives its own actual
// collection/resolve, and a real edit makes the old source incompatible with a
// fresh consumer. No synthetic graph state or collector-active flag is installed.
func TestComponentCallEffectProjectionCloneAndGeneration(t *testing.T) {
	request, inputs := componentCallProjectionInputs(t, "component-call-clone.tsx", componentCallProjectionSource)
	id := request.ID
	project, diagnostics, err := newProjectStateWithSources(request, id, inputs)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), id, request.Source)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if generation != nil {
			generation.release()
		}
	}()
	if diagnostics := generation.checker.GetDiagnostics(context.Background(), generation.sourceFile); len(diagnostics) != 0 {
		t.Fatal("fixture semantic preflight", diagnostics)
	}
	original := collectProjectCallableEffects(project, generation.sourceFile, generation.checker, collectComponents(generation.sourceFile), nil, nil, nil, assetAnalysis{}, nil)
	cache := project.callableCache
	if cache == nil || len(cache.merged.pending) != 0 {
		t.Fatal("original actual collection UNREACHED")
	}
	checkComponentCallEffectProjection(t, original, generation.sourceFile)
	clone := beginProjectCallableCollection(cache, cache.owner)
	func() {
		defer clone.close()
		clone.collect()
		result := clone.resolve(generation.sourceFile)
		if len(result.pending) != 0 {
			t.Fatal("clone source closure UNREACHED", result.pending)
		}
	}()
	// Publication supplies the clone's current source view; resolve itself
	// deliberately returns a reusable ownerless cache description.
	cloned := collectProjectCallableEffects(project, generation.sourceFile, generation.checker, collectComponents(generation.sourceFile), nil, nil, nil, assetAnalysis{}, nil)
	checkComponentCallEffectProjection(t, cloned, generation.sourceFile)
	oldFile := generation.sourceFile
	generation.release()
	generation = nil
	next, err := project.advance(context.Background(), id, request.Source+"\n")
	if err != nil {
		t.Fatal(err)
	}
	generation = next
	if diagnostics := next.checker.GetDiagnostics(context.Background(), next.sourceFile); len(diagnostics) != 0 {
		t.Fatal("edited fixture semantic preflight", diagnostics)
	}
	if next.program == cache.program {
		t.Fatal("genuine source edit did not replace Program")
	}
	fresh := collectProjectCallableEffects(project, next.sourceFile, next.checker, collectComponents(next.sourceFile), nil, nil, nil, assetAnalysis{}, nil)
	current := project.callableCache
	if current == nil || len(current.merged.pending) != 0 {
		t.Fatal("fresh actual source collection UNREACHED")
	}
	checkComponentCallEffectProjection(t, fresh, next.sourceFile)
	if callableSourceProjectionCurrent(original, oldFile) {
		t.Fatal("retired source owner projected into replaced Program")
	}
	var page *callableFacts
	for i := range current.merged.facts {
		if current.merged.facts[i].summary.Name == "Page" {
			page = &current.merged.facts[i]
		}
	}
	if page == nil {
		t.Fatal("fresh consumer UNREACHED")
	}
	for _, edge := range page.summary.Calls {
		op := page.fieldEdgeOperations[edge.ID]
		if op == nil || !ast.IsCallExpression(op) {
			continue
		}
		if view, found := callableEffectForCall(original, next.sourceFile, op.Pos()); found && view.Effect == "neutral" {
			t.Fatal("fresh actual consumer accepted retired source projection")
		}
	}
}

// A real conditional callable keeps its known authored contribution beside the
// unknown alternative. The descriptive consumer cannot pick its first target.
func TestComponentCallEffectProjectionMixedTargets(t *testing.T) {
	const source = `import {type Component} from '@exactjs/core';declare const foreign:()=>number;function known(){document.title;return 1}export function Page(this:Component<{}>){const selected=Math.random()?known:foreign;const value=selected();return()=> <output>{String(value)}</output>}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "component-call-mixed.tsx", Source: source, Target: TargetClient, Diagnostics: "semantic"})
	if hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal("invalid mixed source fixture", response.Diagnostics)
	}
	if response.Error != "" && !strings.HasPrefix(response.Error, "Compiler analysis coverage gap:") {
		t.Fatal(response.Error)
	}
	analysis, _ := collectComponentCallProjection(t, "component-call-mixed.tsx", source)
	checked := false
	for _, caller := range analysis.facts {
		if caller.summary.Name != "Page" {
			continue
		}
		for _, edge := range caller.summary.Calls {
			op := caller.fieldEdgeOperations[edge.ID]
			if op == nil || !ast.IsCallExpression(op) || ast.GetSourceFileOfNode(op) != caller.sourceFile {
				continue
			}
			if sourceText(caller.sourceFile, op.AsCallExpression().Expression) != "selected" {
				continue
			}
			view, found := callableEffectForCall(analysis, caller.sourceFile, op.Pos())
			if !found {
				t.Fatal("real mixed call-effect consumer UNREACHED")
			}
			browser, unknown := false, false
			for _, effect := range view.EffectSources {
				browser = browser || effect.Environment == "browser" && effect.Description == "document"
				unknown = unknown || effect.Environment == "unknown"
			}
			if !browser || !unknown || view.Effect != "unknown" {
				t.Fatal("mixed call lost a known/unresolved alternative", view)
			}
			checked = true
		}
	}
	if !checked {
		t.Fatal("real mixed call source relation UNREACHED")
	}
}
