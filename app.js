/* ============================================================
   АНИМИРОВАННЫЙ ФОН (топографические линии)
   ============================================================ */
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let W, H, time = 0;

function resizeCanvas(){
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// "Водоросли" — вертикальные плавные стебли, медленно покачивающиеся
const STRANDS = 16;
const strandsData = [];

function setupStrands(){
  strandsData.length = 0;
  for(let i=0;i<STRANDS;i++){
    strandsData.push({
      baseX: (W/STRANDS) * i + (W/STRANDS)/2 + (Math.random()*60-30),
      height: H*0.7 + Math.random()*H*0.5,
      sway1: 40 + Math.random()*40,
      sway2: 15 + Math.random()*20,
      freq1: 0.004 + Math.random()*0.003,
      freq2: 0.01 + Math.random()*0.006,
      speed: 0.15 + Math.random()*0.15,
      phase: Math.random()*Math.PI*2,
      width: 2 + Math.random()*2.5,
      alpha: 0.07 + Math.random()*0.10
    });
  }
}
setupStrands();
window.addEventListener('resize', setupStrands);

function drawBackground(){
  ctx.clearRect(0,0,W,H);

  strandsData.forEach(s=>{
    const segments = 40;
    const points = [];
    for(let j=0;j<=segments;j++){
      const t = j/segments; // 0 = низ, 1 = верх стебля
      const y = H - t*s.height;
      const sway = Math.sin(t*Math.PI*1.4 + time*s.speed + s.phase) * s.sway1 * t
                 + Math.sin(t*Math.PI*3 + time*s.speed*1.6 + s.phase*1.3) * s.sway2 * t;
      const x = s.baseX + sway;
      points.push({x,y});
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for(let j=1;j<points.length-1;j++){
      const xc = (points[j].x + points[j+1].x)/2;
      const yc = (points[j].y + points[j+1].y)/2;
      ctx.quadraticCurveTo(points[j].x, points[j].y, xc, yc);
    }
    ctx.strokeStyle = `rgba(255,255,255,${s.alpha})`;
    ctx.lineWidth = s.width;
    ctx.lineCap = 'round';
    ctx.stroke();
  });

  time += 0.5; // медленное движение
  requestAnimationFrame(drawBackground);
}
drawBackground();


/* ============================================================
   FIREBASE / СИНХРОНИЗАЦИЯ МЕЖДУ УСТРОЙСТВАМИ
   ============================================================ */
let firebaseApp, db, docRef, backupRef;
let currentSyncCode = null;
let syncReady = false;
let isApplyingRemoteUpdate = false;
let saveTimeout = null;

const defaultState = {
  totalDays: 19,
  totalAmount: 170,
  daysLeft: 19,
  baseRate: 170/19,
  dayBudget: 170/19,
  spentToday: 0,
  totalSpentAll: 0,
  daysPassed: 0,
  goalTarget: 5000,
  contributions: [],
  habits: [],
  cig: {
    price: 0,
    balance: 0,
    streak: 0,
    bestStreak: 0,
    cycleCount: 0
  }
};

let state = JSON.parse(JSON.stringify(defaultState));

const syncOverlay = document.getElementById('syncOverlay');
const syncCodeInput = document.getElementById('syncCodeInput');
const btnSyncConnect = document.getElementById('btnSyncConnect');
const syncStatus = document.getElementById('syncStatus');
const btnSyncStatus = document.getElementById('btnSyncStatus');

function initFirebase(){
  if(firebaseApp) return;
  firebaseApp = firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
}

function connectWithCode(code){
  initFirebase();
  currentSyncCode = code;
  docRef = db.collection('budgetApp').doc(code);
  backupRef = db.collection('budgetAppBackups').doc(code);
  localStorage.setItem('syncCode', code);

  docRef.onSnapshot(snap=>{
    if(snap.exists){
      isApplyingRemoteUpdate = true;
      state = { ...defaultState, ...snap.data() };
      renderExpenses();
      renderHabits();
      renderCig();
      isApplyingRemoteUpdate = false;
    } else {
      // документа ещё нет — создаём с текущим (стартовым) состоянием
      docRef.set(state);
    }
    syncReady = true;
    btnSyncStatus.textContent = '☁ ' + code;
    syncOverlay.classList.remove('show');
  }, err=>{
    syncStatus.textContent = 'Ошибка подключения: ' + err.message;
  });
}

function saveState(){
  if(isApplyingRemoteUpdate) return; // не отправляем то, что только что пришло из облака
  if(!docRef) return;
  docRef.set(state).catch(err=>{
    console.error('Ошибка сохранения в облако:', err);
  });
}

btnSyncConnect.addEventListener('click', ()=>{
  const code = syncCodeInput.value.trim();
  if(!code){ syncStatus.textContent = 'Введи код.'; return; }
  syncStatus.textContent = 'Подключаюсь...';
  connectWithCode(code);
});

btnSyncStatus.addEventListener('click', ()=>{
  syncCodeInput.value = localStorage.getItem('syncCode') || '';
  syncOverlay.classList.add('show');
});

// При загрузке: если код уже сохранён на этом устройстве — подключаемся автоматически
window.addEventListener('DOMContentLoaded', ()=>{
  const savedCode = localStorage.getItem('syncCode');
  if(savedCode){
    syncCodeInput.value = savedCode;
    connectWithCode(savedCode);
  } else {
    syncOverlay.classList.add('show');
  }
});


/* ============================================================
   НАВИГАЦИЯ ПО СТРАНИЦАМ
   ============================================================ */
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('page-'+btn.dataset.page).classList.add('active');
  });
});


