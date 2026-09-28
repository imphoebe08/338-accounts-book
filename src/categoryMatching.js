export const EXPENSE_CATEGORY_ALIASES = {
  '伙食': '飲食', '購物': '生活', '日用品': '生活', '數位': '數位訂閱',
  '變漂漂': '打扮', '治裝費': '打扮', '學貸': '貸款', '露營': '娛樂',
  '淘寶': '生活', '旅遊': '娛樂', swift: '交通', switft: '交通'
};
export const INCOME_CATEGORY_ALIASES = {
  '發票中獎': '發票', '薪資': '薪水', '薪酬': '薪水', '獎金': '薪水',
  '年終獎金': '薪水', '退款': '其他', '回饋': '其他'
};
export const normalizeCategory = value => String(value || '').normalize('NFKC')
  .replace(/(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji_Modifier}|\uFE0E|\uFE0F|\u200D|\u200B|\s)/gu, '').toLowerCase();

export function matchCategory(value, categories) {
  if (categories.includes(value)) return value;
  const key = normalizeCategory(value);
  if (!key) return null;
  const matches = categories.filter(category => normalizeCategory(category) === key);
  return matches.length === 1 ? matches[0] : null;
}

export function resolveCategory(value, type, categories) {
  const key = normalizeCategory(value);
  const incomeTarget = type === 'income' ? INCOME_CATEGORY_ALIASES[key] : null;
  if (incomeTarget) return matchCategory(incomeTarget, categories);
  return matchCategory(value, categories)
    || matchCategory(EXPENSE_CATEGORY_ALIASES[key] || value, categories);
}
