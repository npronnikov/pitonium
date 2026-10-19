import type { JsonValue, Mission } from '../contracts';
import type { ExecutionCase, TestCase } from '../runtime/contracts';
import { sourceMissions } from './catalog-data';
import { previewOf, returnTest, testCase } from './helpers';
import { sourceRefs } from './structure';

interface AuthoredMission {
  description: string; skillIds: string[]; starterCode: string; solutionCode: string;
  preview: ExecutionCase; tests: TestCase[];
}

const receiptTests = [[120, 3], [50, 1], [99, 0], [0, 5], [17, 12]].map(([price, quantity], i) =>
  returnTest(`m01-case-${i + 1}`, `Цена ${price}, количество ${quantity}`, 'receipt_total', [price, quantity], price * quantity));
const boxTests = [[0, 4], [1, 4], [8, 4], [9, 4], [101, 10]].map(([items, capacity], i) =>
  returnTest(`m02-case-${i + 1}`, `${items} предметов, вместимость ${capacity}`, 'shipping_boxes', [items, capacity], Math.ceil(items / capacity)));
const greetingTests = ['Аня', '  Пикс  ', '', '   ', 'Мария-Луиза'].map((name, i) =>
  returnTest(`m04-case-${i + 1}`, name.trim() ? `Имя «${name}»` : 'Пустое имя или только пробелы', 'greeting', [name], `Привет, ${name.trim() || 'гость'}!`));
const accessTests: [number, boolean][] = [[11, true], [12, true], [12, false], [18, false], [21, true]];
const workshopTests = accessTests.map(([age, has_pass], i) =>
  returnTest(`m07-case-${i + 1}`, `Возраст ${age}, пропуск ${has_pass ? 'есть' : 'отсутствует'}`, 'can_enter', [age, has_pass], age >= 12 && has_pass));
const savingsTests = [[0, 10], [1, 10], [5, 20], [4, 0], [3, 7]].map(([days, daily], i) =>
  returnTest(`m10-case-${i + 1}`, `${days} дней по ${daily}`, 'savings_by_day', [days, daily], Array.from({ length: days }, (_, day) => (day + 1) * daily)));
const shoppingInputs = ['', 'молоко\n', 'хлеб\nяблоки\nчай\n', '\n  рис  \n\nвода\n', 'чай\nчай\nкофе'];
const shoppingTests = shoppingInputs.map((content, i) => {
  const execution: ExecutionCase = { fixtures: { files: [{ path: 'shopping.txt', content, encoding: 'utf8' }] }, probe: { kind: 'call', functionName: 'shopping_list', args: ['shopping.txt'] } };
  return testCase(`m22-case-${i + 1}`, ['Пустой файл', 'Одна строка', 'Обычный список UTF-8', 'Пустые строки и пробелы', 'Повторяющиеся покупки'][i], execution, [
    { kind: 'returnEquals', expected: content.split(/\r?\n/).map(line => line.trim()).filter(Boolean) as JsonValue },
  ]);
});

