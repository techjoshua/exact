package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Definition-time source coverage cannot borrow normal payloads. These controls
// distinguish an empty Get-effect population from relevant prototype uncertainty.
func TestSourceSettlementObligations(t *testing.T) {
	for _, row := range []struct {
		name, prefix, value, effect string
		browser                     bool
	}{
		{"literal", "", "{kind:'audit'}", "neutral", false},
		{"dormant", "function unused(){Object.defineProperty(Object.prototype,'then',{get(){window.name}})}", "{kind:'audit'}", "neutral", false},
		{"entered construction", "class Install{constructor(){Object.defineProperty(Object.prototype,'then',{get(){window.name}})}}function start(){new Install()}start();", "{kind:'audit'}", "unknown", false},
		{"direct assignment", "(Object.prototype as {then?:()=>void}).then=function(){window.name};", "{kind:'audit'}", "unknown", true},
		{"assignment own mask", "(Object.prototype as {then?:()=>void}).then=function(){window.name};", "{kind:'audit',then:undefined}", "neutral", false},
		{"assignment null prototype", "(Object.prototype as {then?:()=>void}).then=function(){window.name};", "{__proto__:null,kind:'audit'}", "neutral", false},
		{"replaced Object", "Object=null as unknown as ObjectConstructor;(Object.prototype as {then?:()=>void}).then=function(){window.name};", "{kind:'audit'}", "unknown", false},
		{"captured assignment", "function install(read:()=>string){(Object.prototype as {then?:()=>void}).then=function(){read()}}install(()=>window.name);", "{kind:'audit'}", "unknown", true},
		{"foreign", "declare function foreign(v:object):void;foreign(Object.prototype);", "{kind:'audit'}", "unknown", false},
		{"foreign array", "declare function foreign(v:object):void;foreign([Object.prototype]);", "{kind:'audit'}", "unknown", false},
		{"foreign object", "declare function foreign(v:object):void;foreign({proto:Object.prototype});", "{kind:'audit'}", "unknown", false},
		{"dead writer", "if(false){Object.defineProperty(Object.prototype,'then',{get(){window.name}})}", "{kind:'audit'}", "neutral", false},
		{"foreign receiver", "declare global{interface Object{install():void}}Object.prototype.install();", "{kind:'audit'}", "unknown", false},
		{"own mask", "declare function foreign(v:object):void;foreign(Object.prototype);", "{kind:'audit',then:undefined}", "neutral", false},
		{"browser getter", "Object.defineProperty(Object.prototype,'then',{get(){window.name;return undefined}});", "{kind:'audit'}", "unknown", true},
		{"server getter", "declare const process:{cwd():string};Object.defineProperty(Object.prototype,'then',{get(){process.cwd();return undefined}});", "{kind:'audit'}", "unknown", false},
		{"throwing getter", "Object.defineProperty(Object.prototype,'then',{get(){window.name;throw 'stop'}});", "{kind:'audit'}", "unknown", true},
		{"callable then", "Object.defineProperty(Object.prototype,'then',{value:function(){window.name}});", "{kind:'audit'}", "unknown", true},
		{"native host", "Object.prototype.toString();", "{kind:'audit'}", "neutral", false},
		{"captured getter", "function install(read:()=>string){Object.defineProperty(Object.prototype,'then',{get(){read();return undefined}})}install(()=>window.name);", "{kind:'audit'}", "unknown", true},
		{"null prototype", "Object.defineProperty(Object.prototype,'then',{get(){window.name;return undefined}});", "{__proto__:null,kind:'audit'}", "neutral", false},
		{"local Object", "const Object={prototype:{},defineProperty(...args:unknown[]){}};Object.defineProperty(Object.prototype,'then',{get(){window.name;return undefined}});", "{kind:'audit'}", "neutral", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			session := NewSession()
			r := session.Execute(Request{Kind: "analyze", ID: "/virtual/source-settlement-" + row.name + ".ts", Source: row.prefix + "async function make(){return " + row.value + "}export async function read(){return (await make()).kind}", Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatalf("invalid source: %s %#v", r.Error, r.Diagnostics)
			}
			for _, project := range session.projects {
				source := project.program.GetSourceFile("/virtual/source-settlement-" + row.name + ".ts")
				if source == nil {
					continue
				}
				var returned, literal, prototype *ast.Node
				walkNode(source.AsNode(), func(node *ast.Node) bool {
					if ast.IsReturnStatement(node) && node.AsReturnStatement().Expression != nil && ast.IsObjectLiteralExpression(unwrapSourceCallableReference(node.AsReturnStatement().Expression)) {
						returned = node
						literal = unwrapSourceCallableReference(node.AsReturnStatement().Expression)
					}
					if ast.IsPropertyAccessExpression(node) && node.Name().Text() == "prototype" && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "Object" {
						prototype = node.Expression()
					}
					return true
				})
				if literal == nil {
					t.Fatal("missing return allocation")
				}
				query := sourceValueQuery{owner: project.callableCache.owner.values, executable: project.callableCache.owner, effectOwner: enclosingCallableNode(returned), remaining: 4096, active: make(map[*ast.Node]bool)}
				get := &sourceGetInputs{operation: returned, receiver: sourceValue{node: literal}, propertyKey: "then"}
				if prototype != nil && query.sourceSettlementPrototype(sourceValue{node: prototype, path: []string{"prototype"}}, literal, get) {
					t.Error("normal mode acquired source prototype relation")
				}
				if prototype != nil && (row.name == "browser getter" || row.name == "local Object" || row.name == "replaced Object" || row.name == "null prototype" || row.name == "own mask") {
					query.dependenciesOnly = true
					value := sourceValue{node: prototype, path: []string{"prototype"}}
					if got := query.sourceSettlementPrototype(value, literal, get); got != (row.name == "browser getter") {
						t.Errorf("source prototype relation=%v", got)
					}
					wrong := *get
					wrong.propertyKey = "value"
					if query.sourceSettlementPrototype(value, literal, &wrong) {
						t.Error("unrelated key acquired settlement relation")
					}
					wrong = *get
					wrong.operation = literal
					if query.sourceSettlementPrototype(value, literal, &wrong) {
						t.Error("non-return operation acquired settlement relation")
					}
					query.dependenciesOnly = false
				}
				if row.name == "literal" || row.name == "foreign" || row.name == "browser getter" {
					obligations := query.sourceSettlementThen(get, nil)
					if len(obligations.effects.values) != 0 || len(obligations.effects.callableScopes) != 0 || query.inputs != nil || query.operation != nil {
						t.Error("source obligations published value or installed a normal frame")
					}
				}
			}
			make := findCallable(t, r.Analysis.Callables, "make")
			if row.name == "server getter" {
				server := false
				for _, source := range make.EffectSources {
					server = server || source.Environment == "server"
				}
				if !server {
					t.Error("inherited getter lost server resource")
				}
			}
			if make.Effect != row.effect || settlementBrowser(make) != row.browser {
				t.Errorf("make effect=%s browser=%v, want %s/%v", make.Effect, settlementBrowser(make), row.effect, row.browser)
			}
		})
	}
}

