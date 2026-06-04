/**
 * ensayo.js - Controlador de la pagina del Modo Ensayo
 * Conecta la UI con DualStreamEngine y EnsayoMode
 */

import DualStreamEngine from '../src/dualStreamEngine.js';
import EnsayoMode from '../src/ensayoMode.js';
import { canteTracksAPI, ensayoAPI, authAPI } from '../src/supabaseClient.js';

// ─── KaraokeSync ─────────────────────────────────────────────────────────────
// Matches timePlayed (source seconds) against word timestamps from lyrics_json.
class KaraokeSync {
  constructor() {
    this._words = [];     // [{ start, end, word }]
    this._activeIdx = -1;
  }

  load(wordsArray) {
    this._words = Array.isArray(wordsArray) ? wordsArray : [];
    this._activeIdx = -1;
  }

  /** Returns the index of the active word, or -1. */
  tick(timePlayed) {
    if (this._words.length === 0) return -1;
    for (let i = 0; i < this._words.length; i++) {
      const w = this._words[i];
      if (timePlayed >= w.start && timePlayed < w.end) return i;
    }
    // Past last word end
    if (timePlayed >= this._words[this._words.length - 1].end) {
      return this._words.length; // sentinel: all done
    }
    return -1;
  }

  get words() { return this._words; }
}

class EnsayoApp {
  constructor() {
    this.engine = new DualStreamEngine();
    this.ensayo = new EnsayoMode(this.engine);
    this.karaoke = new KaraokeSync();

    this.currentPalo = null;
    this.isLoaded = false;
    this.currentUser = null;

    // UI refs
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
    this.karaokePanel   = document.getElementById('karaokePanel');
    this.karaokeWords   = document.getElementById('karaokeWords');
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

    this.init();
  }

  async init() {
    this._setupAuth();
    this._setupEngineListeners();
    this._setupEnsayoListeners();
    this._setupControls();
    this._setupAdminSecretAccess();
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
  }

  _updateUserBar() {
    if (this.currentUser) {
      this.userBar.style.display = 'flex';
      this.userBarEmail.textContent = this.currentUser.email;
    } else {
      this.userBar.style.display = 'none';
    }
  }

  // ─── Engine listeners ──────────────────────────────────────────────────────

  _setupEngineListeners() {
    this.engine.onStateChange(({ isPlaying, falseta }) => {
      this._updatePlayUI(isPlaying);
      this._updateFalsetaUI(falseta);
    });

    this.engine.onCanteEnter(voice => {
      this.canteTitle.textContent = voice.title;
      this.canteTitle.classList.remove('empty');
      this._loadKaraoke(voice.lyrics_json || null);
    });

    this.engine.onCanteTick(timePlayed => {
      this._tickKaraoke(timePlayed);
    });
  }

  // ─── EnsayoMode (voz) listeners ───────────────────────────────────────────

  _setupEnsayoListeners() {
    this.ensayo.onCommand(cmd => {
      if (cmd === 'falseta') {
        this._showCommandFlash('Ole');
      } else if (cmd === 'vamos_alla') {
        this._showCommandFlash('Vamos alla');
      }
    });

    this.ensayo.onVoiceStatus(status => {
      this._updateVoiceIndicator(status);
    });

    // Si el navegador no soporta voz, deshabilitar toggle
    if (!this.ensayo.supported) {
      this.voiceToggle.disabled = true;
      document.getElementById('voiceSublabel').innerHTML =
        '<span class="voice-unsupported">No disponible en este navegador (usa Chrome)</span>';
    }
  }

  // ─── Controles ─────────────────────────────────────────────────────────────

  _setupControls() {
    // Play/Stop
    this.playBtn.addEventListener('click', () => this._handlePlayClick());
    document.addEventListener('keydown', e => {
      if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        if (!this.playBtn.disabled) this._handlePlayClick();
      }
    });

