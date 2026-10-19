import type { JsonValue, LearningMode, LessonVariant } from '../contracts';
import type { ExecutionCase, GameEvent } from '../runtime/contracts';
import { arenaFixture, makeVariant, previewOf, q, robotFixture, testCase } from './helpers';

const childSolution = `def run_route(path):
    steps = 0
    waits = 0
    with open(path, encoding="utf-8") as source:
        for line in source:
            command = line.strip()
            if command == "MOVE":
                game.move(1)
                steps += 1
            elif command == "WAIT":
                game.say("Жду")
                waits += 1
    with open("route-report.txt", "w", encoding="utf-8") as report:
        report.write(f"Шагов: {steps}\\nОжиданий: {waits}\\n")
    return {"steps": steps, "waits": waits}`;
const childInputs = [
  { id: 'empty', content: '', steps: 0, waits: 0 },
  { id: 'one', content: 'MOVE\n', steps: 1, waits: 0 },
  { id: 'journey', content: 'MOVE\nMOVE\nWAIT\nMOVE\n', steps: 3, waits: 1 },
  { id: 'waits', content: 'WAIT\nWAIT\n', steps: 0, waits: 2 },
  { id: 'spaces', content: '\n MOVE \nUNKNOWN\n\nWAIT\n', steps: 1, waits: 1 },
];
const childTests = childInputs.map(({ id, content, steps, waits }) => {
  const execution: ExecutionCase = {
    fixtures: { files: [{ path: 'route.txt', content, encoding: 'utf8' }], scene: robotFixture(steps) },
    probe: { kind: 'call', functionName: 'run_route', args: ['route.txt'] },
  };
  const expectedEvents: GameEvent[] = content.split(/\r?\n/).map(line => line.trim()).filter(command => command === 'MOVE' || command === 'WAIT').map((command, index) => command === 'MOVE'
    ? { index: index + 1, type: 'actor.move', actorId: 'robot_1', payload: { dx: 1, dy: 0 } }
    : { index: index + 1, type: 'actor.say', actorId: 'robot_1', payload: { text: 'Жду' } });
  return testCase(id, id === 'empty' ? 'Пустой журнал пути' : `Журнал: ${steps} шагов и ${waits} ожиданий`, execution, [
    { kind: 'returnEquals', expected: { steps, waits } },
    { kind: 'eventsEqual', expected: expectedEvents },
    { kind: 'robotPositionEquals', expected: { x: steps, y: 0 } },
    { kind: 'fileEquals', path: 'route-report.txt', expected: `Шагов: ${steps}\nОжиданий: ${waits}\n` },
  ]);
});

const teenSolution = `def summarize_battle(path):
    enemies = 0
    coins = 0
    with open(path, encoding="utf-8") as source:
        for line in source:
            event = line.strip()
            if event == "spawn":
                game.spawn("slime", x=80 + enemies * 80, y=160)
                enemies += 1
            elif event == "coin":
                coins += 1
    game.score(coins)
    with open("battle-report.txt", "w", encoding="utf-8") as report:
        report.write(f"Противников: {enemies}\\nМонет: {coins}\\n")
    return {"enemies": enemies, "coins": coins, "events": enemies + coins}`;
const teenInputs = [
  { id: 'empty', content: '', enemies: 0, coins: 0 },
  { id: 'one-spawn', content: 'spawn\n', enemies: 1, coins: 0 },
  { id: 'battle', content: 'spawn\ncoin\nspawn\ncoin\ncoin\n', enemies: 2, coins: 3 },
  { id: 'coins', content: 'coin\ncoin\ncoin\n', enemies: 0, coins: 3 },
  { id: 'noise', content: ' pause \n spawn \n\ncoin\nunknown\n', enemies: 1, coins: 1 },
];
const teenTests = teenInputs.map(({ id, content, enemies, coins }) => {
  const execution: ExecutionCase = { fixtures: { files: [{ path: 'battle.txt', content, encoding: 'utf8' }], scene: arenaFixture }, probe: { kind: 'call', functionName: 'summarize_battle', args: ['battle.txt'] } };
  const expectedEvents: GameEvent[] = Array.from({ length: enemies }, (_, i) => ({ index: i + 1, type: 'enemy.spawn', payload: { kind: 'slime', x: 80 + i * 80, y: 160 } }));
  expectedEvents.push({ index: enemies + 1, type: 'score.update', payload: { value: coins } });
  return testCase(id, id === 'empty' ? 'Матч без событий' : `${enemies} противников и ${coins} монет`, execution, [
    { kind: 'returnEquals', expected: { enemies, coins, events: enemies + coins } },
    { kind: 'eventsEqual', expected: expectedEvents },
    { kind: 'fileEquals', path: 'battle-report.txt', expected: `Противников: ${enemies}\nМонет: ${coins}\n` },
  ]);
});

