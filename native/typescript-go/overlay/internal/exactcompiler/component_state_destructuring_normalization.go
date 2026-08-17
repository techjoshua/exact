package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
)

// destructuredStateBinding connects a generated pattern temporary to the
// component state target that receives the destructured value.
type destructuredStateBinding struct {
	target    *ast.Node
	temporary string
}

func preprocessComponentStateDestructuring(
	fileName string,
	source string,
) (string, error) {
	edits, err := planComponentStateDestructuring(fileName, source)
	if err != nil {
		return "", err
	}
	return applySourceEdits(source, edits), nil
}

func planComponentStateDestructuring(
	fileName string,
	source string,
) ([]sourceEdit, error) {
	sourceFile := parseNormalizationSource(fileName, source)
	edits := []sourceEdit{}
	rewritten := map[string]struct{}{}
	renderCallables := normalizationRenderCallables(sourceFile)
	if err := validateRenderDestructuring(
		sourceFile,
		renderCallables,
	); err != nil {
		return nil, err
	}
	var normalizationError error
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if normalizationError != nil {
			return false
		}
		if !isComponentComputationFunction(node, sourceFile) {
			return true
		}
		body := node.Body()
		if body == nil || !ast.IsBlock(body) {
			return false
		}
		stateAliases := normalizationStateAliases(node)
		for _, statement := range body.AsBlock().Statements.Nodes {
			if ast.IsReturnStatement(statement) {
				continue
			}
			visitDirectComponentSyntax(statement, func(candidate *ast.Node) {
				if normalizationError != nil || !ast.IsExpressionStatement(candidate) {
					return
				}
				expression := unwrapNormalizationParentheses(
					candidate.AsExpressionStatement().Expression,
				)
				if !ast.IsBinaryExpression(expression) {
					return
				}
				binary := expression.AsBinaryExpression()
				if binary.OperatorToken.Kind != ast.KindEqualsToken ||
					(!ast.IsArrayLiteralExpression(binary.Left) &&
						!ast.IsObjectLiteralExpression(binary.Left)) {
					return
				}
				bindings := []destructuredStateBinding{}
				prefix := fmt.Sprintf(
					"__exactDestructured_%d",
					nodeTokenStart(sourceFile, candidate),
				)
				pattern, err := rewriteDestructuredStatePattern(
					sourceFile,
					binary.Left,
					prefix,
					&bindings,
					false,
				)
				if err != nil {
					normalizationError = err
					return
				}
				if len(bindings) == 0 {
					return
				}
				var bodyText strings.Builder
				for _, binding := range bindings {
					if bodyText.Len() != 0 {
						bodyText.WriteByte(' ')
					}
					bodyText.WriteString(normalizationNodeText(sourceFile, binding.target))
					bodyText.WriteString(" = ")
					bodyText.WriteString(binding.temporary)
					bodyText.WriteByte(';')
				}
				edits = append(edits, sourceEdit{
					start: nodeTokenStart(sourceFile, candidate),
					end:   candidate.End(),
					text: fmt.Sprintf(
						"{ const %s = %s; %s }",
						pattern,
						normalizationNodeText(sourceFile, binary.Right),
						bodyText.String(),
					),
				})
				rewritten[nodeSpanKey(expression)] = struct{}{}
			})
		}
		walkNode(node, func(candidate *ast.Node) bool {
			if normalizationError != nil || !ast.IsBinaryExpression(candidate) {
				return normalizationError == nil
			}
			if _, exists := rewritten[nodeSpanKey(candidate)]; exists {
				return true
			}
			binary := candidate.AsBinaryExpression()
			if binary.OperatorToken.Kind != ast.KindEqualsToken ||
				(!ast.IsArrayLiteralExpression(binary.Left) &&
					!ast.IsObjectLiteralExpression(binary.Left)) ||
				!insideNestedComponentCallable(candidate, node) ||
				!destructuringTargetsComponentState(binary.Left, stateAliases) {
				return true
			}
			if insideNormalizationRender(candidate, renderCallables) {
				normalizationError = componentComputationError(
					sourceFile,
					candidate,
					"error: render functions may not write component state because render work can run again",
				)
				return false
			}
			bindings := []destructuredStateBinding{}
			prefix := fmt.Sprintf(
				"__exactDestructured_%d",
				nodeTokenStart(sourceFile, candidate),
			)
			pattern, err := rewriteDestructuredStatePattern(
				sourceFile,
				binary.Left,
				prefix,
				&bindings,
				true,
			)
			if err != nil {
				normalizationError = err
				return false
			}
			if len(bindings) == 0 {
				return true
			}
			edits = append(edits, sourceEdit{
				start: nodeTokenStart(sourceFile, candidate),
				end:   candidate.End(),
				text: lowerNestedDestructuredStateAssignment(
					sourceFile,
					binary,
					pattern,
					prefix,
					bindings,
				),
			})
			return false
		})
		return false
	})
	if normalizationError != nil {
		return nil, normalizationError
	}
	return edits, nil
}

