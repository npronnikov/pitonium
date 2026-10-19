import type { JsonValue, LearningMode, LessonVariant, Question, TheoryBlock } from '../contracts';
import type { TestCase } from '../runtime/contracts';
import { arenaFixture, callCase, makeVariant, previewOf, q, returnTest, robotFixture, scriptCase, testCase } from './helpers';

interface PracticeSpec {
  title: string; story: string; task: string; resultLabel: string;
  starterCode: string; exampleCode: string; solutionCode: string;
  application: string; predict: Question; hints: [string, string, string]; transfer: string;
  tests: TestCase[]; previewIndex?: number;
}
interface Pedagogy { theory: TheoryBlock[]; explain: Question; reflection: Question }

const pedagogy: Record<string, Pedagogy> = {
  'u2-l1': {
    theory: [
      { title: 'Дай вычислению имя', body: 'Присваивание связывает имя слева от = со значением справа. Сначала Python вычисляет правую часть, затем сохраняет результат. Имя помогает описать смысл значения и использовать его дальше.', code: 'left = 9 - 4\nprint(left)' },
      { title: 'Входы могут меняться', body: 'Задача передаёт исходные значения. Решение должно вычислять результат из них, а не записывать ответ для одного примера. Проверки подставляют несколько наборов данных, включая нулевые значения.' },
    ],
    explain: q('Что делает строка total = price * quantity?', ['Вычисляет произведение и связывает результат с именем total', 'Проверяет, равен ли total произведению', 'Заставляет price всегда быть равным quantity'], 0, 'Один знак = означает присваивание; сравнение на равенство используют иначе.'),
    reflection: q('Почему правильный результат одного запуска ещё не доказывает общее решение?', ['Постоянное число могло случайно совпасть с ответом', 'Переменные всегда случайны', 'Python не умеет повторный запуск'], 0, 'Разные входы проверяют, действительно ли результат вычисляется из данных.'),
  },
  'u4-l2': {
    theory: [
      { title: 'Выбери одну ветку', body: 'if проверяет первое условие. Если оно ложно, Python переходит к elif; если ни одно не подошло — к else. В одной цепочке выполняется только первая подходящая ветка.', code: 'if value > 0:\n    print("положительное")\nelif value < 0:\n    print("отрицательное")\nelse:\n    print("ноль")' },
      { title: 'Граница входит только по выбранному знаку', body: 'Знаки > и >= различаются на самом пороге. Поэтому проверяют значения ниже порога, ровно на нём и выше. Отступ показывает команды каждой ветки; else записывается без условия.' },
    ],
    explain: q('В цепочке if/elif/else первое условие уже истинно. Проверит ли программа следующие ветки этой цепочки?', ['Нет, выполнится первая подходящая ветка', 'Да, выполнятся все истинные ветки', 'Всегда выполнится ещё и else'], 0, 'Цепочка выбирает ровно одну ветку: первую, чьё условие оказалось истинным.'),
    reflection: q('Какой набор лучше проверяет условие value >= 5?', ['4, 5, 6', '10, 20, 30', 'Только 5'], 0, 'Значения по обе стороны порога и сам порог проверяют точную границу правила.'),
  },
  'u6-l1': {
    theory: [
      { title: 'Список хранит порядок', body: 'В квадратных скобках можно собрать несколько значений. Первый элемент имеет индекс 0, второй — 1. Индекс -1 означает последний элемент. Выбирай индекс по смыслу задачи.', code: 'items = [3, 1, 2]\nprint(items[0])\nprint(items[-1])' },
      { title: 'Пустому списку нужен отдельный путь', body: 'У [] нет ни первого, ни последнего элемента. Проверка if items: позволяет обращаться к элементу только при наличии данных. Присваивание items[0] = value заменяет первый элемент; items.copy() создаёт отдельный список.' },
    ],
    explain: q('Почему перед items[0] иногда пишут if items:?', ['Чтобы не обращаться к отсутствующему элементу пустого списка', 'Чтобы превратить первый индекс в 1', 'Чтобы отсортировать список'], 0, 'Пустой список считается ложным, поэтому опасное обращение можно пропустить.'),
    reflection: q('Какие входы помогут проверить работу с отдельным элементом списка?', ['Пустой, из одного элемента и из нескольких разных элементов', 'Только длинный список одинаковых значений', 'Только список из пяти элементов'], 0, 'Эти случаи показывают и безопасную границу, и правильный выбор индекса.'),
  },
  'u8-l1': {
    theory: [
      { title: 'Определить — ещё не вызвать', body: 'def описывает функцию и её параметры. Тело выполняется, когда функцию вызывают с аргументами. Один и тот же код можно применять к разным данным.', code: 'def double(value):\n    return value * 2\n\nresult = double(3)' },
      { title: 'return передаёт результат дальше', body: 'return завершает текущий вызов и возвращает значение. print только показывает текст. Если задача просит вернуть результат, одного print недостаточно. Проверки вызывают функцию с разными аргументами.' },
    ],
    explain: q('Чем return 5 отличается от print(5) внутри функции?', ['return передаёт число вызывающему коду, print только выводит его', 'Это полностью одинаковые команды', 'print возвращает число, return печатает его'], 0, 'Возвращённое значение можно сохранить, сравнить и передать другой функции.'),
    reflection: q('Как понять, что функция готова к повторному использованию?', ['Её параметры и результат понятны, разные вызовы проходят проверки', 'Её имя длиннее десяти букв', 'Внутри всегда находится print'], 0, 'Понятная договорённость и проверка нескольких входов позволяют использовать функцию в другом месте.'),
  },
};

