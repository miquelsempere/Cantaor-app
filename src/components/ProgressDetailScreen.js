/**
 * Pantalla de Progreso Detallado con visualizaciones y estadísticas avanzadas
 */

export default class ProgressDetailScreen {
  constructor() {
    this.userEmail = localStorage.getItem('user_email') || 'usuario@email.com';
    this.userName = this.userEmail.split('@')[0];
    this.progressData = this.loadProgressData();
    this.currentView = 'overview'; // overview, palos, achievements, calendar
    this.init();
  }

  loadProgressData() {
    // En una aplicación real, esto vendría de una API
    return {
      totalPracticeTime: 1247, // minutos
      currentStreak: 12,
      longestStreak: 28,
      totalSessions: 89,
      averageSessionTime: 14,
      palosProgress: [
        { name: 'Soleá', level: 85, sessions: 23, totalTime: 312 },
        { name: 'Alegrías', level: 72, sessions: 18, totalTime: 245 },
        { name: 'Bulerías', level: 58, sessions: 15, totalTime: 198 },
        { name: 'Tangos', level: 45, sessions: 12, totalTime: 156 },
        { name: 'Siguiriyas', level: 32, sessions: 8, totalTime: 98 },
        { name: 'Fandangos', level: 28, sessions: 6, totalTime: 67 }
      ],
      weeklyData: [
        { week: 'Sem 1', minutes: 95 },
        { week: 'Sem 2', minutes: 120 },
        { week: 'Sem 3', minutes: 87 },
        { week: 'Sem 4', minutes: 145 },
        { week: 'Sem 5', minutes: 132 },
        { week: 'Sem 6', minutes: 98 },
        { week: 'Sem 7', minutes: 156 }
      ],
      achievements: [
        { id: 1, name: 'Primera Práctica', description: 'Completaste tu primera sesión', earned: true, date: '2024-01-15' },
        { id: 2, name: 'Racha de 7 días', description: 'Practicaste 7 días consecutivos', earned: true, date: '2024-02-01' },
        { id: 3, name: 'Maestro de Soleá', description: 'Alcanzaste nivel avanzado en Soleá', earned: true, date: '2024-02-15' },
        { id: 4, name: '10 horas de práctica', description: 'Acumulaste 10 horas de práctica', earned: true, date: '2024-02-28' },
        { id: 5, name: 'Explorador de Palos', description: 'Practicaste 5 palos diferentes', earned: true, date: '2024-03-10' },
        { id: 6, name: 'Racha de 30 días', description: 'Practica 30 días consecutivos', earned: false, progress: 12 },
        { id: 7, name: 'Maestro Completo', description: 'Domina todos los palos básicos', earned: false, progress: 3 }
      ]
    };
  }

  init() {
    this.render();
    this.setupEventListeners();
    this.renderCurrentView();
  }

  render() {
    const progressHTML = `
      <div class="progress-detail-container">
        <!-- Header -->
        <header class="progress-header">
          <button class="back-button btn-tertiary" id="backButton">
            <svg class="back-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Volver
          </button>
          <h1 class="heading-3">Mi Progreso</h1>
          <div class="header-spacer"></div>
        </header>

        <!-- Navegación de Vistas -->
        <nav class="progress-nav">
          <button class="nav-tab ${this.currentView === 'overview' ? 'active' : ''}" data-view="overview">
            <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>
            </svg>
            Resumen
          </button>
          <button class="nav-tab ${this.currentView === 'palos' ? 'active' : ''}" data-view="palos">
            <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18V5l12-2v13M6 18c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3zM18 16c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3z"/>
            </svg>
            Palos
          </button>
          <button class="nav-tab ${this.currentView === 'achievements' ? 'active' : ''}" data-view="achievements">
            <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            Logros
          </button>
          <button class="nav-tab ${this.currentView === 'calendar' ? 'active' : ''}" data-view="calendar">
            <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Calendario
          </button>
        </nav>

        <!-- Contenido Dinámico -->
        <main class="progress-content" id="progressContent">
          <!-- El contenido se renderiza dinámicamente según la vista actual -->
        </main>
      </div>
    `;

    return progressHTML;
  }

  renderCurrentView() {
    const content = document.getElementById('progressContent');
    if (!content) return;

    switch (this.currentView) {
      case 'overview':
        content.innerHTML = this.renderOverviewView();
        break;
      case 'palos':
        content.innerHTML = this.renderPalosView();
        break;
      case 'achievements':
        content.innerHTML = this.renderAchievementsView();
        break;
      case 'calendar':
        content.innerHTML = this.renderCalendarView();
        break;
    }
  }