/* ============================================================
   СТРАНИЦА «РАСХОДЫ»
   ============================================================ */
const inputDays = document.getElementById('inputDays');
const inputTotal = document.getElementById('inputTotal');
const btnApplyPlan = document.getElementById('btnApplyPlan');
const dayBudgetView = document.getElementById('dayBudgetView');
const inputSpentToday = document.getElementById('inputSpentToday');
const remainingTodayView = document.getElementById('remainingTodayView');
const btnEndDay = document.getElementById('btnEndDay');
const daysLeftView = document.getElementById('daysLeftView');
const daysRing = document.getElementById('daysRing');
const vbarMaxLabel = document.getElementById('vbarMaxLabel');
const vbarFill = document.getElementById('vbarFill');
const sumSpentView = document.getElementById('sumSpentView');
const sumRemainingView = document.getElementById('sumRemainingView');
const sumDaysPassedView = document.getElementById('sumDaysPassedView');
const sumGoalProgressView = document.getElementById('sumGoalProgressView');

const RING_CIRCUMFERENCE = 327; // 2*pi*52 (округлено), совпадает с CSS

function fmt(n){
  return Math.round(n*10)/10; // округление до 1 знака
}

function renderExpenses(){
  inputDays.value = state.totalDays;
  inputTotal.value = state.totalAmount;

  dayBudgetView.textContent = fmt(state.dayBudget) + ' ₽';
  remainingTodayView.textContent = fmt(state.dayBudget - state.spentToday) + ' ₽';

  daysLeftView.textContent = state.daysLeft;
  const daysRatio = state.totalDays > 0 ? state.daysLeft/state.totalDays : 0;
  daysRing.style.strokeDashoffset = RING_CIRCUMFERENCE * (1-daysRatio);

  vbarMaxLabel.textContent = state.totalDays;
  vbarFill.style.height = (daysRatio*100) + '%';

  sumSpentView.textContent = fmt(state.totalSpentAll) + ' ₽';
  const remainingAll = state.totalAmount - state.totalSpentAll;
  sumRemainingView.textContent = fmt(remainingAll) + ' ₽';
  sumDaysPassedView.textContent = state.daysPassed;

  renderGoal();
}

btnApplyPlan.addEventListener('click', ()=>{
  const days = parseFloat(inputDays.value) || 1;
  const total = parseFloat(inputTotal.value) || 0;
  state.totalDays = days;
  state.totalAmount = total;
  state.daysLeft = days;
  state.baseRate = total/days; // фиксированный лимит на день, не меняется до нового плана
  state.dayBudget = state.baseRate;
  state.spentToday = 0;
  state.totalSpentAll = 0;
  state.daysPassed = 0;
  saveState();
  renderExpenses();
});

const btnAddSpent = document.getElementById('btnAddSpent');

