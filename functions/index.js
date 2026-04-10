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

    const { sessions, profile = {} } = req.body;

    if (!sessions || sessions.length === 0) {
      res.status(400).json({ error: "No session data provided" });
      return;
    }

    // Build profile context
    const profileLines = [];
    if (profile.name) profileLines.push(`Name: ${profile.name}`);
    if (profile.age) profileLines.push(`Age: ${profile.age}`);
    if (profile.weight) profileLines.push(`Weight: ${profile.weight} lbs`);
    if (profile.height) profileLines.push(`Height: ${profile.height}`);
    if (profile.goal) profileLines.push(`Primary goal: ${profile.goal.replace('_', ' ')}`);
    if (profile.equipment?.length) profileLines.push(`Equipment: ${profile.equipment.join(', ')}`);
    if (profile.activities?.length) {
      const activityLines = profile.activities.map(a => {
        const days = profile.trainingDays?.[a];
        return days ? `${a} (${days}x/week)` : a;
      });
      profileLines.push(`Trains: ${activityLines.join(', ')}`);
    }
    const profileContext = profileLines.length > 0
      ? profileLines.join('\n')
      : 'No profile set up yet — give general advice.';

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

    const prompt = `You are a personal fitness and BJJ coach. Here is your athlete's profile:

${profileContext}

The app offers "The Daredevil Plan" — a 2-day dumbbell home workout split:
- Day 1 (Push/Legs): Goblet Squat, Dumbbell Floor Press, Dumbbell Shoulder Press, Push Up, Dumbbell Lunge, Overhead Tricep Extension, Dead Bug
- Day 2 (Pull/Hinge): Romanian Deadlift, Dumbbell Row, Pull Up, Bicep Curl, Lateral Raise, Dumbbell Rear Delt Fly, Russian Twist

Here are their recent training sessions:

${sessionSummary}

Based on their profile and session data, give 3-4 short, specific, actionable coaching insights. Focus on:
- Progressive overload suggestions (when to increase weight, reps, or sets)
- Recovery and training balance across all their activities
- Any patterns you notice in their BJJ technique or lifting progress
- Advice tailored to their specific goal and equipment

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
