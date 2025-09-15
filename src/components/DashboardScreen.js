/**
 * Dashboard Principal "Mi Tablao" con estética flamenca moderna
 */

export default class DashboardScreen {
  constructor() {
    this.userEmail = localStorage.getItem('user_email') || 'Usuario';
    this.userName = this.userEmail.split('@')[0];
    this.init();
  }

  init() {
    this.render();
    this.setupEventListeners();
    this.loadUserStats();
  }

  render() {
    const dashboardHTML = `
      <div class="dashboard-container">
        <!-- Header Principal -->
        <header class="dashboard-header">
          <div class="header-content">
            <div class="user-greeting">
              <h1 class="heading-2 greeting-text">¡Olé, ${this.userName}!</h1>
              <p class="body-small greeting-subtitle">Bienvenido a tu tablao personal</p>
            </div>
            <div class="header-actions">
              <button class="icon-button notification-btn" id="notificationBtn">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                <span class="notification-badge">3</span>
              </button>
              <button class="icon-button profile-btn" id="profileBtn">
                <div class="profile-avatar">
                  ${this.userName.charAt(0).toUpperCase()}
                </div>
              </button>
            </div>
          </div>
        </header>

        <!-- Estadísticas Rápidas -->
        <section class="quick-stats">
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-icon practice-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polygon points="10,8 16,12 10,16 10,8"/>
                </svg>
              </div>
              <div class="stat-content">
                <span class="stat-number" id="practiceTime">0</span>
                <span class="stat-label">min practicados</span>
              </div>
            </div>
            
            <div class="stat-card">
              <div class="stat-icon streak-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
              </div>
              <div class="stat-content">
                <span class="stat-number" id="streakDays">0</span>
                <span class="stat-label">días seguidos</span>
              </div>
            </div>
            
            <div class="stat-card">
              <div class="stat-icon palos-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 11H5a2 2 0 0 0-2 2v3c0 1.1.9 2 2 2h4m6-6h4a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-4m-6 0V9a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z"/>
                </svg>
              </div>
              <div class="stat-content">
                <span class="stat-number" id="palosLearned">0</span>
                <span class="stat-label">palos dominados</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Secciones Principales -->
        <section class="main-sections">
          <div class="sections-grid">
            <!-- Práctica Rápida -->
            <div class="section-card featured-card" id="quickPractice">
              <div class="card-header">
                <div class="card-icon quick-practice-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polygon points="10,8 16,12 10,16 10,8"/>
                  </svg>
                </div>
                <div class="card-title-group">
                  <h3 class="heading-4 card-title">Práctica Rápida</h3>
                  <p class="body-small card-subtitle">Continúa donde lo dejaste</p>
                </div>
              </div>
              <div class="card-content">
                <div class="last-practice-info">
                  <span class="chip chip-primary">Soleá</span>
                  <span class="practice-progress">75% completado</span>
                </div>
              </div>
              <div class="card-actions">
                <button class="btn btn-primary">Continuar Práctica</button>
              </div>
            </div>

            <!-- Explorar Palos -->
            <div class="section-card" id="explorePalos">
              <div class="card-header">
                <div class="card-icon explore-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="M21 21l-4.35-4.35"/>
                  </svg>
                </div>
                <div class="card-title-group">
                  <h3 class="heading-4 card-title">Explorar Palos</h3>
                  <p class="body-small card-subtitle">Descubre nuevos estilos</p>
                </div>
              </div>
              <div class="card-content">
                <div class="palos-preview">
                  <span class="chip">Alegrías</span>
                  <span class="chip">Bulerías</span>
                  <span class="chip">Tangos</span>
                  <span class="more-indicator">+5 más</span>
                </div>
              </div>
            </div>

            <!-- Mi Progreso -->
            <div class="section-card" id="myProgress">
              <div class="card-header">
                <div class="card-icon progress-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                  </svg>
                </div>
                <div class="card-title-group">
                  <h3 class="heading-4 card-title">Mi Progreso</h3>
                  <p class="body-small card-subtitle">Seguimiento detallado</p>
                </div>
              </div>
              <div class="card-content">
                <div class="progress-preview">
                  <div class="progress-bar-container">
                    <div class="progress-bar">
                      <div class="progress-fill" style="width: 65%"></div>
                    </div>
                    <span class="progress-text">Nivel Intermedio</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Configuración -->
            <div class="section-card" id="settings">
              <div class="card-header">
                <div class="card-icon settings-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </div>
                <div class="card-title-group">
                  <h3 class="heading-4 card-title">Configuración</h3>
                  <p class="body-small card-subtitle">Personaliza tu experiencia</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Botón de Acción Flotante -->
        <button class="fab" id="mainFab">
          <svg class="fab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>

        <!-- Menú FAB (oculto inicialmente) -->
        <div class="fab-menu" id="fabMenu">
          <button class="fab-option" data-action="new-practice">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polygon points="10,8 16,12 10,16 10,8"/>
            </svg>
            <span class="fab-label">Nueva Práctica</span>
          </button>
          <button class="fab-option" data-action="record-session">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span class="fab-label">Grabar Sesión</span>
          </button>
          <button class="fab-option" data-action="quick-tune">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18V5l12-2v13"/>
              <circle cx="6" cy="18" r="3"/>
              <circle cx="18" cy="16" r="3"/>
            </svg>
            <span class="fab-label">Afinador</span>
          </button>
        </div>
      </div>
    `;

    return dashboardHTML;
  }

