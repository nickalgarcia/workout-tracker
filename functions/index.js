const { onRequest } = require("firebase-functions/v2/https");
const https = require("https");

const MODEL = "claude-opus-5";
const MAX_TOKENS = 8000;

// ── Context building ───────────────────────────────────────────────────

function profileBlock(profile) {
  const p = profile || {};
  const lines = [
    p.name && `Name: ${p.name}`,
    p.startedTraining && `Started training: ${p.startedTraining}`,
    p.belt && `Belt: ${p.belt}`,
    p.style && `Style: ${p.style}`,
    p.bodyType && `Build: ${p.bodyType}`,
    p.goals && `Goals: ${p.goals}`,
    p.weeklyTargets &&
      `Weekly targets: ${p.weeklyTargets.mat} mat sessions, ${p.weeklyTargets.support} support sessions`,
  ].filter(Boolean);
  return lines.join("\n") || "No profile.";
}

function focusBlock(focus) {
  if (!focus || !focus.title) {
    return "No focus is set right now. That is itself worth noticing — the first priority below cannot be assessed without one.";
  }
  const rate = focus.total > 0
    ? `attempted in ${focus.attempted} of ${focus.total} logged sessions`
    : "no sessions logged against it yet";
  return [
    `Title: ${focus.title}`,
    focus.description && `Description: ${focus.description}`,
    `Started: ${focus.startedAt} (week ${focus.weeks})`,
    `Attempt rate: ${rate}`,
  ].filter(Boolean).join("\n");
}

function sessionsBlock(sessions) {
  if (!sessions || sessions.length === 0) return "No mat sessions logged.";
  return sessions.map(s => {
    const bits = [`${s.date} — ${s.minutes} min`];
    if (s.rounds) bits.push(`${s.rounds} rounds`);
    if (s.sessionType) bits.push(s.sessionType);
    if (s.readiness) bits.push(`readiness ${s.readiness}/5`);
    if (s.focusAttempted) bits.push(`focus: ${s.focusAttempted}`);

    const detail = [];
    if (s.positions && s.positions.length) detail.push(`  positions: ${s.positions.join(", ")}`);
    if (s.worked) detail.push(`  worked: ${s.worked}`);
    if (s.beat) detail.push(`  beat me: ${s.beat}`);
    if (s.techniques && s.techniques.length) {
      detail.push(`  techniques: ${s.techniques.map(t => (typeof t === "string" ? t : t.name)).join(", ")}`);
    }
    if (s.notes) detail.push(`  notes: ${s.notes}`);

    return [bits.join(" · "), ...detail].join("\n");
  }).join("\n\n");
}

function themesBlock(themes) {
  if (!themes || themes.length === 0) {
    return "Not enough repeated wording in the problem log to group themes yet.";
  }
  return themes.map(t => `${t.phrase} — ${t.count} times`).join("\n");
}

function supportBlock(support) {
  const s = support || {};
  return [
    `Lifting sessions in the last 30 days: ${s.lifting ?? 0}`,
    `Cardio sessions in the last 30 days: ${s.cardio ?? 0}`,
    s.lastSupportDate
      ? `Most recent support session: ${s.lastSupportDate}`
      : "No support session on record.",
  ].join("\n");
}

function coverageBlock(vocabulary, sessions) {
  if (!vocabulary || vocabulary.length === 0) return "";
  const counts = new Map(vocabulary.map(p => [p, 0]));
  (sessions || []).forEach(s => (s.positions || []).forEach(p => {
    if (counts.has(p)) counts.set(p, counts.get(p) + 1);
  }));
  return [...counts.entries()]
    .map(([p, n]) => `${p}: ${n}`)
    .join("\n");
}