func normalizationRenderCallables(sourceFile *ast.SourceFile) map[*ast.Node]struct{} {
	candidates := rawComponentCandidates(sourceFile)
	result := make(map[*ast.Node]struct{})
	for target := range lexicalMicroComponentTargets(candidates, sourceFile) {
		result[target] = struct{}{}
	}
	for _, candidate := range componentCandidates(sourceFile) {
		if len(componentSignals(candidate, sourceFile)) == 0 {
			continue
		}
		if ast.IsArrowFunction(candidate.node) {
			body := unwrapRenderExpression(candidate.node.Body())
			if ast.IsArrowFunction(body) {
				result[body] = struct{}{}
			}
		}
		for _, returned := range directCallableReturns(candidate.node) {
			expression := unwrapRenderExpression(returned)
			if ast.IsArrowFunction(expression) {
				result[expression] = struct{}{}
			}
		}
	}
	return result
}

func insideNormalizationRender(
	node *ast.Node,
	renderCallables map[*ast.Node]struct{},
) bool {
	for current := node; current != nil; current = current.Parent {
		if _, render := renderCallables[current]; render {
			return true
		}
		if ast.IsFunctionLike(current) && current != node &&
			!eagerRenderCallback(current) {
			return false
		}
	}
	return false
}

func validateRenderDestructuring(
	sourceFile *ast.SourceFile,
	renderCallables map[*ast.Node]struct{},
) error {
	for render := range renderCallables {
		aliases := normalizationStateAliases(render)
		var validationError error
		walkNode(render, func(node *ast.Node) bool {
			if validationError != nil {
				return false
			}
			if node != render && ast.IsFunctionLike(node) &&
				!eagerRenderCallback(node) {
				return false
			}
			if !ast.IsBinaryExpression(node) {
				return true
			}
			binary := node.AsBinaryExpression()
			if binary.OperatorToken.Kind != ast.KindEqualsToken ||
				(!ast.IsArrayLiteralExpression(binary.Left) &&
					!ast.IsObjectLiteralExpression(binary.Left)) ||
				!destructuringTargetsComponentState(binary.Left, aliases) {
				return true
			}
			validationError = componentComputationError(
				sourceFile,
				node,
				"error: render functions may not write component state because render work can run again",
			)
			return false
		})
		if validationError != nil {
			return validationError
		}
	}
	return nil
}

func insideNestedComponentCallable(node *ast.Node, component *ast.Node) bool {
	for current := node.Parent; current != nil && current != component; current = current.Parent {
		if ast.IsFunctionLike(current) {
			return true
		}
	}
	return false
}

func normalizationStateAliases(component *ast.Node) map[string]struct{} {
	aliases := map[string]struct{}{}
	declarations := []*ast.Node{}
	walkNode(component, func(node *ast.Node) bool {
		if ast.IsVariableDeclaration(node) {
			declarations = append(declarations, node)
		}
		return true
	})
	for changed := true; changed; {
		changed = false
		for _, node := range declarations {
			declaration := node.AsVariableDeclaration()
			if !normalizationStateAliasSource(declaration.Initializer, aliases) {
				continue
			}
			for _, name := range componentBindingNames(declaration.Name()) {
				if _, exists := aliases[name]; exists {
					continue
				}
				aliases[name] = struct{}{}
				changed = true
			}
		}
	}
	return aliases
}

