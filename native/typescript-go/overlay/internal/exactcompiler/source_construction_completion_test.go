package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime/debug"
	"strings"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

const constructionCompletionSource = `class Local{#read(value:number){return 1}result=this.#read(2)}export const value=new Local().result;`

// A recursive negative completion proof must retain source alternatives rather
// than overflow. The child stack limit contains failures without analysis fuel.
func TestConstructionCompletionRecurrence(t *testing.T) {
	for _, row := range []struct {
		name, source     string
		browser, unknown bool
	}{
		{"private", constructionCompletionSource, false, false},
		{"public", strings.ReplaceAll(constructionCompletionSource, "#read", "read"), false, false},
		{"optional", strings.Replace(constructionCompletionSource, "this.#read(2)", "this.#read?.(2)", 1), false, false},
		{"callback", `class Local{#read(read:(value:number)=>string){return read(1)}result=this.#read(value=>value.toFixed())}export const value=new Local().result;`, false, false},
		{"method donor", strings.Replace(constructionCompletionSource, "return 1", "document.title;return 1", 1), true, false},
		{"public method donor", strings.ReplaceAll(strings.Replace(constructionCompletionSource, "return 1", "document.title;return 1", 1), "#read", "read"), true, false},
		{"getter donor", `class Local{get read(){document.title;return (value:number)=>value}result=this.read(2)}export const value=new Local().result;`, true, false},
		{"earlier throw", `function stop():never{throw 9}class Local{first=stop();#read(){document.title;return 1}result=this.#read()}export const value=new Local().result;`, false, false},
		{"later throw", `function stop():never{throw 9}class Local{#read(){document.title;return 1}result=this.#read();later=stop()}export const value=new Local().result;`, true, false},
		{"later public throw", `function stop():never{throw 9}class Local{read(){document.title;return 1}result=this.read();later=stop()}export const value=new Local().result;`, true, false},
		{"nested method donor", `function stop():never{throw 9}class Local{helper(){document.title;return 1}read(){return this.helper()}result=this.read();later=stop()}export const value=new Local().result;`, true, false},
		{"nested getter donor", `function stop():never{throw 9}class Local{helper(){document.title;return 1}get read(){return this.helper()}result=this.read;later=stop()}export const value=new Local().result;`, true, false},
		{"nested two-level donor", `function stop():never{throw 9}class Local{last(){document.title;return 1}helper(){return this.last()}read(){return this.helper()}result=this.read();later=stop()}export const value=new Local().result;`, true, false},
		{"wrong private brand", `class Other{#read(){document.title;return 1}}class Local{#read(){return 2}read(){return this.#read()}result=this.read.call(new Other())}export const value=new Local().result;`, false, false},
		{"detached source call", `class Local{read(){document.title;return 1}result=(()=>{const read=this.read;return read()})()}export const value=new Local().result;`, true, false},
		{"lexical static separation", `class Base{static #read(){document.title;return 1}static run(){return this.#read()}}class Local extends Base{#read(){return 2}result=this.#read()}export const value=new Local().result;`, false, false},
		{"unrelated abrupt construction", `class Other{constructor(){throw 9}get value(){return document.title}}class Local{read(){return 1}first=this.read();result=new Other().value}export const value=new Local().result;`, false, false},
		{"private safe public donor", `class Local{#read(){return 1}'#read'(){document.title;return 2}result=this.#read()}export const value=new Local().result;`, false, false},
		{"public safe private donor", `class Local{#read(){document.title;return 1}'#read'(){return 2}result=this['#read']()}export const value=new Local().result;`, false, false},
		{"private getter donor", `class Local{get #read(){document.title;return ()=>1}result=this.#read()}export const value=new Local().result;`, true, false},
		{"foreign replacement", `declare function foreign():any;class Local{#read(){return 1}result=this.#read();constructor(){return foreign()}}export const value=new Local().result;`, false, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			if os.Getenv("EXACT_CONSTRUCTION_COMPLETION_CHILD") != row.name {
				ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
				defer cancel()
				command := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestConstructionCompletionRecurrence$/^"+regexp.QuoteMeta(row.name)+"$", "-test.v")
				command.Env = append(os.Environ(), "EXACT_CONSTRUCTION_COMPLETION_CHILD="+row.name)
				if output, err := command.CombinedOutput(); err != nil {
					t.Fatalf("construction completion: %v\n%s", err, output)
				}
				return
			}
			previous := debug.SetMaxStack(8 << 20)
			defer debug.SetMaxStack(previous)
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/construction-completion.ts", Source: row.source, Diagnostics: "semantic"})
			browser, unknown := reentrantInitializerEffects(t, response, row.source, true)
			if browser != row.browser || row.unknown && !unknown {
				t.Fatalf("browser=%v unknown=%v want browser=%v independentUnknown=%v", browser, unknown, row.browser, row.unknown)
			}
		})
	}
}

