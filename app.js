(function(){
  const MIN_POINTS = 0; // clamp at 0 for kid-friendly UX
  const MINUTES_PER_POINT = 5;
  const STORAGE_KEY = 'screenTimeBuddy:v1';
  const LOG_LIMIT = 1000;
  const LF = (typeof localforage !== 'undefined') ? localforage.createInstance({ name: 'schermtijd-buddy', storeName: 'data' }) : null;

  const kids = [
    { id:'fay', name:'Fay', emoji:'🌸' },
    { id:'benjamin', name:'Benjamin', emoji:'🚀' }
  ];

  // Default actions (used if none defined in settings)
  const defaultPositiveActions = [
    { id:'read', label:'Lezen', icon:'📚', delta: +1 },
    { id:'chores', label:'Klusje', icon:'🧹', delta: +1 },
    { id:'math', label:'Rekenen', icon:'➕', delta: +1 },
    { id:'chess', label:'Schaken', icon:'♟️', delta: +1 },
    { id:'bonus', label:'Bonus', icon:'✨', delta: +1 },
  ];
  const defaultNegativeActions = [
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
    statsTabs: document.getElementById('statsTabs'),
    statsRange: document.getElementById('statsRange'),
    statsGrid: document.getElementById('statsGrid'),
    statsExportPdfBtn: document.getElementById('statsExportPdfBtn'),
    today: document.getElementById('today'),
    manualResetBtn: document.getElementById('manualResetBtn'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    openExportBtn: document.getElementById('openExportBtn'),
    exportModal: document.getElementById('exportModal'),
    closeExportBtn: document.getElementById('closeExportBtn'),
    exportStatsRange: document.getElementById('exportStatsRange'),
    exportJsonBtn: document.getElementById('exportJsonBtn'),
    importJsonBtn: document.getElementById('importJsonBtn'),
    importFileInput: document.getElementById('importFileInput'),
    openMenuBtn: document.getElementById('openMenuBtn'),
    menuModal: document.getElementById('menuModal'),
    closeMenuBtn: document.getElementById('closeMenuBtn'),
    menuOpenSettings: document.getElementById('menuOpenSettings'),
    menuOpenExport: document.getElementById('menuOpenExport'),
    earnModelModal: document.getElementById('earnModelModal'),
    earnModelClose: document.getElementById('earnModelClose'),
    earnModelPosList: document.getElementById('earnModelPosList'),
    earnModelNegList: document.getElementById('earnModelNegList'),
    earnModelAddPos: document.getElementById('earnModelAddPos'),
    earnModelAddNeg: document.getElementById('earnModelAddNeg'),
    actionEditModal: document.getElementById('actionEditModal'),
    actionTypeSeg: document.getElementById('actionTypeSeg'),
    actionLabelInput: document.getElementById('actionLabelInput'),
    actionIconInput: document.getElementById('actionIconInput'),
    actionEditCancel: document.getElementById('actionEditCancel'),
    actionEditSave: document.getElementById('actionEditSave'),
    emojiPicker: document.getElementById('emojiPicker'),
    openSettingsBtn: document.getElementById('openSettingsBtn'),
    settingsModal: document.getElementById('settingsModal'),
    dailyMaxInput: document.getElementById('dailyMaxInput'),
    cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    ruleMax: document.getElementById('ruleMax'),
    exportPdfBtn: document.getElementById('exportPdfBtn'),
    logSection: document.querySelector('.log-section'),
    statsSection: document.querySelector('.stats-section'),
    viewTabs: document.getElementById('viewTabs'),
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
      // Try IndexedDB via localForage first-time bootstrap
      if(LF){
        try{
          const fromIdb = window.__stb_bootstrap || null;
          if(!fromIdb){
            // synchronous fallback: attempt async fetch once and cache in window (best effort)
            LF.getItem(STORAGE_KEY).then(val => { if(val){ window.__stb_bootstrap = val; localStorage.setItem(STORAGE_KEY, JSON.stringify(val)); } }).catch(()=>{});
          }
          if(window.__stb_bootstrap){
            data = window.__stb_bootstrap;
          }
        }catch(e){ /* ignore */ }
      }
    }
    if(!data){
      const dailyMax = 18;
      data = {
        lastReset: todayKey,
        settings: { dailyMax },
        kids: Object.fromEntries(kids.map(k=>[k.id, defaultKidState(dailyMax)]))
      };
    } else {
      if(!data.settings) data.settings = { dailyMax: 18 };
      if(!data.settings.actions){
        data.settings.actions = {
          positive: defaultPositiveActions,
          negative: defaultNegativeActions,
        };
      }
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
    const json = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, json);
    if(LF){ try{ LF.setItem(STORAGE_KEY, data).catch(()=>{}); }catch(e){ /* ignore */ } }
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
        pushLog(k, 'pot-add', `+${over} naar spaarpot (eindoverschot)`, 'blue');
      }
      pushLog(k, 'daily-reset', `Dag reset naar ${MAX_POINTS} punten`, 'blue');
      k.points = MAX_POINTS;
      k.logs = k.logs.slice(0, LOG_LIMIT);
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
          <button class="btn secondary" data-action="use-pot" data-kid="${k.id}" title="Zet 1 punt uit de spaarpot in">
            <span class="big">🏦</span><span class="label">Gebruik 1 punt</span>
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
            ...getPositiveActions(data).map(a => btnHTML(a, 'primary', k.id)),
            ...getNegativeActions(data).map(a => btnHTML(a, 'negative', k.id)),
            addActionButtonHTML(k.id),
          ].join('')}
        </div>
      `;
      el.kidsGrid.appendChild(card);
    });

    // Logs tabs
    el.logTabs.innerHTML = kids.map((k,i)=>`<button class="tab ${i===0?'active':''}" data-tab="${k.id}">${k.name}</button>`).join('');
    renderLogs(data, kids[0].id);

    // Stats header
    if(el.statsTabs){
      el.statsTabs.innerHTML = kids.map((k,i)=>`<button class="tab ${i===0?'active':''}" data-tab="${k.id}">${k.name}</button>`).join('');
    }
    if(el.statsRange){
      // ensure exactly one active
      const active = el.statsRange.querySelector('.seg.active') || el.statsRange.querySelector('.seg');
      if(active){
        el.statsRange.querySelectorAll('.seg').forEach(b=>b.classList.remove('active'));
        active.classList.add('active');
      }
    }
    renderStats(data, kids[0].id, getActiveRange());

    bindEvents();
    syncDisableStates(data);
  }

  function btnHTML(a, theme, kid){
    return `<button class="btn ${theme}" data-action="${a.id}" data-delta="${a.delta}" data-kid="${kid}"><span class="big">${a.icon}</span><span class="label">${a.label}</span></button>`;
  }
  function addActionButtonHTML(kid){
    return `<button class="btn secondary" data-action="add-action" data-kid="${kid}" title="Voeg actie toe"><span class="big">➕</span><span class="label">Actie</span></button>`;
  }
  function getPositiveActions(data){
    return (data.settings?.actions?.positive && Array.isArray(data.settings.actions.positive) && data.settings.actions.positive.length>0)
      ? data.settings.actions.positive
      : defaultPositiveActions;
  }
  function getNegativeActions(data){
    return (data.settings?.actions?.negative && Array.isArray(data.settings.actions.negative) && data.settings.actions.negative.length>0)
      ? data.settings.actions.negative
      : defaultNegativeActions;
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
        if(action === 'add-action') return openActionEdit('positive');

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

    if(el.statsTabs && !el.statsTabs.dataset.stbBound){
      el.statsTabs.addEventListener('click', (e)=>{
        const t = e.target.closest('.tab');
        if(!t) return;
        el.statsTabs.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
        t.classList.add('active');
        const kidId = t.getAttribute('data-tab');
        renderStats(load(), kidId, getActiveRange());
      });
      el.statsTabs.dataset.stbBound = '1';
    }

    if(el.statsRange && !el.statsRange.dataset.stbBound){
      el.statsRange.addEventListener('click', (e)=>{
        const b = e.target.closest('.seg');
        if(!b) return;
        el.statsRange.querySelectorAll('.seg').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        const kidId = (el.statsTabs?.querySelector('.tab.active')?.getAttribute('data-tab')) || kids[0].id;
        renderStats(load(), kidId, getActiveRange());
      });
      el.statsRange.dataset.stbBound = '1';
    }

    if(el.viewTabs && !el.viewTabs.dataset.stbBound){
      el.viewTabs.addEventListener('click', (e)=>{
        const b = e.target.closest('.seg');
        if(!b) return;
        el.viewTabs.querySelectorAll('.seg').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        const view = b.getAttribute('data-view');
        if(view === 'stats'){
          if(el.logSection) el.logSection.hidden = true;
          if(el.statsSection) el.statsSection.hidden = false;
          // Ensure stats are up-to-date when switching
          const kidId = (el.statsTabs?.querySelector('.tab.active')?.getAttribute('data-tab')) || kids[0].id;
          renderStats(load(), kidId, getActiveRange());
        } else {
          if(el.statsSection) el.statsSection.hidden = true;
          if(el.logSection) el.logSection.hidden = false;
        }
      });
      el.viewTabs.dataset.stbBound = '1';
    }

    if(el.statsExportPdfBtn && !el.statsExportPdfBtn.dataset.stbBound){
      el.statsExportPdfBtn.addEventListener('click', ()=>{
        const kidId = (el.statsTabs?.querySelector('.tab.active')?.getAttribute('data-tab')) || kids[0].id;
        exportStatsToPDF(kidId, getActiveRange());
      });
      el.statsExportPdfBtn.dataset.stbBound = '1';
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
    if(el.openExportBtn && !el.openExportBtn.dataset.stbBound){
      el.openExportBtn.addEventListener('click', ()=>{
        if(el.exportModal) el.exportModal.hidden = false;
      });
      el.openExportBtn.dataset.stbBound = '1';
    }
    if(el.closeExportBtn && !el.closeExportBtn.dataset.stbBound){
      el.closeExportBtn.addEventListener('click', ()=>{
        if(el.exportModal) el.exportModal.hidden = true;
      });
      el.closeExportBtn.dataset.stbBound = '1';
    }
    if(el.exportModal && !el.exportModal.dataset.stbBackdrop){
      el.exportModal.addEventListener('click', (e)=>{
        if(e.target === el.exportModal){ el.exportModal.hidden = true; }
      });
      el.exportModal.dataset.stbBackdrop = '1';
    }
    if(!document.body.dataset.stbExportDelegation){
      document.addEventListener('click', (ev)=>{
        const btn = ev.target.closest && ev.target.closest('[data-export]');
        if(!btn) return;
        const kind = btn.getAttribute('data-export');
        const kidId = btn.getAttribute('data-kid');
        if(kind === 'logs' && kidId){ exportLogsToPDF(kidId); }
        if(kind === 'stats' && kidId){
          const range = el.exportStatsRange?.value || getActiveRange();
          exportStatsToPDF(kidId, range);
        }
      });
      document.body.dataset.stbExportDelegation = '1';
    }
    if(el.exportJsonBtn && !el.exportJsonBtn.dataset.stbBound){
      el.exportJsonBtn.addEventListener('click', ()=>{
        const data = load();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `schermtijd-buddy_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
      });
      el.exportJsonBtn.dataset.stbBound = '1';
    }
    if(el.importJsonBtn && !el.importJsonBtn.dataset.stbBound){
      el.importJsonBtn.addEventListener('click', ()=>{
        el.importFileInput && el.importFileInput.click();
      });
      el.importJsonBtn.dataset.stbBound = '1';
    }
    if(el.importFileInput && !el.importFileInput.dataset.stbBound){
      el.importFileInput.addEventListener('change', async (e)=>{
        const f = e.target.files && e.target.files[0];
        if(!f) return;
        try{
          const text = await f.text();
          const data = JSON.parse(text);
          if(!data || typeof data !== 'object') throw new Error('Ongeldige data');
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
          refresh();
          alert('Data geïmporteerd');
        }catch(err){
          alert('Import mislukt: ' + (err && err.message ? err.message : 'onbekende fout'));
        }finally{
          e.target.value = '';
        }
      });
      el.importFileInput.dataset.stbBound = '1';
    }
    if(el.exportPdfBtn && !el.exportPdfBtn.dataset.stbBound){
      el.exportPdfBtn.addEventListener('click', ()=>{
        const activeTab = document.querySelector('.log-tabs .tab.active');
        const kidId = activeTab ? activeTab.getAttribute('data-tab') : (kids[0]?.id);
        if(kidId) exportLogsToPDF(kidId);
      });
      el.exportPdfBtn.dataset.stbBound = '1';
    }

    if(el.openMenuBtn && !el.openMenuBtn.dataset.stbBound){
      el.openMenuBtn.addEventListener('click', ()=>{
        if(el.menuModal) el.menuModal.hidden = false;
      });
      el.openMenuBtn.dataset.stbBound = '1';
    }
    if(el.closeMenuBtn && !el.closeMenuBtn.dataset.stbBound){
      el.closeMenuBtn.addEventListener('click', ()=>{
        if(el.menuModal) el.menuModal.hidden = true;
      });
      el.closeMenuBtn.dataset.stbBound = '1';
    }
    if(el.menuModal && !el.menuModal.dataset.stbBackdrop){
      el.menuModal.addEventListener('click', (e)=>{
        if(e.target === el.menuModal){ el.menuModal.hidden = true; }
      });
      el.menuModal.dataset.stbBackdrop = '1';
    }
    if(el.menuOpenSettings && !el.menuOpenSettings.dataset.stbBound){
      el.menuOpenSettings.addEventListener('click', ()=>{
        if(el.menuModal) el.menuModal.hidden = true;
        openSettings();
      });
      el.menuOpenSettings.dataset.stbBound = '1';
    }
    // Open earn model settings from menu
    if(el.menuOpenExport && !el.menuOpenExport.dataset.stbBound){ /* existing */ }
    if(!document.getElementById('menuOpenEarnModel')){
      // augment menu with a button dynamically if not present in HTML
      const section = el.menuModal?.querySelector('.modal-body .section:last-child');
      if(section){
        const btn = document.createElement('button');
        btn.className = 'tab';
        btn.id = 'menuOpenEarnModel';
        btn.textContent = '⚙️ Instellingen verdienmodel';
        section.appendChild(btn);
        btn.addEventListener('click', ()=>{
          if(el.menuModal) el.menuModal.hidden = true;
          openEarnModel();
        });
      }
    }
    if(el.earnModelClose && !el.earnModelClose.dataset.stbBound){
      el.earnModelClose.addEventListener('click', ()=>{ if(el.earnModelModal) el.earnModelModal.hidden = true; });
      el.earnModelClose.dataset.stbBound = '1';
    }
    if(el.earnModelModal && !el.earnModelModal.dataset.stbBackdrop){
      el.earnModelModal.addEventListener('click', (e)=>{ if(e.target===el.earnModelModal){ el.earnModelModal.hidden = true; } });
      el.earnModelModal.dataset.stbBackdrop = '1';
    }
    if(el.earnModelAddPos && !el.earnModelAddPos.dataset.stbBound){
      el.earnModelAddPos.addEventListener('click', ()=> openActionEdit('positive'));
      el.earnModelAddPos.dataset.stbBound = '1';
    }
    if(el.earnModelAddNeg && !el.earnModelAddNeg.dataset.stbBound){
      el.earnModelAddNeg.addEventListener('click', ()=> openActionEdit('negative'));
      el.earnModelAddNeg.dataset.stbBound = '1';
    }
    if(el.actionEditCancel && !el.actionEditCancel.dataset.stbBound){
      el.actionEditCancel.addEventListener('click', ()=>{ if(el.actionEditModal) el.actionEditModal.hidden = true; });
      el.actionEditCancel.dataset.stbBound = '1';
    }
    if(el.actionEditModal && !el.actionEditModal.dataset.stbBackdrop){
      el.actionEditModal.addEventListener('click', (e)=>{ if(e.target===el.actionEditModal){ el.actionEditModal.hidden = true; } });
      el.actionEditModal.dataset.stbBackdrop = '1';
    }
    if(el.actionTypeSeg && !el.actionTypeSeg.dataset.stbBound){
      el.actionTypeSeg.addEventListener('click', (e)=>{
        const b = e.target.closest('.seg'); if(!b) return;
        el.actionTypeSeg.querySelectorAll('.seg').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
      });
      el.actionTypeSeg.dataset.stbBound = '1';
    }
    if(el.actionEditSave && !el.actionEditSave.dataset.stbBound){
      el.actionEditSave.addEventListener('click', saveActionEdit);
      el.actionEditSave.dataset.stbBound = '1';
    }
    if(el.emojiPicker && !el.emojiPicker.dataset.stbBound){
      el.emojiPicker.addEventListener('click', (e)=>{
        const b = e.target.closest('[data-emoji]');
        if(!b) return;
        const emoji = b.getAttribute('data-emoji');
        if(el.actionIconInput){ el.actionIconInput.value = emoji; }
        // visual feedback
        el.emojiPicker.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
      });
      el.emojiPicker.dataset.stbBound = '1';
    }
    if(el.menuOpenExport && !el.menuOpenExport.dataset.stbBound){
      el.menuOpenExport.addEventListener('click', ()=>{
        if(el.menuModal) el.menuModal.hidden = true;
        if(el.exportModal) el.exportModal.hidden = false;
      });
      el.menuOpenExport.dataset.stbBound = '1';
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

  function getActiveRange(){
    const r = el.statsRange?.querySelector('.seg.active')?.getAttribute('data-range');
    return r || 'week';
  }

  function renderStats(data, kidId, range){
    if(!el.statsGrid) return;
    const startTs = rangeStartTs(range);
    const counts = aggregateCounts(data, kidId, startTs);
    const pos = getPositiveActions(data).map(a=>{
      const series = sevenDaySeries(data, kidId, a.id);
      return statCard(a, 'plus', counts[a.id]||0, series);
    }).join('');
    const neg = getNegativeActions(data).map(a=>{
      const series = sevenDaySeries(data, kidId, a.id);
      return statCard(a, 'minus', counts[a.id]||0, series);
    }).join('');
    el.statsGrid.innerHTML = pos + neg;
  }

  function statCard(action, tone, count, series){
    const max = Math.max(1, ...series.map(x=>x.count));
    const bars = series.map(x=>{
      const h = x.count === 0 ? 4 : Math.max(6, Math.round((x.count/max)*30));
      const cls = x.count === 0 ? 'bar zero' : 'bar';
      return `<div class="${cls}" style="height:${h}px" title="${x.label}: ${x.count}"></div>`;
    }).join('');
    return `<div class="stat-card" title="${action.label}">
      <div class="stat-icon ${tone}">${action.icon}</div>
      <div class="stat-text">
        <div class="stat-title">${action.label}</div>
        <div class="mini-bars">${bars}</div>
      </div>
      <div class="stat-count">${count}</div>
    </div>`;
  }

  function aggregateCounts(data, kidId, startTs){
    const map = Object.create(null);
    const actionIds = new Set([...getPositiveActions(data), ...getNegativeActions(data)].map(a=>a.id));
    const logs = data.kids[kidId]?.logs || [];
    for(const l of logs){
      if(l.ts < startTs) continue;
      if(!actionIds.has(l.type)) continue;
      map[l.type] = (map[l.type]||0) + 1;
    }
    return map;
  }

  function rangeStartTs(range){
    const now = new Date();
    if(range === 'day'){
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return d.getTime();
    }
    if(range === 'week'){
      // Monday as start of week
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const day = (d.getDay()+6)%7; // 0..6, 0=Mon
      d.setDate(d.getDate() - day);
      d.setHours(0,0,0,0);
      return d.getTime();
    }
    if(range === 'month'){
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return d.getTime();
    }
    return 0;
  }

  function sevenDaySeries(data, kidId, actionId){
    const days = 7;
    const today = new Date();
    today.setHours(0,0,0,0);
    const series = [];
    for(let i=days-1; i>=0; i--){
      const d = new Date(today);
      d.setDate(d.getDate()-i);
      const k = dateKey(d);
      series.push({ key:k, label: k.split('-').reverse().join('-'), count:0 });
    }
    const startTs = new Date(today.getFullYear(), today.getMonth(), today.getDate()- (days-1)).getTime();
    const logs = data.kids[kidId]?.logs || [];
    for(const l of logs){
      if(l.type !== actionId) continue;
      if(l.ts < startTs) continue;
      const dk = dateKey(new Date(l.ts));
      const idx = series.findIndex(x=>x.key===dk);
      if(idx>=0) series[idx].count += 1;
    }
    return series;
  }

  function exportStatsToPDF(kidId, range){
    const data = load();
    const startTs = rangeStartTs(range);
    const endTs = Date.now();
    const kidName = kids.find(k=>k.id===kidId)?.name || kidId;
    const acts = [...positiveActions.map(a=>({ ...a, tone:'plus'})), ...negativeActions.map(a=>({ ...a, tone:'minus'}))];

    // Build day keys for range
    const startDate = new Date(startTs); startDate.setHours(0,0,0,0);
    const endDate = new Date(endTs); endDate.setHours(0,0,0,0);
    const days = [];
    for(let d=new Date(startDate); d<=endDate; d.setDate(d.getDate()+1)){
      days.push({ key: dateKey(d), label: d.toLocaleDateString('nl-NL', { day:'2-digit', month:'2-digit' }) });
    }

    // Aggregate totals and per-day counts
    const totals = Object.create(null);
    const byDayAction = new Map();
    const logs = data.kids[kidId]?.logs || [];
    for(const l of logs){
      if(l.ts < startTs || l.ts > endTs) continue;
      if(!acts.find(a=>a.id===l.type)) continue;
      totals[l.type] = (totals[l.type]||0) + 1;
      const dk = dateKey(new Date(l.ts));
      const key = dk + '|' + l.type;
      byDayAction.set(key, (byDayAction.get(key)||0) + 1);
    }

    // Totals table rows
    const totalRows = acts.map(a=>{
      const cnt = totals[a.id] || 0;
      return `<tr>
        <td class="a-icon">${a.icon}</td>
        <td class="a-label">${escapeHTML(a.label)}</td>
        <td class="a-tone ${a.tone}">${a.tone==='plus'?'➕':'➖'}</td>
        <td class="a-count">${cnt}</td>
      </tr>`;
    }).join('');

    // Per-day table header and rows
    const headCols = days.map(d=>`<th class="day">${escapeHTML(d.label)}</th>`).join('');
    const dayRows = acts.map(a=>{
      const cols = days.map(dk=>{
        const key = dk.key + '|' + a.id;
        const cnt = byDayAction.get(key) || 0;
        return `<td class="num">${cnt}</td>`;
      }).join('');
      return `<tr>
        <td class="a-icon">${a.icon}</td>
        <td class="a-label">${escapeHTML(a.label)}</td>
        ${cols}
      </tr>`;
    }).join('');

    const title = `Schermtijd Buddy — Statistieken ${escapeHTML(kidName)} (${rangeLabel(range)})`;
    const gen = new Date().toLocaleDateString('nl-NL', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });

    const html = `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body{ font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:#111; }
    h1{ margin:0 0 4px; font-size:20px }
    .subtitle{ color:#555; margin:0 0 10px; }
    h2{ margin:18px 0 6px; font-size:16px }
    table{ width:100%; border-collapse:collapse; }
    th, td{ border-bottom:1px solid #e6e6e6; padding:6px 6px; vertical-align:top; font-size:12px }
    th{ text-align:left; color:#444; font-weight:700; background:#fafafa }
    .a-icon{ width:18px; text-align:center }
    .a-label{ width:180px }
    .a-tone.plus{ color:#0a8f5b }
    .a-tone.minus{ color:#b22222 }
    .a-count, .num{ text-align:right; font-variant-numeric: tabular-nums }
    .day{ text-align:center; font-variant-numeric: tabular-nums }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="subtitle">Gegenereerd op ${escapeHTML(gen)}</div>

  <h2>Totals per actie</h2>
  <table>
    <thead>
      <tr><th></th><th>Actie</th><th>Type</th><th style="text-align:right">Aantal</th></tr>
    </thead>
    <tbody>
      ${totalRows}
    </tbody>
  </table>

  <h2>Per dag</h2>
  <table>
    <thead>
      <tr><th></th><th>Actie</th>${headCols}</tr>
    </thead>
    <tbody>
      ${dayRows}
    </tbody>
  </table>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 50); }</script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if(!w){ alert('Pop-up geblokkeerd. Sta pop-ups toe om te exporteren.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function rangeLabel(range){
    if(range==='day') return 'Dag';
    if(range==='week') return 'Week';
    if(range==='month') return 'Maand';
    return range;
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
    const def = [...getPositiveActions(load()), ...getNegativeActions(load())].find(a=>a.id===actionId);
    const label = def ? def.label : (isPlus?`+${delta}`:`${delta}`);

    pushLog(s, actionId, `${delta>0?'+':''}${delta} punt voor ${label}`, tone);
    s.logs = s.logs.slice(0, LOG_LIMIT);
    save(data);

    animateChange(kidId, before, s.points, isPlus);
    refreshCard(kidId, s);
    syncDisableStates(data);

    if(isPlus) toastSpark();
  }

  // --- Earn model management ---
  function openActionEdit(kind){
    if(!el.actionEditModal) return;
    // Default type selection
    if(el.actionTypeSeg){
      el.actionTypeSeg.querySelectorAll('.seg').forEach(x=>{
        const t = x.getAttribute('data-type');
        x.classList.toggle('active', t===kind);
      });
    }
    if(el.actionLabelInput) el.actionLabelInput.value = '';
    if(el.actionIconInput) el.actionIconInput.value = '';
    if(el.emojiPicker){ el.emojiPicker.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); }
    el.actionEditModal.hidden = false;
  }

  function saveActionEdit(){
    const kind = el.actionTypeSeg?.querySelector('.seg.active')?.getAttribute('data-type') || 'positive';
    const label = (el.actionLabelInput?.value || '').trim();
    const icon = (el.actionIconInput?.value || '').trim() || (kind==='positive'?'✅':'⚠️');
    if(!label) return;
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$|--+/g,'');
    const data = load();
    const exists = [...getPositiveActions(data), ...getNegativeActions(data)].some(a=>a.id===id);
    const finalId = exists ? (id + '-' + Math.random().toString(36).slice(2,6)) : id;
    const entry = { id: finalId, label, icon, delta: kind==='positive'?+1:-1 };
    if(kind==='positive') data.settings.actions.positive.unshift(entry);
    else data.settings.actions.negative.unshift(entry);
    save(data);
    if(el.actionEditModal) el.actionEditModal.hidden = true;
    openEarnModel();
    refresh();
  }

  function openEarnModel(){
    const data = load();
    // render lists
    if(el.earnModelPosList){
      el.earnModelPosList.innerHTML = getPositiveActions(data).map(a=>
        `<span class="pill">${a.icon} ${escapeHTML(a.label)} <span class="del" data-del-type="positive" data-del-id="${a.id}">✖</span></span>`
      ).join('');
    }
    if(el.earnModelNegList){
      el.earnModelNegList.innerHTML = getNegativeActions(data).map(a=>
        `<span class="pill">${a.icon} ${escapeHTML(a.label)} <span class="del" data-del-type="negative" data-del-id="${a.id}">✖</span></span>`
      ).join('');
    }
    // bind delete via delegation
    if(!document.body.dataset.stbEarnDel){
      document.addEventListener('click', (ev)=>{
        const del = ev.target.closest && ev.target.closest('.pill .del');
        if(!del) return;
        const dtype = del.getAttribute('data-del-type');
        const id = del.getAttribute('data-del-id');
        removeAction(dtype, id);
      });
      document.body.dataset.stbEarnDel = '1';
    }
    if(el.earnModelModal) el.earnModelModal.hidden = false;
  }

  function addAction(kind){
    const label = prompt(kind==='positive' ? 'Nieuwe verdien-actie naam:' : 'Nieuwe verlies-actie naam:');
    if(!label || !label.trim()) return;
    const icon = prompt('Emoji voor de actie (bijv. 📚, 🧹, ⚠️):') || (kind==='positive'?'✅':'⚠️');
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$|--+/g,'');
    const data = load();
    const exists = [...getPositiveActions(data), ...getNegativeActions(data)].some(a=>a.id===id);
    const finalId = exists ? (id + '-' + Math.random().toString(36).slice(2,6)) : id;
    const entry = { id: finalId, label: label.trim(), icon, delta: kind==='positive'?+1:-1 };
    if(kind==='positive') data.settings.actions.positive.unshift(entry);
    else data.settings.actions.negative.unshift(entry);
    save(data);
    openEarnModel(); // re-render
    refresh();
  }

  function removeAction(kind, id){
    const data = load();
    const arr = kind==='positive' ? data.settings.actions.positive : data.settings.actions.negative;
    const idx = arr.findIndex(a=>a.id===id);
    if(idx>=0){ arr.splice(idx,1); save(data); openEarnModel(); refresh(); }
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
    pushLog(s, 'pot-use', `+${take} uit spaarpot naar dagbalans`, 'blue');
    s.logs = s.logs.slice(0, LOG_LIMIT);

    save(data);
    coinFall(kidId);
    refreshCard(kidId, s);
    potPulse(kidId);
    syncDisableStates(data);
  }

  function handleSetMax(kidId){
    const data = load();
    const s = data.kids[kidId];
    const MAX_POINTS = data.settings?.dailyMax ?? 18;
    const before = s.points;

    // If above 18, do not auto-move to pot here; this is a simple clamp for the day (no pot change)
    s.points = MAX_POINTS;
    pushLog(s, 'set-max', `Dagbalans gezet op ${MAX_POINTS}`, 'blue');
    s.logs = s.logs.slice(0, LOG_LIMIT);

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
    const potEl = document.querySelector(`[data-pot="${kidId}"]`);
    if(pointsEl) pointsEl.textContent = s.points;
    if(minsEl) minsEl.textContent = s.points * MINUTES_PER_POINT;
    if(potEl) potEl.textContent = s.pot;

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
      pushLog(data.kids[id], 'settings', `Max punten per dag gewijzigd naar ${next}`, 'blue');
      data.kids[id].logs = data.kids[id].logs.slice(0, LOG_LIMIT);
    });
    save(data);
    closeSettings();
    buildUI(data);
  }

  // Prevent immediate duplicate log entries (e.g., double event binding)
  function pushLog(kidState, type, text, tone){
    const now = Date.now();
    const last = kidState.logs && kidState.logs[0];
    if(last && last.type === type && last.text === text && (now - last.ts) < 800){
      return; // ignore duplicate within 800ms
    }
    kidState.logs.unshift(makeLog(type, text, tone));
  }

  function potPulse(kidId){
    const amt = document.querySelector(`[data-pot="${kidId}"]`);
    if(!amt) return;
    amt.classList.remove('flash-blue');
    void amt.offsetWidth;
    amt.classList.add('flash-blue');
    setTimeout(()=>amt.classList.remove('flash-blue'), 650);
  }

  // --- Export PDF ---
  function exportLogsToPDF(kidId){
    const data = load();
    const kmeta = kids.find(k=>k.id===kidId);
    const name = kmeta ? kmeta.name : kidId;
    const logs = (data.kids[kidId]?.logs || []).slice();
    const today = new Date();
    const title = `Schermtijd Buddy — Logboek ${name}`;
    const dateStr = today.toLocaleDateString('nl-NL', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });

    // Build printable HTML
    const rows = logs.map(l=>{
      const dt = new Date(l.ts);
      const t = dt.toLocaleString('nl-NL', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
      const sym = l.tone==='plus'?'➕':l.tone==='minus'?'➖':'🏦';
      return `<tr>
        <td class="when">${t}</td>
        <td class="tone ${l.tone}">${sym}</td>
        <td class="text">${escapeHTML(l.text)}</td>
      </tr>`;
    }).join('');

    const html = `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body{ font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:#111; }
    h1{ margin:0 0 4px; font-size:20px }
    .subtitle{ color:#555; margin:0 0 12px; }
    table{ width:100%; border-collapse:collapse; }
    th, td{ border-bottom:1px solid #e6e6e6; padding:8px 6px; vertical-align:top; }
    th{ text-align:left; color:#444; font-weight:700; }
    .when{ white-space:nowrap; color:#333 }
    .tone.plus{ color:#0a8f5b }
    .tone.minus{ color:#b22222 }
    .tone.blue{ color:#0a63c7 }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="subtitle">Gegenereerd op ${escapeHTML(dateStr)}</div>
  <table>
    <thead>
      <tr><th>Wanneer</th><th>Type</th><th>Beschrijving</th></tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="3">Geen logitems</td></tr>'}
    </tbody>
  </table>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 50); }</script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if(!w){ alert('Pop-up geblokkeerd. Sta pop-ups toe om te exporteren.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function escapeHTML(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }

  // --- Boot ---
  refresh();
})();
