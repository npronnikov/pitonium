import type { CatalogLesson, SourceRef, Skill, World } from '../contracts';
import { sourceLessons } from './catalog-data';

export const readyLessonIds = [
  'u1-l1', 'u1-l2', 'u1-l3', 'u1-l4', 'u2-l1', 'u4-l2',
  'u5-l2', 'u6-l1', 'u8-l1', 'u20-l3',
] as const;
const readySet = new Set<string>(readyLessonIds);

export function sourceRefs(id: string, text: string): SourceRef[] {
  return text.split(';').map((part, index) => {
    const clause = part.trim();
    const isGaddis = clause.startsWith('Гэддис:');
    const topic = clause.replace(/^[^:]+:\s*/, '').replace(/,\s*с\.\s*.*$/, '');
    return {
      id: `${id}-${isGaddis ? 'gaddis' : 'matthes'}-${index + 1}`,
      book: isGaddis ? 'Т. Гэддис — Начинаем программировать на Python' : 'Э. Мэтиз — Изучаем Python',
      chapter: topic.match(/^Глав(?:а|ы)\s+[\d–,\sи]+/)?.[0].trim() ?? topic.split(':')[0],
      topic,
      pages: clause.match(/с\.\s*(.+)$/)?.[1],
      edition: isGaddis ? '5-е русское издание, БХВ-Петербург, 2022' : 'Питер, 2017',
      status: 'inherited-unverified',
    };
  });
}

const worldData = [
  ['starter-village', 'Деревня первых команд', 'Первый результат уже рядом', 'Запускай программы, собирай точные сообщения и учись замечать ошибки.', '#F7C65D'],
  ['ice-mountains', 'Ледяные горы', 'Дай данным имя', 'Переменные, числа и строки помогают описать мир понятными значениями.', '#5AD7E6'],
  ['desert-decisions', 'Песчаный мир решений', 'Выбирай путь по условию', 'Сравнивай значения и объясняй, почему программа выбирает одну из веток.', '#EDB763'],
  ['forest-loops', 'Лес циклов', 'Одна идея — много действий', 'Повторяй команды, перебирай данные и собирай их в удобные коллекции.', '#5AD7C7'],
  ['function-academy', 'Академия функций', 'Собери программу из частей', 'Функции, файлы, проверки и объекты делают решения понятными и надёжными.', '#A88AE8'],
  ['maker-city', 'Город создателей', 'Твой проект работает', 'Объединяй изученные идеи в самостоятельные программы с настоящими входными данными.', '#F7C65D'],
] as const;

export function worldForUnit(unit: number): string {
  return worldData[unit === 1 ? 0 : unit <= 3 ? 1 : unit === 4 ? 2 : unit <= 7 ? 3 : unit <= 14 ? 4 : 5][0];
}

export const worlds: World[] = worldData.map(([id, title, subtitle, description, accent], index) => ({
  id, slug: id, order: index + 1, title, subtitle, description, accent,
  lessonIds: sourceLessons.filter(row => worldForUnit(row.unit) === id).map(row => row.id),
  asset: `/assets/worlds/${id}/island.webp`,
  prerequisiteWorldId: index ? worldData[index - 1][0] : null,
}));