btnAddSpent.addEventListener('click', ()=>{
  const amount = parseFloat(inputSpentToday.value);
  if(!amount || amount<=0) return;
  state.spentToday += amount;
  inputSpentToday.value = '';
  saveState();
  renderExpenses();
});

btnEndDay.addEventListener('click', ()=>{
  if(state.daysLeft <= 0){
    alert('Дни закончились. Задайте новый план.');
    return;
  }
  const spent = state.spentToday;
  const leftover = state.dayBudget - spent;

  state.totalSpentAll += spent;
  state.daysPassed += 1;
  state.daysLeft -= 1;
  state.spentToday = 0;
  inputSpentToday.value = '';

  // Сумма на новый день = фиксированный дневной лимит (не меняется) + то,
  // что осталось/перерасходовано со вчера. Это растёт линейно, а не
  // в геометрической прогрессии, потому что лимит каждый раз один и тот же.
  if(state.daysLeft > 0){
    state.dayBudget = state.baseRate + leftover;
  } else {
    state.dayBudget = leftover;
  }

  saveState();
  renderExpenses();
});


/* ============================================================
   ГЛАВНАЯ ЦЕЛЬ + ПОПОЛНЕНИЯ
   ============================================================ */
const goalRing = document.getElementById('goalRing');
const goalTargetView = document.getElementById('goalTargetView');
const goalProgressText = document.getElementById('goalProgressText');
const inputGoalTarget = document.getElementById('inputGoalTarget');
const btnSetGoal = document.getElementById('btnSetGoal');
const contributionsList = document.getElementById('contributionsList');
const inputContribution = document.getElementById('inputContribution');
const btnAddContribution = document.getElementById('btnAddContribution');

function goalSaved(){
  return state.contributions.reduce((s,c)=>s+c.amount, 0);
}

function renderGoal(){
  const saved = goalSaved();
  const pct = state.goalTarget > 0 ? Math.min(100, (saved/state.goalTarget)*100) : 0;

  goalTargetView.textContent = state.goalTarget;
  goalProgressText.textContent = `${fmt(saved)} / ${state.goalTarget} € · ${Math.round(pct)}%`;
  goalRing.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - pct/100);
  sumGoalProgressView.textContent = Math.round(pct) + '%';

  contributionsList.innerHTML = '';
  if(state.contributions.length === 0){
    contributionsList.innerHTML = '<div class="list-empty">Пока нет пополнений</div>';
  } else {
    state.contributions.slice().reverse().forEach(c=>{
      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `<span>${c.date}</span><span class="amt">+${c.amount} €</span>`;
      contributionsList.appendChild(div);
    });
  }
}

btnSetGoal.addEventListener('click', ()=>{
  const val = parseFloat(inputGoalTarget.value);
  if(!val || val<=0) return;
  state.goalTarget = val;
  inputGoalTarget.value = '';
  saveState();
  renderGoal();
});

btnAddContribution.addEventListener('click', ()=>{
  const amount = parseFloat(inputContribution.value);
  if(!amount || amount<=0) return;
  const today = new Date();
  const dateStr = today.toLocaleDateString('ru-RU');
  state.contributions.push({date: dateStr, amount});
  inputContribution.value = '';
  saveState();
  renderGoal();
});


/* ============================================================
   СТРАНИЦА «ПРИВЫЧКИ»
   ============================================================ */
const habitsGrid = document.getElementById('habitsGrid');
const habitsRing = document.getElementById('habitsRing');
const habitsPercentView = document.getElementById('habitsPercentView');
const habitsTotalView = document.getElementById('habitsTotalView');
const habitsDoneView = document.getElementById('habitsDoneView');
const habitsMissedView = document.getElementById('habitsMissedView');
const habitsStreakView = document.getElementById('habitsStreakView');

const ICONS = {
  run: '🏃', book: '📖', meditate: '🧘', plan: '📋',
  gym: '🏋️', water: '💧', learn: '🎓', sun: '🌅'
};

function todayStr(){
  return new Date().toISOString().slice(0,10); // YYYY-MM-DD
}

function calcStreak(habit){
  let streak = 0;
  let d = new Date();
  while(true){
    const ds = d.toISOString().slice(0,10);
    if(habit.completedDates.includes(ds)){
      streak++;
      d.setDate(d.getDate()-1);
    } else {
      break;
    }
  }
  return streak;
}

