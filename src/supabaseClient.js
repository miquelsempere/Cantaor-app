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
   * Get all available palos (flamenco styles)
   * @returns {Promise<Array>} Array of unique palo names
   */
  async getAvailablePalos() {
    const { data, error } = await supabase
      .from('cante_tracks')
      .select('palo')
      .order('palo', { ascending: true });

    if (error) {
      console.error('Error fetching available palos:', error);
      throw error;
    }

    // Extract unique palos
    const uniquePalos = [...new Set(data?.map(item => item.palo) || [])];
    return uniquePalos;
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
  }
};