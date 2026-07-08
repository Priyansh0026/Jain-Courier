// Global state variables
const API_BASE = window.location.origin.includes('5000') ? '' : 'http://localhost:5000';
let activeOTPFlow = null; // 'mobile', 'email', or 'forgot'
let otpTimerInterval = null;
let otpAttemptsLeft = 5;
let isMobileVerified = false;
let isEmailVerified = false;
let verifiedResetEmailOrMobile = null;

// Initialize Lucide Icons & Event Listeners on DOM Load
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  initializeTheme();
  setupViewNavigation();
  setupPasswordToggles();
  setupPasswordStrengthMeter();
  setupOTPInputShifting();
  setupRegistrationVerification();
  setupForgotPasswordFlow();
  setupFormsSubmission();
});

// Toast notification alert popups
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconName = 'check-circle-2';
  if (type === 'error') iconName = 'alert-triangle';
  if (type === 'warning') iconName = 'alert-circle';
  
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="toast-icon"></i>
    <div class="toast-content">${message}</div>
  `;
  
  container.appendChild(toast);
  lucide.createIcons();
  
  // Slide in
  setTimeout(() => toast.classList.add('show'), 50);
  
  // Remove after 3.5 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => container.removeChild(toast), 300);
  }, 3500);
}

// Light / Dark mode toggling
function initializeTheme() {
  const themeToggle = document.getElementById('theme-toggle-btn');
  const sunIcon = themeToggle.querySelector('.light-icon');
  const moonIcon = themeToggle.querySelector('.dark-icon');
  const label = themeToggle.querySelector('span');

  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeUI(savedTheme);

  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeUI(newTheme);
  });

  function updateThemeUI(theme) {
    if (theme === 'dark') {
      sunIcon.classList.remove('hidden');
      moonIcon.classList.add('hidden');
      label.textContent = 'Light Mode';
    } else {
      moonIcon.classList.remove('hidden');
      sunIcon.classList.add('hidden');
      label.textContent = 'Dark Mode';
    }
  }
}

// Navigation View Switches (Login <-> Register <-> Forgot)
function setupViewNavigation() {
  const loginCard = document.getElementById('login-container');
  const registerCard = document.getElementById('register-container');
  const forgotCard = document.getElementById('forgot-container');

  // Triggers
  document.getElementById('link-to-register').addEventListener('click', (e) => {
    e.preventDefault();
    switchView(registerCard);
  });

  document.getElementById('link-to-login').addEventListener('click', (e) => {
    e.preventDefault();
    switchView(loginCard);
  });

  document.getElementById('btn-forgot-pass-trigger').addEventListener('click', (e) => {
    e.preventDefault();
    switchView(forgotCard);
  });

  document.getElementById('btn-back-to-login').addEventListener('click', (e) => {
    e.preventDefault();
    switchView(loginCard);
  });

  function switchView(targetCard) {
    [loginCard, registerCard, forgotCard].forEach(card => card.classList.remove('active'));
    targetCard.classList.add('active');
    
    // Reset form errors
    document.querySelectorAll('.error-msg').forEach(el => el.textContent = '');
  }

  // Handle forgot channel selector options UI
  const options = document.querySelectorAll('.forgot-option-card');
  options.forEach(opt => {
    opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      
      const channel = opt.querySelector('input').value;
      const label = document.getElementById('forgot-input-label');
      const input = document.getElementById('forgot-dest-input');
      const icon = document.getElementById('forgot-input-icon');
      
      if (channel === 'email') {
        label.textContent = 'Registered Email Address';
        input.placeholder = 'e.g. owner@jaincourier.com';
        icon.setAttribute('data-lucide', 'mail');
      } else {
        label.textContent = 'Registered Mobile Number';
        input.placeholder = 'e.g. 9876543210';
        icon.setAttribute('data-lucide', 'phone');
      }
      lucide.createIcons();
    });
  });
}

// Password eye toggler buttons
function setupPasswordToggles() {
  document.querySelectorAll('.btn-toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      const openEye = btn.querySelector('.eye-open');
      const closedEye = btn.querySelector('.eye-off');
      
      if (input.type === 'password') {
        input.type = 'text';
        openEye.classList.add('hidden');
        closedEye.classList.remove('hidden');
      } else {
        input.type = 'password';
        closedEye.classList.add('hidden');
        openEye.classList.remove('hidden');
      }
    });
  });
}

// Live Password strength indicators & confirmation check
function setupPasswordStrengthMeter() {
  const regPass = document.getElementById('reg-pass-input');
  const regConfirm = document.getElementById('reg-confirm-input');

  const resetPass = document.getElementById('reset-pass-input');
  const resetConfirm = document.getElementById('reset-confirm-input');

  // Bind key handlers
  if (regPass) {
    regPass.addEventListener('input', () => evaluateStrength(regPass.value, ''));
    regConfirm.addEventListener('input', () => checkPasswordMatch(regPass, regConfirm, 'reg-confirm-error'));
  }

  if (resetPass) {
    resetPass.addEventListener('input', () => evaluateStrength(resetPass.value, 'r-'));
    resetConfirm.addEventListener('input', () => checkPasswordMatch(resetPass, resetConfirm, 'reset-confirm-error'));
  }

  function evaluateStrength(password, prefix) {
    const bar1 = document.getElementById(`${prefix}bar-1`);
    const bar2 = document.getElementById(`${prefix}bar-2`);
    const bar3 = document.getElementById(`${prefix}bar-3`);
    const bar4 = document.getElementById(`${prefix}bar-4`);
    const label = document.getElementById(`${prefix}strength-label`);

    const guidelines = prefix === '' ? {
      len: document.getElementById('req-len'),
      up: document.getElementById('req-up'),
      low: document.getElementById('req-low'),
      num: document.getElementById('req-num'),
      spec: document.getElementById('req-spec')
    } : null;

    let score = 0;
    if (!password) {
      label.textContent = 'Password Strength: Empty';
      [bar1, bar2, bar3, bar4].forEach(b => b.className = 'strength-bar-segment');
      if (guidelines) {
        Object.values(guidelines).forEach(el => el.classList.remove('met'));
      }
      return;
    }

    // Rules checks
    const hasLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSpec = /[@$!%*?&#^()_+=\[\]{};':"\\|,.<>\/?`~-]/.test(password);

    if (hasLength) { score++; if (guidelines) guidelines.len.classList.add('met'); } else { if (guidelines) guidelines.len.classList.remove('met'); }
    if (hasUpper) { score++; if (guidelines) guidelines.up.classList.add('met'); } else { if (guidelines) guidelines.up.classList.remove('met'); }
    if (hasLower) { score++; if (guidelines) guidelines.low.classList.add('met'); } else { if (guidelines) guidelines.low.classList.remove('met'); }
    if (hasDigit) { score++; if (guidelines) guidelines.num.classList.add('met'); } else { if (guidelines) guidelines.num.classList.remove('met'); }
    if (hasSpec) { score++; if (guidelines) guidelines.spec.classList.add('met'); } else { if (guidelines) guidelines.spec.classList.remove('met'); }

    // Color progress segments
    [bar1, bar2, bar3, bar4].forEach(b => b.className = 'strength-bar-segment');

    if (score <= 2) {
      label.textContent = 'Password Strength: Weak';
      label.style.color = 'var(--danger)';
      bar1.classList.add('bg-danger');
    } else if (score <= 4) {
      label.textContent = 'Password Strength: Medium';
      label.style.color = 'var(--warning)';
      bar1.classList.add('bg-warning');
      bar2.classList.add('bg-warning');
      bar3.classList.add('bg-warning');
    } else {
      label.textContent = 'Password Strength: Strong';
      label.style.color = 'var(--success)';
      [bar1, bar2, bar3, bar4].forEach(b => b.classList.add('bg-success'));
    }
  }

  function checkPasswordMatch(passEl, confirmEl, errorElId) {
    const errorEl = document.getElementById(errorElId);
    if (!confirmEl.value) {
      errorEl.textContent = '';
      return;
    }

    if (passEl.value !== confirmEl.value) {
      errorEl.textContent = 'Passwords do not match.';
      errorEl.style.color = 'var(--danger)';
    } else {
      errorEl.textContent = 'Passwords match successfully!';
      errorEl.style.color = 'var(--success)';
    }
  }
}

