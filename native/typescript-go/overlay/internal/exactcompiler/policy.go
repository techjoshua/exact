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
				"vnode",
				"secret-qualified value cannot influence a VNode spread attribute",
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
					"vnode",
					"secret-qualified value cannot influence a VNode attribute",
				)
			} else {
				addSink(
					node,
					secretPolicyInputs(expression, typeChecker, analysis.subjectsBySymbol),
					"vnode",
					"secret-qualified value cannot influence VNode output",
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

func collectSharedStateTransfers(
	sourceFile *ast.SourceFile,
	components []Component,
	stateReads []StateRead,
	analysis *policyAnalysis,
	addSubject func(PolicySubject),
) {
	nodesBySpan := make(map[string]*ast.Node)
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		nodesBySpan[nodeSpanKey(node)] = node
		return true
	})
	componentIDs := make(map[string]string)
	for _, component := range components {
		componentIDs[component.Name] = component.ID
	}
	seen := make(map[string]struct{})
	for _, read := range stateReads {
		path := strings.Join(read.Path, ".")
		if path == "" || path == "*" {
			continue
		}
		protected := false
		for _, existing := range analysis.statePolicies {
			if existing.component == read.Component &&
				policyPathsOverlap(existing.path, path) {
				protected = true
				break
			}
		}
		if protected {
			continue
		}
		node := nodesBySpan[fmt.Sprintf("%d:%d", read.Start, read.Length)]
		withinJSX, projected := stateReadJSXBoundary(node)
		if !withinJSX {
			continue
		}
		key := read.Component + ":" + path
		if _, duplicate := seen[key]; duplicate {
			continue
		}
		seen[key] = struct{}{}
		subject := PolicySubject{
			ID:          "policy:state:" + read.Component + ":" + path,
			Kind:        "state",
			Name:        read.Component + ".state." + path,
			Path:        path,
			ComponentID: componentIDs[read.Component],
			Policy:      dataPolicy("shared"),
			Source:      "inference",
		}
		addSubject(subject)
		analysis.statePolicies = append(analysis.statePolicies, statePolicy{
			component: read.Component,
			path:      path,
			subject:   subject,
		})
		if projected {
			analysis.graph.Flows = append(analysis.graph.Flows, PolicyFlow{
				ID:         policyLocationID(sourceFile, "policy:projection", read.Start, path),
				Kind:       "projection",
				From:       []string{subject.ID},
				To:         subject.ID,
				Policy:     subject.Policy,
				Boundary:   "state",
				Authorized: true,
			})
		}
		analysis.graph.Flows = append(analysis.graph.Flows, PolicyFlow{
			ID:         policyLocationID(sourceFile, "policy:transfer", read.Start, path),
			Kind:       "transfer",
			From:       []string{subject.ID},
			To:         subject.ID,
			Policy:     subject.Policy,
			Boundary:   "client-island",
			Authorized: true,
		})
	}
}

func stateReadJSXBoundary(node *ast.Node) (withinJSX bool, projected bool) {
	if node == nil {
		return false, false
	}
	insideNestedCallable := false
	for current := node.Parent; current != nil; current = current.Parent {
		if ast.IsJsxExpression(current) ||
			ast.IsJsxAttribute(current) ||
			ast.IsJsxSpreadAttribute(current) ||
			ast.IsJsxElement(current) ||
			ast.IsJsxSelfClosingElement(current) ||
			ast.IsJsxFragment(current) {
			return true, !insideNestedCallable
		}
		if isCallableNode(current) {
			insideNestedCallable = true
		}
	}
	return false, false
}

