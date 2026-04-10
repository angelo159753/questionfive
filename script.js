/* ── SUPABASE SETUP ───────────────────────────────────── */
const supabaseUrl = 'https://ydrkcwbgfzrhmejbibai.supabase.co';
const supabaseKey = 'sb_publishable_7rqP63grwRYssq1pPfDRIA_G32MSh7V';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

/* ── DATA & STATE ─────────────────────────────────────── */
let quiz = { questions:[], current:0, answers:[], startTime:null, config:{}, timerInterval:null };

/* ── AUTH ─────────────────────────────────────────────── */
function toggleAuth(view) {
  document.getElementById('card-login').style.display = view === 'signup' ? 'none' : 'block';
  document.getElementById('card-signup').style.display = view === 'signup' ? 'block' : 'none';
}

async function doSignUp() {
  const name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const pass = document.getElementById('signup-pass').value;
  if (!email || !pass || !name) return alert('Preencha tudo!');

  const btn = document.getElementById('btn-signup');
  btn.textContent = 'Criando...'; btn.disabled = true;

  const { data, error } = await supabaseClient.auth.signUp({ 
    email, 
    password: pass, 
    options: { data: { full_name: name } } 
  });

  if (error) {
    alert('Erro: ' + error.message);
  } else {
    if (data.user) {
      await supabaseClient.from('perfis').insert([
        { id: data.user.id, nome: name }
      ]);
    }

    alert('Conta criada com sucesso! Faça o login.');
    toggleAuth('login');
    document.getElementById('login-email').value = email;
    document.getElementById('login-pass').value = '';
  }
  btn.textContent = 'Criar minha conta'; btn.disabled = false;
}

async function doLogin() {
  const email = document.getElementById('login-email').value;
  const pass = document.getElementById('login-pass').value;
  if (!email || !pass) return alert('Preencha e-mail e senha!');

  const btn = document.getElementById('btn-login');
  btn.textContent = 'Entrando...'; btn.disabled = true;

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });

  if (error) alert('Erro: ' + error.message);
  else {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    const userName = data.user.user_metadata?.full_name || 'Estudante';
    document.getElementById('dash-title').textContent = `Bom dia, ${userName} 👋`;
    renderDashboard();    
  }
  btn.textContent = 'Entrar na plataforma'; btn.disabled = false;
}

async function doLogout(){
  await supabaseClient.auth.signOut();
  document.getElementById('main-app').style.display = 'none';
  document.getElementById('login-page').style.display = 'flex';
}

