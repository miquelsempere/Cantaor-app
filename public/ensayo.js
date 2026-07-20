/**
 * ensayo.js - Controlador principal de cantaor.app
 */

import DualStreamEngine from '../src/dualStreamEngine.js';
import EnsayoMode from '../src/ensayoMode.js';
import { canteTracksAPI, ensayoAPI, authAPI, suggestionsAPI, ensayoPreferencesAPI } from '../src/supabaseClient.js';

class EnsayoApp {
  constructor() {
    this.engine = new DualStreamEngine();
    this.ensayo = new EnsayoMode(this.engine);

    this.currentPalo = null;
    this.isLoaded = false;
    this.currentUser = null;
    this.currentMode = null;

    this.paloGrid       = document.getElementById('ensayoPaloGrid');
    this.playBtn        = document.getElementById('ensayoPlayBtn');
    this.voiceToggle    = document.getElementById('voiceToggle');
    this.visualizer     = document.getElementById('ensayoVisualizer');
    this.statusDot      = document.getElementById('statusDot');
    this.statusText     = document.getElementById('statusText');
    this.voiceDot       = document.getElementById('voiceDot');

    this.canteTitle     = document.getElementById('canteTitle');
    this.ensayoError    = document.getElementById('ensayoError');
    this.ensayoLoading  = document.getElementById('ensayoLoading');
    this.loadingText    = document.getElementById('ensayoLoadingText');
    this.preplay        = document.getElementById('ensayoPreplay');
    this.tempoSlider    = document.getElementById('ensayoTempoSlider');
    this.tempoValue     = document.getElementById('ensayoTempoValue');
    this.pitchSlider    = document.getElementById('ensayoPitchSlider');
    this.pitchValue     = document.getElementById('ensayoPitchValue');
    this.commandFlash   = document.getElementById('commandFlash');
    this.userBar        = document.getElementById('userBar');
    this.userBarEmail   = document.getElementById('userBarEmail');
    this.userBarLogout  = document.getElementById('userBarLogout');
    this.userBarLogin   = document.getElementById('userBarLogin');
    this.trackSelector  = document.getElementById('trackSelector');
    this.trackSelList   = document.getElementById('trackSelectorList');
    this.voiceLoadProg  = document.getElementById('voiceLoadProgress');
    this.stepPromptText = document.getElementById('stepPromptText');
    this.colRight       = document.getElementById('ensayoColRight');
    this.falsetaCard    = document.getElementById('ensayoFalsetaCard');
    this.ensayoLayout   = document.getElementById('ensayoLayout');
    this.step2Intro      = document.getElementById('step2Intro');
    this.step2Palo       = document.getElementById('step2Palo');
    this.modeSwitch      = document.getElementById('modeSwitch');
    this.step1El        = document.getElementById('step1');
    this.step2El        = document.getElementById('step2');
    this.step3El        = document.getElementById('step3');
    this.step2Substep   = document.getElementById('step2Substep');
    this.step2Back      = document.getElementById('step2Back');
    this.step3Back      = document.getElementById('step3Back');
    this.currentStep    = 1;

    this.init();
  }

  async init() {
    this._setupAuth();
    this._setupEngineListeners();
    this._setupEnsayoListeners();
    this._setupControls();
    this._setupTrackSelector();
    this._setupModeSwitch();
    this._setupStepFlow();
    this._setupAdminSecretAccess();
    this._setupDebugPanel();
    await this._loadPalos();
  }

  _setupStepFlow() {
    if (this.step2Back) this.step2Back.addEventListener('click', () => this._goToStep(1));
    if (this.step3Back) this.step3Back.addEventListener('click', () => this._goToStep(2));
  }

