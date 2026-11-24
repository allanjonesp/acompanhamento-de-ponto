/**
 * ==============================================================================
 * Acompanhamento de Ponto - Lógica do Aplicativo em JavaScript Puro (Vanilla JS)
 * Versão 2.0: Batidas Flexíveis, Saídas Pontuais, Ajustes Retroativos e Gestão
 * ==============================================================================
 */

const APP_VERSION = 'v2.0 - Ponto Flexível';
console.log('%c✅ PontoFácil ' + APP_VERSION + ' carregado!', 'color: #2563eb; font-size: 14px; font-weight: bold;');

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
   1. Inicialização de Dados Padrão e Migração Automática
   ========================================================================== */
function initDefaultData() {
  const storedUsers = localStorage.getItem(STORAGE_USERS);
  const storedPunches = localStorage.getItem(STORAGE_PUNCHES);
  const storedJust = localStorage.getItem(STORAGE_JUSTIFICATIONS);

  if (!storedUsers) {
    users = [
      {
        id: 'usr-1',
        nome: 'Carlos Mendes (Gestor)',
        email: 'carlos.mendes@empresa.com',
        cargo: 'Gerente Geral / Operações',
        depto: 'Diretoria / Gestão',
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
    
    // Gera histórico para Ana Souza e Carlos Mendes com modelo de batidas flexíveis
    for (let i = 5; i >= 1; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = toLocalDateStr(d);

      // Exemplo de colaborador com saídas pontuais (ex: visita a cliente ou almoço)
      punches.push({
        id: 'pnc-' + Math.random().toString(36).substr(2, 9),
        userId: 'usr-2',
        date: dateStr,
        punches: [
          { time: '08:00', type: 'entrada', label: 'Entrada' },
          { time: '10:30', type: 'saida_pontual', label: 'Saída Pontual', motivo: 'Reunião Externa' },
          { time: '11:45', type: 'retorno', label: 'Retorno', motivo: '' },
          { time: '12:30', type: 'saida_pontual', label: 'Saída Almoço', motivo: 'Almoço' },
          { time: '13:30', type: 'retorno', label: 'Retorno', motivo: '' },
          { time: i % 2 === 0 ? '17:45' : '17:00', type: 'saida_final', label: 'Saída Final' }
        ],
        local: 'GPS: -23.5505, -46.6333',
        observacao: ''
      });
    }
    saveToStorage(STORAGE_PUNCHES, punches);
  } else {
    const rawPunches = JSON.parse(storedPunches);
    // Migração de formato antigo (entrada/intervalo/retorno/saida) para formato de lista flexível
    punches = rawPunches.map(p => {
      if (p.punches && Array.isArray(p.punches)) return p;
      const convertedPunches = [];
      if (p.entrada) convertedPunches.push({ time: p.entrada, type: 'entrada', label: 'Entrada' });
      if (p.intervalo) convertedPunches.push({ time: p.intervalo, type: 'saida_pontual', label: 'Saída Almoço', motivo: 'Almoço' });
      if (p.retorno) convertedPunches.push({ time: p.retorno, type: 'retorno', label: 'Retorno' });
      if (p.saida) convertedPunches.push({ time: p.saida, type: 'saida_final', label: 'Saída Final' });
      return {
        id: p.id || ('pnc-' + Math.random().toString(36).substr(2, 9)),
        userId: p.userId,
        date: p.date,
        punches: convertedPunches,
        local: p.local || 'Local',
        observacao: ''
      };
    });
    saveToStorage(STORAGE_PUNCHES, punches);
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
    activeUser = users[0];
  }
}

function saveToStorage(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function getFormattedDateOffset(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return toLocalDateStr(d);
}

// Converte uma data para AAAA-MM-DD no fuso horário local do aparelho.
// (toISOString() usa UTC: no Brasil, após as 21h a data virava o dia seguinte.)
function toLocalDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* ==========================================================================
   2. Service Worker e PWA no Celular
   ========================================================================== */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('PWA Service Worker Ativo:', reg.scope))
        .catch(err => console.log('SW Erro:', err));
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = document.getElementById('btnInstallPwa');
    const banner = document.getElementById('mobileInstallBanner');
    if (btn) btn.style.display = 'inline-flex';
    if (banner && window.innerWidth <= 768) banner.style.display = 'flex';
  });

  const triggerInstall = () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then(() => {
        deferredInstallPrompt = null;
        document.getElementById('btnInstallPwa').style.display = 'none';
        document.getElementById('mobileInstallBanner').style.display = 'none';
      });
    } else {
      alert('Para instalar no celular:\n\n• No Android (Chrome): Toque nos 3 pontos e escolha "Instalar aplicativo".\n• No iPhone (Safari): Toque em Compartilhar e escolha "Adicionar à Tela de Início".');
    }
  };

  document.getElementById('btnInstallPwa').addEventListener('click', triggerInstall);
  document.getElementById('btnBannerInstall').addEventListener('click', triggerInstall);
}

/* ==========================================================================
   3. Geolocalização (GPS)
   ========================================================================== */
