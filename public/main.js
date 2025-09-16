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
    this.customSelectDisplay = document.getElementById('customSelectDisplay');
    this.customSelectOptions = document.getElementById('customSelectOptions');
    this.customSelectWrapper = document.querySelector('.custom-select-wrapper');
    this.customSelectText = this.customSelectDisplay.querySelector('.custom-select-text');
    this.playButton = document.getElementById('playButton');
    this.visualizer = document.getElementById('visualizer');
    this.fretMarkersContainer = document.getElementById('fretMarkers');
    
    // Control Elements
    this.tempoSlider = document.getElementById('tempoSlider');
    this.tempoValue = document.getElementById('tempoValue');
    this.pitchSlider = document.getElementById('pitchSlider');
    this.pitchValue = document.getElementById('pitchValue');
    this.sliderTrackWrapper = document.querySelector('.slider-track-wrapper');
    
    this.init();
  }

  async init() {
    try {
      // Set up event listeners
      this.setupEventListeners();
      
      this.createFretMarkers();
      // Load available palos
      await this.loadAvailablePalos();
      
      // Set up audio manager listeners
      this.setupAudioManagerListeners();
      
    } catch (error) {
      console.error('Error initializing app:', error);
    }
  }

  createFretMarkers() {
    const minSemitones = parseInt(this.pitchSlider.min); // -5
    const maxSemitones = parseInt(this.pitchSlider.max); // 5
    const numberOfMarkers = maxSemitones - minSemitones + 1; // 11 marcadores (Traste 0 a Traste 10)
    const thumbWidth = 8; // Ancho de la cejilla, definido en CSS

    this.fretMarkersContainer.innerHTML = ''; // Limpiar marcadores existentes

    // Obtener el ancho real del contenedor del slider.
    // Esto representa el ancho total del "track" visual.
    const trackWidth = this.sliderTrackWrapper.offsetWidth;

    // La distancia total que el centro de la cejilla puede recorrer
    // es el ancho del track menos el ancho de la cejilla.
    const effectiveTravelDistance = trackWidth - thumbWidth;

    // La distancia entre el centro de un traste y el siguiente
    const spaceBetweenFrets = effectiveTravelDistance / (numberOfMarkers - 1);

    for (let i = 0; i < numberOfMarkers; i++) {
      const fretMarker = document.createElement('div');
      fretMarker.className = 'fret-marker';
      fretMarker.textContent = `${i}`;

      // Calcular la posición del centro de cada traste
      const centerPosition = i * spaceBetweenFrets + (thumbWidth / 2);

      const leftPosition = centerPosition - 2.5; // Centrar el traste de 5px
      fretMarker.style.left = `${leftPosition}px`;

      console.log(`Traste ${i}: centerPosition=${centerPosition}, leftPosition=${leftPosition}`);

      this.fretMarkersContainer.appendChild(fretMarker);
    }
    
    console.log(`=== Created ${numberOfMarkers} fret markers ===`);
  }

  setupEventListeners() {
    // Palo selection
    this.paloSelect.addEventListener('change', (e) => {
      this.handlePaloChange(e.target.value);
    });

    // Custom dropdown events
    this.customSelectDisplay.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleCustomDropdown();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      this.closeCustomDropdown();
    });

    // Prevent closing when clicking inside options
    this.customSelectOptions.addEventListener('click', (e) => {
      e.stopPropagation();
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
      const fretNumber = semitones + 5;
      this.pitchValue.textContent = `Traste ${fretNumber}`;
    });

    // Recalculate fret markers on window resize
    window.addEventListener('resize', () => {
      this.createFretMarkers();
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
      this.customSelectOptions.innerHTML = '';
      
      // Add palo options
      palos.forEach(palo => {
        // Add to native select (hidden)
        const option = document.createElement('option');
        option.value = palo;
        option.textContent = palo;
        this.paloSelect.appendChild(option);

        // Add to custom dropdown
        const customOption = document.createElement('div');
        customOption.className = 'custom-select-option';
        customOption.textContent = palo;
        customOption.dataset.value = palo;
        
        customOption.addEventListener('click', () => {
          this.selectCustomOption(palo, customOption);
        });
        
        this.customSelectOptions.appendChild(customOption);
      });
      
      // Set Tangos as default if available
      if (palos.includes('Tangos')) {
        this.paloSelect.value = 'Tangos';
        this.updateCustomSelectDisplay('Tangos');
        await this.handlePaloChange('Tangos');
      } else if (palos.length > 0) {
        // If no Tangos, select first available palo
        this.paloSelect.value = palos[0];
        this.updateCustomSelectDisplay(palos[0]);
        await this.handlePaloChange(palos[0]);
      }
      
      console.log(`Loaded ${palos.length} palos:`, palos);
      
    } catch (error) {
      console.error('Error loading palos:', error);
      this.paloSelect.innerHTML = '<option value="">Error cargando palos</option>';
      this.customSelectOptions.innerHTML = '<div class="custom-select-option">Error cargando palos</div>';
      this.updateCustomSelectDisplay('Error cargando palos');
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
    
    // Disable dropdown during playback
    this.paloSelect.disabled = isPlaying;
    
    if (isPlaying) {
      this.customSelectWrapper.classList.add('disabled');
      // Close dropdown if it's open when playback starts
      this.closeCustomDropdown();
    } else {
      this.customSelectWrapper.classList.remove('disabled');
    }
    
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

  toggleCustomDropdown() {
    // Prevent interaction if disabled
    if (this.customSelectWrapper.classList.contains('disabled')) {
      return;
    }
    
    const isOpen = this.customSelectOptions.classList.contains('open');
    
    if (isOpen) {
      this.closeCustomDropdown();
    } else {
      this.openCustomDropdown();
    }
  }

  openCustomDropdown() {
    this.customSelectOptions.classList.add('open');
    this.customSelectDisplay.classList.add('active');
  }

  closeCustomDropdown() {
    this.customSelectOptions.classList.remove('open');
    this.customSelectDisplay.classList.remove('active');
  }

  selectCustomOption(value, optionElement) {
    // Prevent interaction if disabled
    if (this.customSelectWrapper.classList.contains('disabled')) {
      return;
    }
    
    // Update native select
    this.paloSelect.value = value;
    
    // Update custom display
    this.updateCustomSelectDisplay(value);
    
    // Update selected state in custom options
    this.customSelectOptions.querySelectorAll('.custom-select-option').forEach(option => {
      option.classList.remove('selected');
    });
    optionElement.classList.add('selected');
    
    // Close dropdown
    this.closeCustomDropdown();
    
    // Trigger change event
    this.paloSelect.dispatchEvent(new Event('change'));
  }

  updateCustomSelectDisplay(text) {
    this.customSelectText.textContent = text;
  }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new FlamencoApp();
});