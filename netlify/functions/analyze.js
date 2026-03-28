const https = require("https");

exports.handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS,GET",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: cors, body: "" };
  if (event.httpMethod === "GET") return { statusCode: 200, headers: cors, body: JSON.stringify({ status: "OK!" }) };

  let prompt = "";
  try {
    const b = JSON.parse(event.body || "{}");
    prompt = b?.contents?.[0]?.parts?.[0]?.text || "";
  } catch (e) {}

  // ✅ Environment variables se keys lo (safe)
  const GROQ_KEYS = [process.env.GROQ_API_KEY];
  const OPENAI_KEYS = [process.env.OPENAI_API_KEY];
  const GEMINI_KEYS = [process.env.GEMINI_API_KEY];

  const GROQ_MODELS = ["llama-3.1-8b-instant", "llama3-8b-8192", "gemma2-9b-it", "mixtral-8x7b-32768"];
  const OPENAI_MODELS = ["gpt-4o-mini", "gpt-3.5-turbo"];
  const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-8b"];

  const skip = [429, 503, 401, 403, 404];

  function req(host, path, headers, body) {
    return new Promise((res, rej) => {
      const r = https.request({ hostname: host, path, method: "POST", headers }, (_r) => {
        let d = "";
        _r.on("data", c => d += c);
        _r.on("end", () => res({ s: _r.statusCode, b: d }));
      });
      r.on("error", rej);
      r.write(body);
      r.end();
    });
  }

  function toGemini(b) {
    try {
      const t = JSON.parse(b)?.choices?.[0]?.message?.content || "";
      return JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] });
    } catch { return null; }
  }

  // GROQ
  for (const k of GROQ_KEYS) {
    if (!k) continue;
    for (const m of GROQ_MODELS) {
      try {
        const body = JSON.stringify({ model: m, messages: [{ role: "user", content: prompt }], temperature: 0.7, max_tokens: 2048 });
        const r = await req("api.groq.com", "/openai/v1/chat/completions", { "Content-Type": "application/json", "Authorization": "Bearer " + k, "Content-Length": Buffer.byteLength(body) }, body);
        if (r.s === 200) { const f = toGemini(r.b); if (f) return { statusCode: 200, headers: cors, body: f }; }
        if (skip.includes(r.s)) continue;
      } catch { continue; }
    }
  }

  // OPENAI
  for (const k of OPENAI_KEYS) {
    if (!k) continue;
    for (const m of OPENAI_MODELS) {
      try {
        const body = JSON.stringify({ model: m, messages: [{ role: "user", content: prompt }], temperature: 0.7, max_tokens: 2048 });
        const r = await req("api.openai.com", "/v1/chat/completions", { "Content-Type": "application/json", "Authorization": "Bearer " + k, "Content-Length": Buffer.byteLength(body) }, body);
        if (r.s === 200) { const f = toGemini(r.b); if (f) return { statusCode: 200, headers: cors, body: f }; }
        if (skip.includes(r.s)) continue;
      } catch { continue; }
    }
  }

  // GEMINI
  for (const k of GEMINI_KEYS) {
    if (!k) continue;
    for (const m of GEMINI_MODELS) {
      try {
        const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 2048 } });
        const r = await req("generativelanguage.googleapis.com", `/v1beta/models/${m}:generateContent?key=${k}`, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, body);
        if (r.s === 200) return { statusCode: 200, headers: cors, body: r.b };
        if (skip.includes(r.s)) continue;
      } catch { continue; }
    }
  }

  return { statusCode: 503, headers: cors, body: JSON.stringify({ error: { message: "Thodi der baad retry karo." } }) };
};
