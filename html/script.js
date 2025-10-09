// ===== Config =====
const API_BASE = 'http://localhost:3000';

function authHeaders() {
  const t = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) };
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), ...authHeaders() } });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    const msg = (data && data.message) ? data.message : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function userAvatarSrc(u) {
  if (u?.avatar && u.avatar.startsWith('data:')) return u.avatar; // si guardas base64
  const label = encodeURIComponent((u.fullName || u.username || '').trim() || 'U');
  return `https://ui-avatars.com/api/?name=${label}`;
}

async function followUser(targetId) {
  return fetchJSON(`${API_BASE}/api/follow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId })
  });
}

async function getFollowStatus(targetId) {
  return fetchJSON(`${API_BASE}/api/follow/${encodeURIComponent(targetId)}`);
}







// LOGIN
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = (document.getElementById('username')?.value || '').trim();
    const password = (document.getElementById('password')?.value || '').trim();

    if (!username || !password) {
      alert('Ingresa usuario y contraseña');
      return;
    }

    try {
      const res = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ username, password })
      });

      let data = null;
      try { data = await res.json(); } catch (_) {}
      if (!res.ok) {
        const msg = (data && data.message) ? data.message : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      if (!data?.token) throw new Error('Respuesta inválida (falta token)');

      localStorage.setItem('token', data.token);
      // Redirige donde quieras:
      window.location.href = 'index.html';
    } catch (err) {
      console.error('Login falló:', err);
      alert('No se pudo iniciar sesión: ' + err.message);
    }
  });
});


document.addEventListener('DOMContentLoaded', async () => {
  const approveLink = document.getElementById('manageCoursesItem');
  if (!approveLink) return;

  // Ocúltalo de entrada para evitar parpadeo
  approveLink.hidden = true;
  approveLink.style.display = 'none';
  try {
    const me = await fetchJSON(`${API_BASE}/api/auth/me`);

    // Toma el role de forma defensiva y en minúsculas
    const role = String(me?.role || me?.user?.role || '').toLowerCase();

    // Muestra solo si es admin
    const isAdmin = role === 'admin';
    approveLink.hidden = !isAdmin;
    if (isAdmin) {
      // quita cualquier override inline de display
      approveLink.style.removeProperty('display');
    } else {
      approveLink.style.display = 'none';
    }
  } catch (_) {
    // si falla me, lo dejamos oculto
    approveLink.hidden = true;
    approveLink.style.display = 'none';
  }
});



// CREATE ACCOUNT
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('signupForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = (document.getElementById('username')?.value || '').trim();
    const password = document.getElementById('password')?.value || '';
    const name = (document.getElementById('Name')?.value || '').trim();
    const lastname = (document.getElementById('Lastname')?.value || '').trim();
    const birthDate = document.getElementById('birthDate')?.value || '';
    const fileInput = document.getElementById('userAvatar');

    if (!username || !password || !name || !lastname || !birthDate) {
      alert('Completa todos los campos requeridos.');
      return;
    }
    if (password.length < 8) {
      alert('La contraseña debe tener mínimo 8 caracteres.');
      return;
    }

    // Convierte imagen a base64 (opcional)
    const toBase64 = (file) =>
      new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);  // data:*/*;base64,...
        reader.onerror = (err) => rej(err);
        reader.readAsDataURL(file);
      });

    let avatarBase64 = '';
    if (fileInput?.files?.[0]) {
      try {
        avatarBase64 = await toBase64(fileInput.files[0]);
      } catch (_) {
        alert('No se pudo leer la imagen. Intenta con otra.');
        return;
      }
    }

    const fullName = `${name} ${lastname}`.trim();

    try {
      const res = await fetch('http://localhost:3000/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, fullName, birthDate, avatarBase64 })
      });

      let data = null;
      try { data = await res.json(); } catch (_) {}

      if (!res.ok) {
        const msg = (data && data.message) ? data.message : `Error HTTP ${res.status}`;
        //throw new Error(msg);
      }

      window.location.href = 'login.html';
    } catch (err) {
      console.error('Signup falló:', err);
      alert('No se pudo crear la cuenta: ' + err.message);
    }
  });
});





// ===== LISTA DE USUARIOS  =====
document.addEventListener('DOMContentLoaded', () => {
  // Detectamos si estamos en users_list.html por el contenedor principal
  const listContainer = document.querySelector('.friends-list');
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');

  if (!listContainer || !searchForm || !searchInput) {
    // No estamos en esta página
    return;
  }

  
  // Helper: avatar HTML
  function avatarHTML(user) {
    // Si tu API ya devuelve base64 en user.avatar, úsalo.
    if (user.avatar && typeof user.avatar === 'string' && user.avatar.startsWith('data:image')) {
      return `<img class="friend-avatar-img" src="${user.avatar}" alt="${user.fullName || user.username}">`;
    }
    // Si no hay imagen, iniciales
    const name = (user.fullName || user.username || '').trim();
    const initials = name.split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
    return `
      <div class="friend-avatar-fallback">
        <span>${initials || '?'}</span>
      </div>
    `;
  }

  // Render de tarjetas
  function renderUsers(users) {
    if (!Array.isArray(users) || users.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <p>No users found.</p>
        </div>
      `;
      return;
    }
    users.forEach(u => {
      // Guarda solo lo que necesitas en el perfil
      sessionStorage.setItem(`profile-cache:${u.id}`, JSON.stringify({
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        avatar: u.avatar || null
      }));
    });

    const cards = users.map(u => {
      // Ajusta el destino de "Profile" si tienes páginas de perfil por id/username
      const profileHref = `profile.html?user=${encodeURIComponent(u.id)}`;
      return `
        <div class="friend-card">
          <div class="friend-avatar">
            ${avatarHTML(u)}
          </div>
          <div class="friend-info">
            <div class="friend-name">${(u.fullName || u.username || 'Unknown')}</div>
            <div class="friend-username">@${u.username}</div>
          </div>
          <div class="action-buttons">
            <button class="btn btn-primary" data-profile="${profileHref}">
              <i class="fas fa-id-badge"></i> Profile
          </div>
        </div>
      `;
    }).join('');

    listContainer.innerHTML = cards;

    // Delegación de eventos para botones
    listContainer.querySelectorAll('button[data-profile]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const href = e.currentTarget.getAttribute('data-profile');
        const uid  = e.currentTarget.getAttribute('data-uid');

        // 1) busca el user en el pre-cache y lo promueve a 'profileUser'
        if (uid) {
          const cached = sessionStorage.getItem(`profile-cache:${uid}`);
          if (cached) {
            sessionStorage.setItem('profileUser', cached);
          }
        }

        // 2) navega (sigue usando tu href actual)
        window.location.href = href || `profile.html?user=${encodeURIComponent(uid)}`;
      });
    });

    // (Opcional) follow: aún sin backend; aquí solo muestra aviso
    listContainer.querySelectorAll('button[data-follow]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const uid = e.currentTarget.getAttribute('data-follow');
        try {
          await followUser(uid);
          e.currentTarget.textContent = 'Already following';
          e.currentTarget.disabled = true;
        } catch (err) {
          alert('No se pudo seguir: ' + err.message);
        }
      });
    });
  }

  // Carga desde API (excluye automáticamente mi usuario por backend)
  async function loadUsers(q = '') {
    try {
      const url = `${API_BASE}/api/users?q=${encodeURIComponent(q)}`;
      const data = await fetchJSON(url);  // usa tu helper global
      // { users: [ {id, username, fullName, avatar} ] }
      renderUsers(data.users || []);
    } catch (err) {
      console.error('Error cargando usuarios:', err);
      listContainer.innerHTML = `
        <div class="empty-state error">
          <p>Could not load users: ${err.message}</p>
        </div>
      `;
    }
  }

  // Búsqueda
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    loadUsers(q);
  });

  // (Opcional) búsqueda reactiva con debounce mientras escribe
  let t;
  searchInput.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => loadUsers(searchInput.value.trim()), 300);
  });

  // Inicial
  loadUsers('');
});



