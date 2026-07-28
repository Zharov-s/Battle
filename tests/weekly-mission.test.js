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
  const result = context.weeklyTeam_('grand_city', 'Команда', [sale('', 100000), sale('', 50000)]);
  assert.equal(result.fact_amount, 150000, 'лист без дат должен передавать весь факт в недельную миссию');
}

{
  const rows = [sale('27.07.2026', 100000), sale('31.07.2026', 50000), sale('01.08.2026', 70000), sale('', 90000)];
  const result = context.weeklyTeam_('grand_city', 'Команда', rows);
  assert.equal(result.fact_amount, 150000, 'при наличии дат должен сохраняться фильтр недели');
}

console.log('weekly mission tests passed');
