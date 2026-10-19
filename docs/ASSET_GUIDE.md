# ПИТОН V5 — руководство по графике

**Версия набора:** 5.0.0. **Снимок состава:** 18 октября 2026 года.

В поставку входят **280 графических файлов для приложения** и **7 дизайнерских референсов**. Число файлов включает размеры, состояния и альтернативные форматы одной иллюстрации. Полный состав, исходники, размеры и контрольные суммы зафиксированы в [design/asset-manifest.json](../design/asset-manifest.json). В приложении A этого руководства перечислены все 280 файлов, в приложении B — семь референсов.

## 1. Графика была завершена до кода приложения

Порядок работы задан пользователем: сначала создать весь набор графики, принять его, затем реализовать приложение. В [design/qa/graphics-gate.json](../design/qa/graphics-gate.json) сохранён результат этого этапа:

| Поле | Зафиксированное значение |
|---|---|
| `status` | `passed` |
| `completedAt` | `2026-10-18T19:00:31.473126+00:00` |
| `applicationCodeStarted` | `false` на момент принятия графики |
| `rasterAndVectorExports` | 287 |
| `productionFiles` | 280 |
| `allFinalRasterFilesDecoded` | `true` |

Это исторический снимок завершения художественного этапа. Код приложения появился после него. Манифест также содержит `graphicsBeforeApplicationCode: true` и ту же дату `graphicsCompletedAt`. Для последующих замен сохраняйте исходный снимок и фиксируйте новую проверку отдельно с новой датой и версией.

В графическом этапе проверялись шесть миров, 24 позы персонажей, пять состояний наставника, 33 базовых игровых рисунка, 12 значков достижений и эффекты. Монтажи для визуальной проверки находятся в `design/qa/`: например, `worlds-contact-sheet.png`, `worlds-state-contact-sheet.png`, `characters-turnarounds-navy.png`, `characters-avatars-navy.png`, `tutor-contact-sheet.png`, `game-actors.jpg`, `game-props-navy.jpg`, `game-props-light.jpg`, `rewards-badges-48px.png`, `rewards-fx-contact.png`.

## 2. Состав поставки

Группы ниже определены по каталогам URL. Поле `type` внутри манифеста подробнее разделяет игровые файлы на `actor`, `prop`, `tile`, `slime`, `background` и их размерные экспорты.

| Каталог URL | Файлов | Состав |
|---|---:|---|
| `/assets/map/` | 4 | Два фона неба и маршрут в SVG/WebP |
| `/assets/worlds/` | 54 | Шесть островов; по три размера и три состояния в SVG/PNG |
| `/assets/characters/` | 42 | Шесть персонажей; по четыре позы и три размера аватара |
| `/assets/tutor/` | 5 | Наставник: idle, thinking, hint, error, success |
| `/assets/game/` | 99 | 46 файлов сцены робота и 53 файла арены |
| `/assets/rewards/` | 25 | 12 значков в двух размерах и иллюстрация завершения урока |
| `/assets/fx/` | 8 | Четыре отдельных эффекта, три состояния моста, атлас частиц |
| `/assets/icons/` | 21 | 20 интерфейсных иконок и знак ПИТОН |
| `/assets/illustrations/` | 19 | Иллюстрации отчётов, данных, вступления, перехода и финала |
| `/assets/projects/` | 3 | Обложки проектов для child, teen, adult |
| **Для приложения** | **280** | **215 WebP, 40 SVG, 25 PNG** |
| `design/references/` | 7 | Дизайнерские ориентиры, все WebP |
| **Всего в манифесте** | **287** | **222 WebP, 40 SVG, 25 PNG** |

Суммарный размер 287 экспортов — **14 000 080 байт**, из них файлы для приложения занимают **12 641 968 байт**. Эти числа относятся к изображениям из манифеста; исходные PNG, промпты, QA-монтажи и код учитываются отдельно. В `public/assets/fx/` дополнительно находятся два JSON-файла с описаниями кадров и атласа; они не входят в число изображений.

## 3. Где находятся исходники и метаданные

| Путь | Назначение |
|---|---|
| `design/asset-manifest.json` | Актуальный реестр экспортов; основной источник путей, размеров и SHA-256 |
| `public/assets/` | Файлы, доступные приложению по URL `/assets/...` |
| `design/source/` | Сохранённые растровые исходники, листы и выделенные из них изображения |
| `design/source/prepared/` | Технически подготовленные игровые изображения: кадрирование, масштабирование, прозрачные поля |
| `design/prompts/` | Точные тексты генерации, идентификаторы, сведения о референсах и технической подготовке |
| `design/references/` | Семь ориентиров для дизайна; вне каталога публичных ассетов |
| `design/qa/` | Визуальные монтажи, технические отчёты и результат graphics-gate |
| `design/brief/` | Переданное задание, художественный бриф и согласованный референс карты |

`exportFile` и `sourceFile` в манифесте заданы **относительно корня проекта**. Для production-записи действует равенство `exportFile = "public" + path`. Например:

```json
{
  "id": "characters.byte.avatar-128",
  "path": "/assets/characters/byte/avatar-128.webp",
  "exportFile": "public/assets/characters/byte/avatar-128.webp",
  "sourceFile": "design/source/characters/byte/front.png",
  "sourcePromptId": "CHAR-03",
  "width": 128,
  "height": 128,
  "alpha": true,
  "usage": "production"
}
```

Для авторских SVG `sourceFile` может совпадать с `exportFile`: сам векторный документ является редактируемым исходником. Для PNG-состояний острова `sourceFile` указывает на соответствующий SVG. У игровых объектов сведения о подготовленном мастере дополнительно сохранены в `design/prompts/game.json`; `sourceFile` манифеста сохраняет путь к исходному рисунку.

Некоторые поля в исторических журналах промптов и JSON-описаниях FX содержат прежние пути `art/source/...`, `art/final/...` либо абсолютный путь генератора из рабочей сессии. Они сохранены как сведения о производстве. Для открытия файлов в переданном проекте используйте нормализованные `sourceFile` и `exportFile` манифеста. Координаты кадров, размеры и тексты промптов из этих журналов остаются полезны для воспроизведения подготовки.

### Поля записи манифеста

| Поле | Как использовать |
|---|---|
| `id` | Стабильный идентификатор конкретного экспорта |
| `path` | Production URL либо локальный путь reference-only файла |
| `exportFile`, `sourceFile` | Экспорт и его исходник относительно корня проекта |
| `type`, `usage` | Категория; `production` или `reference-only` |
| `width`, `height` | Размер растрового файла; у SVG — заявленные размеры координатной области |
| `alpha` | Возможность прозрачной композиции; для SVG это свойство векторного рисунка |
| `anchor` | Нормализованная точка привязки в диапазоне 0–1 |
| `alt` | Базовое описание; окончательная доступная подпись зависит от контекста компонента |
| `sourcePromptId` | Связь с промптом либо группой исходного задания |
| `version` | Версия конкретного экспорта |
| `bytes`, `sha256` | Размер файла и SHA-256 его фактических байтов |
| `author`, `license`, `licenseStatus` | Метки происхождения, сохранённые при подготовке набора |
| `fallback` | Описание поведения при недоступной иллюстрации; не обработчик ошибок загрузки |

## 4. Художественное направление

Основной ориентир — [APPROVED_MAP_REFERENCE.png](../design/brief/APPROVED_MAP_REFERENCE.png); подробные требования находятся в [PITON_V5_GRAPHICS_PROMPTS.md](../design/brief/PITON_V5_GRAPHICS_PROMPTS.md). Композиция использует уютное ночное приключение, парящие острова, мягкий объём 2.5D, округлые силуэты и небольшие тёплые источники света.

| Цвет | Роль |
|---|---|
| `#071426` | Основной тёмный фон |
| `#0B2144` | Глубина фона |
| `#234E82` | Приглушённый синий |
| `#F7C65D` | Золото и активные акценты |
| `#5AD7C7` | Бирюзовый свет |
| `#9B70E5` | Фиолетовый акцент |
| `#F3F7FF` | Светлый текст интерфейса |

Рисунки сохраняют читаемый силуэт при уменьшении. Детский контекст — робот и тропа; подростковый — конструктор арены; взрослый — файлы и отчёты. Надписи, счётчики, прогресс, кнопки, проверки и интерактивные узлы создаются компонентами React/HTML. Изображения дают окружение, персонажей и предметы.

