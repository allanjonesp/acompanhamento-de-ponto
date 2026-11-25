/**
 * ==============================================================================
 * Acompanhamento de Ponto - Lógica do Aplicativo em JavaScript Puro (Vanilla JS)
 * Versão 3.0: Dados na nuvem (Supabase) com login individual para a equipe
 * ==============================================================================
 */

const APP_VERSION = 'v3.0 - Supabase';
console.log('%c✅ PontoFácil ' + APP_VERSION + ' carregado!', 'color: #2563eb; font-size: 14px; font-weight: bold;');

// Variáveis de estado (cópia local dos dados que o usuário logado pode ver)
let sb = null;              // cliente Supabase
let users = [];             // perfis (colaborador vê só o próprio; gestor vê todos)
let preCadastros = [];      // e-mails autorizados que ainda não criaram conta (só gestor)
let punches = [];           // registros de ponto por dia
let justifications = [];
let activeUser = null;      // perfil de quem está logado
let realtimeChannel = null;
let reloadTimer = null;
let clockStarted = false;
let nextAuthMessage = '';   // aviso a mostrar na tela de login após sair
let nextAuthKind = 'error';
const MSG_PENDENTE = '⏳ Seu cadastro foi recebido e está aguardando a aprovação do gestor. Você poderá entrar assim que ele aprovar.';
let weeklyChartInstance = null;
let statusChartInstance = null;
let pendingJustificationIdToReview = null;
let deferredInstallPrompt = null;
let lastKnownLocation = null;

/* ==========================================================================
   1. Conversão entre o formato do banco e o formato usado na tela
   ========================================================================== */
function perfilFromRow(r) {
  return {
    id: r.id, nome: r.nome, email: r.email, cargo: r.cargo || '', depto: r.depto || '',
    perfil: r.perfil, cargaHoraria: Number(r.carga_horaria) || 8, ativo: r.ativo, pendente: !!r.pendente
  };
}

function recordFromRow(r) {
  return {
    id: r.id, userId: r.user_id, date: r.data, punches: r.batidas || [],
    local: r.local, observacao: r.observacao || '', ajustes: r.ajustes || []
  };
}

function recordToRow(rec) {
  return {
    user_id: rec.userId, data: rec.date, batidas: rec.punches,
    local: rec.local, observacao: rec.observacao || '', ajustes: rec.ajustes || []
  };
}

function justFromRow(r) {
  return {
    id: r.id, userId: r.user_id, createdAt: new Date(r.criado_em).toLocaleDateString('pt-BR'),
    date: r.data, tipo: r.tipo, horas: Number(r.horas), motivo: r.motivo,
    status: r.status, parecer: r.parecer || ''
  };
}

function getUserName(userId) {
  const u = users.find(item => item.id === userId);
  return u ? u.nome : 'Colaborador';
}

/* ==========================================================================
   2. Acesso ao Supabase
   ========================================================================== */
function friendlyError(err) {
  const msg = (err && (err.message || err.error_description || String(err))) || 'Erro desconhecido';
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(msg)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (/EMAIL_NAO_AUTORIZADO/i.test(msg)) {
    // Mostra o e-mail exatamente como foi digitado, para facilitar achar erros de digitação
    const m = msg.match(/e-mail\s+(\S+@\S+)/i);
    return `O e-mail ${m ? '"' + m[1] + '" ' : ''}não está pré-cadastrado. Confira se digitou igual ao cadastrado pelo gestor ou peça o pré-cadastro.`;
  }
  if (/Database error saving new user/i.test(msg)) return 'Não foi possível criar a conta por um erro no banco de dados. Avise o gestor.';
  if (/User already registered/i.test(msg)) return 'Já existe uma conta com este e-mail. Use "Entrar" ou "Esqueci minha senha".';
  if (/Password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
  if (/ULTIMO_GESTOR/i.test(msg)) return 'O sistema precisa de pelo menos um gestor ativo.';
  if (err && err.code === '23505') return 'Já existe um registro para este colaborador nessa data.';
  if (/row-level security|permission denied/i.test(msg)) return 'Você não tem permissão para esta ação.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Sem conexão com a internet. Verifique a rede e tente de novo.';
  return msg;
}

// Busca todas as linhas de uma consulta (o Supabase devolve no máximo 1000 por vez)
async function fetchAllRows(buildQuery) {
  const pageSize = 1000;
  let from = 0;
  let all = [];
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    all = all.concat(data);
    if (data.length < pageSize) return all;
    from += pageSize;
  }
}

async function loadAllData() {
  const [perfisRows, recordRows, justRows] = await Promise.all([
    fetchAllRows(() => sb.from('perfis').select('*').order('nome')),
    fetchAllRows(() => sb.from('registros_ponto').select('*').order('data', { ascending: false })),
    fetchAllRows(() => sb.from('justificativas').select('*').order('criado_em', { ascending: false }))
  ]);
  users = perfisRows.map(perfilFromRow);
  punches = recordRows.map(recordFromRow);
  justifications = justRows.map(justFromRow);

  const me = users.find(u => u.id === activeUser.id);
  if (me) activeUser = me;

  if (activeUser.perfil === 'gestor') {
    preCadastros = await fetchAllRows(() => sb.from('pre_cadastros').select('*').order('nome'));
  } else {
    preCadastros = [];
  }
}

// Grava um registro de ponto (cria ou atualiza) e atualiza a cópia local
async function saveRecord(record) {
  const row = recordToRow(record);
  const query = record.id
    ? sb.from('registros_ponto').update(row).eq('id', record.id)
    : sb.from('registros_ponto').insert(row);
  const { data, error } = await query.select().single();
  if (error) throw error;
  const saved = recordFromRow(data);
  punches = punches.filter(p => p.id !== saved.id).concat(saved);
  return saved;
}

function renderAll() {
  updatePunchButtonsState();
  renderTodayTimeline();
  renderStats();
  renderHistoryTable();
  renderUserJustifications();
  renderCharts();
  if (activeUser.perfil === 'gestor') {
    renderAdmDashboard();
    renderRegisteredUsersTable();
  }
}