    // Tempo
    this.tempoSlider.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      this.engine.setTempo(v);
      this.tempoValue.textContent = `${v.toFixed(2)}x`;
    });

    // Pitch
    this.pitchSlider.addEventListener('input', e => {
      const s = parseInt(e.target.value, 10);
      this.engine.setPitchSemitones(s);
      this.pitchValue.textContent = `Traste ${s + 5}`;
    });

    // Botones manuales falseta/vamos
    this.btnFalseta.addEventListener('click', () => this.ensayo.manualFalseta());
    this.btnVamos.addEventListener('click', () => this.ensayo.manualVamosAlla());

    // Toggle de voz
    this.voiceToggle.addEventListener('change', e => {
      if (e.target.checked) {
        this.ensayo.startVoice();
      } else {
        this.ensayo.stopVoice();
      }
    });
  }

  // ─── Playback ──────────────────────────────────────────────────────────────

  async _handlePlayClick() {
    if (this.engine.isPlaying) {
      this.engine.stop();
      this.ensayo.stopVoice();
      this.voiceToggle.checked = false;
      this._updateVoiceIndicator('off');
      this._resetCanteInfo();
    } else {
      if (!this.isLoaded) return;
      try {
        await this.engine.play();
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
        opt.className = 'custom-select-option';
        opt.dataset.value = nombre;
        opt.textContent = nombre;
        opt.addEventListener('click', () => this._selectPalo(nombre, opt));
        this.selectOptions.appendChild(opt);

        // Populamos datalists del admin
        ['ensayoPaloSuggestions'].forEach(id => {
          const dl = document.getElementById(id);
          if (dl) {
            const o = document.createElement('option');
            o.value = nombre;
            dl.appendChild(o);
          }
        });
      });

      // Click en el display abre/cierra
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

      // Autoseleccionar el primero
      if (palos.length > 0) {
        const firstOpt = this.selectOptions.querySelector('.custom-select-option');
        await this._selectPalo(palos[0].nombre, firstOpt);
      }
    } catch (err) {
      this._showError('Error cargando palos: ' + err.message);
    }
  }

  async _selectPalo(palo, optEl) {
    if (this.engine.isPlaying) return;

    // Marcar seleccionado visualmente
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

    await this._loadPaloContent(palo);
  }

  async _loadPaloContent(palo) {
    this._showLoading('Buscando contenido para ' + palo + '...');

    try {
      const [palmasBase, canteVoices] = await Promise.all([
        ensayoAPI.getPalmasBaseByPalo(palo),
        ensayoAPI.getCanteVoicesByPalo(palo),
      ]);

      if (!palmasBase) {
        this._hideLoading();
        this._showError(
          'No hay base de palmas para ' + palo + '. Sube una desde el panel de admin.'
        );
        return;
      }

      if (canteVoices.length === 0) {
        this._hideLoading();
        this._showError(
          'No hay pistas de voz para ' + palo + '. Sube voces desde el panel de admin.'
        );
        return;
      }

      // Configurar tempo/pitch actuales antes de cargar
      this.engine.setTempo(parseFloat(this.tempoSlider.value));
      this.engine.setPitchSemitones(parseInt(this.pitchSlider.value, 10));

      this._showLoading(
        `Cargando ${canteVoices.length} letras + palmas...`
      );

      await this.engine.load(palmasBase, palmasBase.audio_url, canteVoices);

      this.isLoaded = true;
      this._hideLoading();
      this.playBtn.disabled = false;

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
      this.statusDot.className = 'status-dot cante';
      this.statusText.textContent = 'Reproduciendo cante';
    } else {
      this.playBtn.classList.remove('is-playing');
      this.visualizer.classList.remove('playing');
      this.selectWrapper.classList.remove('disabled');
      this.btnFalseta.disabled = true;
      this.btnVamos.disabled = true;
      this.voiceToggle.disabled = true;
      this.preplay.classList.remove('locked');
      this.statusDot.className = 'status-dot stopped';
      this.statusText.textContent = 'Listo para empezar';
    }
  }

  _updateFalsetaUI(falseta) {
    if (falseta) {
      this.btnFalseta.classList.add('active');
      this.statusDot.className = 'status-dot falseta';
      this.statusText.textContent = 'Modo ole - solo palmas';
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
    const dot = this.voiceDot;
    const txt = this.voiceStatusTxt;
    dot.className = 'voice-dot';

    if (status === 'listening') {
      dot.classList.add('on');
      txt.textContent = 'Escuchando...';
    } else if (status === 'falseta') {
      dot.classList.add('falseta');
      txt.textContent = 'Ole detectado';
    } else if (status === 'error') {
      dot.classList.add('error');
      txt.textContent = 'Error de microfono';
    } else {
      txt.textContent = 'Voz desactivada';
    }
  }

  _resetCanteInfo() {
    this.canteTitle.textContent = 'Esperando inicio...';
    this.canteTitle.classList.add('empty');
    this._loadKaraoke(null);
  }

  _loadKaraoke(wordsArray) {
    this.karaoke.load(wordsArray);
    if (!this.karaokePanel) return;
    if (!wordsArray || wordsArray.length === 0) {
      this.karaokePanel.style.display = 'none';
      return;
    }
    this.karaokePanel.style.display = '';
    this._renderKaraokeWords(-1);
  }

  _renderKaraokeWords(activeIdx) {
    if (!this.karaokeWords) return;
    const words = this.karaoke.words;
    this.karaokeWords.innerHTML = words
      .map((w, i) => {
        const cls = i === activeIdx ? 'karaoke-word active' : 'karaoke-word';
        return `<span class="${cls}">${this._esc(w.word)}</span>`;
      })
      .join(' ');
  }

  _tickKaraoke(timePlayed) {
    const idx = this.karaoke.tick(timePlayed);
    if (idx === this.karaoke._activeIdx) return;
    this.karaoke._activeIdx = idx;
    this._renderKaraokeWords(idx);
    // Scroll active word into view
    if (this.karaokeWords && idx >= 0) {
      const activeEl = this.karaokeWords.querySelector('.karaoke-word.active');
      if (activeEl) activeEl.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }

  _showLoading(msg) {
    this.loadingText.textContent = msg;
    this.ensayoLoading.style.display = 'flex';
  }

  _hideLoading() {
    this.ensayoLoading.style.display = 'none';
  }

  _showError(msg) {
    this.ensayoError.textContent = msg;
    this.ensayoError.style.display = 'block';
  }

  _hideError() {
    this.ensayoError.style.display = 'none';
  }

  _showCommandFlash(text) {
    this.commandFlash.textContent = text;
    this.commandFlash.classList.add('show');
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      this.commandFlash.classList.remove('show');
    }, 2500);
  }

  // ─── Admin panel ──────────────────────────────────────────────────────────

  _setupAdminSecretAccess() {
    const SECRET = 'admin';
    let typed = '';
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      typed += e.key.toLowerCase();
      if (typed.length > SECRET.length) typed = typed.slice(-SECRET.length);
      if (typed === SECRET) {
        document.getElementById('ensayoAdminSection').style.display = '';
        this._setupAdminPanel();
        typed = '';
      }
    });
  }

  _setupAdminPanel() {
    // Tabs
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab' + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1)).classList.add('active');
      });
    });

    // Palmas upload
    const palmasFileBtn = document.getElementById('palmasFileBtn');
    const palmasAudioInput = document.getElementById('palmasAudioInput');
    const palmasFileName = document.getElementById('palmasFileName');
    const palmasUploadBtn = document.getElementById('palmasUploadBtn');

    palmasFileBtn.addEventListener('click', () => palmasAudioInput.click());
    palmasAudioInput.addEventListener('change', () => {
      const f = palmasAudioInput.files[0];
      palmasFileName.textContent = f ? f.name : 'Ningun archivo';
      this._validatePalmasForm();
    });
    ['palmasPalo', 'palmasTitle', 'palmasBpm', 'palmasBeats'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => this._validatePalmasForm());
    });
    palmasUploadBtn.addEventListener('click', () => this._handlePalmasUpload());

    // Voces upload
    const vocesFileBtn = document.getElementById('vocesFileBtn');
    const vocesAudioInput = document.getElementById('vocesAudioInput');
    const vocesFileName = document.getElementById('vocesFileName');
    const vocesUploadBtn = document.getElementById('vocesUploadBtn');

    vocesFileBtn.addEventListener('click', () => vocesAudioInput.click());
    vocesAudioInput.addEventListener('change', () => {
      const f = vocesAudioInput.files[0];
      vocesFileName.textContent = f ? f.name : 'Ningun archivo';
      this._validateVocesForm();
    });
    ['vocesPalo', 'vocesTitle'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => this._validateVocesForm());
    });
    vocesUploadBtn.addEventListener('click', () => this._handleVocesUpload());

    // Cargar listas
    this._loadAdminLists();
  }

  _validatePalmasForm() {
    const ok =
      document.getElementById('palmasPalo').value.trim() &&
      document.getElementById('palmasTitle').value.trim() &&
      document.getElementById('palmasBpm').value &&
      document.getElementById('palmasBeats').value &&
      document.getElementById('palmasAudioInput').files.length > 0;
    document.getElementById('palmasUploadBtn').disabled = !ok;
  }

  _validateVocesForm() {
    const ok =
      document.getElementById('vocesPalo').value.trim() &&
      document.getElementById('vocesTitle').value.trim() &&
      document.getElementById('vocesAudioInput').files.length > 0;
    document.getElementById('vocesUploadBtn').disabled = !ok;
  }

  async _handlePalmasUpload() {
    const palo = document.getElementById('palmasPalo').value.trim();
    const title = document.getElementById('palmasTitle').value.trim();
    const bpm = document.getElementById('palmasBpm').value;
    const beats = document.getElementById('palmasBeats').value;
    const file = document.getElementById('palmasAudioInput').files[0];
    const statusEl = document.getElementById('palmasUploadStatus');

    document.getElementById('palmasUploadBtn').disabled = true;
    statusEl.textContent = 'Subiendo...';
    statusEl.className = 'upload-status uploading';

    try {
      await ensayoAPI.uploadAndCreatePalmasBase(file, palo, title, bpm, beats);
      statusEl.textContent = 'Base de palmas subida correctamente';
      statusEl.className = 'upload-status success';
      document.getElementById('palmasPalo').value = '';
      document.getElementById('palmasTitle').value = '';
      document.getElementById('palmasAudioInput').value = '';
      document.getElementById('palmasFileName').textContent = 'Ningun archivo';
      this._loadAdminLists();
      setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'upload-status'; }, 3000);
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.className = 'upload-status error';
      document.getElementById('palmasUploadBtn').disabled = false;
    }
  }

  async _handleVocesUpload() {
    const palo = document.getElementById('vocesPalo').value.trim();
    const title = document.getElementById('vocesTitle').value.trim();
    const file = document.getElementById('vocesAudioInput').files[0];
    const statusEl = document.getElementById('vocesUploadStatus');

    document.getElementById('vocesUploadBtn').disabled = true;
    statusEl.textContent = 'Subiendo...';
    statusEl.className = 'upload-status uploading';

    try {
      await ensayoAPI.uploadAndCreateCanteVoice(file, palo, title);
      statusEl.textContent = 'Voz de cante subida correctamente';
      statusEl.className = 'upload-status success';
      document.getElementById('vocesPalo').value = '';
      document.getElementById('vocesTitle').value = '';
      document.getElementById('vocesAudioInput').value = '';
      document.getElementById('vocesFileName').textContent = 'Ningun archivo';
      this._loadAdminLists();
      setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'upload-status'; }, 3000);
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.className = 'upload-status error';
      document.getElementById('vocesUploadBtn').disabled = false;
    }
  }

  async _loadAdminLists() {
    await Promise.all([this._renderPalmasList(), this._renderVocesList()]);
  }

  async _renderPalmasList() {
    const container = document.getElementById('palmasList');
    try {
      const items = await ensayoAPI.getAllPalmasBases();
      if (items.length === 0) {
        container.innerHTML = '<div class="no-data-msg">No hay bases de palmas subidas aun</div>';
        return;
      }
      container.innerHTML = '';
      items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'ensayo-track-item';
        el.innerHTML = `
          <div>
            <div><strong>${this._esc(item.palo)}</strong> — ${this._esc(item.title)}</div>
            <div class="ensayo-track-meta">${item.bpm} BPM · ${item.beats_per_compas} tiempos/compas</div>
          </div>
          <button class="ensayo-track-delete" title="Eliminar">&times;</button>
        `;
        el.querySelector('.ensayo-track-delete').addEventListener('click', async () => {
          if (!confirm('Eliminar esta base de palmas?')) return;
          await ensayoAPI.deletePalmasBase(item.id, item.audio_url).catch(() => {});
          this._renderPalmasList();
        });
        container.appendChild(el);
      });
    } catch (e) {
      container.innerHTML = '<div class="no-data-msg">Error cargando lista</div>';
    }
  }

  async _renderVocesList() {
    const container = document.getElementById('vocesList');
    try {
      const items = await ensayoAPI.getAllCanteVoices();
      if (items.length === 0) {
        container.innerHTML = '<div class="no-data-msg">No hay voces de cante subidas aun</div>';
        return;
      }
      container.innerHTML = '';
      items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'ensayo-track-item';

        const badgeHtml = this._voiceLyricsBadge(item);

        el.innerHTML = `
          <div style="flex:1;min-width:0">
            <div><strong>${this._esc(item.palo)}</strong> — ${this._esc(item.title)}</div>
            <div class="voice-lyrics-action">${badgeHtml}</div>
          </div>
          <button class="ensayo-track-delete" title="Eliminar">&times;</button>
        `;

        const actionEl = el.querySelector('.voice-lyrics-action');
        if (item.lyrics_status !== 'done' && item.lyrics_status !== 'processing') {
          const btn = actionEl.querySelector('.track-transcribe-btn');
          if (btn) {
            btn.addEventListener('click', () => this._handleVoiceTranscribe(item.id, actionEl));
          }
        }

        el.querySelector('.ensayo-track-delete').addEventListener('click', async () => {
          if (!confirm('Eliminar esta voz de cante?')) return;
          await ensayoAPI.deleteCanteVoice(item.id, item.audio_url).catch(() => {});
          this._renderVocesList();
        });
        container.appendChild(el);
      });
    } catch (e) {
      container.innerHTML = '<div class="no-data-msg">Error cargando lista</div>';
    }
  }

  _voiceLyricsBadge(item) {
    if (item.lyrics_status === 'done') {
      return '<span class="lyrics-badge lyrics-badge--done">Letra lista</span>';
    }
    if (item.lyrics_status === 'processing') {
      return '<span class="lyrics-badge lyrics-badge--processing">Transcribiendo...</span>';
    }
    return '<button class="track-transcribe-btn">Transcribir letra</button>';
  }

  async _handleVoiceTranscribe(voiceId, actionEl) {
    const btn = actionEl.querySelector('.track-transcribe-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

    try {
      await ensayoAPI.triggerVoiceTranscription(voiceId);
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Transcribir letra'; }
      return;
    }

    actionEl.innerHTML = '<span class="lyrics-badge lyrics-badge--processing">Transcribiendo...</span>';
    this._pollVoiceLyrics(voiceId, actionEl);
  }

  _pollVoiceLyrics(voiceId, actionEl, attempt = 0) {
    const MAX = 36;
    if (attempt >= MAX) {
      actionEl.innerHTML = '<button class="track-transcribe-btn">Reintentar</button>';
      actionEl.querySelector('.track-transcribe-btn').addEventListener('click', () =>
        this._handleVoiceTranscribe(voiceId, actionEl)
      );
      return;
    }
    setTimeout(async () => {
      try {
        const result = await ensayoAPI.getVoiceLyricsStatus(voiceId);
        if (result?.lyrics_status === 'done') {
          actionEl.innerHTML = '<span class="lyrics-badge lyrics-badge--done">Letra lista</span>';
          // Update the in-memory voice object so karaoke loads immediately on next play
          const voice = this.engine.canteVoices.find(v => v.id === voiceId);
          if (voice && result.lyrics_json) voice.lyrics_json = result.lyrics_json;
        } else if (result?.lyrics_status === 'error') {
          actionEl.innerHTML = '<button class="track-transcribe-btn">Reintentar</button>';
          actionEl.querySelector('.track-transcribe-btn').addEventListener('click', () =>
            this._handleVoiceTranscribe(voiceId, actionEl)
          );
        } else {
          this._pollVoiceLyrics(voiceId, actionEl, attempt + 1);
        }
      } catch {
        this._pollVoiceLyrics(voiceId, actionEl, attempt + 1);
      }
    }, 5000);
  }

  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new EnsayoApp();
});