function create(coreId: string, mode: LearningMode, spec: PracticeSpec): LessonVariant {
  const p = pedagogy[coreId];
  return makeVariant(coreId, mode, {
    ...spec,
    theory: [...p.theory, { title: 'В этой задаче', body: spec.application }],
    questions: [spec.predict, p.explain], reflection: p.reflection,
    hints: [...spec.hints, `Один из рабочих вариантов:\n${spec.solutionCode}\nСравни поведение на нескольких входах и объясни ключевую строку.`],
    preview: previewOf(spec.tests[spec.previewIndex ?? Math.min(1, spec.tests.length - 1)]),
  });
}

const variableChildTests = [[9, 4], [7, 0], [0, 0], [4, 4], [2, 5]].map(([charge, spent], i) =>
  testCase(`energy-${i}`, `Энергия ${charge}, потрачено ${spent}`, scriptCase({ charge, spent }, robotFixture()), [
    { kind: 'stdoutEquals', expected: `${charge - spent}\n` },
    { kind: 'eventsEqual', expected: [{ index: 1, type: 'actor.say', actorId: 'robot_1', payload: { text: String(charge - spent) } }] },
  ]));
const variableTeenTests = [[80, 20], [0, 0], [15, 0], [0, 25], [120, 30]].map(([base_points, bonus_points], i) =>
  testCase(`score-${i}`, `${base_points} базовых очков + ${bonus_points} бонусных`, scriptCase({ base_points, bonus_points }, arenaFixture), [
    { kind: 'stdoutEquals', expected: `${base_points + bonus_points}\n` },
    { kind: 'eventsEqual', expected: [{ index: 1, type: 'score.update', payload: { value: base_points + bonus_points } }] },
  ]));
const variableAdultTests = [[120, 3], [50, 1], [120, 0], [0, 8], [25, 12]].map(([unit_price, quantity], i) =>
  testCase(`line-${i}`, `Цена ${unit_price}, количество ${quantity}`, scriptCase({ unit_price, quantity }), [
    { kind: 'stdoutEquals', expected: `${unit_price * quantity}\n` },
  ]));

