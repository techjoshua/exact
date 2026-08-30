package exactcompiler

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

var keepAnnotation = regexp.MustCompile(
	`@exact\s+keep\s*=\s*(?:"(server|client|secret)"|'(server|client|secret)'|(server|client|secret))`,
)
var contextKeepOption = regexp.MustCompile(
	`\bkeep\s*:\s*(?:"(server|client|shared|secret)"|'(server|client|shared|secret)')`,
)
var contextScopeOption = regexp.MustCompile(
	`\bscope\s*:\s*(?:"(component|application|request)"|'(component|application|request)')`,
)

type exactAnnotations struct {
	policy *DataPolicy
	client bool
	server bool
	pure   bool
}

type statePolicy struct {
	component string
	path      string
	subject   PolicySubject
}

type policyAnalysis struct {
	graph            PolicyAnalysis
	statePolicies    []statePolicy
	contextPolicies  map[string]PolicySubject
	subjectsBySymbol map[ast.SymbolId]PolicySubject
	callPolicies     map[string]PolicySubject
	selectorsByID    map[string]string
	qualifications   []*ast.Node
	diagnostics      []Diagnostic
}

func newPolicyAnalysis() PolicyAnalysis {
	return PolicyAnalysis{
		Version:         1,
		Subjects:        []PolicySubject{},
		Flows:           []PolicyFlow{},
		SecretConsumers: []SecretConsumer{},
	}
}

// collectPolicyAnalysis materializes native policy subjects and lookups used
// to constrain tasks. Secret values never enter this graph; only selectors,
// paths, and residency metadata cross the compiler boundary.
func collectPolicyAnalysis(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	components []Component,
	stateReads []StateRead,
	request Request,
) policyAnalysis {
	analysis := policyAnalysis{
		graph:            newPolicyAnalysis(),
		contextPolicies:  make(map[string]PolicySubject),
		subjectsBySymbol: make(map[ast.SymbolId]PolicySubject),
		callPolicies:     make(map[string]PolicySubject),
		selectorsByID:    make(map[string]string),
	}
	seen := make(map[string]struct{})
	addSubject := func(subject PolicySubject) {
		if _, exists := seen[subject.ID]; exists {
			return
		}
		seen[subject.ID] = struct{}{}
		analysis.graph.Subjects = append(analysis.graph.Subjects, subject)
	}

	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		annotations := policyNodeAnnotations(node, sourceFile)
		if annotations.policy == nil {
			return true
		}
		kind := policyDeclarationKind(node)
		name := policyDeclarationName(node)
		if kind == "" || name == "" {
			return true
		}
		subject := policySubject(node, kind, name, *annotations.policy, "annotation")
		if kind == "parameter" {
			subject.ParameterIndex = parameterPosition(node)
		}
		addSubject(subject)
		if nameNode := node.Name(); nameNode != nil {
			if symbol := typeChecker.GetSymbolAtLocation(nameNode); symbol != nil {
				analysis.subjectsBySymbol[ast.GetSymbolId(symbol)] = subject
			}
		}
		if selector := secretSelectorForDeclaration(node, typeChecker); selector != "" {
			analysis.selectorsByID[subject.ID] = selector
		}
		return true
	})

	collectTypePolicySubjects(
		sourceFile,
		typeChecker,
		&analysis,
		addSubject,
	)

	for _, candidate := range activeComponentCandidates(sourceFile) {
		componentID := ""
		for _, component := range components {
			if component.Start == candidate.node.Pos() {
				componentID = component.ID
				break
			}
		}
		componentName := candidate.name
		for _, parameter := range candidate.node.Parameters() {
			if parameter.Name() == nil ||
				!ast.IsIdentifier(parameter.Name()) ||
				parameter.Name().Text() != "this" {
				continue
			}
			componentType := typeChecker.GetTypeAtLocation(parameter)
			stateSymbol := typeChecker.GetPropertyOfType(componentType, "state")
			if stateSymbol == nil {
				continue
			}
			stateType := typeChecker.GetTypeOfSymbolAtLocation(stateSymbol, parameter)
			collectStatePolicySubjects(
				typeChecker,
				stateType,
				componentName,
				componentID,
				nil,
				&analysis,
				addSubject,
				make(map[string]struct{}),
			)
		}
	}
	collectSharedStateTransfers(
		sourceFile,
		components,
		stateReads,
		&analysis,
		addSubject,
	)

	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return true
		}
		call := node.AsCallExpression()
		if resourceTargetName(call.Expression) != "createContext" {
			return true
		}
		declaration := enclosingVariableDeclaration(node, sourceFile.AsNode())
		if declaration == nil || declaration.Name() == nil ||
			!ast.IsIdentifier(declaration.Name()) {
			return true
		}
		token := declaration.Name().Text()
		options := ""
		if call.Arguments != nil && len(call.Arguments.Nodes) > 1 {
			options = sourceText(sourceFile, call.Arguments.Nodes[1])
		}
		policy := contextPolicy(options)
		subject := policySubject(
			declaration,
			"context",
			token,
			policy,
			contextPolicySource(options),
		)
		addSubject(subject)
		analysis.contextPolicies[token] = subject
		if symbol := typeChecker.GetSymbolAtLocation(declaration.Name()); symbol != nil {
			analysis.subjectsBySymbol[ast.GetSymbolId(symbol)] = subject
		}
		return true
	})
	collectCallPolicySubjects(sourceFile, typeChecker, &analysis, addSubject)
	collectSecretControlWrites(sourceFile, typeChecker, &analysis, addSubject)
	collectPolicyPropagation(sourceFile, typeChecker, &analysis, addSubject)
	collectSecretQualifications(sourceFile, typeChecker, &analysis)
	collectPolicySinks(sourceFile, typeChecker, &analysis)
	collectSecretConsumptions(sourceFile, typeChecker, request, &analysis)
	sort.Slice(analysis.graph.Subjects, func(left int, right int) bool {
		return analysis.graph.Subjects[left].ID < analysis.graph.Subjects[right].ID
	})
	_ = components
	return analysis
}

