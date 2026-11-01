package exactcompiler

import "testing"

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
	s := NewSession()
	for _, row := range []struct {
		name, prefix string
		browser      bool
	}{
		{"initial dormant", installer, false},
		{"constructed", installer + `new Installer();`, true},
		{"dormant again", installer, false},
		{"exported", `export ` + installer, true},
		{"private again", installer, false},
		{"lexical receiver", `class Installer{static created:unknown=new this();constructor(){Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}}`, true},
		{"final dormant", installer, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := row.prefix + `async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}`
			r := s.Execute(Request{Kind: "analyze", ID: "/virtual/private-installer-generation.ts", Source: source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			read := findCallable(t, r.Analysis.Callables, "read")
			if settlementBrowser(read) != row.browser {
				t.Fatalf("stale source-use proof: browser=%v want=%v: %#v", settlementBrowser(read), row.browser, read)
			}
		})
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