function initGeolocation() {
  const locText = document.getElementById('locationText');
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lastKnownLocation = `GPS: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
        if (locText) locText.textContent = `Localização Ativa (${lastKnownLocation})`;
      },
      () => {
        if (locText) locText.textContent = 'GPS Local (Sem autorização ou offline)';
      },
      { timeout: 8000 }
    );
  } else {
    if (locText) locText.textContent = 'Geolocalização não suportada neste dispositivo';
  }
}

/* ==========================================================================
   4. Relógio em Tempo Real
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
   5. Gestão de Perfis e Permissões Estritas
   ========================================================================== */
function setupUserSelector() {
  const select = document.getElementById('activeUserSelect');
  select.innerHTML = '';

  users.forEach(u => {
    const option = document.createElement('option');
    option.value = u.id;
    const perfilLabel = u.perfil === 'gestor' ? 'Gestor' : 'Colaborador';
    option.textContent = u.nome.includes(`(${perfilLabel})`) ? u.nome : `${u.nome} (${perfilLabel})`;
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

  // PRIVACIDADE E REGRAS DE ACESSO:
  // Apenas gestores podem visualizar as abas de equipe e configurações
  const isGestor = activeUser.perfil === 'gestor';
  
  const adminElements = document.querySelectorAll('.admin-only-item');
  adminElements.forEach(el => {
    el.style.display = isGestor ? 'block' : 'none';
  });

  const adminBottomItems = document.querySelectorAll('.admin-bottom-item');
  adminBottomItems.forEach(el => {
    el.style.display = isGestor ? 'flex' : 'none';
  });

  // Se um colaborador comum estiver em aba de gestor, redireciona para Meu Ponto
  const activeTabBtn = document.querySelector('.nav-btn.active');
  const currentTab = activeTabBtn ? activeTabBtn.getAttribute('data-tab') : 'tab-ponto';
  if (!isGestor && (currentTab === 'tab-gestao' || currentTab === 'tab-configuracoes')) {
    switchTab('tab-ponto');
  }

  updatePunchButtonsState();
  renderTodayTimeline();
  renderStats();
  renderHistoryTable();
  renderUserJustifications();
  renderCharts();

  if (isGestor) {
    renderAdmDashboard();
    renderRegisteredUsersTable();
  }
}

/* ==========================================================================
   6. Motor de Batidas Flexíveis (Suporte a N Saídas Pontuais)
   ========================================================================== */
function getTodayDateStr() {
  return toLocalDateStr(new Date());
}

function getTodayPunchRecord(userId) {
  const todayStr = getTodayDateStr();
  return punches.find(p => p.userId === userId && p.date === todayStr);
}

function getOrCreateTodayPunchRecord(userId) {
  let record = getTodayPunchRecord(userId);
  if (!record) {
    record = {
      id: 'pnc-' + Math.random().toString(36).substr(2, 9),
      userId: userId,
      date: getTodayDateStr(),
      punches: [],
      local: lastKnownLocation || 'Local Registrado',
      observacao: ''
    };
    punches.push(record);
    saveToStorage(STORAGE_PUNCHES, punches);
  }
  return record;
}

function getCurrentTimeStr() {
  const now = new Date();
  return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
}

function updatePunchButtonsState() {
  const record = getTodayPunchRecord(activeUser.id);
  const btnEntrada = document.getElementById('btnPunchEntrada');
  const btnSaidaPontual = document.getElementById('btnPunchSaidaPontual');
  const btnRetorno = document.getElementById('btnPunchRetorno');
  const btnSaidaFinal = document.getElementById('btnPunchSaidaFinal');
  const badge = document.getElementById('todayStatusBadge');

  if (!record || record.punches.length === 0) {
    btnEntrada.disabled = false;
    btnSaidaPontual.disabled = true;
    btnRetorno.disabled = true;
    btnSaidaFinal.disabled = true;
    badge.textContent = 'Jornada Não Iniciada';
    badge.className = 'badge badge-neutral';
    return;
  }

  const lastPunch = record.punches[record.punches.length - 1];

  if (lastPunch.type === 'saida_final') {
    btnEntrada.disabled = false; // Permite reabrir ou registrar nova entrada se necessário
    btnSaidaPontual.disabled = true;
    btnRetorno.disabled = true;
    btnSaidaFinal.disabled = true;
    badge.textContent = 'Jornada Finalizada';
    badge.className = 'badge badge-info';
  } else if (lastPunch.type === 'entrada' || lastPunch.type === 'retorno') {
    btnEntrada.disabled = true;
    btnSaidaPontual.disabled = false;
    btnRetorno.disabled = true;
    btnSaidaFinal.disabled = false;
    badge.textContent = 'Em Atividade / Trabalho';
    badge.className = 'badge badge-success';
  } else if (lastPunch.type === 'saida_pontual') {
    btnEntrada.disabled = true;
    btnSaidaPontual.disabled = true;
    btnRetorno.disabled = false;
    btnSaidaFinal.disabled = true;
    badge.textContent = `Em Saída Pontual (${lastPunch.motivo || 'Intervalo'})`;
    badge.className = 'badge badge-warning';
  }
}

function addPunch(type, label, motivo = '') {
  const time = getCurrentTimeStr();
  const record = getOrCreateTodayPunchRecord(activeUser.id);
  const feedback = document.getElementById('punchFeedback');

  // Atualiza GPS se disponível
  if (lastKnownLocation) {
    record.local = lastKnownLocation;
  }

  record.punches.push({
    time: time,
    type: type,
    label: label,
    motivo: motivo
  });

  saveToStorage(STORAGE_PUNCHES, punches);

  feedback.className = 'feedback-msg success';
  feedback.textContent = `✅ ${label} registrada às ${time}${motivo ? ' (' + motivo + ')' : ''}!`;
  setTimeout(() => { feedback.textContent = ''; }, 5000);

  if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);

  updatePunchButtonsState();
  renderTodayTimeline();
  renderStats();
  renderHistoryTable();
  renderCharts();
  if (activeUser.perfil === 'gestor') renderAdmDashboard();
}

function renderTodayTimeline() {
  const container = document.getElementById('todayTimeline');
  container.innerHTML = '';
  const record = getTodayPunchRecord(activeUser.id);

  if (!record || record.punches.length === 0) {
    container.innerHTML = '<p class="text-muted" style="padding: 12px 0;">Nenhuma marcação realizada hoje. Toque em "Entrada" acima para iniciar o expediente.</p>';
    return;
  }

  record.punches.forEach(p => {
    let icon = '🟢';
    if (p.type === 'saida_pontual') icon = '🟡';
    if (p.type === 'retorno') icon = '🔵';
    if (p.type === 'saida_final') icon = '🔴';

    const el = document.createElement('div');
    el.className = `timeline-item ${p.type}`;
    el.innerHTML = `
      <div class="timeline-left">
        <span>${icon}</span>
        <div>
          <span class="timeline-title">${p.label || p.type}</span>
          ${p.motivo ? `<span class="timeline-motivo">${escapeHTML(p.motivo)}</span>` : ''}
        </div>
      </div>
      <div class="timeline-time">${p.time}</div>
    `;
    container.appendChild(el);
  });
}

/* ==========================================================================
   7. Cálculo de Horas Trabalhadas com Múltiplas Saídas Pontuais
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

/**
 * Calcula o total de minutos trabalhados somando todos os períodos
 * entre uma entrada/retorno e a próxima saída pontual/final.
 */
function calculateMinutesFromRecord(record) {
  if (!record || !record.punches || record.punches.length === 0) return 0;
  
  // Ordena batidas por horário
  const sorted = [...record.punches].sort((a, b) => parseMinutes(a.time) - parseMinutes(b.time));
  
  let totalMinutes = 0;
  let currentStart = null;

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const m = parseMinutes(p.time);

    if (p.type === 'entrada' || p.type === 'retorno') {
      if (currentStart === null) {
        currentStart = m;
      }
    } else if (p.type === 'saida_pontual' || p.type === 'saida_final') {
      if (currentStart !== null && m > currentStart) {
        totalMinutes += (m - currentStart);
        currentStart = null;
      }
    }
  }

  return totalMinutes;
}

function renderStats() {
  const todayRecord = getTodayPunchRecord(activeUser.id);
  let todayMinutes = calculateMinutesFromRecord(todayRecord);
  // Período em andamento (após Entrada/Retorno sem saída) conta até agora
  if (todayRecord && todayRecord.punches.length > 0) {
    const sorted = [...todayRecord.punches].sort((a, b) => parseMinutes(a.time) - parseMinutes(b.time));
    const last = sorted[sorted.length - 1];
    if (last.type === 'entrada' || last.type === 'retorno') {
      const now = new Date();
      todayMinutes += Math.max(0, now.getHours() * 60 + now.getMinutes() - parseMinutes(last.time));
    }
  }
  document.getElementById('statTodayHours').textContent = formatMinutesToHours(todayMinutes).replace('+', '');

  const currentMonthStr = getTodayDateStr().slice(0, 7);
  const userPunchesMonth = punches.filter(p => p.userId === activeUser.id && p.date.startsWith(currentMonthStr));

  let monthMinutes = 0;
  let balanceMinutes = 0;
  const dailyWorkloadMinutes = (activeUser.cargaHoraria || 8) * 60;

  userPunchesMonth.forEach(record => {
    const dayMin = calculateMinutesFromRecord(record);
    monthMinutes += dayMin;
    const hasFinished = record.punches.some(p => p.type === 'saida_final');
    if (hasFinished) {
      balanceMinutes += (dayMin - dailyWorkloadMinutes);
    }
  });

  const approvedJust = justifications.filter(j => 
    j.userId === activeUser.id && 
    j.status === 'Aprovada' && 
    j.date.startsWith(currentMonthStr)
  );
  approvedJust.forEach(j => {
    monthMinutes += (j.horas || activeUser.cargaHoraria || 8) * 60;
  });

  document.getElementById('statMonthHours').textContent = formatMinutesToHours(monthMinutes).replace('+', '');
  
  const balanceEl = document.getElementById('statBalanceHours');
  balanceEl.textContent = (balanceMinutes >= 0 ? '+' : '') + formatMinutesToHours(balanceMinutes);
  balanceEl.style.color = balanceMinutes >= 0 ? 'var(--success)' : 'var(--danger)';

  const pendingJust = justifications.filter(j => j.userId === activeUser.id && j.status === 'Pendente');
  document.getElementById('statPendingCount').textContent = pendingJust.length;
}

/* ==========================================================================
   8. Histórico do Colaborador (Com Botão de Ajuste e Detalhes)
   ========================================================================== */
function renderHistoryTable() {
  const tbody = document.getElementById('historyTableBody');
  const monthFilter = document.getElementById('historyMonthFilter').value;
  tbody.innerHTML = '';

  // Filtra ESTRITAMENTE para o usuário ativo (privacidade)
  let userPunches = punches.filter(p => p.userId === activeUser.id);
  if (monthFilter) {
    userPunches = userPunches.filter(p => p.date.startsWith(monthFilter));
  }

  userPunches.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (userPunches.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 18px;">Nenhum registro encontrado no período selecionado.</td></tr>';
    return;
  }

  const dailyStandardMinutes = (activeUser.cargaHoraria || 8) * 60;

  userPunches.forEach(record => {
    const totalMinutes = calculateMinutesFromRecord(record);
    const hasFinished = record.punches.some(p => p.type === 'saida_final');
    const balance = hasFinished ? (totalMinutes - dailyStandardMinutes) : 0;
    const dateFormatted = new Date(record.date + 'T00:00:00').toLocaleDateString('pt-BR');

    // Gera as pílulas visuais de cada batida
    const pillsHTML = record.punches.map(p => {
      let icon = '🟢';
      if (p.type === 'saida_pontual') icon = '🟡';
      if (p.type === 'retorno') icon = '🔵';
      if (p.type === 'saida_final') icon = '🔴';
      const motivoText = p.motivo ? ` (${escapeHTML(p.motivo)})` : '';
      return `<span class="punch-pill ${p.type}">${icon} ${p.time}${motivoText}</span>`;
    }).join(' ');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${dateFormatted}</strong></td>
      <td><div class="punches-pill-list">${pillsHTML || '<em class="text-muted">Sem batidas</em>'}</div></td>
      <td><strong>${formatMinutesToHours(totalMinutes).replace('+', '')}</strong></td>
      <td>${activeUser.cargaHoraria || 8}h</td>
      <td style="color: ${balance >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: 600;">
        ${hasFinished ? ((balance >= 0 ? '+' : '') + formatMinutesToHours(balance)) : '--'}
      </td>
      <td><small class="text-muted">${escapeHTML(record.local || 'Local')}</small></td>
      <td><span class="badge ${hasFinished ? 'badge-success' : 'badge-warning'}">${hasFinished ? 'Concluído' : 'Em Aberto'}</span></td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="openAdjustModalForRecord('${record.id}')" title="Ajustar batidas deste dia">✏️ Ajustar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ==========================================================================
   9. Ajustes de Batidas e Inserção Retroativa (Preservando GPS)
   ========================================================================== */
let editingRecordId = null;
let openAdjustModal = null;

function setupAdjustModal() {
  const modal = document.getElementById('adjustModalOverlay');
  const btnOpen = document.getElementById('btnOpenAdjustModal');
  const btnClose = document.getElementById('btnAdjustModalClose');
  const btnCancel = document.getElementById('btnCancelAdjust');
  const btnAddRow = document.getElementById('btnAddPunchRow');
  const form = document.getElementById('adjustPunchForm');
  const btnRetroactive = document.getElementById('btnNewRetroactiveRecord');
  const btnEditToday = document.getElementById('btnEditTodayPunches');

  function openModal(recordToEdit = null) {
    editingRecordId = recordToEdit ? recordToEdit.id : null;
    modal.classList.add('active');

    // Popula seletor de usuários no modal (se for gestor, pode escolher outro; se for colaborador, só ele)
    const userSelect = document.getElementById('adjustUserId');
    const userGroup = document.getElementById('adjustUserSelectGroup');
    userSelect.innerHTML = '';

    if (activeUser.perfil === 'gestor') {
      userGroup.style.display = 'block';
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.nome} (${u.cargo})`;
        if (recordToEdit && recordToEdit.userId === u.id) opt.selected = true;
        else if (!recordToEdit && u.id === activeUser.id) opt.selected = true;
        userSelect.appendChild(opt);
      });
    } else {
      userGroup.style.display = 'none';
      const opt = document.createElement('option');
      opt.value = activeUser.id;
      opt.textContent = activeUser.nome;
      opt.selected = true;
      userSelect.appendChild(opt);
    }

    const dateInput = document.getElementById('adjustDate');
    const motivoInput = document.getElementById('adjustMotivo');
    const container = document.getElementById('punchRowsContainer');
    container.innerHTML = '';

    if (recordToEdit) {
      dateInput.value = recordToEdit.date;
      motivoInput.value = recordToEdit.observacao || '';
      recordToEdit.punches.forEach(p => addPunchRowToModal(p.time, p.type, p.motivo));
    } else {
      dateInput.value = getTodayDateStr();
      motivoInput.value = '';
      // Cria linhas padrão para facilitar
      addPunchRowToModal('08:00', 'entrada');
      addPunchRowToModal('12:00', 'saida_pontual', 'Almoço');
      addPunchRowToModal('13:00', 'retorno');
      addPunchRowToModal('17:00', 'saida_final');
    }
  }

  function closeModal() {
    modal.classList.remove('active');
    editingRecordId = null;
  }

  openAdjustModal = openModal;

  btnOpen.addEventListener('click', () => openModal(null));
  if (btnRetroactive) btnRetroactive.addEventListener('click', () => openModal(null));
  if (btnEditToday) btnEditToday.addEventListener('click', () => {
    const todayRec = getTodayPunchRecord(activeUser.id);
    openModal(todayRec);
  });
  btnClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);

  btnAddRow.addEventListener('click', () => addPunchRowToModal('08:00', 'entrada'));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // Privacidade: colaborador comum só pode ajustar o próprio ponto
    const targetUserId = activeUser.perfil === 'gestor'
      ? document.getElementById('adjustUserId').value
      : activeUser.id;
    const targetDate = document.getElementById('adjustDate').value;
    const observacao = document.getElementById('adjustMotivo').value.trim();

    if (!targetDate) {
      alert('Informe a data do registro.');
      return;
    }

    // Coleta as batidas das linhas dinâmicas
    const rows = document.querySelectorAll('.punch-row-item');
    const collectedPunches = [];

    rows.forEach(r => {
      const timeVal = r.querySelector('.row-time').value;
      const typeVal = r.querySelector('.row-type').value;
      const motivoVal = r.querySelector('.row-motivo').value.trim();

      if (timeVal) {
        let label = 'Entrada';
        if (typeVal === 'saida_pontual') label = 'Saída Pontual';
        if (typeVal === 'retorno') label = 'Retorno';
        if (typeVal === 'saida_final') label = 'Saída Final';

        collectedPunches.push({
          time: timeVal,
          type: typeVal,
          label: label,
          motivo: motivoVal
        });
      }
    });

    // Ordena as batidas por horário cronológico
    collectedPunches.sort((a, b) => parseMinutes(a.time) - parseMinutes(b.time));

    if (collectedPunches.length === 0) {
      alert('Adicione pelo menos uma batida com horário.');
      return;
    }

    // Registro em edição (pelo id) ou registro já existente do colaborador nessa data
    const editingRecord = editingRecordId ? punches.find(p => p.id === editingRecordId) : null;
    const sameDayRecord = punches.find(p => p.userId === targetUserId && p.date === targetDate);
    if (editingRecord && sameDayRecord && sameDayRecord !== editingRecord) {
      alert('Já existe um registro para este colaborador nessa data. Ajuste o registro existente pelo histórico.');
      return;
    }
    let record = editingRecord || sameDayRecord;

    const auditEntry = {
      em: new Date().toISOString(),
      por: activeUser.nome,
      motivo: observacao || 'Ajuste manual',
      batidasAnteriores: record ? record.punches.map(p => `${p.time} ${p.label}`) : []
    };

    if (!record) {
      record = {
        id: 'pnc-' + Math.random().toString(36).substr(2, 9),
        userId: targetUserId,
        date: targetDate,
        punches: collectedPunches,
        local: lastKnownLocation || 'Ajuste Manual',
        observacao: observacao,
        ajustes: [auditEntry]
      };
      punches.push(record);
    } else {
      record.userId = targetUserId;
      record.date = targetDate;
      record.punches = collectedPunches;
      record.ajustes = (record.ajustes || []).concat(auditEntry);
      record.observacao = observacao;
      // Mantém a geolocalização prévia gravada (exigência do usuário)
      if (!record.local && lastKnownLocation) {
        record.local = lastKnownLocation;
      }
    }

    saveToStorage(STORAGE_PUNCHES, punches);
    alert('✅ Registro de ponto atualizado com sucesso!');
    closeModal();

    updatePunchButtonsState();
    renderTodayTimeline();
    renderStats();
    renderHistoryTable();
    renderCharts();
    if (activeUser.perfil === 'gestor') renderAdmDashboard();
  });
}

