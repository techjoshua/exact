package exactcompiler

import (
	"strings"
	"testing"
)

// Public prop reads in helpers remain ordinary even beside a selected component.
func TestMixedModulePublicRootPropHelpersStayOrdinary(t *testing.T) {
	source := `import {readPublishedRootProps} from '@exactjs/hydrate/root';
export function read(element:Element){return readPublishedRootProps(element)}
export function Page(props:{label:string}){
 function nested(element:Element){return readPublishedRootProps(element)}
 const arrow=(element:Element)=>readPublishedRootProps(element);
 void [nested,arrow];return()=>props.label;
}`
	r := NewSession().Execute(Request{Kind: "compile", ID: "mixed-root-props.ts", Source: source, Target: TargetClient, Diagnostics: "syntax"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	if len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Name != "Page" || r.Code == "" {
		t.Fatal("actual component positive missing", r.Analysis.Components)
	}
	if strings.Count(r.Code, "readPublishedRootProps(element)") != 3 || strings.Contains(r.Code, "__exactReadCompiledRootProps") {
		t.Fatalf("ordinary helper or component-owned read changed incorrectly: %s", r.Code)
	}
	if !strings.Contains(r.Code, `from "@exactjs/hydrate/root"`) &&
		!strings.Contains(r.Code, `from '@exactjs/hydrate/root'`) {
		t.Fatalf("ordinary public import was pruned: %s", r.Code)
	}
}