## 5. Размеры и особенности групп

### Карта и острова

`night-sky-base.webp` имеет размер **1672 × 941**, мобильный фон — **720 × 1280**. Маршрут поставляется как SVG **1200 × 720** и прозрачный WebP **1774 × 887**. Текущая карта использует SVG-маршрут; фон переключается на мобильный через `app/globals.css`.

| ID мира | Название | Промпт |
|---|---|---|
| `starter-village` | Деревня первых команд | `W-01` |
| `ice-mountains` | Ледяные горы | `W-02` |
| `desert-decisions` | Песчаный мир решений | `W-03` |
| `forest-loops` | Лес циклов | `W-04` |
| `function-academy` | Академия функций | `W-05` |
| `maker-city` | Город создателей | `W-06` |

Каждый мир содержит девять файлов: `island.webp` **1024 × 683**, `thumbnail.webp` **384 × 256**, `micro.webp` **96 × 64**, а также `overlays/current`, `locked`, `completed` в двух форматах. SVG-состояния используют область **1536 × 1024**, PNG-версии имеют размер **1024 × 683**. Сохраняйте общую геометрию острова и наложений при замене. Координаты поверхности, интерактивных узлов и значка состояния сохранены в `design/prompts/worlds.json`. Текущие ссылки и подписи миров реализованы в `src/screens/Journey.tsx`.

### Персонажи и наставник

Шесть спутников — `pix`, `foxy`, `byte`, `luna`, `quasi`, `nova`. У каждого четыре прозрачные позы **512 × 512**: `front`, `side`, `back`, `happy`; аватары **64 × 64**, **128 × 128**, **256 × 256** получены из фронтальной позы. Это 42 production-файла. Общая таблица персонажей `CHAR-00` хранится среди референсов.

Пикс-Бот — отдельный наставник с пятью прозрачными файлами **512 × 512**: `pix-bot-idle`, `pix-bot-thinking`, `pix-bot-hint`, `pix-bot-error`, `pix-bot-success`. При новой эмоции или повороте используйте утверждённый исходник того же персонажа как визуальную опору; сохраняйте пропорции, палитру, детали лица и аксессуары. Сверяйте всю последовательность одновременно на QA-монтаже.

### Игровые сцены

99 игровых файлов происходят от 33 базовых рисунков. `robot-grid` содержит фон, четыре типа клеток, пять поз робота и шесть предметов. `arena` содержит фон, три позы игрока, три цвета слаймов и десять предметов конструктора.

Основные прозрачные актёры и предметы имеют размер **512 × 512**; для интерфейса подготовлены версии **256 × 256** и **128 × 128**. У клеток базовый размер **256 × 256** и дополнительный **128 × 128**. Полный перечень конкретных размеров приведён в приложении A. Каждый фон поставляется в пяти размерах: **1672 × 941**, **1440 × 810**, **768 × 432**, **390 × 219**, **360 × 203**.

В `src/components/Scene.tsx` используются фон `background-768.webp`, клетка `path-128.webp`, робот и игрок с суффиксом `-256`, предметы арены и слаймы с суффиксом `-128`. События Python определяют состояние сцены, координаты и счётчики. Изменение рисунка не меняет границы сцены, разрешённые действия и правила проверки.

Привязки актёров и предметов часто равны `(0.5, 0.9)`, островов и клеток — `(0.5, 0.76)`. Читайте значение конкретной записи. Точка привязки помогает совместить изображение с поверхностью; её изменение требует проверки положения в компоненте.

### Награды, эффекты и иконки

12 наград имеют версии **256 × 256** и **48 × 48**. Иллюстрация завершения урока — **1024 × 683**. Графический ID значка и условие его выдачи — разные части системы: фактические достижения рассчитываются в `packages/server/progress.ts`, а отображение находится в `src/screens/Progress.tsx`.

Четыре отдельных эффекта имеют размер **512 × 512**: `cyan-sparkle`, `gold-pulse`, `amber-ripple`, `violet-swirl`. Их общий атлас — **1024 × 1024**, схема областей записана в `public/assets/fx/particles/atlas.json`. Это четыре статических эффекта, которые можно использовать отдельно.

Мост имеет три изображения **512 × 512** и описание `public/assets/fx/bridge-unlock/frames.json`. В метаданных указан статический вариант для уменьшенного движения: `frame-03-lit`. Геометрия трёх сгенерированных состояний близка, но пиксельная идентичность не заявлена; для будущей анимации предусмотрен мягкий переход прозрачности. Наличие кадров в поставке само по себе не означает, что каждый из них уже используется на маршрутах приложения.

20 интерфейсных иконок — авторские SVG с областью **24 × 24**, знак `piton-mark.svg` — **48 × 48**. SVG сохраняют форму при масштабировании. Компонент `Icon` использует изображения как декоративное сопровождение подписи или `aria-label` управляющего элемента.

### Иллюстрации и обложки

`adult-report.webp`, `landing-hero.webp`, `world-transition.webp` — **1672 × 941**. Мобильные варианты двух последних иллюстраций — **705 × 941**. `world-boss.webp` — **1600 × 900**. Лист `data-files.webp` — **1536 × 1024**; шесть самостоятельных предметов данных — **512 × 512** в PNG и WebP. Три обложки проектов — **768 × 768**.

Размеры в исходном задании являются целевыми ориентирами. Манифест и приложение A отражают фактически переданные файлы; например, широкий фон получен в 1672 × 941. Не подменяйте измеренный размер желаемым из промпта.

## 6. Промпты, референсы и происхождение

| Коллекция | Что искать |
|---|---|
| `design/prompts/characters.json` | `CHAR-00`, четыре позы каждого спутника, базовый idle наставника, параметры экспорта и QA |
| `design/prompts/tutor-emotions.json` | Четыре производные эмоции наставника с опорой на исходный образ |
| `design/prompts/worlds.json` | Шесть островов, арт-направление состояний, координаты и технические экспорты |
| `design/prompts/game.json` | Тексты генерации, 33 базовых игровых экспорта, подготовленные мастера и размеры |
| `design/prompts/rewards.json` | Лист значков, отдельные награды, мост, частицы, финальные иллюстрации и координаты нарезки |
| `design/prompts/root.json` | Карта, UI-референсы, иллюстрации данных, обложки проектов, вступление и переход; перечень иконок |

`sourcePromptId` иногда указывает на группу, например `GAME`, `ILLUSTRATIONS`, `REFERENCES`, либо на общего персонажа `CHAR-03`. Чтобы найти точный запрос для размера или позы, сопоставьте также путь, `id`, `name`, `state`, `records` либо `production` внутри соответствующей коллекции. У технических производных — уменьшений, нарезок, SVG-наложений — отдельного нового запроса генерации может не быть; связь ведёт к базовому рисунку и описанию подготовки.

Семь `reference-only` изображений служат для композиции, идентичности и художественного направления. Пять из них изображают экраны, ещё два — систему иконок и персонажей. Они не размещены в `public/assets/`; в продукте текст, формы, таблицы, редактор и кликабельные элементы реализованы компонентами.

В манифесте сохранены метки `original-ai-generated`, `original-vector-authored-for-project` и `original-vector-derived-raster`, а также `license: original-project-artwork` и авторство `OpenAI / ChatGPT, for PITON V5`. Это сведения о происхождении набора. Руководство не приписывает этим меткам отсутствующий отдельный лицензионный документ, условия CC0 или стороннюю лицензию. Для добавленного внешнего изображения сохраните фактический источник и предоставленные условия использования в его записи.

В `design/brief/` переданы спецификации проекта и карта учебных источников. Исходные книги для проверки учебных ссылок не предоставлены; ссылки контента сохраняют статус `inherited-unverified`, как описано в [CONTENT_GUIDE.md](CONTENT_GUIDE.md). Происхождение графики и проверенность книжных ссылок учитываются отдельно.

## 7. Прозрачность, адаптация и запасное отображение

По манифесту **259 production-файлов** поддерживают прозрачность; 21 фон или обложка её не использует. При проверке растрового файла смотрите канал alpha и композицию на двух подложках: тёмной navy и светлой. Просмотр скрытых RGB-значений под прозрачными пикселями может выглядеть как фон; решающим является результат правильного наложения с alpha.

