/**
 * ==============================================================================
 * Acompanhamento de Ponto - Lógica do Aplicativo em JavaScript Puro (Vanilla JS)
 * Otimizado para Aplicativo Web e Celular (Progressive Web App - PWA)
 * ==============================================================================
 */

// Chaves de armazenamento no localStorage
const STORAGE_USERS = 'ponto_users';
const STORAGE_PUNCHES = 'ponto_records';
const STORAGE_JUSTIFICATIONS = 'ponto_justifications';
const STORAGE_ACTIVE_USER_ID = 'ponto_active_user_id';

// Variáveis de estado global
let users = [];
let punches = [];
let justifications = [];
let activeUser = null;
let weeklyChartInstance = null;
let statusChartInstance = null;
let pendingJustificationIdToReview = null;
let deferredInstallPrompt = null;
let lastKnownLocation = null;

/* ==========================================================================
   1. Inicialização de Dados Padrão (Demonstração)
   ========================================================================== */
function initDefaultData() {
  const storedUsers = localStorage.getItem(STORAGE_USERS);
  const storedPunches = localStorage.getItem(STORAGE_PUNCHES);
  const storedJust = localStorage.getItem(STORAGE_JUSTIFICATIONS);

  if (!storedUsers) {
    users = [
      {
        id: 'usr-1',
        nome: 'Carlos Mendes (ADM)',
        email: 'carlos.mendes@empresa.com',
        cargo: 'Gerente de Operações',
        depto: 'Gestão de Pessoas',
        perfil: 'gestor',
        cargaHoraria: 8
      },
      {
        id: 'usr-2',
        nome: 'Ana Souza',
        email: 'ana.souza@empresa.com',
        cargo: 'Desenvolvedora Frontend',
        depto: 'Tecnologia',
        perfil: 'colaborador',
        cargaHoraria: 8
      },
      {
        id: 'usr-3',
        nome: 'João Pedro Oliveira',
        email: 'joao.pedro@empresa.com',
        cargo: 'Designer UI/UX',
        depto: 'Produto',
        perfil: 'colaborador',
        cargaHoraria: 8
      }
    ];
    saveToStorage(STORAGE_USERS, users);
  } else {
    users = JSON.parse(storedUsers);
  }

  if (!storedPunches) {
    const today = new Date();
    punches = [];
    
    for (let i = 5; i >= 1; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      punches.push({
        id: 'pnc-' + Math.random().toString(36).substr(2, 9),
        userId: 'usr-2',
        date: dateStr,
        entrada: '08:00',
        intervalo: '12:00',
        retorno: '13:00',
        saida: i % 2 === 0 ? '17:30' : '17:00',
        local: 'Sede da Empresa (GPS)'
      });
    }
    saveToStorage(STORAGE_PUNCHES, punches);
  } else {
    punches = JSON.parse(storedPunches);
  }

  if (!storedJust) {
    justifications = [
      {
        id: 'jst-1',
        userId: 'usr-2',
        userName: 'Ana Souza',
        createdAt: new Date().toLocaleDateString('pt-BR'),
        date: getFormattedDateOffset(-2),
        tipo: 'Atestado Médico',
        horas: 8,
        motivo: 'Consulta médica de rotina e exames laboratoriais. Atestado nº 45892.',
        status: 'Pendente',
        parecer: ''
      }
    ];
    saveToStorage(STORAGE_JUSTIFICATIONS, justifications);
  } else {
    justifications = JSON.parse(storedJust);
  }

  const savedActiveUserId = localStorage.getItem(STORAGE_ACTIVE_USER_ID);
  if (savedActiveUserId && users.some(u => u.id === savedActiveUserId)) {
    activeUser = users.find(u => u.id === savedActiveUserId);
  } else {
    activeUser = users[1] || users[0];
  }
}

