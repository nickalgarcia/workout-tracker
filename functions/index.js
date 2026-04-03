const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const https = require("https");

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

exports.getCoachingAdvice = onRequest(
  { secrets: [ANTHROPIC_API_KEY], cors: true },
  async (req, res) => {
    // Only allow POST
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const { sessions } = req.body;

    if (!sessions || sessions.length === 0) {
      res.status(400).json({ error: "No session data provided" });
      return;
    }

    // Build a summary of sessions to send to Claude
    const sessionSummary = sessions.map(s => {
      if (s.type === "lifting") {
        const exercises = (s.exercises || []).map(ex => {
          const sets = (ex.sets || []).map(set =>
            `${set.reps} reps @ ${set.weight} lbs`
          ).join(", ");
          return `  - ${ex.name}: ${sets}`;
        }).join("\n");
        return `Lifting session on ${s.date}:\n${exercises}`;
      } else {
        const techniques = (s.techniques || []).map(t =>
          typeof t === "string" ? t : t.name
        ).join(", ");
        return `BJJ session on ${s.date}: ${s.duration} mins, ${s.sessionType}. Techniques: ${techniques || "none logged"}`;
      }
    }).join("\n\n");

    const prompt = `You are a personal fitness and BJJ coach. Your athlete is following the "Daredevil Plan" — a 2-day dumbbell home workout split:
- Day 1 (Push/Legs): Goblet Squat, Dumbbell Floor Press, Dumbbell Shoulder Press, Push Up, Dumbbell Lunge
- Day 2 (Pull/Hinge): Romanian Deadlift, Dumbbell Row, Pull Up, Bicep Curl, Lateral Raise

They have dumbbells from 5-25 lbs, train BJJ twice a week, and are 38 years old. Recovery matters.

Here are their recent training sessions:

${sessionSummary}

Based on this data, give me 3-4 short, specific, actionable coaching insights. Focus on:
- Progressive overload suggestions (when to increase weight, reps, or sets based on what you see)
- Recovery and training balance between lifting and BJJ
- BJJ technique patterns you notice
- Any other observations relevant to their progress

Keep each insight to 2-3 sentences max. Be direct and practical, not generic. Format as a simple numbered list.`;

    // Call Anthropic API
    const requestBody = JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }]
    });

    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY.value(),
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(requestBody)
      }
    };

    const anthropicResponse = await new Promise((resolve, reject) => {
      const apiReq = https.request(options, (apiRes) => {
        let data = "";
        apiRes.on("data", chunk => data += chunk);
        apiRes.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("Failed to parse Anthropic response"));
          }
        });
      });
      apiReq.on("error", reject);
      apiReq.write(requestBody);
      apiReq.end();
    });

    const text = anthropicResponse.content?.[0]?.text || "No advice available.";
    res.json({ advice: text });
  }
);