func collectSecretQualifications(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	analysis *policyAnalysis,
) {
	seen := make(map[string]struct{})
	qualifiedBindings := make(map[ast.SymbolId]struct{})
	add := func(expression *ast.Node) {
		if expression == nil {
			return
		}
		if policy, qualified := policyFromCheckerType(
			typeChecker.GetTypeAtLocation(expression),
			typeChecker,
		); qualified && policy.Secret {
			return
		}
		key := nodeSpanKey(expression)
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		analysis.qualifications = append(
			analysis.qualifications,
			expression,
		)
	}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsVariableDeclaration(node) {
			return true
		}
		declaration := node.AsVariableDeclaration()
		if declaration.Initializer == nil {
			return true
		}
		for _, binding := range policyBindingNames(declaration.Name()) {
			symbol := typeChecker.GetSymbolAtLocation(binding)
			if symbol == nil {
				continue
			}
			subject, exists := analysis.subjectsBySymbol[ast.GetSymbolId(symbol)]
			if exists && subject.Policy.Secret {
				add(declaration.Initializer)
				qualifiedBindings[ast.GetSymbolId(symbol)] = struct{}{}
				break
			}
		}
		return true
	})
	qualificationCallables := []*ast.Node{}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if isCallableNode(node) {
			qualificationCallables = append(qualificationCallables, node)
		}
		return true
	})
	for _, candidate := range qualificationCallables {
		name := callablePolicyNameNode(candidate)
		if name == nil {
			continue
		}
		symbol := typeChecker.GetSymbolAtLocation(name)
		if symbol == nil {
			continue
		}
		subject, exists := analysis.subjectsBySymbol[ast.GetSymbolId(symbol)]
		if !exists || !subject.Policy.Secret {
			continue
		}
		walkNode(candidate, func(node *ast.Node) bool {
			if node != candidate && isCallableNode(node) {
				return false
			}
			if !ast.IsReturnStatement(node) {
				return true
			}
			value := node.AsReturnStatement().Expression
			if value == nil {
				return true
			}
			if ast.IsIdentifier(value) {
				valueSymbol := typeChecker.GetSymbolAtLocation(value)
				if valueSymbol != nil {
					if _, already := qualifiedBindings[ast.GetSymbolId(valueSymbol)]; already {
						return true
					}
				}
			}
			add(value)
			return true
		})
	}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return true
		}
		call := node.AsCallExpression()
		if isImportedSecretConsume(call.Expression, typeChecker) ||
			call.Arguments == nil {
			return true
		}
		secretArguments := make(map[int]struct{})
		for index, argument := range call.Arguments.Nodes {
			if len(secretPolicyInputs(
				argument,
				typeChecker,
				analysis.subjectsBySymbol,
			)) != 0 {
				secretArguments[index] = struct{}{}
			}
		}
		if len(secretArguments) == 0 {
			return true
		}
		signature := typeChecker.GetResolvedSignature(node)
		if signature == nil {
			return true
		}
		for index, argument := range call.Arguments.Nodes {
			if _, relevant := secretArguments[index]; !relevant {
				continue
			}
			parameterType := signatureParameterType(
				signature,
				index,
				argument,
				typeChecker,
			)
			policy, secret := policyFromCheckerType(
				parameterType,
				typeChecker,
			)
			if !secret || !policy.Secret {
				continue
			}
			if ast.IsIdentifier(argument) {
				argumentSymbol := typeChecker.GetSymbolAtLocation(argument)
				if argumentSymbol != nil {
					if _, already := qualifiedBindings[ast.GetSymbolId(argumentSymbol)]; already {
						continue
					}
				}
			}
			add(argument)
		}
		return true
	})
	sort.Slice(analysis.qualifications, func(left int, right int) bool {
		return analysis.qualifications[left].Pos() <
			analysis.qualifications[right].Pos()
	})
}

// collectSecretConsumptions audits the only operation which removes secret
// qualification and rejects unqualified call boundaries. It records source
// identity and policy metadata only; secret values never enter the analysis graph.
func collectSecretConsumptions(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	request Request,
	analysis *policyAnalysis,
) {
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return true
		}
		call := node.AsCallExpression()
		isConsume := isImportedSecretConsume(call.Expression, typeChecker)
		if isConsume {
			collectSecretConsumeCall(sourceFile, typeChecker, request, node, analysis)
			return true
		}
		if call.Arguments == nil {
			return true
		}
		inputsByArgument := make([][]PolicySubject, len(call.Arguments.Nodes))
		hasSecretArgument := false
		for parameter, argument := range call.Arguments.Nodes {
			inputs := secretPolicyInputs(argument, typeChecker, analysis.subjectsBySymbol)
			inputsByArgument[parameter] = inputs
			hasSecretArgument = hasSecretArgument || len(inputs) != 0
		}
		if !hasSecretArgument {
			return true
		}
		signature := typeChecker.GetResolvedSignature(node)
		for parameter, argument := range call.Arguments.Nodes {
			inputs := inputsByArgument[parameter]
			if len(inputs) == 0 {
				continue
			}
			authorized := signatureAcceptsSecret(
				signature,
				parameter,
				argument,
				typeChecker,
			)
			reason := ""
			if !authorized {
				reason = "secret argument requires an explicit Secret<T> parameter or consume()"
			}
			consumerID := policyLocationID(
				sourceFile,
				"policy:secret-call",
				node.Pos(),
				strconv.Itoa(parameter),
			)
			analysis.graph.Flows = append(
				analysis.graph.Flows,
				secretReceiptFlow(consumerID, inputs, authorized, reason),
			)
			if !authorized {
				analysis.diagnostics = append(analysis.diagnostics, Diagnostic{
					Severity: "error",
					Code:     "EXACT3003",
					Message:  "error: " + reason,
					Start:    argument.Pos(),
					Length:   argument.End() - argument.Pos(),
				})
			}
		}
		return true
	})
	sort.Slice(analysis.graph.SecretConsumers, func(left int, right int) bool {
		return analysis.graph.SecretConsumers[left].ID <
			analysis.graph.SecretConsumers[right].ID
	})
	sort.Slice(analysis.graph.Flows, func(left int, right int) bool {
		return analysis.graph.Flows[left].ID < analysis.graph.Flows[right].ID
	})
}