// Emission preserves the engine's implicit Get and continuation order. Analysis
// must not evaluate the getter, and a masked own slot must not touch inheritance.
func TestSourceSettlementEmission(t *testing.T) {
	source := `const events:string[]=[];Object.defineProperty(Object.prototype,'then',{configurable:true,get(){events.push('get');return undefined}});async function make(){events.push('make');return {kind:'audit'}};async function masked(){return {kind:'masked',then:undefined}}export async function read(){const value=await make();events.push(value.kind);const own=await masked();events.push(own.kind);return events.join(',')}`
	r := NewSession().Execute(Request{Kind: "compile", ID: "source-settlement-emission.ts", Source: source, Diagnostics: "semantic", Target: TargetClient, PreserveOrdinaryModules: true})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
		t.Fatalf("emission: %s %#v", r.Error, r.Diagnostics)
	}
	sourceNodeScript(t, r.Code, `const fs=require('node:fs'),vm=require('node:vm');const sandbox={exports:{}};vm.runInNewContext('(function(exports){'+fs.readFileSync(process.argv[1],'utf8')+'\n})(exports)',sandbox);sandbox.exports.read().then(value=>{if(value!=='make,get,audit,masked')throw Error(value)}).catch(error=>{console.error(error);process.exitCode=1});`)
}
