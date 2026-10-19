import type { LearningMode, LessonVariant, Question, JsonObject, JsonValue } from '../contracts';
import type { Assertion, ExecutionCase, SceneFixture, TestCase } from '../runtime/contracts';

export const modes: LearningMode[] = ['child', 'teen', 'adult'];
export const scenes = { child: 'robot', teen: 'arena', adult: 'report' } as const;
export const ok: Assertion = { kind: 'statusEquals', expected: 'ok' };
export const arenaFixture: SceneFixture = {
  kind: 'arena', width: 1000, height: 600,
  allowedEnemies: ['slime', 'slime-blue', 'slime-amber', 'slime-violet'], maxEnemies: 100,
};
export const robotFixture = (steps = 5): Extract<SceneFixture, { kind: 'robot' }> => ({
  kind: 'robot', width: steps + 1, height: 1, start: { x: 0, y: 0 },
  direction: 'east', goal: { x: steps, y: 0 },
});

export function scriptCase(globals: JsonObject = {}, scene?: SceneFixture): ExecutionCase {
  return { fixtures: { globals, ...(scene ? { scene } : {}) }, probe: { kind: 'script' } };
}
export function callCase(functionName: string, args: JsonValue[], scene?: SceneFixture): ExecutionCase {
  return { fixtures: scene ? { scene } : {}, probe: { kind: 'call', functionName, args } };
}
export function testCase(id: string, label: string, execution: ExecutionCase, assertions: Assertion[]): TestCase {
  return { id, label, ...execution, assertions: [ok, ...assertions] };
}
export function stdoutTest(id: string, label: string, expected: string, execution: ExecutionCase): TestCase {
  return testCase(id, label, execution, [{ kind: 'stdoutEquals', expected }]);
}
export function returnTest(id: string, label: string, functionName: string, args: JsonValue[], expected: JsonValue, scene?: SceneFixture): TestCase {
  return testCase(id, label, callCase(functionName, args, scene), [{ kind: 'returnEquals', expected }]);
}
export function previewOf(test: TestCase): ExecutionCase {
  return { fixtures: test.fixtures, probe: test.probe };
}
export function q(prompt: string, choices: string[], correctIndex: number, explanation: string): Question {
  return { id: '', prompt, choices, correctIndex, explanation };
}

type VariantDraft = Omit<LessonVariant, 'id' | 'mode' | 'scene'>;
export function makeVariant(coreId: string, mode: LearningMode, draft: VariantDraft): LessonVariant {
  const orderQuestion = (question: Question, suffix: string): Question => {
    const id = `${coreId}:${mode}:${suffix}`;
    const offset = [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % question.choices.length;
    return { ...question, id,
      choices: [...question.choices.slice(offset), ...question.choices.slice(0, offset)],
      correctIndex: (question.correctIndex - offset + question.choices.length) % question.choices.length,
    };
  };
  return {
    ...draft, id: `${coreId}:${mode}:v1`, mode, scene: scenes[mode],
    questions: draft.questions.map((question, i) => orderQuestion(question, `q${i + 1}`)),
    reflection: orderQuestion(draft.reflection, 'reflection'),
    tests: draft.tests.map(test => ({ ...test, id: `${coreId}:${mode}:${test.id}` })),
  };
}