func collectSecretConsumeCall(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	request Request,
	node *ast.Node,
	analysis *policyAnalysis,
) {
	call := node.AsCallExpression()
	if call.Arguments == nil || len(call.Arguments.Nodes) == 0 {
		return
	}
	argument := call.Arguments.Nodes[0]
	inputs := secretPolicyInputs(argument, typeChecker, analysis.subjectsBySymbol)
	if len(inputs) == 0 {
		analysis.diagnostics = append(analysis.diagnostics, Diagnostic{
			Severity: "error",
			Code:     "EXACT3002",
			Message:  "error: consume() argument is not secret-qualified",
			Start:    argument.Pos(),
			Length:   argument.End() - argument.Pos(),
		})
		return
	}
	artifactTarget := "server"
	authorization := "implicit-application-owner"
	reason := ""
	if request.Target == TargetClient {
		artifactTarget = "client"
		authorization = "denied"
		reason = "secret consumption cannot be retained in a client artifact"
	} else if request.PackageType == "library" {
		authorization = "library-requirement"
	}
	line, column := sourceLocation(sourceFile, node.Pos())
	id := policyLocationID(sourceFile, "secret-consumer", node.Pos(), "consume")
	selector := commonSecretSelector(inputs, analysis.selectorsByID)
	analysis.graph.SecretConsumers = append(
		analysis.graph.SecretConsumers,
		SecretConsumer{
			ID:       id,
			Selector: selector,
			Dynamic:  selector == "",
			Source:   sourceFile.FileName(),
			Line:     line,
			Column:   column,
			Caller:   nearestPolicyCallableName(node),
			Consumer: SecretConsumerTarget{
				Package:   secretConsumerPackage(request),
				Symbol:    "consume",
				Parameter: 0,
			},
			Target:        artifactTarget,
			Authorization: authorization,
			Reason:        reason,
		},
	)
	analysis.graph.Flows = append(
		analysis.graph.Flows,
		secretReceiptFlow(id, inputs, authorization != "denied", reason),
	)
	if reason != "" {
		analysis.diagnostics = append(analysis.diagnostics, Diagnostic{
			Severity: "error",
			Code:     "EXACT3004",
			Message:  "error: " + reason,
			Start:    node.Pos(),
			Length:   node.End() - node.Pos(),
		})
	}
}

func secretConsumerPackage(request Request) string {
	if request.PackageName != "" {
		return request.PackageName
	}
	if request.PackageType == "library" {
		return "<library>"
	}
	return "<application>"
}

func commonSecretSelector(
	inputs []PolicySubject,
	selectors map[string]string,
) string {
	selector := ""
	for _, input := range inputs {
		value := selectors[input.ID]
		if value == "" {
			return ""
		}
		if selector != "" && selector != value {
			return ""
		}
		selector = value
	}
	return selector
}

func secretPolicyInputs(
	node *ast.Node,
	typeChecker *checker.Checker,
	subjects map[ast.SymbolId]PolicySubject,
) []PolicySubject {
	inputs := policyInputsForNode(node, typeChecker, subjects)
	result := make([]PolicySubject, 0, len(inputs))
	for _, input := range inputs {
		if input.Policy.Secret {
			result = append(result, input)
		}
	}
	return result
}

func secretReceiptFlow(
	id string,
	inputs []PolicySubject,
	authorized bool,
	reason string,
) PolicyFlow {
	from := make([]string, 0, len(inputs))
	for _, input := range inputs {
		from = append(from, input.ID)
	}
	sort.Strings(from)
	return PolicyFlow{
		ID:         id + ":receipt",
		Kind:       "receipt",
		From:       from,
		To:         id,
		Policy:     dataPolicy("secret"),
		Boundary:   "call",
		Authorized: authorized,
		Reason:     reason,
	}
}

