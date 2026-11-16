package exactcompiler

// classifyStagedFieldObservation distinguishes represented source Effects from
// selected field values. Both original Has/Get phases must carry their own
// source coverage and accounting. This supplies no absence or Value authority.
func classifyStagedFieldObservation(observation *sourceStagedFieldObservation) sourceStagedFieldDispositionKind {
	if observation == nil {
		return stagedFieldDispositionUnknown
	}
	if observation.sourceHas && observation.sourceGet && observation.presence == propertyUnknown && observation.effects.has == sourceEffectsAccounted && observation.effects.get == sourceEffectsAccounted {
		return stagedFieldDispositionSources
	}
	return classifyStagedFieldDisposition(observation.presence, observation.effects)
}

// observeStagedFieldSourceCoverage borrows the original source owner's finite
// Effects coverage at this exact Has/Get. The callback owns its source premises.
// Only a still-live grant contributes unknown-presence accounting. It never
// grants absence, normal completion, prototype identity or a field value.
func (query *sourceValueQuery) observeStagedFieldSourceCoverage(get *sourceGetInputs) bool {
	if !query.liveStagedFieldGet(get) {
		return false
	}
	borrow := get.stagedEffects
	observation := borrow.observation
	if observation == nil || borrow.sourcesCovered == nil {
		return false
	}
	phase := observation.phase
	if phase != stagedFieldObservationHas && phase != stagedFieldObservationGet || get.hasOnly != (phase == stagedFieldObservationHas) {
		return false
	}
	if !borrow.sourcesCovered(query, get) || !query.liveStagedFieldGet(get) || get.stagedEffects != borrow || borrow.observation != observation || observation.phase != phase || get.hasOnly != (phase == stagedFieldObservationHas) {
		return false
	}
	if phase == stagedFieldObservationHas {
		query.observeStagedFieldHas(get, propertyUnknown, sourceEffectsAccounted, observation)
		observation.sourceHas = true
	} else {
		query.observeStagedFieldRead(get, nil, sourceEffectsAccounted, observation)
		observation.sourceGet = true
	}
	return true
}
