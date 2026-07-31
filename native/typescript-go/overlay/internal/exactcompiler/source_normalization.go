package exactcompiler

import (
	"fmt"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/core"
	"github.com/microsoft/typescript-go/internal/parser"
	"github.com/microsoft/typescript-go/internal/scanner"
	"github.com/microsoft/typescript-go/internal/tspath"
)

type sourceEdit struct {
	start int
	end   int
	text  string
	order int
}

type normalizedSource struct {
	text            string
	authored        string
	authoredOffsets []int
}

type componentComputationLocals struct {
	props    string
	reactive map[string]struct{}
}

type componentComputationWrite struct {
	node *ast.Node
	path string
}

type componentComputationEffects struct {
	reactive bool
	reads    map[string]struct{}
	writes   []componentComputationWrite
}

type componentComputation struct {
	statement *ast.Node
	effects   componentComputationEffects
}

type setupAssignmentExecution struct {
	component string
	start     int
	end       int
	execution string
}

type destructuredStateBinding struct {
	target    *ast.Node
	temporary string
}

// normalizeAuthoredSource owns syntax normalization that must happen before
// TypeScript can bind the module. Raw application source enters the Go host;
// JavaScript never parses or reconstructs the compiler AST on the native path.
func normalizeAuthoredSource(fileName string, source string) (normalizedSource, error) {
	result := newNormalizedSource(source)
	result.apply(propPunningEdits(result.text))
	for {
		destructuringEdits, err := planComponentStateDestructuring(
			fileName,
			result.text,
		)
		if err != nil {
			return normalizedSource{}, err
		}
		if len(destructuringEdits) == 0 {
			break
		}
		result.apply(destructuringEdits)
	}
	computationEdits, err := planComponentComputations(fileName, result.text)
	if err != nil {
		return normalizedSource{}, err
	}
	result.apply(computationEdits)
	return result, nil
}

func newNormalizedSource(source string) normalizedSource {
	offsets := make([]int, len(source)+1)
	for index := range offsets {
		offsets[index] = index
	}
	return normalizedSource{
		text:            source,
		authored:        source,
		authoredOffsets: offsets,
	}
}

func (source *normalizedSource) apply(edits []sourceEdit) {
	sortSourceEdits(edits)
	for _, edit := range edits {
		if edit.start < 0 || edit.end < edit.start || edit.end > len(source.text) {
			continue
		}
		nextOffsets := make([]int, 0, len(source.text)-edit.end+edit.start+len(edit.text)+1)
		nextOffsets = append(nextOffsets, source.authoredOffsets[:edit.start+1]...)
		for index := 1; index <= len(edit.text); index++ {
			offset := source.authoredOffsets[edit.start]
			if index == len(edit.text) {
				offset = source.authoredOffsets[edit.end]
			}
			nextOffsets = append(nextOffsets, offset)
		}
		nextOffsets = append(nextOffsets, source.authoredOffsets[edit.end+1:]...)
		source.text = source.text[:edit.start] + edit.text + source.text[edit.end:]
		source.authoredOffsets = nextOffsets
	}
}

func (source normalizedSource) authoredOffset(offset int) int {
	if offset < 0 {
		return 0
	}
	if offset >= len(source.authoredOffsets) {
		return len(source.authored)
	}
	return source.authoredOffsets[offset]
}

func (source normalizedSource) authoredSpan(start int, length int) (int, int) {
	end := start + length
	authoredStart := source.authoredOffset(start)
	authoredEnd := source.authoredOffset(end)
	if authoredEnd < authoredStart {
		authoredEnd = authoredStart
	}
	return authoredStart, authoredEnd - authoredStart
}

func parseNormalizationSource(fileName string, source string) *ast.SourceFile {
	return parser.ParseSourceFile(
		ast.SourceFileParseOptions{
			FileName: fileName,
			Path: tspath.ToPath(
				fileName,
				tspath.GetDirectoryPath(fileName),
				true,
			),
		},
		source,
		core.ScriptKindTSX,
	)
}

func applySourceEdits(source string, edits []sourceEdit) string {
	sortSourceEdits(edits)
	for _, edit := range edits {
		if edit.start < 0 || edit.end < edit.start || edit.end > len(source) {
			continue
		}
		source = source[:edit.start] + edit.text + source[edit.end:]
	}
	return source
}

func sortSourceEdits(edits []sourceEdit) {
	sort.SliceStable(edits, func(left int, right int) bool {
		if edits[left].start != edits[right].start {
			return edits[left].start > edits[right].start
		}
		if edits[left].end != edits[right].end {
			return edits[left].end > edits[right].end
		}
		return edits[left].order > edits[right].order
	})
}

func nodeTokenStart(sourceFile *ast.SourceFile, node *ast.Node) int {
	return scanner.GetTokenPosOfNode(node, sourceFile, false)
}

