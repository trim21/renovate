import { codeBlock } from 'common-tags';
import * as projectUpdater from '.';

describe('modules/manager/pixi/update', () => {
  describe('updateDependency()', () => {
    const content = codeBlock`
      [project]
      name = "test"
      version = "0.0.2"
      description = "test"
    `;

    it('increments', () => {
      const actual = projectUpdater.updateDependency({
        fileContent: content,
        upgrade: {
          newValue: '0.0.3',
          managerData: {
            path: ['project', 'version'],
          },
        },
      });

      const expected = content.replace('0.0.2', '0.0.3');
      expect(actual).toEqual(expected);
    });

    it('no ops', () => {
      const actual = projectUpdater.updateDependency({
        fileContent: content,
        upgrade: {
          newValue: '0.0.3',
          managerData: {
            path: ['dep', 'version', 'version'],
          },
        },
      });
      expect(actual).toEqual(content);
    });

    it('no ops without object path', () => {
      const actual = projectUpdater.updateDependency({
        fileContent: content,
        upgrade: {
          newValue: '0.0.3',
        },
      });
      expect(actual).toEqual(content);
    });
  });
});