const variables: Record<LearningMode, LessonVariant> = {
  child: create('u2-l1', 'child', {
    title: 'Запас энергии Пикса', story: 'Перед дорожкой Пикс считает оставшийся заряд. Сцена сообщает начальный charge и уже потраченный spent. Пусть робот сам вычислит остаток и назовёт его.',
    task: 'Вычисли remaining = charge - spent, выведи remaining через print и передай его роботу командой game.say(str(remaining)). Не меняй входные charge и spent. Отрицательный остаток тоже нужно показать: он означает нехватку энергии.', resultLabel: 'Энергия на экране робота',
    starterCode: 'remaining = 0\nprint(remaining)\ngame.say(str(remaining))',
    exampleCode: 'energy = 8\nused = 3\nleft = energy - used\nprint(left)',
    solutionCode: 'remaining = charge - spent\nprint(remaining)\ngame.say(str(remaining))',
    application: 'charge и spent уже заданы сценой. remaining — новое имя для результата вычитания. str превращает это число в текст для речевого экрана; эта готовая строка служит отображению результата.',
    predict: q('У Пикса charge=9 и spent=4. Чему равен remaining?', ['5', '13', '4'], 0, 'Оставшийся заряд получается вычитанием: 9 − 4 = 5.'),
    hints: ['Найди строку, в которой remaining пока равен постоянному нулю.', 'Остаток — это начальный заряд минус потраченный. Используй имена входных значений.', 'После присваивания оставь print и game.say: они показывают один и тот же вычисленный остаток.'],
    transfer: 'Пикс собирает звёзды: известно collected и used. Придумай имя остатка и запиши выражение для него. Что получится, если все звёзды потрачены?', tests: variableChildTests, previewIndex: 0,
  }),
  teen: create('u2-l1', 'teen', {
    title: 'Базовые и бонусные очки', story: 'Арена выдаёт очки за действие и отдельный бонус. Нужно один раз вычислить общий счёт и отправить его игровому табло.',
    task: 'Вычисли points как сумму base_points и bonus_points. Выведи points через print и вызови game.score(points). Входные значения не перезаписывай.', resultLabel: 'Счёт арены',
    starterCode: 'points = 0\nprint(points)\ngame.score(points)',
    exampleCode: 'base = 30\nbonus = 10\nscore = base + bonus\nprint(score)',
    solutionCode: 'points = base_points + bonus_points\nprint(points)\ngame.score(points)',
    application: 'Вычисление хранится в points и используется дважды: для текстового вывода и для события игрового табло. Так значение не приходится повторно вычислять в каждой команде.',
    predict: q('base_points=80, bonus_points=20. Какое значение нужно передать game.score?', ['100', '80', '20'], 0, 'Табло получает сумму двух частей: 80 + 20 = 100.'),
    hints: ['Исправь вычисление в первой строке; команды вывода уже используют points.', 'Общий счёт состоит из base_points плюс bonus_points.', 'Проверь случай, когда бонус равен нулю: базовые очки должны сохраниться.'],
    transfer: 'Добавь в черновике штраф penalty. Как изменится формула итоговых очков? Предскажи результат для 80 базовых, 20 бонусных и штрафа 15.', tests: variableTeenTests, previewIndex: 0,
  }),
  adult: create('u2-l1', 'adult', {
    title: 'Стоимость позиции отчёта', story: 'В отчёте указаны цена единицы unit_price и количество quantity. Вычисление должно работать для разных позиций, в том числе с нулевым количеством.',
    task: 'Сохрани произведение unit_price и quantity в переменную total и выведи total. Входы заданы заранее. Цены и количества в этой задаче — целые неотрицательные числа.', resultLabel: 'Сумма позиции',
    starterCode: 'total = 0\nprint(total)',
    exampleCode: 'price = 45\ncount = 4\namount = price * count\nprint(amount)',
    solutionCode: 'total = unit_price * quantity\nprint(total)',
    application: 'Название total описывает стоимость всей позиции. Для quantity=0 произведение должно быть нулём, независимо от цены. Это удобная проверка того, что используется количество, а не готовый ответ.',
    predict: q('unit_price=120, quantity=3. Какой итог нужен?', ['360', '123', '120'], 0, 'Стоимость позиции равна 120 × 3 = 360.'),
    hints: ['В total пока записан фиксированный ноль. Замени его выражением из входов.', 'Полная стоимость — цена единицы, умноженная на количество.', 'Используй оператор * и оставь print(total) для вывода результата.'],
    transfer: 'В другой таблице известны hours и hourly_rate. Запишите выражение стоимости работы и продумайте случай hours=0.', tests: variableAdultTests, previewIndex: 0,
  }),
};