func collectCallPolicySubjects(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	analysis *policyAnalysis,
	addSubject func(PolicySubject),
) {
	returnPoliciesByName := make(map[string]PolicySubject)
	for _, subject := range analysis.graph.Subjects {
		if subject.Kind == "return" {
			returnPoliciesByName[subject.Name] = subject
		}
	}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return true
		}
		call := node.AsCallExpression()
		declarationPolicy := PolicySubject{}
		resolved := false
		if ast.IsPropertyAccessExpression(call.Expression) {
			name := call.Expression.AsPropertyAccessExpression().Name().Text()
			declarationPolicy, resolved = returnPoliciesByName[name]
		} else {
			symbol := resolvedCallableSymbol(
				callTargetSymbol(call.Expression, typeChecker),
				typeChecker,
			)
			if symbol != nil {
				declarationPolicy, resolved =
					analysis.subjectsBySymbol[ast.GetSymbolId(symbol)]
				resolved = resolved && declarationPolicy.Kind == "return"
			}
		}
		if !resolved {
			return true
		}
		subject := declarationPolicy
		subject.ID = policyLocationID(
			sourceFile,
			"policy:return",
			node.Pos(),
			strings.TrimSpace(sourceText(sourceFile, call.Expression)),
		)
		subject.Name = strings.TrimSpace(sourceText(sourceFile, call.Expression))
		addSubject(subject)
		analysis.callPolicies[nodeSpanKey(node)] = subject
		return true
	})
}

func collectSecretControlWrites(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	analysis *policyAnalysis,
	addSubject func(PolicySubject),
) {
	flowKeys := make(map[string]struct{})
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsBinaryExpression(node) {
			return true
		}
		expression := node.AsBinaryExpression()
		if expression.OperatorToken.Kind != ast.KindEqualsToken ||
			!ast.IsIdentifier(expression.Left) {
			return true
		}
		inputs := secretControlInputs(
			node,
			typeChecker,
			analysis.subjectsBySymbol,
		)
		if len(inputs) == 0 {
			return true
		}
		symbol := typeChecker.GetSymbolAtLocation(expression.Left)
		if symbol == nil {
			return true
		}
		symbolID := ast.GetSymbolId(symbol)
		target, exists := analysis.subjectsBySymbol[symbolID]
		if !exists {
			target = policySubject(
				expression.Left,
				"declaration",
				expression.Left.Text(),
				dataPolicy("secret"),
				"inference",
			)
			addSubject(target)
			analysis.subjectsBySymbol[symbolID] = target
		}
		addPolicyPropagationFlow(
			sourceFile,
			node,
			inputs,
			target,
			dataPolicy("secret"),
			target.Policy.Secret,
			"secret-controlled assignment cannot flow into an unqualified declaration",
			flowKeys,
			analysis,
		)
		return true
	})
}

