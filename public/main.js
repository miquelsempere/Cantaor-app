/**
 * Main application file for Flamenco Cante Practice App
 * Connects the UI with the AudioManager
 */

import AudioManager from '../src/audioManager.js';

class FlamencoApp {
  constructor() {
    this.audioManager = new AudioManager();
    this.isPlaying = false;
    this.currentPalo = null;
    
    // UI Elements
    this.paloSelect = document.getElementById('paloSelect');
    this.playButton = document.getElementById('playButton');
    this.trackInfo = document.getElementById('trackInfo');
    this.visualizer = document.getElementById('visualizer');
    this.statusMessage = document.getElementById('statusMessage');
    
    // Control Elements
    this.tempoSlider = document.getElementById('tempoSlider');
    this.tempoValue = document.getElementById('tempoValue');
    this.pitchSlider = document.getElementById('pitchSlider');
    this.pitchValue = document.getElementById('pitchValue');
    this.volumeSlider = document.getElementById('volumeSlider');
    this.volumeValue = document.getElementById('volumeValue');
    
    this.init();
  }

  async init() {
    try {
      this.showStatus('Inicializando aplicación...', 'loading');
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Load available palos
      await this.loadAvailablePalos();
      
      // Set up audio manager listeners
      this.setupAudioManagerListeners();
      
      this.showStatus('¡Listo para practicar!', 'success');
      
    } catch (error) {
      console.error('Error initializing app:', error);
      this.showStatus('Error al inicializar la aplicación', 'error');
    }
  }

  setupEventListeners() {
    // Palo selection
    this.paloSelect.addEventListener('change', (e) => {
      this.handlePaloChange(e.target.value);
    });

    // Play/Stop button - use arrow function to preserve 'this' context
    this.playButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('=== BUTTON CLICK EVENT FIRED ===');
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

    // Volume control
    this.volumeSlider.addEventListener('input', (e) => {
      const volume = parseFloat(e.target.value);
      this.audioManager.setVolume(volume);
      this.volumeValue.textContent = `${Math.round(volume * 100)}%`;
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
      this.showStatus('Cargando palos disponibles...', 'loading');
      
      const palos = await this.audioManager.getAvailablePalos();
      
      // Clear existing options
      this.paloSelect.innerHTML = '<option value="">Selecciona un palo</option>';
      
      // Add palo options
      palos.forEach(palo => {
        const option = document.createElement('option');
        option.value = palo;
        option.textContent = palo;
        this.paloSelect.appendChild(option);
      });
      
      console.log(`Loaded ${palos.length} palos:`, palos);
      
    } catch (error) {
      console.error('Error loading palos:', error);
      this.showStatus('Error cargando palos disponibles', 'error');
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
      this.showStatus(`Cargando pistas de ${selectedPalo}...`, 'loading');
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
      
      this.showStatus(`${trackCount} pistas cargadas para ${selectedPalo}`, 'success');
      
      // Update track info
      const currentTrack = this.audioManager.getCurrentTrack();
      this.updateTrackInfo(currentTrack);
      
    } catch (error) {
      console.error('Error loading palo:', error);
      this.showStatus(`Error cargando ${selectedPalo}`, 'error');
      this.playButton.disabled = true;
    }
  }

  async handlePlayButtonClick() {
    console.log('=== PLAY BUTTON CLICKED ===');
    console.log('Current this.isPlaying state:', this.isPlaying);
    console.log('Current this.currentPalo:', this.currentPalo);
    console.log('Play button text:', this.playButton.textContent);
    
    if (!this.currentPalo) {
      this.showStatus('Selecciona un palo primero', 'error');
      return;
    }

    try {
      if (this.isPlaying) {
        // Stop playback
        console.log('=== STOPPING PLAYBACK ===');
        console.log('About to call audioManager.stop()');
        this.audioManager.stop();
        console.log('audioManager.stop() call completed');
        this.showStatus('Reproducción detenida', 'success');
      } else {
        // Start playback
        console.log('=== STARTING PLAYBACK ===');
        this.showStatus('Iniciando reproducción...', 'loading');
        console.log('About to call audioManager.play()');
        await this.audioManager.play();
        console.log('audioManager.play() call completed');
        this.showStatus(`Reproduciendo ${this.currentPalo}`, 'success');
      }
    } catch (error) {
      console.error('Error with playback:', error);
      this.showStatus('Error en la reproducción', 'error');
    }
    
    console.log('=== END PLAY BUTTON CLICK ===');
  }

  updateTrackInfo(track) {
    const titleElement = this.trackInfo.querySelector('.track-title');
    const paloElement = this.trackInfo.querySelector('.track-palo');
    
    if (track) {
      titleElement.textContent = track.title;
      paloElement.textContent = track.palo;
    } else {
      titleElement.textContent = this.currentPalo ? 
        'Listo para reproducir' : 
        'Selecciona un palo para comenzar';
      paloElement.textContent = this.currentPalo || '';
    }
  }

  updatePlayState(isPlaying) {
    console.log('=== UPDATE PLAY STATE ===');
    console.log('New isPlaying value:', isPlaying);
    console.log('Previous this.isPlaying:', this.isPlaying);
    this.isPlaying = isPlaying;
    console.log('Updated this.isPlaying to:', this.isPlaying);
    
    // Update play button
    const newButtonText = isPlaying ? '⏸️' : '▶️';
    console.log('Changing button text to:', newButtonText);
    this.playButton.textContent = newButtonText;
    
    // Update visualizer
    if (isPlaying) {
      console.log('Adding "playing" class to visualizer');
      this.visualizer.classList.add('playing');
    } else {
      console.log('Removing "playing" class from visualizer');
      this.visualizer.classList.remove('playing');
    }
    console.log('=== END UPDATE PLAY STATE ===');
  }

  showStatus(message, type = '') {
    this.statusMessage.textContent = message;
    this.statusMessage.className = `status-message ${type}`;
    
    // Auto-clear success messages after 3 seconds
    if (type === 'success') {
      setTimeout(() => {
        if (this.statusMessage.textContent === message) {
          this.statusMessage.textContent = '';
          this.statusMessage.className = 'status-message';
        }
      }, 3000);
    }
  }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new FlamencoApp();
});