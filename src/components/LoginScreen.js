/**
 * Pantalla de Login con estética flamenca moderna
 */

export default class LoginScreen {
  constructor() {
    this.isLoginMode = true;
    this.init();
  }

  init() {
    this.render();
    this.setupEventListeners();
    this.setupFormValidation();
  }

  render() {
    const loginHTML = `
      <div class="auth-container">
        <div class="auth-header">
          <div class="auth-logo">
            <div class="flamenco-logo">
              <svg viewBox="0 0 80 80" class="logo-svg">
                <circle cx="40" cy="40" r="35" fill="var(--flamenco-red)" opacity="0.1"/>
                <path d="M25 45 Q40 25 55 45 Q40 65 25 45" fill="var(--flamenco-red)"/>
                <circle cx="32" cy="38" r="2" fill="var(--flamenco-gold)"/>
                <circle cx="48" cy="38" r="2" fill="var(--flamenco-gold)"/>
                <path d="M30 50 Q40 55 50 50" stroke="var(--flamenco-black)" stroke-width="1.5" fill="none"/>
              </svg>
            </div>
          </div>
          <h1 class="heading-1 auth-title">
            ${this.isLoginMode ? '¡Bienvenido de vuelta!' : '¡Únete al Tablao!'}
          </h1>
          <p class="body-normal auth-subtitle">
            ${this.isLoginMode ? 'Continúa tu práctica flamenca' : 'Comienza tu viaje flamenco'}
          </p>
        </div>

        <form class="auth-form" id="authForm">
          ${!this.isLoginMode ? `
            <div class="input-group">
              <label class="input-label" for="fullName">Nombre Completo</label>
              <input type="text" id="fullName" class="input-field" placeholder="Tu nombre completo" required>
              <div class="input-error" id="fullNameError"></div>
            </div>
          ` : ''}

          <div class="input-group">
            <label class="input-label" for="email">Correo Electrónico</label>
            <input type="email" id="email" class="input-field" placeholder="tu@email.com" required>
            <div class="input-error" id="emailError"></div>
          </div>

          <div class="input-group">
            <label class="input-label" for="password">Contraseña</label>
            <div class="password-input-container">
              <input type="password" id="password" class="input-field" placeholder="Tu contraseña" required>
              <button type="button" class="password-toggle" id="passwordToggle">
                <svg class="password-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
            <div class="input-error" id="passwordError"></div>
          </div>

          ${!this.isLoginMode ? `
            <div class="input-group">
              <label class="input-label" for="confirmPassword">Confirmar Contraseña</label>
              <input type="password" id="confirmPassword" class="input-field" placeholder="Confirma tu contraseña" required>
              <div class="input-error" id="confirmPasswordError"></div>
            </div>
          ` : ''}

          ${this.isLoginMode ? `
            <div class="auth-options">
              <label class="checkbox-container">
                <input type="checkbox" id="rememberMe">
                <span class="checkmark"></span>
                <span class="checkbox-label">Recordarme</span>
              </label>
              <a href="#" class="forgot-password">¿Olvidaste tu contraseña?</a>
            </div>
          ` : ''}

          <button type="submit" class="btn btn-primary btn-large auth-submit" id="authSubmit">
            ${this.isLoginMode ? 'Iniciar Sesión' : 'Crear Cuenta'}
          </button>
        </form>

        <div class="auth-divider">
          <span class="divider-text">o</span>
        </div>

        <div class="auth-social">
          <button class="btn btn-secondary social-btn">
            <svg class="social-icon" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continuar con Google
          </button>
        </div>

        <div class="auth-switch">
          <p class="body-small">
            ${this.isLoginMode ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}
            <button type="button" class="switch-mode-btn" id="switchMode">
              ${this.isLoginMode ? 'Regístrate aquí' : 'Inicia sesión aquí'}
            </button>
          </p>
        </div>
      </div>
    `;

    return loginHTML;
  }

  setupEventListeners() {
    document.addEventListener('click', (e) => {
      if (e.target.id === 'switchMode') {
        this.toggleMode();
      } else if (e.target.id === 'passwordToggle') {
        this.togglePasswordVisibility();
      }
    });

    document.addEventListener('submit', (e) => {
      if (e.target.id === 'authForm') {
        e.preventDefault();
        this.handleSubmit();
      }
    });
  }

