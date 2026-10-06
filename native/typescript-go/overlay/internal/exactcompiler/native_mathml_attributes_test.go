package exactcompiler

import "testing"

// Valid MathML attributes must survive native validation and both executable targets.
func TestMathMLAttributesWithoutIDLProperties(t *testing.T) {
	for _, source := range []string{
		`<math display="block" alttext="fraction" mathcolor="red" mathbackground="white" mathsize="1em" displaystyle="true" scriptlevel="0" intent="sum" arg="x"><mi mathvariant="normal">x</mi><mo form="infix" fence="false" separator="false" lspace="1em" rspace="1em" stretchy="true" symmetric="true" maxsize="2em" minsize="1em" largeop="true" movablelimits="true">+</mo></math>`,
		`<math><mfrac linethickness="1px"><mn>1</mn><mn>2</mn></mfrac><mspace width="1em" height="1em" depth="1em"/><ms lquote="(" rquote=")">x</ms><mpadded width="1em" height="1em" depth="1em" lspace="1em" voffset="1em"><mi>x</mi></mpadded></math>`,
		`<math><munder accentunder="true"><mi>x</mi><mo>_</mo></munder><mover accent="true"><mi>x</mi><mo>^</mo></mover><munderover accent="true" accentunder="true"><mi>x</mi><mo>_</mo><mo>^</mo></munderover></math>`,
		`<math><mtable><mtr><mtd columnspan="2" rowspan="2"><mi>x</mi></mtd></mtr></mtable><maction actiontype="toggle" selection="1"><mi>x</mi></maction><semantics><mi>x</mi><annotation encoding="text/plain">x</annotation></semantics></math>`,
		`<math {...{DISPLAY:"block",mathcolor:"red"}}><mfrac {...{linethickness:"1px"}}><mi>x</mi><mn>2</mn></mfrac></math>`,
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(string(target)+source, func(t *testing.T) {
				response := NewSession().Execute(Request{ID: "mathml-props.tsx", Kind: "compile", Target: target, Source: `export function Page(){return()=> ` + source + `;}`})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatalf("MathML attributes rejected: %s %#v", response.Error, response.Diagnostics)
				}
			})
		}
	}
	for _, element := range []string{`<div display="block"/>`, `<math displai="block"/>`, `<mi linethickness="1px"/>`, `<math innerHTML="bad"/>`, `<math onclick="bad"/>`} {
		response := NewSession().Execute(Request{ID: "invalid-mathml.tsx", Kind: "compile", Target: TargetClient, Source: `export function Page(){return()=> ` + element + `;}`})
		found := false
		for _, diagnostic := range response.Diagnostics {
			found = found || diagnostic.Code == "EXACT_NATIVE_PROP"
		}
		if !found || response.Code != "" {
			t.Fatalf("invalid attribute emitted: %s %#v", response.Error, response.Diagnostics)
		}
	}
}