/* ── UI & NAVIGATION ──────────────────────────────────── */
function showTab(tab){
  ['dashboard','generator','quiz','result'].forEach(t=>{
    document.getElementById('tab-'+t).classList.remove('active');
    const nav = document.getElementById('nav-'+t);
    if(nav) nav.classList.remove('active');
  });
  document.getElementById('tab-'+tab).classList.add('active');
  const navBtn = document.getElementById('nav-'+tab);
  if(navBtn) navBtn.classList.add('active');
  
  if(tab === 'generator') { updatePreviewTags(); }
  
  // Rola a página para o topo suavemente ao trocar de tela
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goToDashboard() {
  renderDashboard();
  showTab('dashboard');
}

/* ── DASHBOARD ────────────────────────────────────────── */
async function renderDashboard(){
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { data: historico, error } = await supabaseClient
    .from('historico_simulados')
    .select('*')
    .eq('user_id', user.id);

  if (error) {
    console.error("Erro ao buscar dados:", error);
    return;
  }

  // ESTADO VAZIO: Usuário novo
  if (!historico || historico.length === 0) {
    document.getElementById('stat-resolvidas').textContent = '0';
    document.getElementById('stat-taxa').textContent = '0%';
    document.getElementById('stat-tempo').textContent = '0s';
    document.getElementById('stat-simulados').textContent = '0';
    document.getElementById('disc-perf').innerHTML = '<p class="muted" style="font-size:13px">Nenhum simulado realizado ainda.</p>';
    
    // Zera as metas para usuários novos
    document.getElementById('meta-q-text').innerHTML = `0 <span class="muted">/ 50</span>`;
    document.getElementById('meta-q-bar').style.width = '0%';
    document.getElementById('meta-s-text').innerHTML = `0 <span class="muted">/ 5</span>`;
    document.getElementById('meta-s-bar').style.width = '0%';
    document.getElementById('meta-desc').textContent = "Faltam 50 questões para atingir sua meta!";
    
    const historicoAcessos = await getLoginHistory(); 
    const historyHtml = historicoAcessos.map(l => `
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
        <div><div style="font-size:13px;font-weight:500">${l.data}</div><div class="muted" style="font-size:11px">${l.disp}</div></div>
        <span class="tag" style="height:fit-content">${l.local}</span>
      </div>`).join('');
    const loginHistEl = document.getElementById('login-history');
    if (loginHistEl) loginHistEl.innerHTML = historyHtml;
    
    return;
  }

  // ESTADO COM DADOS: Calcula o progresso do usuário
  let totalAcertos = 0;
  let totalErros = 0;
  let tempoTotal = 0;
  const performancePorDisciplina = {};

  historico.forEach(simulado => {
    totalAcertos += simulado.acertos;
    totalErros += simulado.erros;
    tempoTotal += simulado.tempo_segundos;

    if (!performancePorDisciplina[simulado.disciplina]) {
      performancePorDisciplina[simulado.disciplina] = { acertos: 0, total: 0 };
    }
    performancePorDisciplina[simulado.disciplina].acertos += simulado.acertos;
    performancePorDisciplina[simulado.disciplina].total += (simulado.acertos + simulado.erros);
  });

  const totalQuestoes = totalAcertos + totalErros;
  const taxaAcerto = Math.round((totalAcertos / totalQuestoes) * 100);
  const tempoMedio = Math.round(tempoTotal / totalQuestoes); 
  
  const min = Math.floor(tempoMedio / 60);
  const seg = tempoMedio % 60;

  // Atualiza Estatísticas Principais
  document.getElementById('stat-resolvidas').textContent = totalQuestoes;
  document.getElementById('stat-taxa').textContent = taxaAcerto + '%';
  document.getElementById('stat-tempo').textContent = min > 0 ? `${min}m${seg}s` : `${seg}s`;
  document.getElementById('stat-simulados').textContent = historico.length;

  // Atualiza a Meta Semanal com dados reais
  const metaQtd = 50;
  const metaSim = 5;
  const pctQ = Math.min(Math.round((totalQuestoes / metaQtd) * 100), 100);
  const pctS = Math.min(Math.round((historico.length / metaSim) * 100), 100);

  document.getElementById('meta-q-text').innerHTML = `${totalQuestoes} <span class="muted">/ ${metaQtd}</span>`;
  document.getElementById('meta-q-bar').style.width = pctQ + '%';
  document.getElementById('meta-s-text').innerHTML = `${historico.length} <span class="muted">/ ${metaSim}</span>`;
  document.getElementById('meta-s-bar').style.width = pctS + '%';

  const faltam = Math.max(0, metaQtd - totalQuestoes);
  document.getElementById('meta-desc').textContent = faltam > 0 
    ? `Faltam ${faltam} questões para atingir sua meta!` 
    : "Parabéns! Você atingiu sua meta de questões!";

  // Atualiza Barras de Disciplinas
  document.getElementById('disc-perf').innerHTML = Object.keys(performancePorDisciplina).map(nome => {
    const d = performancePorDisciplina[nome];
    const pct = Math.round((d.acertos / d.total) * 100);
    
    let cor = 'var(--error)';
    if (pct >= 50) cor = 'var(--accent)';
    if (pct >= 75) cor = 'var(--success)';

    return `<div style="margin-bottom:13px">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:13px">
        <span>${nome}</span><strong>${pct}% <span class="muted">(${d.acertos}/${d.total})</span></strong>
      </div>
      <div class="progress-bar"><div style="height:100%;width:${pct}%;background:${cor};border-radius:99px"></div></div>
    </div>`;
  }).join('');

  // Atualiza Últimos Acessos
  const historicoAcessos = await getLoginHistory(); 
  const historyHtml = historicoAcessos.map(l => `
    <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
      <div><div style="font-size:13px;font-weight:500">${l.data}</div><div class="muted" style="font-size:11px">${l.disp}</div></div>
      <span class="tag" style="height:fit-content">${l.local}</span>
    </div>`).join('');
  
  const loginHistEl = document.getElementById('login-history');
  if (loginHistEl) loginHistEl.innerHTML = historyHtml;
}

/* ── UI & NAVIGATION (Tags Dinâmicas) ─────────────────── */
function updatePreviewTags(){
  const disc = document.getElementById('sel-disciplina');
  const ass = document.getElementById('sel-assunto');
  const qtd = document.getElementById('sel-qtd');
  const el = document.getElementById('preview-tags');
  if(!el) return;
  
  const assuntoTexto = ass.value.trim() ? `<span class="badge badge-blue">${ass.value.trim()}</span>` : '';
  
  el.innerHTML = `<span class="badge badge-blue">${disc.value}</span>
                  ${assuntoTexto}
                  <span class="badge badge-green">${qtd.value} questões</span>`;
}

['sel-disciplina','sel-qtd','sel-ano'].forEach(id=>{
  document.getElementById(id)?.addEventListener('change', updatePreviewTags);
});
document.getElementById('sel-assunto')?.addEventListener('input', updatePreviewTags);

/* ── GEMINI API & QUIZ (VIA SUPABASE EDGE FUNCTION) ────────────────── */
async function startSimulado(){
  const disc = document.getElementById('sel-disciplina').value;
  const ass = document.getElementById('sel-assunto').value;
  const qtd = parseInt(document.getElementById('sel-qtd').value);
  const ano = document.getElementById('sel-ano').value;

  showTab('quiz');
  document.getElementById('quiz-loading').style.display = 'flex';
  document.getElementById('quiz-content').style.display = 'none';
  document.getElementById('quiz-error').style.display = 'none';

  try {
    const { data, error } = await supabaseClient.functions.invoke('gerar-questoes', {
      body: { disciplina: disc, assunto: ass, qtd: qtd, ano: ano }
    });

    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);

    quiz = { 
      questions: data.questoes.map(q => ({...q, disc, ass, ano})), 
      current: 0, 
      answers: [], 
      startTime: Date.now(), 
      config: { disc, ass, qtd, ano } 
    };
    
    document.getElementById('quiz-loading').style.display = 'none';
    document.getElementById('quiz-content').style.display = 'block';
    
    startTimer(); 
    renderQuestion();

  } catch(e) {
    console.error("Erro no Backend:", e);
    document.getElementById('quiz-loading').style.display = 'none';
    document.getElementById('quiz-error').style.display = 'block';
    document.getElementById('quiz-error-msg').textContent = "Falha ao gerar questões com a IA. Tente novamente.";
  }
}

