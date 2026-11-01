package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// bindProxyTrapInputs instantiates a possible native Get trap's source demands.
// The protocol supplies an object target and property key. Their definedness
// bypasses top-level defaults without establishing a concrete Proxy result or
// nested DATA property. Only an explicit original source reference establishes
// receiver definedness. Unanchored receivers include possible undefined from
// reflective callers. Keys remain abstract property keys.
func (q *sourceValueQuery) bindProxyTrapInputs(body *ast.Node, handler sourceValue, targets []sourceValue, captures sourceValueBindings, result *accessorCandidates, definedReceiver bool) *sourceValueInputs {
	inputs := &sourceValueInputs{declaration: body, invocation: q.invoking, bindings: make(sourceValueBindings, len(captures)+1), defaults: make(map[*ast.Node]sourceDefaultInput)}
	for id, values := range captures {
		if !q.charge(result, body) {
			return inputs
		}
		inputs.bindings[id] = values
	}
	if !ast.IsArrowFunction(body) {
		inputs.bindings[0] = []sourceValue{handler}
	}
	_, ordinary := ordinaryResultCategory(body)
	inputs.deferredBody = !ordinary
	if len(targets) == 0 {
		targets = []sourceValue{{}}
	}
	actuals := [][]sourceValue{targets, {{}}, {{}}}
	position := 0
	for _, parameter := range body.Parameters() {
		if !q.charge(result, parameter) {
			break
		}
		if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
			continue
		}
		values := []sourceValue{{undefined: true}}
		supplied := position < len(actuals)
		if supplied {
			values = actuals[position]
		}
		if parameter.AsParameterDeclaration().DotDotDotToken != nil {
			rest := make([][]sourceValue, 0)
			if supplied {
				rest = actuals[position:]
			}
			values = []sourceValue{{node: parameter.Name(), rest: rest}}
			q.installParameterInput(parameter, values, inputs, result)
			break
		}
		if supplied && (position < 2 || position == 2 && definedReceiver) {
			// The native protocol guarantees supplied arguments, not their nested
			// properties. Pattern binding still owns all nested reads/defaults.
			if initializer := parameter.Initializer(); initializer != nil {
				inputs.defaults[initializer] = sourceDefaultInput{}
				inputs.order = append(inputs.order, initializer)
			}
			q.bindInputPattern(parameter.Name(), values, inputs.bindings, result, accessorAcquire, inputs)
		} else {
			q.installParameterInput(parameter, values, inputs, result)
		}
		q.owner.substitutions += len(values)
		q.recordFacts(len(values))
		if len(values) > q.owner.maxTerms {
			q.owner.maxTerms = len(values)
		}
		position++
	}
	return inputs
}
