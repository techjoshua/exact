package exactcompiler

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

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