// Recarrega tudo do servidor (usado pela atualização em tempo real)
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => {
    try {
      await loadAllData();
      if (!activeUser.ativo) {
        await signOutWithMessage('Sua conta foi desativada pelo gestor.');
        return;
      }
      applyUserProfile();
    } catch (err) {
      console.warn('Falha ao atualizar dados:', err);
    }
  }, 700);
}

function subscribeRealtime() {
  if (realtimeChannel) sb.removeChannel(realtimeChannel);
  realtimeChannel = sb.channel('ponto-equipe');
  ['registros_ponto', 'justificativas', 'perfis'].forEach(table => {
    realtimeChannel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleReload);
  });
  realtimeChannel.subscribe();
}

/* ==========================================================================
   3. Login, Cadastro de Senha e Sessão
   ========================================================================== */
function showAuthView(view, message = '', isError = false) {
  document.body.classList.remove('signed-in');
  document.getElementById('authLoading').style.display = view === 'loading' ? 'block' : 'none';
  const forms = { login: 'loginForm', signup: 'signupForm', reset: 'resetForm', newPassword: 'newPasswordForm' };
  Object.entries(forms).forEach(([key, id]) => {
    document.getElementById(id).style.display = key === view ? 'flex' : 'none';
  });
  const subtitles = {
    login: 'Entre com seu e-mail corporativo',
    signup: 'Primeiro acesso: crie sua senha',
    reset: 'Recuperar senha',
    newPassword: 'Criar nova senha',
    loading: 'Conectando...',
    config: 'Configuração pendente'
  };
  document.getElementById('authSubtitle').textContent = subtitles[view] || '';
  setAuthMessage(message, isError);
}

function setAuthMessage(message, kind = false) {
  // kind: true/'error' = erro, 'info' = informação, false = sucesso
  const el = document.getElementById('authMessage');
  el.textContent = message;
  const cls = kind === true || kind === 'error' ? ' error' : kind === 'info' ? ' info' : message ? ' success' : '';
  el.className = 'auth-message' + cls;
}

function getRedirectUrl() {
  return location.protocol.startsWith('http') ? location.origin + location.pathname : undefined;
}

function setupAuthForms() {
  document.querySelectorAll('[data-auth-view]').forEach(btn => {
    btn.addEventListener('click', () => showAuthView(btn.getAttribute('data-auth-view')));
  });

  const withBusy = (form, fn) => async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    setAuthMessage('Aguarde...');
    try {
      await fn();
    } catch (err) {
      setAuthMessage(friendlyError(err), true);
    } finally {
      btn.disabled = false;
    }
  };

  const loginForm = document.getElementById('loginForm');
  loginForm.addEventListener('submit', withBusy(loginForm, async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await startSession(data.user);
  }));

  const signupForm = document.getElementById('signupForm');
  signupForm.addEventListener('submit', withBusy(signupForm, async () => {
    const nome = document.getElementById('signupNome').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    if (!nome) throw new Error('Informe seu nome completo.');
    if (password !== document.getElementById('signupPassword2').value) {
      throw new Error('As senhas digitadas não são iguais.');
    }
    const { data, error } = await sb.auth.signUp({
      email, password, options: { emailRedirectTo: getRedirectUrl(), data: { nome } }
    });
    if (error) throw error;
    if (data.session) {
      await startSession(data.user);
    } else {
      showAuthView('login', '✅ Conta criada! Abra o link de confirmação que enviamos para o seu e-mail. Depois, se o gestor ainda não tiver aprovado seu acesso, aguarde a aprovação para entrar.', 'info');
      document.getElementById('loginEmail').value = email;
    }
  }));

  const resetForm = document.getElementById('resetForm');
  resetForm.addEventListener('submit', withBusy(resetForm, async () => {
    const email = document.getElementById('resetEmail').value.trim();
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: getRedirectUrl() });
    if (error) throw error;
    showAuthView('login', '✅ Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.');
  }));

  const newPasswordForm = document.getElementById('newPasswordForm');
  newPasswordForm.addEventListener('submit', withBusy(newPasswordForm, async () => {
    const password = document.getElementById('newPassword').value;
    const { data, error } = await sb.auth.updateUser({ password });
    if (error) throw error;
    await startSession(data.user);
  }));

  document.getElementById('btnLogout').addEventListener('click', async () => {
    if (!confirm('Deseja sair da sua conta?')) return;
    await sb.auth.signOut();
  });
}

async function startSession(authUser) {
  nextAuthMessage = '';
  showAuthView('loading');
  const { data: perfilRow, error } = await sb.from('perfis').select('*').eq('id', authUser.id).maybeSingle();
  if (error) {
    showAuthView('login', friendlyError(error), true);
    return;
  }
  if (!perfilRow) {
    await signOutWithMessage('Seu acesso não foi encontrado. Fale com o gestor.');
    return;
  }
  if (!perfilRow.ativo) {
    if (perfilRow.pendente) await signOutWithMessage(MSG_PENDENTE, 'info');
    else await signOutWithMessage('Sua conta está desativada. Fale com o gestor.');
    return;
  }

  activeUser = perfilFromRow(perfilRow);
  try {
    await loadAllData();
  } catch (err) {
    showAuthView('login', friendlyError(err), true);
    return;
  }

  document.body.classList.add('signed-in');
  setAuthMessage('');
  if (!clockStarted) {
    startClock();
    initGeolocation();
    clockStarted = true;
  }
  applyUserProfile();
  subscribeRealtime();
}

async function signOutWithMessage(message, kind = 'error') {
  nextAuthMessage = message;
  nextAuthKind = kind;
  await sb.auth.signOut();
  handleSignedOut();
}

