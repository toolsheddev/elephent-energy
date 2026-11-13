function normalizeIncentiveIds(raw) {
  // Already an array
  if (Array.isArray(raw)) return raw;

  if (typeof raw === "string") {
    try {
      // Try JSON.parse("[1,2,3]")
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // Fallback: "1,2,3"
      return raw.split(",").map(x => Number(x.trim())).filter(x => !isNaN(x));
    }
  }

  console.log("Invalid incentive_ids format:", raw);
  return [];
}

function initializeIncentiveLimits(incentives, limits) {
  if (!Array.isArray(incentives) || !Array.isArray(limits)) {
    console.log("Invalid inputs: incentives and limits must be arrays.");
    return [];
  }

  // Build map keyed by limit.id
  const limitMap = new Map();

  limits.forEach(limit => {
    const incentiveIds = normalizeIncentiveIds(limit.incentive_ids);

    limitMap.set(limit.id, {
      ...limit,
      incentive_ids: incentiveIds,
      received_amount: 0,
      received_number: 0,
    });
  });

  // Match incentives → limits
  incentives.forEach(item => {
    limits.forEach(limit => {
      const ids = normalizeIncentiveIds(limit.incentive_ids);

      if (ids.includes(item.incentive_id)) {
        const entry = limitMap.get(limit.id);
        entry.received_amount += Math.abs(Number(item.price_actual)) || 0;
        entry.received_number += 1;
      }
    });
  });

  return Array.from(limitMap.values());
}

let initializedLimits = initializeIncentiveLimits(
  transformData.data.incentivesForLimits,
  transformData.data.incentiveLimitsData
);

return initializedLimits;
