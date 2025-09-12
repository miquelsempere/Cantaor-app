/**
 * Pantalla de Perfil y Configuración con estética flamenca moderna
 */

export default class ProfileSettingsScreen {
  constructor() {
    this.userEmail = localStorage.getItem('user_email') || 'usuario@email.com';
    this.userName = this.userEmail.split('@')[0];
    this.settings = this.loadSettings();
    this.init();
  }

  loadSettings() {
    const defaultSettings = {
      notifications: true,
      autoPlay: false,
      defaultTempo: 1.0,
      defaultVolume: 0.8,
      theme: 'light',
      language: 'es',
      practiceReminders: true,
      weeklyGoal: 30 // minutos por semana
    };

    const savedSettings = localStorage.getItem('user_settings');
    return savedSettings ? { ...defaultSettings, ...JSON.parse(savedSettings) } : defaultSettings;
  }

  saveSettings() {
    localStorage.setItem('user_settings', JSON.stringify(this.settings));
  }

  init() {
    this.render();
    this.setupEventListeners();
    this.loadUserStats();
  }

  render() {
    const profileHTML = `
      <div class="profile-container">
        <!-- Header -->
        <header class="profile-header">
          <button class="back-button btn-tertiary" id="backButton">
            <svg class="back-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Volver
          </button>
          <h1 class="heading-3">Mi Perfil</h1>
          <div class="header-spacer"></div>
        </header>

        <!-- Perfil del Usuario -->
        <section class="user-profile-section">
          <div class="profile-card card">
            <div class="profile-avatar-large">
              ${this.userName.charAt(0).toUpperCase()}
            </div>
            <div class="profile-info">
              <h2 class="heading-3 profile-name">${this.userName}</h2>
              <p class="body-normal profile-email">${this.userEmail}</p>
              <div class="profile-badges">
                <span class="chip chip-accent">Guitarrista</span>
                <span class="chip">Nivel Intermedio</span>
              </div>
            </div>
            <button class="btn btn-secondary edit-profile-btn" id="editProfileBtn">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Editar
            </button>
          </div>
        </section>

        <!-- Estadísticas Personales -->
        <section class="personal-stats-section">
          <h3 class="heading-4 section-title">Tu Progreso</h3>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polygon points="10,8 16,12 10,16 10,8"/>
                </svg>
              </div>
              <div class="stat-content">
                <span class="stat-number" id="totalPracticeTime">0</span>
                <span class="stat-label">horas practicadas</span>
              </div>
            </div>
            
            <div class="stat-card">
              <div class="stat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
              </div>
              <div class="stat-content">
                <span class="stat-number" id="currentStreak">0</span>
                <span class="stat-label">días consecutivos</span>
              </div>
            </div>
            
            <div class="stat-card">
              <div class="stat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <div class="stat-content">
                <span class="stat-number" id="palosCompleted">0</span>
                <span class="stat-label">palos dominados</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Configuración de Audio -->
        <section class="audio-settings-section">
          <h3 class="heading-4 section-title">Configuración de Audio</h3>
          <div class="settings-card card">
            <div class="setting-item">
              <div class="setting-info">
                <h4 class="setting-title">Tempo Predeterminado</h4>
                <p class="setting-description">Velocidad inicial para nuevas pistas</p>
              </div>
              <div class="setting-control">
                <input type="range" id="defaultTempoSlider" class="control-slider" 
                       min="0.5" max="2.0" step="0.1" value="${this.settings.defaultTempo}">
                <span class="setting-value" id="defaultTempoValue">${this.settings.defaultTempo}x</span>
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <h4 class="setting-title">Volumen Predeterminado</h4>
                <p class="setting-description">Nivel de volumen inicial</p>
              </div>
              <div class="setting-control">
                <input type="range" id="defaultVolumeSlider" class="control-slider" 
                       min="0" max="1" step="0.1" value="${this.settings.defaultVolume}">
                <span class="setting-value" id="defaultVolumeValue">${Math.round(this.settings.defaultVolume * 100)}%</span>
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <h4 class="setting-title">Reproducción Automática</h4>
                <p class="setting-description">Iniciar automáticamente al seleccionar palo</p>
              </div>
              <div class="setting-control">
                <label class="toggle-switch">
                  <input type="checkbox" id="autoPlayToggle" ${this.settings.autoPlay ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <!-- Configuración de Práctica -->
        <section class="practice-settings-section">
          <h3 class="heading-4 section-title">Configuración de Práctica</h3>
          <div class="settings-card card">
            <div class="setting-item">
              <div class="setting-info">
                <h4 class="setting-title">Meta Semanal</h4>
                <p class="setting-description">Minutos de práctica por semana</p>
              </div>
              <div class="setting-control">
                <input type="number" id="weeklyGoalInput" class="input-field compact" 
                       min="10" max="300" step="10" value="${this.settings.weeklyGoal}">
                <span class="setting-unit">min</span>
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <h4 class="setting-title">Recordatorios de Práctica</h4>
                <p class="setting-description">Notificaciones para mantener tu rutina</p>
              </div>
              <div class="setting-control">
                <label class="toggle-switch">
                  <input type="checkbox" id="practiceRemindersToggle" ${this.settings.practiceReminders ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <h4 class="setting-title">Notificaciones</h4>
                <p class="setting-description">Recibir actualizaciones y consejos</p>
              </div>
              <div class="setting-control">
                <label class="toggle-switch">
                  <input type="checkbox" id="notificationsToggle" ${this.settings.notifications ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <!-- Configuración de Cuenta -->
        <section class="account-settings-section">
          <h3 class="heading-4 section-title">Cuenta</h3>
          <div class="settings-card card">
            <button class="setting-button" id="changePasswordBtn">
              <div class="setting-button-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <circle cx="12" cy="16" r="1"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <div class="setting-button-content">
                <h4 class="setting-title">Cambiar Contraseña</h4>
                <p class="setting-description">Actualiza tu contraseña de acceso</p>
              </div>
              <svg class="setting-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </button>

            <button class="setting-button" id="exportDataBtn">
              <div class="setting-button-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7,10 12,15 17,10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </div>
              <div class="setting-button-content">
                <h4 class="setting-title">Exportar Datos</h4>
                <p class="setting-description">Descarga tu progreso y configuración</p>
              </div>
              <svg class="setting-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </button>

            <button class="setting-button danger" id="logoutBtn">
              <div class="setting-button-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16,17 21,12 16,7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </div>
              <div class="setting-button-content">
                <h4 class="setting-title">Cerrar Sesión</h4>
                <p class="setting-description">Salir de tu cuenta</p>
              </div>
              <svg class="setting-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </button>
          </div>
        </section>

        <!-- Botón de Guardar -->
        <div class="save-section">
          <button class="btn btn-primary btn-large" id="saveSettingsBtn">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17,21 17,13 7,13 7,21"/>
              <polyline points="7,3 7,8 15,8"/>
            </svg>
            Guardar Configuración
          </button>
        </div>
      </div>
    `;

    return profileHTML;
  }