func collectPolicySinks(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	analysis *policyAnalysis,
) {
	seen := make(map[string]struct{})
	addSink := func(
		node *ast.Node,
		inputs []PolicySubject,
		boundary string,
		reason string,
	) {
		if len(inputs) == 0 {
			return
		}
		key := fmt.Sprintf("%d:%s:%s", node.Pos(), boundary, reason)
		if _, duplicate := seen[key]; duplicate {
			return
		}
		seen[key] = struct{}{}
		from := make([]string, 0, len(inputs))
		for _, input := range inputs {
			from = append(from, input.ID)
		}
		sort.Strings(from)
		combined, _ := combineSubjectPolicies(inputs)
		sinkID := policyLocationID(sourceFile, "policy:sink", node.Pos(), boundary)
		analysis.graph.Flows = append(analysis.graph.Flows, PolicyFlow{
			ID:         sinkID,
			Kind:       "transfer",
			From:       from,
			To:         sinkID,
			Policy:     combined,
			Boundary:   boundary,
			Authorized: false,
			Reason:     reason,
		})
		analysis.diagnostics = append(analysis.diagnostics, Diagnostic{
			Severity: "error",
			Code:     "EXACT3020",
			Message:  "error: " + reason,
			Start:    node.Pos(),
			Length:   node.End() - node.Pos(),
		})
	}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		switch {
		case ast.IsShorthandPropertyAssignment(node):
			name := policyDeclarationName(node)
			if name == "loader" || name == "action" {
				addHydrationSink(
					node,
					name,
					policyInputsForNode(node, typeChecker, analysis.subjectsBySymbol),
					addSink,
				)
			}
		case ast.IsPropertyAssignment(node):
			property := node.AsPropertyAssignment()
			name := policyDeclarationName(node)
			if name != "loader" && name != "action" {
				break
			}
			inputs := hydrationPolicyInputs(
				property.Initializer,
				typeChecker,
				analysis.subjectsBySymbol,
			)
			addHydrationSink(node, name, inputs, addSink)
		case ast.IsMethodDeclaration(node) &&
			node.Parent != nil &&
			ast.IsObjectLiteralExpression(node.Parent):
			name := policyDeclarationName(node)
			if name != "loader" && name != "action" {
				break
			}
			inputs := callableReturnPolicyInputs(
				node,
				typeChecker,
				analysis.subjectsBySymbol,
			)
			addHydrationSink(node, name, inputs, addSink)
		case ast.IsJsxSpreadAttribute(node):
			expression := node.AsJsxSpreadAttribute().Expression
			addSink(
				node,
				secretPolicyInputs(expression, typeChecker, analysis.subjectsBySymbol),
				"operation",
				"secret-qualified value cannot influence an operation spread attribute",
			)
		case ast.IsJsxExpression(node):
			expression := node.AsJsxExpression().Expression
			if expression == nil {
				return true
			}
			if node.Parent != nil && ast.IsJsxAttribute(node.Parent) {
				addSink(
					node,
					secretPolicyInputs(expression, typeChecker, analysis.subjectsBySymbol),
					"operation",
					"secret-qualified value cannot influence an operation attribute",
				)
			} else {
				addSink(
					node,
					secretPolicyInputs(expression, typeChecker, analysis.subjectsBySymbol),
					"operation",
					"secret-qualified value cannot influence operation output",
				)
			}
		case ast.IsThrowStatement(node):
			direct := secretPolicyInputs(
				node.AsThrowStatement().Expression,
				typeChecker,
				analysis.subjectsBySymbol,
			)
			addSink(
				node,
				direct,
				"error",
				"secret-qualified value cannot influence a thrown error",
			)
			addSink(
				node,
				secretControlInputs(node, typeChecker, analysis.subjectsBySymbol),
				"error",
				"secret-qualified value cannot influence secret-controlled error behavior",
			)
		case ast.IsCallExpression(node) && isConsoleCall(node.AsCallExpression()):
			inputs := []PolicySubject{}
			call := node.AsCallExpression()
			if call.Arguments != nil {
				for _, argument := range call.Arguments.Nodes {
					inputs = append(
						inputs,
						secretPolicyInputs(argument, typeChecker, analysis.subjectsBySymbol)...,
					)
				}
			}
			inputs = append(
				inputs,
				secretControlInputs(node, typeChecker, analysis.subjectsBySymbol)...,
			)
			addSink(
				node,
				uniquePolicySubjects(inputs),
				"log",
				"secret-qualified value cannot influence secret-controlled console output",
			)
		}
		return true
	})
	sort.Slice(analysis.graph.Flows, func(left int, right int) bool {
		return analysis.graph.Flows[left].ID < analysis.graph.Flows[right].ID
	})
}