// User Menu
document.addEventListener('DOMContentLoaded', () => {
  // Navegación del user-menu
  const profileBtn = document.getElementById('profileBtn');
  const editBtn = document.getElementById('editAccountBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  if (profileBtn) {
    profileBtn.addEventListener('click', () => {
      window.location.href = 'admin_profile.html';
    });
  }

  if (editBtn) {
    editBtn.addEventListener('click', () => {
      window.location.href = 'edit_account.html';
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('token');
      window.location.href = 'login.html';
    });
  }
});




// ===== Rellenar My Account (admin_profile.html) =====
async function fillAdminProfilePage() {
  // Detectar si estamos en esta página por elementos clave
  const nameEl   = document.getElementById('adminProfileName');
  const userEl   = document.getElementById('adminProfileUsername');
  const avatarBox = document.getElementById('adminProfileAvatarBox'); // <div> contenedor, si lo tienes
  const avatarImg = document.getElementById('adminProfileAvatar');     // <img> directo, si lo tienes

  if (!nameEl && !userEl && !avatarBox && !avatarImg) return; // no es esta página

  // Guardia de autenticación
  if (!localStorage.getItem('token')) {
    window.location.href = 'login.html';
    return;
  }

  // Carga de "yo"
  let me;
  try {
    me = await fetchJSON(`${API_BASE}/api/auth/me`);
  } catch (err) {
    console.error('Error /api/auth/me:', err);
    window.location.href = 'login.html';
    return;
  }

  const fullName = (me.fullName || me.username || 'User').trim();
  const username = me.username ? `@${me.username}` : '';

  if (nameEl) nameEl.textContent = fullName;
  if (userEl) userEl.textContent = username;

  // --- Avatar con estética de users_list ---

  const hasDataUrl = typeof me.avatar === 'string' && me.avatar.startsWith('data:image');
  const looksUrl   = typeof me.avatar === 'string' && (/^https?:\/\//.test(me.avatar) || me.avatar?.startsWith('/'));

  // Fallback de iniciales si no hay imagen real
  const initialsSrc = (() => {
    const label = encodeURIComponent(fullName || me.username || 'U');
    return `https://ui-avatars.com/api/?name=${label}`;
  })();

  // Si hay contenedor tipo <div>, inyectamos la misma estructura que en la lista
  if (avatarBox) {
    if (typeof window.avatarHTML === 'function') {
      // Usamos avatarHTML(me) y adaptamos clases a las de perfil si lo deseas
      const html = window.avatarHTML(me)
        .replaceAll('friend-avatar-img', 'profile-avatar-img')
        .replaceAll('friend-avatar-fallback', 'profile-avatar-fallback');
      avatarBox.innerHTML = html;
    } else {
      // Sin avatarHTML disponible: img directa o fallback de iniciales
      const src = hasDataUrl || looksUrl ? me.avatar : initialsSrc;
      avatarBox.innerHTML = `<img class="profile-avatar-img" src="${src}" alt="${fullName}">`;
    }
    return; // ya renderizamos
  }

  // Si no hay contenedor y sí hay <img>, seteamos src/alt directamente
  if (avatarImg) {
    let src = initialsSrc;
    if (hasDataUrl || looksUrl) {
      src = me.avatar;
    } else if (typeof window.avatarHTML === 'function') {
      // Intento extra: si avatarHTML devuelve un <img>, extráele el src
      const tmp = document.createElement('div');
      tmp.innerHTML = window.avatarHTML(me);
      const img = tmp.querySelector('img');
      if (img && img.src) src = img.src;
    }
    avatarImg.src = src;
    avatarImg.alt = fullName;
  }
}

// Lánzalo al cargar esta página
document.addEventListener('DOMContentLoaded', fillAdminProfilePage);



// === Modify Account: Prefill + Fix birthDate ===
function normalizeBirthDate(raw) {
  if (!raw) return '';
  // Neo4j date {year, month, day}
  if (typeof raw === 'object' && raw.year && raw.month && raw.day) {
    const y = String(raw.year);
    const m = String(raw.month).padStart(2, '0');
    const d = String(raw.day).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof raw === 'string') {
    // "YYYY-MM-DD"
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    // "YYYY-MM-DDTHH:mm:ssZ" -> "YYYY-MM-DD"
    const head = raw.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head;
    // Otras cadenas parseables por Date
    const dt = new Date(raw);
    if (!isNaN(dt)) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  return '';
}

async function prefillEditAccount() {
  // Detecta que estamos en edit_account.html por sus campos
  const usernameInput = document.getElementById('username');
  const nameInput     = document.getElementById('Name');
  const lastnameInput = document.getElementById('Lastname');
  const birthInput    = document.getElementById('birthDate');
  const fileInput     = document.getElementById('userAvatar');
  const previewBox    = document.getElementById('imagePreview');
  const form          = document.getElementById('editAccForm'); // tu form en esta página

  if (!usernameInput || !nameInput || !lastnameInput || !birthInput || !form) return;

  // Guard: auth
  if (!localStorage.getItem('token')) {
    window.location.href = 'login.html';
    return;
  }

  // Carga y pinta
  try {
    const me = await fetchJSON(`${API_BASE}/api/auth/me`);

    // fullName -> Name + Lastname (si no tienes campos separados en backend)
    const full = (me.fullName || '').trim();
    const parts = full ? full.split(/\s+/) : [];
    const first = parts.shift() || '';
    const last  = parts.join(' ');

    usernameInput.value = me.username || '';
    nameInput.value     = first;
    lastnameInput.value = last;
    birthInput.value    = normalizeBirthDate(me.birthDate);

    // Avatar preview (sin crear HTML extra)
    const hasDataUrl = typeof me.avatar === 'string' && me.avatar.startsWith('data:image');
    const looksURL   = typeof me.avatar === 'string' && (/^https?:\/\//.test(me.avatar) || me.avatar.startsWith('/'));
    const label      = encodeURIComponent((me.fullName || me.username || 'U').trim());
    const src        = (hasDataUrl || looksURL) ? me.avatar : `https://ui-avatars.com/api/?name=${label}`;
    if (previewBox) {
      previewBox.innerHTML = `<img src="${src}" alt="Preview" style="width:120px;height:120px;object-fit:cover;border-radius:50%;display:block;">`;
    }

    // Preview al elegir nueva foto
    if (fileInput) {
      fileInput.onchange = () => {
        const f = fileInput.files?.[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          if (previewBox) {
            previewBox.innerHTML = `<img src="${r.result}" alt="Preview" style="width:120px;height:120px;object-fit:cover;border-radius:50%;display:block;">`;
          }
        };
        r.readAsDataURL(f);
      };
    }
  } catch (err) {
    console.error('prefill error:', err);
    window.location.href = 'login.html';
  }
}

// Dispara al cargar DOM y también en pageshow (cubre BFCache)
document.addEventListener('DOMContentLoaded', prefillEditAccount);
window.addEventListener('pageshow', (e) => {
  // Si la página se restauró desde el Back/Forward Cache o navegaste muy rápido
  if (e.persisted) prefillEditAccount();
});


// Guardar cambios en Modify Account (submit del form)
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('editAccForm');
  if (!form) return;

  const $ = (id) => document.getElementById(id);
  const usernameInput = $('username');
  const nameInput     = $('Name');
  const lastnameInput = $('Lastname');
  const birthInput    = $('birthDate');
  const fileInput     = $('userAvatar');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!localStorage.getItem('token')) {
      window.location.href = 'login.html';
      return;
    }

    const username = (usernameInput?.value || '').trim();
    const name     = (nameInput?.value || '').trim();
    const lastname = (lastnameInput?.value || '').trim();
    const birthDate = birthInput?.value || ''; // ya está YYYY-MM-DD por el prefill

    if (!username || !name || !lastname || !birthDate) {
      alert('Completa todos los campos.');
      return;
    }

    // Convierte imagen a base64 solo si se eligió una nueva
    const toBase64 = (file) => new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });

    let avatarBase64 = null;
    if (fileInput?.files?.[0]) {
      try { avatarBase64 = await toBase64(fileInput.files[0]); }
      catch { alert('No se pudo leer la imagen.'); return; }
    }

    const payload = {
      username,
      fullName: `${name} ${lastname}`.trim(),
      birthDate,      // YYYY-MM-DD
      avatarBase64    // null -> no cambia avatar
    };

    try {
      const updated = await fetchJSON(`${API_BASE}/api/account`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      alert('Cuenta actualizada ✅');
      // Si quieres, re-precarga el formulario con lo guardado:
      // prefillEditAccount();
    } catch (err) {
      console.error(err);
      alert('No se pudo actualizar: ' + err.message);
    }
  });
});