const conditionChildTests = [0, 1, 2, 4, 5, 8].map(charge => {
  const moves = charge >= 5 ? 2 : charge >= 2 ? 1 : 0;
  return testCase(`charge-${charge}`, `Заряд ${charge}: ${moves} шага`, scriptCase({ charge }, { ...robotFixture(2), goal: { x: moves, y: 0 } }), [
    { kind: 'eventsEqual', expected: moves ? Array.from({ length: moves }, (_, index) => ({ index: index + 1, type: 'actor.move' as const, actorId: 'robot_1', payload: { dx: 1, dy: 0 } })) : [{ index: 1, type: 'actor.say', actorId: 'robot_1', payload: { text: 'Подзарядка' } }] },
    { kind: 'robotPositionEquals', expected: { x: moves, y: 0 } },
  ]);
});
const conditionTeenTests = [0, 49, 50, 99, 100, 150].map(points => {
  const kind = points < 50 ? 'slime-amber' : points < 100 ? 'slime-blue' : 'slime-violet';
  return testCase(`points-${points}`, `Очки ${points}: подходящий тип противника`, scriptCase({ points }, arenaFixture), [
    { kind: 'eventsEqual', expected: [{ index: 1, type: 'enemy.spawn', payload: { kind, x: 240, y: 160 } }] },
    { kind: 'stdoutEquals', expected: `${kind}\n` },
  ]);
});
const conditionAdultTests = [-500, -1, 0, 1, 500].map(amount => returnTest(`amount-${amount}`, `Операция ${amount}`, 'classify', [amount], amount > 0 ? 'расход' : amount < 0 ? 'возврат' : 'без движения'));