Кадрирование и уменьшение не должны обрезать край силуэта, размывать важные детали или добавлять нарисованную шахматную подложку. Сохраняйте прозрачный холст и предусмотренные поля. Для сцены и карты используйте размер под фактическое отображение; крупный PNG-мастер предназначен для подготовки, а готовый WebP — для публикации. Совпадающие SVG/PNG-состояния должны накладываться на остров без смещения.

Поле `fallback` всех записей содержит `semantic HTML label; solid scene background`. Его практический смысл — сохранять подписи, состояние и доступность управления в HTML, даже когда декоративный рисунок недоступен. В текущем коде подписи миров, прогресс, кнопки и результаты независимы от изображений; сцены имеют текстовые описания. Единого обработчика `img.onError`, который автоматически подменяет каждый отсутствующий файл, в компонентах нет. При добавлении обязательной новой иллюстрации реализуйте требуемое поведение в её компоненте и проверьте ошибку загрузки отдельно.

Изображение с самостоятельным смыслом получает содержательный `alt`. Для декоративного изображения рядом с уже подписанным контролом используйте `alt=""`; доступное имя остаётся у кнопки или ссылки. Подписи из манифеста являются исходными метаданными и могут требовать русского описания конкретной ситуации.

Уменьшенное движение учитывается настройкой профиля и системным `prefers-reduced-motion`; `PitonApp` задаёт `data-motion`, а `app/globals.css` отключает анимации и переходы. Временная шкала сцены может сразу показать итоговое событие. Новые эффекты должны оставлять читаемое статическое состояние и не передавать результат только вспышкой или движением.

## 8. Как заменить существующий ассет

1. Найдите запись по `id` или `path` в манифесте. Откройте её `sourceFile`, точный промпт, связанные позы или размеры и QA-монтаж. Проверьте реальные места использования поиском по проекту.
2. Подготовьте новый исходник в том же художественном направлении. Для варианта персонажа используйте прежний утверждённый образ как референс. Сохраните исходный размер и прозрачность либо осознанно обновите контракт размеров и привязки.
3. Выполните техническую подготовку: кадрирование, поля, масштабирование, нужные форматы и размеры. Для игрового объекта подготовьте также его используемые `-128` и `-256`; для аватара — 64/128/256. При изменении острова проверьте все три наложения.
4. Сохраните мастер и экспорты по нормализованным путям. При неизменной роли сохраняйте стабильный ID и URL. Обновите запись промпта и сведения о референсе или нарезке.
5. Пересчитайте `width`, `height`, `alpha`, `bytes`, `sha256`; обновите `version`, `alt`, `anchor`, происхождение и fallback, если они изменились. Не копируйте контрольную сумму старого файла.
6. Сверьте изображение на тёмном и светлом фоне, в рабочем размере и вместе с соседними позами. Запишите новую проверку в QA и обновите перечень в этом руководстве при изменении состава.
7. Запустите проверки ассетов и начального рендера. Для изменений положения, адаптации или обработки ошибки загрузки дополнительно проверьте соответствующее взаимодействие в доступном окружении.

Пример поиска точек использования из корня проекта:

```bash
rg -n 'pix-bot-hint|/assets/tutor|characters/' src app packages
```

Генерация изображения не является обязательным шагом сборки приложения. Все принятые экспорты уже лежат в проекте. Повторная генерация по тому же тексту может отличаться; для точной повторной публикации используйте сохранённый мастер.

## 9. Как добавить новый ассет

Сначала определите его роль, размер отображения, прозрачность, привязку, подпись и статическое состояние. Создайте рисунок или редактируемый SVG, затем экспортируйте нужные размеры. Добавьте уникальный `id`, все поля манифеста и запись о происхождении; выберите `production` либо `reference-only` согласно назначению. Файлы для приложения должны находиться в `public/assets/`.

После подготовки подключите URL в конкретном компоненте. Если путь строится из динамического перечисления, обновите соответствующие типы или каталог и расширение конечного набора в `tests/ui-render.test.ts`. При росте поставки обновите зафиксированные количества в `tests/assets.test.ts` и таблицах этого руководства. Исторический graphics-gate сохраните; результат приёмки дополнения оформите отдельно.

Не меняйте идентификаторы достижений, миров или персонажей только ради нового имени файла: они могут использоваться сохранёнными профилями и серверной логикой. Для переименования потребуется согласованное изменение ссылок и данных.

## 10. Проверка поставки и её границы

Из корня проекта:

```bash
node --import tsx --test tests/assets.test.ts tests/ui-render.test.ts
```

`tests/assets.test.ts` проверяет все 287 записей: наличие экспортов и исходников, допустимость локальных путей, соответствие production URL, ненулевой размер, `bytes` и SHA-256. При подготовке этого руководства проверка прошла; дополнительно декодированы все **247 растровых экспортов**, их размеры совпали с манифестом. SVG учитываются отдельно — их 40.

`tests/ui-render.test.ts` проверяет 116 основных начальных рендеров, ещё два начальных сценария новой рабочей области и 129 уникальных путей графики, обнаруженных в разметке, строковых ссылках и конечных динамических наборах. Это подмножество графической поставки: наличие каждого из 287 файлов проверяет тест манифеста. SSR не исполняет эффекты React, Python, сетевые запросы или действия пользователя и не подтверждает визуальную компоновку в браузере.

Для чтения отдельных названий сценариев, если среда показывает лишь строки уровня файлов, можно запустить файлы напрямую:

```bash
node --import tsx tests/assets.test.ts
node --import tsx tests/ui-render.test.ts
```

Приёмка всего набора и границы проверенного поведения описываются в общем QA-отчёте проекта. Это руководство документирует графическую поставку, её происхождение и обслуживание.

## Приложение A. Все 280 файлов для приложения

Таблицы ниже получены из production-записей `design/asset-manifest.json`. В первом столбце приведён путь относительно `/assets/`: добавьте этот префикс для URL и `public/assets/` для локального экспортного файла. Путь исходника приведён относительно корня проекта. Размеры указаны в пикселях; у SVG — размер координатной области. Полный `id`, SHA-256, число байтов и привязка остаются в манифесте.

### Карта — 4 файлов

| Путь от `/assets/` | Размер | Alpha | Исходник | Промпт / группа |
|---|---:|:---:|---|---|
| `map/glowing-route.svg` | 1200 × 720 | да | `public/assets/map/glowing-route.svg` | `MAP` |
| `map/glowing-route.webp` | 1774 × 887 | да | `design/source/map/glowing-route.png` | `MAP` |
| `map/night-sky-base.webp` | 1672 × 941 | нет | `design/source/map/night-sky-base.png` | `MAP-01` |
| `map/night-sky-mobile.webp` | 720 × 1280 | нет | `design/source/map/night-sky-base.png` | `MAP` |

### Миры — 54 файлов

