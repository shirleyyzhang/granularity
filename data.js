const DETAIL_TYPES = [
  { id: "facts", label: "Facts" },
  { id: "evidence", label: "Evidence" },
  { id: "risks", label: "Risks" },
  { id: "action", label: "Action steps" }
];

const DEPTH_LABELS = ["Brief", "Standard", "In depth"];

const PHRASE_COLORS = [
  { name: "teal", bg: "#e4f2ed", border: "#0f5c4c", text: "#0f5c4c", soft: "rgba(15, 92, 76, 0.14)" },
  { name: "amber", bg: "#faf0df", border: "#b45309", text: "#92400e", soft: "rgba(180, 83, 9, 0.14)" },
  { name: "violet", bg: "#ede8f7", border: "#6d28d9", text: "#5b21b6", soft: "rgba(109, 40, 217, 0.14)" },
  { name: "rose", bg: "#fce8ec", border: "#be123c", text: "#9f1239", soft: "rgba(190, 18, 60, 0.14)" },
  { name: "sky", bg: "#e0f0fa", border: "#0369a1", text: "#075985", soft: "rgba(3, 105, 161, 0.14)" }
];

function getColorIndexForId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % PHRASE_COLORS.length;
}

function toLevels(bodies) {
  return bodies.map((body, i) => ({
    label: DEPTH_LABELS[i] || `Level ${i + 1}`,
    body
  }));
}

function makeTypes(pack) {
  return {
    facts: toLevels(pack.facts),
    evidence: toLevels(pack.evidence),
    risks: toLevels(pack.risks),
    action: toLevels(pack.action)
  };
}

function sel(id, text) {
  return `<span class="selectable" data-id="${id}" tabindex="0" role="button" aria-pressed="false">${text}</span>`;
}

const DETAIL_DATA = {
  "high-interest-first": {
    title: "High-interest debt usually beats investing as a first priority",
    types: makeTypes({
      facts: [
        "Paying off 22% APR debt is like earning a guaranteed 22% return.",
        "On $6,500 at 22% APR, interest is roughly $1,400/year if the balance barely moves — higher than typical long-run stock returns.",
        "Markets might return ~7–10% long term, but that's uncertain year to year. Card interest at 22% is certain. For overlapping dollars, payoff usually wins unless you have a match, promo rate, or liquidity constraint."
      ],
      evidence: [
        "Avalanche-style frameworks rank debts by interest rate for this reason.",
        "CFPB data consistently places credit cards among the highest-cost consumer debts.",
        "Even strong market years don't erase monthly compounding at 22%. Planner consensus: above ~10–12% APR, payoff usually beats investing for the same dollars."
      ],
      risks: [
        "Ignoring the card while investing can quietly cost ~$100+/month in interest.",
        "Draining all savings to feel debt-free can force re-borrowing when something breaks.",
        "Also risky: skipping a 401(k) match to pay debt faster — that can forfeit return higher than 22% on the matched slice."
      ],
      action: [
        "Prioritize the 22% card ahead of discretionary investing.",
        "Keep a starter cash buffer, capture any employer match, then send surplus at the card.",
        "When the card hits $0, redirect that same payment into investments automatically the next payday."
      ]
    })
  },

  "employer-match": {
    title: "Don't skip an employer 401(k) match if you have one",
    types: makeTypes({
      facts: [
        "An employer match is an instant return on the dollars you defer.",
        "A common formula is 50% of contributions up to 6% of salary. On $80k, contributing $4,800 can add $2,400 from the company.",
        "A dollar-for-dollar match is a 100% return before market growth. Even 50% beats accelerating a 22% card for the matched portion only — get the match, then attack the card."
      ],
      evidence: [
        "Benefits research shows employees often leave match dollars unused — one of the costliest default mistakes.",
        "The matched slice typically outperforms paying extra on 22% debt; unmatched extra contributions often should wait.",
        "Check vesting: unvested match may not be yours if you leave soon, which changes how aggressively you chase it."
      ],
      risks: [
        "Skipping the match is often the most expensive debt-payoff mistake.",
        "Misreading the formula (assuming dollar-for-dollar when it's 50%) under-contributes.",
        "Front-loading contributions without a true-up policy can accidentally miss mid-year match."
      ],
      action: [
        "Look up your exact match formula in the plan summary.",
        "Set deferral to the minimum that captures 100% of the match.",
        "After the card is paid, raise contributions toward 10–15% of income."
      ]
    })
  },

  "emergency-buffer": {
    title: "Keep a small emergency buffer so you don't re-borrow",
    types: makeTypes({
      facts: [
        "A cash buffer prevents the next surprise from restarting credit-card debt.",
        "While attacking high APR, many advisors use a starter fund of ~$1k–$2k, then rebuild to 3–6 months after the card is gone.",
        "With $12k saved and $6.5k debt, you can pay the card and still keep thousands in HYSA — going to $0 cash often backfires."
      ],
      evidence: [
        "Debt relapse after zeroing savings is common in credit counseling.",
        "Keeping cash in HYSA (~4–5%) while paying 22% is still usually better than re-borrowing at 22%.",
        "Behavioral evidence: people with no liquid cushion are more likely to use revolving credit for shocks."
      ],
      risks: [
        "Zero cash + surprise bill = re-borrowing at 22%.",
        "Oversaving 6 months before touching the card means paying a lot of interest for comfort.",
        "Parking the buffer in stocks can force a sale when you need cash."
      ],
      action: [
        "Decide a starter buffer floor before extra card payments.",
        "Pay the card from surplus above that floor.",
        "Park the buffer in a high-yield savings account, not the market."
      ]
    })
  },

  "raise-split": {
    title: "Use the raise to automate investing instead of lifestyle creep",
    types: makeTypes({
      facts: [
        "A raise only builds wealth if it doesn't silently become new spending.",
        "After the card is gone, bump retirement toward ~10–15% of income and automate on payday.",
        "Split the raise across investing, buffer refill, and a small fun budget — written percentages beat vibes."
      ],
      evidence: [
        "Lifestyle creep is sticky because upgrading fixed costs feels like a new normal.",
        "Save More Tomorrow–style research shows people accept future savings increases more easily than cuts.",
        "Raises timed with auto-escalation are among the highest-leverage behavior interventions."
      ],
      risks: [
        "Housing/car upgrades can permanently absorb the raise.",
        "Waiting 'until I settle in' usually means the raise is already spent.",
        "Increasing lifestyle before the card is gone keeps 22% interest in the background."
      ],
      action: [
        "The week the raise hits, increase 401(k)% and set transfers.",
        "Write percentages for invest / buffer / fun.",
        "Delay upgrading rent/car/subscriptions for 90 days."
      ]
    })
  }
};

