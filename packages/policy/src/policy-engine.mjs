const RISK = Object.freeze({ read: 0, 'bounded-write': 1, elevated: 2, irreversible: 3 });
const CAPABILITY = /^mgds\.unity\.[a-z0-9.-]+@[0-9]+\.[0-9]+\.[0-9]+$/;
const SCOPE = /^prj_[A-Za-z0-9_-]{16,}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;

function riskAllowed(requested, ceiling) {
  return Number.isInteger(RISK[requested]) && Number.isInteger(RISK[ceiling]) && RISK[requested] <= RISK[ceiling];
}

function validateRequest(request) {
  if (!CAPABILITY.test(request.capabilityId ?? '') || !SCOPE.test(request.projectScope ?? '') || !HASH.test(request.requestHash ?? '') || !Number.isInteger(RISK[request.risk])) {
    throw new Error('MGDS_INVALID_REQUEST');
  }
}

class BudgetSession {
  #remaining;
  #terminated = false;

  constructor(grant) {
    this.#remaining = structuredClone(grant);
  }

  consume(usage) {
    if (this.#terminated) throw new Error('MGDS_BUDGET_TERMINATED');
    const next = structuredClone(this.#remaining);
    for (const [dimension, amount] of Object.entries(usage)) {
      if (!(dimension in next) || !Number.isFinite(amount) || amount < 0) throw new Error(`MGDS_INVALID_BUDGET_USAGE:${dimension}`);
      if (amount > next[dimension]) {
        this.#terminated = true;
        throw new Error(`MGDS_BUDGET_EXHAUSTED:${dimension}`);
      }
      next[dimension] -= amount;
    }
    this.#remaining = next;
    return structuredClone(next);
  }
}

export class PolicyEngine {
  constructor(policy, options = {}) {
    if (policy?.defaultDecision !== 'deny' || !Array.isArray(policy.grants)) throw new Error('MGDS_INVALID_POLICY');
    this.policy = structuredClone(policy);
    this.now = options.now ?? (() => new Date().toISOString());
    this.currentGeneration = options.currentGeneration ?? (() => 0);
  }

  authorize(request, context) {
    validateRequest(request);
    const now = this.now();
    const grant = this.policy.grants.find((candidate) =>
      candidate.capabilityId === request.capabilityId
      && candidate.projectScope === request.projectScope
      && candidate.expiresAt > now
      && riskAllowed(request.risk, candidate.riskCeiling));
    if (!grant) return { decision: 'deny', reason: 'MGDS_POLICY_DENIED' };

    const lease = context?.lease;
    const leaseValid = lease
      && lease.projectScope === request.projectScope
      && lease.capabilityIds?.includes(request.capabilityId)
      && lease.expiresAt > now
      && lease.generation === this.currentGeneration(request.projectScope);
    if (!leaseValid) return { decision: 'deny', reason: 'MGDS_STALE_LEASE' };

    if (request.approval === 'exact') {
      const approval = context?.approval;
      if (!approval) return { decision: 'deny', reason: 'MGDS_APPROVAL_REQUIRED' };
      if (approval.expiresAt <= now) return { decision: 'deny', reason: 'MGDS_APPROVAL_EXPIRED' };
      if (approval.requestHash !== request.requestHash) return { decision: 'deny', reason: 'MGDS_APPROVAL_MISMATCH' };
      if (!riskAllowed(request.risk, approval.riskCeiling)) return { decision: 'deny', reason: 'MGDS_APPROVAL_RISK_EXCEEDED' };
    }

    return { decision: 'allow', leaseId: lease.id, grant: structuredClone(grant) };
  }

  budget(authorization) {
    if (authorization?.decision !== 'allow' || !authorization.grant?.budget) throw new Error('MGDS_POLICY_DENIED');
    return new BudgetSession(authorization.grant.budget);
  }
}
