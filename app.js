/* ============================================================
   АНИМИРОВАННЫЙ ФОН (плавающие светлячки с зелёным блюром)
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

const ACCENT_RGB = '124,252,154'; // совпадает с --accent в style.css

const FIREFLIES_COUNT = 5;
let fireflies = [];

function setupFireflies(){
  fireflies = [];
  for(let i=0;i<FIREFLIES_COUNT;i++){
    fireflies.push({
      baseX: Math.random()*W,
      baseY: Math.random()*H,
      rangeX: 120 + Math.random()*180,
      rangeY: 100 + Math.random()*150,
      speedX: 0.15 + Math.random()*0.15,
      speedY: 0.12 + Math.random()*0.15,
      phaseX: Math.random()*Math.PI*2,
      phaseY: Math.random()*Math.PI*2,
      radius: 60 + Math.random()*70,
      coreSize: 3 + Math.random()*2,
      alpha: 0.35 + Math.random()*0.25,
      pulseSpeed: 0.3 + Math.random()*0.3,
      pulsePhase: Math.random()*Math.PI*2
    });
  }
}
setupFireflies();
window.addEventListener('resize', setupFireflies);

function drawBackground(){
  ctx.clearRect(0,0,W,H);

  fireflies.forEach(f=>{
    const x = f.baseX + Math.sin(time*f.speedX + f.phaseX) * f.rangeX;
    const y = f.baseY + Math.sin(time*f.speedY*1.3 + f.phaseY) * f.rangeY;
    const pulse = 0.75 + Math.sin(time*f.pulseSpeed + f.pulsePhase) * 0.25;
    const alpha = f.alpha * pulse;

    // большой мягкий блюр-ореол
    const glow = ctx.createRadialGradient(x, y, 0, x, y, f.radius);
    glow.addColorStop(0, `rgba(${ACCENT_RGB},${alpha})`);
    glow.addColorStop(0.4, `rgba(${ACCENT_RGB},${alpha*0.35})`);
    glow.addColorStop(1, `rgba(${ACCENT_RGB},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, f.radius, 0, Math.PI*2);
    ctx.fill();

    // яркая точка-ядро в центре
    ctx.beginPath();
    ctx.arc(x, y, f.coreSize, 0, Math.PI*2);
    ctx.fillStyle = `rgba(${ACCENT_RGB},${Math.min(1, alpha*2.2)})`;
    ctx.fill();
  });

  time += 0.01;
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
  planEndTimestamp: Date.now() + 19*24*60*60*1000,
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
const planTimerView = document.getElementById('planTimerView');

function updatePlanTimer(){
  if(!state.planEndTimestamp){ planTimerView.textContent = '—'; return; }
  let diff = state.planEndTimestamp - Date.now();
  if(diff < 0) diff = 0;

  const d = Math.floor(diff / (24*60*60*1000));
  const h = Math.floor((diff % (24*60*60*1000)) / (60*60*1000));
  const m = Math.floor((diff % (60*60*1000)) / (60*1000));
  const s = Math.floor((diff % (60*1000)) / 1000);

  planTimerView.textContent = `${d} д ${h} ч ${m} м ${s} с`;
}
setInterval(updatePlanTimer, 1000);
updatePlanTimer();

const sumSpentView = document.getElementById('sumSpentView');
const sumRemainingView = document.getElementById('sumRemainingView');
const sumDaysPassedView = document.getElementById('sumDaysPassedView');
const sumGoalProgressView = document.getElementById('sumGoalProgressView');

const RING_CIRCUMFERENCE = 327; // 2*pi*52 (округлено), совпадает с CSS

function fmt(n){
  return Math.round(n*100)/100; // округление до 2 знаков (копейки)
}

function parseNum(value){
  if(value === null || value === undefined) return NaN;
  return parseFloat(String(value).replace(',', '.'));
}

function renderExpenses(){
  inputDays.value = state.totalDays;
  inputTotal.value = state.totalAmount;

  dayBudgetView.textContent = fmt(state.dayBudget);
  remainingTodayView.textContent = fmt(state.dayBudget - state.spentToday);

  daysLeftView.textContent = state.daysLeft;
  const daysRatio = state.totalDays > 0 ? state.daysLeft/state.totalDays : 0;
  daysRing.style.strokeDashoffset = RING_CIRCUMFERENCE * (1-daysRatio);

  vbarMaxLabel.textContent = state.totalDays;
  vbarFill.style.height = (daysRatio*100) + '%';

  const spentIncludingToday = state.totalSpentAll + state.spentToday;
  sumSpentView.textContent = fmt(spentIncludingToday);
  const remainingAll = state.totalAmount - spentIncludingToday;
  sumRemainingView.textContent = fmt(remainingAll);
  sumDaysPassedView.textContent = state.daysPassed;

  renderGoal();
}

btnApplyPlan.addEventListener('click', ()=>{
  const days = parseNum(inputDays.value) || 1;
  const total = parseNum(inputTotal.value) || 0;
  state.totalDays = days;
  state.totalAmount = total;
  state.daysLeft = days;
  state.baseRate = total/days; // фиксированный лимит на день, не меняется до нового плана
  state.dayBudget = state.baseRate;
  state.planEndTimestamp = Date.now() + days*24*60*60*1000;
  state.spentToday = 0;
  state.totalSpentAll = 0;
  state.daysPassed = 0;
  saveState();
  renderExpenses();
});

const btnAddSpent = document.getElementById('btnAddSpent');

btnAddSpent.addEventListener('click', ()=>{
  const amount = parseNum(inputSpentToday.value);
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
  const val = parseNum(inputGoalTarget.value);
  if(!val || val<=0) return;
  state.goalTarget = val;
  inputGoalTarget.value = '';
  saveState();
  renderGoal();
});

btnAddContribution.addEventListener('click', ()=>{
  const amount = parseNum(inputContribution.value);
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

// Понедельник той недели, в которую попадает дата (ключ недели)
function weekKeyOf(dateInput){
  const d = new Date(dateInput);
  const dayIdx = (d.getDay() + 6) % 7; // 0 = понедельник
  d.setDate(d.getDate() - dayIdx);
  return d.toISOString().slice(0,10);
}

// Считаем, сколько раз привычка выполнена в каждой неделе,
// и сколько недель ПОДРЯД цель (weeklyTarget) была достигнута.
function calcWeeklyStats(habit){
  const target = habit.weeklyTarget || 7;
  const counts = {};
  habit.completedDates.forEach(ds=>{
    const wk = weekKeyOf(ds);
    counts[wk] = (counts[wk]||0) + 1;
  });

  const currentWeekKey = weekKeyOf(new Date());
  const currentWeekCount = counts[currentWeekKey] || 0;

  // серия в неделях: идём от последней ПОЛНОСТЬЮ завершённой недели назад,
  // пока цель выполняется. Текущая (ещё не закончившаяся) неделя не может
  // сломать серию — она только может добавить +1, если цель уже достигнута.
  let streakWeeks = 0;
  let cursor = new Date(currentWeekKey);
  cursor.setDate(cursor.getDate() - 7); // предыдущая неделя
  while(true){
    const wk = weekKeyOf(cursor);
    const count = counts[wk] || 0;
    if(count >= target){
      streakWeeks++;
      cursor.setDate(cursor.getDate() - 7);
    } else {
      break;
    }
  }
  if(currentWeekCount >= target) streakWeeks++;

  return { streakWeeks, currentWeekCount, target };
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
    const { streakWeeks, currentWeekCount, target } = calcWeeklyStats(habit);
    const card = document.createElement('div');
    card.className = 'habit-card';

    const ratio = Math.min(1, currentWeekCount/target);
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
      <div class="habit-streak ${streakWeeks===0?'zero':''}">${streakWeeks} ${streakWeeks===1?'неделя':'нед.'} подряд</div>
      <div class="habit-sub">${currentWeekCount} из ${target} на этой неделе</div>
      <div class="habit-meta">${target} раз/нед · ${labelForTime(habit.time)}</div>
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
  const bestStreak = state.habits.reduce((m,h)=>Math.max(m, calcWeeklyStats(h).streakWeeks), 0);

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
  document.getElementById('habitWeeklyTarget').value = '5';
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
  const weeklyTarget = parseInt(document.getElementById('habitWeeklyTarget').value, 10) || 7;

  state.habits.push({
    id: 'h_' + Date.now(),
    name, icon, time, weeklyTarget,
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

  cigBalanceView.textContent = fmt(cig.balance);
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
  const price = parseNum(inputCigPrice.value) || 0;
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

const btnCigRelapse = document.getElementById('btnCigRelapse');
btnCigRelapse.addEventListener('click', ()=>{
  const sure = confirm('Отметить срыв? Баланс, текущая серия и цикл сбросятся в 0. Лучшая серия и цена пачки останутся.');
  if(!sure) return;
  state.cig.balance = 0;
  state.cig.streak = 0;
  state.cig.cycleCount = 0;
  // state.cig.bestStreak и state.cig.price не трогаем
  saveState();
  renderCig();
});


/* ============================================================
   СБРОС ПРОГРЕССА ПО СТРАНИЦАМ (с защитой и автобэкапом)
   ============================================================ */
