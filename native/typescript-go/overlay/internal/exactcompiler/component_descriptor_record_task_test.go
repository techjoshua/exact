package exactcompiler

import (
	"strings"
	"testing"
)

// Placement follows the Get on the returned record. The original descriptor
// target's stored getter and a callable returned by the inherited getter both
// remain dormant until a separate Call reaches them.
func TestComponentTaskReadsReturnedDescriptorRecord(t *testing.T) {
	for _, row := range []struct {
		name, binding, read, getter string
		browser                     bool
	}{
		{"own field", `const target = {code:1};`, `Object.getOwnPropertyDescriptor(target,'code')?.value`, `document.title`, false},
		{"indexed own field", "", `Object.getOwnPropertyDescriptor({code:1},'code')?.['value']`, `document.title`, false},
		{"absent property", "", `Object.getOwnPropertyDescriptor({},'code')?.value`, `document.title`, false},
		{"accessor descriptor", `const target = {get code(){return 1}};`, `Object.getOwnPropertyDescriptor(target,'code')?.value`, `document.title`, true},
		{"computed accessor", "", `Object.getOwnPropertyDescriptor({get ['code'](){return 1}},'code')?.value`, `document.title`, true},
		{"updated target", `const target={code:1};Object.defineProperty(target,'code',{get(){return 1}});`, `Object.getOwnPropertyDescriptor(target,'code')?.value`, `document.title`, true},
		{"dormant return", "", `typeof Object.getOwnPropertyDescriptor({get code(){return 1}},'code')?.value`, `()=>document.title`, false},
		{"called return", "", `Object.getOwnPropertyDescriptor({get code(){return 1}},'code')?.value?.()`, `()=>document.title`, true},
		{"authored retrieval", "", `({getOwnPropertyDescriptor(_target:object,_key:string){return {get value(){return document.title}}}}).getOwnPropertyDescriptor({},'code')?.value`, `'unused'`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `function probe(){` + row.binding + `
Object.defineProperty(Object.prototype,'value',{configurable:true,get(){return ` + row.getter + `}});
try {return ` + row.read + `;}
finally {Reflect.deleteProperty(Object.prototype,'value');}
}` + publicAwaitRequiredPage("", "this.state.label=String(probe())", TargetServer)
			fixture := newPublicAwaitRequiredFixture(t, source)
			for _, packageType := range []string{"application", "library"} {
				request := fixture.request("compile", "entry.tsx")
				request.Target, request.PackageType = TargetServer, packageType
				response := NewSession().Execute(request)
				if response.Error != "" || len(response.Analysis.Tasks) != 1 {
					t.Fatalf("%s task analysis missing: %s %#v", packageType, response.Error, response.Diagnostics)
				}
				browserRefusal := false
				for _, diagnostic := range response.Diagnostics {
					browserRefusal = browserRefusal || diagnostic.Code == "EXACT2001" && strings.Contains(diagnostic.Message, "browser-only globals")
				}
				if row.browser {
					if !browserRefusal || response.Code != "" {
						t.Fatalf("%s browser work was not refused: %#v", packageType, response.Diagnostics)
					}
				} else if hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatalf("%s portable task did not emit: %#v", packageType, response.Diagnostics)
				}
			}
		})
	}
}