// 6-digit OTP input shift controls (Autofocus shift)
function setupOTPInputShifting() {
  const boxes = document.querySelectorAll('.otp-box');
  const verifyBtn = document.getElementById('btn-verify-otp');

  boxes.forEach((box, index) => {
    box.addEventListener('input', (e) => {
      box.value = box.value.replace(/[^0-9]/g, '');
      if (box.value !== '') {
        if (index < boxes.length - 1) {
          boxes[index + 1].focus();
        }
      }
      checkOTPCompletion();
    });

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        if (box.value === '') {
          if (index > 0) {
            boxes[index - 1].focus();
            boxes[index - 1].value = '';
          }
        } else {
          box.value = '';
        }
        checkOTPCompletion();
      }
    });

    box.addEventListener('paste', (e) => {
      const data = e.clipboardData.getData('text').trim();
      if (/^\d{6}$/.test(data)) {
        boxes.forEach((b, i) => b.value = data[i]);
        boxes[5].focus();
        checkOTPCompletion();
      }
      e.preventDefault();
    });
  });

  function checkOTPCompletion() {
    const allFilled = Array.from(boxes).every(b => b.value !== '');
    verifyBtn.disabled = !allFilled;
  }
}

// Triggering Mobile & Email registration verification modals
function setupRegistrationVerification() {
  const sendMobileBtn = document.getElementById('btn-send-mobile-otp');
  const sendEmailBtn = document.getElementById('btn-send-email-otp');
  
  const mobileInput = document.getElementById('reg-mobile-input');
  const emailInput = document.getElementById('reg-email-input');

  const otpModal = document.getElementById('otp-modal');
  const destinationDisplay = document.getElementById('otp-destination-display');

  // Mobile trigger
  sendMobileBtn.addEventListener('click', async () => {
    const mob = mobileInput.value.trim();
    if (!/^\d{10}$/.test(mob)) {
      document.getElementById('reg-mobile-error').textContent = 'Please enter a valid 10-digit mobile number.';
      return;
    }
    document.getElementById('reg-mobile-error').textContent = '';
    
    sendMobileBtn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/api/send-mobile-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: mob, countryCode: document.getElementById('reg-country-code').value })
      });
      const data = await res.json();
      
      if (data.success) {
        activeOTPFlow = 'mobile';
        otpAttemptsLeft = 5;
        destinationDisplay.textContent = mob;
        document.getElementById('otp-attempts-display').textContent = `Attempts Left: ${otpAttemptsLeft}/5`;
        otpModal.classList.add('active');
        
        // Clear modal boxes
        document.querySelectorAll('.otp-box').forEach(b => b.value = '');
        document.getElementById('btn-verify-otp').disabled = true;
        
        startOTPTimer();
        showToast('Mobile verification OTP sent!', 'success');
        if (data.sandbox) {
          console.warn('[JCMS DEV NOTICE] Sandbox mode enabled. Check backend logs for OTP code.');
        }
      } else {
        showToast(data.message || 'Failed to send Mobile OTP.', 'error');
      }
    } catch(err) {
      showToast('API Connection Error.', 'error');
    } finally {
      sendMobileBtn.disabled = false;
    }
  });

  // Email trigger
  sendEmailBtn.addEventListener('click', async () => {
    const mail = emailInput.value.trim();
    const rx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!rx.test(mail)) {
      document.getElementById('reg-email-error').textContent = 'Please enter a valid email address.';
      return;
    }
    document.getElementById('reg-email-error').textContent = '';

    sendEmailBtn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/api/send-email-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: mail })
      });
      const data = await res.json();

      if (data.success) {
        activeOTPFlow = 'email';
        otpAttemptsLeft = 5;
        destinationDisplay.textContent = mail;
        document.getElementById('otp-attempts-display').textContent = `Attempts Left: ${otpAttemptsLeft}/5`;
        otpModal.classList.add('active');

        document.querySelectorAll('.otp-box').forEach(b => b.value = '');
        document.getElementById('btn-verify-otp').disabled = true;

        startOTPTimer();
        showToast('Email verification OTP sent!', 'success');
      } else {
        showToast(data.message || 'Failed to send Email OTP.', 'error');
      }
    } catch(err) {
      showToast('API Connection Error.', 'error');
    } finally {
      sendEmailBtn.disabled = false;
    }
  });

  // Handle modal close
  document.getElementById('btn-otp-close').addEventListener('click', closeModal);

  function closeModal() {
    otpModal.classList.remove('active');
    if (otpTimerInterval) clearInterval(otpTimerInterval);
  }

  // Handle Resend button click
  document.getElementById('btn-resend-otp').addEventListener('click', async () => {
    const resendBtn = document.getElementById('btn-resend-otp');
    resendBtn.disabled = true;
    try {
      let res;
      if (activeOTPFlow === 'mobile') {
        res = await fetch(`${API_BASE}/api/send-mobile-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mobile: mobileInput.value.trim(), countryCode: document.getElementById('reg-country-code').value })
        });
      } else if (activeOTPFlow === 'email') {
        res = await fetch(`${API_BASE}/api/send-email-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailInput.value.trim() })
        });
      } else {
        // Forgot password flow resend
        const val = verifiedResetEmailOrMobile || document.getElementById('forgot-dest-input').value.trim();
        res = await fetch(`${API_BASE}/api/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emailOrMobile: val })
        });
      }
      
      const data = await res.json();
      if (data.success) {
        showToast('Verification code resent successfully!', 'success');
        document.querySelectorAll('.otp-box').forEach(b => b.value = '');
        document.getElementById('btn-verify-otp').disabled = true;
        startOTPTimer();
      } else {
        showToast(data.message || 'Failed to resend code.', 'error');
      }
    } catch(err) {
      showToast('Connection failed.', 'error');
    } finally {
      resendBtn.disabled = false;
    }
  });

  // Verify button inside Modal
  document.getElementById('btn-verify-otp').addEventListener('click', async () => {
    const boxes = document.querySelectorAll('.otp-box');
    const enteredCode = Array.from(boxes).map(b => b.value).join('');

    const verifyBtn = document.getElementById('btn-verify-otp');
    verifyBtn.disabled = true;

    try {
      let endpoint, payload;
      
      if (activeOTPFlow === 'mobile') {
        endpoint = `${API_BASE}/api/verify-mobile-otp`;
        payload = { mobile: mobileInput.value.trim(), code: enteredCode, countryCode: document.getElementById('reg-country-code').value };
      } else if (activeOTPFlow === 'email') {
        endpoint = `${API_BASE}/api/verify-email-otp`;
        payload = { email: emailInput.value.trim(), code: enteredCode };
      } else {
        // Forgot password flow verify
        endpoint = `${API_BASE}/api/verify-reset-otp`;
        payload = { emailOrMobile: document.getElementById('forgot-dest-input').value.trim(), code: enteredCode };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        showToast('OTP verified successfully!', 'success');
        closeModal();

        if (activeOTPFlow === 'mobile') {
          isMobileVerified = true;
          document.getElementById('mobile-verify-badge').classList.remove('hidden');
          sendMobileBtn.classList.add('hidden');
          mobileInput.disabled = true;
        } else if (activeOTPFlow === 'email') {
          isEmailVerified = true;
          document.getElementById('email-verify-badge').classList.remove('hidden');
          sendEmailBtn.classList.add('hidden');
          emailInput.disabled = true;
        } else {
          // Successful verification inside forgot password flow
          verifiedResetEmailOrMobile = document.getElementById('forgot-dest-input').value.trim();
          document.getElementById('reset-option-panel').classList.add('hidden');
          document.getElementById('reset-new-password-panel').classList.remove('hidden');
        }
      } else {
        otpAttemptsLeft--;
        document.getElementById('otp-attempts-display').textContent = `Attempts Left: ${otpAttemptsLeft}/5`;
        
        if (otpAttemptsLeft <= 0) {
          showToast('Maximum attempts reached. Request a new code.', 'error');
          closeModal();
        } else {
          showToast(data.message || 'Incorrect verification code.', 'error');
        }
      }
    } catch(err) {
      showToast('Verification failed. API error.', 'error');
    } finally {
      verifyBtn.disabled = false;
    }
  });
}

// Start Resend timer countdown (30s)
function startOTPTimer() {
  const timerDisplay = document.getElementById('otp-timer-display');
  const resendBtn = document.getElementById('btn-resend-otp');
  
  resendBtn.classList.add('hidden');
  timerDisplay.classList.remove('hidden');

  let seconds = 30;
  timerDisplay.textContent = `Resend in ${seconds}s`;

  if (otpTimerInterval) clearInterval(otpTimerInterval);
  
  otpTimerInterval = setInterval(() => {
    seconds--;
    timerDisplay.textContent = `Resend in ${seconds}s`;
    
    if (seconds <= 0) {
      clearInterval(otpTimerInterval);
      timerDisplay.classList.add('hidden');
      resendBtn.classList.remove('hidden');
    }
  }, 1000);
}

// Forgot Password flows
function setupForgotPasswordFlow() {
  const sendBtn = document.getElementById('btn-send-reset-otp');
  const destInput = document.getElementById('forgot-dest-input');

  sendBtn.addEventListener('click', async () => {
    const targetVal = destInput.value.trim();
    const type = document.querySelector('input[name="forgot-channel"]:checked').value;

    if (type === 'email') {
      const rx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!rx.test(targetVal)) {
        document.getElementById('forgot-dest-error').textContent = 'Please enter a valid email address.';
        return;
      }
    } else {
      if (!/^\d{10}$/.test(targetVal)) {
        document.getElementById('forgot-dest-error').textContent = 'Please enter a valid 10-digit mobile number.';
        return;
      }
    }
    document.getElementById('forgot-dest-error').textContent = '';

    sendBtn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/api/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrMobile: targetVal })
      });
      const data = await res.json();

      if (data.success) {
        activeOTPFlow = 'forgot';
        otpAttemptsLeft = 5;
        showToast('Password reset code sent successfully!', 'warning');

        const otpModal = document.getElementById('otp-modal');
        document.getElementById('otp-destination-display').textContent = targetVal;
        document.getElementById('otp-attempts-display').textContent = `Attempts Left: ${otpAttemptsLeft}/5`;
        otpModal.classList.add('active');
        
        document.querySelectorAll('.otp-box').forEach(b => b.value = '');
        document.getElementById('btn-verify-otp').disabled = true;

        startOTPTimer();
      } else {
        document.getElementById('forgot-dest-error').textContent = data.message || 'Reset request failed.';
      }
    } catch(err) {
      showToast('Connection API error.', 'error');
    } finally {
      sendBtn.disabled = false;
    }
  });
}

// Final Sign In, Sign Up, and Reset forms submit actions
function setupFormsSubmission() {
  const loginForm = document.getElementById('form-login');
  const registerForm = document.getElementById('form-register');
  const resetForm = document.getElementById('form-reset-password');

  // 1. LOGIN SUBMIT
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const inputVal = document.getElementById('login-email-input').value.trim();
    const passVal = document.getElementById('login-pass-input').value;
    const loginError = document.getElementById('login-email-error');
    const passError = document.getElementById('login-pass-error');
    const btnText = document.querySelector('#btn-login-submit .btn-text');
    const spinner = document.querySelector('#btn-login-submit .spinner');

    let hasErr = false;
    if (!inputVal) {
      loginError.textContent = 'Please enter your registered Email or Mobile.';
      hasErr = true;
    } else {
      loginError.textContent = '';
    }

    if (!passVal) {
      passError.textContent = 'Please enter your password.';
      hasErr = true;
    } else {
      passError.textContent = '';
    }

    if (hasErr) return;

    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');

    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrMobile: inputVal, password: passVal })
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem('jcms_active_session', 'true');
        localStorage.setItem('jcms_logged_user', data.user.email);
        showToast('Login Successful! Redirecting...', 'success');
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 1200);
      } else {
        showToast(data.message || 'Invalid Email/Mobile or Password!', 'error');
        passError.textContent = data.message || 'Incorrect password.';
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
      }
    } catch(err) {
      showToast('API Connection Error.', 'error');
      btnText.classList.remove('hidden');
      spinner.classList.add('hidden');
    }
  });

  // 2. REGISTRATION SUBMIT
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nameVal = document.getElementById('reg-name-input').value.trim();
    const mobileVal = document.getElementById('reg-mobile-input').value.trim();
    const emailVal = document.getElementById('reg-email-input').value.trim();
    const passVal = document.getElementById('reg-pass-input').value;
    const confirmVal = document.getElementById('reg-confirm-input').value;
    const termsCheck = document.getElementById('reg-terms-check').checked;

    let hasErr = false;

    if (nameVal.length < 3) {
      document.getElementById('reg-name-error').textContent = 'Name must be at least 3 characters.';
      hasErr = true;
    } else if (/[0-9!@#$%^&*(),.?":{}|<>]/.test(nameVal)) {
      document.getElementById('reg-name-error').textContent = 'Name cannot contain numbers or special characters.';
      hasErr = true;
    } else {
      document.getElementById('reg-name-error').textContent = '';
    }

    if (!isMobileVerified) {
      document.getElementById('reg-mobile-error').textContent = 'Please verify your mobile number with OTP.';
      hasErr = true;
    } else {
      document.getElementById('reg-mobile-error').textContent = '';
    }

    if (!isEmailVerified) {
      document.getElementById('reg-email-error').textContent = 'Please verify your email address with OTP.';
      hasErr = true;
    } else {
      document.getElementById('reg-email-error').textContent = '';
    }

    const hasLength = passVal.length >= 8;
    const hasUpper = /[A-Z]/.test(passVal);
    const hasLower = /[a-z]/.test(passVal);
    const hasDigit = /\d/.test(passVal);
    const hasSpec = /[@$!%*?&#^()_+=\[\]{};':"\\|,.<>\/?`~-]/.test(passVal);
    
    if (!(hasLength && hasUpper && hasLower && hasDigit && hasSpec)) {
      document.getElementById('reg-pass-error').textContent = 'Password does not meet safety guidelines.';
      hasErr = true;
    } else {
      document.getElementById('reg-pass-error').textContent = '';
    }

    if (passVal !== confirmVal) {
      document.getElementById('reg-confirm-error').textContent = 'Passwords do not match.';
      hasErr = true;
    } else {
      document.getElementById('reg-confirm-error').textContent = '';
    }

    if (!termsCheck) {
      document.getElementById('reg-terms-error').textContent = 'You must accept the Terms & Conditions.';
      hasErr = true;
    } else {
      document.getElementById('reg-terms-error').textContent = '';
    }

    if (hasErr) return;

    const btnText = document.querySelector('#btn-register-submit .btn-text');
    const spinner = document.querySelector('#btn-register-submit .spinner');
    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');

    try {
      const res = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameVal, email: emailVal, mobile: mobileVal, password: passVal })
      });
      const data = await res.json();

      if (data.success) {
        showToast('Registration Successful! Redirecting to login...', 'success');
        setTimeout(() => {
          isMobileVerified = false;
          isEmailVerified = false;
          registerForm.reset();
          
          document.getElementById('link-to-login').click();
          
          document.getElementById('mobile-verify-badge').classList.add('hidden');
          document.getElementById('email-verify-badge').classList.add('hidden');
          document.getElementById('btn-send-mobile-otp').classList.remove('hidden');
          document.getElementById('btn-send-email-otp').classList.remove('hidden');
          document.getElementById('reg-mobile-input').disabled = false;
          document.getElementById('reg-email-input').disabled = false;
          
          btnText.classList.remove('hidden');
          spinner.classList.add('hidden');
        }, 3000);
      } else {
        showToast(data.message || 'Registration failed.', 'error');
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
      }
    } catch(err) {
      showToast('API Connection Error.', 'error');
      btnText.classList.remove('hidden');
      spinner.classList.add('hidden');
    }
  });

  // 3. RESET NEW PASSWORD SUBMIT
  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const passVal = document.getElementById('reset-pass-input').value;
    const confirmVal = document.getElementById('reset-confirm-input').value;
    const passErr = document.getElementById('reset-pass-error');
    const confirmErr = document.getElementById('reset-confirm-error');

    const hasLength = passVal.length >= 8;
    const hasUpper = /[A-Z]/.test(passVal);
    const hasLower = /[a-z]/.test(passVal);
    const hasDigit = /\d/.test(passVal);
    const hasSpec = /[@$!%*?&#^()_+=\[\]{};':"\\|,.<>\/?`~-]/.test(passVal);

    if (!(hasLength && hasUpper && hasLower && hasDigit && hasSpec)) {
      passErr.textContent = 'Password does not meet guidelines.';
      return;
    } else {
      passErr.textContent = '';
    }

    if (passVal !== confirmVal) {
      confirmErr.textContent = 'Passwords do not match.';
      return;
    } else {
      confirmErr.textContent = '';
    }

    try {
      const res = await fetch(`${API_BASE}/api/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrMobile: verifiedResetEmailOrMobile, password: passVal })
      });
      const data = await res.json();

      if (data.success) {
        showToast('Password reset successfully! Redirecting to Login...', 'success');
        setTimeout(() => {
          resetForm.reset();
          document.getElementById('reset-new-password-panel').classList.add('hidden');
          document.getElementById('reset-option-panel').classList.remove('hidden');
          document.getElementById('link-to-login').click();
        }, 2000);
      } else {
        showToast(data.message || 'Password reset failed.', 'error');
      }
    } catch(err) {
      showToast('API Connection Error.', 'error');
    }
  });
}