const adultSolution = `def build_log_report(path):
    total = 0
    rows = []
    with open(path, encoding="utf-8") as source:
        for line in source:
            parts = line.strip().split(",")
            if len(parts) != 2:
                continue
            name = parts[0].strip()
            if not name:
                continue
            try:
                amount = int(parts[1].strip())
            except ValueError:
                continue
            total += amount
            rows.append({"name": name, "amount": amount})
    with open("report.txt", "w", encoding="utf-8") as report:
        report.write(f"Операций: {len(rows)}\\nИтог: {total}\\n")
    return {"total": total, "count": len(rows), "rows": rows}`;
const adultInputs = [
  { id: 'empty', content: '', rows: [] },
  { id: 'one', content: 'Блокнот,180\n', rows: [{ name: 'Блокнот', amount: 180 }] },
  { id: 'normal', content: 'Канцтовары,300\nДоставка,150\nПечать,50\n', rows: [{ name: 'Канцтовары', amount: 300 }, { name: 'Доставка', amount: 150 }, { name: 'Печать', amount: 50 }] },
  { id: 'refund', content: 'Материалы,700\nВозврат,-200\nУпаковка,50\n', rows: [{ name: 'Материалы', amount: 700 }, { name: 'Возврат', amount: -200 }, { name: 'Упаковка', amount: 50 }] },
  { id: 'invalid', content: '\nbroken\n,20\nПечать,50\nОшибка,not-a-number\n Проверка , 0 \n', rows: [{ name: 'Печать', amount: 50 }, { name: 'Проверка', amount: 0 }] },
];
const adultTests = adultInputs.map(({ id, content, rows }) => {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const execution: ExecutionCase = { fixtures: { files: [{ path: 'operations.txt', content, encoding: 'utf8' }] }, probe: { kind: 'call', functionName: 'build_log_report', args: ['operations.txt'] } };
  return testCase(id, id === 'empty' ? 'Пустой файл' : id === 'invalid' ? 'Пропуск некорректных строк и нулевая операция' : id === 'refund' ? 'Отрицательный возврат' : 'Обычные операции UTF-8', execution, [
    { kind: 'returnEquals', expected: { total, count: rows.length, rows: rows as JsonValue } },
    { kind: 'fileEquals', path: 'report.txt', expected: `Операций: ${rows.length}\nИтог: ${total}\n` },
  ]);
});

