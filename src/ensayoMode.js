/*
 * EnsayoMode - Logica de control por voz para el modo ensayo avanzado
 *
 * Conecta la Web Speech API con el DualStreamEngine.
 * Escucha de forma continua y detecta palabras clave para controlar
 * si el cante entra o no sobre la base de palmas.
 *
 * Palabras clave por defecto:
 *   - "falseta"         → activa modo falseta (solo palmas)
 *   - "vamos alla"      → desactiva modo falseta (cante vuelve a entrar)
 *   - "vamos aya"       → alias fonético de "vamos alla" (reconocimiento impreciso)
 *
 * El reconocimiento reinicia automaticamente si se interrumpe (ej: silencio largo).
 * En navegadores sin soporte (Firefox) el modo voz simplemente no se activa.
 */

export default class EnsayoMode {
  constructor(engine) {
    this.engine = engine;

    this.recognition = null;
    this.voiceActive = false;
    this.isListening = false;
    this._shouldRestart = false;

    this.onCommandListeners = [];
    this.onVoiceStatusListeners = [];

    this._supported = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  get supported() {
    return this._supported;
  }

  // ─── Reconocimiento de voz ────────────────────────────────────────────────────

  startVoice() {
    if (!this._supported || this.voiceActive) return;
    this.voiceActive = true;
    this._shouldRestart = true;
    this._initRecognition();
    this.recognition.start();
    this._notifyVoiceStatus('listening');
  }

  stopVoice() {
    this._shouldRestart = false;
    this.voiceActive = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) { /* ignorar */ }
    }
    this.isListening = false;
    this._notifyVoiceStatus('off');
  }

  _initRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SR();
    this.recognition.lang = 'es-ES';
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 3;

    this.recognition.onstart = () => {
      this.isListening = true;
      this._notifyVoiceStatus('listening');
    };

    this.recognition.onend = () => {
      this.isListening = false;
      // Reiniciar automaticamente si seguimos en modo voz activo
      if (this._shouldRestart && this.voiceActive) {
        setTimeout(() => {
          if (this._shouldRestart && this.voiceActive) {
            try {
              this.recognition.start();
            } catch (e) {
              // Puede fallar si ya esta corriendo; ignorar
            }
          }
        }, 300);
      } else {
        this._notifyVoiceStatus('off');
      }
    };

    this.recognition.onerror = (event) => {
      // 'no-speech' y 'aborted' son normales, no son errores reales
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      console.warn('Speech recognition error:', event.error);
      this._notifyVoiceStatus('error');
    };

    this.recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!event.results[i].isFinal) continue;

        // Revisar todas las alternativas para mayor robustez
        for (let alt = 0; alt < event.results[i].length; alt++) {
          const transcript = event.results[i][alt].transcript.toLowerCase().trim();
          if (this._matchFalseta(transcript)) {
            this._handleFalseta();
            break;
          }
          if (this._matchVamosAlla(transcript)) {
            this._handleVamosAlla();
            break;
          }
        }
      }
    };
  }

  _matchFalseta(text) {
    return text.includes('falseta') || text.includes('falsetas');
  }

  _matchVamosAlla(text) {
    return (
      text.includes('vamos allá') ||
      text.includes('vamos alla') ||
      text.includes('vamos aya') ||
      text.includes('vamos ayá') ||
      text.includes('vamos ya') ||
      text.includes('vamos ahí') ||
      text.includes('a cantar')
    );
  }

  // ─── Handlers de comandos ─────────────────────────────────────────────────────

  _handleFalseta() {
    if (!this.engine.isPlaying) return;
    if (this.engine.falseta) return; // Ya estamos en falseta
    this.engine.activarFalseta();
    this._notifyCommand('falseta');
    this._notifyVoiceStatus('falseta');
  }

  _handleVamosAlla() {
    if (!this.engine.isPlaying) return;
    if (!this.engine.falseta) return; // Ya estamos con cante activo
    this.engine.reanudarCante();
    this._notifyCommand('vamos_alla');
    this._notifyVoiceStatus('listening');
  }

  // Metodos manuales para usar como fallback cuando no hay voz
  manualFalseta() { this._handleFalseta(); }
  manualVamosAlla() { this._handleVamosAlla(); }

  // ─── Eventos ──────────────────────────────────────────────────────────────────

  onCommand(cb) { this.onCommandListeners.push(cb); }
  onVoiceStatus(cb) { this.onVoiceStatusListeners.push(cb); }

  _notifyCommand(cmd) {
    this.onCommandListeners.forEach(cb => {
      try { cb(cmd); } catch (e) { /* silencio */ }
    });
  }

  _notifyVoiceStatus(status) {
    this.onVoiceStatusListeners.forEach(cb => {
      try { cb(status); } catch (e) { /* silencio */ }
    });
  }

  destroy() {
    this.stopVoice();
    this.onCommandListeners = [];
    this.onVoiceStatusListeners = [];
  }
}
