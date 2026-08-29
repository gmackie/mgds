import assert from 'node:assert/strict';
import test from 'node:test';
import { PolicyEngine } from '../src/policy-engine.mjs';

const capability = 'mgds.unity.editor.play.start@0.1.0';
const scope = 'prj_01K3YXA0J3V6J2HM8Q4W';
const requestHash = `sha256:${'a'.repeat(64)}`;
const now = '2026-08-29T20:00:00Z';

const policy = {
  version: 1,
  defaultDecision: 'deny',
  grants: [{
    capabilityId: capability,
    projectScope: scope,
    riskCeiling: 'bounded-write',
    expiresAt: '2026-08-29T21:00:00Z',
    budget: { wallTimeSeconds: 60, artifactBytes: 1000, networkRequests: 0, retries: 1 },
  }],
};

const lease = (overrides = {}) => ({
  id: 'lease_01K3YXEKDWP9T2C4M6SN',
  projectScope: scope,
  holder: 'principal_01K3YXE2AQR6K8W4H0JZ',
  generation: 3,
  capabilityIds: [capability],
  issuedAt: '2026-08-29T19:59:00Z',
  expiresAt: '2026-08-29T20:10:00Z',
  ...overrides,
});

const approval = (overrides = {}) => ({
  requestHash,
  riskCeiling: 'bounded-write',
  expiresAt: '2026-08-29T20:05:00Z',
  ...overrides,
});

const request = (overrides = {}) => ({
  capabilityId: capability,
  projectScope: scope,
  risk: 'bounded-write',
  approval: 'exact',
  requestHash,
  ...overrides,
});

test('exact scope, risk ceiling, approval hash, lease generation, and expiry all authorize', () => {
  const engine = new PolicyEngine(policy, { now: () => now, currentGeneration: () => 3 });
  const result = engine.authorize(request(), { lease: lease(), approval: approval() });
  assert.equal(result.decision, 'allow');
  assert.equal(result.leaseId, lease().id);
});

test('each authority layer independently fails closed', () => {
  const engine = new PolicyEngine(policy, { now: () => now, currentGeneration: () => 3 });
  const cases = [
    [request({ projectScope: 'prj_01K3YXOTHER000000000' }), { lease: lease(), approval: approval() }, 'MGDS_POLICY_DENIED'],
    [request({ risk: 'elevated' }), { lease: lease(), approval: approval({ riskCeiling: 'elevated' }) }, 'MGDS_POLICY_DENIED'],
    [request(), { lease: lease(), approval: approval({ requestHash: `sha256:${'b'.repeat(64)}` }) }, 'MGDS_APPROVAL_MISMATCH'],
    [request(), { lease: lease({ generation: 2 }), approval: approval() }, 'MGDS_STALE_LEASE'],
    [request(), { lease: lease({ expiresAt: '2026-08-29T19:00:00Z' }), approval: approval() }, 'MGDS_STALE_LEASE'],
    [request(), { lease: lease(), approval: approval({ expiresAt: '2026-08-29T19:00:00Z' }) }, 'MGDS_APPROVAL_EXPIRED'],
  ];
  for (const [candidate, context, reason] of cases) {
    assert.equal(engine.authorize(candidate, context).reason, reason);
  }
});

test('malformed requests are rejected at entry even if later layers would allow', () => {
  const engine = new PolicyEngine(policy, { now: () => now, currentGeneration: () => 3 });
  assert.throws(() => engine.authorize(request({ capabilityId: '../../shell' }), { lease: lease(), approval: approval() }), /MGDS_INVALID_REQUEST/);
  assert.throws(() => engine.authorize(request({ requestHash: 'not-a-hash' }), { lease: lease(), approval: approval() }), /MGDS_INVALID_REQUEST/);
});

test('budget sessions terminate on first exhausted dimension and cannot resume', () => {
  const engine = new PolicyEngine(policy, { now: () => now, currentGeneration: () => 3 });
  const authorized = engine.authorize(request(), { lease: lease(), approval: approval() });
  const budget = engine.budget(authorized);
  assert.deepEqual(budget.consume({ wallTimeSeconds: 10, artifactBytes: 900 }), { wallTimeSeconds: 50, artifactBytes: 100, networkRequests: 0, retries: 1 });
  assert.throws(() => budget.consume({ artifactBytes: 101 }), /MGDS_BUDGET_EXHAUSTED:artifactBytes/);
  assert.throws(() => budget.consume({ wallTimeSeconds: 1 }), /MGDS_BUDGET_TERMINATED/);
});
