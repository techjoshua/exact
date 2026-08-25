package exactcompiler

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

func contextEffect(
	call *ast.CallExpression,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) (ContextEffect, bool) {
	if !ast.IsPropertyAccessExpression(call.Expression) {
		return ContextEffect{}, false
	}
	member := call.Expression.AsPropertyAccessExpression()
	if member.Expression == nil || !componentContextReceiver(member.Expression, typeChecker) ||
		member.Name() == nil ||
		(member.Name().Text() != "getContext" && member.Name().Text() != "hasContext" &&
			member.Name().Text() != "setContext") {
		return ContextEffect{}, false
	}
	token := "unknown"
	confidence := "unknown"
	if call.Arguments != nil && len(call.Arguments.Nodes) != 0 {
		candidate := strings.TrimSpace(sourceText(sourceFile, call.Arguments.Nodes[0]))
		if exactContextToken.MatchString(candidate) {
			token = candidate
			confidence = "exact"
		}
	}
	kind := "read"
	switch member.Name().Text() {
	case "hasContext":
		kind = "probe"
	case "setContext":
		kind = "write"
	}
	return ContextEffect{Token: token, Kind: kind, Confidence: confidence}, true
}

func componentContextReceiver(
	expression *ast.Node,
	typeChecker *checker.Checker,
) (result bool) {
	if expression.Kind == ast.KindThisKeyword {
		return true
	}
	if typeChecker == nil {
		return false
	}
	defer func() {
		if recover() != nil {
			result = false
		}
	}()
	receiverType := typeChecker.GetTypeAtLocation(expression)
	if receiverType == nil {
		return false
	}
	if typeChecker.GetPropertyOfType(receiverType, "state") != nil {
		return true
	}
	display := strings.TrimSpace(typeChecker.TypeToString(receiverType))
	return display == "Component" || strings.HasPrefix(display, "Component<")
}

func collectContextBindings(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) map[string]ContextEffect {
	result := make(map[string]ContextEffect)
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsVariableDeclaration(node) {
			return true
		}
		declaration := node.AsVariableDeclaration()
		if declaration.Name() == nil ||
			!ast.IsIdentifier(declaration.Name()) ||
			declaration.Initializer == nil ||
			!ast.IsCallExpression(declaration.Initializer) {
			return true
		}
		if effect, ok := contextEffect(
			declaration.Initializer.AsCallExpression(),
			sourceFile,
			typeChecker,
		); ok && effect.Kind == "read" {
			result[declaration.Name().Text()] = effect
		}
		return true
	})
	return result
}

func contextBindingCallEffect(
	expression *ast.Node,
	bindings map[string]ContextEffect,
) (ContextEffect, bool) {
	text := ""
	if ast.IsPropertyAccessExpression(expression) {
		receiver := expression.AsPropertyAccessExpression().Expression
		for ast.IsPropertyAccessExpression(receiver) {
			receiver = receiver.AsPropertyAccessExpression().Expression
		}
		if ast.IsIdentifier(receiver) {
			text = receiver.Text()
		}
	} else if ast.IsIdentifier(expression) {
		text = expression.Text()
	}
	effect, exists := bindings[text]
	return effect, exists
}

func callTargetSymbol(
	expression *ast.Node,
	typeChecker *checker.Checker,
) *ast.Symbol {
	if ast.IsPropertyAccessExpression(expression) {
		member := expression.AsPropertyAccessExpression()
		if member.Name() != nil &&
			(member.Name().Text() == "call" || member.Name().Text() == "apply") {
			return callTargetSymbol(member.Expression, typeChecker)
		}
		// Resolving an arbitrary property-call name forces contextual checking of
		// its receiver. TS-Go can currently panic there for otherwise valid
		// generic callbacks. Opaque instance methods remain conservative edges.
		return nil
	}
	if ast.IsIdentifier(expression) {
		return typeChecker.GetResolvedSymbol(expression)
	}
	return typeChecker.GetSymbolAtLocation(expression)
}

func resolvedCallableSymbol(
	symbol *ast.Symbol,
	typeChecker *checker.Checker,
) *ast.Symbol {
	if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0 {
		return typeChecker.GetAliasedSymbol(symbol)
	}
	return symbol
}

