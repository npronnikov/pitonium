import type { CatalogLesson, LessonCore, LearningMode, LessonVariant } from '../contracts';
import { catalog as structureCatalog, readyLessonIds, sourceRefs } from './structure';
import { introVariants } from './intro';
import { loopVariants } from './loops';
import { practiceVariants } from './practice';
import { projectVariants } from './project';

export { worlds, skills, getWorld } from './structure';
export { missions } from './missions';

const variants: Record<string, Record<LearningMode, LessonVariant>> = {
  ...introVariants,
  ...practiceVariants,
  'u5-l2': loopVariants,
  'u20-l3': projectVariants,
};

const objectives: Record<string, string> = {
  'u1-l1': 'Запустить сценарий и получить заданную строку через print.',
  'u1-l2': 'Различить строковый литерал и вычисляемое выражение, предсказать вывод.',
  'u1-l3': 'Отделить комментарий от исполняемой команды и проверить исправление.',
  'u1-l4': 'Самостоятельно собрать и проверить текстовую программу из нескольких строк.',
  'u2-l1': 'Вычислить значение из входных данных и сохранить его в переменную.',
  'u4-l2': 'Выбрать подходящую ветку if/elif/else и проверить граничные значения.',
  'u5-l2': 'Использовать for для обхода и объяснить число повторений range(n).',
  'u6-l1': 'Обратиться к нужному элементу списка, изменить данные и обработать пустой вход.',
  'u8-l1': 'Определить функцию с параметрами, вернуть результат и проверить разные вызовы.',
  'u20-l3': 'Прочитать журнал, обработать записи и сохранить проверяемый отчёт.',
};

export const lessons: LessonCore[] = readyLessonIds.filter(id => variants[id]).map(id => {
  const row = structureCatalog.find(lesson => lesson.id === id)!;
  const position = readyLessonIds.indexOf(id);
  return {
    id, title: row.title, worldId: row.worldId, unit: row.unit, order: row.order,
    objective: objectives[id], skillIds: row.skillIds,
    prerequisites: position ? [readyLessonIds[position - 1]] : [],
    minutes: row.minutes, xp: row.unit === 1 ? 40 : row.unit === 20 ? 150 : 80,
    contentVersion: '5.0.0', assessmentVersion: '1.0.0',
    sources: sourceRefs(id, row.sourceText), variants: variants[id],
  };
});

const authoredIds = new Set(lessons.map(lesson => lesson.id));
export const catalog: CatalogLesson[] = structureCatalog.map(row => ({ ...row, available: authoredIds.has(row.id) }));

export function normalizeLessonId(id: string): string {
  const match = id.trim().toLowerCase().match(/^u0*(\d+)-l0*(\d+)$/);
  return match ? `u${Number(match[1])}-l${Number(match[2])}` : id.trim().toLowerCase();
}
export function getLesson(id: string): LessonCore | undefined {
  const normalized = normalizeLessonId(id);
  return lessons.find(lesson => lesson.id === normalized);
}
