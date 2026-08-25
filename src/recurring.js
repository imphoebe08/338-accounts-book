import { collection, doc, getDocs, setDoc } from 'firebase/firestore';

const pad = (value) => String(value).padStart(2, '0');
const formatLocalDate = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const getMonthlyOccurrenceDate = (year, monthIndex, dayOfMonth) => {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return `${year}-${pad(monthIndex + 1)}-${pad(Math.min(dayOfMonth, lastDay))}`;
};

export const getOccurrenceId = (recurringId, date) =>
  `recurring_${recurringId}_${date.slice(0, 7)}`;

// 補齊所有已到期月份；固定文件 ID 讓多裝置同時執行也不會產生重複紀錄。
export async function materializeRecurringTransactions(db, templates, today = new Date()) {
  const tasks = [];

  templates.filter(template => template.active !== false).forEach(template => {
    const start = new Date(`${template.startDate}T00:00:00`);
    if (Number.isNaN(start.getTime())) return;

    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const finalMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    while (cursor <= finalMonth) {
      const occurrenceDate = getMonthlyOccurrenceDate(
        cursor.getFullYear(),
        cursor.getMonth(),
        template.dayOfMonth || start.getDate(),
      );

      if (occurrenceDate >= template.startDate && occurrenceDate <= formatLocalDate(today)) {
        tasks.push(setDoc(
          doc(db, 'transactions', getOccurrenceId(template.id, occurrenceDate)),
          {
            type: template.type,
            item: template.item,
            category: template.category,
            payer: template.payer,
            amount: template.amount,
            date: occurrenceDate,
            recurringId: template.id,
            isRecurringOccurrence: true,
          },
          { merge: true },
        ));
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  });

  await Promise.all(tasks);
}

export async function loadAndMaterializeRecurringTransactions(db) {
  const snapshot = await getDocs(collection(db, 'recurringTransactions'));
  const templates = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  await materializeRecurringTransactions(db, templates);
}