function startTimer(){
  clearInterval(quiz.timerInterval);
  quiz.timerInterval = setInterval(()=>{
    const elapsed = Math.floor((Date.now()-quiz.startTime)/1000);
    document.getElementById('q-timer').textContent = String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0');
  }, 1000);
}

function renderQuestion(){
  const q = quiz.questions[quiz.current];
  document.getElementById('q-counter').textContent = `Questão ${quiz.current+1} de ${quiz.questions.length}`;
  document.getElementById('q-progress').style.width = Math.round(((quiz.current+1)/quiz.questions.length)*100)+'%';
  document.getElementById('q-tags').innerHTML = `<span class="badge badge-blue">${q.disc}</span><span class="tag">${q.ass}</span>`;
  document.getElementById('q-enunciado').textContent = q.enunciado;
  document.getElementById('q-comment').style.display = 'none';
  document.getElementById('q-next').style.display = 'none';

  const letters = ['A','B','C','D','E'];
  document.getElementById('q-alts').innerHTML = q.alternativas.map((a,i)=>`
    <button class="alt-btn" onclick="selectAlt(${i})" id="alt-${i}">
      <span class="alt-letter">${letters[i]}</span><span>${a}</span>
    </button>`).join('');
}

function selectAlt(idx){
  const q = quiz.questions[quiz.current];
  document.querySelectorAll('.alt-btn').forEach(b=>b.disabled=true);
  
  const isCorrect = idx === q.correta;
  document.getElementById('alt-'+idx).classList.add(isCorrect ? 'alt-correct' : 'alt-wrong');
  if(!isCorrect) document.getElementById('alt-'+q.correta).classList.add('alt-reveal-correct');
  
  quiz.answers.push(isCorrect);

  document.getElementById('q-comment').innerHTML = `
    <div class="comment-box">
      <div style="margin-bottom:10px"><span class="badge ${isCorrect?'badge-green':'badge-orange'}">${isCorrect?'✓ Acertou':'✗ Errou'}</span></div>
      <p style="font-size:13px;color:var(--muted)">${q.comentario}</p>
    </div>`;
  document.getElementById('q-comment').style.display = 'block';
  
  const isLast = quiz.current === quiz.questions.length-1;
  document.getElementById('btn-next').textContent = isLast ? 'Ver resultado →' : 'Próxima questão →';
  document.getElementById('q-next').style.display = 'block';
}

