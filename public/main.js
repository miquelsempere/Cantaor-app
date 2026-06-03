/**
 * Main application file for Flamenco Cante Practice App
 * Connects the UI with the AudioManager
 */

import AudioManager from '../src/audioManager.js';
import { canteTracksAPI, authAPI, suggestionsAPI } from '../src/supabaseClient.js';

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

      // Set up suggestions board
      this.setupSuggestionsBoard();

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
      const data = await authAPI.signUp(email, password);
      // If session is null, Supabase requires email confirmation
      if (!data.session) {
        this.showRegisterConfirmationPending(email);
      }
      // If session exists (autoconfirm / dev), onAuthStateChange handles it
    } catch (err) {
      this.authErrorRegister.textContent = err.message || 'Error al crear la cuenta.';
      this.registerSubmitBtn.disabled = false;
    }
  }

  showRegisterConfirmationPending(email) {
    const modal = document.getElementById('authModal');
    modal.innerHTML = `
      <div class="auth-confirm-pending">
        <div class="auth-confirm-icon">&#9993;</div>
        <h2 class="auth-modal-title">Revisa tu correo</h2>
        <p class="auth-confirm-text">
          Hemos enviado un enlace de confirmacion a<br>
          <strong>${email}</strong><br><br>
          Haz clic en el enlace para activar tu cuenta y acceder a todos los palos.
        </p>
        <button class="auth-submit-btn" id="confirmPendingClose">Entendido</button>
      </div>
    `;
    document.getElementById('confirmPendingClose').addEventListener('click', () => this.closeAuthModal());
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

  // Suggestions board
  setupSuggestionsBoard() {
    this.suggestionsOverlay = document.getElementById('suggestionsOverlay');
    this.suggestionsFab = document.getElementById('suggestionsFab');
    this.suggestionsModalClose = document.getElementById('suggestionsModalClose');
    this.suggestionsList = document.getElementById('suggestionsList');
    this.suggestionsLoading = document.getElementById('suggestionsLoading');
    this.newSuggestionBtn = document.getElementById('newSuggestionBtn');
    this.newSuggestionForm = document.getElementById('newSuggestionForm');
    this.cancelSuggestionBtn = document.getElementById('cancelSuggestionBtn');
    this.submitSuggestionBtn = document.getElementById('submitSuggestionBtn');
    this.suggestionTitle = document.getElementById('suggestionTitle');
    this.suggestionDescription = document.getElementById('suggestionDescription');
    this.suggestionFormError = document.getElementById('suggestionFormError');
    this.sortByVotesBtn = document.getElementById('sortByVotes');
    this.sortByDateBtn = document.getElementById('sortByDate');

    this.currentSortOrder = 'votes';
    this.userVotes = new Set();

    this.suggestionsFab.addEventListener('click', () => this.openSuggestionsModal());
    this.suggestionsModalClose.addEventListener('click', () => this.closeSuggestionsModal());
    this.suggestionsOverlay.addEventListener('click', (e) => {
      if (e.target === this.suggestionsOverlay) this.closeSuggestionsModal();
    });

    this.newSuggestionBtn.addEventListener('click', () => {
      if (!this.currentUser) {
        this.closeSuggestionsModal();
        this.openAuthModal();
        return;
      }
      this.newSuggestionForm.style.display = 'block';
      this.newSuggestionBtn.style.display = 'none';
      setTimeout(() => this.suggestionTitle.focus(), 50);
    });

    this.cancelSuggestionBtn.addEventListener('click', () => this.hideSuggestionForm());

    this.submitSuggestionBtn.addEventListener('click', () => this.handleSubmitSuggestion());

    this.suggestionTitle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleSubmitSuggestion();
    });

    this.sortByVotesBtn.addEventListener('click', () => {
      this.currentSortOrder = 'votes';
      this.sortByVotesBtn.classList.add('active');
      this.sortByDateBtn.classList.remove('active');
      this.renderSuggestions();
    });

    this.sortByDateBtn.addEventListener('click', () => {
      this.currentSortOrder = 'date';
      this.sortByDateBtn.classList.add('active');
      this.sortByVotesBtn.classList.remove('active');
      this.renderSuggestions();
    });
  }

  openSuggestionsModal() {
    this.suggestionsOverlay.classList.add('open');
    this.loadSuggestions();
  }

  closeSuggestionsModal() {
    this.suggestionsOverlay.classList.remove('open');
    this.hideSuggestionForm();
  }

  hideSuggestionForm() {
    this.newSuggestionForm.style.display = 'none';
    this.newSuggestionBtn.style.display = '';
    this.suggestionTitle.value = '';
    this.suggestionDescription.value = '';
    this.suggestionFormError.textContent = '';
  }

  async loadSuggestions() {
    this.suggestionsList.innerHTML = '<div class="suggestions-loading">Cargando sugerencias...</div>';
    try {
      this.cachedSuggestions = await suggestionsAPI.getSuggestions('votes');
      if (this.currentUser) {
        this.userVotes = await suggestionsAPI.getUserVotes(this.currentUser.id);
      } else {
        this.userVotes = new Set();
      }
      this.renderSuggestions();
    } catch (err) {
      this.suggestionsList.innerHTML = '<div class="suggestions-empty">Error cargando sugerencias.</div>';
    }
  }

  renderSuggestions() {
    const suggestions = [...(this.cachedSuggestions || [])];

    if (this.currentSortOrder === 'date') {
      suggestions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else {
      suggestions.sort((a, b) => b.vote_count - a.vote_count);
    }

    if (suggestions.length === 0) {
      this.suggestionsList.innerHTML = '<div class="suggestions-empty">No hay sugerencias aun. Se el primero en proponer algo!</div>';
      return;
    }

    this.suggestionsList.innerHTML = '';
    suggestions.forEach(s => {
      const hasVoted = this.userVotes.has(s.id);
      const card = document.createElement('div');
      card.className = 'suggestion-card';
      card.dataset.id = s.id;

      const date = new Date(s.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
      const email = s.user_email ? s.user_email.split('@')[0] : 'anonimo';

      card.innerHTML = `
        <button class="suggestion-vote-btn${hasVoted ? ' voted' : ''}" data-id="${s.id}" aria-label="Votar">
          <svg class="vote-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
          <span class="vote-count">${s.vote_count}</span>
        </button>
        <div class="suggestion-body">
          <div class="suggestion-title">${this.escapeHtml(s.title)}</div>
          ${s.description ? `<div class="suggestion-description">${this.escapeHtml(s.description)}</div>` : ''}
          <div class="suggestion-meta">${email} &middot; ${date}</div>
        </div>
      `;

      const voteBtn = card.querySelector('.suggestion-vote-btn');
      voteBtn.addEventListener('click', () => this.handleVote(s.id, hasVoted, card, voteBtn));

      this.suggestionsList.appendChild(card);
    });
  }

  async handleVote(suggestionId, hasVoted, card, voteBtn) {
    if (!this.currentUser) {
      this.closeSuggestionsModal();
      this.openAuthModal();
      return;
    }

    const countEl = voteBtn.querySelector('.vote-count');
    const currentCount = parseInt(countEl.textContent, 10);

    if (hasVoted) {
      voteBtn.classList.remove('voted');
      countEl.textContent = currentCount - 1;
      this.userVotes.delete(suggestionId);
      const s = this.cachedSuggestions.find(x => x.id === suggestionId);
      if (s) s.vote_count = Math.max(0, s.vote_count - 1);
      try {
        await suggestionsAPI.unvote(suggestionId, this.currentUser.id);
      } catch (err) {
        voteBtn.classList.add('voted');
        countEl.textContent = currentCount;
        this.userVotes.add(suggestionId);
      }
    } else {
      voteBtn.classList.add('voted');
      countEl.textContent = currentCount + 1;
      this.userVotes.add(suggestionId);
      const s = this.cachedSuggestions.find(x => x.id === suggestionId);
      if (s) s.vote_count = s.vote_count + 1;
      try {
        await suggestionsAPI.vote(suggestionId, this.currentUser.id);
      } catch (err) {
        voteBtn.classList.remove('voted');
        countEl.textContent = currentCount;
        this.userVotes.delete(suggestionId);
      }
    }
  }

  async handleSubmitSuggestion() {
    const title = this.suggestionTitle.value.trim();
    const description = this.suggestionDescription.value.trim();

    if (!title || title.length < 5) {
      this.suggestionFormError.textContent = 'El titulo debe tener al menos 5 caracteres.';
      return;
    }

    this.submitSuggestionBtn.disabled = true;
    this.suggestionFormError.textContent = '';

    try {
      const newSuggestion = await suggestionsAPI.createSuggestion(title, description, this.currentUser);
      this.cachedSuggestions = [newSuggestion, ...(this.cachedSuggestions || [])];
      this.hideSuggestionForm();
      this.renderSuggestions();
    } catch (err) {
      this.suggestionFormError.textContent = 'Error al enviar la sugerencia. Intentalo de nuevo.';
    } finally {
      this.submitSuggestionBtn.disabled = false;
    }
  }

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new FlamencoApp();
});