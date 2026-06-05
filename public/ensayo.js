/**
 * ensayo.js - Controlador de la pagina del Modo Ensayo
 * Conecta la UI con DualStreamEngine y EnsayoMode
 */

import DualStreamEngine from '../src/dualStreamEngine.js';
import EnsayoMode from '../src/ensayoMode.js';
import { canteTracksAPI, ensayoAPI, authAPI } from '../src/supabaseClient.js';

class EnsayoApp {
  constructor() {
    this.engine = new DualStreamEngine();
    this.ensayo = new EnsayoMode(this.engine);

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
    this.trackSelector  = document.getElementById('trackSelector');
    this.trackSelList   = document.getElementById('trackSelectorList');

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
      this._recordCanteEntry(voice);
    });
  }

  // ─── EnsayoMode (voz) listeners ───────────────────────────────────────────

  _setupEnsayoListeners() {
    this.ensayo.onCommand(cmd => {
      if (cmd === 'falseta') {
        this._showCommandFlash('Falseta');
      } else if (cmd === 'vamos_alla') {
        this._showCommandFlash('Vamos alla');
      }
    });

    this.ensayo.onVoiceStatus(status => {
      this._updateVoiceIndicator(status);
    });

    // Si el navegador no soporta voz, deshabilitar toggle permanentemente
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

  // ─── Selector de pistas ────────────────────────────────────────────────────

  _setupTrackSelector() {
    document.getElementById('trackSelAll').addEventListener('click', () => {
      this.trackSelList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
        cb.closest('.track-check-item').classList.add('checked');
      });
      this._applyTrackSelection();
    });

    document.getElementById('trackSelNone').addEventListener('click', () => {
      const checkboxes = [...this.trackSelList.querySelectorAll('input[type="checkbox"]')];
      checkboxes.forEach((cb, i) => {
        // Keep at least the first one checked
        cb.checked = i === 0;
        cb.closest('.track-check-item').classList.toggle('checked', i === 0);
      });
      this._applyTrackSelection();
    });
  }

  _renderTrackSelector(voices) {
    this.trackSelList.innerHTML = '';
    if (!voices || voices.length === 0) {
      this.trackSelector.style.display = 'none';
      return;
    }
    this.trackSelector.style.display = '';

    voices.forEach(voice => {
      const item = document.createElement('label');
      item.className = 'track-check-item checked';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.dataset.id = voice.id;

      const title = document.createElement('span');
      title.className = 'track-check-title';
      title.textContent = voice.title;

      item.appendChild(cb);
      item.appendChild(title);

      cb.addEventListener('change', () => {
        item.classList.toggle('checked', cb.checked);
        // Ensure at least one stays checked
        const checked = [...this.trackSelList.querySelectorAll('input:checked')];
        if (checked.length === 0) {
          cb.checked = true;
          item.classList.add('checked');
        }
        this._applyTrackSelection();
      });

      this.trackSelList.appendChild(item);
    });
  }

  _applyTrackSelection() {
    const checked = [...this.trackSelList.querySelectorAll('input:checked')];
    const allCount = this.trackSelList.querySelectorAll('input').length;
    if (checked.length === allCount) {
      this.engine.setSelectedVoices(null);
    } else {
      this.engine.setSelectedVoices(checked.map(cb => cb.dataset.id));
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
        if (this.voiceToggle.checked) {
          this.ensayo.startVoice();
        }
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
    this.trackSelector.style.display = 'none';
    this.trackSelList.innerHTML = '';

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

      // Construir mapa de samples por hit_type si estan disponibles
      let samplesMeta = null;
      if (samplesRows.length > 0) {
        samplesMeta = {};
        samplesRows.forEach(s => { samplesMeta[s.hit_type] = s.audio_url; });
      }

      const loadingMsg = samplesMeta
        ? `Cargando ${canteVoices.length} letras + palmas + samples...`
        : `Cargando ${canteVoices.length} letras + palmas...`;
      this._showLoading(loadingMsg);

      const result = await this.engine.load(palmasBase, palmasBase.audio_url, canteVoices, samplesMeta);

      this.isLoaded = true;
      this._hideLoading();
      this.playBtn.disabled = false;
      this._renderTrackSelector(canteVoices);
      this._buildDebugBeatGrid();
      this._attachSamplerCallbacks();
      this._updateDebugStatic();

      if (result.usingSampler) {
        this._showCommandFlash('Sampler activo');
      }

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
    const dot = this.voiceDot;
    const txt = this.voiceStatusTxt;
    dot.className = 'voice-dot';

    if (status === 'listening') {
      dot.classList.add('on');
      txt.textContent = 'Escuchando...';
    } else if (status === 'falseta') {
      dot.classList.add('falseta');
      txt.textContent = 'Falseta detectada';
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

  _showCommandFlash(text) {
    this.commandFlash.textContent = text;
    this.commandFlash.classList.add('show');
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      this.commandFlash.classList.remove('show');
    }, 2500);
  }

  // ─── Debug panel ──────────────────────────────────────────────────────────

  _setupDebugPanel() {
    this._debugVisible = false;
    this._debugRaf = null;
    this._fuerte1Timestamps = []; // performance.now() of last fuerte1 hits
    this._canteLog = [];          // { title, actualTime, devMs }

    let typed = '';
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      typed += e.key.toLowerCase();
      if (typed.length > 5) typed = typed.slice(-5);
      if (typed === 'debug') {
        this._toggleDebugPanel();
        typed = '';
      }
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
    if (this._debugVisible) {
      this._updateDebugStatic();
      this._renderCanteLog();
      if (this.engine.isPlaying) this._startDebugRaf();
    } else {
      this._stopDebugRaf();
    }
  }

  _updateDebugStatic() {
    if (!this._debugVisible) return;
    const info = this.engine.getDebugInfo();
    document.getElementById('dbgBpmConfig').textContent = info.bpm || '-';
    document.getElementById('dbgTempo').textContent = info.tempo ? `${info.tempo.toFixed(2)}x` : '-';
    document.getElementById('dbgSyncInterval').textContent =
      info.syncInterval ? `${info.syncInterval.toFixed(3)}s` : '-';
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
      const beat = offset % 1 === 0 ? `T${offset + 1}` : `T${Math.floor(offset) + 1}½`;
      cell.innerHTML = `<div class="dbc-label">${beat}</div><div class="dbc-type">${hitType}</div>`;
      grid.appendChild(cell);
    });
  }

  _attachSamplerCallbacks() {
    if (!this.engine.useSampler || !this.engine.palmasSampler) return;
    this.engine.palmasSampler.onBeat = ({ hitType, hitIndex }) => {
      if (this._debugVisible) {
        const cell = document.getElementById(`dbgBeat${hitIndex}`);
        if (cell) {
          cell.classList.add('flash');
          setTimeout(() => cell.classList.remove('flash'), 140);
        }
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
    const compassBeats = this.engine.palmasSampler ? this.engine.palmasSampler.compassBeats : 4;
    const measured = (60000 * compassBeats / avgIntervalMs).toFixed(1);
    const configured = this.engine.getDebugInfo().bpm;
    const diff = Math.abs(parseFloat(measured) - configured);
    el.textContent = measured;
    el.className = 'debug-val ' + (diff < 1 ? 'ok' : diff < 3 ? 'warn' : 'bad');
  }

  _recordCanteEntry(voice) {
    const info = this.engine.getDebugInfo();
    const actual = info.currentTime;
    let devMs = null;
    if (info.palmasStartTime && info.syncInterval) {
      const elapsed = actual - info.palmasStartTime;
      const n = Math.round(elapsed / info.syncInterval);
      const expected = info.palmasStartTime + n * info.syncInterval;
      devMs = Math.round((actual - expected) * 1000);
    }
    const now = new Date();
    const ts = `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    this._canteLog.push({ title: voice.title, actualTime: actual.toFixed(3), devMs, ts });
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
        const cls = Math.abs(entry.devMs) < 10 ? 'dev-ok' : Math.abs(entry.devMs) < 30 ? 'dev-warn' : 'dev-bad';
        const sign = entry.devMs >= 0 ? '+' : '';
        devHtml = ` <span class="${cls}">${sign}${entry.devMs}ms</span>`;
      }
      return `<div class="debug-log-entry">${entry.ts} [t=${entry.actualTime}s]${devHtml} — ${entry.title}</div>`;
    }).join('');
  }

  _startDebugRaf() {
    const tick = () => {
      if (!this._debugVisible || !this.engine.isPlaying) {
        this._debugRaf = null;
        document.getElementById('dbgNextCante').textContent = '-';
        return;
      }
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
    if (this._debugRaf) {
      cancelAnimationFrame(this._debugRaf);
      this._debugRaf = null;
    }
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

    // Samples upload
    const samplesFileBtn = document.getElementById('samplesFileBtn');
    const samplesAudioInput = document.getElementById('samplesAudioInput');
    const samplesFileName = document.getElementById('samplesFileName');
    const samplesUploadBtn = document.getElementById('samplesUploadBtn');

    samplesFileBtn.addEventListener('click', () => samplesAudioInput.click());
    samplesAudioInput.addEventListener('change', () => {
      const f = samplesAudioInput.files[0];
      samplesFileName.textContent = f ? f.name : 'Ningun archivo';
      this._validateSamplesForm();
    });
    document.getElementById('samplesPalo').addEventListener('input', () => this._validateSamplesForm());
    samplesUploadBtn.addEventListener('click', () => this._handleSamplesUpload());

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
    await Promise.all([this._renderPalmasList(), this._renderVocesList(), this._renderSamplesList()]);
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
        el.innerHTML = `
          <div>
            <div><strong>${this._esc(item.palo)}</strong> — ${this._esc(item.title)}</div>
          </div>
          <button class="ensayo-track-delete" title="Eliminar">&times;</button>
        `;
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

  _validateSamplesForm() {
    const ok =
      document.getElementById('samplesPalo').value.trim() &&
      document.getElementById('samplesAudioInput').files.length > 0;
    document.getElementById('samplesUploadBtn').disabled = !ok;
  }

  async _handleSamplesUpload() {
    const palo = document.getElementById('samplesPalo').value.trim();
    const hitType = document.getElementById('samplesHitType').value;
    const file = document.getElementById('samplesAudioInput').files[0];
    const statusEl = document.getElementById('samplesUploadStatus');

    document.getElementById('samplesUploadBtn').disabled = true;
    statusEl.textContent = 'Subiendo...';
    statusEl.className = 'upload-status uploading';

    try {
      await ensayoAPI.uploadAndCreatePalmaSample(file, palo, hitType);
      statusEl.textContent = `Sample "${hitType}" para ${palo} subido correctamente`;
      statusEl.className = 'upload-status success';
      document.getElementById('samplesPalo').value = '';
      document.getElementById('samplesAudioInput').value = '';
      document.getElementById('samplesFileName').textContent = 'Ningun archivo';
      this._renderSamplesList();
      setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'upload-status'; }, 3000);
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.className = 'upload-status error';
      document.getElementById('samplesUploadBtn').disabled = false;
    }
  }

  async _renderSamplesList() {
    const container = document.getElementById('samplesList');
    if (!container) return;
    try {
      const items = await ensayoAPI.getAllPalmasSamples();
      if (items.length === 0) {
        container.innerHTML = '<div class="no-data-msg">No hay samples subidos aun</div>';
        return;
      }
      container.innerHTML = '';
      items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'ensayo-track-item';
        el.innerHTML = `
          <div>
            <div><strong>${this._esc(item.palo)}</strong> — ${this._esc(item.hit_type)}</div>
          </div>
          <button class="ensayo-track-delete" title="Eliminar">&times;</button>
        `;
        el.querySelector('.ensayo-track-delete').addEventListener('click', async () => {
          if (!confirm('Eliminar este sample?')) return;
          await ensayoAPI.deletePalmaSample(item.id, item.audio_url).catch(() => {});
          this._renderSamplesList();
        });
        container.appendChild(el);
      });
    } catch (e) {
      container.innerHTML = '<div class="no-data-msg">Error cargando lista</div>';
    }
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
