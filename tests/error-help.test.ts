import assert from 'node:assert/strict';
import test from 'node:test';
import { errorHelpText } from '../src/lib/errorHelp';

test('runtime availability errors explain that Python and its trace never started', () => {
  const help = errorHelpText('RuntimeUnavailable', 'runtime-unavailable');
  assert.match(help, /Python не запустился/);
  assert.match(help, /«По шагам» пуста/);
  assert.doesNotMatch(help, /отмеченной строки/);
});

test('Python errors keep their actionable source-level guidance', () => {
  assert.match(errorHelpText('SyntaxError', 'syntax'), /двоеточие, скобки и кавычки/);
  assert.match(errorHelpText('NameError', 'name'), /Python не нашёл это имя/);
});
