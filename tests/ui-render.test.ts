import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import * as nodeModule from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React, { type ComponentType, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LearningMode, ProgressSummary } from '../packages/contracts';
import type { AppContextValue } from '../src/context';

/**
 * Initial-render and local-asset audit only.
 * React effects, browser interactions, network requests and Python execution are
 * not exercised here. Runtime and API behavior have separate integration suites.
 * Vite ?raw resources are loaded from their real files before dynamic UI imports.
 * No dev server, browser, DOM imitation or external preload flag is required.
 */
if (typeof nodeModule.registerHooks === 'function') {
  nodeModule.registerHooks({
    load(url, context, nextLoad) {
      if (url.startsWith('file:') && url.endsWith('?raw')) {
        return {
          format: 'module',
          source: `export default ${JSON.stringify(readFileSync(new URL(url), 'utf8'))};`,
          shortCircuit: true,
        };
      }
      return nextLoad(url, context);
    },
  });
} else {
  nodeModule.register(new URL('./ui-raw-loader.mjs', import.meta.url));
}

const [application, contextModule, journey, browse, account, progressPage, projectsPage, onboarding, tutor, lessonPage, scene, utils, curriculum, serverProfiles, serverProgress] = await Promise.all([
  import('../src/PitonApp'),
  import('../src/context'),
  import('../src/screens/Journey'),
  import('../src/screens/Browse'),
  import('../src/screens/Account'),
  import('../src/screens/Progress'),
  import('../src/screens/Projects'),
  import('../src/screens/Onboarding'),
  import('../src/screens/Tutor'),
  import('../src/screens/Lesson'),
  import('../src/components/Scene'),
  import('../src/lib/utils'),
  import('../packages/curriculum'),
  import('../packages/server/profiles'),
  import('../packages/server/progress'),
]);

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = path.join(projectRoot, 'public');
const learningModes: LearningMode[] = ['child', 'teen', 'adult'];
const { worlds, lessons, missions } = curriculum;
const readyMissions = missions.filter(mission => mission.available);
const guestRoutes = [
  '/', '/map', '/theory', '/practice', '/missions', '/auth', '/profile',
  '/progress', '/projects', '/tutor', '/lesson/u1-l1', '/lesson/u5-l2',
  '/mission/m22', '/builder/new', '/workbench/new', '/world/forest-loops', '/unknown',
];
const generalPages: [string, ComponentType][] = [
  ['map', journey.JourneyPage], ['theory', browse.TheoryPage],
  ['practice', browse.PracticePage], ['missions', browse.MissionsPage],
  ['profile', account.ProfilePage], ['auth', account.AuthPage],
  ['progress', progressPage.ProgressPage], ['projects', projectsPage.ProjectsPage],
  ['onboarding', onboarding.OnboardingPage], ['tutor', tutor.TutorPage],
];

interface RenderAudit {
  renders: Map<string, string>;
  assetPaths: Set<string>;
}
let cachedAudit: RenderAudit | undefined;

function unexpectedAction(): never {
  throw new Error('An initial server render must not invoke an application action.');
}

function fixture(mode: LearningMode): AppContextValue {
  const profile = serverProfiles.makeProfile('ui-audit-owner', 'Аудит', mode, '2026-10-18T00:00:00.000Z', `ui-audit-${mode}`);
  profile.onboarded = true;
  const xp = lessons.reduce((sum, lesson) => sum + lesson.xp, 0);
  const progress: ProgressSummary = {
    ...utils.emptyProgress, xp, level: Math.floor(xp / 100) + 1,
    completedLessonIds: lessons.map(lesson => lesson.id),
  };
  return {
    path: '/map',
    auth: {
      user: { id: 'ui-audit-owner', email: null, isDemo: true, authMethod: 'demo' },
      profiles: [profile], activeProfileId: profile.id, csrfToken: 'ui-audit-token', authMode: 'local',
    },
    profile, progress, worldStates: serverProgress.worldProgress(progress.completedLessonIds), loading: false,
    navigate: unexpectedAction, refresh: unexpectedAction, refreshProgress: unexpectedAction,
    selectProfile: unexpectedAction, updateProfile: unexpectedAction, setMode: unexpectedAction,
    notify: unexpectedAction, beginJourney: unexpectedAction, onboardingNext: '/lesson/u1-l1',
  };
}

