/**
 * Pantalla de Onboarding con estética flamenca moderna
 */

export default class OnboardingScreen {
  constructor() {
    this.currentStep = 0;
    this.totalSteps = 3;
    this.init();
  }

  init() {
    this.render();
    this.setupEventListeners();
  }

  render() {
    const onboardingHTML = `
      <div class="onboarding-container">
        <div class="onboarding-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${(this.currentStep / this.totalSteps) * 100}%"></div>
          </div>
          <span class="progress-text caption">${this.currentStep + 1} de ${this.totalSteps}</span>
        </div>

        <div class="onboarding-content">
          ${this.getStepContent()}
        </div>

        <div class="onboarding-actions">
          ${this.currentStep > 0 ? '<button class="btn btn-tertiary" id="prevBtn">Anterior</button>' : '<div></div>'}
          <button class="btn btn-primary" id="nextBtn">
            ${this.currentStep === this.totalSteps - 1 ? '¡Empezar!' : 'Siguiente'}
          </button>
        </div>
      </div>
    `;

    return onboardingHTML;
  }

  getStepContent() {
    const steps = [
      {
        title: '¡Bienvenido al Tablao!',
        subtitle: 'Tu espacio personal para la práctica del cante flamenco',
        illustration: 'flamenco-welcome',
        description: 'Descubre una nueva forma de practicar guitarra flamenca con pistas de cante auténticas de diferentes palos.'
      },
      {
        title: 'Practica con Maestros',
        subtitle: 'Pistas de cante de alta calidad',
        illustration: 'flamenco-practice',
        description: 'Accede a grabaciones profesionales de cantaores para mejorar tu acompañamiento y compás flamenco.'
      },
      {
        title: 'Personaliza tu Práctica',
        subtitle: 'Controla tempo, tono y más',
        illustration: 'flamenco-controls',
        description: 'Ajusta la velocidad, cambia el tono y personaliza cada pista según tu nivel y necesidades.'
      }
    ];

    const step = steps[this.currentStep];
    
    return `
      <div class="onboarding-step">
        <div class="step-illustration ${step.illustration}">
          <div class="flamenco-icon-large">
            ${this.getIllustrationSVG(step.illustration)}
          </div>
        </div>
        <h1 class="heading-2 step-title">${step.title}</h1>
        <p class="body-large step-subtitle">${step.subtitle}</p>
        <p class="body-normal step-description">${step.description}</p>
      </div>
    `;
  }

  getIllustrationSVG(type) {
    const illustrations = {
      'flamenco-welcome': `
        <svg viewBox="0 0 200 200" class="illustration-svg">
          <circle cx="100" cy="100" r="80" fill="var(--flamenco-pink)" opacity="0.3"/>
          <path d="M70 120 Q100 80 130 120 Q100 160 70 120" fill="var(--flamenco-red)"/>
          <circle cx="85" cy="110" r="3" fill="var(--flamenco-gold)"/>
          <circle cx="115" cy="110" r="3" fill="var(--flamenco-gold)"/>
          <path d="M90 130 Q100 140 110 130" stroke="var(--flamenco-black)" stroke-width="2" fill="none"/>
        </svg>
      `,
      'flamenco-practice': `
        <svg viewBox="0 0 200 200" class="illustration-svg">
          <ellipse cx="100" cy="140" rx="60" ry="20" fill="var(--flamenco-pink)" opacity="0.3"/>
          <rect x="80" y="60" width="40" height="80" rx="20" fill="var(--flamenco-red)"/>
          <circle cx="100" cy="50" r="15" fill="var(--flamenco-ivory)"/>
          <path d="M85 50 Q100 40 115 50" stroke="var(--flamenco-black)" stroke-width="2" fill="none"/>
          <rect x="95" y="45" width="10" height="5" fill="var(--flamenco-gold)"/>
        </svg>
      `,
      'flamenco-controls': `
        <svg viewBox="0 0 200 200" class="illustration-svg">
          <rect x="50" y="80" width="100" height="60" rx="10" fill="var(--flamenco-ivory)" stroke="var(--flamenco-red)" stroke-width="2"/>
          <circle cx="80" cy="110" r="8" fill="var(--flamenco-gold)"/>
          <circle cx="120" cy="110" r="8" fill="var(--flamenco-gold)"/>
          <rect x="70" y="95" width="20" height="4" rx="2" fill="var(--flamenco-red)"/>
          <rect x="110" y="95" width="20" height="4" rx="2" fill="var(--flamenco-red)"/>
        </svg>
      `
    };
    
    return illustrations[type] || '';
  }

  setupEventListeners() {
    document.addEventListener('click', (e) => {
      if (e.target.id === 'nextBtn') {
        this.nextStep();
      } else if (e.target.id === 'prevBtn') {
        this.prevStep();
      }
    });
  }

  nextStep() {
    if (this.currentStep < this.totalSteps - 1) {
      this.currentStep++;
      this.updateContent();
    } else {
      this.completeOnboarding();
    }
  }

  prevStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.updateContent();
    }
  }

  updateContent() {
    const container = document.querySelector('.onboarding-container');
    if (container) {
      container.innerHTML = this.render();
    }
  }

  completeOnboarding() {
    // Transición a la aplicación principal
    localStorage.setItem('onboarding_completed', 'true');
    window.location.reload();
  }
}