let currentFilter = 'all';

function renderHabits(){
  const today = todayStr();
  habitsGrid.innerHTML = '';

  const filtered = state.habits.filter(h => currentFilter==='all' || h.time===currentFilter);

  if(filtered.length === 0){
    habitsGrid.innerHTML = '<div class="list-empty" style="grid-column:1/-1;">Нет привычек в этой категории. Добавьте новую ниже 👇</div>';
  }

  filtered.forEach(habit=>{
    const doneToday = habit.completedDates.includes(today);
    const streak = calcStreak(habit);
    const card = document.createElement('div');
    card.className = 'habit-card';

    const ratio = Math.min(1, streak/7);
    const offset = RING_CIRCUMFERENCE * (1-ratio);

    card.innerHTML = `
      <button class="habit-delete" data-id="${habit.id}" title="Удалить">✕</button>
      <div class="habit-card-head">
        <span>${habit.name}</span>
        <span class="habit-check ${doneToday?'done':''}" data-id="${habit.id}">${doneToday?'✓':''}</span>
      </div>
      <div class="habit-icon-ring">
        <svg viewBox="0 0 120 120">
          <circle class="ring-bg" cx="60" cy="60" r="52"></circle>
          <circle class="ring-fg" style="stroke-dasharray:${RING_CIRCUMFERENCE}; stroke-dashoffset:${offset}" cx="60" cy="60" r="52"></circle>
        </svg>
        <div class="habit-icon-symbol">${ICONS[habit.icon]||'⭐'}</div>
      </div>
      <div class="habit-streak ${streak===0?'zero':''}">${streak} ${streak===1?'день':'дня'} подряд</div>
      <div class="habit-sub">из 7</div>
      <div class="habit-meta">${habit.freq || 'Ежедневно'} · ${labelForTime(habit.time)}</div>
    `;
    habitsGrid.appendChild(card);
  });

  // обработчики чекбоксов и удаления
  habitsGrid.querySelectorAll('.habit-check').forEach(el=>{
    el.addEventListener('click', ()=>{
      const id = el.dataset.id;
      toggleHabitToday(id);
    });
  });
  habitsGrid.querySelectorAll('.habit-delete').forEach(el=>{
    el.addEventListener('click', ()=>{
      const id = el.dataset.id;
      if(confirm('Удалить эту привычку?')){
        state.habits = state.habits.filter(h=>h.id!==id);
        saveState();
        renderHabits();
        renderHabitsStats();
      }
    });
  });

  renderHabitsStats();
  renderCalendar();
}

function labelForTime(t){
  return {morning:'Утро', afternoon:'День', evening:'Вечер'}[t] || '';
}

function toggleHabitToday(id){
  const habit = state.habits.find(h=>h.id===id);
  if(!habit) return;
  const today = todayStr();
  const idx = habit.completedDates.indexOf(today);
  if(idx>=0) habit.completedDates.splice(idx,1);
  else habit.completedDates.push(today);
  saveState();
  renderHabits();
}

function renderHabitsStats(){
  const total = state.habits.length;
  const today = todayStr();
  const done = state.habits.filter(h=>h.completedDates.includes(today)).length;
  const missed = total - done;
  const pct = total>0 ? Math.round((done/total)*100) : 0;
  const bestStreak = state.habits.reduce((m,h)=>Math.max(m, calcStreak(h)), 0);

  habitsTotalView.textContent = total;
  habitsDoneView.textContent = done;
  habitsMissedView.textContent = missed;
  habitsStreakView.textContent = bestStreak;
  habitsPercentView.textContent = pct + '%';
  habitsRing.style.strokeDashoffset = RING_CIRCUMFERENCE * (1-pct/100);
}

document.querySelectorAll('.filter-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderHabits();
  });
});


/* ===== Модалка добавления привычки ===== */
const habitModalOverlay = document.getElementById('habitModalOverlay');
const btnAddHabit = document.getElementById('btnAddHabit');
const btnCancelHabit = document.getElementById('btnCancelHabit');
const btnSaveHabit = document.getElementById('btnSaveHabit');

