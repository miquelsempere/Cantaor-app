/*
 * Supabase client configuration for the flamenco guitar practice app
 */

import { createClient } from '@supabase/supabase-js';

// These environment variables should be set in your .env file
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

// Create and export the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Auth helpers
export const authAPI = {
  async signUp(email, password) {
    const redirectTo = `${window.location.origin}/confirm.html`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  },
};

// Helper functions for cante tracks operations
export const canteTracksAPI = {
  /**
   * Get all tracks for a specific palo (flamenco style)
   * @param {string} palo - The flamenco palo/style to filter by
   * @returns {Promise<Array>} Array of cante tracks
   */
  async getTracksByPalo(palo) {
    const { data, error } = await supabase
      .from('cante_tracks')
      .select('*')
      .eq('palo', palo)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching tracks by palo:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Get all available palos from the palos table (always public, ordered)
   * @returns {Promise<Array>} Array of palo objects { nombre, free }
   */
  async getAvailablePalos() {
    const { data, error } = await supabase
      .from('palos')
      .select('nombre, free')
      .order('orden', { ascending: true });

    if (error) {
      console.error('Error fetching available palos:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Add a new cante track (for future admin functionality)
   * @param {Object} track - Track data
   * @param {string} track.palo - Flamenco palo/style
   * @param {string} track.title - Track title
   * @param {string} track.audio_url - URL to the audio file
   * @param {number} [track.duration] - Track duration in seconds
   * @returns {Promise<Object>} The created track
   */
  async addTrack(track) {
    const { data, error } = await supabase
      .from('cante_tracks')
      .insert([track])
      .select()
      .single();

    if (error) {
      console.error('Error adding track:', error);
      throw error;
    }

    return data;
  },

  /**
   * Get all tracks (for admin purposes)
   * @returns {Promise<Array>} Array of all cante tracks
   */
  async getAllTracks() {
    const { data, error } = await supabase
      .from('cante_tracks')
      .select('*')
      .order('palo', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching all tracks:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Upload an audio file to Supabase Storage
   * @param {File} file - The audio file to upload
   * @param {string} palo - The palo name (used for folder organization)
   * @returns {Promise<string>} The public URL of the uploaded file
   */
  async uploadAudio(file, palo) {
    const ext = file.name.split('.').pop();
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${palo}/${timestamp}_${safeName}`;

    const { error } = await supabase.storage
      .from('cante-audio')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error('Error uploading audio:', error);
      throw error;
    }

    const { data: urlData } = supabase.storage
      .from('cante-audio')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  },

  /**
   * Upload audio and create a track record in one step
   * @param {File} file - The audio file
   * @param {string} palo - The flamenco palo/style
   * @param {string} title - Track title
   * @param {number} [duration] - Duration in seconds
   * @returns {Promise<Object>} The created track
   */
  async uploadAndCreateTrack(file, palo, title, duration) {
    const audioUrl = await this.uploadAudio(file, palo);
    return this.addTrack({ palo, title, audio_url: audioUrl, duration: duration || 0 });
  },

  /**
   * Delete a track and its audio file from storage
   * @param {string} trackId - The track ID
   * @param {string} audioUrl - The audio URL to extract the storage path
   * @returns {Promise<void>}
   */
  async deleteTrack(trackId, audioUrl) {
    // Extract storage path from URL
    try {
      const url = new URL(audioUrl);
      const pathParts = url.pathname.split('/object/public/cante-audio/');
      if (pathParts.length > 1) {
        const filePath = pathParts[1];
        await supabase.storage.from('cante-audio').remove([filePath]);
      }
    } catch (e) {
      console.warn('Could not delete audio file from storage:', e);
    }

    const { error } = await supabase
      .from('cante_tracks')
      .delete()
      .eq('id', trackId);

    if (error) {
      console.error('Error deleting track:', error);
      throw error;
    }
  },

  async triggerTranscription(trackId) {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/transcribe-audio`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ track_id: trackId }),
      }
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Transcription request failed');
    }
    return response.json();
  },

  async getLyricsStatus(trackId) {
    const { data, error } = await supabase
      .from('cante_tracks')
      .select('lyrics, lyrics_status')
      .eq('id', trackId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },
};

// Ensayo mode API (dual-stream practice mode)
export const ensayoAPI = {
  async getPalmasBaseByPalo(palo) {
    const { data, error } = await supabase
      .from('palmas_bases')
      .select('*')
      .eq('palo', palo)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getCanteVoicesByPalo(palo) {
    const { data, error } = await supabase
      .from('cante_voices')
      .select('*')
      .eq('palo', palo)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getAllPalmasBases() {
    const { data, error } = await supabase
      .from('palmas_bases')
      .select('*')
      .order('palo', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getAllCanteVoices() {
    const { data, error } = await supabase
      .from('cante_voices')
      .select('*')
      .order('palo', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async uploadAndCreatePalmasBase(file, palo, title, bpm, beatsPerCompas) {
    const ext = file.name.split('.').pop();
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `palmas/${palo}/${timestamp}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('cante-audio')
      .upload(filePath, file, { contentType: file.type, upsert: false });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('cante-audio')
      .getPublicUrl(filePath);

    const { data, error } = await supabase
      .from('palmas_bases')
      .insert([{
        palo,
        title,
        audio_url: urlData.publicUrl,
        bpm: parseInt(bpm, 10),
        beats_per_compas: parseInt(beatsPerCompas, 10),
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async uploadAndCreateCanteVoice(file, palo, title) {
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `voices/${palo}/${timestamp}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('cante-audio')
      .upload(filePath, file, { contentType: file.type, upsert: false });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('cante-audio')
      .getPublicUrl(filePath);

    const { data, error } = await supabase
      .from('cante_voices')
      .insert([{ palo, title, audio_url: urlData.publicUrl }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deletePalmasBase(id, audioUrl) {
    try {
      const url = new URL(audioUrl);
      const pathParts = url.pathname.split('/object/public/cante-audio/');
      if (pathParts.length > 1) {
        await supabase.storage.from('cante-audio').remove([pathParts[1]]);
      }
    } catch (e) {
      console.warn('Could not delete audio file:', e);
    }
    const { error } = await supabase.from('palmas_bases').delete().eq('id', id);
    if (error) throw error;
  },

  async deleteCanteVoice(id, audioUrl) {
    try {
      const url = new URL(audioUrl);
      const pathParts = url.pathname.split('/object/public/cante-audio/');
      if (pathParts.length > 1) {
        await supabase.storage.from('cante-audio').remove([pathParts[1]]);
      }
    } catch (e) {
      console.warn('Could not delete audio file:', e);
    }
    const { error } = await supabase.from('cante_voices').delete().eq('id', id);
    if (error) throw error;
  },

  async getSamplesByPalo(palo) {
    const { data, error } = await supabase
      .from('palmas_samples')
      .select('*')
      .eq('palo', palo);

    if (error) throw error;
    return data || [];
  },

  async getAllPalmasSamples() {
    const { data, error } = await supabase
      .from('palmas_samples')
      .select('*')
      .order('palo', { ascending: true })
      .order('hit_type', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async uploadAndCreatePalmaSample(file, palo, hitType) {
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `samples/${palo}/${hitType}_${timestamp}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('cante-audio')
      .upload(filePath, file, { contentType: file.type, upsert: false });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('cante-audio')
      .getPublicUrl(filePath);

    const { data, error } = await supabase
      .from('palmas_samples')
      .upsert([{ palo, hit_type: hitType, audio_url: urlData.publicUrl }], {
        onConflict: 'palo,hit_type',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deletePalmaSample(id, audioUrl) {
    try {
      const url = new URL(audioUrl);
      const pathParts = url.pathname.split('/object/public/cante-audio/');
      if (pathParts.length > 1) {
        await supabase.storage.from('cante-audio').remove([pathParts[1]]);
      }
    } catch (e) {
      console.warn('Could not delete sample audio file:', e);
    }
    const { error } = await supabase.from('palmas_samples').delete().eq('id', id);
    if (error) throw error;
  },
};

// Suggestions board API
export const suggestionsAPI = {
  async getSuggestions(orderBy = 'votes') {
    const column = orderBy === 'votes' ? 'vote_count' : 'created_at';
    const { data, error } = await supabase
      .from('suggestions')
      .select('*')
      .order(column, { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async createSuggestion(title, description, user) {
    const { data, error } = await supabase
      .from('suggestions')
      .insert([{ title, description, user_id: user.id, user_email: user.email }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getUserVotes(userId) {
    const { data, error } = await supabase
      .from('suggestion_votes')
      .select('suggestion_id')
      .eq('user_id', userId);

    if (error) throw error;
    return new Set((data || []).map(v => v.suggestion_id));
  },

  async vote(suggestionId, userId) {
    const { error } = await supabase
      .from('suggestion_votes')
      .insert([{ suggestion_id: suggestionId, user_id: userId }]);

    if (error) throw error;
  },

  async unvote(suggestionId, userId) {
    const { error } = await supabase
      .from('suggestion_votes')
      .delete()
      .eq('suggestion_id', suggestionId)
      .eq('user_id', userId);

    if (error) throw error;
  },
};