const conditions: Record<LearningMode, LessonVariant> = {
  child: create('u4-l2', 'child', {
    title: 'Хватит ли заряда на мост?', story: 'Пикс выбирает длину перехода по заряду. Большой запас позволяет пройти две клетки, небольшой — одну, а без достаточного заряда лучше подождать.',
    task: 'Если charge >= 5, вызови game.move(1) два раза. Иначе, если charge >= 2, сделай один шаг. Иначе вызови game.say("Подзарядка"). Используй одну цепочку if/elif/else.', resultLabel: 'Выбранный путь робота',
    starterCode: 'if charge >= 5:\n    pass\nelif charge >= 2:\n    pass\nelse:\n    game.say("Подзарядка")',
    exampleCode: 'if 7 >= 5:\n    game.say("Можно идти")\nelse:\n    game.say("Подождём")',
    solutionCode: 'if charge >= 5:\n    game.move(1)\n    game.move(1)\nelif charge >= 2:\n    game.move(1)\nelse:\n    game.say("Подзарядка")',
    application: 'Проверка большого порога идёт первой. Заряд 5 подходит сразу к ней, а заряд 2 — только ко второй ветке. Поле имеет две клетки пути; лишнее движение обнаружится проверкой позиции.',
    predict: q('charge равен ровно 5. Сколько шагов должен сделать Пикс?', ['Два', 'Один', 'Ни одного'], 0, 'Знак >= включает границу, поэтому срабатывает первая ветка.'),
    hints: ['Определи действие отдельно для каждой из трёх веток.', 'Заменяй pass только командами нужной ветки. Для двух шагов нужны два вызова game.move(1).', 'Сохрани пороги >=5 и >=2 в таком порядке: большая возможность проверяется первой.'],
    transfer: 'У ворот может быть правило по числу ключей: два ключа открывают большие ворота, один — калитку, ноль — сообщение. Составь три условия словами.', tests: conditionChildTests, previewIndex: 4,
  }),
  teen: create('u4-l2', 'teen', {
    title: 'Выбери сложность противника', story: 'Арена подбирает тренировочного противника по текущим очкам. Тип должен меняться точно на границах 50 и 100, а не случайно между матчами.',
    task: 'При points < 50 выбери kind="slime-amber"; при 50 <= points < 100 — "slime-blue"; иначе — "slime-violet". После выбора создай ровно одного противника game.spawn(kind, x=240, y=160) и выведи kind.', resultLabel: 'Противник по правилу',
    starterCode: 'if points < 50:\n    kind = "slime-amber"\nelif points < 100:\n    kind = "slime-amber"\nelse:\n    kind = "slime-amber"\ngame.spawn(kind, x=240, y=160)\nprint(kind)',
    exampleCode: 'if 60 < 50:\n    print("первый уровень")\nelif 60 < 100:\n    print("второй уровень")\nelse:\n    print("третий уровень")',
    solutionCode: 'if points < 50:\n    kind = "slime-amber"\nelif points < 100:\n    kind = "slime-blue"\nelse:\n    kind = "slime-violet"\ngame.spawn(kind, x=240, y=160)\nprint(kind)',
    application: 'Выбор типа отделён от создания объекта. Поэтому game.spawn расположен после всей цепочки и выполняется один раз. При points=50 первая ветка уже не подходит, зато подходит вторая.',
    predict: q('Какой тип нужен при points=100?', ['slime-violet', 'slime-blue', 'slime-amber'], 0, 'Условие points < 100 ложно на границе 100, поэтому выбирается else.'),
    hints: ['В стартовом коде все три ветки выбирают один тип. Исправь вторую и третью.', 'Для среднего диапазона используй slime-blue, для последнего — slime-violet.', 'Не переноси game.spawn внутрь нескольких веток: после выбора kind достаточно одного вызова.'],
    transfer: 'Добавь на бумаге четвёртый диапазон для 200 и более очков. Где должна оказаться новая проверка, чтобы старые границы сохранились?', tests: conditionTeenTests, previewIndex: 2,
  }),
  adult: create('u4-l2', 'adult', {
    title: 'Расход, возврат или ноль', story: 'Отчёт должен понятно классифицировать знак операции. Положительная сумма — расход, отрицательная — возврат, ноль — отсутствие движения средств.',
    task: 'Заверши готовую функцию classify(amount). Верни "расход", если amount > 0; "возврат", если amount < 0; "без движения", если amount == 0. Используй if/elif/else. Обёртка def уже подготовлена: в этом уроке меняется выбор ветки.', resultLabel: 'Классификация операции',
    starterCode: 'def classify(amount):\n    if amount > 0:\n        return "расход"\n    elif amount < 0:\n        return "расход"\n    else:\n        return "расход"',
    exampleCode: 'value = -10\nif value > 0:\n    print("плюс")\nelif value < 0:\n    print("минус")\nelse:\n    print("ноль")',
    solutionCode: 'def classify(amount):\n    if amount > 0:\n        return "расход"\n    elif amount < 0:\n        return "возврат"\n    else:\n        return "без движения"',
    application: 'Знак числа задаёт категорию, а его величина внутри категории не важна. return уже находится в каждой ветке и возвращает выбранную подпись для строки отчёта.',
    predict: q('Какую категорию должен вернуть classify(0)?', ['без движения', 'расход', 'возврат'], 0, 'Ноль не положителен и не отрицателен: подходит ветка else.'),
    hints: ['Сравни возвращаемые подписи во второй и третьей ветках с правилами задачи.', 'Отрицательная сумма означает возврат; нулевая — отсутствие движения.', 'Проверь пять значений: два отрицательных, ноль и два положительных.'],
    transfer: 'Составьте правило для остатка на складе: положительный — в наличии, ноль — закончился, отрицательный — ошибка учёта. Какие условия останутся прежними?', tests: conditionAdultTests, previewIndex: 0,
  }),
};