function buildSystemPrompt(body) {
  const { profile, focus, matSessions, support30, themes, positionVocabulary } = body;

  return `You are a no-gi jiu-jitsu coach. Your athlete is a recreational hobbyist who started training in January 2025. He is smaller and lighter than most of his training partners. He trains for fun, fitness and community — not competition — and has not asked to compete.

## Athlete

${profileBlock(profile)}

## Current focus

${focusBlock(focus)}

## Last ${(matSessions || []).length} mat sessions, most recent first

${sessionsBlock(matSessions)}

## Recurring themes in the problem log

Counted by literal repeated wording across every "what beat me" entry. The counts are for exact phrases, so they undercount — two entries describing the same problem in different words do not group.

${themesBlock(themes)}

## Position coverage across the sessions above

${coverageBlock(positionVocabulary, matSessions)}

## Support work

${supportBlock(support30)}

---

# How to coach him

Work through these in order. Earlier priorities matter more; do not lead with a later one because it is easier to say something about.

1. **Is he getting to his stated focus?** This is the single most important question. Look at the attempt rate and at which sessions he did and did not reach it. If the rate is low, the useful question is what is getting in the way, not whether he should try harder.
2. **What does the problem log say he should drill next?** The "what beat me" entries are his curriculum. Name the specific problem and the specific thing to drill for it.
3. **Position gaps.** Which positions in the vocabulary is he never tagging? A position at zero over this many sessions is a gap worth naming — but check whether it is a real gap or just how his gym runs class before making it a priority.
4. **Recovery signals.** Read readiness alongside session density. Several low-readiness sessions close together, or readiness trending down, means something. Say so plainly.
5. **Support work consistency.** Mention this last, and frame it only as what supports his mat game — grip, posterior chain, and holding structure against bigger partners. Never as a goal of its own.

# Rules

- **Reference his actual sessions and dates.** Say "on 2026-03-14 you wrote that you couldn't break posture" — not "you seem to struggle with posture." Every observation must be traceable to something in the data above. If the data does not support a point, do not make it.
- **Never give advice that would apply to any jiu-jitsu student.** Generic advice is worse than no advice here; he has a log precisely so he does not have to read generalities.
- **Do not push competition, and do not push intensity he has not asked for.** He trains for fun and community. Suggestions should fit a recreational schedule.
- **Do not tell him to be more consistent** unless the data shows a real drop, and if it does, say what the data shows rather than exhorting him.
- Being smaller than his partners is context for technique selection — structure, frames, angles, not strength battles. It is not a limitation to sympathise with.
- **End with two or three concrete things to try in his next session.** Concrete means a named position, entry or drill he could walk in and do. Not a lecture, not a training philosophy.

Keep the whole response short enough to read on a phone between rounds.`;
}

// ── Anthropic call ─────────────────────────────────────────────────────

function callAnthropic(systemPrompt, messages, apiKey) {
  const requestBody = JSON.stringify({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages,
    // Adaptive thinking: the priority ordering above is a reasoning task, not
    // a lookup. Reasoning is not shown to the user, so it stays omitted.
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    // Route around a policy decline rather than returning nothing.
    fallbacks: "default",
  });

  const options = {
    hostname: "api.anthropic.com",
    path: "/v1/messages",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "server-side-fallback-2026-07-01",
      "Content-Length": Buffer.byteLength(requestBody),
    },
  };

  return new Promise((resolve, reject) => {
    const apiReq = https.request(options, (apiRes) => {
      let data = "";
      apiRes.on("data", chunk => (data += chunk));
      apiRes.on("end", () => {
        try {
          resolve({ status: apiRes.statusCode, body: JSON.parse(data) });
        } catch (e) {
          reject(new Error(`Could not parse Anthropic response (HTTP ${apiRes.statusCode})`));
        }
      });
    });
    apiReq.on("error", reject);
    apiReq.write(requestBody);
    apiReq.end();
  });
}

/** First text block, skipping thinking blocks. */
function firstText(content) {
  if (!Array.isArray(content)) return null;
  const block = content.find(b => b.type === "text");
  return block ? block.text : null;
}

// ── Handler ────────────────────────────────────────────────────────────

exports.getCoachingAdvice = onRequest(
  {
    cors: true,
    secrets: ["ANTHROPIC_API_KEY"],
    timeoutSeconds: 120,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const body = req.body || {};
    const { matSessions = [], messages = [] } = body;

    if (matSessions.length === 0 && messages.length === 0) {
      res.status(400).json({ error: "No mat sessions provided" });
      return;
    }

    // The function is stateless, so the client resends the full context on
    // every chat turn and the system prompt is rebuilt each time.
    const systemPrompt = buildSystemPrompt(body);

    const apiMessages = messages.length > 0 ? messages : [{
      role: "user",
      content:
        "Review my training and coach me. Work through the priorities in order, " +
        "reference my actual sessions and dates, and finish with two or three " +
        "concrete things to try next session.",
    }];

    try {
      const { status, body: result } = await callAnthropic(
        systemPrompt, apiMessages, process.env.ANTHROPIC_API_KEY
      );

      if (status !== 200) {
        console.error("Anthropic error", status, result);
        res.status(502).json({ error: result?.error?.message || "Upstream error" });
        return;
      }

      // Always check stop_reason before reading content.
      if (result.stop_reason === "refusal") {
        console.warn("Refused", result.stop_details);
        res.status(200).json({
          advice: "The coach declined to answer that one. Try rephrasing the question.",
        });
        return;
      }

      const text = firstText(result.content);
      res.json({ advice: text || "No advice available." });
    } catch (e) {
      console.error(e);
      res.status(502).json({ error: "Could not reach the coach." });
    }
  }
);