const CHAT_RESPONSES = [
  {
    id: "employer-match",
    keywords: ["401", "401k", "match", "employer", "vesting", "deferral"],
    html: `
      <p>Good question — the match is usually worth capturing even while you carry the card.</p>
      <p>
        ${sel("employer-match", "Don't skip an employer 401(k) match if you have one")}.
        Contribute only enough to get the full match, then send surplus cash at the 22% card.
      </p>
    `
  },
  {
    id: "emergency-buffer",
    keywords: ["emergency", "buffer", "savings", "hysa", "cash", "liquidity"],
    html: `
      <p>Keeping some cash on hand stops the debt cycle from restarting.</p>
      <p>
        ${sel("emergency-buffer", "Keep a small emergency buffer so you don't re-borrow")}.
        With $12k saved, you can pay the card and still keep a solid cushion.
      </p>
    `
  },
  {
    id: "high-interest-first",
    keywords: ["debt", "card", "apr", "interest", "pay off", "payoff"],
    html: `
      <p>With a 22% APR, the card is usually priority #1 for extra dollars.</p>
      <p>
        ${sel("high-interest-first", "High-interest debt usually beats investing as a first priority")}.
        Still capture your employer match first.
      </p>
    `
  },
  {
    id: "raise-split",
    keywords: ["raise", "salary", "invest", "roth", "ira", "lifestyle", "creep"],
    html: `
      <p>The raise is a chance to lock in habits before spending adjusts.</p>
      <p>
        ${sel("raise-split", "Use the raise to automate investing instead of lifestyle creep")}.
      </p>
    `
  }
];

const CHAT_DEFAULT = `
  <p>I can help with debt payoff, employer match, emergency cash, and what to do with the raise.</p>
  <p>
    Try asking about your
    ${sel("employer-match", "401(k) match")},
    ${sel("emergency-buffer", "emergency buffer")},
    ${sel("high-interest-first", "whether to pay the card first")},
    or
    ${sel("raise-split", "how to use the raise")}.
  </p>
`;

function getChatResponse(text, context = {}) {
  const lower = text.toLowerCase();

  if (context.detailId && /more|explain|why|how|what about|tell me|details?/i.test(lower)) {
    const data = DETAIL_DATA[context.detailId];
    if (data) {
      return `<p>Building on “${data.title}”:</p><p>${sel(context.detailId, data.title)} — hover to adjust detail type and depth.</p>`;
    }
  }

  for (const reply of CHAT_RESPONSES) {
    if (reply.keywords.some((k) => lower.includes(k))) {
      return reply.html;
    }
  }

  return CHAT_DEFAULT;
}

function getDepthLevels() {
  return DEPTH_LABELS.map((label) => ({ label }));
}
