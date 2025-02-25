import { describe, expect, it, vi } from 'vitest';

import { fs } from '../../../../test/util';
import { extractPackageFile } from '.';

vi.mock('../../../util/fs');

const pyprojectToml = `
[project]
dependencies = []
name = "pixi-py"
requires-python = ">= 3.11"
version = "0.1.0"

[build-system]
build-backend = "hatchling.build"
requires = ["hatchling"]

[tool.pixi.project]
channels = ["conda-forge"]
platforms = ["osx-arm64"]

[tool.pixi.pypi-dependencies]
pixi_py = { path = ".", editable = true }

[tool.pixi.tasks]
`;

const pixiToml = `
[project]
authors = []
channels = ["conda-forge"]
name = "data"
platforms = ["win-64"]
version = "0.1.0"

[tasks]

[dependencies]
python = "3.12.*"
geographiclib = ">=2.0,<3"
geopy = ">=2.4.1,<3"
cartopy = ">=0.24.0,<0.25"
pydantic = "2.*"
matplotlib = ">=3.10.0,<4"
pyqt = ">=5.15.9,<6"
pandas = ">=2.2.3,<3"
python-dateutil = ">=2.9.0.post0,<3"
rich = ">=13.9.4,<14"
scipy = ">=1.15.2,<2"
tqdm = ">=4.67.1,<5"
tzdata = ">=2025a"
numpy = "2.*"
adjusttext = ">=1.3.0,<2"
iris = ">=3.11.1,<4"
`;

const pyprojectWithoutPixi = `
[project]
authors = ["Trim21 <trim21.me@gmail.com>"]
channels = ["conda-forge"]
name = "pixi"
platforms = ["win-64"]
version = "0.1.0"

[tasks]

[dependencies]
python = '==3.12'
numpy = { version = "*", build = "py312*" }

# scipy = { version = "==1.15.1", channel = "anaconda" }
[pypi-dependencies]

[environments]
lint = { features = ['lint'] }
test = { features = ['test'] }
scipy = { features = ['scipy'] }

[feature.scipy]
channels = ["anaconda"]
dependencies = { scipy = "==1.15.1" }
target.win-64 = { dependencies = { matplotlib = "==3.10.0" } }

[feature.lint.dependencies]
ruff = '==0.9.7'

[feature.lint.pypi-dependencies]
flake8 = '*'

[feature.lint.target.win-64.pypi-dependencies]
black = '==25.*'

[feature.test.pypi-dependencies]
urllib3 = { url = "https://github.com/urllib3/urllib3/releases/download/2.3.0/urllib3-2.3.0-py3-none-any.whl" }
pytest = { git = "https://github.com/pytest-dev/pytest.git" }
requests = { git = "https://github.com/psf/requests.git", rev = "0106aced5faa299e6ede89d1230bd6784f2c3660" }

[feature.test.pypi-dependencies.pytest-github-actions-annotate-failures]
git = 'https://github.com/pytest-dev/pytest-github-actions-annotate-failures.git'
rev = "v0.3.0"
`;

describe('modules/manager/pixi/extract', () => {
  describe('extractPackageFile()', () => {
    it('returns null for empty pyproject.toml', async () => {
      expect(
        await extractPackageFile('nothing here', 'pyproject.toml'),
      ).toBeNull();
    });

    it('returns null for empty pixi.toml', async () => {
      expect(await extractPackageFile('nothing here', 'pixi.toml')).toBeNull();
    });

    it('returns null for parsed file without pixi section', async () => {
      expect(
        await extractPackageFile(pyprojectWithoutPixi, 'pyproject.toml'),
      ).toBeNull();
    });

    it('returns parse pixi.toml', async () => {
      expect(await extractPackageFile(pixiToml, 'pixi.toml')).toMatchObject({
        deps: [],
        fileFormat: 'toml',
        lockFiles: [],
      });
    });

    it('returns parse pixi section from pyproject.toml', async () => {
      fs.getSiblingFileName.mockReturnValueOnce('pixi.lock');
      fs.localPathExists.mockReturnValueOnce(Promise.resolve(true));

      expect(
        await extractPackageFile(pyprojectToml, 'pyproject.toml'),
      ).toMatchObject({
        deps: [],
        fileFormat: 'toml',
        lockFiles: ['pixi.lock'],
      });
    });
  });
});