// ===== PERFIL (profile.html) =====
(function () {
  function qs(name) {
    const m = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }

  function avatarSrc(user) {
    if (user?.avatar && user.avatar.startsWith('data:')) return user.avatar;
    const name = encodeURIComponent(user?.fullName || user?.username || 'User');
    return `https://ui-avatars.com/api/?name=${name}&background=random`;
  }

  async function initProfilePage() {
    const avatarEl = document.getElementById('profileAvatar');
    const nameEl   = document.getElementById('profileName');
    const userEl   = document.getElementById('profileUsername');
    if (!avatarEl || !nameEl || !userEl) return; // no es profile.html

    // 1) Preferir lo que dejó la lista
    let user = null;
    try {
      const raw = sessionStorage.getItem('profileUser');
      if (raw) user = JSON.parse(raw);
    } catch (_) {}

    // 2) Fallback: si no hay, intenta usar ?user=<id> para leer del pre-cache
    if (!user) {
      const uid = qs('user') || qs('uid');
      if (uid) {
        const cached = sessionStorage.getItem(`profile-cache:${uid}`);
        if (cached) {
          user = JSON.parse(cached);
        } else {
          // 3) Último fallback: pedir al backend
          const fetched = await fetchUserByUid(uid);
          if (fetched) {
            user = {
              id: fetched.id,
              username: fetched.username,
              fullName: fetched.fullName,
              avatar: fetched.avatar || null
            };
          }
        }
      }
    }

    // 4) Si aún no hay, usa placeholder
    if (!user) user = { username: 'unknown', fullName: 'Unknown User', avatar: null };

    // 5) Pinta
    avatarEl.src = avatarSrc(user);
    nameEl.textContent = user.fullName || user.username || 'Usuario';
    userEl.textContent = user.username ? '@' + user.username : '';


    const form = document.getElementById('add_friend');
    const followBtn = form?.querySelector('button[type="submit"]');

    // Intenta obtener el id del usuario de perfil
    const uidFromQS = (function () {
      const m = /[?&]user=([^&#]+)/.exec(window.location.search);
      return m ? decodeURIComponent(m[1]) : null;
    })();

    const targetId = (user && user.id) ? user.id : uidFromQS;

    if (form && followBtn && targetId) {
      // 1) Cargar estado de follow para pintar el botón correctamente
      try {
        const st = await getFollowStatus(targetId);
        if (st?.following) {
          followBtn.textContent = 'Already following';
          followBtn.disabled = true;
        }
      } catch (_) {
        // si falla el status, no bloqueamos la UI; el POST fallará si no procede
      }

      // 2) Envío del follow
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await followUser(targetId);
          followBtn.textContent = 'Already following';
          followBtn.disabled = true;
        } catch (err) {
          alert('No se pudo seguir: ' + err.message);
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', initProfilePage);
})();



// ===== FOLLOWERS LIST (followers_list.html) =====
document.addEventListener('DOMContentLoaded', () => {
  // Detectar si estamos en followers_list.html por los elementos clave:
  const listContainer = document.querySelector('.followers-list');
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const titleEl = document.querySelector('.content-title');

  if (!listContainer || !searchForm || !searchInput) {
    // No estamos en esta página
    return;
  }

  // Ajusta el título para que no quede "Explore Users"
  if (titleEl) titleEl.textContent = 'Followers';

  // Helper: avatar HTML
  function avatarHTML(user) {
    // Usa base64 si viene del backend
    if (user.avatar && typeof user.avatar === 'string' && user.avatar.startsWith('data:image')) {
      return `<img class="friend-avatar-img" src="${user.avatar}" alt="${user.fullName || user.username}">`;
    }
    // Fallback: iniciales
    const name = (user.fullName || user.username || 'U').trim();
    const initials = name.split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
    return `
      <div class="friend-avatar-fallback">
        <span>${initials}</span>
      </div>
    `;
  }

  function profileHrefFor(u) {
    return `profile.html?user=${encodeURIComponent(u.id)}`;
  }

  // Render de tarjetas (misma estética que explore)
  function renderUsers(users) {
    if (!Array.isArray(users) || users.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <p>No followers found.</p>
        </div>
      `;
      return;
    }

    // Cache ligero para cargar perfil más rápido
    users.forEach(u => {
      sessionStorage.setItem(`profile-cache:${u.id}`, JSON.stringify({
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        avatar: u.avatar || null
      }));
    });

    const cards = users.map(u => {
      const profileHref = profileHrefFor(u);
      return `
        <div class="friend-card">
          <div class="friend-avatar">
            ${avatarHTML(u)}
          </div>
          <div class="friend-info">
            <div class="friend-name">${(u.fullName || u.username || 'Unknown')}</div>
            <div class="friend-username">${u.username ? '@' + u.username : ''}</div>
          </div>
          <div class="action-buttons">
            <button class="btn btn-primary"
                    data-profile="${profileHref}"
                    data-uid="${u.id}">
              <i class="fas fa-id-badge"></i> Profile
            </button>
          </div>
        </div>
      `;
    }).join('');

    listContainer.innerHTML = cards;

    // Delegación de eventos para abrir perfil
    listContainer.querySelectorAll('button[data-profile]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const href = e.currentTarget.getAttribute('data-profile');
        const uid  = e.currentTarget.getAttribute('data-uid');

        if (uid) {
          const cached = sessionStorage.getItem(`profile-cache:${uid}`);
          if (cached) sessionStorage.setItem('profileUser', cached);
        }
        window.location.href = href || `profile.html?user=${encodeURIComponent(uid)}`;
      });
    });
  }

  // Carga followers desde API (filtra por q en backend)
  async function loadFollowers(q = '') {
    try {
      const url = `${API_BASE}/api/followers?q=${encodeURIComponent(q)}`;
      const data = await fetchJSON(url);  // tu helper global con headers/auth
      // data: { users: [ {id, username, fullName, avatar} ] }
      renderUsers(data.users || []);
    } catch (err) {
      console.error('Error cargando followers:', err);
      listContainer.innerHTML = `
        <div class="empty-state error">
          <p>Could not load followers: ${err.message}</p>
        </div>
      `;
    }
  }

  // Búsqueda
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    loadFollowers(q);
  });

  // Búsqueda reactiva (debounce)
  let t;
  searchInput.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => loadFollowers(searchInput.value.trim()), 300);
  });

  // Inicial
  loadFollowers('');
});


const btnFollowers = document.getElementById('btnFollowers');
if (btnFollowers) {
  btnFollowers.addEventListener('click', () => {
    window.location.href = 'followers_list.html';
  });
}




// Menú (seguro y después de que exista el DOM)
document.addEventListener("DOMContentLoaded", () => {
  const avatar = document.getElementById("userAvatar");
  const dropdown = document.getElementById("userDropdown");
  if (!avatar || !dropdown) return;

  avatar.addEventListener("click", () => {
    dropdown.classList.toggle("show");
  });

  document.addEventListener("click", (e) => {
    if (!avatar.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove("show");
    }
  });
});


document.addEventListener("DOMContentLoaded", () => {
  const dateElement = document.getElementById("inclusionDate");
  const today = new Date();
  const formatted = today.toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  dateElement.textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
});



