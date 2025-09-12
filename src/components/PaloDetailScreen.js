/**
 * Pantalla de Detalle de Palo con información completa y estética flamenca
 */

export default class PaloDetailScreen {
  constructor(paloName, audioManager) {
    this.paloName = paloName;
    this.audioManager = audioManager;
    this.paloInfo = this.getPaloInfo(paloName);
    this.tracks = [];
    this.isLoading = true;
    this.init();
  }

  init() {
    this.render();
    this.setupEventListeners();
    this.loadPaloTracks();
  }

  getPaloInfo(paloName) {
    const paloDatabase = {
      'Soleá': {
        description: 'La Soleá es considerada la madre del flamenco, un palo profundo y melancólico que expresa el dolor y la soledad del alma andaluza.',
        origin: 'Andalucía, siglo XVIII',
        compas: '12 tiempos',
        characteristics: ['Profundo', 'Melancólico', 'Expresivo', 'Tradicional'],
        difficulty: 'Avanzado',
        masters: ['Antonio Mairena', 'Fosforito', 'Enrique Morente'],
        color: 'var(--flamenco-red)',
        icon: 'heart'
      },
      'Alegrías': {
        description: 'Las Alegrías son un palo festero de Cádiz, lleno de luz y optimismo, que invita al baile y la celebración.',
        origin: 'Cádiz, siglo XIX',
        compas: '12 tiempos',
        characteristics: ['Festero', 'Alegre', 'Bailable', 'Gaditano'],
        difficulty: 'Intermedio',
        masters: ['Chano Lobato', 'La Paquera', 'Camarón de la Isla'],
        color: 'var(--flamenco-gold)',
        icon: 'sun'
      },
      'Bulerías': {
        description: 'Las Bulerías son el palo más libre y espontáneo del flamenco, donde la improvisación y el duende se manifiestan plenamente.',
        origin: 'Jerez de la Frontera, siglo XIX',
        compas: '12 tiempos (acelerado)',
        characteristics: ['Libre', 'Improvisado', 'Festero', 'Jerezano'],
        difficulty: 'Avanzado',
        masters: ['Tomás Pavón', 'Manuel Torre', 'Terremoto de Jerez'],
        color: 'var(--flamenco-pink)',
        icon: 'zap'
      },
      'Tangos': {
        description: 'Los Tangos flamencos son un palo festero con gran fuerza rítmica, perfectos para el baile y la fiesta.',
        origin: 'Cádiz y Triana, siglo XIX',
        compas: '4 tiempos',
        characteristics: ['Rítmico', 'Festero', 'Bailable', 'Trianero'],
        difficulty: 'Intermedio',
        masters: ['Pastora Pavón', 'El Titi de Triana', 'Chocolate'],
        color: 'var(--flamenco-gold)',
        icon: 'music'
      }
    };

    return paloDatabase[paloName] || {
      description: `${paloName} es un palo tradicional del flamenco con características únicas.`,
      origin: 'Andalucía',
      compas: 'Variable',
      characteristics: ['Tradicional', 'Auténtico'],
      difficulty: 'Intermedio',
      masters: ['Maestros tradicionales'],
      color: 'var(--flamenco-red)',
      icon: 'music'
    };
  }

  render() {
    const paloDetailHTML = `
      <div class="palo-detail-container">
        <!-- Header con navegación -->
        <header class="palo-detail-header">
          <button class="back-button btn-tertiary" id="backButton">
            <svg class="back-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Volver
          </button>
          <div class="header-actions">
            <button class="icon-button favorite-btn" id="favoriteBtn">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </button>
          </div>
        </header>

        <!-- Hero Section -->
        <section class="palo-hero">
          <div class="hero-background" style="background: linear-gradient(135deg, ${this.paloInfo.color}15 0%, var(--flamenco-black)05 100%);">
            <div class="hero-icon">
              ${this.getHeroIcon(this.paloInfo.icon)}
            </div>
          </div>
          <div class="hero-content">
            <h1 class="heading-1 palo-title">${this.paloName}</h1>
            <div class="palo-meta">
              <span class="chip chip-primary">${this.paloInfo.difficulty}</span>
              <span class="meta-text">${this.paloInfo.origin}</span>
            </div>
            <p class="body-large palo-description">${this.paloInfo.description}</p>
          </div>
        </section>

        <!-- Información Técnica -->
        <section class="technical-info">
          <div class="info-grid">
            <div class="info-card">
              <div class="info-icon compas-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12,6 12,12 16,14"/>
                </svg>
              </div>
              <div class="info-content">
                <h4 class="heading-4">Compás</h4>
                <p class="body-normal">${this.paloInfo.compas}</p>
              </div>
            </div>

            <div class="info-card">
              <div class="info-icon characteristics-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <div class="info-content">
                <h4 class="heading-4">Características</h4>
                <div class="characteristics-chips">
                  ${this.paloInfo.characteristics.map(char => 
                    `<span class="chip">${char}</span>`
                  ).join('')}
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Maestros del Palo -->
        <section class="masters-section">
          <h3 class="heading-3">Maestros del ${this.paloName}</h3>
          <div class="masters-grid">
            ${this.paloInfo.masters.map(master => `
              <div class="master-card">
                <div class="master-avatar">
                  ${master.charAt(0)}
                </div>
                <div class="master-info">
                  <h4 class="master-name">${master}</h4>
                  <p class="master-title">Maestro Cantaor</p>
                </div>
              </div>
            `).join('')}
          </div>
        </section>

        <!-- Pistas Disponibles -->
        <section class="tracks-section">
          <div class="section-header">
            <h3 class="heading-3">Pistas de ${this.paloName}</h3>
            <button class="btn btn-secondary" id="shuffleTracksBtn">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="16,3 21,3 21,8"/>
                <line x1="4" y1="20" x2="21" y2="3"/>
                <polyline points="21,16 21,21 16,21"/>
                <line x1="15" y1="15" x2="21" y2="21"/>
                <line x1="4" y1="4" x2="9" y2="9"/>
              </svg>
              Aleatorio
            </button>
          </div>
          
          <div class="tracks-container" id="tracksContainer">
            ${this.isLoading ? this.renderLoadingState() : this.renderTracks()}
          </div>
        </section>

        <!-- Botón de Acción Principal -->
        <div class="action-section">
          <button class="btn btn-primary btn-large start-practice-btn" id="startPracticeBtn" ${this.isLoading ? 'disabled' : ''}>
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polygon points="10,8 16,12 10,16 10,8"/>
            </svg>
            ${this.isLoading ? 'Cargando...' : `Practicar ${this.paloName}`}
          </button>
        </div>
      </div>
    `;

    return paloDetailHTML;
  }

