package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// These are real source drivers. Historical inspection supplements the public
// source gate to distinguish actual captured allocation from matching AST names.
func TestModuleCellCapturePutDriver(t *testing.T) {
	for _, c := range []struct {
		name, source  string
		before, after float64
	}{
		{"direct", `export{};const box={current:0};box.current=1;const end=()=>0;end();`, 1, 1},
		{"captured", `export{};const box={current:0};const write=()=>{box.current=1;return 0};write();`, 0, 1},
		{"alias-mutation", `export{};const box={current:0};const alias=box;const write=()=>{box.current=1;return 0};alias.current=3;write();`, 3, 1},
		{"current-state", `export{};const box={current:0};const write=()=>{box.current=box.current+1;return 0};box.current=4;write();`, 4, 5},
		{"literal-key", `export{};const box={current:0};const write=()=>{box['current']=1;return 0};write();`, 0, 1},
	} {
		t.Run(c.name, func(t *testing.T) {
			const id = "/virtual/captured-cell-put.ts"
			session := NewSession()
			r := session.Execute(Request{Kind: "compile", ID: id, Source: c.source, Diagnostics: "semantic"})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			for _, d := range r.Diagnostics {
				if strings.HasPrefix(d.Code, "TS") {
					t.Fatalf("invalid source %#v", r.Diagnostics)
				}
			}
			h := bindingCloseHistory(session, id)
			a := callMigrationRow(t, h, 0)
			if hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal("actual source gate", r.Diagnostics)
			}
			if c.name != "direct" {
				f := a.callHistory.entry.callable
				if f.proof.empty || len(f.capturedLexicals) != 1 || f.captures != a.callHistory.entry.caller || f.capturedLexicals[0].declaration != f.proof.captureDeclarations[0] {
					t.Fatal("actual capture tuple/environment")
				}
				if a.callHistory.entry.activation.env == f.captures || a.callHistory.entry.activation.env.outer != f.captures {
					t.Fatal("formal/captured environments conflated")
				}
			}
			var cell languageCell
			for _, v := range a.callHistory.entry.inputs.lexicals {
				if v.declaration.Name() != nil && v.declaration.Name().Text() == "box" {
					cell = v.cell
				}
			}
			if cell.id.owner == nil {
				t.Fatal("no actual module cell")
			}
			acquired := a.callHistory.entry.acquisition.alternatives[0].branch
			// Historical inspection never asks a released execution domain to read anew.
			inspectCell := func(b languageBranch) languageValue {
				for r := b.state.storage; r != nil; r = r.previous {
					if r.cell == cell && r.initialized {
						return r.value
					}
				}
				return languageValue{}
			}
			first, last := inspectCell(acquired), inspectCell(a.branch)
			if first.object == nil || last.object != first.object {
				t.Fatal("original allocation identity lost")
			}
			inspectField := func(b languageBranch) (languageDescriptor, bool) {
				for r := b.state.storage; r != nil; r = r.previous {
					if r.object == first.object && r.key == languageStringKey("current") && r.initialized && !r.deleted {
						return r.descriptor, true
					}
				}
				return languageDescriptor{}, false
			}
			before, present := inspectField(acquired)
			if !present || before.accessor || !before.writable {
				t.Fatal("missing initial own DATA")
			}
			number, known := numericNumberPayload(before.value)
			if !known || float64(number) != c.before {
				t.Fatalf("before=%v known=%t", number, known)
			}
			after, present := inspectField(a.branch)
			number, known = numericNumberPayload(after.value)
			if !present || !known || float64(number) != c.after {
				t.Fatalf("actual Put missing: present=%t value=%v", present, number)
			}
		})
	}
}