btnAddHabit.addEventListener('click', ()=>{
  document.getElementById('habitName').value = '';
  document.getElementById('habitFreq').value = '';
  habitModalOverlay.classList.add('show');
});
btnCancelHabit.addEventListener('click', ()=>{
  habitModalOverlay.classList.remove('show');
});
btnSaveHabit.addEventListener('click', ()=>{
  const name = document.getElementById('habitName').value.trim();
  if(!name){ alert('Введите название привычки'); return; }
  const icon = document.getElementById('habitIcon').value;
  const time = document.getElementById('habitTime').value;
  const freq = document.getElementById('habitFreq').value.trim();

  state.habits.push({
    id: 'h_' + Date.now(),
    name, icon, time, freq,
    completedDates: [],
    created: todayStr()
  });
  saveState();
  habitModalOverlay.classList.remove('show');
  renderHabits();
});


/* ===== Календарь (визуальный, показывает текущий месяц) ===== */
let calDate = new Date();
const calMonthLabel = document.getElementById('calMonthLabel');
const calendarGrid = document.getElementById('calendarGrid');
const DOW = ['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'];
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

document.getElementById('calPrev').addEventListener('click', ()=>{
  calDate.setMonth(calDate.getMonth()-1);
  renderCalendar();
});
document.getElementById('calNext').addEventListener('click', ()=>{
  calDate.setMonth(calDate.getMonth()+1);
  renderCalendar();
});

function renderCalendar(){
  calMonthLabel.textContent = `${MONTHS[calDate.getMonth()]} ${calDate.getFullYear()}`;
  calendarGrid.innerHTML = '';
  DOW.forEach(d=>{
    const el = document.createElement('div');
    el.className = 'cal-dow';
    el.textContent = d;
    calendarGrid.appendChild(el);
  });

  const year = calDate.getFullYear();
  const month = calDate.getMonth();
  const firstDay = new Date(year, month, 1);
  let startOffset = firstDay.getDay() - 1; // ПН=0
  if(startOffset < 0) startOffset = 6;

  const daysInMonth = new Date(year, month+1, 0).getDate();
  const todayD = new Date();
  const isCurrentMonth = todayD.getFullYear()===year && todayD.getMonth()===month;

  for(let i=0;i<startOffset;i++){
    const el = document.createElement('div');
    el.className = 'cal-day out';
    calendarGrid.appendChild(el);
  }
  for(let d=1; d<=daysInMonth; d++){
    const el = document.createElement('div');
    el.className = 'cal-day' + (isCurrentMonth && d===todayD.getDate() ? ' today' : '');
    el.textContent = d;
    calendarGrid.appendChild(el);
  }
}


/* ============================================================
   СТРАНИЦА «ЭКОНОМИЯ НА СИГАРЕТАХ»
   ============================================================ */
const inputCigPrice = document.getElementById('inputCigPrice');
const btnSetCigPrice = document.getElementById('btnSetCigPrice');
const cigBalanceView = document.getElementById('cigBalanceView');
const cigBalanceSub = document.getElementById('cigBalanceSub');
const btnCigNotBought = document.getElementById('btnCigNotBought');
const btnCigClaim = document.getElementById('btnCigClaim');
const cigCycleText = document.getElementById('cigCycleText');
const cigStreakView = document.getElementById('cigStreakView');
const cigBestStreakView = document.getElementById('cigBestStreakView');
const cigRing = document.getElementById('cigRing');
const cigStreakRingView = document.getElementById('cigStreakRingView');

const CIG_GOAL_DAYS = 30;
const CIG_CYCLE_DAYS = 3;