func unresolvedCallEnvironment(
	expression *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	contextBindings map[string]ContextEffect,
) string {
	text := strings.TrimSpace(sourceText(sourceFile, expression))
	if exactComponentOperation(text) ||
		componentContextOperation(expression, typeChecker) {
		return ""
	}
	root := text
	if separator := strings.IndexAny(root, ".("); separator >= 0 {
		root = root[:separator]
	}
	if _, universal := universalCallRoots[root]; universal {
		return ""
	}
	if _, contextBinding := contextBindings[root]; contextBinding {
		return ""
	}
	if environment := receiverTypeEnvironment(expression, typeChecker); environment == "neutral" {
		return ""
	} else if environment != "" {
		return environment
	}
	symbol := callTargetSymbol(expression, typeChecker)
	if serverOnlyImportSymbol(symbol) {
		return "server"
	}
	if environment, classified := declarationCallEnvironment(
		resolvedCallableSymbol(symbol, typeChecker),
		expression,
	); classified {
		return environment
	}
	if _, server := serverGlobals[root]; server &&
		symbolIsOutsideSource(symbol, sourceFile) {
		return "server"
	}
	if _, browser := browserGlobals[root]; browser &&
		symbolIsOutsideSource(symbol, sourceFile) {
		return "browser"
	}
	return "unknown"
}

func componentContextOperation(
	expression *ast.Node,
	typeChecker *checker.Checker,
) bool {
	if !ast.IsPropertyAccessExpression(expression) {
		return false
	}
	member := expression.AsPropertyAccessExpression()
	if member.Name() == nil {
		return false
	}
	switch member.Name().Text() {
	case "getContext", "hasContext", "setContext":
		return componentContextReceiver(member.Expression, typeChecker)
	default:
		return false
	}
}