const listRoutes = [[], [0], [1], [3, 1, 2], [5, 0]];
const listChildTests = listRoutes.map((route, i) => {
  const steps = route[0] ?? 0;
  return testCase(`route-${i}`, `Участки маршрута: ${JSON.stringify(route)}`, scriptCase({ route }, robotFixture(steps)), [
    { kind: 'eventCountEquals', type: 'actor.move', expected: steps },
    { kind: 'robotPositionEquals', expected: { x: steps, y: 0 } },
  ]);
});
const loadouts = [[], ['sword'], ['sword', 'potion'], ['shield', 'shield'], ['coin', 'book', 'boots']];
const listTeenTests = loadouts.map((items, i) => testCase(`loadout-${i}`, `Комплект: ${JSON.stringify(items)}`, callCase('prepare_loadout', [items], arenaFixture), [
  { kind: 'returnEquals', expected: items.length ? ['shield', ...items.slice(1)] : [] },
  { kind: 'eventsEqual', expected: [{ index: 1, type: 'score.update', payload: { value: items.length } }] },
]));
const amountLists = [[], [180], [100, 250, 75], [-80], [50, 0]];
const listAdultTests = amountLists.map((amounts, i) => returnTest(`amounts-${i}`, `Суммы: ${JSON.stringify(amounts)}`, 'latest_amount', [amounts], amounts.at(-1) ?? 0));

const lists: Record<LearningMode, LessonVariant> = {
  child: create('u6-l1', 'child', {
    title: 'Первый участок маршрута', story: 'В блокноте Пикса хранится список длин участков. Сегодня нужно пройти только первый участок, не отправляясь сразу по всему маршруту.',
    task: 'Сцена передаёт route — список длин участков от 0 до 5. Если список не пуст, возьми route[0] и сделай столько шагов game.move(1) через for. При пустом route не делай ни одного шага.', resultLabel: 'Первый участок пути',
    starterCode: 'if route:\n    for step in range(0):\n        game.move(1)',
    exampleCode: 'sections = [2, 4, 1]\nprint(sections[0])',
    solutionCode: 'if route:\n    for step in range(route[0]):\n        game.move(1)',
    application: 'Здесь route — весь список, а route[0] — одно число. Оно становится количеством повторений в знакомом range. Остальные участки остаются на следующие задачи.',
    predict: q('route=[3, 1, 2]. Сколько шагов требуется в этом задании?', ['3', '6', '1'], 0, 'Нужен первый элемент с индексом 0, а не сумма всех участков.'),
    hints: ['Проверка if route уже защищает от пустого списка.', 'В range нужно передать первый элемент route, а не постоянный ноль.', 'Первый индекс равен 0: route[0]. Сохрани вложенные отступы.'],
    transfer: 'Как выбрать последний участок того же маршрута? Какое условие всё ещё необходимо перед обращением к элементу?', tests: listChildTests, previewIndex: 3,
  }),
  teen: create('u6-l1', 'teen', {
    title: 'Обнови стартовый комплект', story: 'Для безопасной тренировки первый предмет комплекта заменяется щитом. Остальные предметы и их порядок нужно сохранить; пустой комплект остаётся пустым.',
    task: 'В prepare_loadout(items) уже создана копия loadout. Если в ней есть элементы, замени loadout[0] на "shield". Вызови game.score(len(loadout)) для счётчика предметов и верни loadout. Не добавляй предмет в пустой комплект.', resultLabel: 'Подготовленный комплект',
    starterCode: 'def prepare_loadout(items):\n    loadout = items.copy()\n    # Замени первый предмет, если он существует.\n    game.score(len(loadout))\n    return loadout',
    exampleCode: 'items = ["sword", "potion"]\nitems[0] = "shield"\nprint(items)',
    solutionCode: 'def prepare_loadout(items):\n    loadout = items.copy()\n    if loadout:\n        loadout[0] = "shield"\n    game.score(len(loadout))\n    return loadout',
    application: 'copy сохраняет исходный список для другого матча. Присваивание по индексу заменяет один элемент, не меняя длину и порядок остальных. Счётчик сцены показывает количество предметов в подготовленном наборе.',
    predict: q('Каким станет ["sword", "potion", "boots"] после замены элемента 0?', ['["shield", "potion", "boots"]', '["sword", "shield", "boots"]', '["shield"]'], 0, 'Индекс 0 указывает только на первый предмет; остальные сохраняются.'),
    hints: ['Нужна проверка if loadout: перед изменением элемента.', 'Внутри проверки присвой строку "shield" элементу с индексом 0.', 'Не используй append: задача просит заменить предмет, а не добавить новый.'],
    transfer: 'Сформулируй изменение для последнего предмета комплекта. Как сохранить безопасность пустого набора и исходный список?', tests: listTeenTests, previewIndex: 2,
  }),
  adult: create('u6-l1', 'adult', {
    title: 'Последняя сумма в журнале', story: 'Нужно показать сумму последней операции, сохранив исходный порядок журнала. Последняя операция может быть возвратом или нулевой записью.',
    task: 'Заверши latest_amount(amounts). Для непустого списка верни последний элемент amounts[-1]. Для пустого верни 0. Не сортируй список: последний по времени не обязательно самый большой.', resultLabel: 'Последняя операция',
    starterCode: 'def latest_amount(amounts):\n    if amounts:\n        return amounts[0]\n    return 0',
    exampleCode: 'amounts = [90, 30, 70]\nprint(amounts[-1])',
    solutionCode: 'def latest_amount(amounts):\n    if amounts:\n        return amounts[-1]\n    return 0',
    application: 'Индекс -1 читается как «последний элемент». Отрицательная сумма остаётся отрицательной, а нулевая операция отличается от отсутствия операций только контекстом задачи; возвращаемое значение в обоих случаях может быть 0.',
    predict: q('Что вернёт latest_amount([100, 250, 75])?', ['75', '250', '100'], 0, 'Задача просит последнее значение в заданном порядке, а не максимум.'),
    hints: ['Проверка непустого списка и запасной результат уже есть.', 'Измени индекс 0 на индекс последнего элемента.', 'Проверь отдельно пустой список, одну отрицательную сумму и список с нулём в конце.'],
    transfer: 'Журнал теперь хранит длительности задач. Как получить первую и последнюю длительность, не меняя порядок? Что вернуть при отсутствии задач?', tests: listAdultTests, previewIndex: 2,
  }),
};