func normalizationStateAliasSource(
	node *ast.Node,
	aliases map[string]struct{},
) bool {
	if node == nil {
		return false
	}
	current := unwrapNormalizationParentheses(node)
	for ast.IsPropertyAccessExpression(current) ||
		ast.IsElementAccessExpression(current) {
		if ast.IsPropertyAccessExpression(current) {
			member := current.AsPropertyAccessExpression()
			if member.Expression.Kind == ast.KindThisKeyword &&
				member.Name() != nil &&
				member.Name().Text() == "state" {
				return true
			}
			current = member.Expression
			continue
		}
		current = current.AsElementAccessExpression().Expression
	}
	if ast.IsIdentifier(current) {
		_, exists := aliases[current.Text()]
		return exists
	}
	return false
}

func destructuringTargetsComponentState(
	pattern *ast.Node,
	aliases map[string]struct{},
) bool {
	switch {
	case ast.IsArrayLiteralExpression(pattern):
		for _, element := range pattern.AsArrayLiteralExpression().Elements.Nodes {
			if ast.IsOmittedExpression(element) {
				continue
			}
			if ast.IsSpreadElement(element) {
				element = element.AsSpreadElement().Expression
			}
			if destructuringTargetsComponentState(element, aliases) {
				return true
			}
		}
	case ast.IsObjectLiteralExpression(pattern):
		for _, property := range pattern.AsObjectLiteralExpression().Properties.Nodes {
			var target *ast.Node
			switch {
			case ast.IsPropertyAssignment(property):
				target = property.AsPropertyAssignment().Initializer
			case ast.IsShorthandPropertyAssignment(property):
				target = property.Name()
			case ast.IsSpreadAssignment(property):
				target = property.AsSpreadAssignment().Expression
			}
			if target != nil &&
				destructuringTargetsComponentState(target, aliases) {
				return true
			}
		}
	case ast.IsBinaryExpression(pattern) &&
		pattern.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken:
		return destructuringTargetsComponentState(
			pattern.AsBinaryExpression().Left,
			aliases,
		)
	default:
		if normalizationStateAliasSource(pattern, aliases) {
			return true
		}
	}
	return false
}

// lowerNestedDestructuredStateAssignment preserves the native destructuring
// algorithm by replacing only state targets with generated setter properties.
// Defaults, rest, iterator closing, partial writes, and the assignment result
// therefore retain JavaScript's own ordering and abrupt-completion behavior.
func lowerNestedDestructuredStateAssignment(
	sourceFile *ast.SourceFile,
	binary *ast.BinaryExpression,
	pattern string,
	prefix string,
	bindings []destructuredStateBinding,
) string {
	targetObject := prefix + "_targets"
	var declarations strings.Builder
	var setters strings.Builder
	for index, binding := range bindings {
		value := fmt.Sprintf("%s_value_%d", prefix, index)
		writer := fmt.Sprintf("%s_write_%d", prefix, index)
		member := fmt.Sprintf("%s.value_%d", targetObject, index)
		pattern = strings.ReplaceAll(pattern, binding.temporary, member)
		fmt.Fprintf(
			&declarations,
			"const %s = (%s) => { %s = %s; }; ",
			writer,
			value,
			normalizationNodeText(sourceFile, binding.target),
			value,
		)
		if setters.Len() != 0 {
			setters.WriteString(", ")
		}
		fmt.Fprintf(
			&setters,
			"set value_%d(%s) { %s(%s); }",
			index,
			value,
			writer,
			value,
		)
	}
	return fmt.Sprintf(
		"(() => { %sconst %s = { %s }; return (%s = %s); })()",
		declarations.String(),
		targetObject,
		setters.String(),
		pattern,
		normalizationNodeText(sourceFile, binary.Right),
	)
}

func unwrapNormalizationParentheses(node *ast.Node) *ast.Node {
	for ast.IsParenthesizedExpression(node) {
		node = node.AsParenthesizedExpression().Expression
	}
	return node
}