func declarationCallEnvironment(
	symbol *ast.Symbol,
	expression *ast.Node,
) (string, bool) {
	if symbol == nil {
		return "", false
	}
	name := ""
	switch {
	case ast.IsIdentifier(expression):
		name = expression.Text()
	case ast.IsPropertyAccessExpression(expression):
		member := expression.AsPropertyAccessExpression().Name()
		if member != nil {
			name = member.Text()
		}
	}
	for _, declaration := range symbol.Declarations {
		sourceFile := ast.GetSourceFileOfNode(declaration)
		if sourceFile == nil {
			continue
		}
		filename := strings.ToLower(
			strings.ReplaceAll(sourceFile.FileName(), `\`, "/"),
		)
		switch {
		case strings.Contains(filename, "/@types/node/"):
			return "server", true
		case strings.Contains(filename, "/packages/hydrate/") ||
			strings.Contains(filename, "/@exactjs/hydrate/"):
			return "browser", true
		case strings.Contains(filename, "/packages/dom/") ||
			strings.Contains(filename, "/@exactjs/dom/"):
			switch name {
			case "render", "unmount", "dispose", "adoptStatic",
				"adoptComponentRoot", "adoptMarkerlessComponentRoot",
				"findComponentDomNode", "disposeOwnedSubtree":
				return "browser", true
			default:
				return "", true
			}
		case strings.Contains(filename, "/packages/core/") ||
			strings.Contains(filename, "/@exactjs/core/") ||
			strings.Contains(filename, "/packages/reactive/") ||
			strings.Contains(filename, "/@exactjs/reactive/") ||
			strings.Contains(filename, "/packages/request/") ||
			strings.Contains(filename, "/@exactjs/request/"):
			return "", true
		}
	}
	return "", false
}

func opaqueCallExpression(expression *ast.Node, typeChecker *checker.Checker) bool {
	root := expression
	for ast.IsPropertyAccessExpression(root) {
		root = root.AsPropertyAccessExpression().Expression
	}
	if !ast.IsIdentifier(root) {
		return false
	}
	symbol := typeChecker.GetSymbolAtLocation(root)
	if symbol == nil {
		return false
	}
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		return true
	}
	for _, declaration := range symbol.Declarations {
		if ast.IsParameterDeclaration(declaration) {
			return true
		}
	}
	return false
}

func exactComponentOperation(text string) bool {
	if strings.HasPrefix(text, "TaskContext.") {
		return true
	}
	if !strings.HasPrefix(text, "this.") {
		return false
	}
	member := strings.TrimPrefix(text, "this.")
	switch member {
	case "hasContext", "map", "getContext", "setContext", "prop", "ref", "reactive",
		"onMount", "onActivate", "onDeactivate", "onUnmount", "onRender":
		return true
	}
	return strings.HasPrefix(member, "log.") ||
		strings.HasPrefix(member, "refs.")
}

func receiverTypeEnvironment(
	expression *ast.Node,
	typeChecker *checker.Checker,
) (environment string) {
	if !ast.IsPropertyAccessExpression(expression) {
		return ""
	}
	defer func() {
		if recover() != nil {
			environment = ""
		}
	}()
	value := typeChecker.GetTypeAtLocation(
		expression.AsPropertyAccessExpression().Expression,
	)
	if value == nil {
		return ""
	}
	display := typeChecker.TypeToString(value)
	if neutralReceiverType.MatchString(display) {
		return "neutral"
	}
	if browserReceiverType.MatchString(display) {
		return "browser"
	}
	return ""
}

func resolveCallableEffects(facts []callableFacts) {
	changed := true
	for changed {
		changed = false
		for index := range facts {
			fact := &facts[index]
			sources := append(
				[]EnvironmentEffectSource(nil),
				fact.summary.DirectEffectSources...,
			)
			reads := append([]StateEffect(nil), fact.directReads...)
			writes := append([]StateEffect(nil), fact.directWrites...)
			contexts := append([]ContextEffect(nil), fact.directContext...)
			for _, targetIndex := range fact.targets {
				target := facts[targetIndex].summary
				for _, source := range target.EffectSources {
					path := source.Path
					if len(path) == 0 || path[0] != fact.summary.Name {
						path = append([]string{fact.summary.Name}, path...)
					}
					sources = append(sources, EnvironmentEffectSource{
						Environment: source.Environment,
						Description: source.Description,
						Path:        path,
						Opaque:      source.Opaque,
					})
				}
				reads = append(
					reads,
					mapStateEffects(
						target.StateReads,
						fact.summary.Calls,
						target.ID,
					)...,
				)
				writes = append(
					writes,
					mapStateEffects(
						target.StateWrites,
						fact.summary.Calls,
						target.ID,
					)...,
				)
				contexts = append(contexts, target.Contexts...)
			}
			for _, target := range fact.externalTargets {
				for _, source := range target.EffectSources {
					path := source.Path
					if len(path) == 0 || path[0] != fact.summary.Name {
						path = append([]string{fact.summary.Name}, path...)
					}
					sources = append(sources, EnvironmentEffectSource{
						Environment: source.Environment,
						Description: source.Description,
						Path:        path,
						Opaque:      source.Opaque,
					})
				}
				reads = append(
					reads,
					mapStateEffects(
						target.StateReads,
						fact.summary.Calls,
						target.ID,
					)...,
				)
				writes = append(
					writes,
					mapStateEffects(
						target.StateWrites,
						fact.summary.Calls,
						target.ID,
					)...,
				)
				contexts = append(contexts, target.Contexts...)
			}
			sources = uniqueEnvironmentSources(sources)
			if fact.summary.ReevaluationSafe {
				// A checked pure annotation resolves otherwise opaque calls but cannot erase a
				// concrete browser or server dependency discovered by semantic analysis.
				known := sources[:0]
				for _, source := range sources {
					if source.Environment != "unknown" {
						known = append(known, source)
					}
				}
				sources = known
			}
			reads = minimalStateEffects(reads)
			writes = uniqueStateEffects(writes)
			contexts = uniqueContextEffects(contexts)
			if environmentSourcesSignature(sources) !=
				environmentSourcesSignature(fact.summary.EffectSources) {
				fact.summary.EffectSources = sources
				changed = true
			}
			if stateEffectsSignature(reads) != stateEffectsSignature(fact.summary.StateReads) {
				fact.summary.StateReads = reads
				changed = true
			}
			if stateEffectsSignature(writes) != stateEffectsSignature(fact.summary.StateWrites) {
				fact.summary.StateWrites = writes
				changed = true
			}
			if contextEffectsSignature(contexts) != contextEffectsSignature(fact.summary.Contexts) {
				fact.summary.Contexts = contexts
				changed = true
			}
		}
	}
}

func mapStateEffects(
	effects []StateEffect,
	edges []CallEdge,
	targetID string,
) []StateEffect {
	var bindings []ReceiverBinding
	for _, edge := range edges {
		if edge.Resolved && edge.TargetID == targetID {
			bindings = edge.ReceiverBindings
			break
		}
	}
	result := make([]StateEffect, len(effects))
	for index, effect := range effects {
		result[index] = effect
		if effect.Receiver == nil || effect.Receiver.Kind != "parameter" {
			continue
		}
		var binding *ReceiverBinding
		for bindingIndex := range bindings {
			if bindings[bindingIndex].ParameterIndex == effect.Receiver.Index {
				binding = &bindings[bindingIndex]
				break
			}
		}
		switch {
		case binding != nil && binding.Source == "component":
			result[index].Receiver = &StateReceiver{Kind: "component"}
		case binding != nil && binding.Source == "parameter":
			result[index].Receiver = &StateReceiver{
				Kind:  "parameter",
				Index: binding.SourceParameterIndex,
			}
		default:
			result[index].Receiver = &StateReceiver{Kind: "unknown"}
			result[index].Confidence = "unknown"
			if result[index].Path == "" {
				result[index].Path = "*"
			}
		}
	}
	return result
}

func applyCallableArtifactConstraints(facts []callableFacts) {
	constraints := make([]uint8, len(facts))
	for index := range facts {
		for _, source := range facts[index].summary.EffectSources {
			if source.Environment == "browser" {
				constraints[index] |= 1
			}
			if source.Environment == "server" {
				constraints[index] |= 2
			}
		}
	}
	changed := true
	for changed {
		changed = false
		for callerIndex := range facts {
			for _, targetIndex := range facts[callerIndex].targets {
				next := constraints[targetIndex] | constraints[callerIndex]
				if next != constraints[targetIndex] {
					constraints[targetIndex] = next
					changed = true
				}
			}
		}
	}
	for index := range facts {
		facts[index].artifactConstraint = constraints[index]
	}
}

func environmentSource(
	environment string,
	description string,
	callable string,
) EnvironmentEffectSource {
	return EnvironmentEffectSource{
		Environment: environment,
		Description: description,
		Path:        []string{callable, description},
	}
}

func uniqueEnvironmentSources(
	values []EnvironmentEffectSource,
) []EnvironmentEffectSource {
	result := make([]EnvironmentEffectSource, 0, len(values))
	shortest := make(map[string]EnvironmentEffectSource, len(values))
	for _, value := range values {
		key := value.Environment + ":" + value.Description
		current, exists := shortest[key]
		if !exists || len(value.Path) < len(current.Path) ||
			(len(value.Path) == len(current.Path) &&
				strings.Join(value.Path, ".") < strings.Join(current.Path, ".")) {
			value.Path = nonNilSlice(value.Path)
			shortest[key] = value
		}
	}
	for _, value := range shortest {
		result = append(result, value)
	}
	sort.Slice(result, func(left int, right int) bool {
		leftKey := result[left].Environment + ":" + result[left].Description + ":" +
			strings.Join(result[left].Path, ".")
		rightKey := result[right].Environment + ":" + result[right].Description + ":" +
			strings.Join(result[right].Path, ".")
		return leftKey < rightKey
	})
	return result
}

func uniqueContextEffects(values []ContextEffect) []ContextEffect {
	unique := make([]ContextEffect, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		key := value.Kind + ":" + value.Token
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		unique = append(unique, value)
	}
	result := make([]ContextEffect, 0, len(unique))
	for _, value := range unique {
		if value.Kind == "read" {
			result = append(result, value)
		}
	}
	for _, value := range unique {
		if value.Kind != "read" {
			result = append(result, value)
		}
	}
	return result
}

func environmentEffectFor(sources []EnvironmentEffectSource) string {
	browser, server, unknown := false, false, false
	for _, source := range sources {
		browser = browser || source.Environment == "browser"
		server = server || source.Environment == "server"
		unknown = unknown || source.Environment == "unknown"
	}
	if browser && server {
		return "mixed"
	}
	if unknown {
		return "unknown"
	}
	if browser {
		return "browser"
	}
	if server {
		return "server"
	}
	return "neutral"
}

func artifactTargetsFor(
	effect string,
	sources []EnvironmentEffectSource,
	constraint uint8,
) []string {
	switch effect {
	case "browser":
		return []string{"client"}
	case "server":
		return []string{"server"}
	case "neutral":
		return []string{"client", "server"}
	default:
		if constraint == 1 {
			return []string{"client"}
		}
		if constraint == 2 {
			return []string{"server"}
		}
		browser, server := false, false
		for _, source := range sources {
			browser = browser || source.Environment == "browser"
			server = server || source.Environment == "server"
		}
		if browser && !server {
			return []string{"client"}
		}
		if server && !browser {
			return []string{"server"}
		}
		return []string{}
	}
}

func moduleInitializerDiagnostics(
	callables callableAnalysis,
	target Target,
	sourceFile *ast.SourceFile,
	policy PolicyAnalysis,
) []Diagnostic {
	diagnostics := []Diagnostic{}
	if target == TargetDefault {
		return diagnostics
	}
	for _, fact := range callables.facts {
		if fact.sourceFile != sourceFile {
			continue
		}
		callable := fact.summary
		if callable.Kind != "module-initializer" {
			continue
		}
		message := ""
		switch callable.Effect {
		case "mixed":
			message = "executable module initializer has indivisible browser and server effects"
		case "unknown":
			if containsOpaqueEnvironment(callable.EffectSources) &&
				!artifactTargetsInclude(callable.ArtifactTargets, target) &&
				!(target == TargetServer &&
					policyConstrainsModuleInitializer(
						fact.node,
						sourceFile,
						policy,
					)) {
				message = "executable module initializer depends on an opaque call or side-effect import"
			}
		}
		if message != "" {
			diagnostics = append(diagnostics, Diagnostic{
				Severity: "error",
				Code:     "EXACT2101",
				Message:  "error: " + message,
			})
		}
	}
	return diagnostics
}

func policyConstrainsModuleInitializer(
	node *ast.Node,
	sourceFile *ast.SourceFile,
	policy PolicyAnalysis,
) bool {
	startLine, _ := sourceLocation(sourceFile, node.Pos())
	endLine, _ := sourceLocation(sourceFile, node.End())
	for _, consumer := range policy.SecretConsumers {
		if consumer.Target == "server" &&
			consumer.Line >= startLine &&
			consumer.Line <= endLine {
			return true
		}
	}
	return false
}

func environmentSourcesSignature(values []EnvironmentEffectSource) string {
	var result strings.Builder
	for _, value := range values {
		result.WriteString(value.Environment)
		result.WriteByte(':')
		result.WriteString(value.Description)
		result.WriteByte(':')
		result.WriteString(strings.Join(value.Path, "."))
		if value.Opaque {
			result.WriteString(":opaque")
		}
		result.WriteByte('\n')
	}
	return result.String()
}

func stateEffectsSignature(values []StateEffect) string {
	var result strings.Builder
	for _, value := range values {
		result.WriteString(value.Kind)
		result.WriteByte(':')
		result.WriteString(value.Path)
		result.WriteByte(':')
		result.WriteString(value.Confidence)
		result.WriteByte(':')
		result.WriteString(stateReceiverSignature(value.Receiver))
		result.WriteByte('\n')
	}
	return result.String()
}

func stateReceiverSignature(receiver *StateReceiver) string {
	if receiver == nil {
		return "component"
	}
	if receiver.Kind == "parameter" {
		return fmt.Sprintf("parameter:%d", receiver.Index)
	}
	return receiver.Kind
}

func contextEffectsSignature(values []ContextEffect) string {
	var result strings.Builder
	for _, value := range values {
		result.WriteString(value.Kind)
		result.WriteByte(':')
		result.WriteString(value.Token)
		result.WriteByte(':')
		result.WriteString(value.Confidence)
		result.WriteByte('\n')
	}
	return result.String()
}