function handleSignedOut() {
  if (realtimeChannel) {
    sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  activeUser = null;
  users = [];
  preCadastros = [];
  punches = [];
  justifications = [];
  document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  switchTab('tab-ponto');
  document.getElementById('loginPassword').value = '';
  if (nextAuthMessage) {
    showAuthView('login', nextAuthMessage, nextAuthKind);
  } else if (!document.getElementById('authMessage').classList.contains('error')) {
    showAuthView('login');
  }
}

async function initSupabase() {
  const cfg = window.PONTO_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    showAuthView('config');
    document.getElementById('authConfigWarning').style.display = 'block';
    return;
  }
  if (!window.supabase || !window.supabase.createClient) {
    showAuthView('login', 'Não foi possível carregar o Supabase. Verifique sua conexão com a internet e recarregue a página.', true);
    return;
  }

  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  sb.auth.onAuthStateChange((event) => {
    // Não chamar outras funções do Supabase diretamente aqui (recomendação da biblioteca)
    if (event === 'PASSWORD_RECOVERY') {
      setTimeout(() => showAuthView('newPassword'), 0);
    } else if (event === 'SIGNED_OUT') {
      setTimeout(handleSignedOut, 0);
    }
  });

  showAuthView('loading');
  const { data: { session } } = await sb.auth.getSession();
  if (location.hash.includes('type=recovery')) {
    showAuthView('newPassword');
  } else if (session) {
    await startSession(session.user);
  } else {
    showAuthView('login');
  }
}

/* ==========================================================================
   4. Service Worker e PWA no Celular
   ========================================================================== */
function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
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
   5. Geolocalização (GPS)
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
   6. Relógio em Tempo Real
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
  // Atualiza "Trabalhado Hoje" a cada minuto enquanto o expediente está em andamento
  setInterval(() => { if (activeUser) renderStats(); }, 60000);
}

/* ==========================================================================
   7. Perfil do Usuário Logado e Permissões
   ========================================================================== */
function applyUserProfile() {
  const avatar = document.getElementById('sidebarAvatar');
  const roleBadge = document.getElementById('userRoleBadge');
  const welcome = document.getElementById('welcomeGreeting');

  const initials = activeUser.nome.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();
  avatar.textContent = initials;
  document.getElementById('activeUserName').textContent = activeUser.nome;
  document.getElementById('activeUserEmail').textContent = activeUser.email;
  roleBadge.textContent = activeUser.perfil === 'gestor' ? 'Gestor (ADM)' : 'Colaborador';
  roleBadge.className = activeUser.perfil === 'gestor' ? 'role-pill gestor' : 'role-pill';

  welcome.textContent = `Olá, ${activeUser.nome.split(' ')[0]}!`;

  // PRIVACIDADE: apenas gestores veem as abas de equipe e configurações.
  // (A proteção real dos dados está no banco: o Supabase só entrega ao
  //  colaborador os registros dele.)
  const isGestor = activeUser.perfil === 'gestor';

  document.querySelectorAll('.admin-only-item').forEach(el => {
    el.style.display = isGestor ? 'block' : 'none';
  });
  document.querySelectorAll('.admin-bottom-item').forEach(el => {
    el.style.display = isGestor ? 'flex' : 'none';
  });

  const activeTabBtn = document.querySelector('.nav-btn.active');
  const currentTab = activeTabBtn ? activeTabBtn.getAttribute('data-tab') : 'tab-ponto';
  if (!isGestor && (currentTab === 'tab-gestao' || currentTab === 'tab-configuracoes')) {
    switchTab('tab-ponto');
  }

  renderAll();
}

/* ==========================================================================
   8. Motor de Batidas Flexíveis (Suporte a N Saídas Pontuais)
   ========================================================================== */
// Data AAAA-MM-DD no fuso horário local do aparelho
function toLocalDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getTodayDateStr() {
  return toLocalDateStr(new Date());
}

function getTodayPunchRecord(userId) {
  const todayStr = getTodayDateStr();
  return punches.find(p => p.userId === userId && p.date === todayStr);
}

function getCurrentTimeStr() {
  const now = new Date();
  return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
}

let punchInProgress = false;

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
  } else {
    const lastPunch = record.punches[record.punches.length - 1];

    if (lastPunch.type === 'saida_final') {
      btnEntrada.disabled = false; // Permite registrar nova entrada se necessário
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

  if (punchInProgress) {
    [btnEntrada, btnSaidaPontual, btnRetorno, btnSaidaFinal].forEach(b => { b.disabled = true; });
  }
}

async function addPunch(type, label, motivo = '') {
  if (punchInProgress) return;
  punchInProgress = true;
  updatePunchButtonsState();

  const time = getCurrentTimeStr();
  const feedback = document.getElementById('punchFeedback');
  feedback.className = 'feedback-msg';
  feedback.textContent = '⏳ Registrando...';

  try {
    // Busca a versão mais recente do dia no servidor (a pessoa pode ter batido em outro aparelho)
    const today = getTodayDateStr();
    const { data: fresh, error } = await sb.from('registros_ponto')
      .select('*').eq('user_id', activeUser.id).eq('data', today).maybeSingle();
    if (error) throw error;

    const record = fresh ? recordFromRow(fresh) : {
      id: null,
      userId: activeUser.id,
      date: today,
      punches: [],
      local: lastKnownLocation || 'Local Registrado',
      observacao: '',
      ajustes: []
    };
    if (lastKnownLocation) record.local = lastKnownLocation;
    record.punches.push({ time, type, label, motivo });

    await saveRecord(record);

    feedback.className = 'feedback-msg success';
    feedback.textContent = `✅ ${label} registrada às ${time}${motivo ? ' (' + motivo + ')' : ''}!`;
    if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
  } catch (err) {
    feedback.className = 'feedback-msg warning';
    feedback.textContent = `⚠️ Não foi possível registrar: ${friendlyError(err)}`;
  } finally {
    punchInProgress = false;
    setTimeout(() => { if (feedback.classList.contains('success')) feedback.textContent = ''; }, 5000);
    renderAll();
  }
}

function punchIcon(type) {
  if (type === 'saida_pontual') return '🟡';
  if (type === 'retorno') return '🔵';
  if (type === 'saida_final') return '🔴';
  return '🟢';
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
    const el = document.createElement('div');
    el.className = `timeline-item ${p.type}`;
    el.innerHTML = `
      <div class="timeline-left">
        <span>${punchIcon(p.type)}</span>
        <div>
          <span class="timeline-title">${escapeHTML(p.label || p.type)}</span>
          ${p.motivo ? `<span class="timeline-motivo">${escapeHTML(p.motivo)}</span>` : ''}
        </div>
      </div>
      <div class="timeline-time">${escapeHTML(p.time)}</div>
    `;
    container.appendChild(el);
  });
}

