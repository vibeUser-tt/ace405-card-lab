import { isEnglish } from './locale.ts';
import { pointStep, turnRules } from './model';

const rules = isEnglish ? {
    title: "How to play",
    steps: [
      `Each side starts with 40 point cards worth 220 points in total. Each round, recover ${turnRules.energy} stamina and draw from the mixed deck until you hold ${turnRules.hand} cards. Research can take your hand to ${turnRules.maxHand} cards. Keep unplayed cards between rounds. Played cards leave the game. While point cards remain in the deck, your refill guarantees at least one in hand. If you hold only action cards, swap a newly drawn one for a point card. If all were carried over, swap one at random.`,
      `One point card adjusts one parameter. Its rank is both its stamina cost and the amount added to your spend. Select a parameter on either design to preview both directions, then click Increase or Decrease to play. Each point moves the parameter by ${(pointStep * 100).toFixed(2)}% of its full range. You can counter any of the eight parameters. Each side gets a separate random assignment of suits, two slots per suit, fixed throughout the game. A card matching the target slot’s suit doubles the adjustment in either direction, even on a counter. The parameter limits and the card’s costs stay the same.`,
      "Glazing has three linked properties. Moving from A to B changes U-value from 0.90 to 1.80, solar heat gain from 50% to 60%, and visible transmittance from 70% to 75%. A higher slider position does not guarantee better performance.",
      "A shield costs 2 stamina and adds 2 to your spend. It secretly protects one parameter until it blocks a counter, even a doubled suit match. It lasts across rounds. A new shield replaces the old one without a refund.",
      "You pay the full point-card cost even if a shield blocks it or a parameter limit clips the adjustment to a smaller change or zero. Action cards add their listed cost. Your opponent’s spend is public only as costs are revealed. The final review counts all hidden costs.",
      "After both sides act, a design that meets both targets wins. If both qualify that round, lower total spend wins, followed by higher overall performance. If both sides exhaust their point cards before qualifying, the game ends in a draw."
    ],
    tip: "As you approach the targets, consider shielding a critical parameter. Your opponent can also double a counter by matching suits. Both designs are reviewed at the end of the round.",
    modelTitle: "How the building responds",
    model: "The curves are fitted to 256 simulated designs in Gothenburg. Each parameter affects daylight and energy use differently. Between simulated endpoints, the curves are teaching approximations. Play a card to reveal the effect on performance.",
    suits: "All suits can target any parameter. A suit match changes only the size of the adjustment. The mixed deck includes nine single-use action cards. You can draw duplicates, and the mix in your hand varies. Swapped cards return to the bottom of the deck. You choose the target for every counter and suit bonus."
  } : {
    title: "把资源用在值得的地方",
    steps: [
      `每人 40 张点数牌，共 220 点。每轮恢复 ${turnRules.energy} 体力，点数牌与功能牌混合随机补至 ${turnRules.hand} 张，检索后总手牌最多 ${turnRules.maxHand} 张。未用牌保留，已用牌不回收。牌库还有点数牌时，每轮补牌后至少有一张点数牌；全是功能牌时优先换回一张新补的功能牌，如果全部是保留牌则随机换回其中一张。点数牌耗尽后不再保底。`,
      `一张牌调整一个变量，点数等于体力与投入成本。点击任一方的参数，同时查看增减预览，再点击增加或减少直接出牌；每点移动可调范围的 ${(pointStep * 100).toFixed(2)}%。八个参数均可反制。双方每局各自独立随机分配槽位花色，各有四种花色、每种两个，整局固定。反制按对方目标槽位的花色匹配。牌与目标槽位同花时，增加或减少的调整量翻倍；体力和投入仍按牌面点数计算，边界不变。`,
      "玻璃在 A（U0.90／得热50%／透光70%）与 B（U1.80／得热60%／透光75%）之间三参数联动。归一化位置越高，不代表表现越好。",
      "防护消耗 2 体力、2 点投入。暗置保护一个参数，抵挡下一次对应攻击后消失，包括同花翻倍攻击，不按轮数失效。最多一层，新防护替换旧防护，投入不退。",
      "被防护、边界截断或没有变化，仍支付整张牌的投入。功能牌另付牌面投入。对手只显示已公开投入，最终评审包含所有隐藏支出。",
      "双方行动后评审：一方达标获胜；同轮双方达标比总投入，少者优先，再比综合表现。双方点数资源用尽仍未达标则平局重开。"
    ],
    tip: "接近达标时，注意保护关键参数：对手也会利用同花反制。双方行动仍在本轮结束后统一评审。",
    modelTitle: "从数据学习，允许探索",
    model: "曲线依据 Gothenburg 的 256 个仿真组合拟合。每个变量对采光、能耗的作用不同；中间区间曲率为教学近似，并非新运行的物理仿真。结果只在调整后揭晓。",
    suits: "任何花色都能打到任意参数，同花只增加调整幅度。另有 9 张功能牌，与点数牌混合补给，不固定数量，可抽到同名牌，不回收；换牌回到牌库底，保留资源。没有自动选择参数的干扰或翻倍牌。"
  };

export function Rules() {
  return <>
    <h2>{rules.title}</h2>
    <ol>{rules.steps.map(step => <li key={step}>{step}</li>)}</ol>
    <p>{rules.tip}</p>
    <h3>{rules.modelTitle}</h3>
    <p>{rules.model}</p>
    <p>{rules.suits}</p>
  </>;
}
