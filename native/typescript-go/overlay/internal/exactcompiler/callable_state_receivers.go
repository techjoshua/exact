package exactcompiler

import (
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// effectArgumentRoot retains property boundaries without treating an authored dotted key as a path.
func effectArgumentRoot(node *ast.Node) (*ast.Node, []string) {
	path := []string{}
	for {
		node = unwrapRenderExpression(node)
		switch {
		case ast.IsPropertyAccessExpression(node):
			member := node.AsPropertyAccessExpression()
			path = append(path, member.Name().Text())
			node = member.Expression
		case ast.IsElementAccessExpression(node):
			member := node.AsElementAccessExpression()
			key := "*"
			if member.ArgumentExpression != nil && (ast.IsStringLiteral(member.ArgumentExpression) || ast.IsNumericLiteral(member.ArgumentExpression)) {
				key = member.ArgumentExpression.Text()
			}
			path = append(path, key)
			node = member.Expression
		default:
			for left, right := 0, len(path)-1; left < right; left, right = left+1, right-1 {
				path[left], path[right] = path[right], path[left]
			}
			return node, path
		}
	}
}

// mapStateEffects maps every call site, not just the first invocation of a shared helper.
// Parameter effects remain relative until a call binds them to an actual component state path.
func mapStateEffects(effects []StateEffect, edges []CallEdge, targetID string) []StateEffect {
	result := []StateEffect{}
	for _, effect := range effects {
		if effect.Receiver == nil || effect.Receiver.Kind != "parameter" {
			result = append(result, effect)
			continue
		}
		matched := false
		for _, edge := range edges {
			if !edge.Resolved || edge.TargetID != targetID {
				continue
			}
			for _, binding := range edge.ReceiverBindings {
				if binding.ParameterIndex != effect.Receiver.Index {
					continue
				}
				matched = true
				result = append(result, bindStateEffect(effect, binding))
			}
		}
		if !matched {
			result = append(result, bindStateEffect(effect, ReceiverBinding{Source: "unknown"}))
		}
	}
	return uniqueStateEffects(result)
}

func bindStateEffect(effect StateEffect, binding ReceiverBinding) StateEffect {
	if binding.Source != "component" && binding.Source != "parameter" || effect.pathSegments == nil {
		effect.Receiver = &StateReceiver{Kind: "unknown"}
		effect.Confidence = "unknown"
		return effect
	}
	path := append([]string{}, binding.Path...)
	if effect.Receiver.Root != "value" {
		path = append(path, "state")
	}
	path = append(path, effect.pathSegments...)
	root := "value"
	if len(path) != 0 && path[0] == "state" {
		root = ""
		path = path[1:]
	}
	if binding.Source == "component" && root != "" {
		effect.Receiver = &StateReceiver{Kind: "unknown"}
		effect.Confidence = "unknown"
		return effect
	}
	// Recursive helper calls can keep descending through a data tree. Widen at a finite depth
	// so fixed-point analysis terminates. The wildcard fails closed for remote publication.
	if len(path) > 32 {
		path = append(path[:32], "*")
	}
	for index, segment := range path {
		if segment == "*" {
			path = path[:index+1]
			effect.Confidence = "unknown"
			break
		}
	}
	effect.pathSegments = path
	effect.Path = strings.Join(path, ".")
	effect.Receiver = &StateReceiver{Kind: binding.Source, Index: binding.SourceParameterIndex, Root: root}
	return effect
}

// componentStateEffects prevents mutations of ordinary helper arguments from becoming state authority.
func componentStateEffects(effects []StateEffect) []StateEffect {
	result := []StateEffect{}
	for _, effect := range effects {
		if effect.Receiver == nil || effect.Receiver.Kind == "component" {
			result = append(result, effect)
		}
	}
	return result
}

// opaqueCallStateEffects refuses to infer a finite remote write grant for code whose body is absent.
// Passing a state receiver to such a dependency requires returning data and assigning it explicitly.
func opaqueCallStateEffects(fact *callableFacts) []StateEffect {
	result := []StateEffect{}
	for _, edge := range fact.summary.Calls {
		if edge.Resolved {
			continue
		}
		opaque := false
		for _, source := range fact.summary.DirectEffectSources {
			if source.Opaque && source.Description == "unresolved call "+edge.Name {
				opaque = true
				break
			}
		}
		if !opaque {
			continue
		}
		for _, binding := range edge.ReceiverBindings {
			if binding.Source == "unknown" {
				continue
			}
			effect := StateEffect{Path: "*", pathSegments: []string{"*"}, Kind: "write", Confidence: "unknown", Receiver: &StateReceiver{Kind: "parameter", Root: "value"}}
			result = append(result, bindStateEffect(effect, binding))
		}
	}
	return result
}

// Primitive arguments are values, so an opaque callee cannot mutate their component source slot.
func stateArgumentMayOwnMutations(value *checker.Type) bool {
	if value == nil {
		return true
	}
	primitives := checker.TypeFlagsStringLike | checker.TypeFlagsNumberLike | checker.TypeFlagsBooleanLike | checker.TypeFlagsBigIntLike | checker.TypeFlagsESSymbolLike | checker.TypeFlagsNull | checker.TypeFlagsUndefined
	for _, member := range value.Distributed() {
		if member.Flags()&primitives == 0 {
			return true
		}
	}
	return false
}
