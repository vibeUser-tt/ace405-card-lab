import { designs, levels, physical } from '../src/game.ts';
const count = (level, limits) => {
  const options = level.slots.map(slot => designs.filter(card => card.slot === slot));
  const totals = Array(7).fill(0);
  function visit(index, ids) {
    if (index === options.length) {
      const value = physical(ids);
      if (value.budget <= 100 && value.E <= limits.E && value.D >= limits.D && value.H <= limits.H && value.C <= limits.C) totals[ids.length]++;
      return;
    }
    visit(index + 1, ids);
    for (const card of options[index]) visit(index + 1, [...ids, card.id]);
  }
  visit(0, []);
  return totals;
};
for (const [index, candidates] of [
  [0, [
    { E: 120, D: 70, H: 180, C: 360 }, { E: 120, D: 70, H: 180, C: 380 },
    { E: 120, D: 70, H: 180, C: 400 },
  ]],
  [1, [
    { E: 80, D: 45, H: 160, C: 360 }, { E: 78, D: 50, H: 150, C: 350 },
    { E: 75, D: 50, H: 140, C: 345 }, { E: 80, D: 55, H: 140, C: 345 },
    { E: 75, D: 55, H: 140, C: 345 }, { E: 72, D: 55, H: 135, C: 340 },
  ]],
  [2, [
    { E: 95, D: 45, H: 180, C: 260 }, { E: 90, D: 50, H: 170, C: 250 },
    { E: 88, D: 50, H: 160, C: 250 }, { E: 85, D: 50, H: 150, C: 245 },
    { E: 88, D: 55, H: 150, C: 245 }, { E: 85, D: 55, H: 140, C: 240 },
  ]],
]) {
  console.log(levels[index].id);
  for (const limits of candidates) console.log(JSON.stringify({ limits, byCards: count(levels[index], limits) }));
}
