/**
 * sugerencias.js - Controlador del tablero de sugerencias de cantaor.app
 */

import { authAPI, suggestionsAPI } from '../src/supabaseClient.js';

class SugerenciasBoard {
  constructor() {
    this.currentUser = null;

    this.userBar        = document.getElementById('userBar');
    this.userBarEmail   = document.getElementById('userBarEmail');
    this.userBarLogout  = document.getElementById('userBarLogout');
    this.userBarLogin   = document.getElementById('userBarLogin');

    this._sugList       = document.getElementById('suggestionsList');
    this._newSugBtn     = document.getElementById('newSuggestionBtn');
    this._newSugForm    = document.getElementById('newSuggestionForm');
    this._cancelSugBtn  = document.getElementById('cancelSuggestionBtn');
    this._submitSugBtn  = document.getElementById('submitSuggestionBtn');
    this._sugTitle      = document.getElementById('suggestionTitle');
    this._sugDesc       = document.getElementById('suggestionDescription');
    this._sugFormErr    = document.getElementById('suggestionFormError');
    this._sortVotesBtn  = document.getElementById('sortByVotes');
    this._sortDateBtn   = document.getElementById('sortByDate');
    this._sugSortOrder   = 'votes';
    this._sugStatusFilter = 'all';
    this._userVotes      = new Set();

    this.init();
  }

  init() {
    this._setupAuth();
    this._setupBoard();
    this._loadSuggestions();
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

  _setupBoard() {
    this._newSugBtn.addEventListener('click', () => {
      if (!this.currentUser) { this._openAuthModal(); return; }
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
    if (!this.currentUser) { this._openAuthModal(); return; }
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
    } catch (err) {
      this._sugFormErr.textContent = 'Error al enviar la sugerencia. Intentalo de nuevo.';
    } finally {
      this._submitSugBtn.disabled = false;
    }
  }

  _esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
}

document.addEventListener('DOMContentLoaded', () => { new SugerenciasBoard(); });
