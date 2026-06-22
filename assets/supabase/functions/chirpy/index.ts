// Chirp / Chirpy Edge Function
// Backend real para Chirpy usando OpenAI Responses API.
//
// Secrets necesarios en Supabase:
//   OPENAI_API_KEY=sk-...
//
// Opcional:
//   CHIRPY_MODEL=gpt-4.1-mini
//
// Deploy:
//   supabase functions deploy chirpy
//   supabase secrets set OPENAI_API_KEY=sk-...
//   supabase secrets set CHIRPY_MODEL=gpt-4.1-mini

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("CHIRPY_MODEL") || "gpt-4.1-mini";

    const payload = await req.json().catch(() => ({}));
    const message = String(payload.message || "").trim();
    const page = String(payload.page || "desconocida");
    const profile = payload.profile || null;

    if (!message) {
      return json({ reply: "Preguntame algo de Chirp y te ayudo." });
    }

    if (!apiKey) {
      return json({
        reply: fallbackReply(message),
        mode: "fallback"
      });
    }

    const instructions = [
      "Sos Chirpy, el asistente oficial de ayuda de Chirp.",
      "Respondé siempre en español rioplatense, claro, directo y con onda.",
      "Chirp es una red social con Chirps, hashtags, usuarios, perfiles públicos, seguidores, seguidos, bloqueos, mensajes privados, multimedia, ajustes, soporte y privacidad.",
      "No inventes datos internos ni prometas acciones que no podés ejecutar.",
      "Si el usuario pregunta cómo hacer algo, respondé con pasos concretos.",
      "No uses markdown excesivo. Respuestas cortas, útiles y accionables."
    ].join("\n");

    const input = [
      {
        role: "system",
        content: instructions
      },
      {
        role: "user",
        content: [
          `Página actual: ${page}`,
          `Usuario actual: ${profile?.username || "desconocido"}`,
          `Nombre visible: ${profile?.display_name || "desconocido"}`,
          "",
          `Pregunta: ${message}`
        ].join("\n")
      }
    ];

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input,
        max_output_tokens: 420,
        temperature: 0.45
      })
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text().catch(() => "");
      console.error("OpenAI error:", openaiResponse.status, errText);
      return json({
        reply: fallbackReply(message),
        mode: "fallback",
        error: `openai_${openaiResponse.status}`
      });
    }

    const data = await openaiResponse.json();

    const reply =
      data?.output_text ||
      data?.output?.flatMap((item) => item?.content || [])
        ?.map((content) => content?.text || "")
        ?.filter(Boolean)
        ?.join("\n")
        ?.trim() ||
      fallbackReply(message);

    return json({ reply, mode: "openai" });
  } catch (error) {
    console.error("Chirpy function error:", error);
    return json({
      reply: "Me trabé un toque. Probá de nuevo o escribí a soporte desde Chirp.",
      mode: "error"
    }, 200);
  }
});

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function fallbackReply(message) {
  const clean = String(message || "").trim();
  return `Puedo ayudarte con “${clean}”. Todavía falta configurar OPENAI_API_KEY en la Edge Function, pero en Chirp revisá: Home para publicar, Explorar para hashtags y usuarios, Mensajes para DM, Perfil para tu perfil público y Ajustes para cuenta, email, contraseña y privacidad.`;
}
