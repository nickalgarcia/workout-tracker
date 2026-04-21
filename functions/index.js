const { onRequest } = require("firebase-functions/v2/https");
const https = require("https");

exports.getCoachingAdvice = onRequest(
  {
    cors: true,
    secrets: ["ANTHROPIC_API_KEY"]
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const { sessions, profile = {}, messages = [] } = req.body;

    if (!sessions || sessions.length === 0) {
      res.status(400).json({ error: "No session data provided" });
      return;
    }

    // Build profile context
    const profileLines = [];
    if (profile.name) profileLines.push(`Name: ${profile.name}`);
    if (profile.gender && profile.gender !== "prefer_not") profileLines.push(`Gender: ${profile.gender}`);
    if (profile.age) profileLines.push(`Age: ${profile.age}`);
    if (profile.weight) profileLines.push(`Weight: ${profile.weight} lbs`);
    if (profile.height) profileLines.push(`Height: ${profile.height}`);
    if (profile.goal) profileLines.push(`Primary goal: ${profile.goal.replace("_", " ")}`);
    if (profile.equipment && profile.equipment.length) profileLines.push(`Equipment: ${profile.equipment.join(", ")}`);
    if (profile.dumbbellMax) profileLines.push(`Heaviest dumbbells available: ${profile.dumbbellMax} lbs — do NOT suggest increasing weight beyond this`);
    if (profile.activities && profile.activities.length) {
      const activityLines = profile.activities.map(a => {
        const days = profile.trainingDays && profile.trainingDays[a];
        return days ? `${a} (${days}x/week)` : a;
      });
      profileLines.push(`Trains: ${activityLines.join(", ")}`);
    }
    const profileContext = profileLines.length > 0
      ? profileLines.join("\n")
      : "No profile set up yet — give general advice.";

    // Build session summary
    const sessionSummary = sessions.map(s => {
      if (s.type === "lifting") {
        const exercises = (s.exercises || []).map(ex => {
          const sets = (ex.sets || []).map(set =>
            `${set.reps} reps @ ${set.weight} lbs`
          ).join(", ");
          return `  - ${ex.name}: ${sets}`;
        }).join("\n");
        return `Lifting session on ${s.date} (${s.planLabel || "Free"}):\n${exercises}`;
      } else if (s.type === "bjj") {
        const techniques = (s.techniques || []).map(t =>
          typeof t === "string" ? t : t.name
        ).join(", ");
        return `BJJ session on ${s.date}: ${s.duration} mins, ${s.sessionType}. Techniques: ${techniques || "none logged"}`;
      } else if (s.type === "yoga") {
        return `Yoga session on ${s.date}: ${s.duration} mins, ${s.style} style.${s.notes ? " Notes: " + s.notes : ""}`;
      } else if (s.type === "cardio") {
        const dist = s.distance ? `, ${s.distance} ${s.distanceUnit}` : "";
        return `Cardio session on ${s.date}: ${s.duration} mins, ${s.cardioType}${dist}.${s.notes ? " Notes: " + s.notes : ""}`;
      } else if (s.type === "pilates") {
        const focus = s.focus ? s.focus.replace("_", " ") : "";
        return `Pilates session on ${s.date}: ${s.duration} mins, ${s.style} style, focus: ${focus}.${s.notes ? " Notes: " + s.notes : ""}`;
      }
      return "";
    }).filter(Boolean).join("\n\n");

    // System prompt with full context
    const systemPrompt = `You are a personal fitness and BJJ coach. Here is your athlete's profile:

${profileContext}

The app offers "The Daredevil Plan" — a 2-day dumbbell home workout split:
- Day 1 (Push/Legs): Goblet Squat, Dumbbell Floor Press, Dumbbell Shoulder Press, Push Up, Dumbbell Lunge, Overhead Tricep Extension, Dead Bug
- Day 2 (Pull/Hinge): Romanian Deadlift, Dumbbell Row, Pull Up, Bicep Curl, Lateral Raise, Dumbbell Rear Delt Fly, Russian Twist

Here are their recent training sessions:

${sessionSummary}

You are having a coaching conversation with this athlete. Be direct, practical, and specific. Keep responses concise — 2-4 sentences per point. When giving the initial analysis, format as a numbered list. For follow-up questions, respond conversationally.`;

    // Build messages array — initial analysis or follow-up chat
    let apiMessages;
    if (messages.length === 0) {
      // Initial analysis request
      apiMessages = [{
        role: "user",
        content: "Based on my profile and recent sessions, give me 3-4 short, specific, actionable coaching insights. Focus on progressive overload, recovery balance, and any patterns you notice. Format as a numbered list."
      }];
    } else {
      // Ongoing chat — pass full history
      apiMessages = messages;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    const requestBody = JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: systemPrompt,
      messages: apiMessages
    });

    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
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

    const text = anthropicResponse.content && anthropicResponse.content[0]
      ? anthropicResponse.content[0].text
      : "No advice available.";
    res.json({ advice: text });
  }
);
