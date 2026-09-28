/**
 * AlphaMind — Supabase Edge Function: ai-signal
 * =====================================================
 * یہ فنکشن Gemini اور Groq کو سرور سائیڈ پر کال کرتا ہے۔
 * API Keys یہاں Deno.env سے آتی ہیں (کبھی براؤزر میں نہیں جاتیں)۔
 *
 * صرف لاگ ان یوزر ہی اسے کال کر سکتا ہے — Authorization header
 * میں موجود Supabase session token چیک ہوتا ہے۔
 *
 * ⚠️ نوٹ: یہ فائل خود سے deploy نہیں ہوتی — نیچے چیٹ میں دیے گئے
 * manual steps کے مطابق آپ کو Supabase CLI سے deploy کرنا ہوگا۔
 * =====================================================
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const TIMEOUT_MS = 20000;

// ─────────────────────────────────────────────
// CORS — عوامی طور پر کھلا رکھا ہے کیونکہ اصل حفاظت
// JWT (لاگ ان چیک) سے ہو رہی ہے، origin سے نہیں۔
// چاہیں تو بعد میں یہاں اپنا اصل ڈومین لاک کر سکتے ہیں۔
// ─────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

function parseJSON(text: string) {
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

async function callGemini(prompt: string) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("no_gemini_key");

  const res = await withTimeout(
    fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }),
    TIMEOUT_MS
  );

  const d = await res.json();
  if (!res.ok) {
    const msg = d?.error?.message || `HTTP ${res.status}`;
    throw new Error(`gemini_${res.status}: ${msg}`);
  }

  const text = d?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("empty_gemini_response");
  return parseJSON(text);
}

async function callGroq(prompt: string) {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("no_groq_key");

  const res = await withTimeout(
    fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a professional crypto trading analyst. Always respond with valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    }),
    TIMEOUT_MS
  );

  const d = await res.json();
  if (!res.ok) {
    const msg = d?.error?.message || `HTTP ${res.status}`;
    throw new Error(`groq_${res.status}: ${msg}`);
  }

  const text = d?.choices?.[0]?.message?.content;
  if (!text) throw new Error("empty_groq_response");
  return parseJSON(text);
}

Deno.serve(async (req: Request) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ── 1. یوزر لاگ ان ہے یا نہیں چیک کریں ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "missing_auth_header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Prompt نکالیں ──
    const body = await req.json().catch(() => ({}));
    const prompt = body?.prompt;
    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "missing_prompt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3. Gemini پہلے، ناکام ہو تو Groq ──
    let data;
    let providerUsed = "gemini";
    try {
      data = await callGemini(prompt);
    } catch (err) {
      console.warn("[ai-signal] Gemini failed:", (err as Error).message, "— trying Groq…");
      providerUsed = "groq";
      data = await callGroq(prompt);
    }

    return new Response(JSON.stringify({ data, provider: providerUsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[ai-signal] Failed:", (err as Error).message);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "internal_error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});