  setupEventListeners() {
    // Navegación
    document.addEventListener('click', (e) => {
      if (e.target.closest('#backButton')) {
        this.goBack();
      } else if (e.target.closest('#editProfileBtn')) {
        this.editProfile();
      } else if (e.target.closest('#changePasswordBtn')) {
        this.changePassword();
      } else if (e.target.closest('#exportDataBtn')) {
        this.exportData();
      } else if (e.target.closest('#logoutBtn')) {
        this.logout();
      } else if (e.target.closest('#saveSettingsBtn')) {
        this.saveAllSettings();
      }
    });

    // Controles de configuración
    document.addEventListener('input', (e) => {
      if (e.target.id === 'defaultTempoSlider') {
        const value = parseFloat(e.target.value);
        this.settings.defaultTempo = value;
        document.getElementById('defaultTempoValue').textContent = `${value}x`;
      } else if (e.target.id === 'defaultVolumeSlider') {
        const value = parseFloat(e.target.value);
        this.settings.defaultVolume = value;
        document.getElementById('defaultVolumeValue').textContent = `${Math.round(value * 100)}%`;
      } else if (e.target.id === 'weeklyGoalInput') {
        this.settings.weeklyGoal = parseInt(e.target.value);
      }
    });

    // Toggles
    document.addEventListener('change', (e) => {
      if (e.target.id === 'autoPlayToggle') {
        this.settings.autoPlay = e.target.checked;
      } else if (e.target.id === 'practiceRemindersToggle') {
        this.settings.practiceReminders = e.target.checked;
      } else if (e.target.id === 'notificationsToggle') {
        this.settings.notifications = e.target.checked;
      }
    });
  }

  async loadUserStats() {
    // Simular carga de estadísticas
    try {
      const stats = {
        totalPracticeTime: Math.floor(Math.random() * 50) + 10,
        currentStreak: Math.floor(Math.random() * 30) + 1,
        palosCompleted: Math.floor(Math.random() * 8) + 2
      };

      this.animateStatNumber('totalPracticeTime', stats.totalPracticeTime);
      this.animateStatNumber('currentStreak', stats.currentStreak);
      this.animateStatNumber('palosCompleted', stats.palosCompleted);

    } catch (error) {
      console.error('Error loading user stats:', error);
    }
  }

  animateStatNumber(elementId, targetValue) {
    const element = document.getElementById(elementId);
    if (!element) return;

    let currentValue = 0;
    const increment = targetValue / 30;
    const duration = 1000;
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

    setTimeout(animate, Math.random() * 300);
  }

  goBack() {
    window.history.back();
  }

  editProfile() {
    console.log('Editando perfil...');
    // Aquí se abriría un modal o navegaría a una pantalla de edición
  }

  changePassword() {
    console.log('Cambiando contraseña...');
    // Aquí se abriría un modal para cambiar contraseña
  }

  exportData() {
    console.log('Exportando datos...');
    // Aquí se generaría y descargaría un archivo con los datos del usuario
    const userData = {
      profile: {
        email: this.userEmail,
        name: this.userName
      },
      settings: this.settings,
      exportDate: new Date().toISOString()
    };

    const dataStr = JSON.stringify(userData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `flamenco-data-${this.userName}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
  }

  logout() {
    if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
      localStorage.removeItem('user_authenticated');
      localStorage.removeItem('user_email');
      localStorage.removeItem('user_settings');
      window.location.reload();
    }
  }

  saveAllSettings() {
    try {
      this.saveSettings();
      
      // Mostrar confirmación
      const button = document.getElementById('saveSettingsBtn');
      const originalText = button.innerHTML;
      
      button.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20,6 9,17 4,12"/>
        </svg>
        Guardado
      `;
      button.disabled = true;
      
      setTimeout(() => {
        button.innerHTML = originalText;
        button.disabled = false;
      }, 2000);
      
      console.log('Configuración guardada:', this.settings);
      
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }
}