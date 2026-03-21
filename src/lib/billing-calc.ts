/**
 * Autonomy level → base fee multiplier.
 * supervised (Observe) = 100% markup on API cost
 * notify (Propose) = 200% markup
 * autonomous (Act) = 300% markup
 */
const AUTONOMY_FEE_MULTIPLIER: Record<string, number> = {
  supervised: 1.0,
  notify: 2.0,
  autonomous: 3.0,
};

/**
 * Calculate the total billable amount for a resolved situation.
 * Returns cents.
 */
export function calculateSituationFee(params: {
  situationApiCostCents: number;
  stepApiCostsCents: number[];
  autonomyLevel: string;
  orchestrationFeeMultiplier: number;
}): number {
  const { situationApiCostCents, stepApiCostsCents, autonomyLevel, orchestrationFeeMultiplier } = params;

  const totalApiCost = situationApiCostCents + stepApiCostsCents.reduce((sum, c) => sum + c, 0);

  const baseFee = AUTONOMY_FEE_MULTIPLIER[autonomyLevel] ?? 1.0;
  const effectiveFee = baseFee * orchestrationFeeMultiplier;

  // Customer pays: API cost + (API cost × effective fee)
  return Math.round(totalApiCost * (1 + effectiveFee));
}

/**
 * Calculate copilot message fee.
 * Fixed 150% orchestration fee × operator multiplier.
 */
export function calculateCopilotFee(params: {
  apiCostCents: number;
  orchestrationFeeMultiplier: number;
}): number {
  const baseFee = 1.5; // 150%
  const effectiveFee = baseFee * params.orchestrationFeeMultiplier;
  return Math.round(params.apiCostCents * (1 + effectiveFee));
}