  getHeroIcon(iconType) {
    const icons = {
      heart: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      `,
      sun: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      `,
      zap: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/>
        </svg>
      `,
      music: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 18V5l12-2v13"/>
          <circle cx="6" cy="18" r="3"/>
          <circle cx="18" cy="16" r="3"/>
        </svg>
      `
    };

    return icons[iconType] || icons.music;
  }

  renderLoadingState() {
    return `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p class="body-normal">Cargando pistas de ${this.paloName}...</p>
      </div>
    `;
  }

  renderTracks() {
    if (this.tracks.length === 0) {
      return this.renderEmptyState();
    }

    return `
      <div class="tracks-list">
        ${this.tracks.map((track, index) => `
          <div class="track-item" data-track-id="${track.id}">
            <div class="track-number">${index + 1}</div>
            <div class="track-info">
              <h4 class="track-title">${track.title}</h4>
              <p class="track-duration">${this.formatDuration(track.duration)}</p>
            </div>
            <button class="track-play-btn" data-track-id="${track.id}">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polygon points="10,8 16,12 10,16 10,8"/>
              </svg>
            </button>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderEmptyState() {
    return `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" y1="9" x2="9.01" y2="9"/>
            <line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
        </div>
        <h4 class="heading-4">No hay pistas disponibles</h4>
        <p class="body-normal">Aún no tenemos pistas de ${this.paloName} en nuestra colección.</p>
        <button class="btn btn-secondary">Solicitar Pistas</button>
      </div>
    `;
  }

  formatDuration(seconds) {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  setupEventListeners() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('#backButton')) {
        this.goBack();
      } else if (e.target.closest('#favoriteBtn')) {
        this.toggleFavorite();
      } else if (e.target.closest('#shuffleTracksBtn')) {
        this.shuffleTracks();
      } else if (e.target.closest('#startPracticeBtn')) {
        this.startPractice();
      } else if (e.target.closest('.track-play-btn')) {
        const trackId = e.target.closest('.track-play-btn').dataset.trackId;
        this.playTrack(trackId);
      }
    });
  }

  async loadPaloTracks() {
    try {
      this.tracks = await this.audioManager.getTracksByPalo(this.paloName);
      this.isLoading = false;
      this.updateTracksContainer();
      this.updateStartButton();
    } catch (error) {
      console.error('Error loading palo tracks:', error);
      this.isLoading = false;
      this.updateTracksContainer();
    }
  }

  updateTracksContainer() {
    const container = document.getElementById('tracksContainer');
    if (container) {
      container.innerHTML = this.renderTracks();
    }
  }

  updateStartButton() {
    const button = document.getElementById('startPracticeBtn');
    if (button) {
      button.disabled = this.tracks.length === 0;
      button.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polygon points="10,8 16,12 10,16 10,8"/>
        </svg>
        ${this.tracks.length === 0 ? 'No hay pistas' : `Practicar ${this.paloName}`}
      `;
    }
  }

  goBack() {
    // Navegar de vuelta al dashboard o pantalla anterior
    window.history.back();
  }

  toggleFavorite() {
    const btn = document.getElementById('favoriteBtn');
    if (btn) {
      btn.classList.toggle('active');
      // Aquí se guardaría el estado en localStorage o base de datos
      console.log(`${this.paloName} ${btn.classList.contains('active') ? 'añadido a' : 'removido de'} favoritos`);
    }
  }

  shuffleTracks() {
    if (this.tracks.length > 0) {
      // Algoritmo Fisher-Yates para mezclar
      for (let i = this.tracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
      }
      this.updateTracksContainer();
      console.log('Pistas mezcladas aleatoriamente');
    }
  }

  async startPractice() {
    if (this.tracks.length === 0) return;
    
    try {
      // Cargar el palo en el audio manager y comenzar práctica
      await this.audioManager.loadPalo(this.paloName);
      
      // Navegar a la pantalla de práctica principal
      // Esto se implementaría según el router de la aplicación
      console.log(`Iniciando práctica de ${this.paloName}`);
      
    } catch (error) {
      console.error('Error starting practice:', error);
    }
  }

  playTrack(trackId) {
    const track = this.tracks.find(t => t.id === trackId);
    if (track) {
      console.log(`Reproduciendo: ${track.title}`);
      // Aquí se implementaría la reproducción individual de la pista
    }
  }
}