type SkillSeed = { id: string; title: string; description: string; prerequisites: string[]; unit: number; misconceptions: string[]; masteryCriteria: string[] };
const skillSeeds: SkillSeed[] = [
  { id: 'py.basics.print', title: 'Запуск и вывод', description: 'Запускает сценарий и объясняет порядок строк вывода.', prerequisites: [], unit: 1, misconceptions: ['Код и результат вывода — одно и то же.', 'Команды выполняются одновременно.'], masteryCriteria: ['Получает заданное сообщение через print.', 'Предсказывает порядок двух команд.'] },
  { id: 'py.basics.literals', title: 'Литералы и выражения', description: 'Различает текст в кавычках, число и арифметическое выражение.', prerequisites: ['py.basics.print'], unit: 1, misconceptions: ['Текст 2 + 3 в кавычках вычисляется.', 'Кавычки появляются в обычном выводе строки.'], masteryCriteria: ['Выводит текст и результат выражения.', 'Объясняет роль кавычек.'] },
  { id: 'py.basics.comments', title: 'Комментарии и исправления', description: 'Отделяет выполняемый код от пояснений и проверяет исправление запуском.', prerequisites: ['py.basics.print'], unit: 1, misconceptions: ['Комментарий выполняется.', 'Любая ошибка означает, что программа целиком бесполезна.'], masteryCriteria: ['Убирает лишний вывод без потери нужных строк.', 'Объясняет причину и результат исправления.'] },
  { id: 'py.data.variables', title: 'Имена и присваивание', description: 'Вычисляет новое значение из входных данных и сохраняет под понятным именем.', prerequisites: ['py.basics.literals'], unit: 2, misconceptions: ['Знак = проверяет равенство.', 'Ответ можно подставить постоянным числом для любых входов.'], masteryCriteria: ['Проходит проверки с несколькими наборами входов.', 'Объясняет, откуда получено значение.'] },
  { id: 'py.data.strings', title: 'Обработка строк', description: 'Использует индексы, срезы, методы и форматирование текста.', prerequisites: ['py.data.variables'], unit: 3, misconceptions: ['Индексация начинается с единицы.', 'Метод строки меняет её на месте.'], masteryCriteria: ['Обрабатывает пустую и непустую строку.', 'Выбирает понятный способ форматирования.'] },
  { id: 'py.flow.conditions', title: 'Условия и ветвления', description: 'Выбирает ровно одну подходящую ветку с учётом граничного значения.', prerequisites: ['py.data.variables'], unit: 4, misconceptions: ['else имеет своё условие.', 'Значение на границе не требует отдельной проверки.'], masteryCriteria: ['Проходит значения ниже, на и выше порога.', 'Объясняет порядок if/elif/else.'] },
  { id: 'py.flow.while', title: 'Повторение while', description: 'Повторяет действие, пока истинно условие, и обеспечивает завершение.', prerequisites: ['py.flow.conditions'], unit: 5, misconceptions: ['Условие while проверяют только один раз.', 'Состояние цикла можно не изменять.'], masteryCriteria: ['Объясняет условие остановки.', 'Обрабатывает ноль повторений.'] },
  { id: 'py.flow.for_range', title: 'Перебор for и range', description: 'Выполняет действие для каждого элемента и понимает исключённую верхнюю границу range(n).', prerequisites: ['py.data.variables', 'py.flow.conditions'], unit: 5, misconceptions: ['range(5) включает число 5.', 'Тело без отступа повторится.', 'Пять вручную записанных команд решают задачу для любого n.'], masteryCriteria: ['Проходит входы 0, 1 и 5.', 'Предсказывает количество событий.', 'Переносит обход с движения на список данных.'] },
  { id: 'py.flow.loop_control', title: 'Управление циклом', description: 'Различает остановку цикла и пропуск текущего шага.', prerequisites: ['py.flow.for_range', 'py.flow.while'], unit: 5, misconceptions: ['continue завершает весь цикл.'], masteryCriteria: ['Объясняет break и continue на трассировке.'] },
  { id: 'py.flow.nested_loops', title: 'Вложенные циклы', description: 'Объясняет повторение внутреннего цикла на каждом внешнем шаге.', prerequisites: ['py.flow.for_range'], unit: 5, misconceptions: ['Число шагов двух циклов нужно сложить.'], masteryCriteria: ['Предсказывает число пар и их порядок.'] },
  { id: 'py.data.lists', title: 'Элементы списка', description: 'Читает и меняет элементы списка, проверяя пустой вход.', prerequisites: ['py.flow.for_range'], unit: 6, misconceptions: ['Первый индекс равен 1.', 'Пустой список имеет элемент с индексом 0.'], masteryCriteria: ['Работает с пустым, одиночным и длинным списком.', 'Выбирает нужный индекс.'] },
  { id: 'py.data.collections', title: 'Коллекции и словари', description: 'Выбирает коллекцию по задаче, хранит связанные значения по ключу.', prerequisites: ['py.data.lists'], unit: 7, misconceptions: ['Порядок и уникальность одинаковы во всех коллекциях.'], masteryCriteria: ['Объясняет различия списка, множества и словаря.'] },
  { id: 'py.functions.return', title: 'Функция и результат', description: 'Выделяет повторяемое вычисление в функцию с параметрами и return.', prerequisites: ['py.data.variables', 'py.flow.conditions'], unit: 8, misconceptions: ['print заменяет return.', 'Функция вызывается в момент определения.'], masteryCriteria: ['Функция проходит разные аргументы.', 'Результат можно использовать дальше.'] },
  { id: 'py.data.aggregation', title: 'Итоги по данным', description: 'Считает сумму, среднее и границы с учётом пустого набора.', prerequisites: ['py.data.lists', 'py.functions.return'], unit: 9, misconceptions: ['Среднее пустого списка равно обычному делению.'], masteryCriteria: ['Проверяет пустой и граничный набор.'] },
  { id: 'py.errors.handling', title: 'Исключения и проверки', description: 'Читает ошибку и обрабатывает ожидаемые сбои в подходящем месте.', prerequisites: ['py.functions.return'], unit: 10, misconceptions: ['Нужно скрывать любые исключения.'], masteryCriteria: ['Различает причину ошибки и способ восстановления.'] },
  { id: 'py.io.files', title: 'Чтение и запись файлов', description: 'Работает с текстовым файлом через with и явно выбранную кодировку.', prerequisites: ['py.flow.for_range', 'py.data.strings'], unit: 11, misconceptions: ['Имя файла и его содержимое — одно значение.'], masteryCriteria: ['Читает пустой и обычный UTF-8 файл.', 'Проверяет сохранённый результат.'] },
  { id: 'py.structure.modules', title: 'Модули программы', description: 'Разделяет ответственность между функциями и модулями.', prerequisites: ['py.functions.return', 'py.io.files'], unit: 12, misconceptions: ['Любой импорт должен сразу запускать весь проект.'], masteryCriteria: ['Объясняет точку входа и ответственность модуля.'] },
  { id: 'py.objects.classes', title: 'Классы и состояние', description: 'Связывает состояние экземпляра и его методы.', prerequisites: ['py.functions.return', 'py.data.collections'], unit: 13, misconceptions: ['Все экземпляры обязаны разделять изменяемое состояние.'], masteryCriteria: ['Проверяет два независимых экземпляра.'] },
  { id: 'py.testing.contracts', title: 'Тесты и рекурсия', description: 'Проверяет договорённость функции и формулирует базовый случай.', prerequisites: ['py.errors.handling', 'py.functions.return'], unit: 14, misconceptions: ['Один обычный пример проверяет все границы.'], masteryCriteria: ['Выбирает обычный, пустой и граничный случай.'] },
  { id: 'py.projects.composition', title: 'Самостоятельная программа', description: 'Объединяет ввод, обработку и вывод в проверяемый проект.', prerequisites: ['py.structure.modules', 'py.testing.contracts'], unit: 15, misconceptions: ['Завершённость проекта определяется только внешним видом.'], masteryCriteria: ['Описывает вход, результат и критерии приёмки.'] },
  { id: 'py.functions.arguments', title: 'Контракт аргументов', description: 'Выбирает параметры и сохраняет данные локальными.', prerequisites: ['py.functions.return', 'py.data.lists'], unit: 16, misconceptions: ['Изменить переданный список всегда безопасно.'], masteryCriteria: ['Объясняет изменение исходных данных и копию.'] },
  { id: 'py.objects.protocol', title: 'Поведение объектов', description: 'Задаёт понятные методы и строковое представление экземпляра.', prerequisites: ['py.objects.classes'], unit: 17, misconceptions: ['Метод не связан с состоянием экземпляра.'], masteryCriteria: ['Проверяет состояние до и после вызова.'] },
  { id: 'py.io.resources', title: 'Ресурсы и записи', description: 'Обрабатывает текстовые записи и корректно закрывает ресурсы.', prerequisites: ['py.io.files', 'py.errors.handling'], unit: 18, misconceptions: ['Одна плохая запись обязательно отменяет весь импорт.'], masteryCriteria: ['Объясняет, какие записи приняты и отклонены.'] },
  { id: 'py.data.serialization', title: 'Надёжный формат данных', description: 'Выбирает формат и проверяет цикл сохранения и чтения.', prerequisites: ['py.data.collections', 'py.io.resources'], unit: 19, misconceptions: ['Любой текст можно безопасно разобрать одним split.'], masteryCriteria: ['Учитывает разделитель внутри значения.', 'Сравнивает структуру до и после сохранения.'] },
  { id: 'py.projects.event_report', title: 'Отчёт по журналу', description: 'Читает журнал событий, объясняет правила отбора и сохраняет проверяемый итог.', prerequisites: ['py.functions.return', 'py.flow.for_range', 'py.io.files'], unit: 20, misconceptions: ['Пустой файл не является входными данными.', 'Возврат нужно прибавлять как положительный расход.'], masteryCriteria: ['Обрабатывает пустой журнал.', 'Сохраняет отчёт и проходит проверки на возвращённые значения.'] },
];

