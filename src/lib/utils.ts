export function downloadFile(filename: string, contents: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(value)) : '—'; }
export const modeLabels = { child: 'Игрок', teen: 'Создатель', adult: 'Практик' } as const;
export const avatarLabels = { pix: 'Пикс', foxy: 'Фокси', byte: 'Байт', luna: 'Луна', quasi: 'Квази', nova: 'Нова' } as const;
export const emptyProgress = { xp: 0, level: 1, completedLessonIds: [], mastery: [], reviews: [], attempts: 0, storyFlags: [], badges: [], streak: 0, activeDays: [] };
