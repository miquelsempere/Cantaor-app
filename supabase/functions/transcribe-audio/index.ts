import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { track_id } = await req.json();
    if (!track_id) {
      return new Response(JSON.stringify({ error: "track_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Mark as processing
    await supabase
      .from("cante_tracks")
      .update({ lyrics_status: "processing" })
      .eq("id", track_id);

    // Fetch track to get audio_url
    const { data: track, error: trackError } = await supabase
      .from("cante_tracks")
      .select("audio_url")
      .eq("id", track_id)
      .maybeSingle();

    if (trackError || !track) {
      await supabase
        .from("cante_tracks")
        .update({ lyrics_status: "error" })
        .eq("id", track_id);
      return new Response(JSON.stringify({ error: "Track not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download audio from storage URL
    const audioResponse = await fetch(track.audio_url);
    if (!audioResponse.ok) {
      await supabase
        .from("cante_tracks")
        .update({ lyrics_status: "error" })
        .eq("id", track_id);
      return new Response(JSON.stringify({ error: "Failed to fetch audio file" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const audioBlob = await audioResponse.blob();
    const contentType = audioResponse.headers.get("content-type") || "audio/mpeg";

    // Determine extension from content-type
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
        .from("cante_tracks")
        .update({ lyrics_status: "error" })
        .eq("id", track_id);
      return new Response(JSON.stringify({ error: "Groq API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call Groq Whisper API (compatible with OpenAI format)
    const formData = new FormData();
    formData.append("file", new File([audioBlob], `audio.${ext}`, { type: contentType }));
    formData.append("model", "whisper-large-v3");
    formData.append("language", "es");
    formData.append("response_format", "text");

    const whisperResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}` },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errText = await whisperResponse.text();
      console.error("Groq Whisper API error:", errText);
      await supabase
        .from("cante_tracks")
        .update({ lyrics_status: "error" })
        .eq("id", track_id);
      return new Response(JSON.stringify({ error: "Transcription failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lyrics = await whisperResponse.text();

    // Save lyrics to DB
    await supabase
      .from("cante_tracks")
      .update({ lyrics: lyrics.trim(), lyrics_status: "done" })
      .eq("id", track_id);

    return new Response(JSON.stringify({ lyrics: lyrics.trim() }), {
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
