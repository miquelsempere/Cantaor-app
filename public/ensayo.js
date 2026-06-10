/**
 * ensayo.js - Controlador principal de cantaor.app
 */

import DualStreamEngine from '../src/dualStreamEngine.js';
import EnsayoMode from '../src/ensayoMode.js';
import { canteTracksAPI, ensayoAPI, authAPI, suggestionsAPI } from '../src/supabaseClient.js';

class EnsayoApp {
  constructor() {
    this.engine = new DualStreamEngine();
    this.ensayo = new EnsayoMode(this.engine);

    this.currentPalo = null;
    this.isLoaded = false;
    this.currentUser = null;

    this.selectWrapper  = document.getElementById('ensayoSelectWrapper');
    this.selectDisplay  = document.getElementById('ensayoSelectDisplay');
    this.selectText     = document.getElementById('ensayoSelectText');
    this.selectOptions  = document.getElementById('ensayoSelectOptions');
    this.playBtn        = document.getElementById('ensayoPlayBtn');
    this.btnFalseta     = document.getElementById('btnFalseta');
    this.btnVamos       = document.getElementById('btnVamos');
    this.voiceToggle    = document.getElementById('voiceToggle');
    this.visualizer     = document.getElementById('ensayoVisualizer');
    this.statusDot      = document.getElementById('statusDot');
    this.statusText     = document.getElementById('statusText');
    this.voiceDot       = document.getElementById('voiceDot');
    this.voiceStatusTxt = document.getElementById('voiceStatusText');
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
    this._fabBadge      = document.getElementById('fabBadge');

    this.init();
  }

  async init() {
    this._setupAuth();
    this._setupEngineListeners();
    this._setupEnsayoListeners();
    this._setupControls();
    this._setupTrackSelector();
    this._setupAdminSecretAccess();
    this._setupDebugPanel();
    this._setupSuggestionsBoard();
    this._loadCommunityStrip();
    await this._loadPalos();
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

  // ─── Suggestions board ─────────────────────────────────────────────────────

  _setupSuggestionsBoard() {
    this._sugOverlay   = document.getElementById('suggestionsOverlay');
    this._sugFab       = document.getElementById('suggestionsFab');
    this._sugClose     = document.getElementById('suggestionsModalClose');
    this._sugList      = document.getElementById('suggestionsList');
    this._newSugBtn    = document.getElementById('newSuggestionBtn');
    this._newSugForm   = document.getElementById('newSuggestionForm');
    this._cancelSugBtn = document.getElementById('cancelSuggestionBtn');
    this._submitSugBtn = document.getElementById('submitSuggestionBtn');
    this._sugTitle     = document.getElementById('suggestionTitle');
    this._sugDesc      = document.getElementById('suggestionDescription');
    this._sugFormErr   = document.getElementById('suggestionFormError');
    this._sortVotesBtn = document.getElementById('sortByVotes');
    this._sortDateBtn  = document.getElementById('sortByDate');
    this._sugSortOrder  = 'votes';
    this._sugStatusFilter = 'all';
    this._userVotes     = new Set();

    this._sugFab.addEventListener('click', () => this._openSuggestions());
    document.getElementById('communityOpenModal')?.addEventListener('click', () => this._openSuggestions());
    this._sugClose.addEventListener('click', () => this._closeSuggestions());
    this._sugOverlay.addEventListener('click', e => {
      if (e.target === this._sugOverlay) this._closeSuggestions();
    });
    this._newSugBtn.addEventListener('click', () => {
      if (!this.currentUser) { this._closeSuggestions(); this._openAuthModal(); return; }
      this._newSugForm.style.display = 'block';
      this._newSugBtn.style.display = 'none';
      setTimeout(() => this._sugTitle.focus(), 50);
    });
    this._cancelSugBtn.addEventListener('click', () => this._hideSugForm());
    this._submitSugBtn.addEventListener('click', () => this._submitSuggestion());
    this._sugTitle.addEventListener('keydown', e => { if (e.key === 'Enter') this._submitSuggestion(); });
    this._sortVotesBtn.addEventListener('click', () => {
      this._sugSortOrder = 'votes';
      this._sortVotesBtn.classList.add('active');
      this._sortDateBtn.classList.remove('active');
      this._renderSuggestions();
    });
    this._sortDateBtn.addEventListener('click', () => {
      this._sugSortOrder = 'date';
      this._sortDateBtn.classList.add('active');
      this._sortVotesBtn.classList.remove('active');
      this._renderSuggestions();
    });

    // Status filter tabs
    ['sfAll', 'sfInProgress', 'sfDone'].forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('click', () => {
        this._sugStatusFilter = btn.dataset.status;
        document.querySelectorAll('.status-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._loadSuggestions();
      });
    });
  }