const btnResetExpenses = document.getElementById('btnResetExpenses');
const btnResetHabits = document.getElementById('btnResetHabits');
const btnResetCig = document.getElementById('btnResetCig');
const btnRestoreBackup = document.getElementById('btnRestoreBackup');
const CONFIRM_WORD = 'СБРОС';

btnRestoreBackup.addEventListener('click', async ()=>{
  if(!backupRef){ alert('Сначала подключись к синхронизации.'); return; }
  try{
    const snap = await backupRef.get();
    if(!snap.exists){
      alert('Резервной копии пока нет — она появится после первого сброса на любой странице.');
      return;
    }
    const backup = snap.data();
    const sure = confirm(`Найден бэкап от ${backup.backupDate || 'неизвестной даты'}. Восстановить ВСЕ данные из него? Текущий прогресс будет заменён.`);
    if(!sure) return;
    delete backup.backupDate;
    state = { ...defaultState, ...backup };
    saveState();
    renderExpenses();
    renderHabits();
    renderCig();
    alert('Все данные восстановлены из бэкапа.');
  }catch(e){
    alert('Не удалось получить резервную копию: ' + e.message);
  }
});

async function confirmAndBackup(message){
  const typed = prompt(
    `${message}\n` +
    `Перед сбросом я автоматически сохраню резервную копию текущих данных.\n\n` +
    `Чтобы подтвердить, введи слово: ${CONFIRM_WORD}`
  );
  if(typed === null) return false;
  if(typed.trim().toUpperCase() !== CONFIRM_WORD){
    alert('Слово не совпало — сброс отменён, данные не тронуты.');
    return false;
  }
  if(backupRef){
    try{
      await backupRef.set({ ...state, backupDate: new Date().toLocaleString('ru-RU') });
    }catch(e){
      const cont = confirm('Не удалось сделать резервную копию (нет связи с облаком?). Всё равно сбросить?');
      if(!cont) return false;
    }
  }
  return true;
}

