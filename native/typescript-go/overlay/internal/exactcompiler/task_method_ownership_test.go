package exactcompiler

import (
	"encoding/json"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/parser"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
	"os"
	"path/filepath"
	"testing"
)

// taskClosureFixture shares the ordinary source regression with emitted task tests.
func taskClosureFixture(t *testing.T, name string) (string, string, string) {
	t.Helper()
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		file := filepath.Join(root, "packages/component-composition-corpus/test-support/task-closures", name+".tsx")
		if source, err := os.ReadFile(file); err == nil {
			config := filepath.Join(t.TempDir(), "tsconfig.json")
			options := map[string]any{"compilerOptions": map[string]any{"target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext", "lib": []string{"ESNext", "DOM"}, "jsx": "preserve", "strict": true, "skipLibCheck": true}, "files": []string{file}}
			data, err := json.Marshal(options)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(config, data, 0600); err != nil {
				t.Fatal(err)
			}
			return file, string(source), config
		}
		parent := filepath.Dir(root)
		if parent == root {
			t.Fatal("task closure source fixture not found")
		}
		root = parent
	}
}

func TestTaskMethodOwnershipIdentity(t *testing.T) {
	file, source, config := taskClosureFixture(t, "repeated")
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: file, Root: filepath.Dir(file), Source: source, ConfigFile: config})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	found := false
	for _, project := range session.projects {
		sf := project.program.GetSourceFile(file)
		if sf == nil || project.callableCache == nil {
			continue
		}
		found = true
		plans := planTaskMethodCreations(sf, response.Analysis.Tasks, indexStateWrites(response.Analysis.StateWrites), project.callableCache.owner.values.checker)
		if len(plans) != 1 {
			t.Fatalf("one authored creation must retain all consumers, got%d plans", len(plans))
		}
		lowering := &jsxLowering{taskMethodOwners: plans, emitContext: printer.NewEmitContext()}
		foreign := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: file, Path: tspath.Path(file)}, source, core.ScriptKindTSX)
		var foreignMethod, foreignWork *ast.Node
		walkNode(foreign.AsNode(), func(node *ast.Node) bool {
			if ast.IsMethodDeclaration(node) {
				foreignMethod = node
			}
			if ast.IsFunctionDeclaration(node) && node.Name() != nil && node.Name().Text() == "run" {
				foreignWork = node
			}
			return true
		})
		for _, plan := range plans {
			if len(plan.consumers) != 3 {
				t.Fatalf("lost repeated activation identities: %#v", plan.consumers)
			}
			for _, task := range response.Analysis.Tasks {
				check := func(method, work *ast.Node, id, component string) bool {
					return lowering.taskMethodCreatedBy(method, work, id, component, task.WorkStart, task.WorkLength)
				}
				if !check(plan.method, plan.work, task.ID, task.Component) {
					t.Fatalf("lost consumer%s", task.ID)
				}
				if check(plan.method, plan.work, "unrelated", task.Component) || check(plan.method, plan.work, task.ID, "unrelated") {
					t.Fatal("a partial consumer identity granted ownership")
				}
				if check(foreignMethod, plan.work, task.ID, task.Component) || check(plan.method, foreignWork, task.ID, task.Component) {
					t.Fatal("same-span foreign AST acquired ownership")
				}
			}
		}
	}
	if !found {
		t.Fatal("source project unavailable")
	}
}

func TestTaskClosureSources(t *testing.T) {
	for _, name := range []string{"repeated", "async", "generation", "evaluation", "child", "function-default"} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(name+"/"+string(target), func(t *testing.T) {
				file, source, config := taskClosureFixture(t, name)
				response := NewSession().Execute(Request{Kind: "compile", ID: file, Root: filepath.Dir(file), Source: source, ConfigFile: config, Target: target, Diagnostics: "semantic"})
				wantDiagnostics := 0
				if name == "child" {
					wantDiagnostics = 1
				}
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatalf("%s %#v", response.Error, response.Diagnostics)
				}
				// Analysis cost is advisory and does not change task ownership.
				// Keep the detached-child diagnostic contract independent of it.
				var taskDiagnostics []Diagnostic
				for _, diagnostic := range response.Diagnostics {
					if diagnostic.Code == "EXACT_ANALYSIS_COST" {
						if diagnostic.Severity != "warning" {
							t.Fatalf("analysis cost became a rejection: %#v", diagnostic)
						}
						continue
					}
					taskDiagnostics = append(taskDiagnostics, diagnostic)
				}
				if len(taskDiagnostics) != wantDiagnostics {
					t.Fatalf("unexpected task diagnostics: %#v", response.Diagnostics)
				}
				if name == "child" {
					advisory := taskDiagnostics[0]
					if advisory.Code != "EXACT2004" || advisory.Severity != "warning" {
						t.Fatalf("detached child advisory changed: %#v", response.Diagnostics)
					}
					t.Logf("%s: %s", advisory.Code, advisory.Message)
				}
				for _, task := range response.Analysis.Tasks {
					if task.Placement != "server" {
						t.Fatalf("explicit server task lost placement: %#v", task)
					}
				}
			})
		}
	}
}

// Setup-shared methods have no creating task activation certificate. This does not
// establish their publication or emitted-artifact correctness.
func TestTaskMethodSharedCreationRefusal(t *testing.T) {
	file, source, config := taskClosureFixture(t, "shared")
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: file, Source: source, ConfigFile: config, Root: filepath.Dir(file)})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, project := range session.projects {
		sf := project.program.GetSourceFile(file)
		if sf == nil || project.callableCache == nil {
			continue
		}
		plans := planTaskMethodCreations(sf, response.Analysis.Tasks, indexStateWrites(response.Analysis.StateWrites), project.callableCache.owner.values.checker)
		if len(plans) != 0 {
			t.Fatal("setup-created method acquired a task activation")
		}
	}
}
