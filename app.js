(() => {
  const app = document.getElementById('app');
  const cfg = window.MONOPOLY_CONFIG;
  const charts = [];
  const fmt = n => new Intl.NumberFormat('ru-RU').format(Math.round(Number(n)||0));
  const money = n => `${fmt(n)} ₽`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const parseDate = value => {
    if (!value) return null;
    if (value instanceof Date) return value;
    const s=String(value).trim();
    const m=s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
    if(m) return new Date(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}T12:00:00+03:00`);
    const d=new Date(s); return isNaN(d)?null:d;
  };
  const inPeriod = d => d && d >= new Date(cfg.PERIOD_START+'T00:00:00+03:00') && d <= new Date(cfg.PERIOD_END+'T23:59:59+03:00');
  const num = v => { const n=Number(String(v??'').replace(/\s/g,'').replace(',','.')); return Number.isFinite(n)?n:0; };

  function jsonp(url, callbackParam='callback'){
    return new Promise((resolve,reject)=>{
      const cb=`mono_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const s=document.createElement('script'); const timer=setTimeout(()=>done(new Error('Истекло время ожидания данных')),18000);
      const done=(err,data)=>{clearTimeout(timer);delete window[cb];s.remove();err?reject(err):resolve(data)};
      window[cb]=data=>done(null,data); s.onerror=()=>done(new Error('Не удалось загрузить данные'));
      s.src=`${url}${url.includes('?')?'&':'?'}${callbackParam}=${cb}&t=${Date.now()}`;document.head.appendChild(s);
    });
  }
  function gviz(sheet){
    return new Promise((resolve,reject)=>{
      const callback=`monoGviz_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const token=`q_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script=document.createElement('script');
      const timer=setTimeout(()=>cleanup(new Error('Таблица не ответила')),18000);
      const cleanup=(err,data)=>{clearTimeout(timer);delete window[callback];script.remove();err?reject(err):resolve(data)};
      window[callback]=response=>cleanup(null,response);
      script.onerror=()=>cleanup(new Error('Нет доступа к Google Sheets. Откройте доступ «Все, у кого есть ссылка — читатель».'));
      script.src=`https://docs.google.com/spreadsheets/d/${cfg.SPREADSHEET_ID}/gviz/tq?sheet=${encodeURIComponent(sheet)}&headers=1&tqx=out:json;responseHandler:${callback}&cache=${token}`;
      document.head.appendChild(script);
    });
  }
  function rowsFromGviz(r){
    if(r.status!=='ok') throw new Error(r.errors?.[0]?.detailed_message||'Ошибка Google Sheets');
    const cols=r.table.cols.map(c=>c.label||c.id);return r.table.rows.map(row=>Object.fromEntries(cols.map((c,i)=>[c,row.c[i]?.v??''])));
  }
  function normalize(rows){
    return rows.map(r=>({date:r['Дата оплаты']||r['Дата']||'',manager:r['ФИО МПП']||'',amount:num(r['Сумма продажи']),product:r['Продукт продажи']||''}));
  }
  async function loadRaw(){
    if(cfg.API_URL) return jsonp(cfg.API_URL);
    const riv=await gviz(cfg.SHEETS.riviera);
    const gra=await gviz(cfg.SHEETS.grand);
    const ups=await gviz(cfg.SHEETS.upsells);
    return buildPayload(normalize(rowsFromGviz(riv)),normalize(rowsFromGviz(gra)),normalize(rowsFromGviz(ups)));
  }
  function validSale(r,upsell=false,legacyNoDates=false){
    const allowed=['МКБ','МОБ','РКЛ','Проверка гостей','iiko'];
    const dateOk=legacyNoDates ? true : inPeriod(parseDate(r.date));
    return dateOk && r.manager.trim() && r.amount>0 && (!upsell||allowed.includes(r.product.trim()));
  }
  function team(key,city,name,mission,rows,legacyNoDates){
    const valid=rows.filter(r=>validSale(r,false,legacyNoDates)); const fact=valid.reduce((s,r)=>s+r.amount,0); const base=mission/cfg.HOTEL_PRICE; const total=Math.floor(fact/cfg.HOTEL_PRICE);
    return {team_key:key,city_name:city,team_name:name,mission_amount:mission,fact_amount:fact,progress_percent:mission?fact/mission*100:0,remaining_amount:Math.max(mission-fact,0),overplan_amount:Math.max(fact-mission,0),sales_count:valid.length,base_hotels:base,purchased_hotels_base:Math.min(total,base),extra_hotels:Math.max(total-base,0),current_hotel_fill:(fact%cfg.HOTEL_PRICE)/cfg.HOTEL_PRICE};
  }
  function buildPayload(rivRows,graRows,upRows){
    const legacyNoDates=!rivRows.concat(graRows,upRows).some(r=>String(r.date||'').trim());
    const teams=[team('grand_city','Гранд-Сити','Команда Шкильнюка',2000000,graRows,legacyNoDates),team('riviera_city','Ривьера-Сити','Команда Китаевой',2500000,rivRows,legacyNoDates)];
    const totalFact=teams.reduce((s,t)=>s+t.fact_amount,0), totalMission=teams.reduce((s,t)=>s+t.mission_amount,0);
    const leader=teams[0].progress_percent===teams[1].progress_percent?null:[...teams].sort((a,b)=>b.progress_percent-a.progress_percent)[0];
    const ranking={}; upRows.filter(r=>validSale(r,true,legacyNoDates)).forEach(r=>{ranking[r.manager]??={manager:r.manager,upsell_amount:0,upsell_count:0};ranking[r.manager].upsell_amount+=r.amount;ranking[r.manager].upsell_count++});
    const manager_top=Object.values(ranking).sort((a,b)=>b.upsell_amount-a.upsell_amount||a.manager.localeCompare(b.manager,'ru')).slice(0,5).map((r,i)=>({...r,rank:i+1}));
    const products={}; [...graRows.filter(r=>validSale(r,false,legacyNoDates)).map(r=>({...r,key:'grand_city'})),...rivRows.filter(r=>validSale(r,false,legacyNoDates)).map(r=>({...r,key:'riviera_city'}))].forEach(r=>{const p=r.product||'Без продукта';products[p]??={product:p,amount_total:0,amount_grand_city:0,amount_riviera_city:0};products[p].amount_total+=r.amount;products[p]['amount_'+r.key]+=r.amount});
    const product_distribution=Object.values(products).sort((a,b)=>b.amount_total-a.amount_total).map(p=>({...p,share_percent:totalFact?p.amount_total/totalFact*100:0}));
    const all=[...rivRows,...graRows]; const errors=all.filter(r=>r.manager||r.amount||r.product||r.date).filter(r=>!validSale(r,false,legacyNoDates)).length + upRows.filter(r=>r.manager||r.amount||r.product||r.date).filter(r=>!validSale(r,true,legacyNoDates)).length;
    const warnings=[]; if(legacyNoDates) warnings.push('В таблице пока нет столбца «Дата оплаты»: временно учитываются все заполненные тестовые строки. Добавьте даты до старта игры.');
    return {meta:{game_title:'МОНОПОЛИЯ',subtitle:'Игровая механика для команд подключений',period_start:cfg.PERIOD_START,period_end:cfg.PERIOD_END,hotel_price:cfg.HOTEL_PRICE,generated_at:new Date().toISOString()},teams,overall:{total_mission:totalMission,total_fact:totalFact,total_progress_percent:totalFact/totalMission*100,total_remaining:Math.max(totalMission-totalFact,0),leader_team_key:leader?.team_key||null,leader_label:leader?.city_name||'Равенство'},manager_top,product_distribution,data_quality:{status:(errors||legacyNoDates)?'warning':'ok',error_count:errors,warnings:warnings.concat(errors?[`Строк вне периода или с незаполненными обязательными полями: ${errors}`]:[])}};
  }
  const dateRu=s=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(new Date(s+'T12:00:00+03:00'));
  function gauge(t){return `<div class="gauge" style="--p:${Math.min(t.progress_percent,100)}"><div class="gauge-content"><div class="progress-number">${t.progress_percent.toFixed(1).replace('.',',')}%</div><div class="gauge-caption">выполнение миссии</div></div></div>`}
  function cityCard(t,cls){return `<article class="card city-card ${cls}"><div class="city-kicker">${esc(t.team_name)}</div><div class="city-title">${esc(t.city_name)}</div><div class="team-name">Каждая оплата приближает город к полной покупке отелей</div><div class="gauge-wrap">${gauge(t)}</div><div class="city-stats"><div class="stat"><span>Миссия</span><strong>${money(t.mission_amount)}</strong></div><div class="stat"><span>Факт</span><strong>${money(t.fact_amount)}</strong></div><div class="stat"><span>Остаток</span><strong>${money(t.remaining_amount)}</strong></div><div class="stat"><span>Оплаченных продаж</span><strong>${fmt(t.sales_count)}</strong></div></div>${t.overplan_amount?`<div class="overplan">Перевыполнение: ${money(t.overplan_amount)}</div>`:''}</article>`}
  function hotelMap(teams){
    const t0=teams.find(t=>t.team_key==='grand_city'),t1=teams.find(t=>t.team_key==='riviera_city');
    const nodes=t=>Array.from({length:t.base_hotels},(_,i)=>{const bought=i<t.purchased_hotels_base, partial=i===t.purchased_hotels_base&&t.current_hotel_fill>0;return `<div class="hotel ${bought?'bought':''}" style="--accent:${t.team_key==='grand_city'?'var(--grand)':'var(--riviera)'};--accent-soft:${t.team_key==='grand_city'?'var(--grand-soft)':'var(--riviera-soft)'};--fill:${partial?t.current_hotel_fill*100:0}%" title="Отель ${i+1}: ${bought?'куплен':partial?'покупается':'ожидает'}"><span class="hotel-num">${i+1}</span><span class="hotel-icon">${bought?'🏨':partial?'🏗️':'◇'}</span></div>`}).join('');
    return `<article class="card map-card"><div class="map-head"><div><div class="eyebrow">Карта роста городов</div><h2>Покупка отелей</h2></div><div class="small">1 отель = ${money(cfg.HOTEL_PRICE)}</div></div><div><div class="small" style="margin-top:15px;color:var(--grand);font-weight:800">Гранд-Сити · ${t0.purchased_hotels_base}/${t0.base_hotels}</div><div class="hotel-map">${nodes(t0)}</div><div class="small" style="color:var(--riviera);font-weight:800">Ривьера-Сити · ${t1.purchased_hotels_base}/${t1.base_hotels}</div><div class="hotel-map">${nodes(t1)}</div></div><div class="map-legend"><span><i class="legend-dot" style="background:#eee"></i>ожидает</span><span><i class="legend-dot" style="background:#f3e6c9"></i>покупается</span><span><i class="legend-dot" style="background:#dceee7"></i>куплен</span>${t0.extra_hotels+t1.extra_hotels?`<span>Дополнительных отелей: ${t0.extra_hotels+t1.extra_hotels}</span>`:''}</div></article>`;
  }
  function render(data){
    charts.splice(0).forEach(c=>c.dispose()); const [grand,riv]=[data.teams.find(t=>t.team_key==='grand_city'),data.teams.find(t=>t.team_key==='riviera_city')];
    app.innerHTML=`<div class="dashboard"><section class="hero"><article class="card hero-main"><div><div class="eyebrow">Командная игровая механика</div><h1>МОНОПОЛИЯ</h1><p class="hero-copy">Два города осваивают собственный бюджет. Каждая оплаченная продажа приближает команду к покупке всех отелей.</p><div class="period">📅 ${dateRu(data.meta.period_start)} — ${dateRu(data.meta.period_end)}</div></div><div class="hero-mark">M</div></article><aside class="card update"><div class="update-row"><span class="status-dot"></span>Данные обновляются</div><div class="small">Последнее обновление</div><strong>${new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short',timeZone:cfg.TIMEZONE}).format(new Date(data.meta.generated_at))}</strong><button class="refresh-btn" id="refresh">Обновить сейчас</button></aside></section>
    <section class="summary-grid"><article class="card metric"><div class="metric-label">Общий бюджет</div><div class="metric-value">${money(data.overall.total_mission)}</div><div class="metric-sub">миссии двух городов</div></article><article class="card metric"><div class="metric-label">Освоено</div><div class="metric-value">${money(data.overall.total_fact)}</div><div class="metric-sub">все оплаты команд</div></article><article class="card metric"><div class="metric-label">Общее выполнение</div><div class="metric-value">${data.overall.total_progress_percent.toFixed(1).replace('.',',')}%</div><div class="metric-sub">по совокупному бюджету</div></article><article class="card metric"><div class="metric-label">Лидер</div><div class="metric-value leader-value">${esc(data.overall.leader_label)}</div><div class="metric-sub">по проценту своей миссии</div></article></section>
    <section class="cities">${cityCard(grand,'grand')}${hotelMap(data.teams)}${cityCard(riv,'riviera')}</section>
    <section class="lower-grid"><article class="card panel"><div class="section-head"><h2>Личный зачет</h2><span class="small">Топ-5 по допродажам</span></div><div class="ranking">${data.manager_top.length?data.manager_top.map(r=>`<div class="rank-row"><div class="rank">${r.rank}</div><div><div class="manager">${esc(r.manager)}</div><div class="manager-sub">${r.upsell_count} оплат</div></div><div class="rank-amount">${money(r.upsell_amount)}</div></div>`).join(''):'<div class="small">Пока нет валидных допродаж за период игры.</div>'}</div></article><article class="card panel"><div class="section-head"><h2>Продажи по продуктам</h2><span class="small">Суммы оплат двух команд</span></div><div id="productsChart" class="chart"></div></article><article class="card panel"><div class="section-head"><h2>Правила</h2></div><div class="rules"><div class="rule"><div class="rule-icon">1</div><div><strong>Одна строка — одна оплата</strong><p>В командный факт входит сумма каждой корректной строки на листе команды.</p></div></div><div class="rule"><div class="rule-icon">%</div><div><strong>Сравниваем выполнение</strong><p>Лидер определяется только по проценту выполнения собственной миссии.</p></div></div><div class="rule"><div class="rule-icon">🏨</div><div><strong>Покупаем отели</strong><p>Каждые ${money(cfg.HOTEL_PRICE)} открывают один отель. Перевыполнение показывается выше 100%.</p></div></div><div class="rule"><div class="rule-icon">★</div><div><strong>Личный рейтинг</strong><p>Считаются допродажи МКБ, МОБ, РКЛ, «Проверка гостей» и iiko.</p></div></div></div></article></section>
    <section class="card quality ${data.data_quality.status==='ok'?'ok':'warn'}"><strong>${data.data_quality.status==='ok'?'Контроль данных: ошибок не найдено':'Контроль данных: нужна проверка'}</strong><span>${data.data_quality.warnings?.length?esc(data.data_quality.warnings.join(' • ')):(data.data_quality.error_count?`Ошибочных строк: ${data.data_quality.error_count}`:'Все строки, попавшие в расчеты, заполнены корректно.')}</span></section></div>`;
    document.getElementById('refresh').onclick=load;
    drawProducts(data.product_distribution);
  }
  function drawProducts(rows){
    const el=document.getElementById('productsChart'); if(!window.echarts||!el){el.innerHTML='<div class="small">Диаграмма недоступна</div>';return}
    const chart=echarts.init(el);charts.push(chart);chart.setOption({animationDuration:550,grid:{left:8,right:18,top:8,bottom:12,containLabel:true},tooltip:{trigger:'axis',axisPointer:{type:'shadow'},valueFormatter:v=>money(v)},xAxis:{type:'value',axisLabel:{formatter:v=>`${Math.round(v/1000)} тыс.`},splitLine:{lineStyle:{color:'#eceae4'}}},yAxis:{type:'category',data:rows.map(r=>r.product).reverse(),axisTick:{show:false},axisLine:{show:false},axisLabel:{color:'#4f5b55'}},series:[{type:'bar',data:rows.map(r=>r.amount_total).reverse(),barMaxWidth:28,itemStyle:{color:'#aa7c2f',borderRadius:[0,7,7,0]}}]});window.addEventListener('resize',()=>chart.resize(),{once:true});
  }
  async function load(){
    if(!app.querySelector('.dashboard')) app.innerHTML='<div class="state-card"><div class="spinner"></div><h1>МОНОПОЛИЯ</h1><p>Загружаем данные из Google Sheets…</p></div>';
    try{render(await loadRaw())}catch(e){app.innerHTML=`<div class="state-card"><h1>Данные недоступны</h1><p>${esc(e.message)}</p><button class="refresh-btn" id="retry">Повторить</button><p class="small">Для прямого чтения таблицы включите доступ «Все, у кого есть ссылка — читатель». Альтернативно опубликуйте Apps Script из папки apps-script и укажите URL в config.js.</p></div>`;document.getElementById('retry').onclick=load}
  }
  load();setInterval(load,cfg.REFRESH_MS||300000);
})();
