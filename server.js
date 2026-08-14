import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";
import { buildDetailSystem, buildDetailUserPrompt, DEPTH_MAX_TOKENS } from "./detail-prompts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.static(__dirname));

const SCENARIO = `
The user's financial situation:
- $12,000 in a high-yield savings account
- $6,500 credit card balance at 22% APR
- They just received a raise
- Question context: pay off card vs invest in 401(k)
`.trim();

const CHAT_SYSTEM = `You are a helpful financial advice assistant for a prototype UI called Granularity.

${SCENARIO}

IMPORTANT OUTPUT FORMAT — return ONLY valid HTML (no markdown fences), using:
- <p> tags for paragraphs (2–4 short paragraphs max unless asked for more)
- <span class="selectable" data-id="kebab-case-id" tabindex="0" role="button" aria-pressed="false">phrase</span> for 2–4 expandable key ideas ONLY (see criteria below)
- <span class="peek-sentence" data-peek="one-line hint">sentence fragment</span> for 1–3 hoverable hints on NON-expandable supporting text

WHICH PHRASES GET class="selectable" (expandable) — mark ONLY phrases that are:
- A recommendation, priority, or tradeoff (e.g. "pay the card before extra investing")
- A specific strategy or decision the user might want to drill into
- An atomic claim that stands alone (understandable without the rest of the paragraph)
- Worth expanding into Facts, Evidence, Risks, or Action steps
- Roughly 5–18 words — one idea per span, not a whole paragraph

DO NOT mark as selectable:
- Greetings, transitions, or connective tissue ("That said,", "Short answer:", "Once the card is gone,")
- Sentences that only set context without making a claim
- Text that is already fully detailed — nothing left to expand
- Vague filler or summaries that repeat the paragraph
- Whole sentences that are purely emotional reassurance

Use peek-sentence (NOT selectable) for:
- Brief context or framing around an expandable phrase
- One-line hints that don't need full granularity controls
- Supporting color that helps read the answer but isn't a drill-down target

Expandable selection rules:
- Pick 2–4 selectables per response — quality over quantity
- Embed each selectable INLINE inside a <p> paragraph — never list selectables outside paragraphs or at the end of the response
- Each data-id must be unique, lowercase, hyphenated (e.g. employer-match, emergency-buffer)
- Derive data-id from the idea slug, not random words
- Do NOT nest selectable inside selectable or inside peek-sentence
- Keep the default answer concise; depth comes from the user's granularity controls on selectables

General rules:
- Give practical, balanced personal-finance guidance — not legal/tax advice
- Do NOT include <html>, <body>, or script tags
- Be specific to their numbers when relevant`;

async function complete(system, user, { temperature = 0.7, maxTokens } = {}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set. Copy .env.example to .env and add your key.");
  }

  const options = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature,
  };
  if (maxTokens) options.max_tokens = maxTokens;

  const response = await openai.chat.completions.create(options);

  return response.choices[0]?.message?.content?.trim() || "";
}

function sanitizeHtml(html) {
  return html
    .replace(/^```html?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

const TRANSITION_PATTERN =
  /^(that said|short answer|once |before you |good question|in short|to summarize|first,|second,|however,|also,|note that)/i;

function normalizeSelectableId(id) {
  return id
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isValidExpandableText(text) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  const words = trimmed.split(/\s+/).length;
  if (words < 4 || words > 22) return false;
  if (trimmed.length < 15) return false;
  if (TRANSITION_PATTERN.test(trimmed)) return false;
  return true;
}

function parseSelectableSpan(match) {
  const idMatch = match.match(/data-id="([^"]*)"/i);
  const innerMatch = match.match(/>([\s\S]*?)<\/span>/i);
  return {
    id: idMatch?.[1] || "",
    text: (innerMatch?.[1] || "").replace(/<[^>]+>/g, "").trim(),
    inner: (innerMatch?.[1] || "").trim(),
  };
}

function validateExpandables(html) {
  const selectableRe = /<span\s[^>]*class="selectable"[^>]*>[\s\S]*?<\/span>/gi;

  const seenIds = new Set();
  let count = 0;

  return html.replace(selectableRe, (match) => {
    const { id, text, inner } = parseSelectableSpan(match);
    const normalizedId = normalizeSelectableId(id);
    const valid =
      normalizedId &&
      isValidExpandableText(text) &&
      !seenIds.has(normalizedId) &&
      count < 4;

    if (!valid) return text;

    count += 1;
    seenIds.add(normalizedId);
    return `<span class="selectable" data-id="${normalizedId}" tabindex="0" role="button" aria-pressed="false">${inner}</span>`;
  });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages, detailContext } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }

    let transcript = messages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    if (detailContext?.title) {
      const typeLabels = {
        facts: "Facts",
        evidence: "Evidence",
        risks: "Risks",
        action: "Action steps",
      };
      const types = detailContext.types?.length
        ? detailContext.types.map((t) => typeLabels[t] || t).join(", ")
        : typeLabels[detailContext.type] || detailContext.type || "Detail";
      transcript += `\n\n[The user's latest message is a follow-up asking to go deeper on this idea: "${detailContext.title}" (${types}). Build on prior context and mark 2–4 new expandable phrases if relevant.]`;
    }

    const html = validateExpandables(sanitizeHtml(await complete(CHAT_SYSTEM, transcript)));
    res.json({ html });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Chat request failed" });
  }
});

app.post("/api/detail", async (req, res) => {
  try {
    const { ideaId, ideaTitle, detailType, depthLabel, depthIndex, conversation, priorLevels } =
      req.body;
    if (!ideaTitle || !detailType || depthLabel == null) {
      return res.status(400).json({ error: "ideaTitle, detailType, and depthLabel required" });
    }

    const depthIdx = Number(depthIndex) || 0;
    const context = Array.isArray(conversation)
      ? conversation.map((m) => `${m.role}: ${m.content}`).join("\n")
      : "";

    const system = buildDetailSystem(SCENARIO, detailType);
    const prompt = buildDetailUserPrompt({
      ideaTitle,
      ideaId,
      detailType,
      depthIndex: depthIdx,
      conversation: context,
      priorLevels: priorLevels || {},
    });

    const body = await complete(system, prompt, {
      temperature: 0.35,
      maxTokens: DEPTH_MAX_TOKENS[depthIdx] ?? 80,
    });
    res.json({ body, label: depthLabel });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Detail request failed" });
  }
});

app.listen(port, () => {
  console.log(`Granularity running at http://localhost:${port}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn("Warning: OPENAI_API_KEY not set — copy .env.example to .env");
  }
});