| Путь от `/assets/` | Размер | Alpha | Исходник | Промпт / группа |
|---|---:|:---:|---|---|
| `worlds/desert-decisions/island.webp` | 1024 × 683 | да | `design/source/worlds/desert-decisions/island.png` | `W-03` |
| `worlds/desert-decisions/micro.webp` | 96 × 64 | да | `design/source/worlds/desert-decisions/island.png` | `W-03` |
| `worlds/desert-decisions/overlays/completed.png` | 1024 × 683 | да | `public/assets/worlds/desert-decisions/overlays/completed.svg` | `W-03` |
| `worlds/desert-decisions/overlays/completed.svg` | 1536 × 1024 | да | `public/assets/worlds/desert-decisions/overlays/completed.svg` | `W-03` |
| `worlds/desert-decisions/overlays/current.png` | 1024 × 683 | да | `public/assets/worlds/desert-decisions/overlays/current.svg` | `W-03` |
| `worlds/desert-decisions/overlays/current.svg` | 1536 × 1024 | да | `public/assets/worlds/desert-decisions/overlays/current.svg` | `W-03` |
| `worlds/desert-decisions/overlays/locked.png` | 1024 × 683 | да | `public/assets/worlds/desert-decisions/overlays/locked.svg` | `W-03` |
| `worlds/desert-decisions/overlays/locked.svg` | 1536 × 1024 | да | `public/assets/worlds/desert-decisions/overlays/locked.svg` | `W-03` |
| `worlds/desert-decisions/thumbnail.webp` | 384 × 256 | да | `design/source/worlds/desert-decisions/island.png` | `W-03` |
| `worlds/forest-loops/island.webp` | 1024 × 683 | да | `design/source/worlds/forest-loops/island.png` | `W-04` |
| `worlds/forest-loops/micro.webp` | 96 × 64 | да | `design/source/worlds/forest-loops/island.png` | `W-04` |
| `worlds/forest-loops/overlays/completed.png` | 1024 × 683 | да | `public/assets/worlds/forest-loops/overlays/completed.svg` | `W-04` |
| `worlds/forest-loops/overlays/completed.svg` | 1536 × 1024 | да | `public/assets/worlds/forest-loops/overlays/completed.svg` | `W-04` |
| `worlds/forest-loops/overlays/current.png` | 1024 × 683 | да | `public/assets/worlds/forest-loops/overlays/current.svg` | `W-04` |
| `worlds/forest-loops/overlays/current.svg` | 1536 × 1024 | да | `public/assets/worlds/forest-loops/overlays/current.svg` | `W-04` |
| `worlds/forest-loops/overlays/locked.png` | 1024 × 683 | да | `public/assets/worlds/forest-loops/overlays/locked.svg` | `W-04` |
| `worlds/forest-loops/overlays/locked.svg` | 1536 × 1024 | да | `public/assets/worlds/forest-loops/overlays/locked.svg` | `W-04` |
| `worlds/forest-loops/thumbnail.webp` | 384 × 256 | да | `design/source/worlds/forest-loops/island.png` | `W-04` |
| `worlds/function-academy/island.webp` | 1024 × 683 | да | `design/source/worlds/function-academy/island.png` | `W-05` |
| `worlds/function-academy/micro.webp` | 96 × 64 | да | `design/source/worlds/function-academy/island.png` | `W-05` |
| `worlds/function-academy/overlays/completed.png` | 1024 × 683 | да | `public/assets/worlds/function-academy/overlays/completed.svg` | `W-05` |
| `worlds/function-academy/overlays/completed.svg` | 1536 × 1024 | да | `public/assets/worlds/function-academy/overlays/completed.svg` | `W-05` |
| `worlds/function-academy/overlays/current.png` | 1024 × 683 | да | `public/assets/worlds/function-academy/overlays/current.svg` | `W-05` |
| `worlds/function-academy/overlays/current.svg` | 1536 × 1024 | да | `public/assets/worlds/function-academy/overlays/current.svg` | `W-05` |
| `worlds/function-academy/overlays/locked.png` | 1024 × 683 | да | `public/assets/worlds/function-academy/overlays/locked.svg` | `W-05` |
| `worlds/function-academy/overlays/locked.svg` | 1536 × 1024 | да | `public/assets/worlds/function-academy/overlays/locked.svg` | `W-05` |
| `worlds/function-academy/thumbnail.webp` | 384 × 256 | да | `design/source/worlds/function-academy/island.png` | `W-05` |
| `worlds/ice-mountains/island.webp` | 1024 × 683 | да | `design/source/worlds/ice-mountains/island.png` | `W-02` |
| `worlds/ice-mountains/micro.webp` | 96 × 64 | да | `design/source/worlds/ice-mountains/island.png` | `W-02` |
| `worlds/ice-mountains/overlays/completed.png` | 1024 × 683 | да | `public/assets/worlds/ice-mountains/overlays/completed.svg` | `W-02` |
| `worlds/ice-mountains/overlays/completed.svg` | 1536 × 1024 | да | `public/assets/worlds/ice-mountains/overlays/completed.svg` | `W-02` |
| `worlds/ice-mountains/overlays/current.png` | 1024 × 683 | да | `public/assets/worlds/ice-mountains/overlays/current.svg` | `W-02` |
| `worlds/ice-mountains/overlays/current.svg` | 1536 × 1024 | да | `public/assets/worlds/ice-mountains/overlays/current.svg` | `W-02` |
| `worlds/ice-mountains/overlays/locked.png` | 1024 × 683 | да | `public/assets/worlds/ice-mountains/overlays/locked.svg` | `W-02` |
| `worlds/ice-mountains/overlays/locked.svg` | 1536 × 1024 | да | `public/assets/worlds/ice-mountains/overlays/locked.svg` | `W-02` |
| `worlds/ice-mountains/thumbnail.webp` | 384 × 256 | да | `design/source/worlds/ice-mountains/island.png` | `W-02` |
| `worlds/maker-city/island.webp` | 1024 × 683 | да | `design/source/worlds/maker-city/island.png` | `W-06` |
| `worlds/maker-city/micro.webp` | 96 × 64 | да | `design/source/worlds/maker-city/island.png` | `W-06` |
| `worlds/maker-city/overlays/completed.png` | 1024 × 683 | да | `public/assets/worlds/maker-city/overlays/completed.svg` | `W-06` |
| `worlds/maker-city/overlays/completed.svg` | 1536 × 1024 | да | `public/assets/worlds/maker-city/overlays/completed.svg` | `W-06` |
| `worlds/maker-city/overlays/current.png` | 1024 × 683 | да | `public/assets/worlds/maker-city/overlays/current.svg` | `W-06` |
| `worlds/maker-city/overlays/current.svg` | 1536 × 1024 | да | `public/assets/worlds/maker-city/overlays/current.svg` | `W-06` |
| `worlds/maker-city/overlays/locked.png` | 1024 × 683 | да | `public/assets/worlds/maker-city/overlays/locked.svg` | `W-06` |
| `worlds/maker-city/overlays/locked.svg` | 1536 × 1024 | да | `public/assets/worlds/maker-city/overlays/locked.svg` | `W-06` |
| `worlds/maker-city/thumbnail.webp` | 384 × 256 | да | `design/source/worlds/maker-city/island.png` | `W-06` |
| `worlds/starter-village/island.webp` | 1024 × 683 | да | `design/source/worlds/starter-village/island.png` | `W-01` |
| `worlds/starter-village/micro.webp` | 96 × 64 | да | `design/source/worlds/starter-village/island.png` | `W-01` |
| `worlds/starter-village/overlays/completed.png` | 1024 × 683 | да | `public/assets/worlds/starter-village/overlays/completed.svg` | `W-01` |
| `worlds/starter-village/overlays/completed.svg` | 1536 × 1024 | да | `public/assets/worlds/starter-village/overlays/completed.svg` | `W-01` |
| `worlds/starter-village/overlays/current.png` | 1024 × 683 | да | `public/assets/worlds/starter-village/overlays/current.svg` | `W-01` |
| `worlds/starter-village/overlays/current.svg` | 1536 × 1024 | да | `public/assets/worlds/starter-village/overlays/current.svg` | `W-01` |
| `worlds/starter-village/overlays/locked.png` | 1024 × 683 | да | `public/assets/worlds/starter-village/overlays/locked.svg` | `W-01` |
| `worlds/starter-village/overlays/locked.svg` | 1536 × 1024 | да | `public/assets/worlds/starter-village/overlays/locked.svg` | `W-01` |
| `worlds/starter-village/thumbnail.webp` | 384 × 256 | да | `design/source/worlds/starter-village/island.png` | `W-01` |

### Персонажи — 42 файлов