// These valid sources are refused by actual source discovery. They do not
// exercise live TDZ, Proxy or setter execution, and absence of history is not proof.
func TestModuleCellCaptureSourceRefusals(t *testing.T) {
	for _, c := range []struct{ name, source string }{
		{"tdz-creation", `export{};const write=()=>{box.current=1;return 0};const box={current:0};write();`},
		{"mutable-binding", `export{};let box={current:0};const write=()=>{box.current=1;return 0};write();`},
		{"foreign-capture", `export{};declare const box:{current:number};const write=()=>{box.current=1;return 0};write();`},
		{"two-free-cells", `export{};const box={current:0};const other={current:1};const write=()=>{box.current=other.current;return 0};write();`},
		{"unknown-alias", `export{};declare function escape(v:unknown):void;const box={current:0};const write=()=>{box.current=1;return 0};escape(box);write();`},
		{"proxy", `export{};const box=new Proxy({current:0},{});const write=()=>{box.current=1;return 0};write();`},
		{"setter", `export{};const box={set current(v:number){}};const write=()=>{box.current=1;return 0};write();`},
		{"three-calls-refused", `export{};const box={current:0};const write=()=>{box.current=1;return 0};write();write();write();`},
	} {
		t.Run(c.name, func(t *testing.T) {
			const id = "/virtual/module-cell-refusal.ts"
			request := Request{Kind: "analyze", ID: id, Source: c.source, Diagnostics: "semantic"}
			project, diagnostics, err := newProjectState(request, id)
			if err != nil || len(diagnostics) != 0 {
				t.Fatal("source setup", err, diagnostics)
			}
			generation, err := project.advance(context.Background(), id, c.source)
			if err != nil {
				t.Fatal(err)
			}
			defer generation.release()
			file := generation.sourceFile
			if len(file.Diagnostics()) != 0 || len(file.BindDiagnostics()) != 0 || len(generation.checker.GetDiagnostics(context.Background(), file)) != 0 {
				t.Fatal("invalid source discovery fixture")
			}
			if candidate := reserveClosedPrefixCandidate(file, project.program, generation.checker, generation, request); candidate != nil {
				candidate.release()
				t.Fatal("unsupported source passed actual discovery")
			}
			// This is a discovery refusal only. Live capture guards have
			// independent controls below using a genuine entered source Call.
		})
	}
}

