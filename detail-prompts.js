export const TYPE_LABELS = {
  facts: "Facts",
  evidence: "Evidence",
  risks: "Risks",
  action: "Action steps",
};

export const DEPTH_MAX_TOKENS = {
  0: 40,
  1: 80,
  2: 110,
};

const DETAIL_BASE = `You are expanding one selected idea from a financial advice conversation for a UI called Granularity.

Return ONLY plain text — no HTML, no markdown, no labels, no preamble.
Write tightly. Every word must earn its place. Do not pad or repeat yourself.`;

export const TYPE_RUBRICS = {
  facts: {
    mustInclude: "Numbers, rates, comparisons, verifiable claims",
    mustNotInclude: "Opinions, why experts agree, step-by-step advice",
  },
  evidence: {
    mustInclude: "Frameworks, consensus, data sources, reasoning chains",
    mustNotInclude: "User-specific scenarios, action items",
  },
  risks: {
    mustInclude: "Failure modes, tradeoffs, edge cases",
    mustNotInclude: "Upside framing, what to do",
  },
  action: {
    mustInclude: "Imperative verbs, sequence, concrete next moves",
    mustNotInclude: "Background justification, citations",
  },
};

export const DEPTH_LAYERS = {
  0: {
    label: "Brief",
    layer: "WHAT — claim only",
    constraints:
      "Exactly 1 sentence. Max 18 words. No subordinate clauses. Headline punch, not explanation.",
    mustAdd: "The core claim in its shortest form.",
  },
  1: {
    label: "Standard",
    layer: "WHAT + WHY — claim plus core mechanism",
    constraints:
      "Exactly 2 sentences. Max 40 words total. Tight prose — no filler phrases.",
    mustAdd: "The core why or mechanism that was absent from Brief.",
  },
  2: {
    label: "In depth",
    layer: "WHAT + WHY + DETAIL — specifics or caveats",
    constraints:
      "3 sentences max. Max 65 words total. Stop when the point is made — do not elaborate further.",
    mustAdd:
      "At least one number, named example, or caveat that was NOT in Standard.",
  },
};

/** Gold examples from "high-interest-first" — one progression per type */
export const FEW_SHOTS = {
  facts: {
    brief: "Paying off 22% APR debt is like earning a guaranteed 22% return.",
    standard:
      "On $6,500 at 22% APR, interest is roughly $1,400/year if the balance barely moves — higher than typical long-run stock returns.",
    inDepth:
      "Markets might return ~7–10% long term, but that's uncertain year to year. Card interest at 22% is certain. Payoff usually wins unless you have a match, promo rate, or liquidity constraint.",
  },
  evidence: {
    brief: "Avalanche-style frameworks rank debts by interest rate for this reason.",
    standard:
      "CFPB data consistently places credit cards among the highest-cost consumer debts.",
    inDepth:
      "Even strong market years don't erase monthly compounding at 22%. Planner consensus: above ~10–12% APR, payoff usually beats investing for the same dollars.",
  },
  risks: {
    brief: "Ignoring the card while investing can quietly cost ~$100+/month in interest.",
    standard:
      "Draining all savings to feel debt-free can force re-borrowing when something breaks.",
    inDepth:
      "Also risky: skipping a 401(k) match to pay debt faster — that can forfeit return higher than 22% on the matched slice.",
  },
  action: {
    brief: "Prioritize the 22% card ahead of discretionary investing.",
    standard:
      "Keep a starter cash buffer, capture any employer match, then send surplus at the card.",
    inDepth:
      "When the card hits $0, redirect that same payment into investments automatically the next payday.",
  },
};

export const SUCCESS_TESTS = {
  facts: {
    0: "Can the user quote one number or comparison from your answer?",
    1: "Does it add a dollar figure or rate calculation not already stated in Brief?",
    2: "Does it add uncertainty, an edge case, or caveat with a specific number?",
  },
  evidence: {
    0: "Does the answer name one framework, source type, or consensus in a single line?",
    1: "Does it explain why experts agree — without a user-specific scenario?",
    2: "Does it add a specific data point or planner consensus not in Standard?",
  },
  risks: {
    0: "Does the answer name one concrete thing that could go wrong?",
    1: "Does it explain the mechanism of that failure — not what to do instead?",
    2: "Does it add an edge case or tradeoff not mentioned in Standard?",
  },
  action: {
    0: "Is there one clear imperative the user could act on today?",
    1: "Are there 2 ordered steps with verbs — not background justification?",
    2: "Could the user do something specific in the next 48 hours?",
  },
};

export function buildDetailSystem(scenario, detailType) {
  const rubric = TYPE_RUBRICS[detailType] || TYPE_RUBRICS.facts;
  const shots = FEW_SHOTS[detailType] || FEW_SHOTS.facts;

  return `${DETAIL_BASE}

${scenario}

Detail type: ${TYPE_LABELS[detailType] || detailType}
Must include: ${rubric.mustInclude}
Must NOT include: ${rubric.mustNotInclude}

Depth is additive — each level adds new information, never rephrases the prior level:
- Brief (0): ${DEPTH_LAYERS[0].layer}. ${DEPTH_LAYERS[0].constraints}
- Standard (1): ${DEPTH_LAYERS[1].layer}. ${DEPTH_LAYERS[1].constraints}
- In depth (2): ${DEPTH_LAYERS[2].layer}. ${DEPTH_LAYERS[2].constraints}

Style reference for ${TYPE_LABELS[detailType] || detailType} (match this voice and progression, but write about the user's selected idea):
Example Brief: "${shots.brief}"
Example Standard: "${shots.standard}"
Example In depth: "${shots.inDepth}"`;
}

export function buildDetailUserPrompt({
  ideaTitle,
  ideaId,
  detailType,
  depthIndex,
  conversation,
  priorLevels = {},
}) {
  const depth = DEPTH_LAYERS[depthIndex] || DEPTH_LAYERS[1];
  const typeLabel = TYPE_LABELS[detailType] || detailType;
  const successTest =
    SUCCESS_TESTS[detailType]?.[depthIndex] ??
    SUCCESS_TESTS.facts[depthIndex];

  const priorLines = [];
  if (depthIndex >= 1 && priorLevels.brief) {
    priorLines.push(`Already shown at Brief: "${priorLevels.brief}"`);
  }
  if (depthIndex >= 2 && priorLevels.standard) {
    priorLines.push(`Already shown at Standard: "${priorLevels.standard}"`);
  }

  const priorBlock = priorLines.length
    ? `\n${priorLines.join("\n")}\nDo NOT restate or paraphrase any sentence from prior levels.\n`
    : "";

  return `Selected idea: "${ideaTitle}" (id: ${ideaId || "unknown"})
Detail type: ${typeLabel}
Write ONLY the ${depth.label} level (level ${depthIndex} of 2).

This level must add: ${depth.mustAdd}
Hard constraints: ${depth.constraints}
${priorBlock}
Recent conversation:
${conversation || "(none)"}

Expand ONLY this idea at ${typeLabel} · ${depth.label}.
Success test: ${successTest}`;
}
