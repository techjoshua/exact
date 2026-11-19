package exactcompiler

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// callableAnalysisFingerprint compares semantic content in clone and mutation tests.
func callableAnalysisFingerprint(analysis callableAnalysis) string {
	var result strings.Builder
	for _, pending := range analysis.pending {
		result.WriteString(fmt.Sprintf("|staged-pending:%p:%p:%p:%d:%p:%p:%p:%p:%p", pending.consumer, pending.producer, pending.operation, pending.reason, pending.cut.use, pending.cut.reading, pending.cut.initializing, pending.cut.returning, pending.cut.invoking))
	}
	for _, fact := range analysis.facts {
		if fact.initializerDraft != nil {
			result.WriteString(fact.initializerDraft.signature)
		}
		originalMutationBodyFingerprint(fact.staged.mutationBody, &result)
		result.WriteString(fact.summary.ID)
		result.WriteByte('|')
		result.WriteString(fact.summary.Name)
		result.WriteByte('|')
		result.WriteString(fact.summary.Kind)
		result.WriteString(fmt.Sprintf("|descriptor-mode:%x", fact.descriptorMode))
		for _, c := range fact.mapInputs {
			result.WriteString(fmt.Sprintf("|map-input:%s:%x:%d:%s:%t:%d:%d", c.mode, c.sourceDigest, c.domain, c.reason, c.futureReadonly, len(c.items), len(c.roles)))
		}
		for _, owned := range fact.ownedObligations {
			result.WriteString(sourceOwnedObligationKey(owned))
		}
		if fact.progressReceiver {
			result.WriteString("|progress")
		}
		result.WriteByte('|')
		result.WriteString(strings.Join(fact.summary.ExportNames, ","))
		result.WriteByte('\n')
		for _, input := range fact.componentCallableInputs {
			result.WriteString(fmt.Sprintf("|component-call-input:%p:%p:%p:%s", input.declaration, input.slot, input.operation, input.key))
		}
		// Sealed source atoms include independent requirements/dispositions, not
		// merely equal environment donors. Graph IDs/cursors remain excluded.
		for _, occurrence := range fact.staged.constructedOccurrences {
			result.WriteString(fmt.Sprintf("|constructed-occurrence:%#v", occurrence))
		}
		for _, call := range fact.staged.calls {
			if call.sourceInputs != nil {
				result.WriteString(fmt.Sprintf("|source-call-inputs:%#v:%#v", descriptorFingerprintInvocation(call.sourceInputs.invocation, &result), descriptorFingerprintBoundInputs(call.sourceInputs.bindings, &result)))
			}
		}
		for _, recipe := range fact.staged.operationRecipes {
			for _, alternative := range recipe.delta.exposures {
				if value := alternative.endpoint.constructionCallable; value != nil {
					result.WriteString(constructionCallableFingerprint(value))
				}
				if value := alternative.endpoint.moduleConstruction; value != nil {
					result.WriteString(fmt.Sprintf("|module-construction-data:%t", value.pending))
					for _, field := range value.fields {
						result.WriteString(fmt.Sprintf("|construction-field-data:%d:%t:%#v", field.ordinal, field.pending, field.alternatives))
					}
				}
			}
			descriptorTargetFingerprint(recipe.descriptorTarget, &result)
			if recipe.descriptorSource != nil {
				result.WriteString(fmt.Sprintf("|descriptor-source:%#v", *recipe.descriptorSource))
			}
			if recipe.nativeGet != nil && recipe.nativeGet.descriptorRead != nil {
				result.WriteString(fmt.Sprintf("|descriptor-retrieval:%#v", *recipe.nativeGet.descriptorRead))
			}
			if recipe.nativeGet != nil && len(recipe.nativeGet.observerInputs) != 0 {
				result.WriteString(fmt.Sprintf("|native-observer-inputs:%#v", recipe.nativeGet.observerInputs))
			}
			if source := recipe.declarationCall; source != nil {
				result.WriteString(fmt.Sprintf("|declaration-call:%#v:%p:%p:%p", descriptorFingerprintInvocation(source.invocation, &result), source.inputs, source.sourceInputs, recipe.declarationCallGeneration))
				for _, read := range source.ambientReads {
					if read.reference == nil {
						result.WriteString("|ambient-argument-read:invalid")
						continue
					}
					result.WriteString(fmt.Sprintf("|ambient-argument-read:%p:%p:%p:%d:%#v:%p:%p:%p:%p:%p:%p", read.call, read.argument, read.owner, read.ordinal, read.cut, read.reference.declaration, read.reference.symbol, read.reference.source, read.reference.program, read.reference.checker, read.reference.config))
				}

			}
			if source := recipe.constructionEffects; source != nil {
				result.WriteString(fmt.Sprintf("|construction-effects:%#v", *source))
			}
			if source := recipe.assignment; source != nil {
				result.WriteString(fmt.Sprintf("|assignment:%#v", *source))
			}
			if source := recipe.hasInstance; source != nil {
				result.WriteString(fmt.Sprintf("|has-instance:%#v", *source))
			}
			if source := recipe.nativeGet; source != nil && source.effectsSource != nil {
				description := *source.effectsSource
				description.arrayIssuer = nil // Graph receipt is not cached semantic content.
				result.WriteString(fmt.Sprintf("|native-effects-source:%#v", &description))
			}
			if source := recipe.nativeGet; source != nil && source.arrayPush != nil {
				result.WriteString(fmt.Sprintf("|native-array-push:%#v", *source.arrayPush))
			}
			fieldMutationDataFingerprint(recipe.mutationData, &result)
			installedMutationRHSFingerprint(recipe.installedMutationRHS, &result)
			for _, residual := range recipe.delta.residuals {
				relativeFieldMutationFingerprint(residual.mutation, &result)
			}
			if source := recipe.memberSource; source != nil {
				originalGetMutationInterestFingerprint(source.originalGetMutationInterest, &result)
				originalGetMutationSourceFingerprint(source.originalGetMutation, &result)
				if source.globalWrite != nil {
					result.WriteString(fmt.Sprintf("|global-write:%#v", source.globalWrite))
				}
				if source.targetSource != nil {
					description := *source.targetSource
					description.preparation = nil // Fingerprint detached content, not the wrapper address.
					result.WriteString(fmt.Sprintf("|reflective-target-source:%#v", &description))
					if p := source.targetSource.preparation; p != nil {
						result.WriteString(fmt.Sprintf("|reflective-target-preparation:%#v", *p))
					}
				}
				if source.nativeWriter != nil {
					result.WriteString(fmt.Sprintf("|native-writer-capability:%#v", source.nativeWriter))
				}
				if source.hasFreshTarget != nil {
					result.WriteString(fmt.Sprintf("|has-fresh-target:%#v", source.hasFreshTarget))
				}
				if source.protocolSource != nil {
					result.WriteString(fmt.Sprintf("|member-protocol-source:%#v:%p:%#v:%t:%t", source.protocolSource.required, source.protocolSource.external, source.protocolSource.get, source.protocolSource.setEffects, source.protocolSource.selfRead))
					result.WriteString(fmt.Sprintf("|evaluation:%#v", source.protocolSource.evaluation))
					result.WriteString(fmt.Sprintf("|native-argument:%#v", source.protocolSource.nativeArgument))
				}
				if source.call != nil {
					result.WriteString(fmt.Sprintf("|member-call:%#v:%#v:%t:%#v:%#v:%#v", descriptorFingerprintAlternatives(source.call.values, &result), source.call.mapped, source.call.complete, source.call.standard, source.call.storage, source.call.sourceRequest))
				}
				if source.getPreparation != nil {
					result.WriteString(fmt.Sprintf("|get-preparation:%t:%#v:%#v:%#v", source.getPreparation.plain, source.getPreparation.native, source.getPreparation.readings, source.getPreparation.targets))
					result.WriteString(fmt.Sprintf("|get-preparation-data:%#v", source.getPreparation.data))
				}
				reflectiveContributionFingerprint(source.reflectiveContribution, &result)
				descriptorStrongFingerprint(source.descriptorStrong, &result)
				if source.getEffects != nil {
					result.WriteString(fmt.Sprintf("|member-get-effects:%t:%#v", source.getEffects.accounted, source.getEffects.preparation))
					if d := source.getEffects.descriptor; d != nil {
						description := *d
						view := descriptorFingerprintEndpoint(sourceRelativeEndpoint{kind: relativeEndpointDescriptorView, descriptorView: &description.view}, &result)
						description.view = sourceNativeDescriptorView{}
						result.WriteString(fmt.Sprintf("|descriptor-record-get:%#v:%#v", description, view))
					}
				}
				candidate := source.candidate
				candidate.target = descriptorFingerprintEndpoint(candidate.target, &result)
				candidate.key = descriptorFingerprintEndpoint(candidate.key, &result)
				candidate.value = descriptorFingerprintEndpoint(candidate.value, &result)
				result.WriteString(fmt.Sprintf("|member-candidate:%#v:%#v:%#v:%t", source.request, candidate, descriptorFingerprintAlternatives(source.values, &result), source.writeEffects))
			}
			if source := recipe.nativeGet; source != nil && len(source.memberSources) != 0 {
				result.WriteString(fmt.Sprintf("|native-member-sources:%#v:%#v", source.memberSources, source.callAlternatives))
				result.WriteString(fmt.Sprintf("|member-get-contributions:%#v", source.getContributions))
			}
			if source := recipe.memberSource; source != nil && source.coverage != nil {
				result.WriteString(fmt.Sprintf("|member-source-set:%#v:%p:%#v:%#v:%t", source.coverage.request, source.coverage.origin, source.coverage.cut, source.coverage.required, source.coverage.extracted))
			}
			if source := recipe.moduleArgument; source != nil {
				snapshot := *source
				snapshot.order = nil
				result.WriteString(fmt.Sprintf("|module-argument:%#v", snapshot))
			}
			if source := recipe.callResult; source != nil {
				if source.nativeDescriptor != nil {
					result.WriteString(fmt.Sprintf("|descriptor-result-source:%#v", *source.nativeDescriptor))
				}
				getResult := source.getResult
				if getResult != nil && getResult.frameworkResume != nil {
					result.WriteString(fmt.Sprintf("|framework-get-resume:%#v", *getResult.frameworkResume))
					copy := *getResult
					copy.frameworkResume = nil
					getResult = &copy
				}
				result.WriteString(fmt.Sprintf("|call-result:%#v:%p:%t:%#v:%#v:%#v:%#v:%#v", source.request, source.declaration, source.nativeCall, source.constructedRoot, source.readings, source.readCuts, source.inputReadings, getResult))
				result.WriteString(fmt.Sprintf("|binding-data:%p|preparation-data:%#v", source.binding, source.preparationData))
				if construction := source.moduleConstruction; construction != nil {
					result.WriteString(fmt.Sprintf("|module-construction:%#v:%p:%p:%p:%t", construction.request, construction.binding, construction.initializer, construction.module, construction.unsupported))
					result.WriteString(fmt.Sprintf("|local-construction:%p:%#v:%#v", construction.localOwner, construction.creationEffects, construction.scalar))
					result.WriteString(constructionCallableSourceFingerprint(construction.scalarCallable))
					for _, field := range construction.fields {
						result.WriteString(fmt.Sprintf("|construction-field:%p:%p:%s:%d:%#v", field.property, field.operand, field.name, field.ordinal, field.required))
						result.WriteString(constructionCallableSourceFingerprint(field.callable))
						if field.literal != nil {
							result.WriteString(fmt.Sprintf("|construction-literal:%#v", *field.literal))
						}
					}
				}
				if source.freezeReturn != nil {
					result.WriteString(fmt.Sprintf("|freeze-return:%#v", *source.freezeReturn))
				}
				if source.operand != nil {
					result.WriteString(fmt.Sprintf("|result-operand:%#v", descriptorFingerprintEndpoint(*source.operand, &result)))
				}
			}
			if recipe.writer != nil {
				result.WriteString(fmt.Sprintf("|writer-source:%#v:%#v:%p:%#v", recipe.writer.request, recipe.writer.parent, recipe.writer.generation, recipe.writer.reads))
			}
			if recipe.writer != nil {
				result.WriteString(fmt.Sprintf("|writer-callable:%t", recipe.writer.callable))
				for _, projection := range recipe.writer.projections {
					if projection != nil {
						result.WriteString(fmt.Sprintf("|writer-projection:%#v:%#v:%t", descriptorFingerprintDelta(projection.delta, &result), projection.pending, projection.resultContext))
					} else {
						result.WriteString("|writer-projection:pending")
					}
				}
			}
			if recipe.mapEntry != nil {
				result.WriteString(fmt.Sprintf("|map-entry:%#v:%#v", recipe.mapEntry.entry, recipe.mapEntry.read))
				if recipe.mapEntry.read != nil {
					result.WriteString(fmt.Sprintf("|map-entry-bound:%#v", recipe.mapEntry.read.bound))
				}
			}
			if recipe.entryLaw != nil {
				result.WriteString(fmt.Sprintf("|entry-law:%#v", *recipe.entryLaw))
			}
			if recipe.mapProtocol != nil {
				result.WriteString(fmt.Sprintf("|map-protocol:%#v", *recipe.mapProtocol))
			}
			result.WriteString(fmt.Sprintf("|writer-required:%#v", recipe.writerRequired))
			if recipe.constructed != nil {
				result.WriteString(fmt.Sprintf("|constructed-member:%#v:%#v:%#v", *recipe.constructed, recipe.constructedGroup, recipe.constructedInputs))
				result.WriteString(fmt.Sprintf("|constructed-disposition:%#v", recipe.constructedDisposition))
			}
			result.WriteString(fmt.Sprintf("|operation-recipe:%#v:%p:%p:%#v", recipe.key, recipe.getter, recipe.returning, descriptorFingerprintDelta(recipe.delta, &result)))
			for _, link := range recipe.fieldMutationLinks {
				result.WriteString(fmt.Sprintf("|field-mutation-link:%#v:%#v:%#v:%#v:%d:%p", link.candidate, link.field, link.child, link.origin, link.kind, link.generation))
				if link.nativeComponent != 0 {
					result.WriteString(fmt.Sprintf("|native-mutation-component:%d", link.nativeComponent))
				}
				if link.nativeField != nil {
					result.WriteString(fmt.Sprintf("|field-mutation-component:%#v", *link.nativeField))
				}
			}
			for _, forward := range recipe.fieldForwards {
				installedMutationRHSFingerprint(forward.mutationRHS, &result)
				result.WriteString(fmt.Sprintf("|field-forward:%#v:%#v", forward.request, descriptorFingerprintAlternatives([]sourceStagedOperationAlternative{forward.alternative}, &result)[0]))
				if forward.source != nil {
					source := *forward.source
					source.installation, source.eager, source.input, source.prototype, source.calleeEntry, source.inputInvocation, source.descriptorRead = nil, nil, nil, nil, nil, nil, nil
					if source.descriptorMap != nil {
						plan := *source.descriptorMap
						plan.argumentOrder = nil
						if plan.argumentSource != nil {
							result.WriteString(fmt.Sprintf("|native-map-source:%#v", *plan.argumentSource))
							plan.argumentSource = nil
						}
						result.WriteString(fmt.Sprintf("|native-map:%#v", plan))
						source.descriptorMap = nil
					}
					result.WriteString(fmt.Sprintf("|forward-source:%#v", source))
					if forward.source.inputInvocation != nil {
						result.WriteString(fmt.Sprintf("|forward-input-invocation:%#v", *forward.source.inputInvocation))
					}
					if forward.source.prototype != nil {
						result.WriteString(fmt.Sprintf("|forward-prototype:%#v", *forward.source.prototype))
					}
					if forward.source.input != nil {
						result.WriteString(fmt.Sprintf("|forward-input:%#v", *forward.source.input))
					}
					if forward.source.eager != nil {
						result.WriteString(fmt.Sprintf("|forward-eager-effects:%#v", *forward.source.eager))
					}
					if forward.source.installation != nil {
						result.WriteString(fmt.Sprintf("|forward-installation:%#v", *forward.source.installation))
					}
				}
			}
			if recipe.nativeGet != nil {
				source := *recipe.nativeGet
				// Dedicated markers above cover these descriptions without carrier or issuer identity.
				source.effectsSource, source.arrayPush = nil, nil
				source.installation, source.eager, source.input, source.prototype, source.calleeEntry, source.inputInvocation, source.descriptorRead = nil, nil, nil, nil, nil, nil, nil
				if source.descriptorMap != nil {
					plan := *source.descriptorMap
					plan.argumentOrder = nil
					if plan.argumentSource != nil {
						result.WriteString(fmt.Sprintf("|native-map-source:%#v", *plan.argumentSource))
						plan.argumentSource = nil
					}
					result.WriteString(fmt.Sprintf("|native-map:%#v", plan))
					source.descriptorMap = nil
				}
				result.WriteString(fmt.Sprintf("|native-get:%#v", source))
				if recipe.nativeGet.inputInvocation != nil {
					result.WriteString(fmt.Sprintf("|native-input-invocation:%#v", *recipe.nativeGet.inputInvocation))
				}
				if recipe.nativeGet.prototype != nil {
					result.WriteString(fmt.Sprintf("|native-prototype:%#v", *recipe.nativeGet.prototype))
				}
				if recipe.nativeGet.input != nil {
					result.WriteString(fmt.Sprintf("|native-input:%#v", *recipe.nativeGet.input))
				}
				if recipe.nativeGet.eager != nil {
					result.WriteString(fmt.Sprintf("|native-eager-effects:%#v", *recipe.nativeGet.eager))
				}
				if recipe.nativeGet.installation != nil {
					result.WriteString(fmt.Sprintf("|native-installation:%#v", *recipe.nativeGet.installation))
				}
			}
		}
		for _, use := range fact.staged.operationUses {
			result.WriteString(fmt.Sprintf("|operation-use:%#v:%p", use.request, use.call))
			if use.installed != nil {
				result.WriteString(fmt.Sprintf("|installed-get:%#v", *use.installed))
			}
		}
		for _, creation := range fact.staged.returnedCreations {
			result.WriteString(fmt.Sprintf("|returned-creation:%p:%#v:%p:%#v", creation.binding, creation.recipe, creation.inputs, creation.uses))
		}
		for _, invoked := range fact.staged.returnedInvocations {
			result.WriteString(fmt.Sprintf("|returned-invocation:%#v:%#v", invoked.alternative, invoked.later))
		}
		result.WriteString(environmentSourcesSignature(fact.summary.DirectEffectSources))
		for _, call := range fact.fieldCalls {
			for _, outcome := range call.descriptorEffects {
				result.WriteString(fmt.Sprintf("|descriptor-outcome:%p:%p:%p:%p:%t:%s", outcome.caller, outcome.call, outcome.target, outcome.occurrence, outcome.complete, descriptorSourceIdentity(EnvironmentEffectSource{descriptorOrigin: &outcome.origin})))
			}
		}
		result.WriteString(stateEffectsSignature(fact.directReads))
		result.WriteString(stateEffectsSignature(fact.directWrites))
		result.WriteString(contextEffectsSignature(fact.directContext))
		for _, edge := range fact.summary.Calls {
			result.WriteString(edge.ID)
			result.WriteByte('|')
			result.WriteString(edge.Name)
			result.WriteByte('|')
			result.WriteString(edge.ModuleSpecifier)
			result.WriteByte('|')
			result.WriteString(edge.ExportName)
			for _, binding := range edge.ReceiverBindings {
				result.WriteString(fmt.Sprintf("|receiver:%d:%s:%d:%q", binding.ParameterIndex, binding.Source, binding.SourceParameterIndex, binding.Path))
			}
			result.WriteByte('|')
			if symbol, exists := fact.callSymbols[edge.ID]; exists {
				result.WriteString(fmt.Sprintf("%d", symbol))
			}
			result.WriteByte('\n')
		}
	}
	symbols := make([]int, 0, len(analysis.bySymbol))
	for symbol := range analysis.bySymbol {
		symbols = append(symbols, int(symbol))
	}
	sort.Ints(symbols)
	for _, symbol := range symbols {
		result.WriteString(fmt.Sprintf("symbol:%d:%s\n", symbol, analysis.bySymbol[ast.SymbolId(symbol)].ID))
	}
	return result.String()
}

