const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
const context = { console };
vm.createContext(context);
vm.runInContext(source, context);

const sale = (date, amount = 100000) => ({ date, manager: 'Менеджер', amount });

{
  const rows = Array.from({ length: 18 }, () => sale('', 1000)).concat([sale('', 21311), sale('', 7596)]);
  const result = context.weeklyTeam_('grand_city', 'Команда', rows);
  assert.equal(result.fact_amount, 28907, 'Шкильнюк: факт должен считаться со строки 20');
}

{
  const rows = Array.from({ length: 34 }, () => sale('', 1000)).concat([sale('', 7381), sale('', 45205.2)]);
  const result = context.weeklyTeam_('riviera_city', 'Команда', rows);
  assert.equal(result.fact_amount, 52586.2, 'Китаева: факт должен считаться со строки 36');
}

{
  const rows = [sale('27.07.2026', 100000), sale('31.07.2026', 50000), sale('01.08.2026', 70000), sale('', 90000)];
  const result = context.weeklyTeam_('grand_city', 'Команда', rows);
  assert.equal(result.fact_amount, 150000, 'при наличии дат должен сохраняться фильтр недели');
}

{
  const upsell = { date: '', manager: 'Менеджер', amount: 27999, product: 'услуги по установки АПИ' };
  assert.equal(context.valid_(upsell, true), true, 'личный зачёт должен учитывать все модули без даты');
}

console.log('weekly mission tests passed');
