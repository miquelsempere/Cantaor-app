import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function correctLyricsWithWebSearch(
  rawLyrics: string,
  title: string,
  palo: string,
  groqKey: string
): Promise<string> {
  const prompt = `Eres un experto en flamenco y en la transcripción de cante jondo.
Se te proporciona la transcripción automática (posiblemente con errores) de un cante flamenco.

Título del cante: "${title}"
Palo flamenco: "${palo}"
Transcripción con posibles errores:
"""
${rawLyrics}
"""

Instrucciones:
1. Busca en internet si existe esta letra publicada correctamente (en webs de flamenco, cancioneros, letras de flamenco, etc.)
2. Si encuentras la letra correcta online, úsala para corregir las palabras que Whisper no ha transcrito bien
3. Corrige también errores ortográficos, palabras del argot flamenco, vocablos en caló o gitano que puedan estar mal escritos
4. Si no encuentras la letra exacta online, corrige igualmente usando tu conocimiento del flamenco
5. Formatea el resultado así: cada verso en una línea separada, y una línea en blanco entre cada copla o estrofa
6. Respeta la estructura natural del cante (coplas, estribillos, etc.)
7. Devuelve ÚNICAMENTE el texto de la letra corregida y formateada, sin explicaciones ni comentarios adicionales`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "compound-beta",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Groq correction API error:", errText);
    return rawLyrics;
  }

  const data = await response.json();
  const corrected = data.choices?.[0]?.message?.content?.trim();
  return corrected || rawLyrics;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { track_id, target_table } = await req.json();
    if (!track_id) {
      return new Response(JSON.stringify({ error: "track_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Supports 'cante_tracks' (default) and 'cante_voices'
    const table = target_table === "cante_voices" ? "cante_voices" : "cante_tracks";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Mark as processing
    await supabase
      .from(table)
      .update({ lyrics_status: "processing" })
      .eq("id", track_id);

    // Fetch record to get audio_url, title and palo
    const { data: track, error: trackError } = await supabase
      .from(table)
      .select("audio_url, title, palo")
      .eq("id", track_id)
      .maybeSingle();

    if (trackError || !track) {
      await supabase
        .from(table)
        .update({ lyrics_status: "error" })
        .eq("id", track_id);
      return new Response(JSON.stringify({ error: "Record not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download audio from storage URL
    const audioResponse = await fetch(track.audio_url);
    if (!audioResponse.ok) {
      await supabase
        .from(table)
        .update({ lyrics_status: "error" })
        .eq("id", track_id);
      return new Response(JSON.stringify({ error: "Failed to fetch audio file" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const audioBlob = await audioResponse.blob();
    const contentType = audioResponse.headers.get("content-type") || "audio/mpeg";

    const extMap: Record<string, string> = {
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/wav": "wav",
      "audio/wave": "wav",
      "audio/ogg": "ogg",
      "audio/flac": "flac",
      "audio/aac": "m4a",
      "audio/mp4": "m4a",
    };
    const ext = extMap[contentType.split(";")[0].trim()] || "mp3";

    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!groqKey) {
      await supabase
        .from(table)
        .update({ lyrics_status: "error" })
        .eq("id", track_id);
      return new Response(JSON.stringify({ error: "Groq API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Transcribe with Groq Whisper (verbose_json for word timestamps)
    const formData = new FormData();
    formData.append("file", new File([audioBlob], `audio.${ext}`, { type: contentType }));
    formData.append("model", "whisper-large-v3");
    formData.append("language", "es");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "word");

    const whisperResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}` },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errText = await whisperResponse.text();
      console.error("Groq Whisper API error:", errText);
      await supabase
        .from(table)
        .update({ lyrics_status: "error" })
        .eq("id", track_id);
      return new Response(JSON.stringify({ error: "Transcription failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const whisperData = await whisperResponse.json();

    // Extract plain text and word-level timestamps
    const rawLyrics: string = whisperData.text || "";

    // Build flat word array from segments[].words[]
    type WordEntry = { start: number; end: number; word: string };
    const wordsArray: WordEntry[] = [];
    for (const segment of (whisperData.segments || [])) {
      for (const w of (segment.words || [])) {
        wordsArray.push({ start: w.start, end: w.end, word: w.word });
      }
    }

    // Step 2: Correct and format lyrics using compound-beta
    const lyrics = await correctLyricsWithWebSearch(
      rawLyrics.trim(),
      track.title,
      track.palo,
      groqKey
    );

    // Save corrected lyrics and word timestamps
    await supabase
      .from(table)
      .update({
        lyrics,
        lyrics_status: "done",
        lyrics_json: wordsArray.length > 0 ? wordsArray : null,
      })
      .eq("id", track_id);

    return new Response(JSON.stringify({ lyrics, words: wordsArray.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