func signatureAcceptsSecret(
	signature *checker.Signature,
	parameter int,
	location *ast.Node,
	typeChecker *checker.Checker,
) bool {
	if signature == nil {
		return false
	}
	parameters := signature.Parameters()
	if parameter >= len(parameters) {
		return false
	}
	value := typeChecker.GetTypeOfSymbolAtLocation(parameters[parameter], location)
	if value == nil {
		return false
	}
	display := typeChecker.TypeToString(value)
	return strings.Contains(display, "Secret<") ||
		strings.HasPrefix(display, "Secret")
}

func signatureParameterType(
	signature *checker.Signature,
	parameter int,
	location *ast.Node,
	typeChecker *checker.Checker,
) *checker.Type {
	if signature == nil {
		return nil
	}
	parameters := signature.Parameters()
	if parameter >= len(parameters) {
		return nil
	}
	return typeChecker.GetTypeOfSymbolAtLocation(
		parameters[parameter],
		location,
	)
}

func isImportedSecretConsume(
	expression *ast.Node,
	typeChecker *checker.Checker,
) bool {
	if ast.IsIdentifier(expression) {
		return importBindingMatches(
			expression,
			typeChecker,
			"consume",
			false,
		)
	}
	if !ast.IsPropertyAccessExpression(expression) {
		return false
	}
	member := expression.AsPropertyAccessExpression()
	if member.Name().Text() != "consume" ||
		!ast.IsIdentifier(member.Expression) {
		return false
	}
	return importBindingMatches(
		member.Expression,
		typeChecker,
		"",
		true,
	)
}

func importBindingMatches(
	identifier *ast.Node,
	typeChecker *checker.Checker,
	importedName string,
	namespace bool,
) bool {
	symbol := typeChecker.GetSymbolAtLocation(identifier)
	if symbol == nil {
		return false
	}
	for _, declaration := range symbol.Declarations {
		if namespace && !ast.IsNamespaceImport(declaration) &&
			!ast.IsImportClause(declaration) {
			continue
		}
		if !namespace && !ast.IsImportSpecifier(declaration) {
			continue
		}
		if !namespace {
			specifier := declaration.AsImportSpecifier()
			name := specifier.Name().Text()
			if specifier.PropertyName != nil {
				name = specifier.PropertyName.Text()
			}
			if name != importedName {
				continue
			}
		}
		importDeclaration := enclosingImportDeclaration(declaration)
		if importDeclaration == nil {
			continue
		}
		moduleSpecifier := importDeclaration.AsImportDeclaration().ModuleSpecifier
		if ast.IsStringLiteral(moduleSpecifier) &&
			moduleSpecifier.AsStringLiteral().Text == "@exactjs/secrets" {
			return true
		}
	}
	return false
}

func enclosingImportDeclaration(node *ast.Node) *ast.Node {
	for current := node; current != nil; current = current.Parent {
		if ast.IsImportDeclaration(current) {
			return current
		}
	}
	return nil
}