func hydrationPolicyInputs(
	value *ast.Node,
	typeChecker *checker.Checker,
	subjects map[ast.SymbolId]PolicySubject,
) []PolicySubject {
	if value == nil {
		return nil
	}
	if isCallableNode(value) {
		return callableReturnPolicyInputs(value, typeChecker, subjects)
	}
	return policyInputsForNode(value, typeChecker, subjects)
}

func addHydrationSink(
	node *ast.Node,
	operation string,
	inputs []PolicySubject,
	addSink func(*ast.Node, []PolicySubject, string, string),
) {
	if len(inputs) == 0 {
		return
	}
	policy, _ := combineSubjectPolicies(inputs)
	reason := ""
	if policy.Secret {
		reason = "secret value cannot enter route " + operation + " hydration data"
	} else if policy.Residency == "server" {
		reason = "server-kept value cannot enter route " + operation + " hydration data"
	}
	if reason != "" {
		addSink(node, inputs, "hydration", reason)
	}
}

func applyComponentPolicies(
	sourceFile *ast.SourceFile,
	components []Component,
	tasks []Task,
	policy *policyAnalysis,
	stateReads []StateRead,
	request Request,
) []Component {
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return true
		}
		call := node.AsCallExpression()
		if resourceTargetName(call.Expression) != "getContext" ||
			call.Arguments == nil ||
			len(call.Arguments.Nodes) == 0 ||
			!ast.IsIdentifier(call.Arguments.Nodes[0]) {
			return true
		}
		token := call.Arguments.Nodes[0].Text()
		requirement, exists := policy.contextPolicies[token]
		if !exists ||
			(!requirement.Policy.Secret &&
				requirement.Policy.Residency != "server") {
			return true
		}
		for index := range components {
			component := &components[index]
			if node.Pos() < component.Start ||
				node.End() > component.Start+component.Length {
				continue
			}
			for _, task := range tasks {
				if task.Component == component.Name &&
					node.Pos() >= task.Start &&
					node.End() <= task.Start+task.Length {
					return true
				}
			}
			component.Placement = "server"
			component.EnvironmentEffect = "server"
			component.ArtifactTargets = []string{"server"}
			return true
		}
		return true
	})
	if request.Target != TargetServer {
		return components
	}
	for _, read := range stateReads {
		nodeProtected := (*statePolicy)(nil)
		for index := range policy.statePolicies {
			candidate := &policy.statePolicies[index]
			if candidate.component == read.Component &&
				policyPathsOverlap(candidate.path, strings.Join(read.Path, ".")) &&
				(candidate.subject.Policy.Secret ||
					candidate.subject.Policy.Residency == "server") {
				nodeProtected = candidate
				break
			}
		}
		if nodeProtected == nil {
			continue
		}
		for index := range components {
			component := &components[index]
			if component.Name != read.Component || component.ClientIslandCount == 0 {
				continue
			}
			kind := "server-kept"
			if nodeProtected.subject.Policy.Secret {
				kind = "secret"
			}
			message := "error: client island captures " + kind +
				" state path " + nodeProtected.path
			component.Diagnostics = append(component.Diagnostics, message)
			policy.diagnostics = append(policy.diagnostics, Diagnostic{
				Severity: "error",
				Code:     "EXACT3021",
				Message:  message,
				Start:    read.Start,
				Length:   read.Length,
			})
		}
	}
	return components
}

