const CONFIG = {
  SPREADSHEET_ID: '15qvaEu69wIN5Y8N6G3rBCgg39xx3enL_1lTvxZniIHk',
  PERIOD_START: new Date('2026-07-20T00:00:00+03:00'),
  PERIOD_END: new Date('2026-08-31T23:59:59+03:00'),
  HOTEL_PRICE: 100000,
  SHEETS: { RIVIERA: 'Китаева', GRAND: 'Шкильнюк', UPSELLS: 'Допродажи' }
};
function doGet(e) {
  const payload = buildPayload_();
  const callback = e && e.parameter && e.parameter.callback ? String(e.parameter.callback).replace(/[^\w.$]/g, '') : '';
  return ContentService.createTextOutput(callback ? callback + '(' + JSON.stringify(payload) + ');' : JSON.stringify(payload))
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}
function buildPayload_(){
  const ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const riv=read_(ss.getSheetByName(CONFIG.SHEETS.RIVIERA));
  const gra=read_(ss.getSheetByName(CONFIG.SHEETS.GRAND));
  const ups=read_(ss.getSheetByName(CONFIG.SHEETS.UPSELLS));
  const teams=[team_('grand_city','Гранд-Сити','Команда Шкильнюка',2000000,gra),team_('riviera_city','Ривьера-Сити','Команда Китаевой',2500000,riv)];
  const totalMission=teams.reduce((s,t)=>s+t.mission_amount,0), totalFact=teams.reduce((s,t)=>s+t.fact_amount,0);
  const leader=teams[0].progress_percent===teams[1].progress_percent?null:teams.slice().sort((a,b)=>b.progress_percent-a.progress_percent)[0];
  const manager={}; ups.filter(r=>valid_(r,true)).forEach(r=>{manager[r.manager]=manager[r.manager]||{manager:r.manager,upsell_amount:0,upsell_count:0};manager[r.manager].upsell_amount+=r.amount;manager[r.manager].upsell_count++});
  const managerTop=Object.keys(manager).map(k=>manager[k]).sort((a,b)=>b.upsell_amount-a.upsell_amount||a.manager.localeCompare(b.manager)).slice(0,5).map((r,i)=>Object.assign({rank:i+1},r));
  const products={}; gra.filter(r=>valid_(r,false)).map(r=>Object.assign({key:'grand_city'},r)).concat(riv.filter(r=>valid_(r,false)).map(r=>Object.assign({key:'riviera_city'},r))).forEach(r=>{const p=r.product||'Без продукта';products[p]=products[p]||{product:p,amount_total:0,amount_grand_city:0,amount_riviera_city:0};products[p].amount_total+=r.amount;products[p]['amount_'+r.key]+=r.amount});
  const productDistribution=Object.keys(products).map(k=>products[k]).sort((a,b)=>b.amount_total-a.amount_total).map(p=>Object.assign(p,{share_percent:totalFact?p.amount_total/totalFact*100:0}));
  const errors=riv.concat(gra).filter(r=>r.hasData&&!valid_(r,false)).length+ups.filter(r=>r.hasData&&!valid_(r,true)).length;
  return {meta:{game_title:'МОНОПОЛИЯ',subtitle:'Игровая механика для команд подключений',period_start:'2026-07-20',period_end:'2026-08-31',timezone:'Europe/Moscow',hotel_price:CONFIG.HOTEL_PRICE,generated_at:new Date().toISOString()},teams:teams,overall:{total_mission:totalMission,total_fact:totalFact,total_progress_percent:totalFact/totalMission*100,total_remaining:Math.max(totalMission-totalFact,0),leader_team_key:leader?leader.team_key:null,leader_label:leader?leader.city_name:'Равенство'},manager_top:managerTop,product_distribution:productDistribution,data_quality:{status:errors?'warning':'ok',error_count:errors,warnings:errors?['Проверьте даты, ФИО, суммы и продукты.']:[]}};
}
function read_(sheet){if(!sheet)return[];const values=sheet.getDataRange().getValues();if(values.length<2)return[];const h=values[0].map(String);return values.slice(1).map(row=>{const o={};h.forEach((k,i)=>o[k]=row[i]);return {date:o['Дата оплаты']||o['Дата'],manager:String(o['ФИО МПП']||'').trim(),amount:Number(o['Сумма продажи'])||0,product:String(o['Продукт продажи']||'').trim(),hasData:row.some(v=>v!==''&&v!==null)};});}
function valid_(r,upsell){const d=r.date instanceof Date?r.date:new Date(r.date);const allowed=['МКБ','МОБ','РКЛ','РСП','Проверка гостей'];return d instanceof Date&&!isNaN(d)&&d>=CONFIG.PERIOD_START&&d<=CONFIG.PERIOD_END&&r.manager&&r.amount>0&&(!upsell||allowed.indexOf(r.product)>-1);}
function team_(key,city,name,mission,rows){const valid=rows.filter(r=>valid_(r,false));const fact=valid.reduce((s,r)=>s+r.amount,0);const base=mission/CONFIG.HOTEL_PRICE,total=Math.floor(fact/CONFIG.HOTEL_PRICE);return {team_key:key,city_name:city,team_name:name,mission_amount:mission,fact_amount:fact,progress_percent:mission?fact/mission*100:0,remaining_amount:Math.max(mission-fact,0),overplan_amount:Math.max(fact-mission,0),sales_count:valid.length,base_hotels:base,purchased_hotels_base:Math.min(total,base),extra_hotels:Math.max(total-base,0),current_hotel_fill:(fact%CONFIG.HOTEL_PRICE)/CONFIG.HOTEL_PRICE};}
