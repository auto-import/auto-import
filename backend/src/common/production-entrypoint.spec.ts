import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('production entry point', () => {
  it('starts the JavaScript path emitted by the Nest build', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts['start:prod']).toBe('node dist/src/main.js');
  });
});
