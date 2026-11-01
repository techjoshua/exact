/** Crosses failed contributors, queued commands, catch-up rollback and later authoritative appends. */
export function verifyPhysicsForceRecovery({ createPhysicsWorld, captureReactiveMutations }) {
	for (const failure of ['throw', 'nonfinite']) {
		const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
		try {
			const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
			let failing = true;
			world.addForce({ name: 'first', apply: () => ({ x: 1, y: 0 }) });
			world.addForce({
				name: 'failure',
				apply() {
					if (failing) {
						if (failure === 'nonfinite') return { x: Number.NaN, y: 0 };
						throw new Error('contribution');
					}
				}
			});
			check(
				throws(() => world.step(1)),
				'failed contributor'
			);
			check(body.velocity.x === 0 && world.time === 0, 'failed tick rollback');
			failing = false;
			world.step(0);
			check(
				body.velocity.x === 1 && body.pose.position.x === 1 && world.time === 1,
				'single replay'
			);
		} finally {
			world[Symbol.dispose]();
		}
	}
	const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
	try {
		const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
		body.applyForce({ x: 2, y: 0 });
		const journal = captureReactiveMutations(() => {
			world.step(1);
		});
		body.applyForce({ x: 3, y: 0 });
		journal.rollback();
		world.step(1);
		check(body.velocity.x === 5, 'authoritative command append');
		let reads = 0;
		body.applyForce({
			get x() {
				return ++reads === 1 ? 1 : Number.POSITIVE_INFINITY;
			},
			y: 0
		});
		world.step(1);
		check(reads === 1 && body.velocity.x === 6, 'validated queued vector snapshot');
		reads = 0;
		world.addForce({
			name: 'getter',
			apply: () => ({
				get x() {
					return ++reads === 1 ? 1 : Number.POSITIVE_INFINITY;
				},
				y: 0
			})
		});
		world.step(1);
		check(reads === 1 && body.velocity.x === 7, 'validated contributor snapshot');
	} finally {
		world[Symbol.dispose]();
	}
	const catchUp = createPhysicsWorld({ fixedStep: 1, sleep: false });
	try {
		const body = catchUp.createBody({ shape: { kind: 'circle', radius: 1 } });
		let failing = true;
		catchUp.addForce({
			name: 'catch-up',
			apply() {
				if (catchUp.time >= 1 && failing) throw new Error('later tick');
				return { x: 1, y: 0 };
			}
		});
		check(
			throws(() => catchUp.step(2)),
			'catch-up failure'
		);
		failing = false;
		catchUp.step(0);
		check(
			catchUp.time === 2 && body.velocity.x === 2 && body.pose.position.x === 3,
			'catch-up replay'
		);
	} finally {
		catchUp[Symbol.dispose]();
	}
	for (const mode of ['overflow', 'contributor', 'body', 'world']) {
		const owned = createPhysicsWorld({ fixedStep: 1, sleep: false });
		try {
			const body = owned.createBody({ shape: { kind: 'circle', radius: 1 } });
			let second,
				later = 0;
			owned.addForce({
				name: 'first',
				apply() {
					if (mode === 'contributor') second[Symbol.dispose]();
					if (mode === 'body') body[Symbol.dispose]();
					if (mode === 'world') owned[Symbol.dispose]();
					return { x: mode === 'overflow' ? 1e308 : 1, y: 0 };
				}
			});
			second = owned.addForce({
				name: 'second',
				apply() {
					later++;
					return { x: mode === 'overflow' ? 1e308 : 1, y: 0 };
				}
			});
			if (mode === 'overflow') {
				check(throws(() => owned.step(1)) && body.velocity.x === 0, 'finite accumulation');
			} else {
				const result = owned.step(1);
				check(
					later === 0 && body.velocity.x === (mode === 'contributor' ? 1 : 0),
					'disposed force ownership'
				);
				check(result.steps === (mode === 'world' ? 0 : 1), 'disposed world boundary');
			}
		} finally {
			owned[Symbol.dispose]();
		}
	}
	const subscribed = createPhysicsWorld({ fixedStep: 1, sleep: false });
	try {
		subscribed.createBody({ type: 'static', shape: { kind: 'circle', radius: 2 } });
		subscribed.createBody({ shape: { kind: 'circle', radius: 2 }, position: { x: 3, y: 0 } });
		let calls = 0;
		const callback = () => {
			calls++;
		};
		const first = subscribed.onCollision(callback);
		const second = subscribed.onCollision(callback);
		first[Symbol.dispose]();
		subscribed.step(1);
		check(calls === 1, 'independent collision registration');
		second[Symbol.dispose]();
		subscribed.step(1);
		check(calls === 1, 'collision unsubscribe');
	} finally {
		subscribed[Symbol.dispose]();
	}
	return true;
}

function throws(run) {
	try {
		run();
	} catch {
		return true;
	}
	return false;
}
function check(condition, contract) {
	if (!condition) throw new Error(`Physics force contract failed: ${contract}`);
}