| Путь от `/assets/` | Размер | Alpha | Исходник | Промпт / группа |
|---|---:|:---:|---|---|
| `characters/byte/avatar-128.webp` | 128 × 128 | да | `design/source/characters/byte/front.png` | `CHAR-03` |
| `characters/byte/avatar-256.webp` | 256 × 256 | да | `design/source/characters/byte/front.png` | `CHAR-03` |
| `characters/byte/avatar-64.webp` | 64 × 64 | да | `design/source/characters/byte/front.png` | `CHAR-03` |
| `characters/byte/back.webp` | 512 × 512 | да | `design/source/characters/byte/back.png` | `CHAR-03` |
| `characters/byte/front.webp` | 512 × 512 | да | `design/source/characters/byte/front.png` | `CHAR-03` |
| `characters/byte/happy.webp` | 512 × 512 | да | `design/source/characters/byte/happy.png` | `CHAR-03` |
| `characters/byte/side.webp` | 512 × 512 | да | `design/source/characters/byte/side.png` | `CHAR-03` |
| `characters/foxy/avatar-128.webp` | 128 × 128 | да | `design/source/characters/foxy/front.png` | `CHAR-02` |
| `characters/foxy/avatar-256.webp` | 256 × 256 | да | `design/source/characters/foxy/front.png` | `CHAR-02` |
| `characters/foxy/avatar-64.webp` | 64 × 64 | да | `design/source/characters/foxy/front.png` | `CHAR-02` |
| `characters/foxy/back.webp` | 512 × 512 | да | `design/source/characters/foxy/back.png` | `CHAR-02` |
| `characters/foxy/front.webp` | 512 × 512 | да | `design/source/characters/foxy/front.png` | `CHAR-02` |
| `characters/foxy/happy.webp` | 512 × 512 | да | `design/source/characters/foxy/happy.png` | `CHAR-02` |
| `characters/foxy/side.webp` | 512 × 512 | да | `design/source/characters/foxy/side.png` | `CHAR-02` |
| `characters/luna/avatar-128.webp` | 128 × 128 | да | `design/source/characters/luna/front.png` | `CHAR-04` |
| `characters/luna/avatar-256.webp` | 256 × 256 | да | `design/source/characters/luna/front.png` | `CHAR-04` |
| `characters/luna/avatar-64.webp` | 64 × 64 | да | `design/source/characters/luna/front.png` | `CHAR-04` |
| `characters/luna/back.webp` | 512 × 512 | да | `design/source/characters/luna/back.png` | `CHAR-04` |
| `characters/luna/front.webp` | 512 × 512 | да | `design/source/characters/luna/front.png` | `CHAR-04` |
| `characters/luna/happy.webp` | 512 × 512 | да | `design/source/characters/luna/happy.png` | `CHAR-04` |
| `characters/luna/side.webp` | 512 × 512 | да | `design/source/characters/luna/side.png` | `CHAR-04` |
| `characters/nova/avatar-128.webp` | 128 × 128 | да | `design/source/characters/nova/front.png` | `CHAR-06` |
| `characters/nova/avatar-256.webp` | 256 × 256 | да | `design/source/characters/nova/front.png` | `CHAR-06` |
| `characters/nova/avatar-64.webp` | 64 × 64 | да | `design/source/characters/nova/front.png` | `CHAR-06` |
| `characters/nova/back.webp` | 512 × 512 | да | `design/source/characters/nova/back.png` | `CHAR-06` |
| `characters/nova/front.webp` | 512 × 512 | да | `design/source/characters/nova/front.png` | `CHAR-06` |
| `characters/nova/happy.webp` | 512 × 512 | да | `design/source/characters/nova/happy.png` | `CHAR-06` |
| `characters/nova/side.webp` | 512 × 512 | да | `design/source/characters/nova/side.png` | `CHAR-06` |
| `characters/pix/avatar-128.webp` | 128 × 128 | да | `design/source/characters/pix/front.png` | `CHAR-01` |
| `characters/pix/avatar-256.webp` | 256 × 256 | да | `design/source/characters/pix/front.png` | `CHAR-01` |
| `characters/pix/avatar-64.webp` | 64 × 64 | да | `design/source/characters/pix/front.png` | `CHAR-01` |
| `characters/pix/back.webp` | 512 × 512 | да | `design/source/characters/pix/back.png` | `CHAR-01` |
| `characters/pix/front.webp` | 512 × 512 | да | `design/source/characters/pix/front.png` | `CHAR-01` |
| `characters/pix/happy.webp` | 512 × 512 | да | `design/source/characters/pix/happy.png` | `CHAR-01` |
| `characters/pix/side.webp` | 512 × 512 | да | `design/source/characters/pix/side.png` | `CHAR-01` |
| `characters/quasi/avatar-128.webp` | 128 × 128 | да | `design/source/characters/quasi/front.png` | `CHAR-05` |
| `characters/quasi/avatar-256.webp` | 256 × 256 | да | `design/source/characters/quasi/front.png` | `CHAR-05` |
| `characters/quasi/avatar-64.webp` | 64 × 64 | да | `design/source/characters/quasi/front.png` | `CHAR-05` |
| `characters/quasi/back.webp` | 512 × 512 | да | `design/source/characters/quasi/back.png` | `CHAR-05` |
| `characters/quasi/front.webp` | 512 × 512 | да | `design/source/characters/quasi/front.png` | `CHAR-05` |
| `characters/quasi/happy.webp` | 512 × 512 | да | `design/source/characters/quasi/happy.png` | `CHAR-05` |
| `characters/quasi/side.webp` | 512 × 512 | да | `design/source/characters/quasi/side.png` | `CHAR-05` |

### Наставник — 5 файлов

| Путь от `/assets/` | Размер | Alpha | Исходник | Промпт / группа |
|---|---:|:---:|---|---|
| `tutor/pix-bot-error.webp` | 512 × 512 | да | `design/source/tutor/pix-bot-error.png` | `TUTOR-02` |
| `tutor/pix-bot-hint.webp` | 512 × 512 | да | `design/source/tutor/pix-bot-hint.png` | `TUTOR-02` |
| `tutor/pix-bot-idle.webp` | 512 × 512 | да | `design/source/tutor/pix-bot-idle.png` | `TUTOR-01` |
| `tutor/pix-bot-success.webp` | 512 × 512 | да | `design/source/tutor/pix-bot-success.png` | `TUTOR-02` |
| `tutor/pix-bot-thinking.webp` | 512 × 512 | да | `design/source/tutor/pix-bot-thinking.png` | `TUTOR-02` |

### Игровые сцены — 99 файлов

