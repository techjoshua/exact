package exactcompiler

import (
	"os"
	"strings"
	"testing"
)

// Class syntax must not weaken the existing private-function use population.
// Unobserved installation is deferred. A call, alias, escape or eval denies
// the exclusion and preserves possible getter effects independently of unknowns.
func TestPrivateInstallerWithClassSyntax(t *testing.T) {
	const installer = `function install(){Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}class Unentered{}`
	for _, row := range []struct {
		name, use string
		browser   bool
	}{
		{"dormant", ``, false},
		{"direct", `install();`, true},
		{"alias", `const start=install;start();`, true},
		{"escape", `declare function retain(value:unknown):void;retain(install);`, true},
		{"direct eval", `eval("install()");`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := installer + row.use + `async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}`
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/private-installer-class.ts", Source: source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			read := findCallable(t, r.Analysis.Callables, "read")
			if settlementBrowser(read) != row.browser {
				t.Fatalf("browser=%v want=%v: %#v", settlementBrowser(read), row.browser, read)
			}
		})
	}
}

// A generation-owned positive use proof expires when construction, export or
// lexical-this exposure changes, including a later return to dormant source.
func TestPrivateConstructionEligibilitySourceReplacement(t *testing.T) {
	const installer = `class Installer{constructor(){Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}}`
	const read = `async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}`
	const publish = `this.state.label=await read()`
	rows := []struct {
		name, prefix string
		browser      bool
		clientInit   bool
	}{
		{"initial dormant", installer, false, false},
		{"constructed", installer + "\n/** @exact client */\nnew Installer();", true, true},
		{"dormant again", installer, false, false},
		{"exported", "export " + installer, true, false},
		{"private again", installer, false, false},
		{"lexical receiver", "/** @exact client */\n" + strings.Replace(installer, "constructor()", "\nstatic created:unknown=new this();\nconstructor()", 1), true, true},
		{"final dormant", installer, false, false},
	}
	for _, placement := range []Target{TargetClient, TargetServer} {
		fixture := newPublicAwaitRequiredFixture(t, "")
		session := NewSession()
		for _, row := range rows {
			t.Run(string(placement)+"/"+row.name, func(t *testing.T) {
				source := row.prefix + "\n" + read + "\n" + publicAwaitRequiredPage("", publish, placement)
				fixture.files["entry.tsx"] = source
				request := fixture.request("compile", "entry.tsx")
				if err := os.WriteFile(request.ID, []byte(source), 0600); err != nil {
					t.Fatal(err)
				}
				request.Target = placement
				response := session.Execute(request)
				if response.Error != "" || len(response.Analysis.Tasks) != 1 || len(response.Analysis.Components) != 1 {
					t.Fatal(response.Error, response.Diagnostics)
				}
				task := response.Analysis.Tasks[0]
				browser := false
				for _, effect := range task.EffectSources {
					browser = browser || effect.Environment == "browser" && effect.Description == "window"
				}
				if browser != row.browser {
					t.Fatalf("stale source-use proof: browser=%v want=%v: %#v", browser, row.browser, task.EffectSources)
				}
				denied := placement == TargetServer && row.browser
				refused := false
				for _, diagnostic := range response.Diagnostics {
					if diagnostic.Severity != "error" {
						continue
					}
					if diagnostic.Code == "EXACT2001" && strings.Contains(diagnostic.Message, "task requests server placement but references browser-only globals") {
						refused = true
					} else if !(row.clientInit && placement == TargetServer && diagnostic.Code == "EXACT2101") {
						t.Fatal(diagnostic)
					}
				}
				if refused != denied || (response.Code == "") != denied {
					t.Fatal(placement, response.Diagnostics)
				}
			})
		}
	}
}

// Discovery can have a checker-backed syntax owner before Program attachment.
// It cannot issue a source-phase exclusion or dereference a missing Program.
func TestPrivateDeferredDefinitionRequiresProgram(t *testing.T) {
	source := parseNormalizationSource("/virtual/private-discovery.ts", `export{};function install(){}`)
	query := sourceValueQuery{owner: &sourceValueOwner{}, remaining: 32}
	if query.privateDeferredDefinitionExcluded(source.AsNode(), &accessorCandidates{}) {
		t.Fatal("unattached discovery issued source exclusion")
	}
}