/** Checks ordinary aliases and copied snapshots without runtime readonly enforcement. */
export function verifyPhysicsReadonlyValues({
	createPhysicsWorld,
	definePhysicsProjection,
	definePhysicsCollisionListener
}) {
	const projection = definePhysicsProjection({ name: 'original', apply() {} });
	projection.name = 'updated';
	const listener = definePhysicsCollisionListener('original', () => {});
	listener.physicsName = 'updated';
	const world = createPhysicsWorld();
	try {
		const source = { kind: 'circle', radius: 1 };
		const body = world.createBody({ shape: source });
		source.radius = 4;
		check(body.shape.radius === 1, 'constructor input copy');
		body.shape.radius = 2;
		const snapshot = world.inspect();
		snapshot.bodies[0].position.x = 99;
		check(
			body.pose.position.x === 0 && body.shape.radius === 2,
			'writable alias and independent snapshot'
		);
		const result = world.step(0);
		result.steps = 99;
		check(
			world.inspect().step === 0 &&
				projection.name === 'updated' &&
				listener.physicsName === 'updated',
			'ordinary returned values'
		);
	} finally {
		world[Symbol.dispose]();
	}
	return true;
}

/** Checks finite correction and command publication, rollback, repair and subsequent progress. */
export function verifyPhysicsFiniteCorrections({ createPhysicsWorld }) {
	for (const kind of [
		'collision',
		'constraint',
		'linear',
		'linear-y',
		'angular',
		'force',
		'torque'
	]) {
		const interval = kind === 'collision' ? 1e-310 : 1;
		const world = createPhysicsWorld({
			fixedStep: interval,
			maxCatchUpSteps: 1,
			sleep: false,
			velocityIterations: 1,
			positionIterations: 1
		});
		try {
			check(world.step(0).steps === 0 && world.time === 0, 'empty tick clock');
			const body = world.createBody({
				shape: { kind: 'circle', radius: 1 },
				mass: kind.startsWith('linear') ? 1e-10 : 1,
				inertia: kind === 'angular' ? 1e-10 : 1,
				position: { x: kind === 'constraint' ? -1e308 : 0, y: 0 },
				velocity: { x: kind === 'collision' ? 1e308 : 0, y: 0 }
			});
			let other;
			let constraint;
			if (kind === 'collision')
				other = world.createBody({
					shape: { kind: 'circle', radius: 1 },
					position: { x: 1, y: 0 },
					velocity: { x: -1e308, y: 0 }
				});
			else if (kind === 'constraint')
				constraint = world.createConstraint({
					kind: 'distance',
					bodyA: body,
					anchor: { x: 1e308, y: 0 },
					length: 1
				});
			else {
				if (kind === 'force') {
					body.applyForce({ x: 1e308, y: 0 });
					body.applyForce({ x: 1e308, y: 0 });
				} else if (kind === 'torque') body.applyForce({ x: 0, y: 1e308 }, { x: 1e308, y: 0 });
				else
					body.applyImpulse(
						{ x: kind === 'linear' ? 1e308 : 0, y: kind === 'linear' ? 0 : 1e308 },
						kind === 'angular' ? { x: 1, y: 0 } : undefined
					);
				body.setKinematic(true);
			}
			const velocity = body.velocity.x;
			const position = body.pose.position.x;
			let rejected = false;
			try {
				world.step(interval);
			} catch (error) {
				rejected = /finite/.test(String(error?.message));
			}
			check(rejected, `${kind} finite publication boundary`);
			check(
				body.velocity.x === velocity &&
					body.velocity.y === 0 &&
					body.pose.position.x === position &&
					body.type === 'dynamic' &&
					world.time === 0,
				`${kind} rollback`
			);
			if (kind === 'collision') {
				body.setPose({});
				other.setPose({});
			} else if (kind === 'constraint') constraint[Symbol.dispose]();
			else body[Symbol.dispose]();
			const next = world.createBody({
				shape: { kind: 'circle', radius: 1 },
				position: { x: 10, y: 0 },
				inertia: 1
			});
			next.applyImpulse({ x: 1, y: 1 }, { x: 11, y: 0 });
			next.applyForce({ x: 0, y: 1 }, { x: 11, y: 0 });
			world.step(0);
			check(
				next.velocity.x === 1 &&
					next.velocity.y === 1 + interval &&
					next.angularVelocity === 1 + interval &&
					world.time === interval,
				`${kind} subsequent progress`
			);
		} finally {
			world[Symbol.dispose]();
		}
	}
	return true;
}

/** Checks each finite clock guard without losing the previously committed timeline. */
export function verifyPhysicsClockArithmetic({ createPhysicsWorld }) {
	for (const kind of ['accumulated', 'simulated', 'dropped']) {
		const world = createPhysicsWorld({
			fixedStep: kind === 'accumulated' ? Number.MAX_VALUE : kind === 'simulated' ? 1e308 : 1,
			maxCatchUpSteps: 1,
			sleep: false
		});
		try {
			world.step(1e308);
			const before = world.inspect();
			let rejected = false;
			try {
				world.step(1e308);
			} catch (error) {
				rejected = /finite/.test(String(error?.message));
			}
			const after = world.inspect();
			check(
				rejected && after.time === before.time && after.droppedSeconds === before.droppedSeconds,
				`${kind} clock guard`
			);
			if (kind === 'accumulated')
				check(world.step(0).steps === 0, 'accumulated rejection does not block later work');
		} finally {
			world[Symbol.dispose]();
		}
	}
	return true;
}