// These negative controls borrow a genuine live source entry, not a synthetic
// callable/header positive. They cannot issue new capture or execution authority.
func TestModuleCellCaptureLiveBoundaries(t *testing.T) {
	request := Request{Kind: "compile", ID: "/virtual/live-module-capture.ts", Source: `export{};const box={current:0};const other={current:8};const shadow=(box:{current:number})=>0;const write=()=>{box.current=1;return 0};write();`, Diagnostics: "semantic"}
	project, diagnostics, err := newProjectState(request, request.ID)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), request.ID, request.Source)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(generation.release)
	source := generation.sourceFile
	if len(generation.checker.GetDiagnostics(context.Background(), source)) != 0 {
		t.Fatal("invalid source")
	}
	candidate := reserveClosedPrefixCandidate(source, project.program, generation.checker, generation, request)
	if candidate == nil {
		t.Fatal("no source reservation")
	}
	t.Cleanup(candidate.release)
	collectProjectCallableEffects(project, source, generation.checker, nil, nil, nil, nil, analyzeAssets(source, generation.checker, request), nil)
	row := callMigrationRow(t, candidate.history, 0)
	entry := row.callHistory.entry
	owner := row.branch.owner
	raw := row.callHistory.raw.alternatives[0]
	f := entry.callable
	got := owner.readModuleCapturedCell(raw.branch, entry, 0)
	if got.completion != languageNormal || got.value.object == nil || !entry.valid(owner, entry.activation) {
		t.Fatal("actual captured cell consumer")
	}
	if local := owner.readLocal(raw.branch, f.capturedLexicals[0].cell); local.completion != languageResidual {
		t.Fatal("local environment law relaxed")
	}
	var moduleBox, shadowBox *ast.Node
	walkNode(source.AsNode(), func(n *ast.Node) bool {
		if ast.IsVariableDeclaration(n) && n.Name() != nil && n.Name().Text() == "box" {
			moduleBox = n
		}
		if ast.IsParameterDeclaration(n) && n.Name() != nil && n.Name().Text() == "box" {
			shadowBox = n
		}
		return true
	})
	if moduleBox == nil || shadowBox == nil || moduleBox == shadowBox || moduleBox.Name().Text() != shadowBox.Name().Text() {
		t.Fatal("missing distinct same-spelling bindings")
	}
	if f.capturedLexicals[0].declaration != moduleBox {
		t.Fatal("capture retargeted shadow declaration")
	}
	for ref := range f.proof.captureReferences {
		if generation.checker.GetSymbolAtLocation(ref).ValueDeclaration != moduleBox {
			t.Fatal("capture reference did not resolve original declaration")
		}
	}
	shadowConstructed := false
	for _, event := range candidate.history.recipe.events {
		if event.callable != nil && len(event.callable.arrow.Parameters()) == 1 && event.callable.arrow.Parameters()[0] == shadowBox {
			shadowConstructed = true
			if !event.callable.empty || len(event.callable.captureDeclarations) != 0 {
				t.Fatal("shadow formal granted module capture")
			}
		}
	}
	if !shadowConstructed {
		t.Fatal("shadow constructor source proof missing")
	}
	for _, name := range []string{"owner", "environment", "branch", "missing", "substitution", "index", "source", "generation", "shadow-declaration", "fresh-callable", "defining-environment"} {
		t.Run(name, func(t *testing.T) {
			b := raw.branch
			e := *entry
			proof := *f.proof
			original := f.proof
			captures := f.capturedLexicals
			defining := f.captures
			defer func() { f.proof = original; f.capturedLexicals = captures; f.captures = defining }()
			switch name {
			case "shadow-declaration":
				f.capturedLexicals = append([]languageLexical(nil), captures...)
				f.capturedLexicals[0].declaration = shadowBox
			case "fresh-callable":
				// Constructor-only attempted identity substitution, not a source Call.
				copied := *f
				copied.id = owner.identity()
				copied.capturedLexicals = append([]languageLexical(nil), captures...)
				if owner.callableCaptureState(b, &copied) {
					t.Fatal("fresh copied callable inherited creation marker")
				}
				e.callable = &copied
			case "defining-environment":
				// Retagging the tuple cannot substitute another defining environment.
				f.captures = owner.environment(nil)
				f.capturedLexicals = append([]languageLexical(nil), captures...)
				f.capturedLexicals[0].cell.environment = f.captures.id
			case "owner":
				b.owner = newLanguageOwner()
			case "environment":
				b.env = entry.caller
			case "branch":
				b.state = owner.root().state
			case "missing":
				f.capturedLexicals = nil
			case "substitution":
				f.capturedLexicals = append([]languageLexical(nil), captures...)
				for _, v := range entry.inputs.lexicals {
					if v.declaration.Name() != nil && v.declaration.Name().Text() == "other" {
						f.capturedLexicals[0].cell = v.cell
					}
				}
			case "index":
				before := owner.next
				if out := owner.readModuleCapturedCell(b, &e, 1); out.completion != languageResidual || owner.next != before {
					t.Fatal("wrong captured index")
				}
				return
			case "source":
				proof.source = nil
				f.proof = &proof
				e.proof = &proof
			case "generation":
				proof.generation++
				f.proof = &proof
				e.proof = &proof
			}
			before := owner.next
			if out := owner.readModuleCapturedCell(b, &e, 0); out.completion != languageResidual || owner.next != before {
				t.Fatal("foreign capture gained read", name)
			}
		})
	}
	// Constructor-only clone projection of a genuine stopped Return. The
	// straight-line capture source has no admitted cut/resume domain or replay.
	cloned := languageCopy(raw)
	if cloned.storage == nil || cloned.storage == raw.storage || cloned.storage.entry == raw.storage.entry || cloned.storage.entry.callable != f || cloned.storage.entry.callable.capturedLexicals[0].cell != f.capturedLexicals[0].cell {
		t.Fatal("copied continuation lost exact capture handle")
	}
	beforeClone := owner.next
	if value := owner.readModuleCapturedCell(cloned.branch, cloned.storage.entry, 0); value.completion != languageNormal || value.value.object != got.value.object || owner.next != beforeClone {
		t.Fatal("valid clone projection changed capture")
	}
	entered := 0
	stopped := languageSequence([]languageAlternative{cloned}, func(languageAlternative) []languageAlternative { entered++; return nil })
	if entered != 0 || len(stopped) != 1 || stopped[0].completion != languageReturn {
		t.Fatal("clone replayed completed Return")
	}
	sibling := owner.storageStep(entry.activation, languageStorage{})
	changed := *cloned.storage.entry
	changed.activation = sibling
	beforeClone = owner.next
	if out := owner.readModuleCapturedCell(cloned.branch, &changed, 0); out.completion != languageResidual || owner.next != beforeClone {
		t.Fatal("sibling activation substituted original acquisition")
	}
	before := owner.next
	if candidate.admits(owner, f.proof, row) {
		t.Fatal("same source Call claimed twice")
	}
	if owner.next != before {
		t.Fatal("refusal issued identity")
	}
	wrongMode := candidate.history.mode
	wrongMode[0] ^= 1
	if candidate.history.cacheCompatible(candidate.owner, candidate.executable, source, wrongMode) {
		t.Fatal("wrong mode reused source capture")
	}
	generation.abandon()
	if owner.readModuleCapturedCell(raw.branch, entry, 0).completion != languageResidual || entry.valid(owner, entry.activation) {
		t.Fatal("released capture reanimated")
	}
}

func TestModuleCellCaptureEmitted(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "module-cell-runtime.ts", Target: target, Diagnostics: "semantic", Source: `export{};const box={current:0};const write=()=>{box.current=box.current+1;return 0};box.current=4;write();`})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(response.Error, response.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "emitted.mjs")
			code := response.Code + `;if(box.current!==5)throw Error('current branch lost');write();if(box.current!==6)throw Error('runtime repeated closure');console.log('PASS');`
			if err := os.WriteFile(file, []byte(code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			output, err := exec.CommandContext(ctx, "node", file).CombinedOutput()
			if err != nil || strings.TrimSpace(string(output)) != "PASS" {
				t.Fatalf("runtime %v %s", err, output)
			}
		})
	}
}