  setupEventListeners() {
    // FAB principal
    document.addEventListener('click', (e) => {
      if (e.target.closest('#mainFab')) {
        this.toggleFabMenu();
      } else if (e.target.closest('.fab-option')) {
        const action = e.target.closest('.fab-option').dataset.action;
        this.handleFabAction(action);
      } else if (e.target.closest('.section-card')) {
        const cardId = e.target.closest('.section-card').id;
        this.handleSectionClick(cardId);
      } else if (e.target.closest('#notificationBtn')) {
        this.showNotifications();
      } else if (e.target.closest('#profileBtn')) {
        this.showProfile();
      }
    });

    // Cerrar FAB menu al hacer click fuera
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.fab') && !e.target.closest('.fab-menu')) {
        this.closeFabMenu();
      }
    });
  }

  toggleFabMenu() {
    const fabMenu = document.getElementById('fabMenu');
    const mainFab = document.getElementById('mainFab');
    
    if (fabMenu && mainFab) {
      const isOpen = fabMenu.classList.contains('open');
      
      if (isOpen) {
        this.closeFabMenu();
      } else {
        fabMenu.classList.add('open');
        mainFab.classList.add('open');
      }
    }
  }

  closeFabMenu() {
    const fabMenu = document.getElementById('fabMenu');
    const mainFab = document.getElementById('mainFab');
    
    if (fabMenu && mainFab) {
      fabMenu.classList.remove('open');
      mainFab.classList.remove('open');
    }
  }

  handleFabAction(action) {
    this.closeFabMenu();
    
    switch (action) {
      case 'new-practice':
        this.startNewPractice();
        break;
      case 'record-session':
        this.startRecording();
        break;
      case 'quick-tune':
        this.openTuner();
        break;
    }
  }

  handleSectionClick(sectionId) {
    switch (sectionId) {
      case 'quickPractice':
        this.continuePractice();
        break;
      case 'explorePalos':
        this.showPalosExplorer();
        break;
      case 'myProgress':
        this.showProgressDetails();
        break;
      case 'settings':
        this.showSettings();
        break;
    }
  }

  async loadUserStats() {
    // Simular carga de estadísticas del usuario
    try {
      // En una aplicación real, esto vendría de una API
      const stats = {
        practiceTime: Math.floor(Math.random() * 120) + 30,
        streakDays: Math.floor(Math.random() * 15) + 1,
        palosLearned: Math.floor(Math.random() * 8) + 2
      };

      // Animar los números
      this.animateStatNumber('practiceTime', stats.practiceTime);
      this.animateStatNumber('streakDays', stats.streakDays);
      this.animateStatNumber('palosLearned', stats.palosLearned);

    } catch (error) {
      console.error('Error loading user stats:', error);
    }
  }

  animateStatNumber(elementId, targetValue) {
    const element = document.getElementById(elementId);
    if (!element) return;

    let currentValue = 0;
    const increment = targetValue / 30; // 30 frames de animación
    const duration = 1000; // 1 segundo
    const frameTime = duration / 30;

    const animate = () => {
      currentValue += increment;
      if (currentValue >= targetValue) {
        element.textContent = targetValue;
        return;
      }
      
      element.textContent = Math.floor(currentValue);
      setTimeout(animate, frameTime);
    };

    setTimeout(animate, Math.random() * 500); // Delay aleatorio para efecto escalonado
  }

  // Métodos de navegación
  startNewPractice() {
    console.log('Iniciando nueva práctica...');
    // Aquí se navegaría a la pantalla de selección de palo
  }

  continuePractice() {
    console.log('Continuando práctica...');
    // Aquí se navegaría a la última sesión de práctica
  }

  showPalosExplorer() {
    console.log('Mostrando explorador de palos...');
    // Aquí se navegaría a la pantalla de exploración de palos
  }

  showProgressDetails() {
    console.log('Mostrando detalles de progreso...');
    // Aquí se navegaría a la pantalla de progreso detallado
  }

  showSettings() {
    console.log('Mostrando configuración...');
    // Aquí se navegaría a la pantalla de configuración
  }

  startRecording() {
    console.log('Iniciando grabación...');
    // Aquí se iniciaría la funcionalidad de grabación
  }

  openTuner() {
    console.log('Abriendo afinador...');
    // Aquí se abriría el afinador
  }

  showNotifications() {
    console.log('Mostrando notificaciones...');
    // Aquí se mostrarían las notificaciones
  }

  showProfile() {
    console.log('Mostrando perfil...');
    // Aquí se navegaría al perfil del usuario
  }
}