  _openSuggestions() {
    this._sugOverlay.classList.add('open');
    this._loadSuggestions();
    sessionStorage.setItem('sug_seen', '1');
    this._sugFab.classList.remove('has-unread');
  }

  _closeSuggestions() {
    this._sugOverlay.classList.remove('open');
    this._hideSugForm();
  }

  _hideSugForm() {
    this._newSugForm.style.display = 'none';
    this._newSugBtn.style.display = '';
    this._sugTitle.value = '';
    this._sugDesc.value = '';
    this._sugFormErr.textContent = '';
  }

  async _loadSuggestions() {
    this._sugList.innerHTML = '<div class="suggestions-loading">Cargando sugerencias...</div>';
    try {
      const statusFilter = this._sugStatusFilter === 'all' ? null : this._sugStatusFilter;
      this._cachedSuggestions = await suggestionsAPI.getSuggestions('votes', statusFilter);
      this._userVotes = this.currentUser
        ? await suggestionsAPI.getUserVotes(this.currentUser.id)
        : new Set();
      this._renderSuggestions();
    } catch (err) {
      this._sugList.innerHTML = '<div class="suggestions-empty">Error cargando sugerencias.</div>';
    }
  }

  _renderSuggestions() {
    const suggestions = [...(this._cachedSuggestions || [])];
    if (this._sugSortOrder === 'date') {
      suggestions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else {
      suggestions.sort((a, b) => b.vote_count - a.vote_count);
    }
    if (suggestions.length === 0) {
      this._sugList.innerHTML = '<div class="suggestions-empty">No hay sugerencias aun. Se el primero en proponer algo!</div>';
      return;
    }
    this._sugList.innerHTML = '';
    suggestions.forEach(s => {
      const hasVoted = this._userVotes.has(s.id);
      const card = document.createElement('div');
      card.className = 'suggestion-card';
      const date  = new Date(s.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
      const email = s.user_email ? s.user_email.split('@')[0] : 'anonimo';
      const statusMap = { in_progress: ['En curso', 'status-badge--progress'], done: ['Completada', 'status-badge--done'] };
      const statusBadge = s.status && statusMap[s.status]
        ? `<span class="status-badge ${statusMap[s.status][1]}">${statusMap[s.status][0]}</span>`
        : '';
      card.innerHTML = `
        <button class="suggestion-vote-btn${hasVoted ? ' voted' : ''}" aria-label="Votar">
          <svg class="vote-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          <span class="vote-count">${s.vote_count}</span>
        </button>
        <div class="suggestion-body">
          <div class="suggestion-title-row">${statusBadge}<span class="suggestion-title">${this._esc(s.title)}</span></div>
          ${s.description ? `<div class="suggestion-description">${this._esc(s.description)}</div>` : ''}
          <div class="suggestion-meta">${email} &middot; ${date}</div>
        </div>`;
      card.querySelector('.suggestion-vote-btn').addEventListener('click', () =>
        this._handleVote(s.id, card.querySelector('.suggestion-vote-btn'))
      );
      this._sugList.appendChild(card);
    });
  }

  async _handleVote(suggestionId, voteBtn) {
    if (!this.currentUser) { this._closeSuggestions(); this._openAuthModal(); return; }
    if (voteBtn.disabled) return;
    voteBtn.disabled = true;
    const hasVoted = this._userVotes.has(suggestionId);
    const countEl  = voteBtn.querySelector('.vote-count');
    const current  = parseInt(countEl.textContent, 10);
    const s = (this._cachedSuggestions || []).find(x => x.id === suggestionId);
    if (hasVoted) {
      voteBtn.classList.remove('voted');
      countEl.textContent = current - 1;
      this._userVotes.delete(suggestionId);
      if (s) s.vote_count = Math.max(0, s.vote_count - 1);
      await suggestionsAPI.unvote(suggestionId, this.currentUser.id).catch(() => {
        voteBtn.classList.add('voted'); countEl.textContent = current; this._userVotes.add(suggestionId);
      });
    } else {
      voteBtn.classList.add('voted');
      countEl.textContent = current + 1;
      this._userVotes.add(suggestionId);
      if (s) s.vote_count = s.vote_count + 1;
      await suggestionsAPI.vote(suggestionId, this.currentUser.id).catch(() => {
        voteBtn.classList.remove('voted'); countEl.textContent = current; this._userVotes.delete(suggestionId);
      });
    }
    voteBtn.disabled = false;
    this._loadCommunityStrip();
  }

  async _submitSuggestion() {
    const title = this._sugTitle.value.trim();
    const desc  = this._sugDesc.value.trim();
    if (!title || title.length < 5) { this._sugFormErr.textContent = 'El titulo debe tener al menos 5 caracteres.'; return; }
    this._submitSugBtn.disabled = true;
    this._sugFormErr.textContent = '';
    try {
      const newSug = await suggestionsAPI.createSuggestion(title, desc, this.currentUser);
      this._cachedSuggestions = [newSug, ...(this._cachedSuggestions || [])];
      this._hideSugForm();
      this._renderSuggestions();
      this._loadCommunityStrip();
    } catch (err) {
      this._sugFormErr.textContent = 'Error al enviar la sugerencia. Intentalo de nuevo.';
    } finally {
      this._submitSugBtn.disabled = false;
    }
  }

  // ─── Community strip ───────────────────────────────────────────────────────

  async _loadCommunityStrip() {
    try {
      const [topSugs, recentDone] = await Promise.all([
        suggestionsAPI.getTopSuggestions(3),
        suggestionsAPI.getRecentlyDone(1),
      ]);
      this._renderCommunityStrip(topSugs);
      if (recentDone.length > 0) this._renderRecentlyDoneTicker(recentDone[0]);

      // Update FAB badge with total active suggestions count
      const totalActive = topSugs.length;
      if (this._fabBadge) {
        const allSugs = await suggestionsAPI.getSuggestions('votes');
        const total = allSugs.length;
        if (total > 0) {
          this._fabBadge.textContent = total;
          this._fabBadge.style.display = '';
          if (!sessionStorage.getItem('sug_seen')) {
            this._sugFab.classList.add('has-unread');
          }
        }
      }
    } catch (e) {
      // Non-critical; community strip stays hidden on error
    }
  }

  _renderCommunityStrip(topSugs) {
    const strip = document.getElementById('communityStrip');
    const cardsEl = document.getElementById('communityMiniCards');
    if (!strip || !cardsEl) return;

    if (topSugs.length === 0) {
      cardsEl.innerHTML = '<div class="community-empty">Se el primero en proponer algo. Tu voz construye esta app.</div>';
    } else {
      cardsEl.innerHTML = '';
      const statusMap = { in_progress: ['En curso', 'status-badge--progress'] };
      topSugs.forEach(s => {
        const badge = statusMap[s.status]
          ? `<span class="status-badge ${statusMap[s.status][1]}">${statusMap[s.status][0]}</span>`
          : '';
        const card = document.createElement('div');
        card.className = 'community-mini-card';
        card.innerHTML = `
          <div class="community-mini-votes">
            <span class="community-mini-vote-count">${s.vote_count}</span>
            <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </div>
          <div class="community-mini-body">
            <span class="community-mini-title">${this._esc(s.title)}</span>${badge}
          </div>`;
        cardsEl.appendChild(card);
      });
    }
    strip.style.display = '';
  }

  _renderRecentlyDoneTicker(item) {
    const ticker = document.getElementById('recentlyDoneTicker');
    const titleEl = document.getElementById('recentlyDoneTitle');
    if (!ticker || !titleEl) return;
    titleEl.textContent = item.title;
    ticker.style.display = 'flex';
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
      document.getElementById('voiceSublabel').innerHTML =
        '<span class="voice-unsupported">No disponible en este navegador (usa Chrome)</span>';
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
    this.btnFalseta.addEventListener('click', () => this.ensayo.manualFalseta());
    this.btnVamos.addEventListener('click', () => this.ensayo.manualVamosAlla());
    this.voiceToggle.addEventListener('change', e => {
      if (e.target.checked) this.ensayo.startVoice();
      else this.ensayo.stopVoice();
    });
  }

  // ─── Track selector ────────────────────────────────────────────────────────

  _setupTrackSelector() {
    document.getElementById('trackSelAll').addEventListener('click', () => {
      this.trackSelList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
        cb.closest('.track-check-item').classList.add('checked');
      });
      this._applyTrackSelection();
    });
    document.getElementById('trackSelNone').addEventListener('click', () => {
      [...this.trackSelList.querySelectorAll('input[type="checkbox"]')].forEach((cb, i) => {
        cb.checked = i === 0;
        cb.closest('.track-check-item').classList.toggle('checked', i === 0);
      });
      this._applyTrackSelection();
    });
  }