func nearestPolicyCallableName(node *ast.Node) string {
	for current := node.Parent; current != nil; current = current.Parent {
		if !isCallableNode(current) {
			continue
		}
		name, _, _ := callableIdentity(current, nil)
		if !strings.HasPrefix(name, "<anonymous@") {
			return name
		}
	}
	return "<module>"
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

func collectStatePolicySubjects(
	typeChecker *checker.Checker,
	value *checker.Type,
	component string,
	componentID string,
	path []string,
	analysis *policyAnalysis,
	addSubject func(PolicySubject),
	seen map[string]struct{},
) {
	if value == nil || len(path) > 32 {
		return
	}
	identity := typeChecker.TypeToString(value) + ":" + strings.Join(path, ".")
	if _, exists := seen[identity]; exists {
		return
	}
	seen[identity] = struct{}{}
	for _, property := range typeChecker.GetPropertiesOfType(value) {
		name := ast.SymbolName(property)
		nextPath := append(append([]string(nil), path...), name)
		var annotations exactAnnotations
		for _, declaration := range property.Declarations {
			file := ast.GetSourceFileOfNode(declaration)
			if file != nil {
				annotations = mergeAnnotations(
					annotations,
					annotationsForNode(declaration, file),
				)
			}
		}
		if annotations.policy != nil {
			pathText := strings.Join(nextPath, ".")
			subject := PolicySubject{
				ID:          "policy:state:" + component + ":" + pathText,
				Kind:        "state",
				Name:        component + ".state." + pathText,
				Path:        pathText,
				ComponentID: componentID,
				Policy:      *annotations.policy,
				Source:      "annotation",
			}
			addSubject(subject)
			analysis.statePolicies = append(analysis.statePolicies, statePolicy{
				component: component,
				path:      pathText,
				subject:   subject,
			})
			analysis.subjectsBySymbol[ast.GetSymbolId(property)] = subject
		}
		propertyType := typeChecker.GetTypeOfSymbol(property)
		collectStatePolicySubjects(
			typeChecker,
			propertyType,
			component,
			componentID,
			nextPath,
			analysis,
			addSubject,
			seen,
		)
	}
}

func collectTypePolicySubjects(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	analysis *policyAnalysis,
	addSubject func(PolicySubject),
) {
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		kind := policyDeclarationKind(node)
		name := policyDeclarationName(node)
		if kind == "" || name == "" || kind == "return" {
			return true
		}
		// Contextually typed callback parameters cannot introduce a Secret<T>
		// contract of their own. Skipping them also avoids forcing checker
		// contextual-object resolution for every ordinary callback in a project.
		if kind == "parameter" && node.Type() == nil {
			return true
		}
		nameNode := node.Name()
		if nameNode == nil || !ast.IsIdentifier(nameNode) {
			return true
		}
		symbol := typeChecker.GetSymbolAtLocation(nameNode)
		if symbol == nil {
			return true
		}
		symbolID := ast.GetSymbolId(symbol)
		if _, exists := analysis.subjectsBySymbol[symbolID]; exists {
			return true
		}
		policy := DataPolicy{}
		selector := secretSelectorForDeclaration(node, typeChecker)
		if isSecretProviderDeclaration(node, typeChecker) {
			policy = dataPolicy("secret")
		} else {
			// Inferred declaration types can force the checker through an
			// unrelated contextual object or callback graph. Compiler-known
			// secret providers are recognized above and downstream inference
			// is handled by collectPolicyPropagation, so only explicit type
			// contracts need a checker query here.
			if node.Type() == nil {
				return true
			}
			var exists bool
			policy, exists = policyFromCheckerType(
				typeChecker.GetTypeAtLocation(node.Type()),
				typeChecker,
			)
			if !exists {
				return true
			}
		}
		subject := policySubject(node, kind, name, policy, "import")
		if kind == "parameter" {
			subject.ParameterIndex = parameterPosition(node)
		}
		addSubject(subject)
		analysis.subjectsBySymbol[symbolID] = subject
		if selector != "" {
			analysis.selectorsByID[subject.ID] = selector
		}
		return true
	})
}

func policyFromCheckerType(
	value *checker.Type,
	typeChecker *checker.Checker,
) (DataPolicy, bool) {
	if value == nil {
		return DataPolicy{}, false
	}
	display := typeChecker.TypeToString(value)
	if strings.Contains(display, "Secret<") ||
		strings.HasPrefix(display, "Secret") {
		return dataPolicy("secret"), true
	}
	return DataPolicy{}, false
}

func secretSelectorForDeclaration(
	node *ast.Node,
	typeChecker *checker.Checker,
) string {
	call := secretProviderCall(node, typeChecker)
	if call == nil && ast.IsVariableDeclaration(node) {
		initializer := node.AsVariableDeclaration().Initializer
		if initializer != nil && ast.IsCallExpression(initializer) {
			candidate := initializer.AsCallExpression()
			if ast.IsPropertyAccessExpression(candidate.Expression) {
				method := candidate.Expression.AsPropertyAccessExpression().Name().Text()
				if method == "require" || method == "optional" {
					// An explicitly annotated secret may use an application-owned
					// provider facade. Preserve its static selector even though the
					// facade itself is not treated as a compiler-known secret source.
					call = candidate
				}
			}
		}
	}
	if call == nil || call.Arguments == nil ||
		len(call.Arguments.Nodes) == 0 ||
		!ast.IsStringLiteral(call.Arguments.Nodes[0]) {
		return ""
	}
	return call.Arguments.Nodes[0].AsStringLiteral().Text
}

func isSecretProviderDeclaration(
	node *ast.Node,
	typeChecker *checker.Checker,
) bool {
	return secretProviderCall(node, typeChecker) != nil
}

func secretProviderCall(
	node *ast.Node,
	typeChecker *checker.Checker,
) *ast.CallExpression {
	if !ast.IsVariableDeclaration(node) {
		return nil
	}
	initializer := node.AsVariableDeclaration().Initializer
	if initializer == nil || !ast.IsCallExpression(initializer) {
		return nil
	}
	call := initializer.AsCallExpression()
	if ast.IsIdentifier(call.Expression) {
		if importBindingMatches(call.Expression, typeChecker, "secret", false) {
			return call
		}
		return nil
	}
	if !ast.IsPropertyAccessExpression(call.Expression) {
		return nil
	}
	member := call.Expression.AsPropertyAccessExpression()
	if !ast.IsIdentifier(member.Expression) ||
		!importBindingMatches(member.Expression, typeChecker, "", true) {
		return nil
	}
	method := member.Name().Text()
	if method != "secret" && method != "require" && method != "optional" {
		return nil
	}
	return call
}