func rewriteDestructuredStatePattern(
	sourceFile *ast.SourceFile,
	pattern *ast.Node,
	prefix string,
	bindings *[]destructuredStateBinding,
	allowOrdinary bool,
) (string, error) {
	if ast.IsArrayLiteralExpression(pattern) {
		elements := pattern.AsArrayLiteralExpression().Elements.Nodes
		values := make([]string, 0, len(elements))
		for _, element := range elements {
			if ast.IsOmittedExpression(element) {
				values = append(values, "")
				continue
			}
			if ast.IsSpreadElement(element) {
				value, err := rewriteDestructuredStateTarget(
					sourceFile,
					element.AsSpreadElement().Expression,
					prefix,
					bindings,
					allowOrdinary,
				)
				if err != nil {
					return "", err
				}
				values = append(values, "..."+value)
				continue
			}
			value, err := rewriteDestructuredStateTarget(
				sourceFile,
				element,
				prefix,
				bindings,
				allowOrdinary,
			)
			if err != nil {
				return "", err
			}
			values = append(values, value)
		}
		return "[" + strings.Join(values, ", ") + "]", nil
	}
	if !ast.IsObjectLiteralExpression(pattern) {
		return rewriteDestructuredStateTarget(
			sourceFile,
			pattern,
			prefix,
			bindings,
			allowOrdinary,
		)
	}
	properties := []string{}
	for _, property := range pattern.AsObjectLiteralExpression().Properties.Nodes {
		if ast.IsSpreadAssignment(property) {
			value, err := rewriteDestructuredStateTarget(
				sourceFile,
				property.AsSpreadAssignment().Expression,
				prefix,
				bindings,
				allowOrdinary,
			)
			if err != nil {
				return "", err
			}
			properties = append(properties, "..."+value)
			continue
		}
		if !ast.IsPropertyAssignment(property) {
			if allowOrdinary {
				properties = append(
					properties,
					normalizationNodeText(sourceFile, property),
				)
				continue
			}
			return "", componentComputationError(
				sourceFile,
				property,
				"error: every derived object-destructuring entry must explicitly target this.state",
			)
		}
		assignment := property.AsPropertyAssignment()
		value, err := rewriteDestructuredStateTarget(
			sourceFile,
			assignment.Initializer,
			prefix,
			bindings,
			allowOrdinary,
		)
		if err != nil {
			return "", err
		}
		properties = append(
			properties,
			normalizationNodeText(sourceFile, assignment.Name())+": "+value,
		)
	}
	return "{ " + strings.Join(properties, ", ") + " }", nil
}

func rewriteDestructuredStateTarget(
	sourceFile *ast.SourceFile,
	target *ast.Node,
	prefix string,
	bindings *[]destructuredStateBinding,
	allowOrdinary bool,
) (string, error) {
	if ast.IsArrayLiteralExpression(target) || ast.IsObjectLiteralExpression(target) {
		return rewriteDestructuredStatePattern(
			sourceFile,
			target,
			prefix,
			bindings,
			allowOrdinary,
		)
	}
	if ast.IsBinaryExpression(target) &&
		target.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
		binary := target.AsBinaryExpression()
		left, err := rewriteDestructuredStateTarget(
			sourceFile,
			binary.Left,
			prefix,
			bindings,
			allowOrdinary,
		)
		if err != nil {
			return "", err
		}
		return left + " = " + normalizationNodeText(sourceFile, binary.Right), nil
	}
	if _, ok := componentComputationStatePath(target); !ok {
		if allowOrdinary {
			temporary := fmt.Sprintf("%s_%d", prefix, len(*bindings))
			*bindings = append(*bindings, destructuredStateBinding{
				target:    target,
				temporary: temporary,
			})
			return temporary, nil
		}
		return "", componentComputationError(
			sourceFile,
			target,
			"error: every derived destructuring target must be a writable this.state location",
		)
	}
	temporary := fmt.Sprintf("%s_%d", prefix, len(*bindings))
	*bindings = append(*bindings, destructuredStateBinding{
		target:    target,
		temporary: temporary,
	})
	return temporary, nil
}
