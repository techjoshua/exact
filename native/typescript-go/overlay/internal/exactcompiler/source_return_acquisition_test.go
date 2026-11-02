package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"runtime/debug"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

const sourceReturnAcquisitionTDZ = `let cell:{value:string}=make();function make():{value:string}{if(cell)return {value:'safe'};cell={value:'other'};return {value:'safe'}}export const value=cell.value;`

// A failed ownership interval must fail the child rather than exhaust the test
// runner's stack. The limit is test isolation, never an analysis budget.
func TestSourceReturnAcquisitionRecurrence(t *testing.T) {
	if os.Getenv("EXACT_RETURN_ACQUISITION_CHILD") != "1" {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		command := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestSourceReturnAcquisitionRecurrence$", "-test.v")
		command.Env = append(os.Environ(), "EXACT_RETURN_ACQUISITION_CHILD=1")
		if output, err := command.CombinedOutput(); err != nil {
			t.Fatalf("source return acquisition: %v\n%s", err, output)
		}
		return
	}
	debug.SetMaxStack(8 << 20)
	for _, row := range []struct {
		name, source string
		browser      bool
	}{
		{"tdz", sourceReturnAcquisitionTDZ, false},
		{"var", `var cell:{value:string}=make();function make():{value:string}{if(cell)return {value:'safe'};cell={value:'other'};return {value:'safe'}}export const value=cell.value;`, false},
		{"initialized", `let cell={value:'safe'};function make(){if(cell)return cell;cell={value:'other'};return cell}export const value=make().value;`, false},
		{"alias", `const alias=make;var cell:{value:string}=alias();function make():{value:string}{if(cell)return cell;cell={value:'other'};return {value:'safe'}}export const value=cell.value;`, false},
		{"capture", `function create(){let cell:{value:string}=make();function make():{value:string}{if(cell)return cell;cell={value:'other'};return {value:'safe'}}return cell}export const value=create().value;`, false},
		{"default", `var cell:{value:string}=make();function make(input:{value:string}=cell):{value:string}{if(input)return input;cell={value:'other'};return {value:'safe'}}export const value=cell.value;`, false},
		{"current write", `let cell={value:'safe'};function make(){cell={get value(){return document.title}};if(cell)return cell;return {value:'safe'}}export const value=make().value;`, true},
		{"recursive parameter donor", `function pick(x:{value:string},done:boolean):{value:string}{if(done)return x;return pick({get value(){return document.title}},true)}export const value=pick({value:'safe'},false).value;`, true},
		{"nested Get return donor", `function create(x:{value:string}){return {get result(){return x}}}function read(){return create({get value(){return document.title}}).result}export const value=read().value;`, true},
		{"recursive donor", `function make(done:boolean):{value:string}{if(done)return {get value(){return document.title}};return make(true)}export const value=make(false).value;`, true},
		{"captured donor", `function create(input:{value:string}){let cell=input;function make(){if(cell)return cell;cell={value:'safe'};return cell}return make()}export const value=create({get value(){return document.title}}).value;`, true},
		{"throw", `function make():{value:string}{throw 9;return {get value(){return document.title}}}export const value=make().value;`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/return-acquisition.ts", Source: row.source, Diagnostics: "semantic"})
			browser, _ := reentrantInitializerEffects(t, response, row.source, true)
			if browser != row.browser {
				t.Fatalf("browser=%v want %v", browser, row.browser)
			}
		})
	}
}