func collectPolicyPropagation(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	analysis *policyAnalysis,
	addSubject func(PolicySubject),
) {
	flowKeys := make(map[string]struct{})
	changed := true
	for changed {
		changed = false
		walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
			if !isCallableNode(node) {
				return true
			}
			nameNode := callablePolicyNameNode(node)
			if nameNode == nil {
				return true
			}
			symbol := typeChecker.GetSymbolAtLocation(nameNode)
			if symbol == nil {
				return true
			}
			inputs := callableReturnPolicyInputs(
				node,
				typeChecker,
				analysis.subjectsBySymbol,
			)
			if len(inputs) == 0 {
				return true
			}
			symbolID := ast.GetSymbolId(symbol)
			target, exists := analysis.subjectsBySymbol[symbolID]
			combined, conflict := combineSubjectPolicies(inputs)
			if !exists {
				name, _, _ := callableIdentity(node, nil)
				target = policySubject(
					node,
					"return",
					name,
					combined,
					"inference",
				)
				target.CallableID = fmt.Sprintf(
					"callable:%s:%d",
					sourceFile.FileName(),
					node.Pos(),
				)
				addSubject(target)
				analysis.subjectsBySymbol[symbolID] = target
				if selector := commonSecretSelector(inputs, analysis.selectorsByID); selector != "" {
					analysis.selectorsByID[target.ID] = selector
				}
				changed = true
			}
			authorized, reason := policyTransferAuthorized(combined, target.Policy, conflict)
			addPolicyPropagationFlow(
				sourceFile,
				node,
				inputs,
				target,
				combined,
				authorized,
				reason,
				flowKeys,
				analysis,
			)
			return true
		})
		walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
			if !ast.IsVariableDeclaration(node) {
				return true
			}
			declaration := node.AsVariableDeclaration()
			name := declaration.Name()
			if name == nil || declaration.Initializer == nil {
				return true
			}
			inputs := policyInputsForNode(
				declaration.Initializer,
				typeChecker,
				analysis.subjectsBySymbol,
			)
			if ast.IsCallExpression(declaration.Initializer) {
				callKey := nodeSpanKey(declaration.Initializer)
				if callPolicy, exists := analysis.callPolicies[callKey]; exists {
					inputs = []PolicySubject{callPolicy}
				}
			}
			if len(inputs) == 0 {
				return true
			}
			combined, conflict := combineSubjectPolicies(inputs)
			for _, binding := range policyBindingNames(name) {
				targetSymbol := typeChecker.GetSymbolAtLocation(binding)
				if targetSymbol == nil {
					continue
				}
				targetID := ast.GetSymbolId(targetSymbol)
				target, exists := analysis.subjectsBySymbol[targetID]
				if !exists {
					target = policySubject(
						binding,
						"declaration",
						binding.Text(),
						combined,
						"inference",
					)
					addSubject(target)
					analysis.subjectsBySymbol[targetID] = target
					selector := secretSelectorForDeclaration(node, typeChecker)
					if selector == "" {
						selector = commonSecretSelector(
							inputs,
							analysis.selectorsByID,
						)
					}
					if selector != "" {
						analysis.selectorsByID[target.ID] = selector
					}
					changed = true
				}
				authorized, reason := policyTransferAuthorized(
					combined,
					target.Policy,
					conflict,
				)
				if target.Source == "annotation" &&
					target.Policy.Residency == "shared" {
					if combined.Secret {
						authorized = false
						reason = "@exact shared declaration " + target.Name +
							" cannot release secret-qualified data"
					} else if !conflict {
						// An explicit shared declaration is a deliberate projection
						// boundary. It may release non-secret fields from a kept
						// aggregate, but secrecy itself is never downgraded.
						authorized = true
						reason = ""
					}
				}
				addPolicyPropagationFlow(
					sourceFile,
					binding,
					inputs,
					target,
					combined,
					authorized,
					reason,
					flowKeys,
					analysis,
				)
			}
			return true
		})
	}
	sort.Slice(analysis.graph.Flows, func(left int, right int) bool {
		return analysis.graph.Flows[left].ID < analysis.graph.Flows[right].ID
	})
}