// descriptorTargetFingerprint emits semantic descriptions rather than cloned
// carrier allocation addresses. It retains each original child and field order.
func descriptorTargetFingerprint(source *sourceDescriptorTargetSource, result *strings.Builder) {
	if source == nil {
		return
	}
	result.WriteString(fmt.Sprintf("|descriptor-target:%#v:%#v:%p:%#v:%t", source.request, source.algorithm, source.generation, source.cut, source.represented))
	result.WriteString(fmt.Sprintf("|target-native:%p:%p:%#v", source.source.method, source.source.get, source.source.request))
	for _, input := range source.inputs {
		descriptorFingerprintInput(input, result)
	}

	for _, field := range source.fields {
		result.WriteString(fmt.Sprintf("|target-field:%d:%p:%#v", field.field, field.writer, field.data))
		result.WriteString(fmt.Sprintf("|target-receiver:%#v", field.receiver))
		endpoint := descriptorFingerprintEndpoint(field.target, result)
		result.WriteString(fmt.Sprintf("|target-receiver-construction:%#v", endpoint))
	}
	for _, required := range source.required {
		result.WriteString(fmt.Sprintf("|target-required:%#v", required))
	}
}

func descriptorStrongFingerprint(source *sourceDescriptorStrongReader, result *strings.Builder) {
	if source == nil {
		return
	}
	result.WriteString(fmt.Sprintf("|descriptor-strong:%#v:%#v:%d:%s:%#v", source.parent, source.cut, source.mode, source.field, source.target))
	descriptorFingerprintEndpoint(sourceRelativeEndpoint{kind: relativeEndpointDescriptorView, descriptorView: &source.view}, result)
}