btnResetExpenses.addEventListener('click', async ()=>{
  const ok = await confirmAndBackup('Это сбросит расходы, план и главную цель (но НЕ привычки и НЕ сигареты).');
  if(!ok) return;

  state.totalDays = defaultState.totalDays;
  state.totalAmount = defaultState.totalAmount;
  state.daysLeft = defaultState.totalDays;
  state.baseRate = defaultState.totalDays ? defaultState.totalAmount/defaultState.totalDays : 0;
  state.dayBudget = state.baseRate;
  state.spentToday = 0;
  state.totalSpentAll = 0;
  state.daysPassed = 0;
  state.goalTarget = defaultState.goalTarget;
  state.contributions = [];
  inputSpentToday.value = '';

  saveState();
  renderExpenses();
  alert('Расходы и цель сброшены.');
});

btnResetHabits.addEventListener('click', async ()=>{
  const ok = await confirmAndBackup('Это удалит ВСЕ привычки и их историю.');
  if(!ok) return;

  state.habits = [];
  saveState();
  renderHabits();
  alert('Привычки сброшены.');
});

btnResetCig.addEventListener('click', async ()=>{
  const ok = await confirmAndBackup('Это сбросит баланс, серию и цикл по сигаретам (цена пачки тоже сбросится).');
  if(!ok) return;

  state.cig = JSON.parse(JSON.stringify(defaultState.cig));
  saveState();
  renderCig();
  alert('Счётчик сигарет сброшен.');
});


/* ============================================================
   ИНИЦИАЛИЗАЦИЯ (первичная отрисовка с дефолтными данными,
   пока не подключилась синхронизация)
   ============================================================ */
renderExpenses();
renderHabits();
renderCig();
