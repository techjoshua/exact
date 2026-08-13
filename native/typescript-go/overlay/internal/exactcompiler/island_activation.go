package exactcompiler

import (
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

var lazyEventPolicies = map[string]LazyEventPolicy{
	"onClick":           {Type: "click", Replay: "native-click"},
	"onClickCapture":    {Type: "click", Replay: "native-click"},
	"onSubmit":          {Type: "submit", Replay: "request-submit"},
	"onSubmitCapture":   {Type: "submit", Replay: "request-submit"},
	"onInput":           {Type: "input", Replay: "latest-value"},
	"onInputCapture":    {Type: "input", Replay: "latest-value"},
	"onChange":          {Type: "change", Replay: "latest-value"},
	"onChangeCapture":   {Type: "change", Replay: "latest-value"},
	"onFocus":           {Type: "focus", Replay: "notification"},
	"onFocusCapture":    {Type: "focus", Replay: "notification"},
	"onBlur":            {Type: "blur", Replay: "notification"},
	"onBlurCapture":     {Type: "blur", Replay: "notification"},
	"onFocusIn":         {Type: "focusin", Replay: "notification"},
	"onFocusInCapture":  {Type: "focusin", Replay: "notification"},
	"onFocusOut":        {Type: "focusout", Replay: "notification"},
	"onFocusOutCapture": {Type: "focusout", Replay: "notification"},
	"value:onInput":     {Type: "input", Replay: "latest-value"},
	"value:onChange":    {Type: "change", Replay: "latest-value"},
	"checked:onChange":  {Type: "change", Replay: "latest-value"},
}

func analyzeIslandActivation(
	sourceFile *ast.SourceFile,
	opening *ast.Node,
	typeChecker *checker.Checker,
	targetID string,
) ActivationDecision {
	decision := ActivationDecision{Mode: "eager", Reasons: []ActivationReason{}, Targets: []ActivationTarget{}}
	policies := make(map[string]LazyEventPolicy)
	attributes := opening.Attributes()
	if attributes == nil {
		return decision
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxSpreadAttribute(property) {
			spread := property.AsJsxSpreadAttribute().Expression
			properties, reason := finiteIslandSpread(sourceFile, spread, typeChecker, nil)
			if reason != "" {
				decision.Reasons = append(decision.Reasons, activationReason(reason, property, ""))
				continue
			}
			for _, member := range properties {
				values := []*ast.Node{}
				finiteSpreadPropertyLeafValues(&member, &values)
				for _, value := range values {
					addIslandEventPolicy(&decision, policies, member.name, value, property, typeChecker)
				}
			}
			continue
		}
		attribute := property.AsJsxAttribute()
		name := jsxAttributeText(attribute.Name())
		if name == "ref" {
			decision.Reasons = append(decision.Reasons, activationReason("ref", property, ""))
			continue
		}
		value := islandJSXAttributeValue(attribute.Initializer)
		addIslandEventPolicy(&decision, policies, name, value, property, typeChecker)
	}
	if len(decision.Reasons) != 0 || len(policies) == 0 {
		return decision
	}
	events := make([]LazyEventPolicy, 0, len(policies))
	for _, eventType := range []string{"click", "submit", "input", "change", "focus", "blur", "focusin", "focusout"} {
		if policy, exists := policies[eventType]; exists {
			events = append(events, policy)
		}
	}
	decision.Mode = "interaction"
	decision.Targets = []ActivationTarget{{ID: targetID, Events: events}}
	return decision
}

func addIslandEventPolicy(
	decision *ActivationDecision,
	policies map[string]LazyEventPolicy,
	name string,
	value *ast.Node,
	rangeNode *ast.Node,
	typeChecker *checker.Checker,
) {
	if !interactiveJSXAttribute(name) || name == "ref" {
		return
	}
	policy, approved := lazyEventPolicies[name]
	if !approved {
		decision.Reasons = append(decision.Reasons, activationReason("unsupported-event", rangeNode, name))
		return
	}
	if !strings.Contains(name, ":") && value != nil &&
		islandHandlerUsesUnsupportedEventData(value, policy.Type, typeChecker, nil) {
		decision.Reasons = append(decision.Reasons, activationReason("unsupported-event-data", rangeNode, name))
		return
	}
	policies[policy.Type] = policy
}

func activationReason(code string, node *ast.Node, detail string) ActivationReason {
	return ActivationReason{Code: code, Start: node.Pos(), Length: node.End() - node.Pos(), Detail: detail}
}

func islandJSXAttributeValue(initializer *ast.JsxAttributeValue) *ast.Node {
	if initializer != nil && ast.IsJsxExpression(initializer) {
		return initializer.AsJsxExpression().Expression
	}
	if initializer == nil {
		return nil
	}
	return initializer.AsNode()
}

func islandHandlerUsesUnsupportedEventData(
	value *ast.Node,
	eventType string,
	typeChecker *checker.Checker,
	visiting map[ast.SymbolId]struct{},
) bool {
	value = unwrapIslandSpreadExpression(value)
	if ast.IsIdentifier(value) && typeChecker != nil {
		symbol := typeChecker.GetSymbolAtLocation(value)
		if symbol == nil || symbol.ValueDeclaration == nil {
			return true
		}
		if visiting == nil {
			visiting = make(map[ast.SymbolId]struct{})
		}
		id := ast.GetSymbolId(symbol)
		if _, cycle := visiting[id]; cycle {
			return true
		}
		visiting[id] = struct{}{}
		declaration := symbol.ValueDeclaration
		if ast.IsVariableDeclaration(declaration) {
			declaration = declaration.AsVariableDeclaration().Initializer
		}
		result := declaration == nil || islandHandlerUsesUnsupportedEventData(declaration, eventType, typeChecker, visiting)
		delete(visiting, id)
		return result
	}
	if value == nil ||
		(!ast.IsArrowFunction(value) && !ast.IsFunctionExpression(value) && !ast.IsFunctionDeclaration(value)) {
		return true
	}
	if value.Parameters() == nil || len(value.Parameters()) == 0 {
		return false
	}
	if typeChecker == nil {
		return true
	}
	parameter := value.Parameters()[0].Name()
	if parameter == nil || !ast.IsIdentifier(parameter) {
		return true
	}
	name := parameter.Text()
	parameterSymbol := typeChecker.GetSymbolAtLocation(parameter)
	if parameterSymbol == nil {
		return true
	}
	firstAwait := -1
	walkNode(value.Body(), func(node *ast.Node) bool {
		if ast.IsAwaitExpression(node) && (firstAwait < 0 || node.Pos() < firstAwait) {
			firstAwait = node.Pos()
		}
		return true
	})
	unsupported := false
	walkNode(value.Body(), func(node *ast.Node) bool {
		if unsupported || !ast.IsIdentifier(node) || node.Text() != name ||
			typeChecker.GetSymbolAtLocation(node) != parameterSymbol {
			return !unsupported
		}
		if firstAwait >= 0 && node.Pos() > firstAwait {
			unsupported = true
			return false
		}
		for current := node.Parent; current != nil && current != value.Body(); current = current.Parent {
			if ast.IsArrowFunction(current) || ast.IsFunctionExpression(current) || ast.IsFunctionDeclaration(current) {
				unsupported = true
				return false
			}
		}
		parent := node.Parent
		if parent == nil || !ast.IsPropertyAccessExpression(parent) ||
			parent.AsPropertyAccessExpression().Expression != node {
			unsupported = true
			return false
		}
		outer := parent
		for outer.Parent != nil && ast.IsPropertyAccessExpression(outer.Parent) &&
			outer.Parent.AsPropertyAccessExpression().Expression == outer {
			outer = outer.Parent
		}
		member := outer.AsPropertyAccessExpression().Name().Text()
		if !islandEventMemberAllowed(eventType, member) {
			unsupported = true
		}
		return !unsupported
	})
	return unsupported
}

func islandEventMemberAllowed(eventType, member string) bool {
	switch member {
	case "type", "target", "currentTarget":
		return true
	case "value", "checked", "name", "id", "form", "selectedIndex", "selectedOptions":
		return eventType == "input" || eventType == "change"
	case "submitter":
		return eventType == "submit"
	default:
		return false
	}
}