  _renderTrackSelector(voices) {
    this.trackSelList.innerHTML = '';
    if (!voices || voices.length === 0) { this.trackSelector.style.display = 'none'; return; }
    this.trackSelector.style.display = '';
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
      const titleEl = document.createElement('span');
      titleEl.className = 'track-check-title'; titleEl.textContent = label;
      item.appendChild(cb); item.appendChild(titleEl);
      cb.addEventListener('change', () => {
        item.classList.toggle('checked', cb.checked);
        if ([...this.trackSelList.querySelectorAll('input:checked')].length === 0) {
          cb.checked = true; item.classList.add('checked');
        }
        this._applyTrackSelection();
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
      this.selectOptions.innerHTML = '';
      palos.forEach(({ nombre }) => {
        const opt = document.createElement('div');
        opt.className = 'custom-select-option'; opt.dataset.value = nombre; opt.textContent = nombre;
        opt.addEventListener('click', () => this._selectPalo(nombre, opt));
        this.selectOptions.appendChild(opt);
        const dl = document.getElementById('ensayoPaloSuggestions');
        if (dl) { const o = document.createElement('option'); o.value = nombre; dl.appendChild(o); }
      });
      this.selectDisplay.addEventListener('click', e => {
        e.stopPropagation();
        this.selectOptions.classList.toggle('open');
        this.selectDisplay.classList.toggle('active');
      });
      document.addEventListener('click', () => {
        this.selectOptions.classList.remove('open');
        this.selectDisplay.classList.remove('active');
      });
      this.selectOptions.addEventListener('click', e => e.stopPropagation());
      if (palos.length > 0) {
        await this._selectPalo(palos[0].nombre, this.selectOptions.querySelector('.custom-select-option'));
      }
    } catch (err) {
      this._showError('Error cargando palos: ' + err.message);
    }
  }

  async _selectPalo(palo, optEl) {
    if (this.engine.isPlaying) return;
    this.selectOptions.querySelectorAll('.custom-select-option').forEach(o =>
      o.classList.toggle('selected', o === optEl)
    );
    this.selectText.textContent = palo;
    this.selectOptions.classList.remove('open');
    this.selectDisplay.classList.remove('active');
    this.currentPalo = palo;
    this.isLoaded = false;
    this.playBtn.disabled = true;
    this._hideError();
    this._resetCanteInfo();
    this.trackSelector.style.display = 'none';
    this.trackSelList.innerHTML = '';
    if (this.voiceLoadProg) this.voiceLoadProg.textContent = '';
    await this._loadPaloContent(palo);
  }

  async _loadPaloContent(palo) {
    this._showLoading('Buscando contenido para ' + palo + '...');
    try {
      const [palmasBase, canteVoices, samplesRows] = await Promise.all([
        ensayoAPI.getPalmasBaseByPalo(palo),
        ensayoAPI.getCanteVoicesByPalo(palo),
        ensayoAPI.getSamplesByPalo(palo).catch(() => []),
      ]);
      if (!palmasBase) {
        this._hideLoading();
        this._showError('No hay base de palmas para ' + palo + '. Sube una desde el panel de admin.');
        return;
      }
      if (canteVoices.length === 0) {
        this._hideLoading();
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

      this._showLoading('Cargando palmas...');
      const result = await this.engine.load(palmasBase, palmasBase.audio_url, canteVoices, samplesMeta);

      this.isLoaded = true;
      this._hideLoading();
      this.playBtn.disabled = false;
      this._renderTrackSelector(canteVoices);
      this._buildDebugBeatGrid();
      this._attachSamplerCallbacks();
      this._updateDebugStatic();

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
      this._hideLoading();
      this._showError('Error cargando audio: ' + err.message);
    }
  }

  // ─── UI helpers ───────────────────────────────────────────────────────────

  _updatePlayUI(isPlaying) {
    if (isPlaying) {
      this.playBtn.classList.add('is-playing');
      this.visualizer.classList.add('playing');
      this.selectWrapper.classList.add('disabled');
      this.btnFalseta.disabled = false;
      this.btnVamos.disabled = false;
      this.voiceToggle.disabled = !this.ensayo.supported;
      this.preplay.classList.add('locked');
      this.trackSelector.classList.add('locked');
      this.statusDot.className = 'status-dot cante';
      this.statusText.textContent = 'Reproduciendo cante';
      if (this._debugVisible) this._startDebugRaf();
    } else {
      this.playBtn.classList.remove('is-playing');
      this.visualizer.classList.remove('playing');
      this.selectWrapper.classList.remove('disabled');
      this.btnFalseta.disabled = true;
      this.btnVamos.disabled = true;
      this.voiceToggle.disabled = !this.ensayo.supported;
      this.preplay.classList.remove('locked');
      this.trackSelector.classList.remove('locked');
      this.statusDot.className = 'status-dot stopped';
      this.statusText.textContent = 'Listo para empezar';
      this._stopDebugRaf();
    }
  }

  _updateFalsetaUI(falseta) {
    if (falseta) {
      this.btnFalseta.classList.add('active');
      this.statusDot.className = 'status-dot falseta';
      this.statusText.textContent = 'Modo falseta - solo palmas';
      this.canteTitle.textContent = 'Solo palmas';
      this.canteTitle.classList.add('empty');
    } else {
      this.btnFalseta.classList.remove('active');
      if (this.engine.isPlaying) {
        this.statusDot.className = 'status-dot cante';
        this.statusText.textContent = 'Reproduciendo cante';
      }
    }
  }

  _updateVoiceIndicator(status) {
    this.voiceDot.className = 'voice-dot';
    if (status === 'listening')       { this.voiceDot.classList.add('on');      this.voiceStatusTxt.textContent = 'Escuchando...'; }
    else if (status === 'falseta')    { this.voiceDot.classList.add('falseta'); this.voiceStatusTxt.textContent = 'Falseta detectada'; }
    else if (status === 'error')      { this.voiceDot.classList.add('error');   this.voiceStatusTxt.textContent = 'Error de microfono'; }
    else                              {                                          this.voiceStatusTxt.textContent = 'Voz desactivada'; }
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