func isConsoleCall(call *ast.CallExpression) bool {
	if !ast.IsPropertyAccessExpression(call.Expression) {
		return false
	}
	receiver := call.Expression.AsPropertyAccessExpression().Expression
	return ast.IsIdentifier(receiver) && receiver.Text() == "console"
}

func secretControlInputs(
	node *ast.Node,
	typeChecker *checker.Checker,
	subjects map[ast.SymbolId]PolicySubject,
) []PolicySubject {
	result := []PolicySubject{}
	for current := node.Parent; current != nil; current = current.Parent {
		if ast.IsIfStatement(current) {
			result = append(
				result,
				secretPolicyInputs(
					current.AsIfStatement().Expression,
					typeChecker,
					subjects,
				)...,
			)
		}
		if isCallableNode(current) {
			break
		}
	}
	return uniquePolicySubjects(result)
}

func uniquePolicySubjects(values []PolicySubject) []PolicySubject {
	result := []PolicySubject{}
	seen := make(map[string]struct{})
	for _, value := range values {
		if _, duplicate := seen[value.ID]; duplicate {
			continue
		}
		seen[value.ID] = struct{}{}
		result = append(result, value)
	}
	sort.Slice(result, func(left int, right int) bool {
		return result[left].ID < result[right].ID
	})
	return result
}

func sourceLocation(sourceFile *ast.SourceFile, position int) (int, int) {
	lineMap := sourceFile.ECMALineMap()
	line := sort.Search(len(lineMap), func(index int) bool {
		return int(lineMap[index]) > position
	}) - 1
	if line < 0 {
		line = 0
	}
	column := position
	if len(lineMap) != 0 {
		column -= int(lineMap[line])
	}
	return line + 1, column + 1
}

func policyLocationID(
	sourceFile *ast.SourceFile,
	kind string,
	position int,
	suffix string,
) string {
	return fmt.Sprintf(
		"%s:%s:%d:%s",
		kind,
		sourceFile.FileName(),
		position,
		suffix,
	)
}

func policyNodeAnnotations(
	node *ast.Node,
	sourceFile *ast.SourceFile,
) exactAnnotations {
	result := annotationsForNode(node, sourceFile)
	if ast.IsVariableDeclaration(node) {
		for current := node.Parent; current != nil; current = current.Parent {
			if ast.IsVariableStatement(current) {
				result = mergeAnnotations(
					result,
					annotationsForNode(current, sourceFile),
				)
				break
			}
		}
	}
	return result
}

func annotationsForNode(node *ast.Node, sourceFile *ast.SourceFile) exactAnnotations {
	var text strings.Builder
	for _, jsdoc := range node.JSDoc(sourceFile) {
		text.WriteString(sourceText(sourceFile, jsdoc))
		text.WriteByte('\n')
	}
	value := text.String()
	if value == "" {
		return exactAnnotations{}
	}
	annotations := exactAnnotations{
		client: strings.Contains(value, "@exact client"),
		server: strings.Contains(value, "@exact server"),
		pure:   strings.Contains(value, "@exact pure"),
	}
	if match := keepAnnotation.FindStringSubmatch(value); len(match) != 0 {
		keep := firstNonEmpty(match[1], match[2], match[3])
		policy := dataPolicy(keep)
		annotations.policy = &policy
	} else if strings.Contains(value, "@exact shared") {
		policy := dataPolicy("shared")
		annotations.policy = &policy
	}
	return annotations
}

func callableNodeAnnotations(
	node *ast.Node,
	sourceFile *ast.SourceFile,
) exactAnnotations {
	result := annotationsForNode(node, sourceFile)
	for current := node.Parent; current != nil; current = current.Parent {
		if ast.IsVariableDeclaration(current) || ast.IsVariableStatement(current) {
			result = mergeAnnotations(result, annotationsForNode(current, sourceFile))
		}
		if ast.IsVariableStatement(current) || ast.IsFunctionDeclaration(node) {
			break
		}
	}
	return result
}

