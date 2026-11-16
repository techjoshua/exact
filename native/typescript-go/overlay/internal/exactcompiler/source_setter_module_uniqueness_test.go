package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The real module read owns this proof. Transparent wrappers cannot remove a
// second possible setter invocation from its single-invocation input domain.
func TestSetterModuleAssignmentUniqueness(t *testing.T) {
	for _, row := range []struct {
		name, prefix, writes, actual string
	}{
		{"directOnly", "", "box.work=safe;", "safe"},
		{"wrappedOnly", "", "(box.work)=donor;", "donor"},
		{"directThenWrapped", "", "box.work=safe;(box.work)=donor;", ""},
		{"wrappedThenDirect", "", "(box.work)=donor;box.work=safe;", ""},
		{"directThenAsserted", "", "box.work=safe;(box.work as {value:string})=donor;", ""},
		{"directThenElement", "", "box.work=safe;(box['work'])=donor;", ""},
		{"twoDirect", "", "box.work=safe;box.work=donor;", ""},
		{"twoWrapped", "", "(box.work)=safe;(box.work)=donor;", ""},
		{"conditionalSecond", "declare const choose:boolean;", "box.work=safe;if(choose){(box.work)=donor;}", ""},
		{"compoundOnly", "", "box.work ||= donor;", ""},
		{"differentReceiverOnly", "const other={field:{value:'other'},set work(next:{value:string}){this.field=next}};", "other.work=donor;", ""},
		{"uncertainDescriptor", "declare function foreign(value:object):void;", "foreign(box);box.work=safe;", ""},
	} {
		t.Run(row.name, func(t *testing.T) {
			const prefix = "const box={field:{value:'initial'},set work(next:{value:string}){this.field=next}};const safe={value:'safe'};const donor={get value(){return document.title}};"
			source := row.prefix + prefix + row.writes + "export const value=box.field.value;"
			session, response, summary := currentProxyCaller(t, source, "export const value")
			if hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal("strict source consumer rejected", response.Diagnostics)
			}
			browser := false
			for _, effect := range summary.EffectSources {
				browser = browser || effect.Environment == "browser"
			}
			if row.name == "directOnly" && browser {
				t.Fatal("uninvoked donor getter became a direct-only effect", summary.EffectSources)
			}
			// Only a proved single invocation supplies the actual receiver/RHS
			// mapping tested here. Multi-invocation rows must refuse that proof;
			// they do not certify the separate public getter-source consumer.
			if row.actual == "donor" {
				if !browser {
					t.Fatal("actual module Get lost its getter donor", summary.EffectSources)
				}
			}
			entered := false
			for _, project := range session.projects {
				file := project.program.GetSourceFile("/virtual/possible-proxy.ts")
				if file == nil {
					continue
				}
				var box, bodyWrite, read, originalWrite, actual *ast.Node
				walkNode(file.AsNode(), func(node *ast.Node) bool {
					if ast.IsVariableDeclaration(node) && ast.IsIdentifier(node.Name()) {
						switch node.Name().Text() {
						case "box":
							box = node.Initializer()
						case "value":
							read = node.Initializer()
						}
						if row.actual != "" && node.Name().Text() == row.actual {
							actual = node.Initializer()
						}
					}
					if ast.IsBinaryExpression(node) && node.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
						member := unwrapSourceCallableReference(node.AsBinaryExpression().Left)
						if ast.IsPropertyAccessExpression(member) || ast.IsElementAccessExpression(member) {
							receiver, key := accessorReceiver(member)
							writer := enclosingCallableNode(member)
							if writer != nil && ast.IsSetAccessorDeclaration(writer) && writer.Parent == box && key == "field" {
								bodyWrite = member
							}
							if writer == nil && ast.IsIdentifier(receiver) && receiver.Text() == "box" && key == "work" {
								originalWrite = member
							}
						}
					}
					return true
				})
				if box == nil || bodyWrite == nil || read == nil || row.actual != "" && (actual == nil || originalWrite == nil) {
					t.Fatal("original module/setter/read endpoints absent")
				}
				owner := project.callableCache.owner
				query := newSourceDependencyQuery(read, owner.values.checker, owner, nil)
				producer, bound := query.setterWriteProducer(bodyWrite, nil)
				if row.actual == "" {
					if producer != nil || len(bound) != 0 {
						t.Fatal("ambiguous or unsupported invocation gained a unique producer", producer)
					}
				} else {
					writer := enclosingCallableNode(bodyWrite)
					parameter := writer.Parameters()[0].Name()
					symbol := owner.values.checker.GetSymbolAtLocation(parameter)
					values := bound[ast.GetSymbolId(symbol)]
					if producer != sourceProducerStatement(originalWrite) || len(values) != 1 || values[0].node != actual || len(values[0].path) != 0 {
						t.Fatal("performed producer or original RHS input lost", producer, values)
					}
					if receiver := bound[0]; len(receiver) != 1 || receiver[0].node != box || len(receiver[0].path) != 0 {
						t.Fatal("original setter receiver lost", receiver)
					}
				}
				// Consume the same authored module Get through its owning API. This
				// establishes entry, not a normal-value or graph-currentness receipt.
				consumer := newSourceDependencyQuery(read, owner.values.checker, owner, nil)
				consumer.evaluatedSourceAccessors(read, nil)
				if consumer.setterInput != nil || consumer.sourceReceiver != nil {
					t.Fatal("setter input escaped original module Get")
				}
				entered = true
			}
			if !entered {
				t.Fatal("strict original module consumer unentered")
			}
		})
	}
}

// This is the existing captured-setter getter source. A known browser donor
// remains beside independent unknown execution; unknown is not completion.
func TestSetterModuleGetKnownBrowserAndUnknown(t *testing.T) {
	const source = `declare function foreign(write:()=>void):void;const box={field:{value:"safe"},set other(value:{value:string}){this.field=value}};function install(){box.other={get value(){return document.title}}}foreign(install);const selected=box.field;export const value=selected.value;`
	_, response, summary := currentProxyCaller(t, source, "export const value")
	if hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal("strict module getter rejected", response.Diagnostics)
	}
	browser, unknown := false, false
	for _, effect := range summary.EffectSources {
		browser = browser || effect.Environment == "browser"
		unknown = unknown || effect.Environment == "unknown"
	}
	if !browser || !unknown {
		t.Fatal("module getter lost known browser donor or independent unknown", summary.EffectSources)
	}
}