  renderOverviewView() {
    const totalHours = Math.floor(this.progressData.totalPracticeTime / 60);
    const totalMinutes = this.progressData.totalPracticeTime % 60;

    return `
      <!-- Estadísticas Principales -->
      <section class="main-stats">
        <div class="stats-grid">
          <div class="stat-card featured">
            <div class="stat-icon practice-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polygon points="10,8 16,12 10,16 10,8"/>
              </svg>
            </div>
            <div class="stat-content">
              <span class="stat-number">${totalHours}h ${totalMinutes}m</span>
              <span class="stat-label">Tiempo Total</span>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon streak-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </div>
            <div class="stat-content">
              <span class="stat-number">${this.progressData.currentStreak}</span>
              <span class="stat-label">Racha Actual</span>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon sessions-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <div class="stat-content">
              <span class="stat-number">${this.progressData.totalSessions}</span>
              <span class="stat-label">Sesiones</span>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon average-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12,6 12,12 16,14"/>
              </svg>
            </div>
            <div class="stat-content">
              <span class="stat-number">${this.progressData.averageSessionTime}min</span>
              <span class="stat-label">Promedio</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Progreso Semanal -->
      <section class="weekly-progress">
        <h3 class="heading-4 section-title">Progreso Semanal</h3>
        <div class="chart-container card">
          <div class="weekly-chart">
            ${this.progressData.weeklyData.map(week => `
              <div class="week-bar">
                <div class="bar-fill" style="height: ${(week.minutes / 160) * 100}%"></div>
                <span class="week-label">${week.week}</span>
                <span class="week-value">${week.minutes}m</span>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <!-- Top Palos -->
      <section class="top-palos">
        <h3 class="heading-4 section-title">Palos Más Practicados</h3>
        <div class="palos-list card">
          ${this.progressData.palosProgress.slice(0, 3).map((palo, index) => `
            <div class="palo-progress-item">
              <div class="palo-rank">${index + 1}</div>
              <div class="palo-info">
                <h4 class="palo-name">${palo.name}</h4>
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${palo.level}%"></div>
                </div>
                <span class="progress-text">${palo.level}% • ${palo.sessions} sesiones</span>
              </div>
              <div class="palo-time">${Math.floor(palo.totalTime / 60)}h ${palo.totalTime % 60}m</div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  renderPalosView() {
    return `
      <section class="palos-progress-section">
        <div class="section-header">
          <h3 class="heading-4">Progreso por Palos</h3>
          <p class="body-small">Tu dominio en cada estilo flamenco</p>
        </div>
        
        <div class="palos-grid">
          ${this.progressData.palosProgress.map(palo => `
            <div class="palo-card card">
              <div class="palo-header">
                <h4 class="heading-4 palo-name">${palo.name}</h4>
                <span class="palo-level ${this.getLevelClass(palo.level)}">${this.getLevelText(palo.level)}</span>
              </div>
              
              <div class="palo-progress">
                <div class="progress-circle">
                  <svg class="progress-ring" width="80" height="80">
                    <circle class="progress-ring-bg" cx="40" cy="40" r="35"/>
                    <circle class="progress-ring-fill" cx="40" cy="40" r="35" 
                            style="stroke-dasharray: ${2 * Math.PI * 35}; stroke-dashoffset: ${2 * Math.PI * 35 * (1 - palo.level / 100)}"/>
                  </svg>
                  <span class="progress-percentage">${palo.level}%</span>
                </div>
                
                <div class="palo-stats">
                  <div class="stat-item">
                    <span class="stat-value">${palo.sessions}</span>
                    <span class="stat-label">Sesiones</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-value">${Math.floor(palo.totalTime / 60)}h ${palo.totalTime % 60}m</span>
                    <span class="stat-label">Tiempo</span>
                  </div>
                </div>
              </div>
              
              <button class="btn btn-secondary practice-palo-btn" data-palo="${palo.name}">
                Practicar ${palo.name}
              </button>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  renderAchievementsView() {
    const earnedAchievements = this.progressData.achievements.filter(a => a.earned);
    const pendingAchievements = this.progressData.achievements.filter(a => !a.earned);

    return `
      <section class="achievements-section">
        <div class="achievements-summary">
          <div class="summary-card card">
            <div class="summary-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
            <div class="summary-content">
              <h3 class="heading-3">${earnedAchievements.length}/${this.progressData.achievements.length}</h3>
              <p class="body-normal">Logros Conseguidos</p>
            </div>
          </div>
        </div>

        <div class="achievements-tabs">
          <button class="achievement-tab active" data-tab="earned">
            Conseguidos (${earnedAchievements.length})
          </button>
          <button class="achievement-tab" data-tab="pending">
            Pendientes (${pendingAchievements.length})
          </button>
        </div>

        <div class="achievements-content">
          <div class="achievements-list earned-list active">
            ${earnedAchievements.map(achievement => `
              <div class="achievement-item earned card">
                <div class="achievement-icon earned">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </div>
                <div class="achievement-content">
                  <h4 class="achievement-name">${achievement.name}</h4>
                  <p class="achievement-description">${achievement.description}</p>
                  <span class="achievement-date">Conseguido el ${new Date(achievement.date).toLocaleDateString('es-ES')}</span>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="achievements-list pending-list">
            ${pendingAchievements.map(achievement => `
              <div class="achievement-item pending card">
                <div class="achievement-icon pending">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2"/>
                  </svg>
                </div>
                <div class="achievement-content">
                  <h4 class="achievement-name">${achievement.name}</h4>
                  <p class="achievement-description">${achievement.description}</p>
                  ${achievement.progress ? `
                    <div class="achievement-progress">
                      <div class="progress-bar">
                        <div class="progress-fill" style="width: ${(achievement.progress / (achievement.id === 6 ? 30 : 6)) * 100}%"></div>
                      </div>
                      <span class="progress-text">${achievement.progress}/${achievement.id === 6 ? 30 : 6}</span>
                    </div>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
    `;
  }

  renderCalendarView() {
    return `
      <section class="calendar-section">
        <div class="calendar-header">
          <h3 class="heading-4">Calendario de Práctica</h3>
          <div class="calendar-controls">
            <button class="calendar-nav-btn" id="prevMonth">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15,18 9,12 15,6"/>
              </svg>
            </button>
            <span class="current-month">Marzo 2024</span>
            <button class="calendar-nav-btn" id="nextMonth">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="calendar-container card">
          <div class="calendar-grid">
            <div class="calendar-header-row">
              <span class="day-header">L</span>
              <span class="day-header">M</span>
              <span class="day-header">X</span>
              <span class="day-header">J</span>
              <span class="day-header">V</span>
              <span class="day-header">S</span>
              <span class="day-header">D</span>
            </div>
            ${this.generateCalendarDays()}
          </div>
        </div>

        <div class="calendar-legend">
          <div class="legend-item">
            <div class="legend-color no-practice"></div>
            <span>Sin práctica</span>
          </div>
          <div class="legend-item">
            <div class="legend-color light-practice"></div>
            <span>Práctica ligera (< 15min)</span>
          </div>
          <div class="legend-item">
            <div class="legend-color medium-practice"></div>
            <span>Práctica media (15-30min)</span>
          </div>
          <div class="legend-item">
            <div class="legend-color intense-practice"></div>
            <span>Práctica intensa (> 30min)</span>
          </div>
        </div>
      </section>
    `;
  }

  generateCalendarDays() {
    // Generar días del calendario con datos simulados
    const days = [];
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay() + 1);

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      
      const isCurrentMonth = date.getMonth() === currentMonth;
      const isToday = date.toDateString() === today.toDateString();
      const practiceMinutes = isCurrentMonth ? Math.floor(Math.random() * 60) : 0;
      
      let practiceClass = 'no-practice';
      if (practiceMinutes > 30) practiceClass = 'intense-practice';
      else if (practiceMinutes > 15) practiceClass = 'medium-practice';
      else if (practiceMinutes > 0) practiceClass = 'light-practice';

      days.push(`
        <div class="calendar-day ${isCurrentMonth ? 'current-month' : 'other-month'} ${isToday ? 'today' : ''} ${practiceClass}"
             data-date="${date.toISOString().split('T')[0]}"
             data-minutes="${practiceMinutes}">
          <span class="day-number">${date.getDate()}</span>
          ${practiceMinutes > 0 ? `<span class="practice-indicator">${practiceMinutes}m</span>` : ''}
        </div>
      `);
    }

    return days.join('');
  }

  getLevelClass(level) {
    if (level >= 80) return 'expert';
    if (level >= 60) return 'advanced';
    if (level >= 40) return 'intermediate';
    return 'beginner';
  }

  getLevelText(level) {
    if (level >= 80) return 'Experto';
    if (level >= 60) return 'Avanzado';
    if (level >= 40) return 'Intermedio';
    return 'Principiante';
  }

  setupEventListeners() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('#backButton')) {
        this.goBack();
      } else if (e.target.closest('.nav-tab')) {
        const view = e.target.closest('.nav-tab').dataset.view;
        this.switchView(view);
      } else if (e.target.closest('.practice-palo-btn')) {
        const palo = e.target.closest('.practice-palo-btn').dataset.palo;
        this.practicePalo(palo);
      } else if (e.target.closest('.achievement-tab')) {
        const tab = e.target.closest('.achievement-tab').dataset.tab;
        this.switchAchievementTab(tab);
      }
    });
  }

  switchView(view) {
    this.currentView = view;
    
    // Update nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === view);
    });
    
    // Render new content
    this.renderCurrentView();
  }

  switchAchievementTab(tab) {
    document.querySelectorAll('.achievement-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    
    document.querySelectorAll('.achievements-list').forEach(list => {
      list.classList.toggle('active', list.classList.contains(`${tab}-list`));
    });
  }

  practicePalo(palo) {
    console.log(`Iniciando práctica de ${palo}`);
    // Aquí se navegaría a la pantalla de práctica específica del palo
  }

  goBack() {
    window.history.back();
  }
}