// The selected return interval joins source inputs and restores its ownership.
// Refused reentry has no successful return, undefined payload or normal receipt.
func TestSourceReturnAcquisitionAuthority(t *testing.T) {
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/return-acquisition-authority.ts", Source: sourceReturnAcquisitionTDZ, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	for _, project := range session.projects {
		file := project.program.GetSourceFile("/virtual/return-acquisition-authority.ts")
		if file == nil {
			continue
		}
		var call, body *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) {
				call = node
			}
			if ast.IsFunctionDeclaration(node) {
				body = node
			}
			return true
		})
		if call == nil || body == nil {
			t.Fatal("missing source Call/body")
		}
		query := newSourceDependencyQuery(call, project.callableCache.owner.values.checker, project.callableCache.owner, nil)
		query.active[body] = false
		var terms []sourceValue
		part := query.projectSourceCallReturns(call, nil, func(value sourceValue, _ sourceValueBindings) { terms = append(terms, value) }, func() { t.Fatal("ordinary source return deferred") })
		if len(terms) == 0 {
			t.Fatalf("lost source alternatives/residual: %d %v/%v", len(terms), part.opaque, part.valueIncomplete)
		}
		if active, had := query.active[body]; active || !had {
			t.Fatal("source interval did not restore prior membership")
		}
		if len(query.dependencyEntries) != 0 || query.inputs != nil || query.operation != nil || query.returning != nil || len(query.creators) != 0 {
			t.Fatal("source interval leaked ownership")
		}
		if len(part.normalCalls) != 0 || len(part.nativeCalls) != 0 {
			t.Fatal("source return granted normal output")
		}
		refused := accessorCandidates{}
		release, fresh := query.enterDependencyBody(body, nil, nil, call, &refused)
		if !fresh {
			t.Fatal("first source input was refused")
		}
		query.active[body] = true
		query.projectSelectedSourceReturns(body, call, nil, nil, &refused, func(sourceValue, sourceValueBindings) { t.Fatal("refused entry fabricated a return") }, func() { t.Fatal("refused entry deferred") })
		query.active[body] = false
		release()
		if !refused.opaque || !refused.valueIncomplete {
			t.Fatal("saturated source entry lost uncertainty")
		}
		for _, term := range terms {
			if term.undefined || term.normal != nil || term.acquired != nil {
				t.Fatal("source return invented payload authority")
			}
		}
	}
}

// Compiler emission preserves the distinction between a lexical TDZ Throw and
// an initialized var. Source saturation is no permission to execute either early.
func TestSourceReturnAcquisitionEmitted(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, row := range []struct {
			name, source, check string
			denied              bool
		}{
			{"tdz", sourceReturnAcquisitionTDZ, `let threw=false;try{vm.runInNewContext(code,{exports:out})}catch(error){threw=error.name==='ReferenceError'}if(!threw)throw Error('lost TDZ Throw');`, true},
			{"var", `var cell:{value:string}=make();function make():{value:string}{if(cell)return {value:'safe'};cell={value:'other'};return {value:'safe'}}export const value=cell.value;`, `vm.runInNewContext(code,{exports:out});if(out.value!=='safe')throw Error(JSON.stringify(out));`, true},
			{"current", `let cell={value:'before'};function make(){cell={value:'after'};if(cell)return cell;return {value:'unreachable'}}export const value=make().value;`, `vm.runInNewContext(code,{exports:out});if(out.value!=='after')throw Error(JSON.stringify(out));`, false},
		} {
			t.Run(string(target)+"/"+row.name, func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/return-acquisition-emitted.ts", Source: row.source, Target: target, Diagnostics: "semantic"})
				code := response.Code
				if row.denied {
					denied := false
					for _, diagnostic := range response.Diagnostics {
						denied = denied || diagnostic.Code == "EXACT2101"
					}
					if response.Error != "" || !denied || code != "" {
						t.Fatal("lost strict denial", response.Error, response.Diagnostics)
					}
					// This source relationship does not authorize target emission.
					// Qualify original JavaScript completion independently with TS7.
					code = row.source
				} else if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || code == "" {
					t.Fatal(response.Error, response.Diagnostics)
				}
				sourceNodeScript(t, code, `const fs=require('node:fs'),vm=require('node:vm'),out={},code=fs.readFileSync(process.argv[1],'utf8');`+row.check)
			})
		}
	}
}