function renderCig(){
  if(!state.cig) state.cig = {price:0, balance:0, streak:0, bestStreak:0, cycleCount:0};
  const cig = state.cig;
  if(cig.cycleCount === undefined) cig.cycleCount = 0;

  inputCigPrice.value = cig.price || '';

  cigBalanceView.textContent = fmt(cig.balance) + ' ₽';
  cigBalanceView.classList.remove('positive','negative');
  if(cig.balance > 0){ cigBalanceView.classList.add('positive'); cigBalanceSub.textContent = 'накоплено'; }
  else if(cig.balance < 0){ cigBalanceView.classList.add('negative'); cigBalanceSub.textContent = 'потрачено сверху'; }
  else { cigBalanceSub.textContent = 'накоплено / потрачено'; }

  cigStreakView.textContent = cig.streak + (cig.streak===1 ? ' день' : ' дней');
  cigBestStreakView.textContent = cig.bestStreak + (cig.bestStreak===1 ? ' день' : ' дней');
  cigStreakRingView.textContent = cig.streak;

  const ratio = Math.min(1, cig.streak / CIG_GOAL_DAYS);
  cigRing.style.strokeDashoffset = RING_CIRCUMFERENCE * (1-ratio);

  const cycleShown = Math.min(cig.cycleCount, CIG_CYCLE_DAYS);
  cigCycleText.textContent = `День ${cycleShown} из ${CIG_CYCLE_DAYS}`;
  btnCigClaim.disabled = cig.cycleCount < CIG_CYCLE_DAYS;
}

btnSetCigPrice.addEventListener('click', ()=>{
  const price = parseFloat(inputCigPrice.value) || 0;
  state.cig.price = price;
  saveState();
  renderCig();
});

btnCigNotBought.addEventListener('click', ()=>{
  state.cig.cycleCount += 1;
  state.cig.streak += 1;
  if(state.cig.streak > state.cig.bestStreak) state.cig.bestStreak = state.cig.streak;
  saveState();
  renderCig();
});

btnCigClaim.addEventListener('click', ()=>{
  if(state.cig.cycleCount < CIG_CYCLE_DAYS) return;
  const price = state.cig.price || 0;
  state.cig.balance += price;
  state.cig.cycleCount = 0;
  saveState();
  renderCig();
});


/* ============================================================
   СБРОС ВСЕГО ПРОГРЕССА (с защитой и автобэкапом)
   ============================================================ */
const btnResetAll = document.getElementById('btnResetAll');
const btnRestoreBackup = document.getElementById('btnRestoreBackup');
const CONFIRM_WORD = 'СБРОС';

btnRestoreBackup.addEventListener('click', async ()=>{
  if(!backupRef){ alert('Сначала подключись к синхронизации.'); return; }
  try{
    const snap = await backupRef.get();
    if(!snap.exists){
      alert('Резервной копии пока нет — она появится после первого сброса.');
      return;
    }
    const backup = snap.data();
    const sure = confirm(`Найден бэкап от ${backup.backupDate || 'неизвестной даты'}. Восстановить эти данные? Текущий прогресс будет заменён ими.`);
    if(!sure) return;
    delete backup.backupDate;
    state = { ...defaultState, ...backup };
    saveState();
    renderExpenses();
    renderHabits();
    renderCig();
    alert('Данные восстановлены из бэкапа.');
  }catch(e){
    alert('Не удалось получить резервную копию: ' + e.message);
  }
});

btnResetAll.addEventListener('click', async ()=>{
  const typed = prompt(
    `Это удалит ВСЁ: расходы, цель, привычки и счётчик сигарет.\n` +
    `Перед сбросом я автоматически сохраню резервную копию текущих данных.\n\n` +
    `Чтобы подтвердить, введи слово: ${CONFIRM_WORD}`
  );
  if(typed === null) return; // нажал "отмена"
  if(typed.trim().toUpperCase() !== CONFIRM_WORD){
    alert('Слово не совпало — сброс отменён, данные не тронуты.');
    return;
  }

  // автобэкап перед сбросом
  if(backupRef){
    try{
      await backupRef.set({
        ...state,
        backupDate: new Date().toLocaleString('ru-RU')
      });
    }catch(e){
      const cont = confirm('Не удалось сделать резервную копию (нет связи с облаком?). Всё равно сбросить?');
      if(!cont) return;
    }
  }

  state = JSON.parse(JSON.stringify(defaultState));
  inputSpentToday.value = 0;
  saveState();
  renderExpenses();
  renderHabits();
  renderCig();
  alert('Прогресс сброшен. Резервная копия предыдущих данных сохранена — если понадобится восстановить, напиши Claude.');
});


/* ============================================================
   ИНИЦИАЛИЗАЦИЯ (первичная отрисовка с дефолтными данными,
   пока не подключилась синхронизация)
   ============================================================ */
renderExpenses();
renderHabits();
renderCig();
