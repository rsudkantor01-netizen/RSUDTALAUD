(() => {
  const EMPLOYEE_TOKEN_KEY = 'rsud-employee-token';
  const EMPLOYEE_USER_KEY = 'rsud-employee-user';
  const ADMIN_TOKEN_KEY = 'rsud-admin-token';
  const ADMIN_USER_KEY = 'rsud-admin-user';
  const params = new URLSearchParams(location.search);
  const isEmployeeEntry = params.get('employee') === '1';
  const isAdminEntry = params.get('admin') === '1';
  let loginPending = false;
  let accountModalPending = false;
  let bypassEmployeeLogin = false;

  function apiUrl() {
    return localStorage.getItem('rsud-api-url') || window.RSUD_API_URL || '';
  }

  function backendRequest(action, data = {}) {
    const url = apiUrl();
    if (!url || !url.startsWith('https://script.google.com/macros/s/')) {
      return Promise.reject(new Error('Backend Apps Script belum dikonfigurasi.'));
    }

    return new Promise((resolve, reject) => {
      const frame = document.createElement('iframe');
      const form = document.createElement('form');
      const frameName = `rsudAuthFrame${Date.now()}${Math.random().toString(36).slice(2)}`;
      frame.name = frameName;
      frame.hidden = true;
      form.action = url;
      form.method = 'post';
      form.target = frameName;
      form.hidden = true;

      Object.entries({ action, origin: location.origin, ...data }).forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = String(value ?? '');
        form.appendChild(input);
      });

      const cleanup = () => {
        clearTimeout(timeout);
        window.top.removeEventListener('message', onMessage);
        form.remove();
        frame.remove();
      };
      const onMessage = event => {
        if (event.data?.type !== 'rsud-result' ||
          (event.origin !== 'https://script.google.com' &&
            !/^https:\/\/[^/]+\.googleusercontent\.com$/.test(event.origin))) return;
        cleanup();
        if (event.data.ok) resolve(event.data);
        else reject(new Error(event.data.error || 'Permintaan tidak berhasil.'));
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Tidak ada respons dari backend.'));
      }, 20000);

      window.top.addEventListener('message', onMessage);
      document.body.append(frame, form);
      form.submit();
    });
  }

  function installStyles() {
    if (document.getElementById('portalAuthStyles')) return;
    const style = document.createElement('style');
    style.id = 'portalAuthStyles';
    style.textContent = `
      .portal-auth-overlay{position:fixed;z-index:30000;inset:0;display:grid;place-items:center;padding:18px;background:rgba(7,27,53,.68);backdrop-filter:blur(7px)}
      .portal-auth-dialog{position:relative;width:min(410px,100%);padding:26px;border:1px solid #ffffffcc;border-radius:16px;background:#fff;box-shadow:0 24px 70px #071b3555;color:#15314c}
      .portal-auth-dialog h2{margin:8px 0 8px;font-size:23px}
      .portal-auth-dialog p{color:#718096;font-size:12px;line-height:1.55}
      .portal-auth-dialog form{display:grid;gap:8px}
      .portal-auth-dialog label{margin-top:5px;font-size:11px;font-weight:750}
      .portal-auth-dialog input,.portal-auth-dialog select{width:100%;height:42px;padding:0 11px;border:1px solid #d5e0eb;border-radius:8px;background:#fff;color:#15314c;font:inherit;font-size:12px}
      .portal-auth-dialog .primary{min-height:40px;margin-top:8px;border:0;border-radius:8px;background:#c91f3a;color:#fff;font-weight:800;cursor:pointer}
      .portal-auth-dialog .primary:disabled{opacity:.6;cursor:wait}
      .portal-auth-close{position:absolute;top:13px;right:13px;width:32px;height:32px;border:0;border-radius:50%;background:#f1f5f9;color:#334155;font-size:22px;cursor:pointer}
      .portal-auth-message{min-height:18px;margin:12px 0 0;color:#a91931;font-size:11px}
      .portal-account-button,.portal-employee-logout{min-height:34px;padding:0 10px;border:1px solid #c91f3a55;border-radius:8px;background:#fff1f3;color:#c91f3a;font-size:10px;font-weight:800;cursor:pointer}
      .portal-account-button{margin-left:6px}
      .portal-account-button:hover,.portal-employee-logout:hover{border-color:#c91f3a;background:#c91f3a;color:#fff}
      @media(max-width:560px){.portal-account-button{font-size:8px}.portal-employee-logout{min-height:30px;padding:0 7px;font-size:8px}}
    `;
    document.head.append(style);
  }

  function closeModal() {
    document.querySelector('.portal-auth-overlay')?.remove();
  }

  function showLogin(message = '') {
    if (document.querySelector('.portal-auth-overlay')) return;
    installStyles();
    document.body.insertAdjacentHTML('beforeend', `
      <div class="portal-auth-overlay" id="portalLoginOverlay">
        <section class="portal-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="portalLoginTitle">
          <button class="portal-auth-close" type="button" data-auth-close aria-label="Tutup">×</button>
          <div class="eyebrow">PORTAL RSUD TALAUD</div>
          <h2 id="portalLoginTitle">Masuk ke portal</h2>
          <p>Gunakan username dan kata sandi akun Anda.</p>
          <form id="portalLoginForm">
            <label for="portalLoginUsername">Username</label>
            <input id="portalLoginUsername" name="username" type="text" autocomplete="username" maxlength="100" required>
            <label for="portalLoginPassword">Kata sandi</label>
            <input id="portalLoginPassword" name="password" type="password" autocomplete="current-password" maxlength="256" required>
            <button class="primary" type="submit">Masuk</button>
          </form>
          <p class="portal-auth-message" id="portalLoginMessage" role="status">${message}</p>
        </section>
      </div>
    `);
    document.getElementById('portalLoginUsername')?.focus();
  }

  function setLoginMessage(message) {
    const element = document.getElementById('portalLoginMessage');
    if (element) element.textContent = message;
  }

  function topNavigate(path) {
    window.top.location.href = new URL(path, location.href).href;
  }

  async function submitLogin(form) {
    if (loginPending) return;
    loginPending = true;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    setLoginMessage('Memeriksa akun…');
    try {
      const result = await backendRequest('portalLogin', {
        username: form.elements.username.value.trim(),
        password: form.elements.password.value,
      });
      if (result.role === 'admin') {
        sessionStorage.removeItem(EMPLOYEE_TOKEN_KEY);
        sessionStorage.removeItem(EMPLOYEE_USER_KEY);
        sessionStorage.setItem(ADMIN_TOKEN_KEY, result.token);
        sessionStorage.setItem(ADMIN_USER_KEY, result.username || 'Admin');
        closeModal();
        topNavigate('./admin.html');
        return;
      }
      if (result.role !== 'employee' || !result.token) {
        throw new Error('Nama pengguna atau kata sandi tidak sesuai.');
      }
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      sessionStorage.removeItem(ADMIN_USER_KEY);
      sessionStorage.setItem(EMPLOYEE_TOKEN_KEY, result.token);
      sessionStorage.setItem(EMPLOYEE_USER_KEY, JSON.stringify(result.employee || {}));
      closeModal();
      topNavigate('./portal-pegawai.html');
    } catch (error) {
      setLoginMessage(error.message || 'Login gagal. Periksa kembali username dan kata sandi.');
    } finally {
      loginPending = false;
      if (button.isConnected) button.disabled = false;
    }
  }

  async function validateEmployeeEntry() {
    const token = sessionStorage.getItem(EMPLOYEE_TOKEN_KEY);
    if (!token) {
      showLogin();
      return;
    }
    try {
      const result = await backendRequest('employeeStatus', { employeeToken: token });
      sessionStorage.setItem(EMPLOYEE_USER_KEY, JSON.stringify(result.employee || {}));
      closeModal();
      enterEmployeePortal();
      addEmployeeLogout();
    } catch {
      sessionStorage.removeItem(EMPLOYEE_TOKEN_KEY);
      sessionStorage.removeItem(EMPLOYEE_USER_KEY);
      showLogin('Sesi berakhir. Silakan masuk kembali.');
    }
  }

  function enterEmployeePortal() {
    const loginButton = document.querySelector('[data-action="employee-login"]');
    if (!loginButton) return;
    bypassEmployeeLogin = true;
    loginButton.click();
    bypassEmployeeLogin = false;
  }

  function addEmployeeLogout() {
    if (!isEmployeeEntry || document.querySelector('.portal-employee-logout')) return;
    const actions = document.querySelector('.top-actions');
    if (!actions) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'portal-employee-logout';
    button.dataset.authLogout = 'employee';
    button.textContent = 'Keluar';
    actions.append(button);
  }

  async function logoutEmployee() {
    const token = sessionStorage.getItem(EMPLOYEE_TOKEN_KEY) || '';
    try {
      await backendRequest('employeeLogout', { employeeToken: token });
    } catch (error) {
      console.error('Gagal menutup sesi pegawai:', error);
    } finally {
      sessionStorage.removeItem(EMPLOYEE_TOKEN_KEY);
      sessionStorage.removeItem(EMPLOYEE_USER_KEY);
      topNavigate('./index.html');
    }
  }

  function mountAccountButton() {
    if (!document.body.classList.contains('admin-mode')) return;
    const actions = document.querySelector('.admin-dashboard-head > div:last-child');
    if (!actions || actions.querySelector('[data-account-manage]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-back-button portal-account-button';
    button.dataset.accountManage = 'true';
    button.textContent = 'Akun pegawai';
    actions.prepend(button);
  }

  async function showAccountManager() {
    if (accountModalPending) return;
    accountModalPending = true;
    const token = sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
    try {
      const data = await backendRequest('adminData', { adminToken: token });
      const employees = (data.employees || []).filter(employee =>
        String(employee.status || '').toLowerCase() === 'aktif'
      );
      if (!employees.length) throw new Error('Belum ada data pegawai aktif. Tambahkan pegawai terlebih dahulu.');
      const accounts = new Map((data.employeeAccounts || []).map(account => [
        account.employeeId,
        account.username,
      ]));
      installStyles();
      document.body.insertAdjacentHTML('beforeend', `
        <div class="portal-auth-overlay" id="employeeAccountOverlay">
          <section class="portal-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="employeeAccountTitle">
            <button class="portal-auth-close" type="button" data-auth-close aria-label="Tutup">×</button>
            <div class="eyebrow">PENGELOLAAN ADMIN</div>
            <h2 id="employeeAccountTitle">Akun pegawai</h2>
            <p>Buat akun atau atur ulang username dan password pegawai. Password minimal 12 karakter.</p>
            <form id="employeeAccountForm">
              <label for="employeeAccountId">Pegawai aktif</label>
              <select id="employeeAccountId" name="employeeId" required>
                ${employees.map(employee => `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.name)} — ${escapeHtml(employee.role)}</option>`).join('')}
              </select>
              <label for="employeeAccountUsername">Username / NIP</label>
              <input id="employeeAccountUsername" name="username" type="text" maxlength="40" pattern="[A-Za-z0-9._-]{3,40}" required>
              <label for="employeeAccountPassword">Password awal / baru</label>
              <input id="employeeAccountPassword" name="password" type="password" minlength="12" maxlength="256" autocomplete="new-password" required>
              <button class="primary" type="submit">Simpan akun</button>
            </form>
            <p class="portal-auth-message" id="employeeAccountMessage" role="status"></p>
          </section>
        </div>
      `);
      const employeeSelect = document.getElementById('employeeAccountId');
      const usernameInput = document.getElementById('employeeAccountUsername');
      const updateUsername = () => {
        usernameInput.value = accounts.get(employeeSelect.value) || '';
      };
      employeeSelect.addEventListener('change', updateUsername);
      updateUsername();
      usernameInput.focus();
    } catch (error) {
      window.alert(error.message || 'Data akun pegawai tidak dapat dimuat.');
    } finally {
      accountModalPending = false;
    }
  }

  async function submitEmployeeAccount(form) {
    const message = document.getElementById('employeeAccountMessage');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    message.textContent = 'Menyimpan akun…';
    try {
      const result = await backendRequest('saveEmployeeAccount', {
        adminToken: sessionStorage.getItem(ADMIN_TOKEN_KEY) || '',
        payload: JSON.stringify({
          employeeId: form.elements.employeeId.value,
          username: form.elements.username.value.trim(),
          password: form.elements.password.value,
        }),
      });
      message.textContent = `Akun ${result.account.username} berhasil disimpan.`;
      form.elements.password.value = '';
    } catch (error) {
      message.textContent = error.message || 'Akun tidak dapat disimpan.';
    } finally {
      button.disabled = false;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character]);
  }

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-action="employee-login"]');
    if (trigger) {
      if (bypassEmployeeLogin) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showLogin();
      return;
    }
    if (event.target.closest('[data-auth-close]')) {
      closeModal();
      return;
    }
    if (event.target.closest('[data-auth-logout="employee"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      logoutEmployee();
      return;
    }
    if (event.target.closest('[data-account-manage]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showAccountManager();
    }
  }, true);

  document.addEventListener('submit', event => {
    if (event.target.id === 'portalLoginForm') {
      event.preventDefault();
      submitLogin(event.target);
    } else if (event.target.id === 'employeeAccountForm') {
      event.preventDefault();
      submitEmployeeAccount(event.target);
    }
  });

  const observer = new MutationObserver(() => {
    mountAccountButton();
    const legacyAdminLogin = document.getElementById('adminLoginOverlay');
    if (legacyAdminLogin) {
      legacyAdminLogin.remove();
      showLogin();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (isEmployeeEntry) validateEmployeeEntry();
  else if (isAdminEntry && !sessionStorage.getItem(ADMIN_TOKEN_KEY)) showLogin();
})();