| Путь от `/assets/` | Размер | Alpha | Исходник | Промпт / группа |
|---|---:|:---:|---|---|
| `game/arena/background-1440.webp` | 1440 × 810 | нет | `design/source/game/arena/background.png` | `GAME` |
| `game/arena/background-360.webp` | 360 × 203 | нет | `design/source/game/arena/background.png` | `GAME` |
| `game/arena/background-390.webp` | 390 × 219 | нет | `design/source/game/arena/background.png` | `GAME` |
| `game/arena/background-768.webp` | 768 × 432 | нет | `design/source/game/arena/background.png` | `GAME` |
| `game/arena/background.webp` | 1672 × 941 | нет | `design/source/game/arena/background.png` | `TEEN-01-background` |
| `game/arena/items/checkpoint-128.webp` | 128 × 128 | да | `design/source/game/arena/items/checkpoint.png` | `GAME` |
| `game/arena/items/checkpoint-256.webp` | 256 × 256 | да | `design/source/game/arena/items/checkpoint.png` | `GAME` |
| `game/arena/items/checkpoint.webp` | 512 × 512 | да | `design/source/game/arena/items/checkpoint.png` | `TEEN-03-builder-items` |
| `game/arena/items/chest-128.webp` | 128 × 128 | да | `design/source/game/arena/items/chest.png` | `GAME` |
| `game/arena/items/chest-256.webp` | 256 × 256 | да | `design/source/game/arena/items/chest.png` | `GAME` |
| `game/arena/items/chest.webp` | 512 × 512 | да | `design/source/game/arena/items/chest.png` | `TEEN-03-builder-items` |
| `game/arena/items/coin-128.webp` | 128 × 128 | да | `design/source/game/arena/items/coin.png` | `GAME` |
| `game/arena/items/coin-256.webp` | 256 × 256 | да | `design/source/game/arena/items/coin.png` | `GAME` |
| `game/arena/items/coin.webp` | 512 × 512 | да | `design/source/game/arena/items/coin.png` | `TEEN-03-builder-items` |
| `game/arena/items/flag-128.webp` | 128 × 128 | да | `design/source/game/arena/items/flag.png` | `GAME` |
| `game/arena/items/flag-256.webp` | 256 × 256 | да | `design/source/game/arena/items/flag.png` | `GAME` |
| `game/arena/items/flag.webp` | 512 × 512 | да | `design/source/game/arena/items/flag.png` | `TEEN-03-builder-items` |
| `game/arena/items/gate-128.webp` | 128 × 128 | да | `design/source/game/arena/items/gate.png` | `GAME` |
| `game/arena/items/gate-256.webp` | 256 × 256 | да | `design/source/game/arena/items/gate.png` | `GAME` |
| `game/arena/items/gate.webp` | 512 × 512 | да | `design/source/game/arena/items/gate.png` | `TEEN-03-builder-items` |
| `game/arena/items/heart-128.webp` | 128 × 128 | да | `design/source/game/arena/items/heart.png` | `GAME` |
| `game/arena/items/heart-256.webp` | 256 × 256 | да | `design/source/game/arena/items/heart.png` | `GAME` |
| `game/arena/items/heart.webp` | 512 × 512 | да | `design/source/game/arena/items/heart.png` | `TEEN-03-builder-items` |
| `game/arena/items/score-beacon-128.webp` | 128 × 128 | да | `design/source/game/arena/items/score-beacon.png` | `GAME` |
| `game/arena/items/score-beacon-256.webp` | 256 × 256 | да | `design/source/game/arena/items/score-beacon.png` | `GAME` |
| `game/arena/items/score-beacon.webp` | 512 × 512 | да | `design/source/game/arena/items/score-beacon.png` | `TEEN-03-builder-items` |
| `game/arena/items/speed-platform-128.webp` | 128 × 128 | да | `design/source/game/arena/items/speed-platform.png` | `GAME` |
| `game/arena/items/speed-platform-256.webp` | 256 × 256 | да | `design/source/game/arena/items/speed-platform.png` | `GAME` |
| `game/arena/items/speed-platform.webp` | 512 × 512 | да | `design/source/game/arena/items/speed-platform.png` | `TEEN-03-builder-items` |
| `game/arena/items/tree-128.webp` | 128 × 128 | да | `design/source/game/arena/items/tree.png` | `GAME` |
| `game/arena/items/tree-256.webp` | 256 × 256 | да | `design/source/game/arena/items/tree.png` | `GAME` |
| `game/arena/items/tree.webp` | 512 × 512 | да | `design/source/game/arena/items/tree.png` | `TEEN-03-builder-items` |
| `game/arena/items/wall-128.webp` | 128 × 128 | да | `design/source/game/arena/items/wall.png` | `GAME` |
| `game/arena/items/wall-256.webp` | 256 × 256 | да | `design/source/game/arena/items/wall.png` | `GAME` |
| `game/arena/items/wall.webp` | 512 × 512 | да | `design/source/game/arena/items/wall.png` | `TEEN-03-builder-items` |
| `game/arena/player/idle-128.webp` | 128 × 128 | да | `design/source/game/arena/player/idle.png` | `GAME` |
| `game/arena/player/idle-256.webp` | 256 × 256 | да | `design/source/game/arena/player/idle.png` | `GAME` |
| `game/arena/player/idle.webp` | 512 × 512 | да | `design/source/game/arena/player/idle.png` | `TEEN-04-idle` |
| `game/arena/player/jump-128.webp` | 128 × 128 | да | `design/source/game/arena/player/jump.png` | `GAME` |
| `game/arena/player/jump-256.webp` | 256 × 256 | да | `design/source/game/arena/player/jump.png` | `GAME` |
| `game/arena/player/jump.webp` | 512 × 512 | да | `design/source/game/arena/player/jump.png` | `TEEN-04-jump` |
| `game/arena/player/run-128.webp` | 128 × 128 | да | `design/source/game/arena/player/run.png` | `GAME` |
| `game/arena/player/run-256.webp` | 256 × 256 | да | `design/source/game/arena/player/run.png` | `GAME` |
| `game/arena/player/run.webp` | 512 × 512 | да | `design/source/game/arena/player/run.png` | `TEEN-04-run` |
| `game/arena/slime-amber-128.webp` | 128 × 128 | да | `design/source/game/arena/slime-amber.png` | `GAME` |
| `game/arena/slime-amber-256.webp` | 256 × 256 | да | `design/source/game/arena/slime-amber.png` | `GAME` |
| `game/arena/slime-amber.webp` | 512 × 512 | да | `design/source/game/arena/slime-amber.png` | `TEEN-02-slimes` |
| `game/arena/slime-blue-128.webp` | 128 × 128 | да | `design/source/game/arena/slime-blue.png` | `GAME` |
| `game/arena/slime-blue-256.webp` | 256 × 256 | да | `design/source/game/arena/slime-blue.png` | `GAME` |
| `game/arena/slime-blue.webp` | 512 × 512 | да | `design/source/game/arena/slime-blue.png` | `TEEN-02-slimes` |
| `game/arena/slime-violet-128.webp` | 128 × 128 | да | `design/source/game/arena/slime-violet.png` | `GAME` |
| `game/arena/slime-violet-256.webp` | 256 × 256 | да | `design/source/game/arena/slime-violet.png` | `GAME` |
| `game/arena/slime-violet.webp` | 512 × 512 | да | `design/source/game/arena/slime-violet.png` | `TEEN-02-slimes` |
| `game/robot-grid/background-1440.webp` | 1440 × 810 | нет | `design/source/game/robot-grid/background.png` | `GAME` |
| `game/robot-grid/background-360.webp` | 360 × 203 | нет | `design/source/game/robot-grid/background.png` | `GAME` |
| `game/robot-grid/background-390.webp` | 390 × 219 | нет | `design/source/game/robot-grid/background.png` | `GAME` |
| `game/robot-grid/background-768.webp` | 768 × 432 | нет | `design/source/game/robot-grid/background.png` | `GAME` |
| `game/robot-grid/background.webp` | 1672 × 941 | нет | `design/source/game/robot-grid/background.png` | `CHILD-01-background` |
| `game/robot-grid/blocked-128.webp` | 128 × 128 | да | `design/source/game/robot-grid/blocked.png` | `GAME` |
| `game/robot-grid/blocked-256.webp` | 256 × 256 | да | `design/source/game/robot-grid/blocked.png` | `GAME` |
| `game/robot-grid/blocked.webp` | 512 × 512 | да | `design/source/game/robot-grid/blocked.png` | `CHILD-02-blocked` |
| `game/robot-grid/props/bridge-128.webp` | 128 × 128 | да | `design/source/game/robot-grid/props/bridge.png` | `GAME` |
| `game/robot-grid/props/bridge-256.webp` | 256 × 256 | да | `design/source/game/robot-grid/props/bridge.png` | `GAME` |
| `game/robot-grid/props/bridge.webp` | 512 × 512 | да | `design/source/game/robot-grid/props/bridge.png` | `CHILD-03-props` |
| `game/robot-grid/props/gate-128.webp` | 128 × 128 | да | `design/source/game/robot-grid/props/gate.png` | `GAME` |
| `game/robot-grid/props/gate-256.webp` | 256 × 256 | да | `design/source/game/robot-grid/props/gate.png` | `GAME` |
| `game/robot-grid/props/gate.webp` | 512 × 512 | да | `design/source/game/robot-grid/props/gate.png` | `CHILD-03-props` |
| `game/robot-grid/props/lantern-128.webp` | 128 × 128 | да | `design/source/game/robot-grid/props/lantern.png` | `GAME` |
| `game/robot-grid/props/lantern-256.webp` | 256 × 256 | да | `design/source/game/robot-grid/props/lantern.png` | `GAME` |
| `game/robot-grid/props/lantern.webp` | 512 × 512 | да | `design/source/game/robot-grid/props/lantern.png` | `CHILD-03-props` |
| `game/robot-grid/props/mossy-rock-128.webp` | 128 × 128 | да | `design/source/game/robot-grid/props/mossy-rock.png` | `GAME` |
| `game/robot-grid/props/mossy-rock-256.webp` | 256 × 256 | да | `design/source/game/robot-grid/props/mossy-rock.png` | `GAME` |
| `game/robot-grid/props/mossy-rock.webp` | 512 × 512 | да | `design/source/game/robot-grid/props/mossy-rock.png` | `CHILD-03-props` |
| `game/robot-grid/props/signpost-128.webp` | 128 × 128 | да | `design/source/game/robot-grid/props/signpost.png` | `GAME` |
| `game/robot-grid/props/signpost-256.webp` | 256 × 256 | да | `design/source/game/robot-grid/props/signpost.png` | `GAME` |
| `game/robot-grid/props/signpost.webp` | 512 × 512 | да | `design/source/game/robot-grid/props/signpost.png` | `CHILD-03-props` |
| `game/robot-grid/props/star-crystal-128.webp` | 128 × 128 | да | `design/source/game/robot-grid/props/star-crystal.png` | `GAME` |
| `game/robot-grid/props/star-crystal-256.webp` | 256 × 256 | да | `design/source/game/robot-grid/props/star-crystal.png` | `GAME` |
| `game/robot-grid/props/star-crystal.webp` | 512 × 512 | да | `design/source/game/robot-grid/props/star-crystal.png` | `CHILD-03-props` |
| `game/robot-grid/robot-idle-128.webp` | 128 × 128 | да | `design/source/game/robot-grid/robot-idle.png` | `GAME` |
| `game/robot-grid/robot-idle-256.webp` | 256 × 256 | да | `design/source/game/robot-grid/robot-idle.png` | `GAME` |
| `game/robot-grid/robot-idle.webp` | 512 × 512 | да | `design/source/game/robot-grid/robot-idle.png` | `CHILD-02-idle` |
| `game/robot-grid/success-128.webp` | 128 × 128 | да | `design/source/game/robot-grid/success.png` | `GAME` |
| `game/robot-grid/success-256.webp` | 256 × 256 | да | `design/source/game/robot-grid/success.png` | `GAME` |
| `game/robot-grid/success.webp` | 512 × 512 | да | `design/source/game/robot-grid/success.png` | `CHILD-02-success` |
| `game/robot-grid/tiles/grass-128.webp` | 128 × 128 | да | `design/source/game/robot-grid/tiles/grass.png` | `GAME` |
| `game/robot-grid/tiles/grass.webp` | 256 × 256 | да | `design/source/game/robot-grid/tiles/grass.png` | `CHILD-01-grass` |
| `game/robot-grid/tiles/path-128.webp` | 128 × 128 | да | `design/source/game/robot-grid/tiles/path.png` | `GAME` |
| `game/robot-grid/tiles/path.webp` | 256 × 256 | да | `design/source/game/robot-grid/tiles/path.png` | `CHILD-01-path` |
| `game/robot-grid/tiles/rock-128.webp` | 128 × 128 | да | `design/source/game/robot-grid/tiles/rock.png` | `GAME` |
| `game/robot-grid/tiles/rock.webp` | 256 × 256 | да | `design/source/game/robot-grid/tiles/rock.png` | `CHILD-01-rock` |
| `game/robot-grid/tiles/water-128.webp` | 128 × 128 | да | `design/source/game/robot-grid/tiles/water.png` | `GAME` |
| `game/robot-grid/tiles/water.webp` | 256 × 256 | да | `design/source/game/robot-grid/tiles/water.png` | `CHILD-01-water` |
| `game/robot-grid/walk-contact-128.webp` | 128 × 128 | да | `design/source/game/robot-grid/walk-contact.png` | `GAME` |
| `game/robot-grid/walk-contact-256.webp` | 256 × 256 | да | `design/source/game/robot-grid/walk-contact.png` | `GAME` |
| `game/robot-grid/walk-contact.webp` | 512 × 512 | да | `design/source/game/robot-grid/walk-contact.png` | `CHILD-02-walk-contact` |
| `game/robot-grid/walk-lift-128.webp` | 128 × 128 | да | `design/source/game/robot-grid/walk-lift.png` | `GAME` |
| `game/robot-grid/walk-lift-256.webp` | 256 × 256 | да | `design/source/game/robot-grid/walk-lift.png` | `GAME` |
| `game/robot-grid/walk-lift.webp` | 512 × 512 | да | `design/source/game/robot-grid/walk-lift.png` | `CHILD-02-walk-lift` |