function nextQuestion(){
  if(quiz.current === quiz.questions.length-1) return endQuiz();
  quiz.current++; renderQuestion();
}

function endQuiz(){
  clearInterval(quiz.timerInterval);
  if(quiz.answers.length > 0) showResult();
  else showTab('generator');
}

/* ── RESULTS ──────────────────────────────────────────── */
async function showResult(){
  const acertos = quiz.answers.filter(Boolean).length;
  const erros = quiz.answers.length - acertos;
  const pct = Math.round((acertos/quiz.answers.length)*100);
  const elapsed = Math.floor((Date.now()-quiz.startTime)/1000); 
  const m = Math.floor(elapsed/60), s = elapsed%60;
  
  document.getElementById('res-score').textContent = pct+'%';
  document.getElementById('res-acertos').textContent = acertos;
  document.getElementById('res-erros').textContent = erros;
  document.getElementById('res-tempo').textContent = m+'m'+String(s).padStart(2,'0')+'s';
  document.getElementById('res-desc').textContent = `Você acertou ${acertos} de ${quiz.answers.length} questões`;
  
  document.getElementById('res-list').innerHTML = quiz.answers.map((ok,i)=>`
    <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="color:${ok?'var(--success)':'var(--error)'}">${ok?'✓':'✗'}</div>
      <div style="font-size:13px">${quiz.questions[i].enunciado.slice(0,80)}...</div>
    </div>`).join('');
  
  const { data: { user } } = await supabaseClient.auth.getUser();
  
  if (user) {
    const { error } = await supabaseClient.from('historico_simulados').insert([{
      user_id: user.id,
      disciplina: quiz.config.disc,
      acertos: acertos,
      erros: erros,
      tempo_segundos: elapsed
    }]);

    if (error) console.error("Erro ao salvar histórico no banco:", error);
  }
  
  showTab('result');
}

/* ── RECUPERAÇÃO DE SENHA ───────────────────────────── */
function showForgotPassword() {
  document.getElementById('card-login').style.display = 'none'; 
  document.getElementById('forgot-box').style.display = 'block';
}