/* ==========================================================================
   9. Cálculo de Horas Trabalhadas com Múltiplas Saídas Pontuais
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
  document.getElementById('statTodayHours').textContent = formatMinutesToHours(todayMinutes);

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

  document.getElementById('statMonthHours').textContent = formatMinutesToHours(monthMinutes);

  const balanceEl = document.getElementById('statBalanceHours');
  balanceEl.textContent = (balanceMinutes >= 0 ? '+' : '') + formatMinutesToHours(balanceMinutes);
  balanceEl.style.color = balanceMinutes >= 0 ? 'var(--success)' : 'var(--danger)';

  const pendingJust = justifications.filter(j => j.userId === activeUser.id && j.status === 'Pendente');
  document.getElementById('statPendingCount').textContent = pendingJust.length;
}

/* ==========================================================================
   10. Histórico do Colaborador (Com Botão de Ajuste)
   ========================================================================== */
function renderPunchPills(record, withMotivo) {
  return record.punches.map(p => {
    const motivoText = withMotivo && p.motivo ? ` (${escapeHTML(p.motivo)})` : '';
    return `<span class="punch-pill ${escapeHTML(p.type)}">${punchIcon(p.type)} ${escapeHTML(p.time)}${motivoText}</span>`;
  }).join(' ');
}

function renderHistoryTable() {
  const tbody = document.getElementById('historyTableBody');
  const monthFilter = document.getElementById('historyMonthFilter').value;
  tbody.innerHTML = '';

  // Somente os registros do usuário logado
  let userPunches = punches.filter(p => p.userId === activeUser.id);
  if (monthFilter) {
    userPunches = userPunches.filter(p => p.date.startsWith(monthFilter));
  }

  userPunches.sort((a, b) => b.date.localeCompare(a.date));

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
    const pillsHTML = renderPunchPills(record, true);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${dateFormatted}</strong></td>
      <td><div class="punches-pill-list">${pillsHTML || '<em class="text-muted">Sem batidas</em>'}</div></td>
      <td><strong>${formatMinutesToHours(totalMinutes)}</strong></td>
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
   11. Ajustes de Batidas e Inserção Retroativa (Preservando GPS)
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

    // Gestor escolhe o colaborador; colaborador só ajusta o próprio ponto
    const userSelect = document.getElementById('adjustUserId');
    const userGroup = document.getElementById('adjustUserSelectGroup');
    userSelect.innerHTML = '';

    if (activeUser.perfil === 'gestor') {
      userGroup.style.display = 'block';
      users.filter(u => !u.pendente).forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.nome}${u.cargo ? ' (' + u.cargo + ')' : ''}${u.ativo ? '' : ' - inativo'}`;
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
    openModal(getTodayPunchRecord(activeUser.id));
  });
  btnClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);

  btnAddRow.addEventListener('click', () => addPunchRowToModal('08:00', 'entrada'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetUserId = activeUser.perfil === 'gestor'
      ? document.getElementById('adjustUserId').value
      : activeUser.id;
    const targetDate = document.getElementById('adjustDate').value;
    const observacao = document.getElementById('adjustMotivo').value.trim();

    if (!targetDate) {
      alert('Informe a data do registro.');
      return;
    }

    const collectedPunches = [];
    document.querySelectorAll('.punch-row-item').forEach(r => {
      const timeVal = r.querySelector('.row-time').value;
      const typeVal = r.querySelector('.row-type').value;
      const motivoVal = r.querySelector('.row-motivo').value.trim();

      if (timeVal) {
        let label = 'Entrada';
        if (typeVal === 'saida_pontual') label = 'Saída Pontual';
        if (typeVal === 'retorno') label = 'Retorno';
        if (typeVal === 'saida_final') label = 'Saída Final';
        collectedPunches.push({ time: timeVal, type: typeVal, label, motivo: motivoVal });
      }
    });

    collectedPunches.sort((a, b) => parseMinutes(a.time) - parseMinutes(b.time));

    if (collectedPunches.length === 0) {
      alert('Adicione pelo menos uma batida com horário.');
      return;
    }

    const editingRecord = editingRecordId ? punches.find(p => p.id === editingRecordId) : null;
    const sameDayRecord = punches.find(p => p.userId === targetUserId && p.date === targetDate);
    if (editingRecord && sameDayRecord && sameDayRecord !== editingRecord) {
      alert('Já existe um registro para este colaborador nessa data. Ajuste o registro existente pelo histórico.');
      return;
    }
    const existing = editingRecord || sameDayRecord;

    // Trilha de auditoria: quem ajustou, quando, motivo e como estava antes
    const auditEntry = {
      em: new Date().toISOString(),
      por: activeUser.nome,
      porId: activeUser.id,
      motivo: observacao || 'Ajuste manual',
      batidasAnteriores: existing ? existing.punches.map(p => `${p.time} ${p.label}`) : []
    };

    const record = existing
      ? {
          ...existing,
          userId: targetUserId,
          date: targetDate,
          punches: collectedPunches,
          observacao,
          // Mantém a geolocalização gravada originalmente (auditoria)
          local: existing.local || lastKnownLocation || 'Ajuste Manual',
          ajustes: (existing.ajustes || []).concat(auditEntry)
        }
      : {
          id: null,
          userId: targetUserId,
          date: targetDate,
          punches: collectedPunches,
          local: lastKnownLocation || 'Ajuste Manual',
          observacao,
          ajustes: [auditEntry]
        };

    const submitBtn = form.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    try {
      await saveRecord(record);
      alert('✅ Registro de ponto atualizado com sucesso!');
      closeModal();
      renderAll();
    } catch (err) {
      alert('⚠️ Não foi possível salvar: ' + friendlyError(err));
    } finally {
      submitBtn.disabled = false;
    }
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
    <input type="time" class="input-control row-time" value="${escapeHTML(time)}" required>
    <input type="text" class="input-control row-motivo" placeholder="Motivo/Obs (ex: Reunião, Almoço)" value="${escapeHTML(motivo)}" style="flex: 1;">
    <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()" title="Remover batida">❌</button>
  `;
  container.appendChild(div);
}

window.openAdjustModalForRecord = function(recordId) {
  const rec = punches.find(p => p.id === recordId);
  if (!rec) return;
  if (activeUser.perfil !== 'gestor' && rec.userId !== activeUser.id) {
    alert('Acesso não autorizado.');
    return;
  }
  openAdjustModal(rec);
};