### Награды — 25 файлов

| Путь от `/assets/` | Размер | Alpha | Исходник | Промпт / группа |
|---|---:|:---:|---|---|
| `rewards/badges/creator-48.webp` | 48 × 48 | да | `design/source/rewards/badges/creator.png` | `REW-01` |
| `rewards/badges/creator.webp` | 256 × 256 | да | `design/source/rewards/badges/creator.png` | `REW-01` |
| `rewards/badges/first-bug-fixed-48.webp` | 48 × 48 | да | `design/source/rewards/badges/first-bug-fixed.png` | `REW-01` |
| `rewards/badges/first-bug-fixed.webp` | 256 × 256 | да | `design/source/rewards/badges/first-bug-fixed.png` | `REW-01` |
| `rewards/badges/first-code-48.webp` | 48 × 48 | да | `design/source/rewards/badges/first-code.png` | `REW-01` |
| `rewards/badges/first-code.webp` | 256 × 256 | да | `design/source/rewards/badges/first-code.png` | `REW-01` |
| `rewards/badges/first-mechanic-48.webp` | 48 × 48 | да | `design/source/rewards/badges/first-mechanic.png` | `REW-01` |
| `rewards/badges/first-mechanic.webp` | 256 × 256 | да | `design/source/rewards/badges/first-mechanic.png` | `REW-01` |
| `rewards/badges/first-report-48.webp` | 48 × 48 | да | `design/source/rewards/badges/first-report.png` | `REW-01` |
| `rewards/badges/first-report.webp` | 256 × 256 | да | `design/source/rewards/badges/first-report.png` | `REW-01` |
| `rewards/badges/first-test-48.webp` | 48 × 48 | да | `design/source/rewards/badges/first-test.png` | `REW-01` |
| `rewards/badges/first-test.webp` | 256 × 256 | да | `design/source/rewards/badges/first-test.png` | `REW-01` |
| `rewards/badges/first-world-48.webp` | 48 × 48 | да | `design/source/rewards/badges/first-world.png` | `REW-01` |
| `rewards/badges/first-world.webp` | 256 × 256 | да | `design/source/rewards/badges/first-world.png` | `REW-01` |
| `rewards/badges/function-mastery-48.webp` | 48 × 48 | да | `design/source/rewards/badges/function-mastery.png` | `REW-01` |
| `rewards/badges/function-mastery.webp` | 256 × 256 | да | `design/source/rewards/badges/function-mastery.png` | `REW-01` |
| `rewards/badges/independent-solution-48.webp` | 48 × 48 | да | `design/source/rewards/badges/independent-solution.png` | `REW-01` |
| `rewards/badges/independent-solution.webp` | 256 × 256 | да | `design/source/rewards/badges/independent-solution.png` | `REW-01` |
| `rewards/badges/loop-mastery-48.webp` | 48 × 48 | да | `design/source/rewards/badges/loop-mastery.png` | `REW-01` |
| `rewards/badges/loop-mastery.webp` | 256 × 256 | да | `design/source/rewards/badges/loop-mastery.png` | `REW-01` |
| `rewards/badges/practice-streak-48.webp` | 48 × 48 | да | `design/source/rewards/badges/practice-streak.png` | `REW-01` |
| `rewards/badges/practice-streak.webp` | 256 × 256 | да | `design/source/rewards/badges/practice-streak.png` | `REW-01` |
| `rewards/badges/ten-lessons-48.webp` | 48 × 48 | да | `design/source/rewards/badges/ten-lessons.png` | `REW-01` |
| `rewards/badges/ten-lessons.webp` | 256 × 256 | да | `design/source/rewards/badges/ten-lessons.png` | `REW-01` |
| `rewards/lesson-complete-art.webp` | 1024 × 683 | да | `design/source/rewards/lesson-complete-art.png` | `REW-03` |

### Эффекты — 8 файлов

| Путь от `/assets/` | Размер | Alpha | Исходник | Промпт / группа |
|---|---:|:---:|---|---|
| `fx/attention/amber-ripple.webp` | 512 × 512 | да | `design/source/fx/attention/amber-ripple.png` | `fx.amber-ripple` |
| `fx/bridge-unlock/frame-01-dark.webp` | 512 × 512 | да | `design/source/fx/bridge-unlock/frame-01-dark.png` | `frame-01-dark` |
| `fx/bridge-unlock/frame-02-unlocking.webp` | 512 × 512 | да | `design/source/fx/bridge-unlock/frame-02-unlocking.png` | `frame-02-unlocking` |
| `fx/bridge-unlock/frame-03-lit.webp` | 512 × 512 | да | `design/source/fx/bridge-unlock/frame-03-lit.png` | `frame-03-lit` |
| `fx/loading/violet-swirl.webp` | 512 × 512 | да | `design/source/fx/loading/violet-swirl.png` | `fx.violet-swirl` |
| `fx/particles/atlas.png` | 1024 × 1024 | да | `design/source/fx/particles-sheet.png` | `FX-01` |
| `fx/success/cyan-sparkle.webp` | 512 × 512 | да | `design/source/fx/success/cyan-sparkle.png` | `fx.cyan-sparkle` |
| `fx/success/gold-pulse.webp` | 512 × 512 | да | `design/source/fx/success/gold-pulse.png` | `fx.gold-pulse` |

