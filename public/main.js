/**
 * Main application file for Flamenco Cante Practice App
 * Connects the UI with the AudioManager
 */

import AudioManager from '../src/audioManager.js';
import { canteTracksAPI, authAPI } from '../src/supabaseClient.js';

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
    this.currentUser = null;
    this.pendingPalo = null;
    
    // UI Elements
    this.paloSelect = document.getElementById('paloSelect');
    this.customSelectDisplay = document.getElementById('customSelectDisplay');
    this.customSelectOptions = document.getElementById('customSelectOptions');
    this.customSelectWrapper = document.querySelector('.custom-select-wrapper');
    this.customSelectText = this.customSelectDisplay.querySelector('.custom-select-text');
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

      // Set up auth modal
      this.setupAuthModal();

      // Load available palos
      await this.loadAvailablePalos();

      // Set up audio manager listeners
      this.setupAudioManagerListeners();

      // Set up admin panel
      this.setupAdminPanel();
      this.setupSecretAdminAccess();

    } catch (error) {
      console.error('Error initializing app:', error);
    }
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

    // Spacebar control for play/pause
    document.addEventListener('keydown', (e) => {
      // Check if spacebar was pressed
      if (e.code === 'Space') {
        // Prevent spacebar from triggering if user is typing in an input field
        const activeElement = document.activeElement;
        const isInputField = activeElement && (
          activeElement.tagName === 'INPUT' || 
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.isContentEditable
        );
        
        if (!isInputField && !this.playButton.disabled) {
          e.preventDefault(); // Prevent page scroll
          this.handlePlayButtonClick();
        }
      }
    });
  }

  setupAuthModal() {
    this.authModalOverlay = document.getElementById('authModalOverlay');
    this.authModalClose = document.getElementById('authModalClose');
    this.authFormLogin = document.getElementById('authFormLogin');
    this.authFormRegister = document.getElementById('authFormRegister');
    this.loginEmail = document.getElementById('loginEmail');
    this.loginPassword = document.getElementById('loginPassword');
    this.loginSubmitBtn = document.getElementById('loginSubmitBtn');
    this.registerEmail = document.getElementById('registerEmail');
    this.registerPassword = document.getElementById('registerPassword');
    this.registerSubmitBtn = document.getElementById('registerSubmitBtn');
    this.authError = document.getElementById('authError');
    this.authErrorRegister = document.getElementById('authErrorRegister');
    this.userBar = document.getElementById('userBar');
    this.userBarEmail = document.getElementById('userBarEmail');
    this.userBarLogout = document.getElementById('userBarLogout');

    this.authModalClose.addEventListener('click', () => this.closeAuthModal());
    this.authModalOverlay.addEventListener('click', (e) => {
      if (e.target === this.authModalOverlay) this.closeAuthModal();
    });

    document.getElementById('switchToRegister').addEventListener('click', () => {
      this.authFormLogin.style.display = 'none';
      this.authFormRegister.style.display = 'flex';
      this.authError.textContent = '';
    });

    document.getElementById('switchToLogin').addEventListener('click', () => {
      this.authFormRegister.style.display = 'none';
      this.authFormLogin.style.display = 'flex';
      this.authErrorRegister.textContent = '';
    });

    this.loginSubmitBtn.addEventListener('click', () => this.handleLogin());
    this.registerSubmitBtn.addEventListener('click', () => this.handleRegister());

    [this.loginEmail, this.loginPassword].forEach(el => {
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.handleLogin(); });
    });
    [this.registerEmail, this.registerPassword].forEach(el => {
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.handleRegister(); });
    });

    this.userBarLogout.addEventListener('click', () => this.handleLogout());

    authAPI.onAuthStateChange((event, session) => {
      (() => {
        this.currentUser = session?.user ?? null;
        this.updateUserBar();
        if (session?.user) {
          this.closeAuthModal();
          if (this.pendingPalo) {
            const palo = this.pendingPalo;
            this.pendingPalo = null;
            this.paloSelect.value = palo;
            this.updateCustomSelectDisplay(palo);
            this.customSelectOptions.querySelectorAll('.custom-select-option').forEach(opt => {
              opt.classList.toggle('selected', opt.dataset.value === palo);
            });
            this.handlePaloChange(palo);
          }
        }
      })();
    });

    authAPI.getSession().then(session => {
      this.currentUser = session?.user ?? null;
      this.updateUserBar();
    });
  }

  openAuthModal() {
    this.authFormLogin.style.display = 'flex';
    this.authFormRegister.style.display = 'none';
    this.authError.textContent = '';
    this.authErrorRegister.textContent = '';
    this.authModalOverlay.classList.add('open');
    setTimeout(() => this.loginEmail.focus(), 100);
  }

  closeAuthModal() {
    this.authModalOverlay.classList.remove('open');
  }

  async handleLogin() {
    const email = this.loginEmail.value.trim();
    const password = this.loginPassword.value;
    if (!email || !password) {
      this.authError.textContent = 'Por favor completa todos los campos.';
      return;
    }
    this.loginSubmitBtn.disabled = true;
    this.authError.textContent = '';
    try {
      await authAPI.signIn(email, password);
    } catch (err) {
      this.authError.textContent = 'Email o contraseña incorrectos.';
      this.loginSubmitBtn.disabled = false;
    }
  }

  async handleRegister() {
    const email = this.registerEmail.value.trim();
    const password = this.registerPassword.value;
    if (!email || !password) {
      this.authErrorRegister.textContent = 'Por favor completa todos los campos.';
      return;
    }
    if (password.length < 6) {
      this.authErrorRegister.textContent = 'La contraseña debe tener al menos 6 caracteres.';
      return;
    }
    this.registerSubmitBtn.disabled = true;
    this.authErrorRegister.textContent = '';
    try {
      await authAPI.signUp(email, password);
    } catch (err) {
      this.authErrorRegister.textContent = err.message || 'Error al crear la cuenta.';
      this.registerSubmitBtn.disabled = false;
    }
  }

  async handleLogout() {
    try {
      await authAPI.signOut();
    } catch (err) {
      console.error('Error signing out:', err);
    }
  }

  updateUserBar() {
    if (this.currentUser) {
      this.userBar.style.display = 'flex';
      this.userBarEmail.textContent = this.currentUser.email;
    } else {
      this.userBar.style.display = 'none';
    }
    this.updatePaloBadges();
  }

  updatePaloBadges() {
    this.customSelectOptions.querySelectorAll('.custom-select-option').forEach(opt => {
      const palo = opt.dataset.value;
      const isFree = this.paloFreeMap ? this.paloFreeMap[palo] : false;
      if (isFree) return;
      const badge = opt.querySelector('.palo-badge-lock');
      if (badge) badge.style.display = this.currentUser ? 'none' : '';
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

      // Store free map for access checks
      this.paloFreeMap = {};
      palos.forEach(p => { this.paloFreeMap[p.nombre] = p.free; });

      // Clear existing options
      this.paloSelect.innerHTML = '';
      this.customSelectOptions.innerHTML = '';

      palos.forEach(({ nombre, free }) => {
        // Add to native select (hidden)
        const option = document.createElement('option');
        option.value = nombre;
        option.textContent = nombre;
        this.paloSelect.appendChild(option);

        // Add to custom dropdown
        const customOption = document.createElement('div');
        customOption.className = 'custom-select-option';
        customOption.dataset.value = nombre;

        if (free) {
          customOption.innerHTML = `<span>${nombre}</span><span class="palo-badge-free">Gratis</span>`;
        } else {
          customOption.innerHTML = `<span>${nombre}</span><span class="palo-badge-lock">&#128274;</span>`;
        }

        customOption.addEventListener('click', () => {
          this.selectCustomOption(nombre, customOption);
        });

        this.customSelectOptions.appendChild(customOption);
      });

      // Default to first free palo, or first palo if none are free
      const firstFree = palos.find(p => p.free);
      const defaultPalo = firstFree ? firstFree.nombre : (palos[0]?.nombre ?? null);
      if (defaultPalo) {
        this.paloSelect.value = defaultPalo;
        this.updateCustomSelectDisplay(defaultPalo);
        await this.handlePaloChange(defaultPalo);
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

    const isPaloFree = this.paloFreeMap ? this.paloFreeMap[selectedPalo] : false;
    if (!isPaloFree && !this.currentUser) {
      this.pendingPalo = selectedPalo;
      this.openAuthModal();
      // Revert the dropdown to the previous palo visually
      this.paloSelect.value = this.currentPalo || FREE_PALO;
      this.updateCustomSelectDisplay(this.currentPalo || FREE_PALO);
      this.customSelectOptions.querySelectorAll('.custom-select-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.value === (this.currentPalo || FREE_PALO));
      });
      return;
    }

    try {
      this.playButton.disabled = true;

      if (this.isPlaying) {
        this.audioManager.stop();
      }

      const trackCount = await this.audioManager.loadPalo(selectedPalo);
      this.currentPalo = selectedPalo;

      this.playButton.disabled = false;

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

  setupSecretAdminAccess() {
    const SECRET = 'admin';
    let typed = '';
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      typed += e.key.toLowerCase();
      if (typed.length > SECRET.length) typed = typed.slice(-SECRET.length);
      if (typed === SECRET) {
        document.getElementById('adminToggleSection').style.display = '';
        typed = '';
      }
    });
  }

  // Admin panel methods
  setupAdminPanel() {
    this.adminToggle = document.getElementById('adminToggle');
    this.adminPanel = document.getElementById('adminPanel');
    this.newPaloInput = document.getElementById('newPalo');
    this.newTitleInput = document.getElementById('newTitle');
    this.newAudioInput = document.getElementById('newAudio');
    this.audioFileBtn = document.getElementById('audioFileBtn');
    this.audioFileName = document.getElementById('audioFileName');
    this.uploadBtn = document.getElementById('uploadBtn');
    this.uploadStatus = document.getElementById('uploadStatus');
    this.trackList = document.getElementById('trackList');
    this.paloSuggestions = document.getElementById('paloSuggestions');

    this.adminToggle.addEventListener('click', () => this.toggleAdminPanel());
    this.audioFileBtn.addEventListener('click', () => this.newAudioInput.click());
    this.newAudioInput.addEventListener('change', () => this.handleAudioFileSelect());
    this.uploadBtn.addEventListener('click', () => this.handleUpload());

    // Enable upload button when form is valid
    [this.newPaloInput, this.newTitleInput].forEach(input => {
      input.addEventListener('input', () => this.validateUploadForm());
    });
  }

  toggleAdminPanel() {
    const isOpen = this.adminPanel.classList.contains('open');
    if (isOpen) {
      this.adminPanel.classList.remove('open');
      this.adminToggle.textContent = 'Gestionar pistas';
    } else {
      this.adminPanel.classList.add('open');
      this.adminToggle.textContent = 'Ocultar gestion';
      this.loadTrackList();
      this.loadPaloSuggestions();
    }
  }

  async loadPaloSuggestions() {
    try {
      const palos = await this.audioManager.getAvailablePalos();
      this.paloSuggestions.innerHTML = '';
      palos.forEach(({ nombre }) => {
        const option = document.createElement('option');
        option.value = nombre;
        this.paloSuggestions.appendChild(option);
      });
    } catch (e) {
      // ignore
    }
  }

  handleAudioFileSelect() {
    const file = this.newAudioInput.files[0];
    if (file) {
      this.audioFileName.textContent = file.name;
    } else {
      this.audioFileName.textContent = 'Ningun archivo seleccionado';
    }
    this.validateUploadForm();
  }

  validateUploadForm() {
    const hasPalo = this.newPaloInput.value.trim().length > 0;
    const hasTitle = this.newTitleInput.value.trim().length > 0;
    const hasFile = this.newAudioInput.files.length > 0;
    this.uploadBtn.disabled = !(hasPalo && hasTitle && hasFile);
  }

  setUploadStatus(message, type) {
    this.uploadStatus.textContent = message;
    this.uploadStatus.className = `upload-status ${type}`;
  }

  async handleUpload() {
    const palo = this.newPaloInput.value.trim();
    const title = this.newTitleInput.value.trim();
    const file = this.newAudioInput.files[0];

    if (!palo || !title || !file) return;

    try {
      this.uploadBtn.disabled = true;
      this.setUploadStatus('Subiendo archivo...', 'uploading');

      await canteTracksAPI.uploadAndCreateTrack(file, palo, title);

      this.setUploadStatus('Pista subida correctamente', 'success');

      // Reset form
      this.newPaloInput.value = '';
      this.newTitleInput.value = '';
      this.newAudioInput.value = '';
      this.audioFileName.textContent = 'Ningun archivo seleccionado';
      this.uploadBtn.disabled = true;

      // Refresh data
      this.loadTrackList();
      this.loadPaloSuggestions();
      await this.loadAvailablePalos();

      setTimeout(() => {
        this.setUploadStatus('', '');
      }, 3000);

    } catch (error) {
      console.error('Upload error:', error);
      this.setUploadStatus('Error al subir la pista: ' + error.message, 'error');
      this.uploadBtn.disabled = false;
    }
  }

  async loadTrackList() {
    try {
      const tracks = await canteTracksAPI.getAllTracks();

      this.trackList.innerHTML = '';

      if (tracks.length === 0) {
        this.trackList.innerHTML = '<div style="text-align:center;color:#8B7355;font-size:0.8rem;">No hay pistas</div>';
        return;
      }

      tracks.forEach(track => {
        const item = document.createElement('div');
        item.className = 'track-list-item';
        item.innerHTML = `
          <div class="track-list-item-info">
            <div class="track-list-item-palo">${track.palo}</div>
            <div class="track-list-item-title">${track.title}</div>
          </div>
          <button class="track-list-item-delete" data-id="${track.id}" data-url="${track.audio_url}" title="Eliminar">&times;</button>
        `;

        const deleteBtn = item.querySelector('.track-list-item-delete');
        deleteBtn.addEventListener('click', () => this.handleDeleteTrack(track.id, track.audio_url));

        this.trackList.appendChild(item);
      });
    } catch (error) {
      console.error('Error loading track list:', error);
    }
  }

  async handleDeleteTrack(trackId, audioUrl) {
    if (!confirm('Eliminar esta pista?')) return;

    try {
      await canteTracksAPI.deleteTrack(trackId, audioUrl);
      this.loadTrackList();
      this.loadPaloSuggestions();
      await this.loadAvailablePalos();
    } catch (error) {
      console.error('Error deleting track:', error);
      alert('Error al eliminar la pista: ' + error.message);
    }
  }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new FlamencoApp();
});