func normalizationNodeText(sourceFile *ast.SourceFile, node *ast.Node) string {
	if node == nil {
		return ""
	}
	start := nodeTokenStart(sourceFile, node)
	if start < 0 || node.End() < start || node.End() > len(sourceFile.Text()) {
		return ""
	}
	return sourceFile.Text()[start:node.End()]
}

func componentComputationError(
	sourceFile *ast.SourceFile,
	node *ast.Node,
	message string,
) error {
	position := nodeTokenStart(sourceFile, node)
	line, column := sourceLineAndColumn(sourceFile.Text(), position)
	return fmt.Errorf("%s:%d:%d - %s", sourceFile.FileName(), line, column, message)
}

func sourceLineAndColumn(source string, position int) (int, int) {
	if position < 0 {
		position = 0
	}
	if position > len(source) {
		position = len(source)
	}
	line := 1
	column := 1
	for index := 0; index < position; {
		r, size := utf8.DecodeRuneInString(source[index:])
		if r == '\n' {
			line++
			column = 1
		} else {
			column++
		}
		index += size
	}
	return line, column
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
	declarations := make(map[string][]*ast.Node)
	for _, candidate := range candidates {
		declarations[candidate.name] = append(
			declarations[candidate.name],
			candidate.node,
		)
	}
	result := make(map[*ast.Node]struct{})
	for _, candidate := range candidates {
		if len(componentSignals(candidate, sourceFile)) == 0 {
			continue
		}
		for _, returned := range directCallableReturns(candidate.node) {
			expression := unwrapRenderExpression(returned)
			if ast.IsArrowFunction(expression) ||
				ast.IsFunctionExpression(expression) {
				result[expression] = struct{}{}
				continue
			}
			if !ast.IsIdentifier(expression) {
				continue
			}
			for _, target := range declarations[expression.Text()] {
				if target != candidate.node &&
					directlyReturnsRenderedValue(target) {
					result[target] = struct{}{}
				}
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

func preprocessComponentComputations(
	fileName string,
	source string,
) (string, error) {
	edits, err := planComponentComputations(fileName, source)
	if err != nil {
		return "", err
	}
	return applySourceEdits(source, edits), nil
}

func planComponentComputations(
	fileName string,
	source string,
) ([]sourceEdit, error) {
	sourceFile := parseNormalizationSource(fileName, source)
	environment := componentComputationEnvironmentBindings(sourceFile)
	edits := []sourceEdit{}
	var normalizationError error
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if normalizationError != nil {
			return false
		}
		if !isComponentComputationFunction(node, sourceFile) {
			return true
		}
		if err := planComponentComputationEdits(
			sourceFile,
			node,
			environment,
			&edits,
		); err != nil {
			normalizationError = err
		}
		return false
	})
	if normalizationError != nil {
		return nil, normalizationError
	}
	return edits, nil
}

// collectAuthoredSetupAssignmentExecutions retains the semantic distinction
// that computation normalization would otherwise lower into generated tasks.
func collectAuthoredSetupAssignmentExecutions(
	fileName string,
	source string,
) []setupAssignmentExecution {
	sourceFile := parseNormalizationSource(fileName, source)
	environment := componentComputationEnvironmentBindings(sourceFile)
	executions := []setupAssignmentExecution{}
	for _, candidate := range componentCandidates(sourceFile) {
		body := candidate.node.Body()
		if body == nil || !ast.IsBlock(body) {
			continue
		}
		statements := append([]*ast.Node(nil), body.AsBlock().Statements.Nodes...)
		if len(statements) != 0 && ast.IsReturnStatement(statements[len(statements)-1]) {
			statements = statements[:len(statements)-1]
		}
		locals := analyzeComponentComputationLocals(candidate.node, statements, environment)
		for _, statement := range statements {
			if len(collectDirectComponentAwaits(statement)) != 0 {
				continue
			}
			effects := inspectComponentComputationStatement(statement, locals)
			if len(effects.writes) == 0 {
				continue
			}
			execution := "initialization"
			if effects.reactive && !isComponentStateInitialization(statement) {
				execution = "deferred-reactive"
			}
			executions = append(executions, setupAssignmentExecution{
				component: candidate.name,
				start:     statement.Pos(),
				end:       statement.End(),
				execution: execution,
			})
		}
	}
	return executions
}

func applySetupAssignmentExecutions(
	writes []StateWrite,
	executions []setupAssignmentExecution,
) {
	for index := range writes {
		write := &writes[index]
		if write.Operation != "assignment" {
			continue
		}
		for _, execution := range executions {
			if write.Component == execution.component &&
				write.Start < execution.end &&
				execution.start < write.Start+write.Length {
				write.SetupExecution = execution.execution
				break
			}
		}
	}
}

func planComponentComputationEdits(
	sourceFile *ast.SourceFile,
	component *ast.Node,
	environment map[string]struct{},
	edits *[]sourceEdit,
) error {
	body := component.Body()
	if body == nil || !ast.IsBlock(body) {
		return nil
	}
	statements := append([]*ast.Node(nil), body.AsBlock().Statements.Nodes...)
	var renderReturn *ast.Node
	if len(statements) != 0 && ast.IsReturnStatement(statements[len(statements)-1]) {
		renderReturn = statements[len(statements)-1]
		statements = statements[:len(statements)-1]
	}
	if len(statements) == 0 {
		return nil
	}
	asyncModifier := componentAsyncModifier(component)
	hasRawAwait := false
	for _, statement := range statements {
		if len(collectDirectComponentAwaits(statement)) != 0 {
			hasRawAwait = true
		}
	}
	if asyncModifier != nil && hasRawAwait {
		return planAsyncComponentComputation(
			sourceFile,
			statements,
			renderReturn,
			asyncModifier,
			edits,
		)
	}

	locals := analyzeComponentComputationLocals(component, statements, environment)
	computations := []componentComputation{}
	for _, statement := range statements {
		if isComponentStateInitialization(statement) {
			continue
		}
		effects := inspectComponentComputationStatement(statement, locals)
		if len(effects.writes) != 0 && effects.reactive {
			computations = append(computations, componentComputation{
				statement: statement,
				effects:   effects,
			})
		}
	}
	if err := validateSynchronousComputationCycles(sourceFile, computations); err != nil {
		return err
	}
	for _, computation := range computations {
		start := nodeTokenStart(sourceFile, computation.statement)
		name := fmt.Sprintf("__exactComponentComputation_%d", start)
		*edits = append(
			*edits,
			sourceEdit{
				start: start,
				end:   start,
				text:  "function " + name + "() { ",
				order: 0,
			},
			sourceEdit{
				start: computation.statement.End(),
				end:   computation.statement.End(),
				text:  " } " + name + "();",
				order: 1,
			},
		)
	}
	return nil
}

func componentAsyncModifier(component *ast.Node) *ast.Node {
	modifiers := component.Modifiers()
	if modifiers == nil {
		return nil
	}
	for _, modifier := range modifiers.Nodes {
		if modifier.Kind == ast.KindAsyncKeyword {
			return modifier
		}
	}
	return nil
}

func isComponentStateInitialization(statement *ast.Node) bool {
	if !ast.IsExpressionStatement(statement) {
		return false
	}
	expression := statement.AsExpressionStatement().Expression
	return ast.IsBinaryExpression(expression) &&
		expression.AsBinaryExpression().OperatorToken.Kind ==
			ast.KindQuestionQuestionEqualsToken &&
		len(componentComputationStateTargets(
			expression.AsBinaryExpression().Left,
		)) != 0
}

func validateSynchronousComputationCycles(
	sourceFile *ast.SourceFile,
	computations []componentComputation,
) error {
	writes := []componentComputationWrite{}
	for _, computation := range computations {
		for _, write := range computation.effects.writes {
			if write.path != "" {
				writes = append(writes, write)
			}
		}
	}
	nodes := []string{}
	seen := map[string]struct{}{}
	for _, write := range writes {
		if _, exists := seen[write.path]; exists {
			continue
		}
		seen[write.path] = struct{}{}
		nodes = append(nodes, write.path)
	}
	edges := map[string]map[string]struct{}{}
	for _, path := range nodes {
		edges[path] = map[string]struct{}{}
	}
	for _, computation := range computations {
		for _, write := range computation.effects.writes {
			if write.path == "" {
				continue
			}
			for read := range computation.effects.reads {
				for _, target := range nodes {
					if componentComputationPathsOverlap(read, target) {
						edges[write.path][target] = struct{}{}
					}
				}
			}
		}
	}
	active := map[string]struct{}{}
	complete := map[string]struct{}{}
	var visit func(string) bool
	visit = func(path string) bool {
		if _, exists := active[path]; exists {
			return true
		}
		if _, exists := complete[path]; exists {
			return false
		}
		active[path] = struct{}{}
		for dependency := range edges[path] {
			if visit(dependency) {
				return true
			}
		}
		delete(active, path)
		complete[path] = struct{}{}
		return false
	}
	for _, path := range nodes {
		if !visit(path) {
			continue
		}
		var location *ast.Node
		for _, write := range writes {
			if write.path == path {
				location = write.node
				break
			}
		}
		return componentComputationError(
			sourceFile,
			location,
			fmt.Sprintf(
				"error: derived state assignment involving %s creates a reactive dependency cycle; wrap one read in peek(() => ...) for a snapshot or move deliberate feedback into a local task function with a final TaskContext policy parameter",
				path,
			),
		)
	}
	return nil
}

func componentComputationPathsOverlap(left string, right string) bool {
	return left == right ||
		strings.HasPrefix(left, right+".") ||
		strings.HasPrefix(right, left+".")
}

func analyzeComponentComputationLocals(
	component *ast.Node,
	statements []*ast.Node,
	environment map[string]struct{},
) componentComputationLocals {
	locals := componentComputationLocals{
		reactive: make(map[string]struct{}, len(environment)),
	}
	for name := range environment {
		locals.reactive[name] = struct{}{}
	}
	for _, parameter := range component.Parameters() {
		name := parameter.Name()
		if name == nil || name.Kind == ast.KindThisKeyword ||
			(ast.IsIdentifier(name) && name.Text() == "this") {
			continue
		}
		names := componentBindingNames(name)
		for _, binding := range names {
			locals.reactive[binding] = struct{}{}
		}
		if ast.IsIdentifier(name) {
			locals.props = name.Text()
		}
		break
	}
	changed := true
	for changed {
		changed = false
		for _, statement := range statements {
			if !ast.IsVariableStatement(statement) {
				continue
			}
			list := statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList()
			for _, declarationNode := range list.Declarations.Nodes {
				declaration := declarationNode.AsVariableDeclaration()
				name := declaration.Name()
				if name == nil || !ast.IsIdentifier(name) ||
					declaration.Initializer == nil {
					continue
				}
				if _, exists := locals.reactive[name.Text()]; exists {
					continue
				}
				if containsComponentReactiveRead(declaration.Initializer, locals) {
					locals.reactive[name.Text()] = struct{}{}
					changed = true
				}
			}
		}
	}
	return locals
}

func inspectComponentComputationStatement(
	statement *ast.Node,
	locals componentComputationLocals,
) componentComputationEffects {
	effects := componentComputationEffects{
		reads:  map[string]struct{}{},
		writes: []componentComputationWrite{},
	}
	var visit func(*ast.Node, bool)
	visit = func(node *ast.Node, assignmentTarget bool) {
		if node == nil ||
			(node != statement && ast.IsFunctionLike(node)) ||
			isComponentPeekCall(node) {
			return
		}
		if ast.IsBinaryExpression(node) {
			binary := node.AsBinaryExpression()
			if binary.OperatorToken.Kind >= ast.KindFirstAssignment &&
				binary.OperatorToken.Kind <= ast.KindLastAssignment {
				for _, target := range componentComputationStateTargets(binary.Left) {
					path, _ := componentComputationStatePath(target)
					effects.writes = append(effects.writes, componentComputationWrite{
						node: target,
						path: path,
					})
				}
				visit(binary.Left, true)
				visit(binary.Right, false)
				return
			}
		}
		var operand *ast.Node
		if ast.IsPrefixUnaryExpression(node) {
			unary := node.AsPrefixUnaryExpression()
			if unary.Operator == ast.KindPlusPlusToken ||
				unary.Operator == ast.KindMinusMinusToken {
				operand = unary.Operand
			}
		} else if ast.IsPostfixUnaryExpression(node) {
			unary := node.AsPostfixUnaryExpression()
			if unary.Operator == ast.KindPlusPlusToken ||
				unary.Operator == ast.KindMinusMinusToken {
				operand = unary.Operand
			}
		}
		if operand != nil {
			if path, ok := componentComputationStatePath(operand); ok {
				effects.writes = append(effects.writes, componentComputationWrite{
					node: operand,
					path: path,
				})
			}
			visit(operand, true)
			return
		}
		if path, ok := componentComputationStatePath(node); ok && !assignmentTarget {
			effects.reactive = true
			effects.reads[path] = struct{}{}
			return
		}
		if isComponentGetContextCall(node) {
			effects.reactive = true
		}
		if ast.IsIdentifier(node) && !assignmentTarget &&
			!isNonReferenceComponentIdentifier(node) {
			if node.Text() == locals.props {
				effects.reactive = true
			}
			if _, exists := locals.reactive[node.Text()]; exists {
				effects.reactive = true
			}
		}
		node.ForEachChild(func(child *ast.Node) bool {
			visit(child, assignmentTarget)
			return false
		})
	}
	visit(statement, false)
	return effects
}

func containsComponentReactiveRead(
	root *ast.Node,
	locals componentComputationLocals,
) bool {
	found := false
	var visit func(*ast.Node)
	visit = func(node *ast.Node) {
		if node == nil || found ||
			(node != root && ast.IsFunctionLike(node)) ||
			isComponentPeekCall(node) {
			return
		}
		if _, ok := componentComputationStatePath(node); ok ||
			isComponentGetContextCall(node) {
			found = true
			return
		}
		if ast.IsIdentifier(node) && !isNonReferenceComponentIdentifier(node) {
			if node.Text() == locals.props {
				found = true
				return
			}
			if _, exists := locals.reactive[node.Text()]; exists {
				found = true
				return
			}
		}
		node.ForEachChild(func(child *ast.Node) bool {
			visit(child)
			return false
		})
	}
	visit(root)
	return found
}

func componentComputationEnvironmentBindings(
	sourceFile *ast.SourceFile,
) map[string]struct{} {
	bindings := make(map[string]struct{}, len(browserGlobals))
	for name := range browserGlobals {
		bindings[name] = struct{}{}
	}
	for _, statement := range sourceFile.Statements.Nodes {
		if !ast.IsImportDeclaration(statement) {
			continue
		}
		declaration := statement.AsImportDeclaration()
		if !ast.IsStringLiteral(declaration.ModuleSpecifier) ||
			!serverOnlyModule(declaration.ModuleSpecifier.Text()) ||
			declaration.ImportClause == nil {
			continue
		}
		clause := declaration.ImportClause.AsImportClause()
		if clause.Name() != nil {
			bindings[clause.Name().Text()] = struct{}{}
		}
		named := clause.NamedBindings
		if named == nil {
			continue
		}
		if ast.IsNamespaceImport(named) {
			bindings[named.Name().Text()] = struct{}{}
			continue
		}
		for _, element := range named.AsNamedImports().Elements.Nodes {
			name := element.Name()
			if name != nil {
				bindings[name.Text()] = struct{}{}
			}
		}
	}
	return bindings
}

func isComponentGetContextCall(node *ast.Node) bool {
	if !ast.IsCallExpression(node) {
		return false
	}
	expression := node.AsCallExpression().Expression
	if !ast.IsPropertyAccessExpression(expression) {
		return false
	}
	member := expression.AsPropertyAccessExpression()
	return member.Expression.Kind == ast.KindThisKeyword &&
		member.Name() != nil &&
		member.Name().Text() == "getContext"
}

func isComponentPeekCall(node *ast.Node) bool {
	return ast.IsCallExpression(node) &&
		ast.IsIdentifier(node.AsCallExpression().Expression) &&
		node.AsCallExpression().Expression.Text() == "peek"
}

func isNonReferenceComponentIdentifier(node *ast.Node) bool {
	if ast.IsDeclarationName(node) {
		return true
	}
	parent := node.Parent
	if parent == nil {
		return false
	}
	if ast.IsPropertyAccessExpression(parent) &&
		parent.AsPropertyAccessExpression().Name() == node {
		return true
	}
	if ast.IsPropertyAssignment(parent) &&
		parent.AsPropertyAssignment().Name() == node {
		return true
	}
	return false
}

func componentComputationStatePath(node *ast.Node) (string, bool) {
	segments := []string{}
	current := node
	for ast.IsPropertyAccessExpression(current) ||
		ast.IsElementAccessExpression(current) {
		if ast.IsPropertyAccessExpression(current) {
			member := current.AsPropertyAccessExpression()
			if member.Expression.Kind == ast.KindThisKeyword &&
				member.Name() != nil &&
				member.Name().Text() == "state" {
				path := "this.state"
				if len(segments) != 0 {
					path += "." + strings.Join(segments, ".")
				}
				return path, true
			}
			if member.Name() == nil {
				return "", false
			}
			segments = append([]string{member.Name().Text()}, segments...)
			current = member.Expression
			continue
		}
		member := current.AsElementAccessExpression()
		argument := member.ArgumentExpression
		if argument == nil ||
			(!ast.IsStringLiteral(argument) &&
				!ast.IsNumericLiteral(argument)) {
			return "", false
		}
		segments = append([]string{argument.Text()}, segments...)
		current = member.Expression
	}
	return "", false
}

func componentComputationStateTargets(node *ast.Node) []*ast.Node {
	if _, ok := componentComputationStatePath(node); ok {
		return []*ast.Node{node}
	}
	if ast.IsArrayLiteralExpression(node) {
		result := []*ast.Node{}
		for _, element := range node.AsArrayLiteralExpression().Elements.Nodes {
			if ast.IsOmittedExpression(element) {
				continue
			}
			if ast.IsSpreadElement(element) {
				result = append(
					result,
					componentComputationStateTargets(
						element.AsSpreadElement().Expression,
					)...,
				)
				continue
			}
			result = append(result, componentComputationStateTargets(element)...)
		}
		return result
	}
	if ast.IsObjectLiteralExpression(node) {
		result := []*ast.Node{}
		for _, property := range node.AsObjectLiteralExpression().Properties.Nodes {
			if ast.IsPropertyAssignment(property) {
				result = append(
					result,
					componentComputationStateTargets(
						property.AsPropertyAssignment().Initializer,
					)...,
				)
			} else if ast.IsShorthandPropertyAssignment(property) {
				result = append(result, componentComputationStateTargets(property.Name())...)
			} else if ast.IsSpreadAssignment(property) {
				result = append(
					result,
					componentComputationStateTargets(
						property.AsSpreadAssignment().Expression,
					)...,
				)
			}
		}
		return result
	}
	return nil
}

func isComponentComputationFunction(
	node *ast.Node,
	sourceFile *ast.SourceFile,
) bool {
	if !ast.IsFunctionDeclaration(node) &&
		!ast.IsFunctionExpression(node) &&
		!ast.IsArrowFunction(node) {
		return false
	}
	if _, sharedRender := returnedLocalRenderTargets(
		rawComponentCandidates(sourceFile),
		sourceFile,
	)[node]; sharedRender {
		return false
	}
	if hasComponentReceiver(node, sourceFile) {
		return true
	}
	if ast.IsArrowFunction(node) {
		return false
	}
	name := node.Name()
	return name != nil &&
		componentName(name.Text()) &&
		node.Body() != nil &&
		containsJSX(node.Body())
}

func visitDirectComponentSyntax(root *ast.Node, visit func(*ast.Node)) {
	var walk func(*ast.Node)
	walk = func(node *ast.Node) {
		if node == nil || (node != root && ast.IsFunctionLike(node)) {
			return
		}
		visit(node)
		node.ForEachChild(func(child *ast.Node) bool {
			walk(child)
			return false
		})
	}
	walk(root)
}

func collectDirectComponentAwaits(root *ast.Node) []*ast.Node {
	result := []*ast.Node{}
	visitDirectComponentSyntax(root, func(node *ast.Node) {
		if ast.IsAwaitExpression(node) {
			result = append(result, node)
		}
	})
	return result
}

func planAsyncComponentComputation(
	sourceFile *ast.SourceFile,
	setupStatements []*ast.Node,
	renderReturn *ast.Node,
	asyncModifier *ast.Node,
	edits *[]sourceEdit,
) error {
	statements := asyncComponentRegion(setupStatements)
	if err := validateAsyncComponentRegion(
		sourceFile,
		statements,
		renderReturn,
	); err != nil {
		return err
	}
	first := statements[0]
	last := statements[len(statements)-1]
	name := fmt.Sprintf("__exactComponentSetupTask_%d", nodeTokenStart(sourceFile, first))
	*edits = append(
		*edits,
		sourceEdit{
			start: 0,
			end:   0,
			text:  "import { TaskContext as __exactTaskContext } from \"@exactjs/core\"; ",
			order: -1,
		},
		sourceEdit{
			start: nodeTokenStart(sourceFile, asyncModifier),
			end:   asyncModifier.End(),
			text:  "",
		},
		sourceEdit{
			start: nodeTokenStart(sourceFile, first),
			end:   nodeTokenStart(sourceFile, first),
			text: "async function " + name +
				"(__exactComponentTaskContext: __exactTaskContext = __exactTaskContext.server().blocking()) { ",
			order: 0,
		},
		sourceEdit{
			start: last.End(),
			end:   last.End(),
			text:  " } " + name + "();",
			order: 1,
		},
	)
	for _, statement := range statements {
		visitDirectComponentSyntax(statement, func(node *ast.Node) {
			if !ast.IsCatchClause(node) {
				return
			}
			block := node.AsCatchClause().Block.AsNode()
			start := nodeTokenStart(sourceFile, block) + 1
			*edits = append(*edits, sourceEdit{
				start: start,
				end:   start,
				text: " if (__exactComponentTaskContext.signal.aborted) " +
					"throw __exactComponentTaskContext.signal.reason;",
				order: 0,
			})
		})
	}
	return nil
}

func asyncComponentRegion(statements []*ast.Node) []*ast.Node {
	firstAwait := -1
	for index, statement := range statements {
		if len(collectDirectComponentAwaits(statement)) != 0 {
			firstAwait = index
			break
		}
	}
	if firstAwait < 0 {
		return statements
	}
	start := firstAwait
	for index := firstAwait - 1; index >= 0; index-- {
		statement := statements[index]
		if isFrameworkSetupRegistration(statement) ||
			hasDirectComponentStateWrite(statement) {
			break
		}
		start = index
	}
	return statements[start:]
}

func hasDirectComponentStateWrite(statement *ast.Node) bool {
	found := false
	visitDirectComponentSyntax(statement, func(node *ast.Node) {
		if found || !ast.IsBinaryExpression(node) {
			return
		}
		binary := node.AsBinaryExpression()
		if binary.OperatorToken.Kind >= ast.KindFirstAssignment &&
			binary.OperatorToken.Kind <= ast.KindLastAssignment &&
			len(componentComputationStateTargets(binary.Left)) != 0 {
			found = true
		}
	})
	return found
}

func isFrameworkSetupRegistration(statement *ast.Node) bool {
	if !ast.IsExpressionStatement(statement) {
		return false
	}
	expression := statement.AsExpressionStatement().Expression
	if !ast.IsCallExpression(expression) {
		return false
	}
	callee := expression.AsCallExpression().Expression
	if !ast.IsPropertyAccessExpression(callee) {
		return false
	}
	member := callee.AsPropertyAccessExpression()
	if member.Expression.Kind != ast.KindThisKeyword || member.Name() == nil {
		return false
	}
	switch member.Name().Text() {
	case "onMount", "onRender", "onUnmount", "onActivate",
		"onDeactivate", "setContext":
		return true
	default:
		return false
	}
}

func validateAsyncComponentRegion(
	sourceFile *ast.SourceFile,
	statements []*ast.Node,
	renderReturn *ast.Node,
) error {
	reads := map[string]struct{}{}
	writes := []componentComputationWrite{}
	for _, statement := range statements {
		effects := inspectComponentComputationStatement(
			statement,
			componentComputationLocals{reactive: map[string]struct{}{}},
		)
		for path := range effects.reads {
			reads[path] = struct{}{}
		}
		writes = append(writes, effects.writes...)
	}
	for _, write := range writes {
		if _, exists := reads[write.path]; write.path != "" && exists {
			return componentComputationError(
				sourceFile,
				write.node,
				fmt.Sprintf(
					"error: async derived state assignment to %s reads its own target and would create a reactive cycle; use a local intermediate, peek(() => ...) for a snapshot, or a local task function with a final TaskContext policy parameter",
					write.path,
				),
			)
		}
	}

	setupBindings := map[string]*ast.Node{}
	for _, statement := range statements {
		var regionError error
		visitDirectComponentSyntax(statement, func(node *ast.Node) {
			if regionError != nil {
				return
			}
			if ast.IsVariableDeclaration(node) {
				for _, name := range componentBindingNames(node.Name()) {
					setupBindings[name] = node
				}
			}
			if node != statement && ast.IsReturnStatement(node) {
				expression := node.AsReturnStatement().Expression
				if expression != nil &&
					(isComponentRenderValue(expression) || containsJSX(expression)) {
					regionError = componentComputationError(
						sourceFile,
						node,
						"error: an async component may not select its render function from inside the managed continuation; assign the awaited result to this.state and return one final render function",
					)
				}
			}
		})
		if regionError != nil {
			return regionError
		}
	}
	if renderReturn == nil ||
		renderReturn.AsReturnStatement().Expression == nil ||
		len(setupBindings) == 0 {
		return nil
	}
	var escaped string
	walkNode(renderReturn.AsReturnStatement().Expression, func(node *ast.Node) bool {
		if escaped != "" {
			return false
		}
		if ast.IsIdentifier(node) &&
			!isNonReferenceComponentIdentifier(node) {
			if _, exists := setupBindings[node.Text()]; exists {
				escaped = node.Text()
				return false
			}
		}
		return true
	})
	if escaped != "" {
		return componentComputationError(
			sourceFile,
			setupBindings[escaped],
			fmt.Sprintf(
				"error: async component local %s escapes into the render function before its continuation settles; assign the value to this.state instead",
				escaped,
			),
		)
	}
	return nil
}

func componentBindingNames(name *ast.Node) []string {
	if name == nil {
		return nil
	}
	if ast.IsIdentifier(name) {
		return []string{name.Text()}
	}
	result := []string{}
	if ast.IsArrayBindingPattern(name) {
		for _, element := range name.AsBindingPattern().Elements.Nodes {
			if ast.IsOmittedExpression(element) {
				continue
			}
			result = append(result, componentBindingNames(element.Name())...)
		}
	} else if ast.IsObjectBindingPattern(name) {
		for _, element := range name.AsBindingPattern().Elements.Nodes {
			result = append(result, componentBindingNames(element.Name())...)
		}
	}
	return result
}

func isComponentRenderValue(expression *ast.Node) bool {
	return ast.IsArrowFunction(expression) || ast.IsFunctionExpression(expression)
}

func preprocessPropPunning(source string) string {
	return applySourceEdits(source, propPunningEdits(source))
}

func propPunningEdits(source string) []sourceEdit {
	edits := []sourceEdit{}
	for index := 0; index < len(source); {
		char := source[index]
		next := byte(0)
		if index+1 < len(source) {
			next = source[index+1]
		}
		switch {
		case char == '"' || char == '\'':
			end := scanPunningQuoted(source, index, char)
			index = end
		case char == '`':
			end := scanPunningTemplate(source, index)
			index = end
		case char == '/' && next == '/':
			end := scanPunningLineComment(source, index)
			index = end
		case char == '/' && next == '*':
			end := scanPunningBlockComment(source, index)
			index = end
		case char == '<' && index+1 < len(source) &&
			isPunningTagStart(source[index+1]) &&
			source[index+1] != '/':
			end := scanPunningOpeningTag(source, index)
			if end > index {
				edits = append(
					edits,
					punnedPropEditsInTag(source[index:end], index)...,
				)
				index = end
			} else {
				index++
			}
		default:
			index++
		}
	}
	return edits
}

func rewritePunnedPropsInTag(tag string) string {
	return applySourceEdits(tag, punnedPropEditsInTag(tag, 0))
}

func punnedPropEditsInTag(tag string, base int) []sourceEdit {
	edits := []sourceEdit{}
	var quote byte
	for index := 0; index < len(tag); {
		char := tag[index]
		if quote != 0 {
			if char == '\\' && index+1 < len(tag) {
				index += 2
				continue
			}
			if char == quote {
				quote = 0
			}
			index++
			continue
		}
		if char == '"' || char == '\'' {
			quote = char
			index++
			continue
		}
		if char == '{' {
			previousWhitespace := index > 0 && isPunningWhitespace(tag[index-1])
			if previousWhitespace && index+1 < len(tag) &&
				isPunningIdentifierStart(tag[index+1]) {
				end := scanPunningIdentifier(tag, index+1)
				if end < len(tag) && tag[end] == '}' {
					name := tag[index+1 : end]
					edits = append(edits, sourceEdit{
						start: base + index,
						end:   base + index,
						text:  name + "=",
					})
					index = end + 1
					continue
				}
			}
			end := scanPunningJSExpression(tag, index)
			if end <= index {
				end = len(tag)
			}
			index = end
			continue
		}
		index++
	}
	return edits
}

func scanPunningOpeningTag(source string, start int) int {
	var quote byte
	for index := start + 1; index < len(source); {
		char := source[index]
		if quote != 0 {
			if char == '\\' {
				index += 2
				continue
			}
			if char == quote {
				quote = 0
			}
			index++
			continue
		}
		if char == '"' || char == '\'' {
			quote = char
			index++
			continue
		}
		if char == '{' {
			end := scanPunningJSExpression(source, index)
			if end <= index {
				return -1
			}
			index = end
			continue
		}
		if char == '>' {
			return index + 1
		}
		index++
	}
	return -1
}

func scanPunningJSExpression(source string, start int) int {
	depth := 0
	for index := start; index < len(source); {
		char := source[index]
		next := byte(0)
		if index+1 < len(source) {
			next = source[index+1]
		}
		switch {
		case char == '"' || char == '\'':
			index = scanPunningQuoted(source, index, char)
			continue
		case char == '`':
			index = scanPunningTemplate(source, index)
			continue
		case char == '/' && next == '/':
			index = scanPunningLineComment(source, index)
			continue
		case char == '/' && next == '*':
			index = scanPunningBlockComment(source, index)
			continue
		case char == '/' && isPunningRegexStart(source, index):
			index = scanPunningRegex(source, index)
			continue
		case char == '{':
			depth++
		case char == '}':
			depth--
			if depth == 0 {
				return index + 1
			}
		}
		index++
	}
	return -1
}

func isPunningRegexStart(source string, slash int) bool {
	index := slash - 1
	for index >= 0 && isPunningWhitespace(source[index]) {
		index--
	}
	if index < 0 || strings.ContainsRune("([{,:;=!?&|+-*%^~<>", rune(source[index])) {
		return true
	}
	if !isPunningIdentifierPart(source[index]) {
		return false
	}
	start := index
	for start > 0 && isPunningIdentifierPart(source[start-1]) {
		start--
	}
	switch source[start : index+1] {
	case "return", "throw", "case", "delete", "void", "typeof",
		"instanceof", "in", "of", "yield", "await", "new":
		return true
	default:
		return false
	}
}

func scanPunningRegex(source string, start int) int {
	characterClass := false
	for index := start + 1; index < len(source); {
		char := source[index]
		if char == '\\' {
			index += 2
			continue
		}
		if char == '[' {
			characterClass = true
		} else if char == ']' {
			characterClass = false
		} else if char == '/' && !characterClass {
			index++
			for index < len(source) &&
				((source[index] >= 'A' && source[index] <= 'Z') ||
					(source[index] >= 'a' && source[index] <= 'z')) {
				index++
			}
			return index
		}
		index++
	}
	return len(source)
}

func scanPunningQuoted(source string, start int, quote byte) int {
	for index := start + 1; index < len(source); {
		if source[index] == '\\' {
			index += 2
			continue
		}
		if source[index] == quote {
			return index + 1
		}
		index++
	}
	return len(source)
}

func scanPunningTemplate(source string, start int) int {
	for index := start + 1; index < len(source); {
		if source[index] == '\\' {
			index += 2
			continue
		}
		if source[index] == '`' {
			return index + 1
		}
		if source[index] == '$' && index+1 < len(source) &&
			source[index+1] == '{' {
			end := scanPunningJSExpression(source, index+1)
			if end < 0 {
				return len(source)
			}
			index = end
			continue
		}
		index++
	}
	return len(source)
}

func scanPunningLineComment(source string, start int) int {
	if offset := strings.IndexByte(source[start+2:], '\n'); offset >= 0 {
		return start + 2 + offset
	}
	return len(source)
}

func scanPunningBlockComment(source string, start int) int {
	if offset := strings.Index(source[start+2:], "*/"); offset >= 0 {
		return start + 2 + offset + 2
	}
	return len(source)
}

func scanPunningIdentifier(source string, start int) int {
	index := start + 1
	for index < len(source) && isPunningIdentifierPart(source[index]) {
		index++
	}
	return index
}

func isPunningTagStart(char byte) bool {
	return isPunningIdentifierStart(char) || char == '>'
}

func isPunningIdentifierStart(char byte) bool {
	return (char >= 'A' && char <= 'Z') ||
		(char >= 'a' && char <= 'z') ||
		char == '_' ||
		char == '$'
}

func isPunningIdentifierPart(char byte) bool {
	return isPunningIdentifierStart(char) ||
		(char >= '0' && char <= '9')
}

func isPunningWhitespace(char byte) bool {
	return unicode.IsSpace(rune(char))
}