function saveToStorage(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function getFormattedDateOffset(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

/* ==========================================================================
   2. Service Worker e Instalação PWA no Celular
   ========================================================================== */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('Service Worker PWA registrado com sucesso:', reg.scope);
        })
        .catch((err) => {
          console.log('Falha ao registrar Service Worker:', err);
        });
    });
  }

  // Captura o evento de instalação do app móvel
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    
    // Exibe botões de instalação
    const btnInstall = document.getElementById('btnInstallPwa');
    const banner = document.getElementById('mobileInstallBanner');
    if (btnInstall) btnInstall.style.display = 'inline-flex';
    if (banner && window.innerWidth <= 768) banner.style.display = 'flex';
  });

  // Ação ao clicar no botão de instalação
  const triggerInstall = () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('Usuário instalou o aplicativo no celular!');
        }
        deferredInstallPrompt = null;
        document.getElementById('btnInstallPwa').style.display = 'none';
        document.getElementById('mobileInstallBanner').style.display = 'none';
      });
    } else {
      alert('Para instalar este app no seu celular:\n\n• No Android (Chrome): Toque nos 3 pontinhos no canto superior e selecione "Instalar aplicativo" ou "Adicionar à tela inicial".\n• No iPhone (Safari): Toque no botão de Compartilhar (quadrado com seta para cima) e escolha "Adicionar à Tela de Início".');
    }
  };

  document.getElementById('btnInstallPwa').addEventListener('click', triggerInstall);
  document.getElementById('btnBannerInstall').addEventListener('click', triggerInstall);
}

/* ==========================================================================
   3. Geolocalização (GPS) para Mobile
   ========================================================================== */
function initGeolocation() {
  const badge = document.getElementById('locationBadge');
  const locText = document.getElementById('locationText');

  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lastKnownLocation = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
        if (locText) locText.textContent = `GPS Ativo: ${lastKnownLocation}`;
      },
      (err) => {
        if (locText) locText.textContent = 'GPS Opcional (Permissão não concedida ou dispositivo sem GPS)';
      },
      { timeout: 8000 }
    );
  }
}

/* ==========================================================================
   4. Relógio e Data em Tempo Real
   ========================================================================== */
function startClock() {
  const clockEl = document.getElementById('digitalClock');
  const dateEl = document.getElementById('clockFullDate');
  const topDateEl = document.getElementById('currentDateDisplay');

  function update() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    clockEl.textContent = `${hours}:${minutes}:${seconds}`;

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateFormatted = now.toLocaleDateString('pt-BR', options);
    const capitalized = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);
    dateEl.textContent = capitalized;
    topDateEl.textContent = `Hoje é ${capitalized}`;
  }

  update();
  setInterval(update, 1000);
}

/* ==========================================================================
   5. Gestão de Perfis e Usuários
   ========================================================================== */