### Иконки — 21 файлов

| Путь от `/assets/` | Размер | Alpha | Исходник | Промпт / группа |
|---|---:|:---:|---|---|
| `icons/accessibility.svg` | 24 × 24 | да | `public/assets/icons/accessibility.svg` | `ICON-01` |
| `icons/avatar.svg` | 24 × 24 | да | `public/assets/icons/avatar.svg` | `ICON-01` |
| `icons/book.svg` | 24 × 24 | да | `public/assets/icons/book.svg` | `ICON-01` |
| `icons/bug.svg` | 24 × 24 | да | `public/assets/icons/bug.svg` | `ICON-01` |
| `icons/code.svg` | 24 × 24 | да | `public/assets/icons/code.svg` | `ICON-01` |
| `icons/export.svg` | 24 × 24 | да | `public/assets/icons/export.svg` | `ICON-01` |
| `icons/hint.svg` | 24 × 24 | да | `public/assets/icons/hint.svg` | `ICON-01` |
| `icons/lock.svg` | 24 × 24 | да | `public/assets/icons/lock.svg` | `ICON-01` |
| `icons/map.svg` | 24 × 24 | да | `public/assets/icons/map.svg` | `ICON-01` |
| `icons/mission.svg` | 24 × 24 | да | `public/assets/icons/mission.svg` | `ICON-01` |
| `icons/piton-mark.svg` | 48 × 48 | да | `public/assets/icons/piton-mark.svg` | `ICON-01` |
| `icons/play.svg` | 24 × 24 | да | `public/assets/icons/play.svg` | `ICON-01` |
| `icons/repeat.svg` | 24 × 24 | да | `public/assets/icons/repeat.svg` | `ICON-01` |
| `icons/save.svg` | 24 × 24 | да | `public/assets/icons/save.svg` | `ICON-01` |
| `icons/settings.svg` | 24 × 24 | да | `public/assets/icons/settings.svg` | `ICON-01` |
| `icons/star.svg` | 24 × 24 | да | `public/assets/icons/star.svg` | `ICON-01` |
| `icons/stop.svg` | 24 × 24 | да | `public/assets/icons/stop.svg` | `ICON-01` |
| `icons/terminal.svg` | 24 × 24 | да | `public/assets/icons/terminal.svg` | `ICON-01` |
| `icons/test.svg` | 24 × 24 | да | `public/assets/icons/test.svg` | `ICON-01` |
| `icons/trophy.svg` | 24 × 24 | да | `public/assets/icons/trophy.svg` | `ICON-01` |
| `icons/unlock.svg` | 24 × 24 | да | `public/assets/icons/unlock.svg` | `ICON-01` |

### Иллюстрации — 19 файлов

| Путь от `/assets/` | Размер | Alpha | Исходник | Промпт / группа |
|---|---:|:---:|---|---|
| `illustrations/adult-report.webp` | 1672 × 941 | нет | `design/source/illustrations/adult-report.png` | `ILLUSTRATIONS` |
| `illustrations/data-files.webp` | 1536 × 1024 | да | `design/source/illustrations/data-files.png` | `ILLUSTRATIONS` |
| `illustrations/data-items/file-blue.png` | 512 × 512 | да | `design/source/illustrations/data-files.png` | `ILLUSTRATIONS` |
| `illustrations/data-items/file-blue.webp` | 512 × 512 | да | `design/source/illustrations/data-files.png` | `ILLUSTRATIONS` |
| `illustrations/data-items/file-gold.png` | 512 × 512 | да | `design/source/illustrations/data-files.png` | `ILLUSTRATIONS` |
| `illustrations/data-items/file-gold.webp` | 512 × 512 | да | `design/source/illustrations/data-files.png` | `ILLUSTRATIONS` |
| `illustrations/data-items/file-teal.png` | 512 × 512 | да | `design/source/illustrations/data-files.png` | `ILLUSTRATIONS` |
| `illustrations/data-items/file-teal.webp` | 512 × 512 | да | `design/source/illustrations/data-files.png` | `ILLUSTRATIONS` |
| `illustrations/data-items/folder.png` | 512 × 512 | да | `design/source/illustrations/data-files.png` | `ILLUSTRATIONS` |
| `illustrations/data-items/folder.webp` | 512 × 512 | да | `design/source/illustrations/data-files.png` | `ILLUSTRATIONS` |
| `illustrations/data-items/report.png` | 512 × 512 | да | `design/source/illustrations/data-files.png` | `ILLUSTRATIONS` |
| `illustrations/data-items/report.webp` | 512 × 512 | да | `design/source/illustrations/data-files.png` | `ILLUSTRATIONS` |
| `illustrations/data-items/table.png` | 512 × 512 | да | `design/source/illustrations/data-files.png` | `ILLUSTRATIONS` |
| `illustrations/data-items/table.webp` | 512 × 512 | да | `design/source/illustrations/data-files.png` | `ILLUSTRATIONS` |
| `illustrations/landing-hero-mobile.webp` | 705 × 941 | нет | `design/source/illustrations/landing-hero.png` | `ILLUSTRATIONS` |
| `illustrations/landing-hero.webp` | 1672 × 941 | нет | `design/source/illustrations/landing-hero.png` | `ILLUSTRATIONS` |
| `illustrations/world-boss.webp` | 1600 × 900 | нет | `design/source/illustrations/world-boss.png` | `REW-04` |
| `illustrations/world-transition-mobile.webp` | 705 × 941 | нет | `design/source/illustrations/world-transition.png` | `ILLUSTRATIONS` |
| `illustrations/world-transition.webp` | 1672 × 941 | нет | `design/source/illustrations/world-transition.png` | `ILLUSTRATIONS` |

### Обложки проектов — 3 файлов

| Путь от `/assets/` | Размер | Alpha | Исходник | Промпт / группа |
|---|---:|:---:|---|---|
| `projects/thumb-adult.webp` | 768 × 768 | нет | `design/source/projects/thumb-adult.png` | `PROJECTS` |
| `projects/thumb-child.webp` | 768 × 768 | нет | `design/source/projects/thumb-child.png` | `PROJECTS` |
| `projects/thumb-teen.webp` | 768 × 768 | нет | `design/source/projects/thumb-teen.png` | `PROJECTS` |

## Приложение B. Семь дизайнерских референсов

| Файл | Размер | Alpha | Исходник | Промпт / группа |
|---|---:|:---:|---|---|
| `design/references/characters-style-reference.webp` | 1024 × 1024 | нет | `design/source/characters/style-reference.png` | `CHAR-00` |
| `design/references/adult-workbench.webp` | 1672 × 941 | нет | `design/source/references/adult-workbench.png` | `REFERENCES` |
| `design/references/child-lesson.webp` | 1672 × 941 | нет | `design/source/references/child-lesson.png` | `REFERENCES` |
| `design/references/dashboard-desktop.webp` | 1672 × 941 | нет | `design/source/references/dashboard-desktop.png` | `REFERENCES` |
| `design/references/icon-system.webp` | 1402 × 1122 | да | `design/source/references/icon-system.png` | `REFERENCES` |
| `design/references/onboarding-modes.webp` | 1672 × 941 | нет | `design/source/references/onboarding-modes.png` | `REFERENCES` |
| `design/references/teen-builder.webp` | 1672 × 941 | нет | `design/source/references/teen-builder.png` | `REFERENCES` |

Согласованный пользовательский референс `design/brief/APPROVED_MAP_REFERENCE.png` хранится вместе с заданием и не входит в семь сгенерированных reference-only экспортов манифеста.