func originalMutationBodyFingerprint(p sourceOriginalMutationBodyPopulation, out *strings.Builder) {
	out.WriteString(fmt.Sprintf("|mutation-body:%p:%p:%t", p.declaration, p.generation, p.complete))
	for _, operation := range p.operations {
		out.WriteString(fmt.Sprintf(":%p:%d", operation.node, operation.kind))
	}
}

func descriptorFingerprintDelta(delta sourceStagedOperationDelta, result *strings.Builder) sourceStagedOperationDelta {
	delta.exposures = descriptorFingerprintAlternatives(delta.exposures, result)
	copied := false
	for i, invocation := range delta.invoked {
		if invocation.alternative.endpoint.nativePrimitive == nil && invocation.alternative.endpoint.descriptorView == nil && invocation.alternative.endpoint.moduleConstruction == nil && invocation.alternative.endpoint.constructionCallable == nil {
			continue
		}
		if !copied {
			delta.invoked = append([]sourceStagedOperationInvocation(nil), delta.invoked...)
			copied = true
		}
		delta.invoked[i].alternative.endpoint = descriptorFingerprintEndpoint(invocation.alternative.endpoint, result)
	}
	return delta
}

func descriptorFingerprintBoundInputs(inputs sourceRelativeBoundInputs, result *strings.Builder) sourceRelativeBoundInputs {
	inputs.bindings = descriptorFingerprintBindings(inputs.bindings, result)
	return inputs
}

func reflectiveContributionFingerprint(d *sourceStagedReflectiveContribution, result *strings.Builder) {
	if d == nil {
		return
	}
	result.WriteString(fmt.Sprintf("|reflective-contribution:%d:%p:%p:%d:%#v:%#v:%#v:%#v:%#v:%#v", d.purpose, d.generation, d.method, d.kind, d.request, d.parent, d.root, d.algorithm, d.reader, d.data))
	descriptorFingerprintEndpoint(d.installation.target, result)
	descriptorFingerprintEndpoint(d.installation.key, result)
	descriptorFingerprintEndpoint(d.installation.descriptor, result)
}
