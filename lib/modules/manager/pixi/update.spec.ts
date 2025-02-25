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

    // it('updates', () => {
    //   const { bumpedContent } = projectUpdater.bumpPackageVersion(
    //     content,
    //     '0.0.1',
    //     'minor',
    //   );
    //   const expected = content.replace('0.0.2', '0.1.0');
    //   expect(bumpedContent).toEqual(expected);
    // });

    // it('returns content if bumping errors', () => {
    //   const { bumpedContent } = projectUpdater.bumpPackageVersion(
    //     content,
    //     '0.0.2',
    //     true as any,
    //   );
    //   expect(bumpedContent).toEqual(content);
    // });
  });
});
