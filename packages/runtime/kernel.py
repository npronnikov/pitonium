"""Trusted educational harness, executed inside a fresh Pyodide worker.

Import and file guards are teaching controls, NOT a security sandbox. Browser
origin isolation, CSP and worker termination form the client-side boundary.
"""
import builtins as _builtins
import contextlib as _contextlib
import io as _io
import json as _json
import math as _math
import os as _os
import re as _re
import sys as _sys
import time as _time
import traceback as _traceback
import types as _types


def _piton_run(payload):
    started = _time.monotonic()
    limits = payload['limits']
    case = payload['case']
    fixtures = case.get('fixtures', {})
    scene = fixtures.get('scene', {})
    events, trace = [], []
    truncated = {'stdout': False, 'events': False, 'trace': False, 'files': False}
    position = dict(scene.get('start', {'x': 0, 'y': 0}))
    direction = scene.get('direction', 'east')
    directions = ['east', 'south', 'west', 'north']
    blocked = {(p['x'], p['y']) for p in scene.get('blocked', [])}
    trace_bytes = 0
    exported = []
    result_value = None
    returned = False
    status, error = 'ok', None
    cwd = '/piton/workspace'
    _os.makedirs(cwd, exist_ok=True)
    _os.chdir(cwd)

    class GameBlocked(RuntimeError):
        pass

    class EventLimitError(RuntimeError):
        pass

    class ExecutionLimitError(RuntimeError):
        pass

    class BoundedOutput(_io.TextIOBase):
        def __init__(self):
            self.parts = []
            self.byte_count = 0

        def write(self, text):
            text = str(text)
            data = text.encode('utf8', errors='replace')
            budget = max(0, limits['stdoutBytes'] - self.byte_count)
            if len(data) > budget:
                truncated['stdout'] = True
                data = data[:budget]
            self.parts.append(data.decode('utf8', errors='ignore'))
            self.byte_count += len(data)
            return len(text)

        def flush(self):
            pass

        def text(self):
            return ''.join(self.parts)

    stdout, stderr = BoundedOutput(), BoundedOutput()

    def emit(kind, values, actor=False):
        if len(events) >= limits['eventCount']:
            truncated['events'] = True
            raise EventLimitError('Слишком много игровых действий за один запуск.')
        event = {'index': len(events) + 1, 'type': kind, 'payload': values}
        if actor:
            event['actorId'] = 'robot_1'
        events.append(event)

    def checked_id(value):
        if not isinstance(value, str) or not _re.fullmatch(r'[a-zA-Z][a-zA-Z0-9_-]{0,63}', value):
            raise ValueError('Нужен короткий идентификатор объекта, без HTML, адреса или пути.')
        return value

    def move(steps=1):
        if isinstance(steps, bool) or not isinstance(steps, int) or abs(steps) > 512:
            raise ValueError('Число шагов должно быть целым, от -512 до 512.')
        dx, dy = {'east': (1, 0), 'south': (0, 1), 'west': (-1, 0), 'north': (0, -1)}[direction]
        if steps < 0:
            dx, dy = -dx, -dy
        width, height = scene.get('width', 64), scene.get('height', 1)
        for _ in range(abs(steps)):
            x, y = position['x'] + dx, position['y'] + dy
            if not (0 <= x < width and 0 <= y < height) or (x, y) in blocked:
                raise GameBlocked('Робот не может сделать следующий шаг: граница поля или препятствие.')
            position.update(x=x, y=y)
            emit('actor.move', {'dx': dx, 'dy': dy}, actor=True)

    def turn(value):
        nonlocal direction
        if value in ('left', 'right', 'back'):
            delta = {'left': -1, 'right': 1, 'back': 2}[value]
            direction = directions[(directions.index(direction) + delta) % 4]
        elif value in directions:
            direction = value
        else:
            raise ValueError("Поворот: 'left', 'right', 'back' или направление света.")
        emit('actor.turn', {'direction': direction}, actor=True)

    def say(text):
        text = str(text)
        if len(text) > 400 or _re.search(r'[<>]|(?:https?:|javascript:|data:)', text, _re.I):
            raise ValueError('Игровая реплика должна быть обычным коротким текстом, без HTML и URL.')
        emit('actor.say', {'text': text}, actor=True)

    def collect(item_id='star'):
        emit('item.collect', {'itemId': checked_id(item_id)}, actor=True)

    def spawn(kind, x=0, y=0):
        checked_id(kind)
        allowed = scene.get('allowedEnemies', ['slime', 'slime-blue', 'slime-amber', 'slime-violet'])
        if kind not in allowed:
            raise ValueError('Такого врага нет в библиотеке этой сцены.')
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not _math.isfinite(v) for v in (x, y)):
            raise ValueError('Координаты должны быть конечными числами.')
        if not (0 <= x < scene.get('width', 4096) and 0 <= y < scene.get('height', 4096)):
            raise GameBlocked('Нельзя создать врага за пределами арены.')
        if sum(event['type'] == 'enemy.spawn' for event in events) >= scene.get('maxEnemies', 100):
            raise EventLimitError('Достигнут предел числа врагов в этой сцене.')
        emit('enemy.spawn', {'kind': kind, 'x': x, 'y': y})

    def score(value):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not _math.isfinite(value) or abs(value) > 1000000000:
            raise ValueError('Счёт должен быть конечным числом допустимого размера.')
        emit('score.update', {'value': value})

    game = _types.ModuleType('game')
    game.move, game.turn, game.say, game.collect, game.spawn, game.score = move, turn, say, collect, spawn, score
    game.open_gate = lambda gate_id='gate': emit('gate.open', {'gateId': checked_id(gate_id)})
    game.complete = lambda: emit('scene.complete', {'success': True})
    _sys.modules['game'] = game

    for file in fixtures.get('files', []):
        path = file['path']
        if not _re.fullmatch(r'[a-zA-Z0-9_][a-zA-Z0-9_./-]*', path) or any(p in ('..', '.', '') for p in path.split('/')):
            raise ValueError('Недопустимый путь входного файла.')
        parent = _os.path.dirname(path)
        if parent:
            _os.makedirs(parent, exist_ok=True)
        with _builtins.open(path, 'w', encoding='utf8') as handle:
            handle.write(file['content'])

    stdin_lines = iter(fixtures.get('stdin', []))

    def input_line(prompt=''):
        if prompt:
            stdout.write(str(prompt))
        try:
            return next(stdin_lines)
        except StopIteration:
            raise EOFError('Входные строки закончились. Добавьте данные для input().') from None

    real_import = _builtins.__import__

    def educational_import(name, *args, **kwargs):
        # This guard makes the intended API explicit; it is not a sandbox.
        if name.split('.')[0] in ('js', 'pyodide', 'pyodide_js', '_pyodide', 'micropip'):
            raise ImportError('Мост браузера и установка пакетов недоступны в учебном задании.')
        return real_import(name, *args, **kwargs)

    def workspace_open(file, *args, **kwargs):
        if not isinstance(file, (str, bytes, _os.PathLike)):
            raise PermissionError('Открывайте файл по имени в папке задания.')
        path = _os.path.realpath(_os.fsdecode(file))
        if not path.startswith(cwd + '/'):
            raise PermissionError('Файлы задания находятся только в его виртуальной папке.')
        return _builtins.open(file, *args, **kwargs)

    safe_builtins = dict(vars(_builtins))
    safe_builtins.update(input=input_line, open=workspace_open, __import__=educational_import)
    namespace = {'__name__': '__main__', '__builtins__': safe_builtins, 'game': game,
                 'move': move, 'say': say, 'spawn_enemy': spawn}
    namespace.update(fixtures.get('globals', {}))

    def small_value(value, depth=0):
        if value is None or isinstance(value, (bool, int)):
            return value
        if isinstance(value, float):
            return value if _math.isfinite(value) else str(value)
        if isinstance(value, str):
            return value[:300] + ('…' if len(value) > 300 else '')
        if depth >= 2:
            return '<' + type(value).__name__[:60] + '>'
        if isinstance(value, (list, tuple)):
            return [small_value(v, depth + 1) for v in value[:16]]
        if isinstance(value, dict):
            return {str(k)[:60]: small_value(v, depth + 1) for k, v in list(value.items())[:16]}
        return '<' + type(value).__name__[:60] + '>'

    execution_started = _time.monotonic()

    def tracer(frame, event, arg):
        nonlocal trace_bytes
        if frame.f_code.co_filename != '<lesson>':
            return None
        if _time.monotonic() - execution_started > limits['executionMs'] / 1000:
            raise ExecutionLimitError('Время выполнения закончилось. Проверьте условие цикла.')
        if event == 'line':
            if len(trace) >= limits['traceSnapshots']:
                truncated['trace'] = True
                return tracer
            visible = {}
            for key, value in list(frame.f_locals.items())[:60]:
                if key.startswith('_') or key in ('game', 'move', 'say', 'spawn_enemy') or callable(value):
                    continue
                visible[key[:80]] = '[скрыто]' if _re.search('password|token|secret|email', key, _re.I) else small_value(value)
                if len(visible) >= 20:
                    break
            snapshot = {'line': frame.f_lineno, 'locals': visible, 'eventIndex': len(events)}
            snapshot_bytes = len(_json.dumps(snapshot, ensure_ascii=False).encode('utf8'))
            if trace_bytes + snapshot_bytes <= limits['traceBytes']:
                trace.append(snapshot)
                trace_bytes += snapshot_bytes
            else:
                truncated['trace'] = True
        return tracer

    try:
        compiled = compile(payload['code'], '<lesson>', 'exec')
        with _contextlib.redirect_stdout(stdout), _contextlib.redirect_stderr(stderr):
            _sys.settrace(tracer)
            try:
                exec(compiled, namespace, namespace)
                probe = case['probe']
                if probe['kind'] == 'call':
                    function = namespace.get(probe['functionName'])
                    if not callable(function):
                        raise NameError('Определите функцию ' + probe['functionName'] + '. Она пока не найдена.')
                    result_value = function(*probe.get('args', []))
                    # Return values cross the boundary only as plain JSON.
                    encoded = _json.dumps(result_value, ensure_ascii=False, allow_nan=False)
                    if len(encoded.encode('utf8')) > 262144:
                        raise ValueError('Возвращаемое значение слишком большое для учебной проверки.')
                    result_value = _json.loads(encoded)
                    returned = True
            finally:
                _sys.settrace(None)
    except BaseException as exc:
        _sys.settrace(None)
        status = 'timeout' if isinstance(exc, ExecutionLimitError) else 'error'
        line = getattr(exc, 'lineno', None)
        if line is None:
            user_frames = [f for f in _traceback.extract_tb(exc.__traceback__) if f.filename == '<lesson>']
            if user_frames:
                line = user_frames[-1].lineno
        category = ('blocked' if isinstance(exc, GameBlocked) else
                    'timeout' if status == 'timeout' else
                    'syntax' if isinstance(exc, (SyntaxError, IndentationError)) else
                    'name' if isinstance(exc, NameError) else
                    'type' if isinstance(exc, TypeError) else 'runtime')
        error = {'type': type(exc).__name__, 'message': str(exc)[:2000], 'line': line,
                 'traceback': ''.join(_traceback.format_exception(type(exc), exc, exc.__traceback__))[-8000:],
                 'category': category}

    budget = limits['filesBytes']
    for base, dirs, files in _os.walk(cwd, followlinks=False):
        dirs[:] = sorted(d for d in dirs if not _os.path.islink(_os.path.join(base, d)))[:32]
        for name in sorted(files):
            full = _os.path.join(base, name)
            path = _os.path.relpath(full, cwd)
            if _os.path.islink(full) or not _re.fullmatch(r'[a-zA-Z0-9_][a-zA-Z0-9_./-]*', path):
                continue
            try:
                size = _os.path.getsize(full)
                if size > budget or len(exported) >= 32:
                    truncated['files'] = True
                    continue
                with _builtins.open(full, 'r', encoding='utf8') as handle:
                    content = handle.read(budget + 1)
                encoded = content.encode('utf8')
                if len(encoded) > budget:
                    truncated['files'] = True
                    continue
                exported.append({'path': path, 'content': content, 'encoding': 'utf8', 'bytes': len(encoded)})
                budget -= len(encoded)
            except (OSError, UnicodeError):
                truncated['files'] = True
    output = {'status': status, 'stdout': stdout.text(), 'stderr': stderr.text(), 'error': error,
              'events': events, 'trace': trace, 'dataFiles': exported, 'robotPosition': position,
              'elapsedMs': round((_time.monotonic() - started) * 1000, 2), 'truncated': truncated}
    if returned:
        output['returnValue'] = result_value
    return _json.dumps(output, ensure_ascii=False, allow_nan=False)