func mergeAnnotations(left exactAnnotations, right exactAnnotations) exactAnnotations {
	if left.policy == nil {
		left.policy = right.policy
	}
	left.client = left.client || right.client
	left.server = left.server || right.server
	left.pure = left.pure || right.pure
	return left
}

func applyCallableAnnotations(
	fact *callableFacts,
	sourceFile *ast.SourceFile,
) {
	annotations := callableNodeAnnotations(fact.node, sourceFile)
	fact.summary.ReevaluationSafe = annotations.pure
	if annotations.client {
		fact.summary.DirectEffectSources = append(
			fact.summary.DirectEffectSources,
			environmentSource("browser", "exact client callable", fact.summary.Name),
		)
	}
	if annotations.server {
		fact.summary.DirectEffectSources = append(
			fact.summary.DirectEffectSources,
			environmentSource("server", "exact server callable", fact.summary.Name),
		)
	}
	if annotations.policy == nil || annotations.policy.Residency == "shared" {
		return
	}
	environment := "server"
	description := annotations.policy.Residency + "-kept data policy"
	if annotations.policy.Secret {
		description = "secret data policy"
	} else if annotations.policy.Residency == "client" {
		environment = "browser"
	}
	fact.summary.DirectEffectSources = append(
		fact.summary.DirectEffectSources,
		environmentSource(environment, description, fact.summary.Name),
	)
}

func policyDeclarationKind(node *ast.Node) string {
	switch {
	case ast.IsVariableDeclaration(node), ast.IsBindingElement(node):
		return "declaration"
	case ast.IsFunctionDeclaration(node),
		ast.IsMethodDeclaration(node),
		ast.IsMethodSignatureDeclaration(node):
		return "return"
	case ast.IsParameterDeclaration(node):
		return "parameter"
	case ast.IsPropertyDeclaration(node), ast.IsPropertySignatureDeclaration(node):
		return "field"
	default:
		return ""
	}
}

func policyDeclarationName(node *ast.Node) string {
	if name := node.Name(); name != nil {
		if ast.IsIdentifier(name) {
			return name.Text()
		}
		if ast.IsStringLiteral(name) {
			return name.AsStringLiteral().Text
		}
	}
	return ""
}

func policySubject(
	node *ast.Node,
	kind string,
	name string,
	policy DataPolicy,
	source string,
) PolicySubject {
	return PolicySubject{
		ID:     "policy:" + kind + ":" + strconv.Itoa(node.Pos()) + ":" + name,
		Kind:   kind,
		Name:   name,
		Policy: policy,
		Source: source,
	}
}

func parameterPosition(node *ast.Node) int {
	if node.Parent == nil || !isCallableNode(node.Parent) {
		return 0
	}
	for index, parameter := range node.Parent.Parameters() {
		if parameter == node {
			return index
		}
	}
	return 0
}

func dataPolicy(keep string) DataPolicy {
	if keep == "secret" {
		return DataPolicy{Residency: "server", Secret: true}
	}
	return DataPolicy{Residency: keep}
}

func contextPolicy(options string) DataPolicy {
	if match := contextKeepOption.FindStringSubmatch(options); len(match) != 0 {
		return dataPolicy(firstNonEmpty(match[1], match[2]))
	}
	if match := contextScopeOption.FindStringSubmatch(options); len(match) != 0 {
		scope := firstNonEmpty(match[1], match[2])
		if scope == "application" || scope == "request" {
			return dataPolicy("server")
		}
	}
	return dataPolicy("shared")
}

func contextPolicySource(options string) string {
	if contextKeepOption.MatchString(options) {
		return "context-option"
	}
	return "inference"
}

func policyPathsOverlap(policyPath string, accessedPath string) bool {
	return accessedPath == "*" ||
		policyPath == accessedPath ||
		strings.HasPrefix(accessedPath, policyPath+".") ||
		strings.HasPrefix(policyPath, accessedPath+".")
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