// True is only MAY. The synchronous negative-proof interval restores every exit
// and cannot install an input, result operation or cross-query refusal.
func TestConstructionCompletionProofLifetime(t *testing.T) {
	const source = `class Safe{value=1}class Abrupt{constructor(){throw 9}}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/completion-lifetime.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	checked := false
	for _, project := range session.projects {
		file := project.program.GetSourceFile("/virtual/completion-lifetime.ts")
		if file == nil {
			continue
		}
		var safe, abrupt *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsClassDeclaration(node) {
				if node.Name().Text() == "Safe" {
					safe = node
				} else {
					abrupt = node
				}
			}
			return true
		})
		if safe == nil || abrupt == nil {
			t.Fatal("missing class proof endpoints")
		}
		query := newSourceDependencyQuery(safe, project.callableCache.owner.values.checker, project.callableCache.owner, nil)
		if !query.sourceConstructionFieldsMayComplete(safe, nil) || query.provingConstructionCompletion {
			t.Fatal("MAY exit leaked proof interval")
		}
		if query.sourceConstructionFieldsMayComplete(abrupt, nil) || query.provingConstructionCompletion {
			t.Fatal("abrupt exit leaked proof interval")
		}
		query.provingConstructionCompletion = true
		if !query.sourceConstructionFieldsMayComplete(abrupt, nil) || !query.provingConstructionCompletion {
			t.Fatal("nested refusal changed outer interval")
		}
		independent := newSourceDependencyQuery(abrupt, project.callableCache.owner.values.checker, project.callableCache.owner, nil)
		if independent.sourceConstructionFieldsMayComplete(abrupt, nil) || independent.provingConstructionCompletion {
			t.Fatal("refusal crossed query ownership")
		}
		if query.inputs != nil || query.operation != nil || independent.inputs != nil || independent.operation != nil {
			t.Fatal("negative proof installed normal ownership")
		}
		checked = true
	}
	if !checked {
		t.Fatal("source query missing")
	}
}

// Actual emitted Calls retain getter/argument order and this. This is separate
// evidence from the source proof, with both client and server artifacts executed.
func TestConstructionCompletionEmittedOrder(t *testing.T) {
	const source = `export function read(throwLater=false){const trace:string[]=[];function stop():never{trace.push('throw');throw 9}class Local{tag='owner';#first(value:number){trace.push('private');return value}first=this.#first(1);get work(){trace.push('get');return function(this:Local,value:number){trace.push(this.tag);return value}}value=this.work((trace.push('arg'),2));later=throwLater?stop():0}try{const box=new Local();return {value:box.value,trace}}catch(error){return {error,trace}}}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/construction-order.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "order.mts")
			if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			const script = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(m.read(),{value:2,trace:['private','get','arg','owner']});assert.deepEqual(m.read(true),{error:9,trace:['private','get','arg','owner','throw']});`
			if output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", script, file).CombinedOutput(); err != nil {
				t.Fatalf("emitted construction order: %v %s", err, output)
			}
		})
	}
}

// Lexical private symbols, public spelling and normal traversal remain distinct.
func TestConstructionPrivateMemberSelection(t *testing.T) {
	const source = `class A{static #read(){return 1}static '#read'(){return 2}static use(){return this.#read()}}class B{#read(){return 3}use(){return this.#read()}}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/private-members.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	checked := false
	for _, project := range session.projects {
		file := project.program.GetSourceFile("/virtual/private-members.ts")
		if file == nil {
			continue
		}
		var first, second, public, operation *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsMethodDeclaration(node) && node.Name() != nil {
				if node.Name().Kind == ast.KindPrivateIdentifier {
					if node.Parent.Name().Text() == "A" {
						first = node
					} else {
						second = node
					}
				}
				if ast.IsStringLiteral(node.Name()) {
					public = node
				}
			}
			if ast.IsPropertyAccessExpression(node) && node.AsPropertyAccessExpression().Name().Kind == ast.KindPrivateIdentifier && enclosingCallableNode(node).Parent.Name().Text() == "A" {
				operation = node
			}
			return true
		})
		if first == nil || second == nil || public == nil || operation == nil {
			t.Fatal("missing original private/public endpoints")
		}
		query := newSourceDependencyQuery(operation, project.callableCache.owner.values.checker, project.callableCache.owner, nil)
		query.protectedMember = operation
		for _, row := range []struct {
			member *ast.Node
			match  bool
		}{{first, true}, {second, false}, {public, false}} {
			match, private := query.sourcePrivateMemberMatch(row.member, []string{"#read"})
			if match != row.match || !private {
				t.Fatal("private symbol/spelling distinction lost", match, private)
			}
		}
		if match, private := query.sourcePrivateMemberMatch(first, []string{"*"}); match || private {
			t.Fatal("wildcard borrowed private Get")
		}
		query.protectedMember = nil
		if match, private := query.sourcePrivateMemberMatch(first, []string{"#read"}); match || private {
			t.Fatal("missing original Get authorized selection")
		}
		query.protectedMember = operation
		query.dependenciesOnly = false
		if match, private := query.sourcePrivateMemberMatch(first, []string{"#read"}); match || private {
			t.Fatal("source selection granted normal identity")
		}
		checked = true
	}
	if !checked {
		t.Fatal("private source query missing")
	}
}

// The live header belongs to its issuing query and is revoked even when retained
// or unwound by panic. Selected bodies cannot borrow adapted receiver values.
func TestConstructionFieldReadLifetime(t *testing.T) {
	const source = `class Local{read(){return this.last()}last(){return 1}field=this.read();detached=this.read.call(this)}export const value=new Local().field;`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/field-lifetime.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	checked := false
	for _, project := range session.projects {
		file := project.program.GetSourceFile("/virtual/field-lifetime.ts")
		if file == nil {
			continue
		}
		var target, field, method, call, member, site, detached *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsClassDeclaration(node) {
				target = node
			}
			if ast.IsPropertyDeclaration(node) && node.Name().Text() == "field" {
				field = node
				call = node.Initializer()
			}
			if ast.IsPropertyDeclaration(node) && node.Name().Text() == "detached" {
				detached = node.Initializer()
			}
			if ast.IsMethodDeclaration(node) && node.Name().Text() == "read" {
				method = node
			}
			if ast.IsPropertyAccessExpression(node) && node.AsPropertyAccessExpression().Name().Text() == "last" {
				member = node
			}
			if ast.IsNewExpression(node) {
				site = node
			}
			return true
		})
		if target == nil || field == nil || method == nil || call == nil || member == nil || site == nil {
			t.Fatal("missing field-use endpoints")
		}
		query := newSourceDependencyQuery(call, project.callableCache.owner.values.checker, project.callableCache.owner, nil)
		parent := &sourceValueInputs{declaration: field, bindings: sourceValueBindings{0: {{node: site}}}}
		var retained *sourceConstructionFieldRead
		var savedRestore func()
		query.withConstructionFieldRead(site, target, parent, func() {
			retained = query.constructionFieldRead
			query.protectedMember = call.AsCallExpression().Expression
			if !query.sourceConstructionFieldReceiver(site, target) {
				t.Fatal("original field receiver refused")
			}
			query.protectedMember = nil
			if query.sourceConstructionFieldReceiver(site, target) {
				t.Fatal("missing original Get borrowed field receiver")
			}
			query.protectedMember = call.AsCallExpression().Expression
			copied := *query
			if copied.sourceConstructionFieldReceiver(site, target) {
				t.Fatal("query copy borrowed issuing header")
			}
			next := query.bindInputs(method, call, parent.bindings, &accessorCandidates{})
			copied.inputs = next
			copied.enterConstructionFieldBody(parent, next)()
			if retained.inputs != parent {
				t.Fatal("wrong query changed shared header")
			}
			query.inputs = next
			restore := query.enterConstructionFieldBody(parent, next)
			savedRestore = restore
			query.protectedMember = member
			if retained.inputs != next || !query.sourceConstructionFieldReceiver(site, target) {
				t.Fatal("selected body lost field receiver")
			}
			restore()
			query.inputs = parent
			if retained.inputs != parent {
				t.Fatal("selected body did not restore field inputs")
			}
			refusedCall := *next
			refusedCall.invocation = detached
			query.inputs = &refusedCall
			query.enterConstructionFieldBody(parent, &refusedCall)()
			if retained.inputs != parent {
				t.Fatal("indirect this-call borrowed field receiver")
			}
			for _, value := range []sourceValue{{node: site, normal: &sourceNormalValue{}}, {node: site, acquired: &sourceObservedValue{}}, {node: site, native: &sourceNativeValue{}}, {node: site, capture: &acquiredCallableScope{}}} {
				refused := *next
				refused.bindings = sourceValueBindings{0: {value}}
				query.inputs = &refused
				query.enterConstructionFieldBody(parent, &refused)()
				if retained.inputs != parent {
					t.Fatal("adapted receiver borrowed source field")
				}
			}
			query.inputs = parent
			var nested *sourceConstructionFieldRead
			query.withConstructionFieldRead(site, target, parent, func() {
				nested = query.constructionFieldRead
				if nested == retained {
					t.Fatal("nested header reused outer owner")
				}
			})
			if query.constructionFieldRead != retained || nested.owner != nil || nested.inputs != nil {
				t.Fatal("nested release failed")
			}
		})
		if retained.owner != nil || retained.inputs != nil || query.inputs != nil || query.constructionFieldRead != nil {
			t.Fatal("field release retained ownership")
		}
		savedRestore()
		if retained.inputs != nil {
			t.Fatal("late body restoration revived released header")
		}
		query.inputs = parent
		query.constructionFieldRead = retained
		query.protectedMember = call.AsCallExpression().Expression
		if query.sourceConstructionFieldReceiver(site, target) {
			t.Fatal("released header became live again")
		}
		query.constructionFieldRead = nil
		query.inputs = nil
		func() {
			defer func() {
				if recover() != "field-panic" {
					t.Fatal("missing contained panic")
				}
			}()
			query.withConstructionFieldRead(site, target, parent, func() { retained = query.constructionFieldRead; panic("field-panic") })
		}()
		if retained.owner != nil || retained.inputs != nil || query.inputs != nil || query.constructionFieldRead != nil {
			t.Fatal("panic leaked issuing header")
		}
		checked = true
	}
	if !checked {
		t.Fatal("field-use query missing")
	}
}

