const RISK = Object.freeze({ read: 0, 'bounded-write': 1, elevated: 2, irreversible: 3 });

function withinRisk(requested, ceiling) {
  return Number.isInteger(RISK[requested]) && Number.isInteger(RISK[ceiling]) && RISK[requested] <= RISK[ceiling];
}

export function evaluatePolicy(request, policy, now = new Date().toISOString()) {
  const grant = policy.grants.find((candidate) =>
    candidate.capabilityId === request.capabilityId
    && candidate.projectScope === request.projectScope
    && candidate.expiresAt > now
    && withinRisk(request.risk, candidate.riskCeiling));
  return grant ? { decision: 'allow', grant } : { decision: 'deny', reason: 'no-matching-grant' };
}

export function assertApproval(request, approval, now = new Date().toISOString()) {
  if (approval.requestHash !== request.requestHash) throw new Error('approval request hash does not match');
  if (approval.expiresAt <= now) throw new Error('approval expired');
  if (!withinRisk(request.risk, approval.riskCeiling)) throw new Error('approval risk ceiling exceeded');
  return true;
}

export function consumeBudget(budget, usage) {
  const result = {};
  for (const [dimension, remaining] of Object.entries(budget)) {
    const consumed = usage[dimension] ?? 0;
    if (consumed > remaining) throw new Error(`MGDS_BUDGET_EXHAUSTED:${dimension}`);
    result[dimension] = remaining - consumed;
  }
  return result;
}