function addPunchRowToModal(time = '08:00', type = 'entrada', motivo = '') {
  const container = document.getElementById('punchRowsContainer');
  const div = document.createElement('div');
  div.className = 'punch-row-item';
  div.innerHTML = `
    <select class="input-control row-type" style="width: 170px;">
      <option value="entrada" ${type === 'entrada' ? 'selected' : ''}>🟢 Entrada</option>
      <option value="saida_pontual" ${type === 'saida_pontual' ? 'selected' : ''}>🟡 Saída Pontual</option>
      <option value="retorno" ${type === 'retorno' ? 'selected' : ''}>🔵 Retorno</option>
      <option value="saida_final" ${type === 'saida_final' ? 'selected' : ''}>🔴 Saída Final</option>
    </select>
    <input type="time" class="input-control row-time" value="${time}" required>
    <input type="text" class="input-control row-motivo" placeholder="Motivo/Obs (ex: Reunião, Almoço)" value="${escapeHTML(motivo)}" style="flex: 1;">
    <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()" title="Remover batida">❌</button>
  `;
  container.appendChild(div);
}

window.openAdjustModalForRecord = function(recordId) {
  const rec = punches.find(p => p.id === recordId);
  if (!rec) return;

  // Se não for gestor e o registro não for dele, bloqueia
  if (activeUser.perfil !== 'gestor' && rec.userId !== activeUser.id) {
    alert('Acesso não autorizado.');
    return;
  }

  openAdjustModal(rec);
};