  setupFormValidation() {
    const inputs = ['email', 'password', 'fullName', 'confirmPassword'];
    
    inputs.forEach(inputId => {
      const input = document.getElementById(inputId);
      if (input) {
        input.addEventListener('blur', () => this.validateField(inputId));
        input.addEventListener('input', () => this.clearError(inputId));
      }
    });
  }

  validateField(fieldId) {
    const field = document.getElementById(fieldId);
    const errorElement = document.getElementById(`${fieldId}Error`);
    
    if (!field || !errorElement) return true;

    let isValid = true;
    let errorMessage = '';

    switch (fieldId) {
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(field.value)) {
          isValid = false;
          errorMessage = 'Por favor, introduce un email válido';
        }
        break;
      
      case 'password':
        if (field.value.length < 6) {
          isValid = false;
          errorMessage = 'La contraseña debe tener al menos 6 caracteres';
        }
        break;
      
      case 'fullName':
        if (field.value.trim().length < 2) {
          isValid = false;
          errorMessage = 'Por favor, introduce tu nombre completo';
        }
        break;
      
      case 'confirmPassword':
        const password = document.getElementById('password');
        if (password && field.value !== password.value) {
          isValid = false;
          errorMessage = 'Las contraseñas no coinciden';
        }
        break;
    }

    if (!isValid) {
      field.classList.add('error');
      errorElement.textContent = errorMessage;
    } else {
      field.classList.remove('error');
      errorElement.textContent = '';
    }

    return isValid;
  }

  clearError(fieldId) {
    const field = document.getElementById(fieldId);
    const errorElement = document.getElementById(`${fieldId}Error`);
    
    if (field && errorElement) {
      field.classList.remove('error');
      errorElement.textContent = '';
    }
  }

  toggleMode() {
    this.isLoginMode = !this.isLoginMode;
    const container = document.querySelector('.auth-container');
    if (container) {
      container.innerHTML = this.render();
      this.setupFormValidation();
    }
  }

  togglePasswordVisibility() {
    const passwordField = document.getElementById('password');
    const toggleButton = document.getElementById('passwordToggle');
    
    if (passwordField && toggleButton) {
      const isPassword = passwordField.type === 'password';
      passwordField.type = isPassword ? 'text' : 'password';
      
      // Cambiar icono
      const icon = toggleButton.querySelector('.password-icon');
      if (icon) {
        icon.innerHTML = isPassword ? 
          '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>' :
          '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
      }
    }
  }

  async handleSubmit() {
    const form = document.getElementById('authForm');
    const submitButton = document.getElementById('authSubmit');
    
    if (!form || !submitButton) return;

    // Validar todos los campos
    const fields = this.isLoginMode ? ['email', 'password'] : ['fullName', 'email', 'password', 'confirmPassword'];
    let isFormValid = true;

    fields.forEach(fieldId => {
      if (!this.validateField(fieldId)) {
        isFormValid = false;
      }
    });

    if (!isFormValid) return;

    // Mostrar estado de carga
    submitButton.disabled = true;
    submitButton.innerHTML = `
      <div class="loading-spinner" style="width: 20px; height: 20px; margin-right: 8px;"></div>
      ${this.isLoginMode ? 'Iniciando sesión...' : 'Creando cuenta...'}
    `;

    try {
      // Simular llamada a API
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Guardar estado de autenticación
      localStorage.setItem('user_authenticated', 'true');
      localStorage.setItem('user_email', document.getElementById('email').value);
      
      // Redirigir a la aplicación principal
      this.onAuthSuccess();
      
    } catch (error) {
      console.error('Error de autenticación:', error);
      this.showAuthError('Error al procesar la solicitud. Inténtalo de nuevo.');
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = this.isLoginMode ? 'Iniciar Sesión' : 'Crear Cuenta';
    }
  }

  showAuthError(message) {
    // Crear o actualizar mensaje de error general
    let errorContainer = document.querySelector('.auth-error');
    if (!errorContainer) {
      errorContainer = document.createElement('div');
      errorContainer.className = 'auth-error';
      const form = document.getElementById('authForm');
      form.insertBefore(errorContainer, form.firstChild);
    }
    
    errorContainer.innerHTML = `
      <div class="error-message">
        <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <span>${message}</span>
      </div>
    `;
  }

  onAuthSuccess() {
    // Transición exitosa a la aplicación principal
    window.location.reload();
  }
}