function hideForgotPassword() {
  document.getElementById('forgot-box').style.display = 'none';
  document.getElementById('card-login').style.display = 'block'; 
}

async function sendRecoveryEmail() {
  const email = document.getElementById('forgot-email').value;
  const msgEl = document.getElementById('forgot-msg');
  
  if(!email) return msgEl.innerHTML = "<span style='color:var(--error)'>Digite seu email.</span>";
  msgEl.innerHTML = "Enviando...";

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });

  if (error) {
    msgEl.innerHTML = `<span style='color:var(--error)'>Erro: ${error.message}</span>`;
  } else {
    msgEl.innerHTML = `<span style='color:var(--success)'>Link enviado! Verifique sua caixa de entrada (e o Spam).</span>`;
  }
}

async function updatePassword() {
  const newPass = document.getElementById('new-password').value;
  const msgEl = document.getElementById('reset-msg');
  
  if(newPass.length < 6) return msgEl.innerHTML = "<span style='color:var(--error)'>A senha deve ter no mínimo 6 caracteres.</span>";
  msgEl.innerHTML = "Salvando...";

  const { error } = await supabaseClient.auth.updateUser({ password: newPass });

  if (error) {
    msgEl.innerHTML = `<span style='color:var(--error)'>Erro: ${error.message}</span>`;
  } else {
    msgEl.innerHTML = `<span style='color:var(--success)'>Senha atualizada! Entrando...</span>`;
    setTimeout(() => {
      window.location.hash = ''; 
      document.getElementById('reset-box').style.display = 'none';
      checkUserSession();
    }, 1500);
  }
}

/* ── INIT E SESSÃO ────────────────────────────────────── */
async function checkUserSession() {
  // ✦ DETETIVE DE RECUPERAÇÃO DE SENHA ✦
  if (window.location.hash && window.location.hash.includes('type=recovery')) {
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
    
    document.getElementById('card-login').style.display = 'none'; 
    document.getElementById('forgot-box').style.display = 'none';
    document.getElementById('reset-box').style.display = 'block';
    return;
  }
  
  const { data: { session }, error } = await supabaseClient.auth.getSession();

  if (session && session.user) {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    
    const userName = session.user.user_metadata?.full_name || 'Estudante';
    document.getElementById('dash-title').textContent = `Bom dia, ${userName} 👋`;
    
    renderDashboard();    
  } else {
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
  }
}

async function getLoginHistory() {
  let history = JSON.parse(localStorage.getItem('qf_login_history') || '[]');
  const now = new Date();
  
  const lastRecord = history[0] ? new Date(history[0].rawDate) : new Date(0);
  const hoursSinceLast = (now - lastRecord) / (1000 * 60 * 60);
  
  if (hoursSinceLast > 1 || history.length === 0) {
    const ua = navigator.userAgent;
    let browser = ua.includes("Chrome") ? "Chrome" : ua.includes("Firefox") ? "Firefox" : ua.includes("Safari") ? "Safari" : "Navegador";
    let os = ua.includes("Windows") ? "Windows" : ua.includes("Mac") ? "MacOS" : ua.includes("Android") || ua.includes("iPhone") ? "Mobile" : "Desktop";
    
    let regiao = "Brasil";
    
    try {
      const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
      const geo = await res.json();
      
      if (geo.city && geo.region) {
        regiao = `${geo.city}, ${geo.region}`; 
      }
    } catch(e) {
      console.error("Falha na API de IP:", e);
    }
    
    const dataStr = now.toLocaleDateString('pt-BR') + ', ' + now.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
    
    history.unshift({ 
      data: dataStr, 
      disp: `${browser} / ${os}`, 
      local: regiao, 
      rawDate: now.toISOString() 
    });
    
    history = history.slice(0, 3); 
    localStorage.setItem('qf_login_history', JSON.stringify(history));
  }
  
  return history;
}

// Inicia as validações e as tags ao abrir a página
checkUserSession();
updatePreviewTags();