/* ==========================================================================
   10. Modal Rápido de Saída Pontual (Almoço, Reunião, etc)
   ========================================================================== */
function setupQuickExitModal() {
  const modal = document.getElementById('quickExitModalOverlay');
  const btnClose = document.getElementById('btnQuickExitClose');
  const btnCancel = document.getElementById('btnQuickExitCancel');
  const btnConfirm = document.getElementById('btnConfirmQuickExit');
  const btnTrigger = document.getElementById('btnPunchSaidaPontual');

  function openModal() {
    modal.classList.add('active');
  }

  function closeModal() {
    modal.classList.remove('active');
  }

  btnTrigger.addEventListener('click', openModal);
  btnClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);

  btnConfirm.addEventListener('click', () => {
    const typeSelect = document.getElementById('quickExitType');
    const obsInput = document.getElementById('quickExitObs');
    const motivoFull = `${typeSelect.value}${obsInput.value.trim() ? ' - ' + obsInput.value.trim() : ''}`;
    
    addPunch('saida_pontual', 'Saída Pontual', motivoFull);
    obsInput.value = '';
    closeModal();
  });
}

/* ==========================================================================
   11. Justificativas de Ausências
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
      alert('Preencha os campos obrigatórios (*).');
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

    alert('✅ Justificativa enviada para aprovação do gestor!');
    form.reset();
    renderUserJustifications();
    renderStats();
    if (activeUser.perfil === 'gestor') renderAdmDashboard();
  });
}

function renderUserJustifications() {
  const tbody = document.getElementById('userJustificationsTableBody');
  tbody.innerHTML = '';

  const userJust = justifications.filter(j => j.userId === activeUser.id);
  if (userJust.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 16px;">Nenhuma justificativa registrada.</td></tr>';
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
      <td>${j.parecer ? `<em>"${escapeHTML(j.parecer)}"</em>` : '<span class="text-muted">Em análise</span>'}</td>
    `;
    tbody.appendChild(tr);
  });
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

/* ==========================================================================
   12. Painel da Equipe (Exclusivo Gestor)
   ========================================================================== */
