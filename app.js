(function(){
  const MIN_POINTS = 0; // clamp at 0 for kid-friendly UX
  const MINUTES_PER_POINT = 5;
  const STORAGE_KEY = 'screenTimeBuddy:v1';

  const kids = [
    { id:'fay', name:'Fay', emoji:'🌸' },
    { id:'benjamin', name:'Benjamin', emoji:'🚀' }
  ];

  const positiveActions = [
    { id:'read', label:'Lezen', icon:'📚', delta: +1 },
    { id:'chores', label:'Klusje', icon:'🧹', delta: +1 },
    { id:'math', label:'Rekenen', icon:'➕', delta: +1 },
    { id:'chess', label:'Schaken', icon:'♟️', delta: +1 },
    { id:'bonus', label:'Bonus', icon:'✨', delta: +1 },
  ];
  const negativeActions = [
    { id:'lie', label:'Liegen', icon:'🤥', delta: -1 },
    { id:'mean', label:'Gemeen', icon:'😡', delta: -1 },
    { id:'disrespect', label:'Respectloos', icon:'🙅', delta: -1 },
    { id:'not-listen', label:'Niet luisteren', icon:'🙉', delta: -1 },
    { id:'hurt', label:'Pijn doen', icon:'🤕', delta: -1 },
  ];

  const el = {
    kidsGrid: document.getElementById('kidsGrid'),
    logTabs: document.getElementById('logTabs'),
    logContent: document.getElementById('logContent'),
    today: document.getElementById('today'),
    manualResetBtn: document.getElementById('manualResetBtn'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    openSettingsBtn: document.getElementById('openSettingsBtn'),
    settingsModal: document.getElementById('settingsModal'),
    dailyMaxInput: document.getElementById('dailyMaxInput'),
    cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    ruleMax: document.getElementById('ruleMax'),
  };

  // --- State & Storage ---
  function defaultKidState(max){
    return {
      points: max,
      pot: 0,
      logs: [],
    };
  }

  function load(){
    const raw = localStorage.getItem(STORAGE_KEY);
    const today = new Date();
    const todayKey = dateKey(today);

    let data = raw ? JSON.parse(raw) : null;
    if(!data){
      const dailyMax = 18;
      data = {
        lastReset: todayKey,
        settings: { dailyMax },
        kids: Object.fromEntries(kids.map(k=>[k.id, defaultKidState(dailyMax)]))
      };
    } else {
      if(!data.settings) data.settings = { dailyMax: 18 };
      if(typeof data.settings.dailyMax !== 'number' || data.settings.dailyMax <= 0){
        data.settings.dailyMax = 18;
      }
      // Ensure all kids exist
      kids.forEach(k => {
        if(!data.kids) data.kids = {};
        if(!data.kids[k.id]) data.kids[k.id] = defaultKidState(data.settings.dailyMax);
      });
    }

    // Auto daily reset if date changed
    if(data.lastReset !== todayKey){
      data = dailyReset(data);
      save(data);
    }
    return data;
  }

  function save(data){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function dateKey(d){
    return d.toISOString().slice(0,10);
  }

  function dailyReset(data){
    const MAX_POINTS = data.settings?.dailyMax ?? 18;
    // Before setting to 18, move any overschot (>18) to pot
    Object.keys(data.kids).forEach(id => {
      const k = data.kids[id];
      if(k.points > MAX_POINTS){
        const over = k.points - MAX_POINTS;
        k.pot += over;
        k.logs.unshift(makeLog('pot-add', `+${over} naar spaarpot (eindoverschot)`, 'blue'));
      }
      k.logs.unshift(makeLog('daily-reset', `Dag reset naar ${MAX_POINTS} punten`, 'blue'));
      k.points = MAX_POINTS;
      k.logs = k.logs.slice(0, 50);
    });
    data.lastReset = dateKey(new Date());
    toastConfetti();
    return data;
  }

  function makeLog(type, text, tone){
    // tone: plus | minus | blue
    return { id: cryptoRandomId(), ts: Date.now(), type, text, tone };
  }

  function cryptoRandomId(){
    try{
      const arr = new Uint32Array(2);
      crypto.getRandomValues(arr);
      return Array.from(arr).map(n=>n.toString(16)).join('');
    }catch(e){
      return Math.random().toString(16).slice(2) + Date.now().toString(16);
    }
  }

  // --- UI Build ---
  function buildUI(data){
    const MAX_POINTS = data.settings?.dailyMax ?? 18;
    el.today.textContent = new Date().toLocaleDateString('nl-NL', { weekday:'long', day:'numeric', month:'long' });
    if(el.ruleMax) el.ruleMax.textContent = String(MAX_POINTS);
    if(el.dailyMaxInput) el.dailyMaxInput.value = String(MAX_POINTS);

    // Cards
    el.kidsGrid.innerHTML = '';
    kids.forEach(k => {
      const state = data.kids[k.id];
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-header">
          <div class="card-title">
            <div class="avatar">${k.emoji}</div>
            <h3>${k.name}</h3>
          </div>
          <div class="points-badge">
            <span class="num" data-points="${k.id}">${state.points}</span>
            <small>(<span data-mins="${k.id}">${state.points * MINUTES_PER_POINT}</span> min)</small>
          </div>
        </div>
        <div class="progress" id="progress-${k.id}">
          <div class="bar" style="width: ${Math.min(100, (Math.min(state.points, MAX_POINTS)/MAX_POINTS)*100)}%"></div>
          <div class="over" style="width: ${state.points>MAX_POINTS? (Math.min(state.points-MAX_POINTS, MAX_POINTS)/MAX_POINTS)*100 : 0}%"></div>
          <div class="ticks">${'<span></span>'.repeat(MAX_POINTS)}</div>
        </div>
        <div class="points-line">
          <button class="btn secondary" data-action="use-pot" data-kid="${k.id}">
            <span class="big">🏦</span><span class="label">Gebruik spaarpot</span>
          </button>
          <button class="btn secondary" data-action="set-max" data-kid="${k.id}" title="Zet op maximum (zonder spaarpot)">
            <span class="big">🎯</span><span class="label">Naar max</span>
          </button>
        </div>
        <div class="spaarpot">
          <div class="jar"><div class="coins" id="jar-${k.id}" style="height:${potPercent(state.pot)}%"></div></div>
          <div>
            <div><strong>Spaarpot:</strong> <span class="amount" data-pot="${k.id}">${state.pot}</span> punten</div>
            <small class="muted">Kan aanvullen tot ${MAX_POINTS} wanneer lager dan ${MAX_POINTS}</small>
          </div>
        </div>
        <div class="actions">${[
            ...positiveActions.map(a => btnHTML(a, 'primary', k.id)),
            ...negativeActions.map(a => btnHTML(a, 'negative', k.id)),
          ].join('')}
        </div>
      `;
      el.kidsGrid.appendChild(card);
    });

    // Logs tabs
    el.logTabs.innerHTML = kids.map((k,i)=>`<button class="tab ${i===0?'active':''}" data-tab="${k.id}">${k.name}</button>`).join('');
    renderLogs(data, kids[0].id);

    bindEvents();
    syncDisableStates(data);
  }

  function btnHTML(a, theme, kid){
    return `<button class="btn ${theme}" data-action="${a.id}" data-delta="${a.delta}" data-kid="${kid}"><span class="big">${a.icon}</span><span class="label">${a.label}</span></button>`;
  }

  function potPercent(pot){
    // purely visual: e.g. show up to 100% at 40 points
    const cap = 40;
    return Math.max(0, Math.min(100, (pot/cap)*100));
  }

  function bindEvents(){
    if(el.kidsGrid && !el.kidsGrid.dataset.stbBound){
      el.kidsGrid.addEventListener('click', (e)=>{
      const btn = e.target.closest('button[data-action]');
      if(!btn) return;
      const kidId = btn.getAttribute('data-kid');
      const action = btn.getAttribute('data-action');

      if(action === 'use-pot') return handleUsePot(kidId);
        if(action === 'set-max') return handleSetMax(kidId);

      const delta = Number(btn.getAttribute('data-delta')) || 0;
      handleDelta(kidId, action, delta);
      });
      el.kidsGrid.dataset.stbBound = '1';
    }

    if(el.logTabs && !el.logTabs.dataset.stbBound){
      el.logTabs.addEventListener('click', (e)=>{
      const t = e.target.closest('.tab');
      if(!t) return;
      el.logTabs.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      renderLogs(load(), t.getAttribute('data-tab'));
      });
      el.logTabs.dataset.stbBound = '1';
    }

    if(el.manualResetBtn && !el.manualResetBtn.dataset.stbBound){
      el.manualResetBtn.addEventListener('click', ()=>{
        const data = load();
        save(dailyReset(data));
        refresh();
      });
      el.manualResetBtn.dataset.stbBound = '1';
    }

    if(el.clearAllBtn && !el.clearAllBtn.dataset.stbBound){
      el.clearAllBtn.addEventListener('click', ()=>{
        if(confirm('Alle data wissen? Dit kan niet ongedaan worden.')){
          localStorage.removeItem(STORAGE_KEY);
          refresh();
        }
      });
      el.clearAllBtn.dataset.stbBound = '1';
    }

    if(el.openSettingsBtn && !el.openSettingsBtn.dataset.stbBound){
      el.openSettingsBtn.addEventListener('click', openSettings);
      el.openSettingsBtn.dataset.stbBound = '1';
    }
    if(el.cancelSettingsBtn && !el.cancelSettingsBtn.dataset.stbBound){
      el.cancelSettingsBtn.addEventListener('click', closeSettings);
      el.cancelSettingsBtn.dataset.stbBound = '1';
    }
    if(el.saveSettingsBtn && !el.saveSettingsBtn.dataset.stbBound){
      el.saveSettingsBtn.addEventListener('click', saveSettings);
      el.saveSettingsBtn.dataset.stbBound = '1';
    }
    if(el.settingsModal && !el.settingsModal.dataset.stbBackdrop){
      el.settingsModal.addEventListener('click', (e)=>{
        if(e.target === el.settingsModal){
          closeSettings();
        }
      });
      el.settingsModal.dataset.stbBackdrop = '1';
    }

    // Fallback delegation to ensure buttons always work
    if(!document.body.dataset.stbSettingsDelegation){
      document.addEventListener('click', (ev)=>{
        const cancelBtn = ev.target.closest && ev.target.closest('#cancelSettingsBtn');
        const saveBtn = ev.target.closest && ev.target.closest('#saveSettingsBtn');
        if(cancelBtn){ ev.preventDefault(); closeSettings(); }
        if(saveBtn){ ev.preventDefault(); saveSettings(); }
      });
      document.body.dataset.stbSettingsDelegation = '1';
    }
    if(!document.body.dataset.stbEscClose){
      document.addEventListener('keydown', (ev)=>{
        if(ev.key === 'Escape' && el.settingsModal && !el.settingsModal.hidden){
          ev.preventDefault();
          closeSettings();
        }
      });
      document.body.dataset.stbEscClose = '1';
    }
  }

  function renderLogs(data, kidId){
    const k = data.kids[kidId];
    const items = (k.logs||[]).slice(0, 25).map(log => {
      const dt = new Date(log.ts);
      const when = dt.toLocaleTimeString('nl-NL', { hour:'2-digit', minute:'2-digit' });
      const cls = log.tone || 'plus';
      const icon = cls==='plus'?'➕':cls==='minus'?'➖':'🏦';
      return `<div class="log-item">
        <div class="log-icon ${cls}">${icon}</div>
        <div class="log-text">
          <div class="title">${log.text}</div>
          <div class="meta">${when}</div>
        </div>
      </div>`;
    }).join('');
    el.logContent.innerHTML = items || '<div class="log-item"><div class="log-text">Nog geen logjes</div></div>';
  }

  function syncDisableStates(data){
    kids.forEach(k => {
      const s = data.kids[k.id];
      const useBtn = el.kidsGrid.querySelector(`button[data-action="use-pot"][data-kid="${k.id}"]`);
      if(useBtn){
        const MAX_POINTS = data.settings?.dailyMax ?? 18;
        useBtn.disabled = !(s.points < MAX_POINTS && s.pot > 0);
        useBtn.style.filter = useBtn.disabled ? 'grayscale(40%)' : 'none';
      }
    });
  }

  // --- Actions ---
  function handleDelta(kidId, actionId, delta){
    const data = load();
    const s = data.kids[kidId];

    const before = s.points;
    s.points = Math.max(MIN_POINTS, s.points + delta);

    const isPlus = delta > 0;
    const tone = isPlus ? 'plus' : 'minus';
    const def = [...positiveActions, ...negativeActions].find(a=>a.id===actionId);
    const label = def ? def.label : (isPlus?`+${delta}`:`${delta}`);

    s.logs.unshift(makeLog(actionId, `${delta>0?'+':''}${delta} punt voor ${label}`, tone));
    s.logs = s.logs.slice(0, 50);
    save(data);

    animateChange(kidId, before, s.points, isPlus);
    refreshCard(kidId, s);
    syncDisableStates(data);

    if(isPlus) toastSpark();
  }

  function handleUsePot(kidId){
    const data = load();
    const s = data.kids[kidId];
    const MAX_POINTS = data.settings?.dailyMax ?? 18;
    // Consume exactly 1 point from pot per click, only if day < max and pot > 0
    if(!(s.points < MAX_POINTS && s.pot > 0)) return;
    const take = 1;
    s.pot = Math.max(0, s.pot - take);
    s.points = Math.min(MAX_POINTS, s.points + take);
    s.logs.unshift(makeLog('pot-use', `+${take} uit spaarpot naar dagbalans`, 'blue'));
    s.logs = s.logs.slice(0, 50);

    save(data);
    coinFall(kidId);
    refreshCard(kidId, s);
    syncDisableStates(data);
  }

  function handleSetMax(kidId){
    const data = load();
    const s = data.kids[kidId];
    const MAX_POINTS = data.settings?.dailyMax ?? 18;
    const before = s.points;

    // If above 18, do not auto-move to pot here; this is a simple clamp for the day (no pot change)
    s.points = MAX_POINTS;
    s.logs.unshift(makeLog('set-max', `Dagbalans gezet op ${MAX_POINTS}`, 'blue'));
    s.logs = s.logs.slice(0, 50);

    save(data);
    animateChange(kidId, before, s.points, s.points>=before);
    refreshCard(kidId, s);
    syncDisableStates(data);
  }

  // --- UI Update Helpers ---
  function refresh(){
    const data = load();
    buildUI(data);
  }

  function refreshCard(kidId, s){
    const pointsEl = document.querySelector(`[data-points="${kidId}"]`);
    const minsEl = document.querySelector(`[data-mins="${kidId}"]`);
    if(pointsEl) pointsEl.textContent = s.points;
    if(minsEl) minsEl.textContent = s.points * MINUTES_PER_POINT;

    const prog = document.getElementById(`progress-${kidId}`);
    if(prog){
      const bar = prog.querySelector('.bar');
      const over = prog.querySelector('.over');
      const data = load();
      const MAX_POINTS = data.settings?.dailyMax ?? 18;
      const pct = Math.min(100, (Math.min(s.points, MAX_POINTS)/MAX_POINTS)*100);
      const overVal = s.points>MAX_POINTS? (Math.min(s.points - MAX_POINTS, MAX_POINTS)/MAX_POINTS)*100 : 0;
      bar.style.width = pct + '%';
      over.style.width = overVal + '%';
    }

    const jar = document.getElementById(`jar-${kidId}`);
    if(jar){
      jar.style.height = potPercent(s.pot) + '%';
    }

    // Update log content for active tab if relevant
    const activeTab = document.querySelector('.log-tabs .tab.active');
    if(activeTab && activeTab.getAttribute('data-tab') === kidId){
      const data = load();
      renderLogs(data, kidId);
    }
  }

  function animateChange(kidId, before, after, isPlus){
    const prog = document.getElementById(`progress-${kidId}`);
    if(!prog) return;
    prog.classList.remove('flash-green','flash-red');
    void prog.offsetWidth; // force reflow
    prog.classList.add(isPlus ? 'flash-green' : 'flash-red');
  }

  function coinFall(kidId){
    const jarWrap = document.querySelector(`#jar-${kidId}`)?.parentElement;
    if(!jarWrap) return;
    const coin = document.createElement('div');
    coin.className = 'coin-fall';
    jarWrap.appendChild(coin);
    setTimeout(()=>coin.remove(), 750);
  }

  function toastSpark(){
    // lightweight haptic-like visual, no-op placeholder
  }

  function toastConfetti(){
    // simple confetti placeholder: could be extended later
  }

  // --- Settings ---
  function openSettings(){
    if(!el.settingsModal) return;
    el.settingsModal.hidden = false;
  }
  function closeSettings(){
    if(!el.settingsModal) return;
    el.settingsModal.hidden = true;
  }
  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
  function saveSettings(){
    const data = load();
    const prev = data.settings?.dailyMax ?? 18;
    let next = parseInt(el.dailyMaxInput?.value || '18', 10);
    if(Number.isNaN(next)) next = prev;
    next = clamp(next, 6, 36);
    if(!data.settings) data.settings = { dailyMax: next };
    data.settings.dailyMax = next;
    Object.keys(data.kids).forEach(id => {
      data.kids[id].logs.unshift(makeLog('settings', `Max punten per dag gewijzigd naar ${next}`, 'blue'));
      data.kids[id].logs = data.kids[id].logs.slice(0, 50);
    });
    save(data);
    closeSettings();
    buildUI(data);
  }

  // --- Boot ---
  refresh();
})();