func TestConstructionCompletionSemanticInputs(t *testing.T) {
	for _, private := range []bool{true, false} {
		for _, invalid := range []bool{false, true} {
			for _, target := range []Target{TargetClient, TargetServer} {
				name := string(target) + "/public/valid"
				source := constructionCompletionSource
				if private {
					name = string(target) + "/private/valid"
				} else {
					source = strings.ReplaceAll(source, "#read", "read")
				}
				if invalid {
					name += "-invalid"
					source = strings.Replace(source, "this.read(2)", "this.read(\"bad\")", 1)
					source = strings.Replace(source, "this.#read(2)", "this.#read(\"bad\")", 1)
				}
				t.Run(name, func(t *testing.T) {
					response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/construction-inputs.ts", Source: source, Target: target, Diagnostics: "semantic"})
					if response.Error != "" {
						t.Fatal(response.Error)
					}
					rejected := false
					for _, diagnostic := range response.Diagnostics {
						if diagnostic.Code == "EXACT_ANALYSIS_COST" && diagnostic.Severity == "warning" {
							continue
						}
						if invalid && diagnostic.Code == "TS2345" && diagnostic.Severity == "error" {
							rejected = true
							continue
						}
						t.Fatal("unexpected semantic diagnostic", diagnostic)
					}
					if rejected != invalid || !invalid && response.Code == "" {
						t.Fatal("typed source/invalid input diagnostics changed", response.Diagnostics)
					}
				})
			}
		}
	}
}
