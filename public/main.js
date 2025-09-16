/**
 * Main application file for Flamenco Cante Practice App
 * Connects the UI with the AudioManager
 */

import AudioManager from '../src/audioManager.js';

class FlamencoApp {
  constructor() {
    // Constante para el contenido SVG del botón de reproducción
    this.PLAY_BUTTON_SVG_CONTENT = `
                <div class="play-icon">
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path d="M8 5v14l11-7z" fill="currentColor"></path>
                    </svg>
                </div>
                <div class="pause-icon">
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"></path>
                    </svg>
                </div>
            `;
    
    console.log('PLAY_BUTTON_SVG_CONTENT:', this.PLAY_BUTTON_SVG_CONTENT);
    
    this.audioManager = new AudioManager();
    this.isPlaying = false;
    this.currentPalo = null;
    
    // UI Elements
    this.paloSelect = document.getElementById('paloSelect');
    this.playButton = document.getElementById('playButton');
    this.visualizer = document.getElementById('visualizer');
    
    // Control Elements
    this.tempoSlider = document.getElementById('tempoSlider');
    this.tempoValue = document.getElementById('tempoValue');
    this.pitchSlider = document.getElementById('pitchSlider');
    this.pitchValue = document.getElementById('pitchValue');
    
    this.init();
  }

  async init() {
    try {
      // Set up event listeners
      this.setupEventListeners();
      
      // Load available palos
      await this.loadAvailablePalos();
      
      // Set up audio manager listeners
      this.setupAudioManagerListeners();
      
    } catch (error) {
      console.error('Error initializing app:', error);
    }
  }

  setupEventListeners() {
    // Palo selection
    this.paloSelect.addEventListener('change', (e) => {
      this.handlePaloChange(e.target.value);
    });

    // Play/Stop button
    this.playButton.addEventListener('click', () => {
      this.handlePlayButtonClick();
    });

    // Tempo control
    this.tempoSlider.addEventListener('input', (e) => {
      const tempo = parseFloat(e.target.value);
      this.audioManager.setTempo(tempo);
      this.tempoValue.textContent = `${tempo.toFixed(2)}x`;
    });

    // Pitch control
    this.pitchSlider.addEventListener('input', (e) => {
      const semitones = parseInt(e.target.value);
      this.audioManager.setPitchSemitones(semitones);
      this.pitchValue.textContent = semitones > 0 ? `+${semitones}` : `${semitones}`;
    });
  }

  setupAudioManagerListeners() {
    // Listen for track changes
    this.audioManager.onTrackChange((track) => {
      this.updateTrackInfo(track);
    });

    // Listen for play state changes
    this.audioManager.onPlayStateChange((isPlaying) => {
      this.updatePlayState(isPlaying);
    });
  }

  async loadAvailablePalos() {
    try {
      const palos = await this.audioManager.getAvailablePalos();
      
      // Clear existing options
      this.paloSelect.innerHTML = '';
      
      // Add palo options
      palos.forEach(palo => {
        const option = document.createElement('option');
        option.value = palo;
        option.textContent = palo;
        this.paloSelect.appendChild(option);
      });
      
      // Set Tangos as default if available
      if (palos.includes('Tangos')) {
        this.paloSelect.value = 'Tangos';
        await this.handlePaloChange('Tangos');
      }
      
      console.log(`Loaded ${palos.length} palos:`, palos);
      
    } catch (error) {
      console.error('Error loading palos:', error);
      this.paloSelect.innerHTML = '<option value="">Error cargando palos</option>';
    }
  }

  async handlePaloChange(selectedPalo) {
    if (!selectedPalo) {
      this.currentPalo = null;
      this.playButton.disabled = true;
      this.updateTrackInfo(null);
      return;
    }

    try {
      this.playButton.disabled = true;
      
      // Stop current playback if any
      if (this.isPlaying) {
        this.audioManager.stop();
      }
      
      // Load new palo
      const trackCount = await this.audioManager.loadPalo(selectedPalo);
      this.currentPalo = selectedPalo;
      
      // Enable play button
      this.playButton.disabled = false;
      
      // Update track info
      const currentTrack = this.audioManager.getCurrentTrack();
      this.updateTrackInfo(currentTrack);
      
    } catch (error) {
      console.error('Error loading palo:', error);
      this.playButton.disabled = true;
    }
  }

  async handlePlayButtonClick() {
    if (!this.currentPalo) {
      return;
    }

    console.log('Play button clicked, current state:', this.isPlaying);

    try {
      if (this.isPlaying) {
        // Stop playback
        console.log('Stopping playback...');
        this.audioManager.stop();
      } else {
        // Start playback
        console.log('Starting playback...');
        await this.audioManager.play();
      }
    } catch (error) {
      console.error('Error with playback:', error);
    }
  }

  updateTrackInfo(track) {
    // Esta función ya no se usa
  }


  updatePlayState(isPlaying) {
    this.isPlaying = isPlaying;
    
    // Deshabilitar el menú desplegable durante la reproducción
    this.paloSelect.disabled = isPlaying;
    
    // Deshabilitar el menú desplegable durante la reproducción
    this.paloSelect.disabled = isPlaying;
    
    console.log('updatePlayState: Antes de asignar innerHTML. isPlaying:', isPlaying);
    console.log('updatePlayState: Contenido SVG a asignar:', this.PLAY_BUTTON_SVG_CONTENT);
    
    // Asegurar que el contenido SVG esté siempre presente
    this.playButton.innerHTML = this.PLAY_BUTTON_SVG_CONTENT;
    
    console.log('updatePlayState: Después de asignar innerHTML. Contenido actual:', this.playButton.innerHTML);
    
    // Update play button state - simply toggle the is-playing class
    if (isPlaying) {
      this.playButton.classList.add('is-playing');
      console.log('Play button: switched to pause icon');
    } else {
      this.playButton.classList.remove('is-playing');
      console.log('Play button: switched to play icon');
    }
    
    console.log('updatePlayState: Clases del botón después de toggle:', this.playButton.classList.value);
    
    // Update visualizer
    if (isPlaying) {
      this.visualizer.classList.add('playing');
    } else {
      this.visualizer.classList.remove('playing');
    }
  }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new FlamencoApp();
});