function renderAudit(): RenderAudit {
  if (cachedAudit) return cachedAudit;
  const renders = new Map<string, string>();
  const assetPaths = new Set<string>();
  function capture(label: string, element: ReactElement) {
    let markup: string;
    try { markup = renderToStaticMarkup(element); }
    catch (error) { throw new Error(`SSR failed for ${label}`, { cause: error }); }
    assert.ok(markup.length > 100, `${label} produced unexpectedly empty markup.`);
    assert.match(markup, /<main(?:\s|>)/, `${label} is missing its main landmark.`);
    assert.ok(!renders.has(label), `Duplicate render scenario: ${label}`);
    renders.set(label, markup);
    for (const match of markup.matchAll(/(?:src|href)="(\/assets\/[^"<>]+)"/g)) assetPaths.add(match[1]);
  }

  for (const initialPath of guestRoutes) {
    capture(`guest:${initialPath}`, React.createElement(application.default, { initialPath }));
  }
  for (const mode of learningModes) {
    const value = fixture(mode);
    const wrap = (url: string, element: ReactElement) => React.createElement(contextModule.AppContext.Provider, { value: { ...value, path: url } }, element);
    for (const [name, Page] of generalPages) {
      capture(`${mode}:${name}`, wrap(`/${name}`, React.createElement(Page)));
    }
    for (const world of worlds) {
      capture(`${mode}:world:${world.id}`, wrap(`/world/${world.slug}`, React.createElement(journey.WorldPage, { slug: world.slug })));
    }
    for (const lesson of lessons) {
      capture(`${mode}:lesson:${lesson.id}`, wrap(`/lesson/${lesson.id}`, React.createElement(lessonPage.LessonPage, { lessonId: lesson.id })));
    }
    for (const mission of readyMissions) {
      capture(`${mode}:mission:${mission.id}`, wrap(`/mission/${mission.id}`, React.createElement(lessonPage.LessonPage, { missionId: mission.id })));
    }
    const builderPath = mode === 'adult' ? '/workbench/new' : '/builder/new';
    capture(`${mode}:builder`, wrap(builderPath, React.createElement(lessonPage.LessonPage, { projectId: 'new' })));
  }
  return cachedAudit = { renders, assetPaths };
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(filename) : [filename];
  });
}

function referencedAssets(): Set<string> {
  const assets = new Set(renderAudit().assetPaths);
  for (const filename of sourceFiles(path.join(projectRoot, 'src')).filter(file => /\.(tsx?|css)$/.test(file))) {
    for (const match of readFileSync(filename, 'utf8').matchAll(/["'](\/assets\/[^"'\s]+\.(?:png|webp|svg))["']/g)) assets.add(match[1]);
  }
  // Expand the finite selectors that cannot all be active in one initial render.
  for (const avatar of ['pix', 'foxy', 'byte', 'luna', 'quasi', 'nova']) {
    for (const pose of ['front', 'side', 'back', 'happy', 'avatar-64', 'avatar-128', 'avatar-256']) assets.add(`/assets/characters/${avatar}/${pose}.webp`);
  }
  for (const world of worlds) {
    for (const status of ['current', 'locked', 'completed']) assets.add(`/assets/worlds/${world.id}/overlays/${status}.svg`);
  }
  for (const [kind] of scene.builderPalette) assets.add(`/assets/game/arena/items/${kind}-128.webp`);
  for (const pose of ['robot-idle', 'blocked', 'success', 'walk-contact', 'walk-lift']) assets.add(`/assets/game/robot-grid/${pose}-256.webp`);
  return assets;
}

test('initial React renders cover guest routes and every ready lesson/mission in all three modes', t => {
  const { renders } = renderAudit();
  const expected = guestRoutes.length + learningModes.length * (generalPages.length + worlds.length + lessons.length + readyMissions.length + 1);
  assert.equal(renders.size, expected);
  assert.ok(renders.size >= 116, 'The published initial-render audit must retain its coverage.');
  for (const mode of learningModes) {
    assert.ok(renders.has(`${mode}:lesson:u1-l1`));
    assert.ok(renders.has(`${mode}:lesson:u5-l2`));
    assert.ok(renders.has(`${mode}:mission:m22`));
  }
  t.diagnostic(`${renders.size} initial renders passed. Effects, interaction and Python execution are outside this suite.`);
});

test('every rendered, literal and finite dynamic graphical asset resolves to a nonempty public file', t => {
  const assets = referencedAssets();
  assert.ok(assets.size >= 129, 'The asset audit unexpectedly lost known dynamic selectors.');
  const missing: string[] = [];
  for (const asset of assets) {
    const filename = path.resolve(publicRoot, `.${asset}`);
    assert.ok(filename.startsWith(publicRoot + path.sep), `Asset path leaves public/: ${asset}`);
    if (!existsSync(filename) || !statSync(filename).isFile() || statSync(filename).size === 0) missing.push(asset);
  }
  assert.deepEqual(missing, []);
  t.diagnostic(`${assets.size} graphical paths exist and contain bytes. This is filesystem validation, not an HTTP or visual-layout test.`);
});

test('a new workbench starts in its report format even when the profile prefers another mode', () => {
  // This checks the actual initial component output. It does not simulate a
  // browser mode switch or claim to test preservation of an edited DOM buffer.
  for (const preferredMode of ['child', 'teen'] as const) {
    const value = { ...fixture(preferredMode), path: '/workbench/new' };
    const markup = renderToStaticMarkup(React.createElement(contextModule.AppContext.Provider, { value },
      React.createElement(lessonPage.LessonPage, { projectId: 'new' })));
    assert.match(markup, /lesson-page mode-adult/, `${preferredMode} preference must not change a workbench's format.`);
    assert.match(markup, /def build_report/, 'The workbench must start with the report task, not robot/arena code.');
    assert.doesNotMatch(markup, /lesson-mode-picker/, 'A project has a fixed format instead of a lesson mode switch.');
  }
});