function setupUserSelector() {
  const select = document.getElementById('activeUserSelect');
  select.innerHTML = '';

  users.forEach(u => {
    const option = document.createElement('option');
    option.value = u.id;
    option.textContent = `${u.nome} (${u.perfil === 'gestor' ? 'Gestor ADM' : 'Colaborador'})`;
    if (u.id === activeUser.id) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  select.addEventListener('change', (e) => {
    const selectedId = e.target.value;
    activeUser = users.find(u => u.id === selectedId);
    localStorage.setItem(STORAGE_ACTIVE_USER_ID, activeUser.id);
    applyUserProfile();
  });
}

function applyUserProfile() {
  const avatar = document.getElementById('sidebarAvatar');
  const roleBadge = document.getElementById('userRoleBadge');
  const welcome = document.getElementById('welcomeGreeting');

  const initials = activeUser.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  avatar.textContent = initials;
  roleBadge.textContent = activeUser.perfil === 'gestor' ? 'Gestor (ADM)' : 'Colaborador';
  roleBadge.className = activeUser.perfil === 'gestor' ? 'role-pill gestor' : 'role-pill';

  welcome.textContent = `Olá, ${activeUser.nome.split(' ')[0]}!`;

  // Controla abas exclusivas do Gestor
  const adminElements = document.querySelectorAll('.admin-only-item');
  adminElements.forEach(el => {
    el.style.display = activeUser.perfil === 'gestor' ? 'block' : 'none';
  });

  // Item da barra inferior mobile para gestor
  const adminBottomItem = document.querySelector('.admin-bottom-item');
  if (adminBottomItem) {
    adminBottomItem.style.display = activeUser.perfil === 'gestor' ? 'flex' : 'none';
  }

  const activeTabBtn = document.querySelector('.nav-btn.active');
  const currentTab = activeTabBtn ? activeTabBtn.getAttribute('data-tab') : 'tab-ponto';
  if (activeUser.perfil !== 'gestor' && (currentTab === 'tab-gestao' || currentTab === 'tab-usuarios')) {
    switchTab('tab-ponto');
  }

  updatePunchButtonsState();
  renderTodayTimeline();
  renderStats();
  renderHistoryTable();
  renderUserJustifications();
  renderAdmDashboard();
  renderRegisteredUsersTable();
  renderCharts();
}

/* ==========================================================================
   6. Registro de Ponto
   ========================================================================== */
function getTodayDateStr() {
  return new Date().toISOString().split('T')[0];
}

function getTodayPunch(userId) {
  const todayStr = getTodayDateStr();
  return punches.find(p => p.userId === userId && p.date === todayStr);
}

function getOrCreateTodayPunch(userId) {
  let todayPunch = getTodayPunch(userId);
  if (!todayPunch) {
    todayPunch = {
      id: 'pnc-' + Math.random().toString(36).substr(2, 9),
      userId: userId,
      date: getTodayDateStr(),
      entrada: null,
      intervalo: null,
      retorno: null,
      saida: null,
      local: lastKnownLocation ? `GPS: ${lastKnownLocation}` : 'Dispositivo Local'
    };
    punches.push(todayPunch);
    saveToStorage(STORAGE_PUNCHES, punches);
  }
  return todayPunch;
}

function getCurrentTimeStr() {
  const now = new Date();
  return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
}

function updatePunchButtonsState() {
  const p = getTodayPunch(activeUser.id);
  const btnEntrada = document.getElementById('btnPunchEntrada');
  const btnIntervalo = document.getElementById('btnPunchIntervalo');
  const btnRetorno = document.getElementById('btnPunchRetorno');
  const btnSaida = document.getElementById('btnPunchSaida');
  const badge = document.getElementById('todayStatusBadge');

  if (!p || !p.entrada) {
    btnEntrada.disabled = false;
    btnIntervalo.disabled = true;
    btnRetorno.disabled = true;
    btnSaida.disabled = true;
    badge.textContent = 'Jornada Não Iniciada';
    badge.className = 'badge badge-neutral';
  } else if (p.entrada && !p.intervalo && !p.saida) {
    btnEntrada.disabled = true;
    btnIntervalo.disabled = false;
    btnRetorno.disabled = true;
    btnSaida.disabled = false;
    badge.textContent = 'Em Trabalho (Manhã)';
    badge.className = 'badge badge-success';
  } else if (p.intervalo && !p.retorno) {
    btnEntrada.disabled = true;
    btnIntervalo.disabled = true;
    btnRetorno.disabled = false;
    btnSaida.disabled = true;
    badge.textContent = 'Em Intervalo / Almoço';
    badge.className = 'badge badge-warning';
  } else if (p.retorno && !p.saida) {
    btnEntrada.disabled = true;
    btnIntervalo.disabled = true;
    btnRetorno.disabled = true;
    btnSaida.disabled = false;
    badge.textContent = 'Em Trabalho (Tarde)';
    badge.className = 'badge badge-success';
  } else if (p.saida) {
    btnEntrada.disabled = true;
    btnIntervalo.disabled = true;
    btnRetorno.disabled = true;
    btnSaida.disabled = true;
    badge.textContent = 'Jornada Concluída';
    badge.className = 'badge badge-info';
  }
}

function handlePunch(type) {
  const time = getCurrentTimeStr();
  const punch = getOrCreateTodayPunch(activeUser.id);
  const feedback = document.getElementById('punchFeedback');

  let typeLabel = '';

  if (type === 'entrada') {
    punch.entrada = time;
    typeLabel = 'Entrada';
  } else if (type === 'intervalo') {
    punch.intervalo = time;
    typeLabel = 'Saída Almoço';
  } else if (type === 'retorno') {
    punch.retorno = time;
    typeLabel = 'Retorno Almoço';
  } else if (type === 'saida') {
    punch.saida = time;
    typeLabel = 'Saída Final';
  }

  if (lastKnownLocation) {
    punch.local = `GPS: ${lastKnownLocation}`;
  }

  saveToStorage(STORAGE_PUNCHES, punches);

  feedback.className = 'feedback-msg success';
  feedback.textContent = `✅ Ponto de ${typeLabel} registrado às ${time}!`;
  setTimeout(() => { feedback.textContent = ''; }, 5000);

  // Vibração tátil no celular se suportado
  if ('vibrate' in navigator) {
    navigator.vibrate([100, 50, 100]);
  }

  updatePunchButtonsState();
  renderTodayTimeline();
  renderStats();
  renderHistoryTable();
  renderCharts();
  renderAdmDashboard();
}

function renderTodayTimeline() {
  const container = document.getElementById('todayTimeline');
  container.innerHTML = '';
  const p = getTodayPunch(activeUser.id);

  if (!p || (!p.entrada && !p.intervalo && !p.retorno && !p.saida)) {
    container.innerHTML = '<p class="text-muted" style="padding: 12px 0;">Nenhuma marcação realizada hoje ainda. Toque em "Entrada" acima para começar seu expediente.</p>';
    return;
  }

  const items = [
    { title: 'Entrada Inicial', time: p.entrada, class: 'entrada', icon: '🟢' },
    { title: 'Saída para Intervalo (Almoço)', time: p.intervalo, class: 'intervalo', icon: '🟡' },
    { title: 'Retorno do Intervalo', time: p.retorno, class: 'retorno', icon: '🔵' },
    { title: 'Saída Final', time: p.saida, class: 'saida', icon: '🔴' }
  ];

  items.forEach(item => {
    if (item.time) {
      const el = document.createElement('div');
      el.className = `timeline-item ${item.class}`;
      el.innerHTML = `
        <div class="timeline-left">
          <span>${item.icon}</span>
          <span class="timeline-title">${item.title}</span>
        </div>
        <div class="timeline-time">${item.time}</div>
      `;
      container.appendChild(el);
    }
  });
}

/* ==========================================================================
   7. Cálculos de Horas e Saldos
   ========================================================================== */
function parseMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function formatMinutesToHours(minutes) {
  const isNegative = minutes < 0;
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = Math.floor(abs % 60);
  return `${isNegative ? '-' : ''}${h}h ${String(m).padStart(2, '0')}m`;
}

function calculateDailyMinutes(punch) {
  if (!punch) return 0;
  let total = 0;

  if (punch.entrada) {
    const e = parseMinutes(punch.entrada);
    if (punch.intervalo) {
      const i = parseMinutes(punch.intervalo);
      if (i > e) total += (i - e);
    } else if (punch.saida) {
      const s = parseMinutes(punch.saida);
      if (s > e) total += (s - e);
    }
  }

  if (punch.retorno && punch.saida) {
    const r = parseMinutes(punch.retorno);
    const s = parseMinutes(punch.saida);
    if (s > r) total += (s - r);
  }

  return total;
}

function renderStats() {
  const todayPunch = getTodayPunch(activeUser.id);
  const todayMinutes = calculateDailyMinutes(todayPunch);
  document.getElementById('statTodayHours').textContent = formatMinutesToHours(todayMinutes).replace('+', '');

  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const userPunchesMonth = punches.filter(p => p.userId === activeUser.id && p.date.startsWith(currentMonthStr));

  let monthMinutes = 0;
  let balanceMinutes = 0;
  const dailyWorkloadMinutes = (activeUser.cargaHoraria || 8) * 60;

  userPunchesMonth.forEach(p => {
    const dayMin = calculateDailyMinutes(p);
    monthMinutes += dayMin;
    if (p.saida) {
      balanceMinutes += (dayMin - dailyWorkloadMinutes);
    }
  });

  const approvedJustThisMonth = justifications.filter(j => 
    j.userId === activeUser.id && 
    j.status === 'Aprovada' && 
    j.date.startsWith(currentMonthStr)
  );
  approvedJustThisMonth.forEach(j => {
    const justMin = (j.horas || activeUser.cargaHoraria || 8) * 60;
    monthMinutes += justMin;
  });

  document.getElementById('statMonthHours').textContent = formatMinutesToHours(monthMinutes).replace('+', '');
  
  const balanceEl = document.getElementById('statBalanceHours');
  balanceEl.textContent = (balanceMinutes >= 0 ? '+' : '') + formatMinutesToHours(balanceMinutes);
  balanceEl.style.color = balanceMinutes >= 0 ? 'var(--success)' : 'var(--danger)';

  const pendingJustifications = justifications.filter(j => j.userId === activeUser.id && j.status === 'Pendente');
  document.getElementById('statPendingCount').textContent = pendingJustifications.length;
}

/* ==========================================================================
   8. Histórico de Ponto
   ========================================================================== */
function renderHistoryTable() {
  const tbody = document.getElementById('historyTableBody');
  const monthFilter = document.getElementById('historyMonthFilter').value;
  tbody.innerHTML = '';

  let userPunches = punches.filter(p => p.userId === activeUser.id);
  if (monthFilter) {
    userPunches = userPunches.filter(p => p.date.startsWith(monthFilter));
  }

  userPunches.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (userPunches.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-muted);">Nenhum registro encontrado no período.</td></tr>';
    return;
  }

  const dailyStandardMinutes = (activeUser.cargaHoraria || 8) * 60;

  userPunches.forEach(p => {
    const totalMinutes = calculateDailyMinutes(p);
    const balance = p.saida ? (totalMinutes - dailyStandardMinutes) : 0;
    const dateFormatted = new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR');

    let statusBadge = '<span class="badge badge-success">Completo</span>';
    if (!p.saida) {
      statusBadge = '<span class="badge badge-warning">Em Aberto</span>';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${dateFormatted}</strong></td>
      <td>${p.entrada || '--:--'}</td>
      <td>${p.intervalo || '--:--'}</td>
      <td>${p.retorno || '--:--'}</td>
      <td>${p.saida || '--:--'}</td>
      <td>${formatMinutesToHours(totalMinutes).replace('+', '')}</td>
      <td style="color: ${balance >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: 600;">
        ${p.saida ? (balance >= 0 ? '+' : '') + formatMinutesToHours(balance) : '--'}
      </td>
      <td><small class="text-muted">${p.local || 'Local'}</small></td>
      <td>${statusBadge}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ==========================================================================
   9. Justificativas
   ========================================================================== */
function setupJustificationForm() {
  const form = document.getElementById('justificativaForm');
  document.getElementById('justData').max = getTodayDateStr();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = document.getElementById('justData').value;
    const tipo = document.getElementById('justTipo').value;
    const horas = parseFloat(document.getElementById('justHoras').value) || activeUser.cargaHoraria || 8;
    const motivo = document.getElementById('justMotivo').value.trim();

    if (!data || !tipo || !motivo) {
      alert('Por favor, preencha todos os campos obrigatórios (*).');
      return;
    }

    const newJust = {
      id: 'jst-' + Math.random().toString(36).substr(2, 9),
      userId: activeUser.id,
      userName: activeUser.nome,
      createdAt: new Date().toLocaleDateString('pt-BR'),
      date: data,
      tipo: tipo,
      horas: horas,
      motivo: motivo,
      status: 'Pendente',
      parecer: ''
    };

    justifications.unshift(newJust);
    saveToStorage(STORAGE_JUSTIFICATIONS, justifications);

    alert('Justificativa enviada com sucesso! O gestor responsável analisará a solicitação.');
    form.reset();
    renderUserJustifications();
    renderStats();
    renderAdmDashboard();
    renderCharts();
  });
}

function renderUserJustifications() {
  const tbody = document.getElementById('userJustificationsTableBody');
  tbody.innerHTML = '';

  const userJust = justifications.filter(j => j.userId === activeUser.id);
  if (userJust.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Você não possui justificativas cadastradas.</td></tr>';
    return;
  }

  userJust.forEach(j => {
    let badgeClass = 'badge-warning';
    if (j.status === 'Aprovada') badgeClass = 'badge-success';
    if (j.status === 'Rejeitada') badgeClass = 'badge-danger';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${j.createdAt}</td>
      <td>${new Date(j.date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
      <td><strong>${j.tipo}</strong></td>
      <td>${escapeHTML(j.motivo)}</td>
      <td>${j.horas}h</td>
      <td><span class="badge ${badgeClass}">${j.status}</span></td>
      <td>${j.parecer ? `<em>"${escapeHTML(j.parecer)}"</em>` : '<span class="text-muted">Aguardando parecer</span>'}</td>
    `;
    tbody.appendChild(tr);
  });
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

/* ==========================================================================
   10. Painel do Gestor (ADM)
   ========================================================================== */
function renderAdmDashboard() {
  if (activeUser.perfil !== 'gestor') return;

  const totalEmployees = users.length;
  document.getElementById('statAdmTotalEmployees').textContent = totalEmployees;

  const todayStr = getTodayDateStr();
  const activeToday = punches.filter(p => p.date === todayStr && p.entrada && !p.saida).length;
  document.getElementById('statAdmActiveToday').textContent = activeToday;

  const pendingJust = justifications.filter(j => j.status === 'Pendente');
  document.getElementById('statAdmPendingJust').textContent = pendingJust.length;

  const currentMonth = new Date().toISOString().slice(0, 7);
  let totalTeamMinutes = 0;
  punches.filter(p => p.date.startsWith(currentMonth)).forEach(p => {
    totalTeamMinutes += calculateDailyMinutes(p);
  });
  document.getElementById('statAdmTeamHours').textContent = `${Math.floor(totalTeamMinutes / 60)}h`;

  const justTbody = document.getElementById('admJustificationsTableBody');
  justTbody.innerHTML = '';

  if (pendingJust.length === 0) {
    justTbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Nenhuma justificativa pendente no momento.</td></tr>';
  } else {
    pendingJust.forEach(j => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${j.userName}</strong></td>
        <td>${new Date(j.date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
        <td>${j.tipo}</td>
        <td>${escapeHTML(j.motivo)}</td>
        <td>${j.horas}h</td>
        <td><span class="badge badge-warning">${j.status}</span></td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="openReviewModal('${j.id}')">🔍 Avaliar</button>
        </td>
      `;
      justTbody.appendChild(tr);
    });
  }

  const selectFilter = document.getElementById('admFilterEmployee');
  const currentValue = selectFilter.value;
  selectFilter.innerHTML = '<option value="all">Todos os Colaboradores</option>';
  users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = `${u.nome} (${u.cargo})`;
    selectFilter.appendChild(opt);
  });
  selectFilter.value = currentValue || 'all';

  renderAdmTeamPunchTable();
}

function renderAdmTeamPunchTable() {
  const tbody = document.getElementById('admTeamPunchTableBody');
  const filterUserId = document.getElementById('admFilterEmployee').value;
  tbody.innerHTML = '';

  let list = punches;
  if (filterUserId !== 'all') {
    list = list.filter(p => p.userId === filterUserId);
  }

  list.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Nenhum registro encontrado para este filtro.</td></tr>';
    return;
  }

  list.forEach(p => {
    const employee = users.find(u => u.id === p.userId) || { nome: 'Desconhecido', cargaHoraria: 8 };
    const totalMinutes = calculateDailyMinutes(p);
    const dailyStandard = (employee.cargaHoraria || 8) * 60;
    const balance = p.saida ? (totalMinutes - dailyStandard) : 0;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${employee.nome}</strong></td>
      <td>${new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
      <td>${p.entrada || '--:--'}</td>
      <td>${p.intervalo || '--:--'}</td>
      <td>${p.retorno || '--:--'}</td>
      <td>${p.saida || '--:--'}</td>
      <td>${formatMinutesToHours(totalMinutes).replace('+', '')}</td>
      <td style="color: ${balance >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: 600;">
        ${p.saida ? (balance >= 0 ? '+' : '') + formatMinutesToHours(balance) : '--'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.openReviewModal = function(justId) {
  const j = justifications.find(item => item.id === justId);
  if (!j) return;

  pendingJustificationIdToReview = justId;
  const modal = document.getElementById('justModalOverlay');
  const title = document.getElementById('modalTitle');
  const desc = document.getElementById('modalDescription');
  const feedbackInput = document.getElementById('modalFeedback');

  title.textContent = `Avaliar Ocorrência: ${j.userName}`;
  desc.innerHTML = `
    <strong>Data da Ausência:</strong> ${new Date(j.date + 'T00:00:00').toLocaleDateString('pt-BR')}<br>
    <strong>Tipo de Ocorrência:</strong> ${j.tipo}<br>
    <strong>Horas Solicitadas:</strong> ${j.horas}h<br>
    <strong>Motivo declarado:</strong> <em>"${escapeHTML(j.motivo)}"</em>
  `;
  feedbackInput.value = '';
  modal.classList.add('active');
};

function setupModalActions() {
  const modal = document.getElementById('justModalOverlay');
  const btnClose = document.getElementById('btnModalClose');
  const btnApprove = document.getElementById('btnApproveJust');
  const btnReject = document.getElementById('btnRejectJust');

  function closeModal() {
    modal.classList.remove('active');
    pendingJustificationIdToReview = null;
  }

  btnClose.addEventListener('click', closeModal);

  btnApprove.addEventListener('click', () => {
    if (!pendingJustificationIdToReview) return;
    const j = justifications.find(item => item.id === pendingJustificationIdToReview);
    if (j) {
      j.status = 'Aprovada';
      j.parecer = document.getElementById('modalFeedback').value.trim() || 'Aprovado pela gestão.';
      saveToStorage(STORAGE_JUSTIFICATIONS, justifications);
      alert('Justificativa APROVADA com sucesso!');
      closeModal();
      renderAdmDashboard();
      renderUserJustifications();
      renderStats();
      renderCharts();
    }
  });

  btnReject.addEventListener('click', () => {
    if (!pendingJustificationIdToReview) return;
    const j = justifications.find(item => item.id === pendingJustificationIdToReview);
    if (j) {
      j.status = 'Rejeitada';
      j.parecer = document.getElementById('modalFeedback').value.trim() || 'Não atende aos critérios da política da empresa.';
      saveToStorage(STORAGE_JUSTIFICATIONS, justifications);
      alert('Justificativa REJEITADA.');
      closeModal();
      renderAdmDashboard();
      renderUserJustifications();
      renderStats();
      renderCharts();
    }
  });
}

/* ==========================================================================
   11. Cadastro de Usuários
   ========================================================================== */
function setupUserRegistrationForm() {
  const form = document.getElementById('userRegistrationForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = document.getElementById('regNome').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const cargo = document.getElementById('regCargo').value.trim();
    const depto = document.getElementById('regDepto').value.trim();
    const perfil = document.getElementById('regPerfil').value;
    const carga = parseFloat(document.getElementById('regCarga').value) || 8;

    if (!nome || !email || !cargo || !depto) {
      alert('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      alert('Já existe um usuário cadastrado com este e-mail corporativo.');
      return;
    }

    const newUser = {
      id: 'usr-' + Math.random().toString(36).substr(2, 9),
      nome,
      email,
      cargo,
      depto,
      perfil,
      cargaHoraria: carga
    };

    users.push(newUser);
    saveToStorage(STORAGE_USERS, users);

    alert(`✅ Usuário "${nome}" cadastrado com sucesso!`);
    form.reset();
    setupUserSelector();
    renderRegisteredUsersTable();
    renderAdmDashboard();
  });
}

function renderRegisteredUsersTable() {
  const tbody = document.getElementById('registeredUsersTableBody');
  tbody.innerHTML = '';

  users.forEach(u => {
    const isGestor = u.perfil === 'gestor';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${u.nome}</strong></td>
      <td>${u.email}</td>
      <td>${u.cargo}</td>
      <td>${u.depto}</td>
      <td><span class="badge ${isGestor ? 'badge-warning' : 'badge-info'}">${isGestor ? 'Gestor (ADM)' : 'Colaborador'}</span></td>
      <td>${u.cargaHoraria}h / dia</td>
      <td>
        ${users.length > 1 ? `<button class="btn btn-sm btn-outline" onclick="deleteUser('${u.id}')" title="Remover usuário">🗑️ Excluir</button>` : '<span class="text-muted">Principal</span>'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.deleteUser = function(userId) {
  if (users.length <= 1) {
    alert('Não é possível excluir o único usuário.');
    return;
  }
  const u = users.find(item => item.id === userId);
  if (confirm(`Deseja realmente remover o colaborador "${u.nome}"?`)) {
    users = users.filter(item => item.id !== userId);
    saveToStorage(STORAGE_USERS, users);
    if (activeUser.id === userId) {
      activeUser = users[0];
      localStorage.setItem(STORAGE_ACTIVE_USER_ID, activeUser.id);
      applyUserProfile();
    }
    setupUserSelector();
    renderRegisteredUsersTable();
    renderAdmDashboard();
  }
};

/* ==========================================================================
   12. Gráficos
   ========================================================================== */
function renderCharts() {
  if (typeof Chart === 'undefined') return;

  const ctxWeekly = document.getElementById('chartWeeklyHours').getContext('2d');
  const last7DaysLabels = [];
  const last7DaysData = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayLabel = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });
    last7DaysLabels.push(dayLabel);

    const punch = punches.find(p => p.userId === activeUser.id && p.date === dateStr);
    const hours = punch ? (calculateDailyMinutes(punch) / 60).toFixed(1) : 0;
    last7DaysData.push(Number(hours));
  }

  if (weeklyChartInstance) {
    weeklyChartInstance.destroy();
  }

  weeklyChartInstance = new Chart(ctxWeekly, {
    type: 'bar',
    data: {
      labels: last7DaysLabels,
      datasets: [{
        label: 'Horas Trabalhadas',
        data: last7DaysData,
        backgroundColor: '#2563eb',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, suggestedMax: 10, title: { display: true, text: 'Horas' } }
      }
    }
  });

  const ctxStatus = document.getElementById('chartAttendanceStatus').getContext('2d');
  const userPunches = punches.filter(p => p.userId === activeUser.id);
  const diasTrabalhados = userPunches.filter(p => p.saida).length;
  const ausenciasAprovadas = justifications.filter(j => j.userId === activeUser.id && j.status === 'Aprovada').length;
  const ausenciasPendentes = justifications.filter(j => j.userId === activeUser.id && j.status === 'Pendente').length;

  if (statusChartInstance) {
    statusChartInstance.destroy();
  }

  statusChartInstance = new Chart(ctxStatus, {
    type: 'doughnut',
    data: {
      labels: ['Ponto Concluído', 'Justificadas', 'Pendentes'],
      datasets: [{
        data: [diasTrabalhados || 1, ausenciasAprovadas, ausenciasPendentes],
        backgroundColor: ['#10b981', '#3b82f6', '#f59e0b']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });

  renderMetricsSummary(diasTrabalhados, ausenciasAprovadas, ausenciasPendentes);
}

function renderMetricsSummary(trabalhados, justAprovadas, pendentes) {
  const container = document.getElementById('metricsSummaryContainer');
  const totalDias = trabalhados + justAprovadas;
  const assiduidade = totalDias > 0 ? ((trabalhados / totalDias) * 100).toFixed(0) : 100;

  container.innerHTML = `
    <div class="metric-box">
      <h4>Taxa de Presença</h4>
      <p style="color: var(--primary);">${assiduidade}%</p>
    </div>
    <div class="metric-box">
      <h4>Dias Registrados</h4>
      <p style="color: var(--success);">${trabalhados} dias</p>
    </div>
    <div class="metric-box">
      <h4>Ausências Justificadas</h4>
      <p style="color: #3b82f6;">${justAprovadas} ocorrências</p>
    </div>
    <div class="metric-box">
      <h4>Em Análise</h4>
      <p style="color: var(--warning);">${pendentes}</p>
    </div>
  `;
}

/* ==========================================================================
   13. Navegação (Desktop Sidebar + Mobile Bottom Navigation)
   ========================================================================== */
function setupTabs() {
  // Botoes da sidebar
  const navButtons = document.querySelectorAll('.nav-btn');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      switchTab(target);
    });
  });

  // Botoes da Bottom Bar do Celular
  const bottomNavButtons = document.querySelectorAll('.bottom-nav-item');
  bottomNavButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      switchTab(target);
    });
  });

  const toggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  if (toggle) {
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }
}

function switchTab(tabId) {
  // Atualiza sidebar
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
  });

  // Atualiza barra inferior do celular
  document.querySelectorAll('.bottom-nav-item').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
  });

  document.querySelectorAll('.tab-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === tabId);
  });

  if (tabId === 'tab-graficos') {
    setTimeout(renderCharts, 100);
  }

  document.getElementById('sidebar').classList.remove('open');
}

/* ==========================================================================
   14. Inicialização
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initDefaultData();
  registerServiceWorker();
  initGeolocation();
  startClock();
  setupUserSelector();
  setupTabs();
  setupJustificationForm();
  setupModalActions();
  setupUserRegistrationForm();

  document.getElementById('btnPunchEntrada').addEventListener('click', () => handlePunch('entrada'));
  document.getElementById('btnPunchIntervalo').addEventListener('click', () => handlePunch('intervalo'));
  document.getElementById('btnPunchRetorno').addEventListener('click', () => handlePunch('retorno'));
  document.getElementById('btnPunchSaida').addEventListener('click', () => handlePunch('saida'));

  document.getElementById('historyMonthFilter').addEventListener('change', renderHistoryTable);
  document.getElementById('btnResetHistoryFilter').addEventListener('click', () => {
    document.getElementById('historyMonthFilter').value = '';
    renderHistoryTable();
  });

  document.getElementById('admFilterEmployee').addEventListener('change', renderAdmTeamPunchTable);
  document.getElementById('btnPrintReport').addEventListener('click', () => {
    window.print();
  });

  applyUserProfile();
});
