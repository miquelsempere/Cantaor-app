/**
 * Main application file for Flamenco Cante Practice App
 * Connects the UI with the AudioManager
 */

import AudioManager from '../src/audioManager.js';

// Importar las nuevas pantallas
import OnboardingScreen from '../src/components/OnboardingScreen.js';
import LoginScreen from '../src/components/LoginScreen.js';
import DashboardScreen from '../src/components/DashboardScreen.js';

class AppRouter {
  constructor() {
    this.currentScreen = null;
    this.init();
  }

  init() {
    this.determineInitialScreen();
  }

  determineInitialScreen() {
    const hasCompletedOnboarding = localStorage.getItem('onboarding_completed');
    const isAuthenticated = localStorage.getItem('user_authenticated');

    if (!hasCompletedOnboarding) {
      this.showOnboarding();
    } else if (!isAuthenticated) {
      this.showLogin();
    } else {
      this.showDashboard();
    }
  }

  showOnboarding() {
    this.currentScreen = 'onboarding';
    const onboarding = new OnboardingScreen();
    document.body.innerHTML = onboarding.render();
  }

  showLogin() {
    this.currentScreen = 'login';
    const login = new LoginScreen();
    document.body.innerHTML = login.render();
  }

  showDashboard() {
    this.currentScreen = 'dashboard';
    const dashboard = new DashboardScreen();
    document.body.innerHTML = dashboard.render();
  }

  showMainApp() {
    this.currentScreen = 'main';
    // Mostrar la aplicación principal original
    this.initMainApp();
  }

  initMainApp() {
    // Código original de la aplicación principal
    document.body.innerHTML = `
      <div class="app-container">
        <h1 class="app-title heading-1 flamenco-accent">Cante Flamenco</h1>
        <p class="body-small mb-6">Práctica de guitarra con pistas de cante</p>
        
        <div class="palo-selector">
            <label for="paloSelect" class="input-label">Selecciona el Palo:</label>
            <select id="paloSelect" class="input-field">
                <option value="">Cargando palos...</option>
            </select>
        </div>

        <div class="player-section">
            <button id="playButton" class="play-button btn" disabled>
                ▶️
            </button>
            
            <div class="track-info card" id="trackInfo">
                <div class="track-title">Selecciona un palo para comenzar</div>
                <div class="track-palo"></div>
            </div>

            <div class="visualizer" id="visualizer">
                <div class="visualizer-bars">
                    <div class="visualizer-bar"></div>
                    <div class="visualizer-bar"></div>
                    <div class="visualizer-bar"></div>
                    <div class="visualizer-bar"></div>
                    <div class="visualizer-bar"></div>
                    <div class="visualizer-bar"></div>
                    <div class="visualizer-bar"></div>
                    <div class="visualizer-bar"></div>
                    <div class="visualizer-bar"></div>
                    <div class="visualizer-bar"></div>
                </div>
            </div>
        </div>

        <div class="controls-section">
            <div class="control-group">
                <label class="control-label">Tempo</label>
                <input type="range" id="tempoSlider" class="control-slider" 
                       min="0.5" max="2.0" step="0.05" value="1.0">
                <div class="control-value caption" id="tempoValue">1.00x</div>
            </div>

            <div class="control-group">
                <label class="control-label">Tono (Semitonos)</label>
                <input type="range" id="pitchSlider" class="control-slider" 
                       min="-12" max="12" step="1" value="0">
                <div class="control-value caption" id="pitchValue">0</div>
            </div>

            <div class="control-group">
                <label class="control-label">Volumen</label>
                <input type="range" id="volumeSlider" class="control-slider" 
                       min="0" max="1" step="0.05" value="0.8">
                <div class="control-value caption" id="volumeValue">80%</div>
            </div>
        </div>

        <div class="status-message" id="statusMessage"></div>
      </div>
    `;
    
    // Inicializar la aplicación principal original
    new FlamencoApp();
  }
}

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
      this.updatePlaybackStatus();
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
    if (!this.currentPalo) {
      this.showStatus('Selecciona un palo primero', 'error');
      return;
    }

    try {
      if (this.isPlaying) {
        // Stop playback
        this.audioManager.stop();
        this.showStatus('Reproducción detenida', 'success');
      } else {
        // Start playback
        this.showStatus('Iniciando reproducción...', 'loading');
        await this.audioManager.play();
        this.showStatus(`Reproduciendo ${this.currentPalo}`, 'success');
      }
    } catch (error) {
      console.error('Error with playback:', error);
      this.showStatus('Error en la reproducción', 'error');
    }
  }

  updateTrackInfo(track) {
    const titleElement = this.trackInfo.querySelector('.track-title');
    const paloElement = this.trackInfo.querySelector('.track-palo');
    
    if (track) {
      titleElement.textContent = `Ciclo ${this.audioManager.currentCycle} - ${track.title}`;
      paloElement.textContent = `${track.palo} (${this.audioManager.totalTracksInCycle} pistas aleatorias)`;
    } else {
      titleElement.textContent = this.currentPalo ? 
        'Listo para reproducir' : 
        'Selecciona un palo para comenzar';
      paloElement.textContent = this.currentPalo || '';
    }
  }

  updatePlaybackStatus() {
    if (this.isPlaying) {
      const status = this.audioManager.getPlaybackStatus();
      const cycleDuration = status.cycleDuration ? `${status.cycleDuration.toFixed(1)}s` : '';
      const statusText = `Ciclo ${status.currentCycle} - ${status.totalTracksInCycle} pistas ${cycleDuration}`;
      
      // Update status in the track info or create a new status element
      const existingStatus = document.querySelector('.playback-status');
      if (existingStatus) {
        existingStatus.textContent = statusText;
      } else {
        const statusElement = document.createElement('div');
        statusElement.className = 'playback-status';
        statusElement.textContent = statusText;
        statusElement.style.fontSize = '0.8rem';
        statusElement.style.color = '#718096';
        statusElement.style.marginTop = '0.5rem';
        this.trackInfo.appendChild(statusElement);
      }
    } else {
      // Remove status when not playing
      const existingStatus = document.querySelector('.playback-status');
      if (existingStatus) {
        existingStatus.remove();
      }
    }
  }
  updatePlayState(isPlaying) {
    this.isPlaying = isPlaying;
    
    // Update play button
    this.playButton.textContent = isPlaying ? '⏸️' : '▶️';
    
    // Update visualizer
    if (isPlaying) {
      this.visualizer.classList.add('playing');
    } else {
      this.visualizer.classList.remove('playing');
    }
    
    // Update playback status
    this.updatePlaybackStatus();
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
  // Inicializar el router en lugar de la aplicación directamente
  new AppRouter();
});