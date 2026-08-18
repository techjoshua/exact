package exactcompiler

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

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