const authored: Record<string, AuthoredMission> = {
  m01: {
    description: 'Напиши receipt_total(price, quantity): верни стоимость одинаковых товаров как произведение цены и количества. Оба входа — неотрицательные целые. При нулевом количестве итог равен 0. Пример: receipt_total(120, 3) → 360. Не печатай вместо return.',
    skillIds: ['py.data.variables', 'py.functions.return'],
    starterCode: 'def receipt_total(price, quantity):\n    return 0',
    solutionCode: 'def receipt_total(price, quantity):\n    return price * quantity',
    preview: previewOf(receiptTests[0]), tests: receiptTests,
  },
  m02: {
    description: 'Напиши shipping_boxes(items, capacity): верни минимальное число коробок для items предметов. Вместимость capacity — положительное целое, items — неотрицательное целое. Неполная коробка тоже считается. Примеры: (8,4) → 2, (9,4) → 3, (0,4) → 0.',
    skillIds: ['py.data.variables', 'py.functions.return'],
    starterCode: 'def shipping_boxes(items, capacity):\n    return items // capacity',
    solutionCode: 'def shipping_boxes(items, capacity):\n    return (items + capacity - 1) // capacity',
    preview: previewOf(boxTests[3]), tests: boxTests,
  },
  m04: {
    description: 'Напиши greeting(name): удали пробелы по краям имени и верни «Привет, ИМЯ!». Если после удаления пробелов имя пустое, используй «гость». Внутренние символы имени сохраняй. Пример: greeting("  Аня  ") → "Привет, Аня!".',
    skillIds: ['py.data.strings', 'py.flow.conditions', 'py.functions.return'],
    starterCode: 'def greeting(name):\n    return "Привет!"',
    solutionCode: 'def greeting(name):\n    clean_name = name.strip()\n    if not clean_name:\n        clean_name = "гость"\n    return f"Привет, {clean_name}!"',
    preview: previewOf(greetingTests[1]), tests: greetingTests,
  },
  m07: {
    description: 'Напиши can_enter(age, has_pass): верни True, только если возраст не меньше 12 и есть пропуск. Во всех остальных случаях верни False. age — целое неотрицательное число, has_pass — логическое значение. Граница 12 включена.',
    skillIds: ['py.flow.conditions', 'py.functions.return'],
    starterCode: 'def can_enter(age, has_pass):\n    return False',
    solutionCode: 'def can_enter(age, has_pass):\n    return age >= 12 and has_pass',
    preview: previewOf(workshopTests[1]), tests: workshopTests,
  },
  m10: {
    description: 'Напиши savings_by_day(days, daily): верни список накопленных сумм в конце каждого дня. Каждый день добавляется daily. Оба входа — неотрицательные целые. Пример: (3, 10) → [10, 20, 30]. Для days=0 верни пустой список; для daily=0 сохраняй нужное число нулей.',
    skillIds: ['py.flow.for_range', 'py.data.lists', 'py.functions.return'],
    starterCode: 'def savings_by_day(days, daily):\n    totals = []\n    # Накапливай сумму и добавляй итог каждого дня.\n    return totals',
    solutionCode: 'def savings_by_day(days, daily):\n    totals = []\n    total = 0\n    for day in range(days):\n        total += daily\n        totals.append(total)\n    return totals',
    preview: previewOf(savingsTests[2]), tests: savingsTests,
  },
  m22: {
    description: 'Напиши shopping_list(path): прочитай настоящий UTF-8 файл, удали пробелы по краям каждой строки и пропусти пустые строки. Верни список покупок в исходном порядке. Повторы сохраняй: две одинаковые строки означают две записи. Пустой файл должен дать []. В preview файл shopping.txt уже подготовлен.',
    skillIds: ['py.io.files', 'py.flow.for_range', 'py.data.lists'],
    starterCode: 'def shopping_list(path):\n    items = []\n    # Прочитай файл через with open(..., encoding="utf-8").\n    return items',
    solutionCode: 'def shopping_list(path):\n    items = []\n    with open(path, encoding="utf-8") as source:\n        for line in source:\n            item = line.strip()\n            if item:\n                items.append(item)\n    return items',
    preview: previewOf(shoppingTests[2]), tests: shoppingTests,
  },
};

export const missionSourceRefs = Object.fromEntries(sourceMissions.map(row => [row.id, sourceRefs(row.id, row.sourceText)]));

export const missions: Mission[] = sourceMissions.map(row => {
  const content = authored[row.id];
  return {
    ...row, ...(content ?? {}), sources: missionSourceRefs[row.id], available: Boolean(content),
    description: content?.description ?? 'Тема сохранена в исходном каталоге. Проверяемый практикум для этой миссии ещё не опубликован.',
    skillIds: content?.skillIds ?? [],
  };
});