const functionChildTests = [0, 1, 2, 4, 5].map(steps => testCase(`walk-${steps}`, `Функция пути для ${steps} шагов`, callCase('walk_to_gate', [steps], robotFixture(steps)), [
  { kind: 'returnEquals', expected: steps }, { kind: 'eventCountEquals', type: 'actor.move', expected: steps },
  { kind: 'robotPositionEquals', expected: { x: steps, y: 0 } },
]));
const attackCases = [[10, 3], [5, 5], [3, 8], [0, 0], [25, 4]];
const functionTeenTests = attackCases.map(([power, armor], i) => {
  const damage = Math.max(0, power - armor);
  return testCase(`attack-${i}`, `Сила ${power}, защита ${armor}`, callCase('attack', [power, armor], arenaFixture), [
    { kind: 'returnEquals', expected: damage },
    { kind: 'eventsEqual', expected: [{ index: 1, type: 'score.update', payload: { value: damage } }] },
  ]);
});
const lineCases = [[120, 3], [50, 1], [99, 0], [0, 8], [-25, 2]];
const functionAdultTests = lineCases.map(([price, quantity], i) => returnTest(`line-${i}`, `Строка ${price} × ${quantity}`, 'line_total', [price, quantity], price * quantity));

const functions: Record<LearningMode, LessonVariant> = {
  child: create('u8-l1', 'child', {
    title: 'Путь по имени', story: 'Пиксу нужен знакомый путь как отдельная команда, которую можно вызывать на разных дорожках. Функция пройдёт маршрут и сообщит, сколько шагов сделано.',
    task: 'Создай walk_to_gate(steps): повтори game.move(1) ровно steps раз и после цикла верни steps через return. Входы — целые 0…5. Вывод числа через print не заменяет возвращаемое значение.', resultLabel: 'Вызов функции пути',
    starterCode: 'def walk_to_gate(steps):\n    for step in range(steps):\n        game.move(1)\n    # Верни количество сделанных шагов.',
    exampleCode: 'def count_steps(total):\n    return total\n\nprint(count_steps(2))',
    solutionCode: 'def walk_to_gate(steps):\n    for step in range(steps):\n        game.move(1)\n    return steps',
    application: 'Определение функции само по себе не двигает робота. Проверка вызывает walk_to_gate с выбранной длиной. return стоит после цикла, чтобы путь не завершился после первого шага.',
    predict: q('Что должна вернуть walk_to_gate(0)?', ['0', '1', 'Текст "0"'], 0, 'Путь не содержит шагов, а возвращаемый результат — число 0.'),
    hints: ['Движение уже написано. Не хватает возвращаемого значения после цикла.', 'Используй return steps на том же уровне отступа, что и for.', 'Если return окажется внутри цикла, функция остановится после первой итерации.'],
    transfer: 'Придумай функцию для двух действий робота подряд: приветствие и путь. Какой параметр ей нужен и какой результат будет полезен вызывающей программе?', tests: functionChildTests, previewIndex: 4,
  }),
  teen: create('u8-l1', 'teen', {
    title: 'Функция расчёта попадания', story: 'Одинаковые правила попадания нужны всем участникам арены. Вынеси их в функцию: защита уменьшает силу, но итоговый урон не может быть отрицательным.',
    task: 'В attack(power, armor) вычисли damage = max(0, power - armor), передай damage игровому счётчику через game.score(damage) и верни damage. Функция должна работать с разными парами аргументов.', resultLabel: 'Результат попадания',
    starterCode: 'def attack(power, armor):\n    damage = max(0, power - armor)\n    game.score(damage)\n    # Верни damage.',
    exampleCode: 'def difference(left, right):\n    return left - right\n\nprint(difference(10, 3))',
    solutionCode: 'def attack(power, armor):\n    damage = max(0, power - armor)\n    game.score(damage)\n    return damage',
    application: 'max(0, ...) выбирает большее значение: ноль или разность силы и защиты. Событие меняет сцену, а return отдаёт число для дальнейших правил игры. Эти два результата проверяются независимо.',
    predict: q('Чему равен возвращаемый урон attack(3, 8)?', ['0', '-5', '5'], 0, 'Защита больше силы, но max не позволяет получить отрицательный урон.'),
    hints: ['Формула и изменение счётчика уже написаны. Добавь возвращение вычисленного числа.', 'Нужен return damage, а не print(damage).', 'Проверь ситуацию с равными силой и защитой: функция должна вернуть ноль.'],
    transfer: 'Где ещё можно повторно использовать чистое вычисление урона: подсказка интерфейса, балансировка или журнал матча? Какие входы и результат понадобятся?', tests: functionTeenTests, previewIndex: 0,
  }),
  adult: create('u8-l1', 'adult', {
    title: 'Повторно используемый расчёт строки', story: 'Расчёт стоимости позиции нужен в нескольких отчётах. Функция с ценой и количеством избавит от копирования формулы и позволит проверять её независимо.',
    task: 'Определи line_total(price, quantity) и верни price * quantity. Функция не должна запрашивать ввод и печатать вместо возвращения. Количество неотрицательно; отрицательная price разрешена для возвратной позиции.', resultLabel: 'Возвращённая стоимость строки',
    starterCode: 'def line_total(price, quantity):\n    total = price * quantity\n    print(total)',
    exampleCode: 'def minutes(hours):\n    return hours * 60\n\nprint(minutes(2))',
    solutionCode: 'def line_total(price, quantity):\n    return price * quantity',
    application: 'Параметры делают расчёт независимым от конкретной таблицы. Результат функции можно сложить с другими позициями, сохранить в файл или сравнить с ожидаемым значением. Печать оставляют вызывающей программе.',
    predict: q('Какой результат вернёт line_total(-25, 2)?', ['-50', '50', 'Только строку в консоли'], 0, 'Функция возвращает произведение с сохранением знака возвратной цены.'),
    hints: ['Стартовый код считает правильно, но передаёт результат неподходящим способом.', 'Замените print(total) на return total или верните произведение непосредственно.', 'Проверьте нулевое количество и отрицательную цену: формула остаётся той же.'],
    transfer: 'Спроектируйте функцию расчёта длительности работ из количества задач и минут на задачу. Назовите параметры и сформулируйте результат до написания кода.', tests: functionAdultTests, previewIndex: 0,
  }),
};

export const practiceVariants: Record<string, Record<LearningMode, LessonVariant>> = {
  'u2-l1': variables, 'u4-l2': conditions, 'u6-l1': lists, 'u8-l1': functions,
};