  _goToStep(n) {
    if (n === this.currentStep) return;
    if (n < this.currentStep && this.engine.isPlaying) { this.engine.stop(); this.ensayo.stopVoice(); this._updatePlayUI(false); }
    const fromEl = this.currentStep === 1 ? this.step1El : this.currentStep === 2 ? this.step2El : this.step3El;
    const toEl   = n === 1 ? this.step1El : n === 2 ? this.step2El : this.step3El;
    fromEl.classList.add('step-leaving');
    setTimeout(() => {
      fromEl.classList.remove('step-leaving');
      fromEl.classList.add('step-hidden');
      toEl.classList.remove('step-hidden');
      this.currentStep = n;
    }, 300);
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  _setupAuth() {
    authAPI.onAuthStateChange((event, session) => {
      (() => {
        this.currentUser = session?.user ?? null;
        this._updateUserBar();
      })();
    });
    authAPI.getSession().then(session => {
      this.currentUser = session?.user ?? null;
      this._updateUserBar();
    });
    this.userBarLogout.addEventListener('click', () => authAPI.signOut().catch(() => {}));
    this.userBarLogin.addEventListener('click', () => this._openAuthModal());
  }

  _updateUserBar() {
    if (this.currentUser) {
      this.userBarEmail.textContent = this.currentUser.email;
      this.userBarLogout.style.display = '';
      this.userBarLogin.style.display = 'none';
    } else {
      this.userBarEmail.textContent = '';
      this.userBarLogout.style.display = 'none';
      this.userBarLogin.style.display = '';
    }
    this.userBar.style.display = 'flex';
  }

  // ─── Auth modal ────────────────────────────────────────────────────────────

  _setupAuthModal() {
    this._authOverlay   = document.getElementById('authModalOverlay');
    this._authClose     = document.getElementById('authModalClose');
    this._authFormLogin = document.getElementById('authFormLogin');
    this._authFormReg   = document.getElementById('authFormRegister');
    this._loginEmail    = document.getElementById('loginEmail');
    this._loginPass     = document.getElementById('loginPassword');
    this._loginBtn      = document.getElementById('loginSubmitBtn');
    this._regEmail      = document.getElementById('registerEmail');
    this._regPass       = document.getElementById('registerPassword');
    this._regBtn        = document.getElementById('registerSubmitBtn');
    this._authErr       = document.getElementById('authError');
    this._authErrReg    = document.getElementById('authErrorRegister');

    this._authClose.addEventListener('click', () => this._closeAuthModal());
    this._authOverlay.addEventListener('click', e => {
      if (e.target === this._authOverlay) this._closeAuthModal();
    });
    document.getElementById('switchToRegister').addEventListener('click', () => {
      this._authFormLogin.style.display = 'none';
      this._authFormReg.style.display = 'flex';
      this._authErr.textContent = '';
    });
    document.getElementById('switchToLogin').addEventListener('click', () => {
      this._authFormReg.style.display = 'none';
      this._authFormLogin.style.display = 'flex';
      this._authErrReg.textContent = '';
    });
    this._loginBtn.addEventListener('click', () => this._handleLogin());
    this._regBtn.addEventListener('click', () => this._handleRegister());
    [this._loginEmail, this._loginPass].forEach(el => {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') this._handleLogin(); });
    });
    [this._regEmail, this._regPass].forEach(el => {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') this._handleRegister(); });
    });
  }

  _openAuthModal() {
    if (!this._authOverlay) this._setupAuthModal();
    this._authFormLogin.style.display = 'flex';
    this._authFormReg.style.display = 'none';
    this._authErr.textContent = '';
    this._authErrReg.textContent = '';
    this._authOverlay.classList.add('open');
    setTimeout(() => this._loginEmail.focus(), 100);
  }

  _closeAuthModal() {
    this._authOverlay.classList.remove('open');
  }

  async _handleLogin() {
    const email = this._loginEmail.value.trim();
    const pass  = this._loginPass.value;
    if (!email || !pass) { this._authErr.textContent = 'Por favor completa todos los campos.'; return; }
    this._loginBtn.disabled = true;
    this._authErr.textContent = '';
    try {
      await authAPI.signIn(email, pass);
      this._closeAuthModal();
    } catch (err) {
      this._authErr.textContent = 'Email o contrasena incorrectos.';
    } finally {
      this._loginBtn.disabled = false;
    }
  }

  async _handleRegister() {
    const email = this._regEmail.value.trim();
    const pass  = this._regPass.value;
    if (!email || !pass) { this._authErrReg.textContent = 'Por favor completa todos los campos.'; return; }
    if (pass.length < 6) { this._authErrReg.textContent = 'La contrasena debe tener al menos 6 caracteres.'; return; }
    this._regBtn.disabled = true;
    this._authErrReg.textContent = '';
    try {
      const data = await authAPI.signUp(email, pass);
      if (!data.session) {
        document.getElementById('authModal').innerHTML = `
          <div class="auth-confirm-pending">
            <div class="auth-confirm-icon">&#9993;</div>
            <h2 class="auth-modal-title">Revisa tu correo</h2>
            <p class="auth-confirm-text">Hemos enviado un enlace de confirmacion a<br><strong>${email}</strong></p>
            <button class="auth-submit-btn" id="confirmPendingClose">Entendido</button>
          </div>`;
        document.getElementById('confirmPendingClose').addEventListener('click', () => this._closeAuthModal());
      }
    } catch (err) {
      this._authErrReg.textContent = err.message || 'Error al crear la cuenta.';
    } finally {
      this._regBtn.disabled = false;
    }
  }

  // ─── Engine listeners ──────────────────────────────────────────────────────

  _setupEngineListeners() {
    this.engine.onStateChange(({ isPlaying, falseta }) => {
      this._updatePlayUI(isPlaying);
      this._updateFalsetaUI(falseta);
    });
    this.engine.onCanteEnter(voice => {
      this.canteTitle.textContent = voice.canonical_title || voice.title;
      this.canteTitle.classList.remove('empty');
      this._recordCanteEntry(voice);
    });
  }

  // ─── EnsayoMode listeners ─────────────────────────────────────────────────

  _setupEnsayoListeners() {
    this.ensayo.onCommand(cmd => {
      if (cmd === 'falseta') this._showCommandFlash('Falseta');
      else if (cmd === 'vamos_alla') this._showCommandFlash('Vamos alla');
    });
    this.ensayo.onVoiceStatus(status => this._updateVoiceIndicator(status));
    if (!this.ensayo.supported) {
      this.voiceToggle.disabled = true;
      this.voiceToggle.title = 'No disponible en este navegador (usa Chrome)';
    } else {
      this.voiceToggle.disabled = false;
    }
  }

  // ─── Controles ─────────────────────────────────────────────────────────────

  _setupControls() {
    this.playBtn.addEventListener('click', () => this._handlePlayClick());
    document.addEventListener('keydown', e => {
      if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        if (!this.playBtn.disabled) this._handlePlayClick();
      }
    });
    this.tempoSlider.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      this.engine.setTempo(v);
      this.tempoValue.textContent = `${v.toFixed(2)}x`;
    });
    this.pitchSlider.addEventListener('input', e => {
      const s = parseInt(e.target.value, 10);
      this.engine.setPitchSemitones(s);
      this.pitchValue.textContent = `Traste ${s + 5}`;
    });
    this.voiceToggle.addEventListener('change', e => {
      if (e.target.checked) this.ensayo.startVoice();
      else this.ensayo.stopVoice();
    });
  }

  // ─── Track selector ────────────────────────────────────────────────────────

  _setupModeSwitch() {
    if (!this.modeSwitch) return;
    this.modeSwitch.querySelectorAll('.mode-switch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (mode === this.currentMode) return;
        this._setMode(mode, true);
      });
    });
    this.modeSwitch.querySelectorAll('.mode-switch-btn').forEach(btn =>
      btn.classList.remove('active')
    );
  }

  _setMode(mode, persist) {
    this.currentMode = mode;
    this.modeSwitch.querySelectorAll('.mode-switch-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    if (mode === 'random') {
      this.step2Substep.classList.add('step-hidden');
      this.trackSelector.style.display = 'none';
      this.engine.setSelectedVoices(null);
    } else {
      this.step2Substep.classList.remove('step-hidden');
      this.trackSelector.style.display = '';
      this._applyTrackSelection();
    }
    if (persist) this._savePreferences();
    if (persist && this.currentStep === 2 && this.isLoaded) this._goToStep(3);
  }

  async _loadPreferences(palo) {
    if (!this.currentUser) return;
    try {
      const prefs = await ensayoPreferencesAPI.getPreferences(palo);
      const savedTitles = (prefs && prefs.selected_titles) || [];
      this._lastSavedTitles = savedTitles;
      if (savedTitles.length > 0) {
        this.trackSelList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          const label = cb.parentElement.querySelector('.track-check-title');
          const titleText = label ? label.textContent : null;
          const wasChecked = savedTitles.includes(titleText);
          cb.checked = wasChecked;
          cb.closest('.track-check-item').classList.toggle('checked', wasChecked);
        });
      }
    } catch (err) {
      /* sin preferencias: ningún modo preseleccionado */
    }
  }

  _getSelectedTitles() {
    const allCbs = [...this.trackSelList.querySelectorAll('input[type="checkbox"]')];
    const checkedCbs = allCbs.filter(cb => cb.checked);
    if (checkedCbs.length === allCbs.length) return [];
    return checkedCbs.map(cb => {
      const label = cb.parentElement.querySelector('.track-check-title');
      return label ? label.textContent : null;
    }).filter(Boolean);
  }

  _savePreferences() {
    if (!this.currentUser || !this.currentPalo) return;
    const titles = this.currentMode === 'selection' ? this._getSelectedTitles() : [];
    ensayoPreferencesAPI.savePreferences(this.currentPalo, this.currentMode, titles).catch(() => {});
  }

  _setupTrackSelector() {
    document.getElementById('trackSelAll').addEventListener('click', () => {
      this.trackSelList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
        cb.closest('.track-check-item').classList.add('checked');
      });
      this._applyTrackSelection();
      if (this.currentMode === 'selection') this._savePreferences();
    });
    document.getElementById('trackSelNone').addEventListener('click', () => {
      [...this.trackSelList.querySelectorAll('input[type="checkbox"]')].forEach((cb, i) => {
        cb.checked = i === 0;
        cb.closest('.track-check-item').classList.toggle('checked', i === 0);
      });
      this._applyTrackSelection();
      if (this.currentMode === 'selection') this._savePreferences();
    });
  }

  _renderTrackSelector(voices) {
    this.trackSelList.innerHTML = '';
    if (!voices || voices.length === 0) { this.trackSelector.style.display = 'none'; return; }
    // No mode selected on load: keep the selector hidden until the user picks "Selección".
    this.trackSelector.style.display = 'none';
    const groups = new Map();
    voices.forEach(voice => {
      const key = voice.canonical_title || voice.title;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(voice.id);
    });
    groups.forEach((ids, label) => {
      const item = document.createElement('label');
      item.className = 'track-check-item checked';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = true; cb.dataset.ids = JSON.stringify(ids);
      const mark = document.createElement('span');
      mark.className = 'track-check-mark';
      mark.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="#C0392B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      const titleEl = document.createElement('span');
      titleEl.className = 'track-check-title'; titleEl.textContent = label;
      item.appendChild(cb); item.appendChild(mark); item.appendChild(titleEl);
      cb.addEventListener('change', () => {
        item.classList.toggle('checked', cb.checked);
        if ([...this.trackSelList.querySelectorAll('input:checked')].length === 0) {
          cb.checked = true; item.classList.add('checked');
        }
        this._applyTrackSelection();
        if (this.currentMode === 'selection') this._savePreferences();
      });
      this.trackSelList.appendChild(item);
    });
  }

  _applyTrackSelection() {
    const allCbs     = [...this.trackSelList.querySelectorAll('input')];
    const checkedCbs = allCbs.filter(cb => cb.checked);
    if (checkedCbs.length === allCbs.length) {
      this.engine.setSelectedVoices(null);
    } else {
      this.engine.setSelectedVoices(checkedCbs.flatMap(cb => JSON.parse(cb.dataset.ids)));
    }
  }

  async _handlePlayClick() {
    if (this.engine.isPlaying) {
      this.engine.stop();
      this.ensayo.stopVoice();
      this._updateVoiceIndicator('off');
      this._resetCanteInfo();
    } else {
      if (!this.isLoaded) return;
      try {
        await this.engine.play();
        if (this.voiceToggle.checked) this.ensayo.startVoice();
      } catch (err) {
        this._showError('Error al iniciar: ' + err.message);
      }
    }
  }

  // ─── Carga de palo ─────────────────────────────────────────────────────────

  async _loadPalos() {
    try {
      const palos = await canteTracksAPI.getAvailablePalos();
      this.paloGrid.innerHTML = '';
      palos.forEach(({ nombre, free }) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'palo-chip';
        chip.dataset.value = nombre;
        const label = document.createElement('span');
        label.textContent = nombre;
        chip.appendChild(label);
        if (free) {
          const tag = document.createElement('span');
          tag.className = 'palo-chip-free';
          tag.textContent = 'Free';
          chip.appendChild(tag);
        } else {
          const lock = document.createElement('img');
          lock.className = 'palo-chip-lock';
          lock.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\'><path fill=\'currentColor\' d=\'M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-8 0V6a2 2 0 0 1 4 0v2z\'/></svg>');
          lock.alt = '';
          chip.appendChild(lock);
        }
        chip.addEventListener('click', () => this._selectPalo(nombre, chip));
        this.paloGrid.appendChild(chip);
        const dl = document.getElementById('ensayoPaloSuggestions');
        if (dl) { const o = document.createElement('option'); o.value = nombre; dl.appendChild(o); }
      });
    } catch (err) {
      this._showError('Error cargando palos: ' + err.message);
    }
  }

  async _selectPalo(palo, chipEl) {
    if (this.engine.isPlaying) return;
    this.paloGrid.querySelectorAll('.palo-chip').forEach(c =>
      c.classList.toggle('selected', c === chipEl)
    );
    this.currentPalo = palo;
    this.isLoaded = false;
    this.playBtn.disabled = true;
    this._hideError();
    this._resetCanteInfo();
    this.trackSelector.style.display = 'none';
    this.trackSelList.innerHTML = '';
    if (this.voiceLoadProg) this.voiceLoadProg.textContent = '';
    if (this.step2Palo) this.step2Palo.textContent = palo;
    this.step2Substep.classList.add('step-hidden');
    this._goToStep(2);
    await this._loadPaloContent(palo);
  }

  async _loadPaloContent(palo) {
    try {
      const [palmasBase, canteVoices, samplesRows] = await Promise.all([
        ensayoAPI.getPalmasBaseByPalo(palo),
        ensayoAPI.getCanteVoicesByPalo(palo),
        ensayoAPI.getSamplesByPalo(palo).catch(() => []),
      ]);
      if (!palmasBase) {
        this._goToStep(1);
        this._showError('No hay base de palmas para ' + palo + '. Sube una desde el panel de admin.');
        return;
      }
      if (canteVoices.length === 0) {
        this._goToStep(1);
        this._showError('No hay pistas de voz para ' + palo + '. Sube voces desde el panel de admin.');
        return;
      }
      this.engine.setTempo(parseFloat(this.tempoSlider.value));
      this.engine.setPitchSemitones(parseInt(this.pitchSlider.value, 10));

      let samplesMeta = null;
      if (samplesRows.length > 0) {
        samplesMeta = {};
        samplesRows.forEach(s => { samplesMeta[s.hit_type] = s.audio_url; });
      }

      const result = await this.engine.load(palmasBase, palmasBase.audio_url, canteVoices, samplesMeta);

      this.isLoaded = true;
      this.playBtn.disabled = false;
      this._renderTrackSelector(canteVoices);
      this._buildDebugBeatGrid();
      this._attachSamplerCallbacks();
      this._updateDebugStatic();

      await this._loadPreferences(palo);

      // Background voice load progress indicator
      const total = canteVoices.length;
      if ((this.engine.loadedVoicesCount || 0) < total && this.voiceLoadProg) {
        this.voiceLoadProg.textContent = `Letras cargando: 0/${total}`;
        this.engine.onVoiceLoadProgress((n, t) => {
          if (this.currentPalo !== palo) return;
          if (this.voiceLoadProg) {
            this.voiceLoadProg.textContent = n >= t ? '' : `Letras cargando: ${n}/${t}`;
          }
        });
      }

      if (result.usingSampler) this._showCommandFlash('Sampler activo');
    } catch (err) {
      this._goToStep(1);
      this._showError('Error cargando audio: ' + err.message);
    }
  }

  // ─── UI helpers ───────────────────────────────────────────────────────────

  _updatePlayUI(isPlaying) {
    if (isPlaying) {
      this.playBtn.classList.add('is-playing');
      this.visualizer.classList.add('playing');
      this.paloGrid.querySelectorAll('.palo-chip').forEach(c => c.classList.add('locked'));
      this.voiceToggle.disabled = !this.ensayo.supported;
      this.preplay.classList.add('locked');
      this.trackSelector.classList.add('locked');
      this.modeSwitch.classList.add('locked');
      this.statusDot.className = 'status-dot cante';
      this.statusText.textContent = 'Reproduciendo cante';
      if (this._debugVisible) this._startDebugRaf();
    } else {
      this.playBtn.classList.remove('is-playing');
      this.visualizer.classList.remove('playing');
      this.paloGrid.querySelectorAll('.palo-chip').forEach(c => c.classList.remove('locked'));
      this.voiceToggle.disabled = !this.ensayo.supported;
      this.preplay.classList.remove('locked');
      this.trackSelector.classList.remove('locked');
      this.modeSwitch.classList.remove('locked');
      this.statusDot.className = 'status-dot stopped';
      this.statusText.textContent = 'Listo para empezar';
      this._stopDebugRaf();
    }
  }

  _updateFalsetaUI(falseta) {
    if (falseta) {
      this.statusDot.className = 'status-dot falseta';
      this.statusText.textContent = 'Modo falseta - solo palmas';
      this.canteTitle.textContent = 'Solo palmas';
      this.canteTitle.classList.add('empty');
    } else {
      if (this.engine.isPlaying) {
        this.statusDot.className = 'status-dot cante';
        this.statusText.textContent = 'Reproduciendo cante';
      }
    }
  }

  _updateVoiceIndicator(status) {
    this.voiceDot.className = 'voice-dot';
    if (status === 'listening')       { this.voiceDot.classList.add('on'); }
    else if (status === 'falseta')    { this.voiceDot.classList.add('falseta'); }
    else if (status === 'error')      { this.voiceDot.classList.add('error'); }
    else                              { this.voiceDot.className = 'voice-dot'; }
  }

  _resetCanteInfo() {
    this.canteTitle.textContent = 'Esperando inicio...';
    this.canteTitle.classList.add('empty');
  }

  _showLoading(msg) { this.loadingText.textContent = msg; this.ensayoLoading.style.display = 'flex'; }
  _hideLoading()    { this.ensayoLoading.style.display = 'none'; }
  _showError(msg)   { this.ensayoError.textContent = msg; this.ensayoError.style.display = 'block'; }
  _hideError()      { this.ensayoError.style.display = 'none'; }

  _showCommandFlash(text) {
    this.commandFlash.textContent = text;
    this.commandFlash.classList.add('show');
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => this.commandFlash.classList.remove('show'), 2500);
  }

  // ─── Debug panel ──────────────────────────────────────────────────────────

  _setupDebugPanel() {
    this._debugVisible = false;
    this._debugRaf = null;
    this._fuerte1Timestamps = [];
    this._canteLog = [];
    let typed = '';
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      typed += e.key.toLowerCase();
      if (typed.length > 5) typed = typed.slice(-5);
      if (typed === 'debug') { this._toggleDebugPanel(); typed = ''; }
    });
    document.getElementById('debugClose').addEventListener('click', () => {
      document.getElementById('debugPanel').style.display = 'none';
      this._debugVisible = false;
      this._stopDebugRaf();
    });
  }

  _toggleDebugPanel() {
    this._debugVisible = !this._debugVisible;
    document.getElementById('debugPanel').style.display = this._debugVisible ? 'block' : 'none';
    if (this._debugVisible) { this._updateDebugStatic(); this._renderCanteLog(); if (this.engine.isPlaying) this._startDebugRaf(); }
    else this._stopDebugRaf();
  }

  _updateDebugStatic() {
    if (!this._debugVisible) return;
    const info = this.engine.getDebugInfo();
    document.getElementById('dbgBpmConfig').textContent = info.bpm || '-';
    document.getElementById('dbgTempo').textContent = info.tempo ? `${info.tempo.toFixed(2)}x` : '-';
    document.getElementById('dbgSyncInterval').textContent = info.syncInterval ? `${info.syncInterval.toFixed(3)}s` : '-';
  }

  _buildDebugBeatGrid() {
    const grid = document.getElementById('dbgBeatGrid');
    if (!this.engine.useSampler || !this.engine.palmasSampler) {
      grid.innerHTML = '<span style="color:#8B7355;font-size:0.75rem">Sampler no activo — usando pista de audio</span>';
      return;
    }
    grid.innerHTML = '';
    this.engine.palmasSampler.hits.forEach(({ offset, hitType }, i) => {
      const cell = document.createElement('div');
      cell.className = 'debug-beat-cell' + (hitType.startsWith('fuerte') ? ' strong' : '');
      cell.id = `dbgBeat${i}`;
      const beat = offset % 1 === 0 ? `T${offset + 1}` : `T${Math.floor(offset) + 1}\u00bd`;
      cell.innerHTML = `<div class="dbc-label">${beat}</div><div class="dbc-type">${hitType}</div>`;
      grid.appendChild(cell);
    });
  }

  _attachSamplerCallbacks() {
    if (!this.engine.useSampler || !this.engine.palmasSampler) return;
    this.engine.palmasSampler.onBeat = ({ hitType, hitIndex }) => {
      if (this._debugVisible) {
        const cell = document.getElementById(`dbgBeat${hitIndex}`);
        if (cell) { cell.classList.add('flash'); setTimeout(() => cell.classList.remove('flash'), 140); }
      }
      if (hitType === 'fuerte1') {
        this._fuerte1Timestamps.push(performance.now());
        if (this._fuerte1Timestamps.length > 8) this._fuerte1Timestamps.shift();
        if (this._debugVisible) this._updateMeasuredBpm();
      }
    };
  }

  _updateMeasuredBpm() {
    const ts = this._fuerte1Timestamps;
    const el = document.getElementById('dbgBpmMeasured');
    if (ts.length < 2) { el.textContent = '-'; el.className = 'debug-val'; return; }
    const avgIntervalMs = (ts[ts.length - 1] - ts[0]) / (ts.length - 1);
    const compassBeats  = this.engine.palmasSampler ? this.engine.palmasSampler.compassBeats : 4;
    const measured      = (60000 * compassBeats / avgIntervalMs).toFixed(1);
    const diff          = Math.abs(parseFloat(measured) - this.engine.getDebugInfo().bpm);
    el.textContent = measured;
    el.className   = 'debug-val ' + (diff < 1 ? 'ok' : diff < 3 ? 'warn' : 'bad');
  }

  _recordCanteEntry(voice) {
    const info = this.engine.getDebugInfo();
    const actual = info.currentTime;
    let devMs = null;
    if (info.palmasStartTime && info.syncInterval) {
      const n = Math.round((actual - info.palmasStartTime) / info.syncInterval);
      devMs = Math.round((actual - (info.palmasStartTime + n * info.syncInterval)) * 1000);
    }
    const now = new Date();
    const ts  = `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    this._canteLog.push({ title: voice.canonical_title || voice.title, actualTime: actual.toFixed(3), devMs, ts });
    if (this._canteLog.length > 5) this._canteLog.shift();
    if (this._debugVisible) this._renderCanteLog();
  }

  _renderCanteLog() {
    const container = document.getElementById('dbgCanteLog');
    if (this._canteLog.length === 0) {
      container.innerHTML = '<span style="color:#555;font-size:0.72rem;font-style:italic">Sin entradas aun</span>';
      return;
    }
    container.innerHTML = this._canteLog.slice().reverse().map(entry => {
      let devHtml = '';
      if (entry.devMs !== null) {
        const cls  = Math.abs(entry.devMs) < 10 ? 'dev-ok' : Math.abs(entry.devMs) < 30 ? 'dev-warn' : 'dev-bad';
        const sign = entry.devMs >= 0 ? '+' : '';
        devHtml = ` <span class="${cls}">${sign}${entry.devMs}ms</span>`;
      }
      return `<div class="debug-log-entry">${entry.ts} [t=${entry.actualTime}s]${devHtml} &mdash; ${entry.title}</div>`;
    }).join('');
  }

  _startDebugRaf() {
    const tick = () => {
      if (!this._debugVisible || !this.engine.isPlaying) { this._debugRaf = null; document.getElementById('dbgNextCante').textContent = '-'; return; }
      const info = this.engine.getDebugInfo();
      if (info.nextSyncAt) {
        const rem = info.nextSyncAt - info.currentTime;
        document.getElementById('dbgNextCante').textContent = rem > 0 ? `${rem.toFixed(2)}s` : '0.00s';
      }
      this._debugRaf = requestAnimationFrame(tick);
    };
    if (this._debugRaf) cancelAnimationFrame(this._debugRaf);
    this._debugRaf = requestAnimationFrame(tick);
  }

  _stopDebugRaf() {
    if (this._debugRaf) { cancelAnimationFrame(this._debugRaf); this._debugRaf = null; }
  }

  // ─── Admin panel ──────────────────────────────────────────────────────────

  _setupAdminSecretAccess() {
    const SECRET = 'admin';
    let typed = '';
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      typed += e.key.toLowerCase();
      if (typed.length > SECRET.length) typed = typed.slice(-SECRET.length);
      if (typed === SECRET) { document.getElementById('ensayoAdminSection').style.display = ''; this._setupAdminPanel(); typed = ''; }
    });
  }

  _setupAdminPanel() {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab' + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1)).classList.add('active');
      });
    });

    const palmasAudioInput = document.getElementById('palmasAudioInput');
    document.getElementById('palmasFileBtn').addEventListener('click', () => palmasAudioInput.click());
    palmasAudioInput.addEventListener('change', () => {
      document.getElementById('palmasFileName').textContent = palmasAudioInput.files[0]?.name || 'Ningun archivo';
      this._validatePalmasForm();
    });
    ['palmasPalo','palmasTitle','palmasBpm','palmasBeats'].forEach(id =>
      document.getElementById(id).addEventListener('input', () => this._validatePalmasForm())
    );
    document.getElementById('palmasUploadBtn').addEventListener('click', () => this._handlePalmasUpload());

    const vocesAudioInput = document.getElementById('vocesAudioInput');
    document.getElementById('vocesFileBtn').addEventListener('click', () => vocesAudioInput.click());
    vocesAudioInput.addEventListener('change', () => {
      document.getElementById('vocesFileName').textContent = vocesAudioInput.files[0]?.name || 'Ningun archivo';
      this._validateVocesForm();
    });
    ['vocesPalo','vocesTitle'].forEach(id =>
      document.getElementById(id).addEventListener('input', () => this._validateVocesForm())
    );
    document.getElementById('vocesUploadBtn').addEventListener('click', () => this._handleVocesUpload());

    const samplesAudioInput = document.getElementById('samplesAudioInput');
    document.getElementById('samplesFileBtn').addEventListener('click', () => samplesAudioInput.click());
    samplesAudioInput.addEventListener('change', () => {
      document.getElementById('samplesFileName').textContent = samplesAudioInput.files[0]?.name || 'Ningun archivo';
      this._validateSamplesForm();
    });
    document.getElementById('samplesPalo').addEventListener('input', () => this._validateSamplesForm());
    document.getElementById('samplesUploadBtn').addEventListener('click', () => this._handleSamplesUpload());

    this._loadAdminLists();
  }

  _validatePalmasForm() {
    document.getElementById('palmasUploadBtn').disabled = !(
      document.getElementById('palmasPalo').value.trim() &&
      document.getElementById('palmasTitle').value.trim() &&
      document.getElementById('palmasBpm').value &&
      document.getElementById('palmasBeats').value &&
      document.getElementById('palmasAudioInput').files.length > 0
    );
  }

  _validateVocesForm() {
    document.getElementById('vocesUploadBtn').disabled = !(
      document.getElementById('vocesPalo').value.trim() &&
      document.getElementById('vocesTitle').value.trim() &&
      document.getElementById('vocesAudioInput').files.length > 0
    );
  }

  _validateSamplesForm() {
    document.getElementById('samplesUploadBtn').disabled = !(
      document.getElementById('samplesPalo').value.trim() &&
      document.getElementById('samplesAudioInput').files.length > 0
    );
  }

  async _handlePalmasUpload() {
    const palo = document.getElementById('palmasPalo').value.trim();
    const title = document.getElementById('palmasTitle').value.trim();
    const bpm = document.getElementById('palmasBpm').value;
    const beats = document.getElementById('palmasBeats').value;
    const file = document.getElementById('palmasAudioInput').files[0];
    const status = document.getElementById('palmasUploadStatus');
    document.getElementById('palmasUploadBtn').disabled = true;
    status.textContent = 'Subiendo...'; status.className = 'upload-status uploading';
    try {
      await ensayoAPI.uploadAndCreatePalmasBase(file, palo, title, bpm, beats);
      status.textContent = 'Base de palmas subida correctamente'; status.className = 'upload-status success';
      ['palmasPalo','palmasTitle'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('palmasAudioInput').value = '';
      document.getElementById('palmasFileName').textContent = 'Ningun archivo';
      this._loadAdminLists();
      setTimeout(() => { status.textContent = ''; status.className = 'upload-status'; }, 3000);
    } catch (err) {
      status.textContent = 'Error: ' + err.message; status.className = 'upload-status error';
      document.getElementById('palmasUploadBtn').disabled = false;
    }
  }

  async _handleVocesUpload() {
    const palo = document.getElementById('vocesPalo').value.trim();
    const title = document.getElementById('vocesTitle').value.trim();
    const file = document.getElementById('vocesAudioInput').files[0];
    const status = document.getElementById('vocesUploadStatus');
    document.getElementById('vocesUploadBtn').disabled = true;
    status.textContent = 'Subiendo...'; status.className = 'upload-status uploading';
    try {
      await ensayoAPI.uploadAndCreateCanteVoice(file, palo, title);
      status.textContent = 'Voz de cante subida correctamente'; status.className = 'upload-status success';
      ['vocesPalo','vocesTitle'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('vocesAudioInput').value = '';
      document.getElementById('vocesFileName').textContent = 'Ningun archivo';
      this._loadAdminLists();
      setTimeout(() => { status.textContent = ''; status.className = 'upload-status'; }, 3000);
    } catch (err) {
      status.textContent = 'Error: ' + err.message; status.className = 'upload-status error';
      document.getElementById('vocesUploadBtn').disabled = false;
    }
  }

  async _handleSamplesUpload() {
    const palo = document.getElementById('samplesPalo').value.trim();
    const hitType = document.getElementById('samplesHitType').value;
    const file = document.getElementById('samplesAudioInput').files[0];
    const status = document.getElementById('samplesUploadStatus');
    document.getElementById('samplesUploadBtn').disabled = true;
    status.textContent = 'Subiendo...'; status.className = 'upload-status uploading';
    try {
      await ensayoAPI.uploadAndCreatePalmaSample(file, palo, hitType);
      status.textContent = `Sample "${hitType}" para ${palo} subido`; status.className = 'upload-status success';
      document.getElementById('samplesPalo').value = '';
      document.getElementById('samplesAudioInput').value = '';
      document.getElementById('samplesFileName').textContent = 'Ningun archivo';
      this._renderSamplesList();
      setTimeout(() => { status.textContent = ''; status.className = 'upload-status'; }, 3000);
    } catch (err) {
      status.textContent = 'Error: ' + err.message; status.className = 'upload-status error';
      document.getElementById('samplesUploadBtn').disabled = false;
    }
  }

  async _loadAdminLists() {
    await Promise.all([
      this._renderPalmasList(),
      this._renderVocesList(),
      this._renderSamplesList(),
      this._renderAdminSuggestions(),
    ]);
  }

  async _renderPalmasList() {
    const c = document.getElementById('palmasList');
    try {
      const items = await ensayoAPI.getAllPalmasBases();
      if (items.length === 0) { c.innerHTML = '<div class="no-data-msg">No hay bases de palmas subidas aun</div>'; return; }
      c.innerHTML = '';
      items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'ensayo-track-item';
        el.innerHTML = `<div><div><strong>${this._esc(item.palo)}</strong> &mdash; ${this._esc(item.title)}</div><div class="ensayo-track-meta">${item.bpm} BPM &middot; ${item.beats_per_compas} tiempos/compas</div></div><button class="ensayo-track-delete" title="Eliminar">&times;</button>`;
        el.querySelector('.ensayo-track-delete').addEventListener('click', async () => {
          if (!confirm('Eliminar esta base de palmas?')) return;
          await ensayoAPI.deletePalmasBase(item.id, item.audio_url).catch(() => {});
          this._renderPalmasList();
        });
        c.appendChild(el);
      });
    } catch (e) { c.innerHTML = '<div class="no-data-msg">Error cargando lista</div>'; }
  }

  async _renderVocesList() {
    const c = document.getElementById('vocesList');
    try {
      const items = await ensayoAPI.getAllCanteVoices();
      if (items.length === 0) { c.innerHTML = '<div class="no-data-msg">No hay voces de cante subidas aun</div>'; return; }
      c.innerHTML = '';
      items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'ensayo-track-item';
        el.innerHTML = `<div><div><strong>${this._esc(item.palo)}</strong> &mdash; ${this._esc(item.title)}</div></div><button class="ensayo-track-delete" title="Eliminar">&times;</button>`;
        el.querySelector('.ensayo-track-delete').addEventListener('click', async () => {
          if (!confirm('Eliminar esta voz de cante?')) return;
          await ensayoAPI.deleteCanteVoice(item.id, item.audio_url).catch(() => {});
          this._renderVocesList();
        });
        c.appendChild(el);
      });
    } catch (e) { c.innerHTML = '<div class="no-data-msg">Error cargando lista</div>'; }
  }

  async _renderSamplesList() {
    const c = document.getElementById('samplesList');
    if (!c) return;
    try {
      const items = await ensayoAPI.getAllPalmasSamples();
      if (items.length === 0) { c.innerHTML = '<div class="no-data-msg">No hay samples subidos aun</div>'; return; }
      c.innerHTML = '';
      items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'ensayo-track-item';
        el.innerHTML = `<div><div><strong>${this._esc(item.palo)}</strong> &mdash; ${this._esc(item.hit_type)}</div></div><button class="ensayo-track-delete" title="Eliminar">&times;</button>`;
        el.querySelector('.ensayo-track-delete').addEventListener('click', async () => {
          if (!confirm('Eliminar este sample?')) return;
          await ensayoAPI.deletePalmaSample(item.id, item.audio_url).catch(() => {});
          this._renderSamplesList();
        });
        c.appendChild(el);
      });
    } catch (e) { c.innerHTML = '<div class="no-data-msg">Error cargando lista</div>'; }
  }

  async _renderAdminSuggestions() {
    const c = document.getElementById('adminSuggestionsList');
    if (!c) return;
    c.innerHTML = '<div class="no-data-msg">Cargando...</div>';
    try {
      const items = await suggestionsAPI.getSuggestions('date');
      if (items.length === 0) { c.innerHTML = '<div class="no-data-msg">No hay sugerencias aun</div>'; return; }
      c.innerHTML = '';
      items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'admin-suggestion-item';
        const email = item.user_email ? item.user_email.split('@')[0] : 'anonimo';
        const date = new Date(item.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        el.innerHTML = `
          <div class="admin-sug-body">
            <div class="admin-sug-title">${this._esc(item.title)}</div>
            <div class="admin-sug-meta">${email} &middot; ${date} &middot; ${item.vote_count} votos</div>
          </div>
          <select class="admin-sug-status-select" data-id="${item.id}">
            <option value="open"${item.status === 'open' ? ' selected' : ''}>Abierta</option>
            <option value="in_progress"${item.status === 'in_progress' ? ' selected' : ''}>En curso</option>
            <option value="done"${item.status === 'done' ? ' selected' : ''}>Completada</option>
          </select>`;
        el.querySelector('.admin-sug-status-select').addEventListener('change', async e => {
          const sel = e.target;
          const prev = item.status;
          try {
            await suggestionsAPI.updateSuggestionStatus(item.id, sel.value);
            item.status = sel.value;
            sel.classList.add('saved');
            setTimeout(() => sel.classList.remove('saved'), 1500);
            this._loadCommunityStrip();
          } catch (err) {
            sel.value = prev;
          }
        });
        c.appendChild(el);
      });
    } catch (e) { c.innerHTML = '<div class="no-data-msg">Error cargando sugerencias</div>'; }
  }

  _esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
}

document.addEventListener('DOMContentLoaded', () => { new EnsayoApp(); });
