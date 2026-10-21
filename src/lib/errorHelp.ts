export function errorHelpText(type: string, category: string): string {
  if (type === 'RuntimeUnavailable' || category === 'runtime-unavailable')
    return 'Python не запустился в браузере. Код ещё не выполнялся, поэтому вкладка «По шагам» пуста. Повтори запуск; если ошибка вернётся, перезагрузи страницу.';
  if (type === 'IndentationError' || type === 'TabError')
    return 'Проверь отступы: строки внутри for, if и def начинаются с четырёх пробелов.';
  if (type === 'NameError')
    return 'Python не нашёл это имя. Сравни написание и убедись, что значение создано до использования.';
  if (type === 'TypeError')
    return 'Операция получила неподходящий тип или число аргументов. Посмотри на входные данные и вызов функции.';
  if (type === 'SyntaxError')
    return 'Проверь двоеточие, скобки и кавычки рядом с отмеченной строкой.';
  if (type === 'IndexError')
    return 'Индекс вышел за границу списка. Нумерация начинается с нуля; пустой список требует отдельного внимания.';
  if (category.includes('boundary') || type.includes('Boundary'))
    return 'Робот дошёл до границы. Проверь, нет ли лишней команды или повторения.';
  if (type === 'FileNotFoundError')
    return 'Сравни имя в open(...) с файлом в разделе «Файлы проекта».';
  return 'Начни с отмеченной строки. Сравни то, что ожидалось, с настоящими значениями на вкладке «По шагам».';
}