export function skillIdsForLesson(id: string, unit: number): string[] {
  if (unit === 1) return id.endsWith('l1') ? ['py.basics.print'] : id.endsWith('l2') ? ['py.basics.literals'] : id.endsWith('l3') ? ['py.basics.comments'] : ['py.basics.print', 'py.basics.literals', 'py.basics.comments'];
  if (unit === 5) {
    const loops: Record<string, string> = { 'u5-l1': 'py.flow.while', 'u5-l2': 'py.flow.for_range', 'u5-l3': 'py.flow.loop_control', 'u5-l4': 'py.flow.nested_loops' };
    return [loops[id] ?? 'py.flow.for_range'];
  }
  return [skillSeeds.find(skill => skill.unit === unit)!.id];
}

export const catalog: CatalogLesson[] = sourceLessons.map(row => ({
  ...row, worldId: worldForUnit(row.unit), available: readySet.has(row.id),
  minutes: row.unit === 1 ? 8 : row.unit === 20 ? 25 : 14,
  skillIds: skillIdsForLesson(row.id, row.unit),
}));

export const skills: Skill[] = skillSeeds.map(({ unit, ...skill }) => ({
  ...skill,
  lessonIds: catalog.filter(lesson => lesson.skillIds.includes(skill.id)).map(lesson => lesson.id),
  sources: sourceRefs(`skill-${skill.id}`, sourceLessons.find(lesson => lesson.unit === unit)!.sourceText),
}));

export function getWorld(id: string): World | undefined {
  return worlds.find(world => world.id === id || world.slug === id || `w${world.order}` === id);
}