/* ==========================================================================
   12. Modal Rápido de Saída Pontual (Almoço, Reunião, etc)
   ========================================================================== */
function setupQuickExitModal() {
  const modal = document.getElementById('quickExitModalOverlay');
  const closeModal = () => modal.classList.remove('active');

  document.getElementById('btnPunchSaidaPontual').addEventListener('click', () => modal.classList.add('active'));
  document.getElementById('btnQuickExitClose').addEventListener('click', closeModal);
  document.getElementById('btnQuickExitCancel').addEventListener('click', closeModal);

  document.getElementById('btnConfirmQuickExit').addEventListener('click', () => {
    const typeSelect = document.getElementById('quickExitType');
    const obsInput = document.getElementById('quickExitObs');
    const motivoFull = `${typeSelect.value}${obsInput.value.trim() ? ' - ' + obsInput.value.trim() : ''}`;
    obsInput.value = '';
    closeModal();
    addPunch('saida_pontual', 'Saída Pontual', motivoFull);
  });
}

/* ==========================================================================
   13. Justificativas de Ausências
   ========================================================================== */
function setupJustificationForm() {
  const form = document.getElementById('justificativaForm');
  document.getElementById('justData').max = getTodayDateStr();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = document.getElementById('justData').value;
    const tipo = document.getElementById('justTipo').value;
    const horas = parseFloat(document.getElementById('justHoras').value) || activeUser.cargaHoraria || 8;
    const motivo = document.getElementById('justMotivo').value.trim();

    if (!data || !tipo || !motivo) {
      alert('Preencha os campos obrigatórios (*).');
      return;
    }

    const submitBtn = form.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    try {
      const { data: row, error } = await sb.from('justificativas')
        .insert({ user_id: activeUser.id, data, tipo, horas, motivo })
        .select().single();
      if (error) throw error;
      justifications.unshift(justFromRow(row));
      alert('✅ Justificativa enviada para aprovação do gestor!');
      form.reset();
      renderAll();
    } catch (err) {
      alert('⚠️ Não foi possível enviar: ' + friendlyError(err));
    } finally {
      submitBtn.disabled = false;
    }
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
      <td><strong>${escapeHTML(j.tipo)}</strong></td>
      <td>${escapeHTML(j.motivo)}</td>
      <td>${j.horas}h</td>
      <td><span class="badge ${badgeClass}">${escapeHTML(j.status)}</span></td>
      <td>${j.parecer ? `<em>"${escapeHTML(j.parecer)}"</em>` : '<span class="text-muted">Em análise</span>'}</td>
    `;
    tbody.appendChild(tr);
  });
}

function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>'"]/g,
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

/* ==========================================================================
   14. Painel da Equipe (Exclusivo Gestor)
   ========================================================================== */
function renderAdmDashboard() {
  if (activeUser.perfil !== 'gestor') return;

  document.getElementById('statAdmTotalEmployees').textContent = users.filter(u => u.ativo).length;

  const pendentes = users.filter(u => u.pendente);
  const pendingBanner = document.getElementById('pendingApprovalBanner');
  pendingBanner.style.display = pendentes.length ? 'flex' : 'none';
  document.getElementById('pendingApprovalText').textContent = pendentes.length === 1
    ? `⏳ ${pendentes[0].nome} se cadastrou e aguarda sua aprovação.`
    : `⏳ ${pendentes.length} cadastros aguardando sua aprovação.`;

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

  const justTbody = document.getElementById('admJustificationsTableBody');
  justTbody.innerHTML = '';

  if (pendingJust.length === 0) {
    justTbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 16px;">Nenhuma justificativa pendente de aprovação.</td></tr>';
  } else {
    pendingJust.forEach(j => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHTML(getUserName(j.userId))}</strong></td>
        <td>${new Date(j.date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
        <td>${escapeHTML(j.tipo)}</td>
        <td>${escapeHTML(j.motivo)}</td>
        <td>${j.horas}h</td>
        <td><span class="badge badge-warning">${escapeHTML(j.status)}</span></td>
        <td><button class="btn btn-sm btn-primary" onclick="openReviewModal('${j.id}')">🔍 Avaliar</button></td>
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
    opt.textContent = `${u.nome}${u.cargo ? ' (' + u.cargo + ')' : ''}`;
    selectFilter.appendChild(opt);
  });
  selectFilter.value = users.some(u => u.id === currentValue) ? currentValue : 'all';

  renderAdmTeamPunchTable();
}

function renderAdmTeamPunchTable() {
  const tbody = document.getElementById('admTeamPunchTableBody');
  const filterUserId = document.getElementById('admFilterEmployee').value;
  tbody.innerHTML = '';

  let list = [...punches];
  if (filterUserId !== 'all') {
    list = list.filter(p => p.userId === filterUserId);
  }

  list.sort((a, b) => b.date.localeCompare(a.date));

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
    const pillsHTML = renderPunchPills(record, false);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHTML(employee.nome)}</strong></td>
      <td>${new Date(record.date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
      <td><div class="punches-pill-list">${pillsHTML || '<em class="text-muted">Sem batidas</em>'}</div></td>
      <td><strong>${formatMinutesToHours(totalMinutes)}</strong></td>
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
  document.getElementById('modalTitle').textContent = `Avaliar: ${getUserName(j.userId)}`;
  document.getElementById('modalDescription').innerHTML = `
    <strong>Data:</strong> ${new Date(j.date + 'T00:00:00').toLocaleDateString('pt-BR')}<br>
    <strong>Tipo:</strong> ${escapeHTML(j.tipo)}<br>
    <strong>Horas:</strong> ${j.horas}h<br>
    <strong>Motivo declarado:</strong> <em>"${escapeHTML(j.motivo)}"</em>
  `;
  document.getElementById('modalFeedback').value = '';
  document.getElementById('justModalOverlay').classList.add('active');
};

function setupModalActions() {
  const modal = document.getElementById('justModalOverlay');

  function closeModal() {
    modal.classList.remove('active');
    pendingJustificationIdToReview = null;
  }

  async function review(status, defaultParecer) {
    if (!pendingJustificationIdToReview) return;
    const parecer = document.getElementById('modalFeedback').value.trim() || defaultParecer;
    try {
      const { data: row, error } = await sb.from('justificativas')
        .update({ status, parecer, avaliado_por: activeUser.id })
        .eq('id', pendingJustificationIdToReview)
        .select().single();
      if (error) throw error;
      const updated = justFromRow(row);
      justifications = justifications.map(j => j.id === updated.id ? updated : j);
      alert(status === 'Aprovada' ? '✅ Justificativa APROVADA!' : 'Justificativa REJEITADA.');
      closeModal();
      renderAll();
    } catch (err) {
      alert('⚠️ Não foi possível salvar o parecer: ' + friendlyError(err));
    }
  }

  document.getElementById('btnModalClose').addEventListener('click', closeModal);
  document.getElementById('btnApproveJust').addEventListener('click', () => review('Aprovada', 'Aprovado pelo gestor.'));
  document.getElementById('btnRejectJust').addEventListener('click', () => review('Rejeitada', 'Não atende aos critérios.'));
}

/* ==========================================================================
   15. Configurações: Pré-cadastro, Equipe, Backup e Importação
   ========================================================================== */
let editingUser = null; // { kind: 'perfil' | 'pre', key }

function resetUserForm() {
  editingUser = null;
  document.getElementById('userRegistrationForm').reset();
  document.getElementById('regEmail').disabled = false;
  document.getElementById('regFormTitle').textContent = '➕ Pré-cadastrar Colaborador ou Gestor';
  document.getElementById('btnSaveUser').textContent = '💾 Salvar Pré-cadastro';
  document.getElementById('btnCancelUserEdit').style.display = 'none';
}

window.editUser = function(kind, key) {
  const u = kind === 'perfil'
    ? users.find(item => item.id === key)
    : preCadastros.find(item => item.email === key);
  if (!u) return;
  editingUser = { kind, key };
  document.getElementById('regNome').value = u.nome;
  document.getElementById('regEmail').value = u.email;
  document.getElementById('regEmail').disabled = true;
  document.getElementById('regCargo').value = u.cargo || '';
  document.getElementById('regDepto').value = u.depto || '';
  document.getElementById('regPerfil').value = u.perfil;
  document.getElementById('regCarga').value = kind === 'perfil' ? u.cargaHoraria : u.carga_horaria;
  document.getElementById('regFormTitle').textContent = `✏️ Editando: ${u.nome}`;
  document.getElementById('btnSaveUser').textContent = '💾 Atualizar Usuário';
  document.getElementById('btnCancelUserEdit').style.display = 'inline-flex';
  document.getElementById('userRegistrationForm').scrollIntoView({ behavior: 'smooth' });
};

window.toggleUserActive = async function(userId) {
  const u = users.find(item => item.id === userId);
  if (!u) return;
  const action = u.ativo ? 'desativar' : 'reativar';
  const extra = u.ativo ? '\n\nA pessoa não conseguirá mais entrar nem bater ponto. O histórico é preservado.' : '';
  if (!confirm(`Deseja ${action} "${u.nome}"?${extra}`)) return;
  const { error } = await sb.from('perfis').update({ ativo: !u.ativo, pendente: false }).eq('id', userId);
  if (error) {
    alert('⚠️ ' + friendlyError(error));
    return;
  }
  await loadAllData();
  renderAll();
};

window.approveUser = async function(userId) {
  const u = users.find(item => item.id === userId);
  if (!u) return;
  if (!confirm(`Aprovar o acesso de "${u.nome}" (${u.email}) como colaborador?\n\nDepois você pode ajustar cargo, departamento e carga horária em "Editar".`)) return;
  const { error } = await sb.from('perfis').update({ ativo: true, pendente: false }).eq('id', userId);
  if (error) {
    alert('⚠️ ' + friendlyError(error));
    return;
  }
  await loadAllData();
  renderAll();
};

window.rejectUser = async function(userId) {
  const u = users.find(item => item.id === userId);
  if (!u) return;
  if (!confirm(`Recusar o cadastro de "${u.nome}" (${u.email})?\n\nA pessoa não conseguirá entrar. Se mudar de ideia, use "Reativar".`)) return;
  const { error } = await sb.from('perfis').update({ ativo: false, pendente: false }).eq('id', userId);
  if (error) {
    alert('⚠️ ' + friendlyError(error));
    return;
  }
  await loadAllData();
  renderAll();
};

window.cancelPreCadastro = async function(email) {
  if (!confirm(`Cancelar o pré-cadastro de ${email}?`)) return;
  const { error } = await sb.from('pre_cadastros').delete().eq('email', email);
  if (error) {
    alert('⚠️ ' + friendlyError(error));
    return;
  }
  preCadastros = preCadastros.filter(p => p.email !== email);
  renderRegisteredUsersTable();
};

function setupSettingsAndBackup() {
  const regForm = document.getElementById('userRegistrationForm');
  document.getElementById('btnCancelUserEdit').addEventListener('click', resetUserForm);

  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('regNome').value.trim();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const cargo = document.getElementById('regCargo').value.trim();
    const depto = document.getElementById('regDepto').value.trim();
    const perfil = document.getElementById('regPerfil').value;
    const carga = parseFloat(document.getElementById('regCarga').value) || 8;

    if (!nome || !email || !cargo || !depto) {
      alert('Preencha todos os campos obrigatórios.');
      return;
    }

    const fields = { nome, cargo, depto, perfil, carga_horaria: carga };
    const btn = document.getElementById('btnSaveUser');
    btn.disabled = true;
    try {
      if (editingUser && editingUser.kind === 'perfil') {
        const { error } = await sb.from('perfis').update(fields).eq('id', editingUser.key);
        if (error) throw error;
        alert(`✅ Dados de "${nome}" atualizados!`);
      } else if (editingUser && editingUser.kind === 'pre') {
        const { error } = await sb.from('pre_cadastros').update(fields).eq('email', editingUser.key);
        if (error) throw error;
        alert(`✅ Pré-cadastro de "${nome}" atualizado!`);
      } else {
        if (users.some(u => u.email.toLowerCase() === email)) {
          alert('Já existe um usuário com este e-mail. Use o botão "Editar" na lista abaixo.');
          return;
        }
        const { error } = await sb.from('pre_cadastros').insert({ email, ...fields });
        if (error) {
          if (error.code === '23505') throw new Error('Este e-mail já está pré-cadastrado.');
          throw error;
        }
        alert(`✅ "${nome}" pré-cadastrado como ${perfil.toUpperCase()}!\n\nAgora peça para a pessoa abrir o app, tocar em "Primeiro acesso? Criar conta" e usar o e-mail ${email}.`);
      }
      resetUserForm();
      await loadAllData();
      applyUserProfile();
    } catch (err) {
      alert('⚠️ ' + friendlyError(err));
    } finally {
      btn.disabled = false;
    }
  });

  // Exportar Backup JSON (cópia de segurança de tudo que o gestor vê)
  document.getElementById('btnExportBackup').addEventListener('click', () => {
    const fullBackup = {
      app: 'PontoFacil',
      version: '3.0',
      exportedAt: new Date().toISOString(),
      users: users,
      preCadastros: preCadastros,
      punches: punches,
      justifications: justifications.map(j => ({ ...j, userName: getUserName(j.userId) }))
    };
    downloadFile(`backup_ponto_${getTodayDateStr()}.json`, JSON.stringify(fullBackup, null, 2), 'application/json');
  });

  // Importar dados da versão antiga (arquivo JSON ou localStorage deste navegador)
  const fileInput = document.getElementById('fileImportBackup');
  document.getElementById('btnTriggerImport').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        importLegacyData(imported.users, imported.punches, imported.justifications);
      } catch (err) {
        alert('Erro ao ler o arquivo JSON: ' + err.message);
      }
      fileInput.value = '';
    };
    reader.readAsText(file);
  });

  document.getElementById('btnImportLocal').addEventListener('click', () => {
    try {
      const oldUsers = JSON.parse(localStorage.getItem('ponto_users') || 'null');
      const oldPunches = JSON.parse(localStorage.getItem('ponto_records') || 'null');
      const oldJust = JSON.parse(localStorage.getItem('ponto_justifications') || 'null');
      if (!oldUsers || !oldPunches) {
        alert('Não há dados da versão antiga salvos neste navegador.');
        return;
      }
      importLegacyData(oldUsers, oldPunches, oldJust);
    } catch (err) {
      alert('Erro ao ler os dados deste navegador: ' + err.message);
    }
  });

  // Exportar Relatório em CSV (Excel)
  document.getElementById('btnAdmExportCsv').addEventListener('click', () => {
    const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    let csv = '﻿Colaborador;Data;Batidas;Total Trabalhado;Saldo;GPS/Localizacao\n';

    const filterUserId = document.getElementById('admFilterEmployee').value;
    const list = punches
      .filter(r => filterUserId === 'all' || r.userId === filterUserId)
      .sort((a, b) => a.date.localeCompare(b.date));

    list.forEach(record => {
      const u = users.find(usr => usr.id === record.userId) || { nome: 'Desconhecido', cargaHoraria: 8 };
      const total = calculateMinutesFromRecord(record);
      const dailyStandard = (u.cargaHoraria || 8) * 60;
      const balance = record.punches.some(p => p.type === 'saida_final') ? (total - dailyStandard) : 0;
      const batidasStr = record.punches.map(p => `${p.time} (${p.label}${p.motivo ? ': ' + p.motivo : ''})`).join(' | ');
      csv += [u.nome, record.date, batidasStr, formatMinutesToHours(total), formatMinutesToHours(balance), record.local || '']
        .map(csvCell).join(';') + '\n';
    });

    downloadFile(`relatorio_ponto_${getTodayDateStr()}.csv`, csv, 'text/csv;charset=utf-8');
  });
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Importa marcações e justificativas da versão antiga (dados locais).
 * As pessoas são ligadas pelo e-mail; dias que já existem na nuvem são mantidos.
 */
async function importLegacyData(oldUsers, oldPunches, oldJust) {
  if (!Array.isArray(oldUsers) || !Array.isArray(oldPunches)) {
    alert('Arquivo de backup inválido.');
    return;
  }

  const idMap = {};
  const semConta = [];
  oldUsers.forEach(ou => {
    const match = users.find(u => u.email.toLowerCase() === String(ou.email || '').toLowerCase());
    if (match) idMap[ou.id] = match.id;
    else semConta.push(`${ou.nome} <${ou.email}>`);
  });

  const records = [];
  let jaExistiam = 0;
  oldPunches.forEach(p => {
    const userId = idMap[p.userId];
    if (!userId) return;
    let batidas = p.punches;
    if (!Array.isArray(batidas)) { // formato v1 (entrada/intervalo/retorno/saida)
      batidas = [];
      if (p.entrada) batidas.push({ time: p.entrada, type: 'entrada', label: 'Entrada' });
      if (p.intervalo) batidas.push({ time: p.intervalo, type: 'saida_pontual', label: 'Saída Almoço', motivo: 'Almoço' });
      if (p.retorno) batidas.push({ time: p.retorno, type: 'retorno', label: 'Retorno' });
      if (p.saida) batidas.push({ time: p.saida, type: 'saida_final', label: 'Saída Final' });
    }
    if (punches.some(r => r.userId === userId && r.date === p.date) || records.some(r => r.user_id === userId && r.data === p.date)) {
      jaExistiam++;
      return;
    }
    records.push({ user_id: userId, data: p.date, batidas, local: p.local || null, observacao: p.observacao || '', ajustes: p.ajustes || [] });
  });

  // Justificativas iguais (mesma pessoa, data, tipo e motivo) não são importadas de novo
  const sameJust = (a, b) => a.user_id === b.user_id && a.data === b.data && a.tipo === b.tipo && a.motivo === b.motivo;
  const existingJust = justifications.map(j => ({ user_id: j.userId, data: j.date, tipo: j.tipo, motivo: j.motivo }));
  const justRows = (Array.isArray(oldJust) ? oldJust : [])
    .filter(j => idMap[j.userId])
    .filter(j => {
      const key = { user_id: idMap[j.userId], data: j.date, tipo: j.tipo, motivo: j.motivo || '' };
      if (existingJust.some(e => sameJust(e, key))) { jaExistiam++; return false; }
      existingJust.push(key);
      return true;
    })
    .map(j => ({
      user_id: idMap[j.userId], data: j.date, tipo: j.tipo, horas: Number(j.horas) || 8,
      motivo: j.motivo || '', status: ['Pendente', 'Aprovada', 'Rejeitada'].includes(j.status) ? j.status : 'Pendente',
      parecer: j.parecer || ''
    }));

  const resumo = `Serão importados:\n• ${records.length} dia(s) de ponto\n• ${justRows.length} justificativa(s)\n` +
    (jaExistiam ? `\n${jaExistiam} item(ns) já existem na nuvem e não serão duplicados.` : '') +
    (semConta.length ? `\n\nSem conta/pré-cadastro (ignorados):\n${semConta.join('\n')}` : '');

  if (records.length === 0 && justRows.length === 0) {
    alert('Nada para importar.\n\n' + resumo);
    return;
  }
  if (!confirm(resumo + '\n\nContinuar?')) return;

  try {
    for (let i = 0; i < records.length; i += 500) {
      const { error } = await sb.from('registros_ponto').insert(records.slice(i, i + 500));
      if (error) throw error;
    }
    for (let i = 0; i < justRows.length; i += 500) {
      const { error } = await sb.from('justificativas').insert(justRows.slice(i, i + 500));
      if (error) throw error;
    }
    await loadAllData();
    renderAll();
    alert('✅ Dados importados com sucesso!');
  } catch (err) {
    alert('⚠️ Erro na importação: ' + friendlyError(err));
  }
}

function renderRegisteredUsersTable() {
  const tbody = document.getElementById('registeredUsersTableBody');
  tbody.innerHTML = '';

  const perfilBadge = p => p === 'gestor'
    ? '<span class="badge badge-warning">Gestor (ADM)</span>'
    : '<span class="badge badge-info">Colaborador</span>';

  const ordered = [...users].sort((a, b) => (b.pendente - a.pendente) || a.nome.localeCompare(b.nome));
  ordered.forEach(u => {
    const isMe = u.id === activeUser.id;
    const situacao = u.pendente
      ? '<span class="badge badge-warning">Aguardando aprovação</span>'
      : u.ativo ? '<span class="badge badge-success">Ativo</span>' : '<span class="badge badge-danger">Inativo</span>';
    const acoes = u.pendente
      ? `<button class="btn btn-sm btn-success" onclick="approveUser('${u.id}')">✅ Aprovar</button>
         <button class="btn btn-sm btn-outline" onclick="rejectUser('${u.id}')">❌ Recusar</button>`
      : `<button class="btn btn-sm btn-outline" onclick="editUser('perfil', '${u.id}')">✏️ Editar</button>
         ${isMe ? '' : `<button class="btn btn-sm btn-outline" onclick="toggleUserActive('${u.id}')">${u.ativo ? '🚫 Desativar' : '♻️ Reativar'}</button>`}`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHTML(u.nome)}</strong>${isMe ? ' <small class="text-muted">(você)</small>' : ''}</td>
      <td>${escapeHTML(u.email)}</td>
      <td>${escapeHTML(u.cargo) || '<span class="text-muted">—</span>'}</td>
      <td>${escapeHTML(u.depto) || '<span class="text-muted">—</span>'}</td>
      <td>${perfilBadge(u.perfil)}</td>
      <td>${u.cargaHoraria}h / dia</td>
      <td>${situacao}</td>
      <td class="actions-cell">${acoes}</td>
    `;
    tbody.appendChild(tr);
  });

  preCadastros.forEach(p => {
    const tr = document.createElement('tr');
    const emailAttr = escapeHTML(p.email).replace(/'/g, '');
    tr.innerHTML = `
      <td><strong>${escapeHTML(p.nome)}</strong></td>
      <td>${escapeHTML(p.email)}</td>
      <td>${escapeHTML(p.cargo)}</td>
      <td>${escapeHTML(p.depto)}</td>
      <td>${perfilBadge(p.perfil)}</td>
      <td>${Number(p.carga_horaria)}h / dia</td>
      <td><span class="badge badge-neutral">Aguardando 1º acesso</span></td>
      <td class="actions-cell">
        <button class="btn btn-sm btn-outline" onclick="editUser('pre', '${emailAttr}')">✏️ Editar</button>
        <button class="btn btn-sm btn-outline" onclick="cancelPreCadastro('${emailAttr}')">🗑️ Cancelar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ==========================================================================
   16. Gráficos (Chart.js)
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
    last7DaysLabels.push(d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }));

    const record = punches.find(p => p.userId === activeUser.id && p.date === dateStr);
    const hours = record ? (calculateMinutesFromRecord(record) / 60).toFixed(1) : 0;
    last7DaysData.push(Number(hours));
  }

  if (weeklyChartInstance) weeklyChartInstance.destroy();

  weeklyChartInstance = new Chart(ctxWeekly, {
    type: 'bar',
    data: {
      labels: last7DaysLabels,
      datasets: [{ label: 'Horas Trabalhadas', data: last7DaysData, backgroundColor: '#2563eb', borderRadius: 6 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, suggestedMax: 10, title: { display: true, text: 'Horas' } } }
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
        data: [diasTrabalhados, ausenciasAprovadas, ausenciasPendentes],
        backgroundColor: ['#10b981', '#3b82f6', '#f59e0b']
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
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
   17. Navegação e Inicialização
   ========================================================================== */
function setupTabs() {
  document.querySelectorAll('.nav-btn, .bottom-nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
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

  if (tabId === 'tab-graficos' && activeUser) setTimeout(renderCharts, 100);
  document.getElementById('sidebar').classList.remove('open');
}

document.addEventListener('DOMContentLoaded', () => {
  const sysTag = document.querySelector('.system-tag');
  if (sysTag) sysTag.innerHTML = `<strong>${APP_VERSION}</strong><br>PWA • Dados na nuvem`;

  registerServiceWorker();
  setupAuthForms();
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
  document.getElementById('btnGoToApprovals').addEventListener('click', () => switchTab('tab-configuracoes'));
  document.getElementById('btnPrintReport').addEventListener('click', () => window.print());

  initSupabase();
});