func policyBindingNames(name *ast.Node) []*ast.Node {
	if name == nil {
		return nil
	}
	if ast.IsIdentifier(name) {
		return []*ast.Node{name}
	}
	result := []*ast.Node{}
	walkNode(name, func(node *ast.Node) bool {
		if node != name && ast.IsBindingElement(node) {
			result = append(result, policyBindingNames(node.Name())...)
			return false
		}
		return true
	})
	return result
}

func callablePolicyNameNode(node *ast.Node) *ast.Node {
	if name := node.Name(); name != nil {
		return name
	}
	if node.Parent != nil && ast.IsVariableDeclaration(node.Parent) {
		return node.Parent.Name()
	}
	return nil
}

func callableReturnPolicyInputs(
	callable *ast.Node,
	typeChecker *checker.Checker,
	subjects map[ast.SymbolId]PolicySubject,
) []PolicySubject {
	result := []PolicySubject{}
	seen := make(map[string]struct{})
	body := callable.Body()
	if body == nil {
		return result
	}
	if ast.IsArrowFunction(callable) && !ast.IsBlock(body) {
		return policyInputsForNode(body, typeChecker, subjects)
	}
	walkNode(body, func(node *ast.Node) bool {
		if node != body && isCallableNode(node) {
			return false
		}
		if !ast.IsReturnStatement(node) {
			return true
		}
		expression := node.AsReturnStatement().Expression
		if expression == nil {
			return false
		}
		for _, input := range policyInputsForNode(expression, typeChecker, subjects) {
			if _, duplicate := seen[input.ID]; duplicate {
				continue
			}
			seen[input.ID] = struct{}{}
			result = append(result, input)
		}
		return false
	})
	sort.Slice(result, func(left int, right int) bool {
		return result[left].ID < result[right].ID
	})
	return result
}

func addPolicyPropagationFlow(
	sourceFile *ast.SourceFile,
	node *ast.Node,
	inputs []PolicySubject,
	target PolicySubject,
	policy DataPolicy,
	authorized bool,
	reason string,
	flowKeys map[string]struct{},
	analysis *policyAnalysis,
) {
	from := make([]string, 0, len(inputs))
	for _, input := range inputs {
		from = append(from, input.ID)
	}
	sort.Strings(from)
	key := strings.Join(from, ",") + "->" + target.ID
	if _, duplicate := flowKeys[key]; duplicate {
		return
	}
	flowKeys[key] = struct{}{}
	flow := PolicyFlow{
		ID: policyLocationID(
			sourceFile,
			"policy:flow",
			node.Pos(),
			target.ID,
		),
		Kind:       "propagation",
		From:       from,
		To:         target.ID,
		Policy:     policy,
		Authorized: authorized,
		Reason:     reason,
	}
	analysis.graph.Flows = append(analysis.graph.Flows, flow)
	if !authorized {
		analysis.diagnostics = append(analysis.diagnostics, Diagnostic{
			Severity: "error",
			Code:     "EXACT3001",
			Message:  "error: " + reason,
			Start:    node.Pos(),
			Length:   node.End() - node.Pos(),
		})
	}
}

func policyInputsForNode(
	node *ast.Node,
	typeChecker *checker.Checker,
	subjects map[ast.SymbolId]PolicySubject,
) []PolicySubject {
	result := []PolicySubject{}
	seen := make(map[string]struct{})
	walkNode(node, func(candidate *ast.Node) bool {
		if ast.IsCallExpression(candidate) {
			call := candidate.AsCallExpression()
			if isImportedSecretConsume(call.Expression, typeChecker) {
				return false
			}
			if !ast.IsPropertyAccessExpression(call.Expression) {
				symbol := resolvedCallableSymbol(
					callTargetSymbol(call.Expression, typeChecker),
					typeChecker,
				)
				if symbol != nil {
					if subject, exists := subjects[ast.GetSymbolId(symbol)]; exists &&
						subject.Kind == "return" {
						if _, duplicate := seen[subject.ID]; !duplicate {
							seen[subject.ID] = struct{}{}
							result = append(result, subject)
						}
						return false
					}
				}
			}
		}
		shorthand := candidate.Parent != nil &&
			ast.IsShorthandPropertyAssignment(candidate.Parent)
		if !ast.IsIdentifier(candidate) ||
			(ast.IsDeclarationName(candidate) && !shorthand) ||
			(isStaticPropertyName(candidate) && !shorthand) {
			return true
		}
		symbol := typeChecker.GetSymbolAtLocation(candidate)
		if shorthand {
			symbol = typeChecker.GetShorthandAssignmentValueSymbol(candidate.Parent)
		}
		symbol = resolvedCallableSymbol(symbol, typeChecker)
		if symbol == nil {
			return true
		}
		subject, exists := subjects[ast.GetSymbolId(symbol)]
		if !exists {
			return true
		}
		if _, duplicate := seen[subject.ID]; duplicate {
			return true
		}
		seen[subject.ID] = struct{}{}
		result = append(result, subject)
		return true
	})
	sort.Slice(result, func(left int, right int) bool {
		return result[left].ID < result[right].ID
	})
	return result
}