export const projectVariants: Record<LearningMode, LessonVariant> = {
  child: makeVariant('u20-l3', 'child', {
    title: 'Журнал путешествия Пикса', story: 'Пикс получил настоящий текстовый файл с планом путешествия. Прочитай команды, выполни маршрут и сохрани маленький отчёт, чтобы другой спутник мог понять, что произошло.',
    task: 'Заверши run_route(path). В UTF-8 файле каждая строка — MOVE или WAIT. Удаляй пробелы по краям через strip. MOVE означает game.move(1) и увеличивает steps; WAIT означает game.say("Жду") и увеличивает waits. Пустые и неизвестные строки пропускай. Верни {"steps": steps, "waits": waits} и сохрани route-report.txt в формате «Шагов: N» и «Ожиданий: M», каждая строка заканчивается переводом строки.',
    resultLabel: 'Маршрут и сохранённый отчёт',
    starterCode: 'def run_route(path):\n    steps = 0\n    waits = 0\n    with open(path, encoding="utf-8") as source:\n        for line in source:\n            command = line.strip()\n            # Обработай MOVE и WAIT.\n    with open("route-report.txt", "w", encoding="utf-8") as report:\n        report.write(f"Шагов: {steps}\\nОжиданий: {waits}\\n")\n    return {"steps": steps, "waits": waits}',
    exampleCode: 'with open("route.txt", encoding="utf-8") as source:\n    for line in source:\n        print(line.strip())',
    solutionCode: childSolution,
    theory: [
      { title: 'Файл — вход для программы', body: 'open(path, encoding="utf-8") открывает текст. Конструкция with закроет файл после блока. Цикл for line in source читает строки по очереди; strip убирает перевод строки и пробелы по краям.' },
      { title: 'Команда выбирает действие', body: 'После чтения строку сравнивают с MOVE и WAIT. Знакомая цепочка if/elif связывает данные с действиями робота. Счётчик увеличивается рядом с действием, которое он учитывает.' },
      { title: 'Отчёт сохраняет доказательство', body: 'Файл с режимом "w" создаётся заново для результата. Запись report.write сохраняет текст, а return передаёт структурированный итог. Проверка сравнит движение, счётчики и содержимое файла.' },
    ],
    questions: [q('Журнал содержит MOVE, WAIT, MOVE. Сколько будет шагов и ожиданий?', ['2 шага и 1 ожидание', '3 шага и 0 ожиданий', '1 шаг и 2 ожидания'], 0, 'Каждая строка вызывает только соответствующее ей действие.'), q('Для чего нужен strip перед сравнением команды?', ['Чтобы перевод строки и крайние пробелы не мешали сравнению', 'Чтобы удалить все команды MOVE', 'Чтобы файл автоматически выполнился'], 0, 'Читаемая строка может содержать завершающий перевод строки и пробелы.')],
    reflection: q('Что доказывает полный успех проекта?', ['Совпали движение, возвращённые счётчики и сохранённый файл', 'Файл просто существует', 'Робот сделал хотя бы один шаг'], 0, 'У проекта несколько наблюдаемых результатов; проверить нужно всю договорённость.'),
    hints: ['Начни с одной строки: после strip выбери нужное действие по command.', 'Для MOVE вызови game.move(1) и увеличь steps. Для WAIT вызови game.say("Жду") и увеличь waits.', 'Ненужным строкам не требуется else с действием. Запись отчёта и return должны остаться после чтения всего файла.', `Пример завершённой программы:\n${childSolution}\nПроверь также пустой журнал и журнал только из WAIT.`],
    transfer: 'Придумай новую команду поворота для будущего формата журнала. Опиши правило, счётчик и одну проверку до изменения программы.',
    preview: previewOf(childTests[2]), tests: childTests,
    files: [{ path: 'route.txt', content: childInputs[2].content }],
  }),
  teen: makeVariant('u20-l3', 'teen', {
    title: 'Восстанови тренировочный матч', story: 'Редактор арены сохранил журнал простых событий. Восстанови противников, посчитай монеты и выпусти отчёт матча как настоящий файл.',
    task: 'Заверши summarize_battle(path). Читай UTF-8 файл построчно и применяй strip. Для spawn создай slime при x=80+enemies*80, y=160, затем увеличь enemies. Для coin увеличь coins. Остальные строки пропускай. После обхода вызови game.score(coins), сохрани battle-report.txt со строками «Противников: N» и «Монет: M» и верни {"enemies": enemies, "coins": coins, "events": enemies+coins}. Каждая строка отчёта заканчивается переводом строки.',
    resultLabel: 'Восстановленная арена и отчёт',
    starterCode: 'def summarize_battle(path):\n    enemies = 0\n    coins = 0\n    with open(path, encoding="utf-8") as source:\n        for line in source:\n            event = line.strip()\n            # Обработай spawn и coin.\n    game.score(coins)\n    with open("battle-report.txt", "w", encoding="utf-8") as report:\n        report.write(f"Противников: {enemies}\\nМонет: {coins}\\n")\n    return {"enemies": enemies, "coins": coins, "events": enemies + coins}',
    exampleCode: 'with open("battle.txt", encoding="utf-8") as source:\n    for line in source:\n        if line.strip() == "coin":\n            print("Монета учтена")',
    solutionCode: teenSolution,
    theory: [
      { title: 'Журнал описывает события', body: 'Строки файла не являются Python-кодом. Программа сама задаёт небольшой язык данных: spawn создаёт объект, coin учитывает монету. Неизвестная строка по договорённости не создаёт событий.' },
      { title: 'Счётчик задаёт координату', body: 'enemies хранит число уже созданных объектов. Поэтому координату вычисляют до увеличения счётчика: первый объект получает x=80, второй — x=160. Так восстановление остаётся воспроизводимым.' },
      { title: 'Итог после обхода', body: 'Обновление счёта и запись файла выполняют после чтения журнала, когда итоговые значения известны. Пустой журнал корректен: в нём ноль противников, монет и учтённых событий.' },
    ],
    questions: [q('Зачем увеличивать enemies после вычисления координаты?', ['Чтобы первый противник появился при x=80', 'Чтобы первый противник появился за пределами арены', 'Чтобы пропустить первое событие'], 0, 'Начальный enemies=0 даёт x=80; затем счётчик готов к следующему объекту.'), q('Журнал содержит две coin и неизвестную строку pause. Чему равен events?', ['2', '3', '0'], 0, 'В итог входят только два распознанных события coin; неизвестная строка пропускается.')],
    reflection: q('Почему проверки сравнивают и объекты арены, и файл?', ['Отчёт может быть правильным при неверно восстановленной сцене, и наоборот', 'Это одна и та же проверка', 'Файл заменяет выполнение Python'], 0, 'Независимые наблюдаемые результаты проверяют разные обязанности программы.'),
    hints: ['После чтения event добавь if для spawn и elif для coin.', 'Используй текущий enemies в формуле x, затем увеличь его на 1. Для coin достаточно coins += 1.', 'Не обновляй счёт в каждой итерации: готовый game.score(coins) уже находится после цикла.', `Один вариант реализации:\n${teenSolution}\nПредскажи, что останется на арене при журнале только из coin.`],
    transfer: 'Спроектируй событие checkpoint: какие данные оно должно хранить и какой результат восстановления нужно проверить? Сначала уточни формат строки.',
    preview: previewOf(teenTests[2]), tests: teenTests,
    files: [{ path: 'battle.txt', content: teenInputs[2].content }],
  }),
  adult: makeVariant('u20-l3', 'adult', {
    title: 'Отчёт по файловому журналу', story: 'Небольшой журнал операций хранится в настоящем текстовом файле. Нужно проверить записи, сохранить порядок принятых операций и получить как структурированный итог, так и скачиваемый текстовый отчёт.',
    task: 'Заверши build_log_report(path). Формат строки: name,amount; name непустое и не содержит запятую, amount — целое число рублей. Удали крайние пробелы. Пустые строки, строки не из двух полей, пустые имена и суммы, не преобразуемые int, пропускай. Возвраты отрицательны. Верни {"total": сумма, "count": число принятых строк, "rows": [{"name": имя, "amount": сумма}, ...]}. Сохрани report.txt: «Операций: N» и «Итог: T», с переводом строки после каждой.',
    resultLabel: 'Проверяемый файл отчёта',
    starterCode: 'def build_log_report(path):\n    total = 0\n    rows = []\n    with open(path, encoding="utf-8") as source:\n        for line in source:\n            # Разбери и проверь запись, затем обнови total и rows.\n            pass\n    with open("report.txt", "w", encoding="utf-8") as report:\n        report.write(f"Операций: {len(rows)}\\nИтог: {total}\\n")\n    return {"total": total, "count": len(rows), "rows": rows}',
    exampleCode: 'line = "Доставка,150"\nparts = line.split(",")\nname = parts[0].strip()\namount = int(parts[1].strip())\nprint(name, amount)',
    solutionCode: adultSolution,
    theory: [
      { title: 'Сначала договорённость о формате', body: 'В этом учебном формате ровно два поля, разделённые одной запятой; имя не содержит запятых. split подходит именно к этой договорённости. Для более сложного CSV нужен специализированный разбор: нельзя молча считать любой текст таким же простым.' },
      { title: 'Проверяйте запись до включения в итог', body: 'Сначала проверяется количество полей и непустое имя. Преобразование int может вызвать ValueError: except пропускает именно такую запись. В rows и total попадают только принятые данные; нулевая сумма допустима.' },
      { title: 'Файл и возвращаемая структура', body: 'with open(..., encoding="utf-8") читает и закрывает источник. Отдельный with с режимом "w" сохраняет итог. Возвращаемая структура пригодится таблице и графику, а report.txt — для выгрузки и независимого сравнения.' },
    ],
    questions: [q('Записи: Заказ,700 и Возврат,-200. Каков итог?', ['500', '900', '-200'], 0, 'Отрицательная операция уменьшает накопленную сумму: 700 − 200 = 500.'), q('Строка содержит Ошибка,abc. Когда её нужно добавлять в rows?', ['Не добавлять: int не преобразует abc в целое', 'До попытки преобразования', 'Добавить с суммой 0 без объяснения'], 0, 'По договорённости некорректная запись пропускается, а ноль остаётся самостоятельным допустимым значением.')],
    reflection: q('Что нужно уточнить перед обработкой журнала с запятыми внутри названий?', ['Формат экранирования и подходящий разбор CSV', 'Только цвет таблицы', 'Ничего: обычный split всегда достаточен'], 0, 'Граница учебного формата должна быть явной; новый формат требует нового правила разбора.'),
    hints: ['Начните с line.strip().split(",") и проверки len(parts)==2. Пустое имя не принимается.', 'Преобразуйте сумму через int внутри try/except ValueError. Для плохой записи используйте continue.', 'После всех проверок обновите total и добавьте словарь в rows. Сохранение файла и return оставьте после цикла.', `Пример завершённого решения:\n${adultSolution}\nПроверьте пустой файл, возврат и некорректную сумму.`],
    transfer: 'Адаптируйте схему к журналу длительностей: задача,минуты. Определите допустимость отрицательных значений и сформулируйте три проверки нового контракта.',
    preview: previewOf(adultTests[2]), tests: adultTests,
    files: [{ path: 'operations.txt', content: adultInputs[2].content }],
  }),
};