function renderAdmDashboard() {
  if (activeUser.perfil !== 'gestor') return;

  document.getElementById('statAdmTotalEmployees').textContent = users.length;

  const todayStr = getTodayDateStr();
  const activeToday = punches.filter(p => {
    if (p.date !== todayStr || p.punches.length === 0) return false;
    const last = p.punches[p.punches.length - 1];
    return last.type === 'entrada' || last.type === 'retorno';
  }).length;
  document.getElementById('statAdmActiveToday').textContent = activeToday;

  const pendingJust = justifications.filter(j => j.status === 'Pendente');
  document.getElementById('statAdmPendingJust').textContent = pendingJust.length;

  const currentMonth = getTodayDateStr().slice(0, 7);
  let totalTeamMinutes = 0;
  punches.filter(p => p.date.startsWith(currentMonth)).forEach(p => {
    totalTeamMinutes += calculateMinutesFromRecord(p);
  });
  document.getElementById('statAdmTeamHours').textContent = `${Math.floor(totalTeamMinutes / 60)}h`;

  // Tabela de justificativas pendentes
  const justTbody = document.getElementById('admJustificationsTableBody');
  justTbody.innerHTML = '';

  if (pendingJust.length === 0) {
    justTbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 16px;">Nenhuma justificativa pendente de aprovação.</td></tr>';
  } else {
    pendingJust.forEach(j => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHTML(j.userName)}</strong></td>
        <td>${new Date(j.date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
        <td>${j.tipo}</td>
        <td>${escapeHTML(j.motivo)}</td>
        <td>${j.horas}h</td>
        <td><span class="badge badge-warning">${j.status}</span></td>
        <td><button class="btn btn-sm btn-primary" onclick="openReviewModal('${j.id}')">🔍 Avaliar</button></td>
      `;
      justTbody.appendChild(tr);
    });
  }

  // Preenche filtro de colaboradores
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
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 16px;">Nenhum registro encontrado para este filtro.</td></tr>';
    return;
  }

  list.forEach(record => {
    const employee = users.find(u => u.id === record.userId) || { nome: 'Desconhecido', cargaHoraria: 8 };
    const totalMinutes = calculateMinutesFromRecord(record);
    const dailyStandard = (employee.cargaHoraria || 8) * 60;
    const hasFinished = record.punches.some(p => p.type === 'saida_final');
    const balance = hasFinished ? (totalMinutes - dailyStandard) : 0;

    const pillsHTML = record.punches.map(p => {
      let icon = '🟢';
      if (p.type === 'saida_pontual') icon = '🟡';
      if (p.type === 'retorno') icon = '🔵';
      if (p.type === 'saida_final') icon = '🔴';
      return `<span class="punch-pill ${p.type}">${icon} ${p.time}</span>`;
    }).join(' ');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHTML(employee.nome)}</strong></td>
      <td>${new Date(record.date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
      <td><div class="punches-pill-list">${pillsHTML || '<em class="text-muted">Sem batidas</em>'}</div></td>
      <td><strong>${formatMinutesToHours(totalMinutes).replace('+', '')}</strong></td>
      <td style="color: ${balance >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: 600;">
        ${hasFinished ? ((balance >= 0 ? '+' : '') + formatMinutesToHours(balance)) : '--'}
      </td>
      <td><small class="text-muted">${escapeHTML(record.local || 'Local')}</small></td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="openAdjustModalForRecord('${record.id}')">✏️ Ajustar</button>
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

  title.textContent = `Avaliar: ${j.userName}`;
  desc.innerHTML = `
    <strong>Data:</strong> ${new Date(j.date + 'T00:00:00').toLocaleDateString('pt-BR')}<br>
    <strong>Tipo:</strong> ${j.tipo}<br>
    <strong>Horas:</strong> ${j.horas}h<br>
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
      j.parecer = document.getElementById('modalFeedback').value.trim() || 'Aprovado pelo gestor.';
      saveToStorage(STORAGE_JUSTIFICATIONS, justifications);
      alert('✅ Justificativa APROVADA!');
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
      j.parecer = document.getElementById('modalFeedback').value.trim() || 'Não atende aos critérios.';
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
   13. Painel de Configurações, Backup e Exportação
   ========================================================================== */
function setupSettingsAndBackup() {
  // Cadastro de novo colaborador / gestor
  const regForm = document.getElementById('userRegistrationForm');
  regForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = document.getElementById('regNome').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const cargo = document.getElementById('regCargo').value.trim();
    const depto = document.getElementById('regDepto').value.trim();
    const perfil = document.getElementById('regPerfil').value;
    const carga = parseFloat(document.getElementById('regCarga').value) || 8;

    if (!nome || !email || !cargo || !depto) {
      alert('Preencha todos os campos obrigatórios.');
      return;
    }

    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      alert('Já existe um colaborador cadastrado com este e-mail.');
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

    alert(`✅ Usuário "${nome}" cadastrado com sucesso como ${perfil.toUpperCase()}!`);
    regForm.reset();
    setupUserSelector();
    renderRegisteredUsersTable();
    renderAdmDashboard();
  });

  // Exportar Backup JSON
  document.getElementById('btnExportBackup').addEventListener('click', () => {
    const fullBackup = {
      app: 'PontoFacil',
      version: '2.1',
      exportedAt: new Date().toISOString(),
      users: users,
      punches: punches,
      justifications: justifications
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(fullBackup, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `backup_ponto_${getTodayDateStr()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  });

  // Importar Backup JSON
  const fileInput = document.getElementById('fileImportBackup');
  document.getElementById('btnTriggerImport').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (imported.users && imported.punches) {
          if (confirm('Deseja restaurar os dados deste backup? Os dados atuais serão substituídos com segurança.')) {
            users = imported.users;
            punches = imported.punches;
            justifications = imported.justifications || [];
            saveToStorage(STORAGE_USERS, users);
            saveToStorage(STORAGE_PUNCHES, punches);
            saveToStorage(STORAGE_JUSTIFICATIONS, justifications);

            activeUser = users[0];
            localStorage.setItem(STORAGE_ACTIVE_USER_ID, activeUser.id);
            alert('✅ Dados restaurados com sucesso!');
            location.reload();
          }
        } else {
          alert('Arquivo de backup inválido.');
        }
      } catch (err) {
        alert('Erro ao ler o arquivo JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  // Exportar Relatório em CSV (Excel)
  const btnCsv = document.getElementById('btnAdmExportCsv');
  if (btnCsv) {
    btnCsv.addEventListener('click', () => {
      let csvContent = 'data:text/csv;charset=utf-8,\uFEFF';
      csvContent += 'Colaborador;Data;Batidas;Total Trabalhado;Saldo;GPS/Localizacao\n';

      punches.forEach(record => {
        const u = users.find(usr => usr.id === record.userId) || { nome: 'Desconhecido' };
        const total = calculateMinutesFromRecord(record);
        const dailyStandard = (u.cargaHoraria || 8) * 60;
        const balance = record.punches.some(p => p.type === 'saida_final') ? (total - dailyStandard) : 0;
        const batidasStr = record.punches.map(p => `${p.time} (${p.label})`).join(' | ');

        csvContent += `"${u.nome}";"${record.date}";"${batidasStr}";"${formatMinutesToHours(total).replace('+', '')}";"${formatMinutesToHours(balance)}";"${record.local || ''}"\n`;
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `relatorio_ponto_${getTodayDateStr()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  }
}

function renderRegisteredUsersTable() {
  const tbody = document.getElementById('registeredUsersTableBody');
  tbody.innerHTML = '';

  users.forEach(u => {
    const isGestor = u.perfil === 'gestor';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHTML(u.nome)}</strong></td>
      <td>${escapeHTML(u.email)}</td>
      <td>${escapeHTML(u.cargo)}</td>
      <td>${escapeHTML(u.depto)}</td>
      <td><span class="badge ${isGestor ? 'badge-warning' : 'badge-info'}">${isGestor ? 'Gestor (ADM)' : 'Colaborador'}</span></td>
      <td>${u.cargaHoraria}h / dia</td>
      <td>
        ${users.length > 1 ? `<button class="btn btn-sm btn-outline" onclick="deleteUser('${u.id}')" title="Excluir">🗑️ Excluir</button>` : '<span class="text-muted">Principal</span>'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.deleteUser = function(userId) {
  if (users.length <= 1) {
    alert('Não é possível remover o único usuário do sistema.');
    return;
  }
  const u = users.find(item => item.id === userId);
  if (u.perfil === 'gestor' && users.filter(item => item.perfil === 'gestor').length <= 1) {
    alert('Não é possível remover o único gestor do sistema. Cadastre outro gestor antes.');
    return;
  }
  if (confirm(`Deseja remover "${u.nome}"? O histórico de ponto será preservado.`)) {
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
   14. Gráficos (Chart.js)
   ========================================================================== */
function renderCharts() {
  if (typeof Chart === 'undefined') return;

  const ctxWeekly = document.getElementById('chartWeeklyHours').getContext('2d');
  const last7DaysLabels = [];
  const last7DaysData = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = toLocalDateStr(d);
    const dayLabel = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });
    last7DaysLabels.push(dayLabel);

    const record = punches.find(p => p.userId === activeUser.id && p.date === dateStr);
    const hours = record ? (calculateMinutesFromRecord(record) / 60).toFixed(1) : 0;
    last7DaysData.push(Number(hours));
  }

  if (weeklyChartInstance) weeklyChartInstance.destroy();

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
  const diasTrabalhados = userPunches.filter(p => p.punches.some(item => item.type === 'saida_final')).length;
  const ausenciasAprovadas = justifications.filter(j => j.userId === activeUser.id && j.status === 'Aprovada').length;
  const ausenciasPendentes = justifications.filter(j => j.userId === activeUser.id && j.status === 'Pendente').length;

  if (statusChartInstance) statusChartInstance.destroy();

  statusChartInstance = new Chart(ctxStatus, {
    type: 'doughnut',
    data: {
      labels: ['Dias com Ponto Concluído', 'Justificativas Aprovadas', 'Pendentes'],
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

  const summary = document.getElementById('metricsSummaryContainer');
  const total = diasTrabalhados + ausenciasAprovadas;
  const assiduidade = total > 0 ? ((diasTrabalhados / total) * 100).toFixed(0) : 100;

  summary.innerHTML = `
    <div class="metric-box">
      <h4>Taxa de Presença</h4>
      <p style="color: var(--primary);">${assiduidade}%</p>
    </div>
    <div class="metric-box">
      <h4>Dias Trabalhados</h4>
      <p style="color: var(--success);">${diasTrabalhados} dias</p>
    </div>
    <div class="metric-box">
      <h4>Ausências Aprovadas</h4>
      <p style="color: #3b82f6;">${ausenciasAprovadas} ocorrências</p>
    </div>
    <div class="metric-box">
      <h4>Em Análise</h4>
      <p style="color: var(--warning);">${ausenciasPendentes}</p>
    </div>
  `;
}

/* ==========================================================================
   15. Navegação e Inicialização
   ========================================================================== */
function setupTabs() {
  document.querySelectorAll('.nav-btn, .bottom-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      switchTab(target);
    });
  });

  const toggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  if (toggle) {
    toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  }
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-btn, .bottom-nav-item').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
  });

  document.querySelectorAll('.tab-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === tabId);
  });

  if (tabId === 'tab-graficos') setTimeout(renderCharts, 100);
  document.getElementById('sidebar').classList.remove('open');
}

document.addEventListener('DOMContentLoaded', () => {
  // Exibe versão no rodapé da sidebar
  const sysTag = document.querySelector('.system-tag');
  if (sysTag) sysTag.innerHTML = `<strong>${APP_VERSION}</strong><br>PWA • Funciona Offline`;

  initDefaultData();
  registerServiceWorker();
  initGeolocation();
  startClock();
  setupUserSelector();
  setupTabs();
  setupQuickExitModal();
  setupAdjustModal();
  setupJustificationForm();
  setupModalActions();
  setupSettingsAndBackup();

  // Batidas Rápidas
  document.getElementById('btnPunchEntrada').addEventListener('click', () => addPunch('entrada', 'Entrada'));
  document.getElementById('btnPunchRetorno').addEventListener('click', () => addPunch('retorno', 'Retorno ao Trabalho'));
  document.getElementById('btnPunchSaidaFinal').addEventListener('click', () => addPunch('saida_final', 'Saída Final'));

  // Filtros
  document.getElementById('historyMonthFilter').addEventListener('change', renderHistoryTable);
  document.getElementById('btnResetHistoryFilter').addEventListener('click', () => {
    document.getElementById('historyMonthFilter').value = '';
    renderHistoryTable();
  });

  document.getElementById('admFilterEmployee').addEventListener('change', renderAdmTeamPunchTable);
  document.getElementById('btnPrintReport').addEventListener('click', () => window.print());

  applyUserProfile();

  // Atualiza "Trabalhado Hoje" a cada minuto enquanto o expediente está em andamento
  setInterval(renderStats, 60000);
});