func combineSubjectPolicies(subjects []PolicySubject) (DataPolicy, bool) {
	secret := false
	residency := "shared"
	conflict := false
	for _, subject := range subjects {
		policy := subject.Policy
		secret = secret || policy.Secret
		if policy.Residency == "shared" {
			continue
		}
		if residency != "shared" && residency != policy.Residency {
			conflict = true
		}
		residency = policy.Residency
	}
	if secret {
		residency = "server"
	}
	return DataPolicy{Residency: residency, Secret: secret}, conflict
}

func policyTransferAuthorized(
	source DataPolicy,
	target DataPolicy,
	conflict bool,
) (bool, string) {
	if conflict {
		return false, "value combines incompatible server-kept and client-kept inputs"
	}
	if source.Secret && !target.Secret {
		return false, "secret-qualified data cannot flow into an unqualified declaration"
	}
	if source.Residency != "shared" &&
		target.Residency != "shared" &&
		source.Residency != target.Residency {
		return false, source.Residency + "-kept data cannot flow into a " +
			target.Residency + "-kept declaration"
	}
	if source.Residency == "server" && target.Residency == "shared" {
		return false, "server-kept data cannot be released through a shared declaration"
	}
	if source.Residency == "client" && target.Residency == "shared" {
		return false, "client-kept data cannot be released through a shared declaration"
	}
	return true, ""
}

func applyTaskPolicies(tasks []Task, policies policyAnalysis) []Task {
	for index := range tasks {
		task := &tasks[index]
		requirements := []PolicySubject{}
		for _, effect := range append(
			append([]StateEffect(nil), task.Reads...),
			task.Writes...,
		) {
			for _, policy := range policies.statePolicies {
				if policy.component == task.Component &&
					policyPathsOverlap(policy.path, effect.Path) {
					requirements = append(requirements, policy.subject)
				}
			}
		}
		for _, effect := range task.Contexts {
			if policy, exists := policies.contextPolicies[effect.Token]; exists {
				requirements = append(requirements, policy)
			}
		}
		for _, input := range task.CapturedInputs {
			switch input.Source {
			case "state":
				path := strings.TrimPrefix(input.Path, "this.state.")
				for _, policy := range policies.statePolicies {
					if policy.component == task.Component &&
						policyPathsOverlap(policy.path, path) {
						requirements = append(requirements, policy.subject)
					}
				}
			case "context":
				if policy, exists := policies.contextPolicies[input.ContextToken]; exists {
					requirements = append(requirements, policy)
				}
			}
		}
		server, client := false, false
		for _, requirement := range requirements {
			server = server || requirement.Policy.Secret ||
				requirement.Policy.Residency == "server"
			client = client || requirement.Policy.Residency == "client"
		}
		switch {
		case server && client:
			task.Diagnostics = append(
				task.Diagnostics,
				"error: task combines server-kept and client-kept values in one indivisible computation",
			)
		case server:
			if task.RequestedPlacement == "client" ||
				(task.Placement == "client" && task.BrowserEffects) {
				task.Diagnostics = append(
					task.Diagnostics,
					"error: client task reads or writes server-kept data",
				)
			} else {
				task.Placement = "server"
				task.EnvironmentEffect = "server"
				task.ServerEffects = true
				task.EffectSources = append(
					task.EffectSources,
					environmentSource("server", "data policy", task.Component),
				)
			}
		case client:
			if task.RequestedPlacement == "server" ||
				(task.Placement == "server" && task.ServerEffects) {
				task.Diagnostics = append(
					task.Diagnostics,
					"error: server task reads or writes client-kept data",
				)
			} else {
				task.Placement = "client"
				task.EnvironmentEffect = "browser"
				task.BrowserEffects = true
				task.EffectSources = append(
					task.EffectSources,
					environmentSource("browser", "data policy", task.Component),
				)
			}
		}
		if task.RequestedPlacement == "server" && len(task.CapturedInputs) != 0 {
			for _, requirement := range requirements {
				if requirement.Policy.Secret ||
					requirement.Policy.Residency != "shared" {
					task.Diagnostics = append(
						task.Diagnostics,
						"error: a server task captured parameter must not transport client-kept, server-kept, or secret data",
					)
					break
				}
			}
		}
	}
	return tasks
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
