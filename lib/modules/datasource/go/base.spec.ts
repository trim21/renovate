import { mockDeep } from 'vitest-mock-extended';
import { GlobalConfig } from '../../../config/global';
import * as _hostRules from '../../../util/host-rules';
import { GitTagsDatasource } from '../git-tags';
import { GithubTagsDatasource } from '../github-tags';
import { GitlabTagsDatasource } from '../gitlab-tags';
import { BaseGoDatasource } from './base';
import { Fixtures } from '~test/fixtures';
import * as httpMock from '~test/http-mock';

vi.mock('../../../util/host-rules', () => mockDeep());

const hostRules = vi.mocked(_hostRules);

describe('modules/datasource/go/base', () => {
  describe('simple cases', () => {
    it.each`
      module                                              | datasource          | packageName
      ${'gopkg.in/foo'}                                   | ${'github-tags'}    | ${'go-foo/foo'}
      ${'gopkg.in/foo/bar'}                               | ${'github-tags'}    | ${'foo/bar'}
      ${'github.com/foo/bar'}                             | ${'github-tags'}    | ${'foo/bar'}
      ${'bitbucket.org/foo/bar'}                          | ${'bitbucket-tags'} | ${'foo/bar'}
      ${'code.cloudfoundry.org/lager'}                    | ${'github-tags'}    | ${'cloudfoundry/lager'}
      ${'dev.azure.com/foo/bar/_git/baz.git'}             | ${'git-tags'}       | ${'https://dev.azure.com/foo/bar/_git/baz'}
      ${'dev.azure.com/foo/bar/baz.git'}                  | ${'git-tags'}       | ${'https://dev.azure.com/foo/bar/_git/baz'}
      ${'gitea.com/go-chi/cache'}                         | ${'gitea-tags'}     | ${'go-chi/cache'}
      ${'code.forgejo.org/go-chi/cache'}                  | ${'gitea-tags'}     | ${'go-chi/cache'}
      ${'codeberg.org/eviedelta/detctime/durationparser'} | ${'gitea-tags'}     | ${'eviedelta/detctime'}
    `(
      '$module -> $datasource: $packageName',
      async ({ module, datasource, packageName }) => {
        const res = await BaseGoDatasource.getDatasource(module);
        expect(res).toMatchObject({ datasource, packageName });
      },
    );
  });

  describe('go-get requests', () => {
    beforeEach(() => {
      hostRules.find.mockReturnValue({});
      hostRules.hosts.mockReturnValue([]);
      GlobalConfig.reset();
    });

    describe('meta name=go-source', () => {
      it('returns null for unknown prefix', async () => {
        const meta =
          '<meta name="go-source" content="golang.org/x/text https://github.com/golang/text/ foobar">';
        httpMock
          .scope('https://example.com')
          .get('/x/text?go-get=1')
          .reply(200, meta);

        const res = await BaseGoDatasource.getDatasource('example.com/x/text');

        expect(res).toBeNull();
      });

      it('returns null for unknown datasource', async () => {
        httpMock
          .scope('https://example.com')
          .get('/example/module?go-get=1')
          .reply(200);

        const res = await BaseGoDatasource.getDatasource(
          'example.com/example/module',
        );

        expect(res).toBeNull();
      });

      it('returns null for go-import prefix mismatch', async () => {
        const mismatchResponse = Fixtures.get('go-get-github-ee.html').replace(
          'git.enterprise.com/example/module',
          'git.enterprise.com/badexample/badmodule',
        );
        httpMock
          .scope('https://example.com')
          .get('/example/module?go-get=1')
          .reply(200, mismatchResponse);

        const res = await BaseGoDatasource.getDatasource(
          'example.com/example/module',
        );

        expect(res).toBeNull();
      });

      it('supports GitHub deps', async () => {
        httpMock
          .scope('https://golang.org')
          .get('/x/text?go-get=1')
          .reply(200, Fixtures.get('go-get-github.html'));

        const res = await BaseGoDatasource.getDatasource('golang.org/x/text');

        expect(res).toEqual({
          datasource: GithubTagsDatasource.id,
          packageName: 'golang/text',
          registryUrl: 'https://github.com',
        });
      });

      it('supports GitHub EE deps', async () => {
        hostRules.hostType.mockReturnValue('github');
        httpMock
          .scope('https://git.enterprise.com')
          .get('/example/module?go-get=1')
          .reply(200, Fixtures.get('go-get-github-ee.html'));

        const res = await BaseGoDatasource.getDatasource(
          'git.enterprise.com/example/module',
        );

        expect(res).toEqual({
          datasource: GithubTagsDatasource.id,
          packageName: 'example/module',
          registryUrl: 'https://git.enterprise.com',
        });
      });

      it.skip('supports Go submodules in GitLab repo', async () => {
        httpMock
          .scope('https://gitlab.com')
          .get('/example/module/submodule?go-get=1')
          .reply(200, Fixtures.get('go-get-submodule-gitlab.html'));

        const res = await BaseGoDatasource.getDatasource(
          'gitlab.com/example/module/submodule',
        );

        expect(res).toEqual({
          datasource: GitlabTagsDatasource.id,
          packageName: 'example/module',
          registryUrl: 'https://gitlab.com',
        });
      });

      it('supports GitLab deps', async () => {
        httpMock
          .scope('https://gitlab.com')
          .get('/group/subgroup?go-get=1')
          .reply(200, Fixtures.get('go-get-gitlab.html'));

        const res = await BaseGoDatasource.getDatasource(
          'gitlab.com/group/subgroup',
        );

        expect(res).toEqual({
          datasource: GitlabTagsDatasource.id,
          packageName: 'group/subgroup',
          registryUrl: 'https://gitlab.com',
        });
      });

      it('supports GitLab deps on private subgroups', async () => {
        httpMock
          .scope('https://gitlab.com')
          .get('/group/subgroup/private?go-get=1')
          .reply(200, Fixtures.get('go-get-gitlab.html'));

        const res = await BaseGoDatasource.getDatasource(
          'gitlab.com/group/subgroup/private.git/v3',
        );

        expect(res).toEqual({
          datasource: GitlabTagsDatasource.id,
          packageName: 'group/subgroup/private',
          registryUrl: 'https://gitlab.com',
        });
      });

      it('does not fail for names containing .git', async () => {
        httpMock
          .scope('https://gitlab.com')
          .get('/group/subgroup/my.git.module?go-get=1')
          .reply(200, Fixtures.get('go-get-gitlab.html'));

        const res = await BaseGoDatasource.getDatasource(
          'gitlab.com/group/subgroup/my.git.module',
        );

        expect(res).toEqual({
          datasource: GitlabTagsDatasource.id,
          packageName: 'group/subgroup/my.git.module',
          registryUrl: 'https://gitlab.com',
        });
      });

      it('supports GitLab with URL mismatch', async () => {
        const mismatchingResponse = Fixtures.get('go-get-github.html').replace(
          'https://github.com/golang/text/',
          'https://gitlab.com/golang/text/',
        );
        httpMock
          .scope('https://golang.org')
          .get('/x/text?go-get=1')
          .reply(200, mismatchingResponse);

        const res = await BaseGoDatasource.getDatasource('golang.org/x/text');

        expect(res).toEqual({
          datasource: GitlabTagsDatasource.id,
          packageName: 'golang/text',
          registryUrl: 'https://gitlab.com',
        });
      });

      it('supports GitLab deps with version', async () => {
        httpMock
          .scope('https://gitlab.com')
          .get('/group/subgroup/v2?go-get=1')
          .reply(200, Fixtures.get('go-get-gitlab.html'));

        const res = await BaseGoDatasource.getDatasource(
          'gitlab.com/group/subgroup/v2',
        );

        expect(res).toEqual({
          datasource: GitlabTagsDatasource.id,
          packageName: 'group/subgroup',
          registryUrl: 'https://gitlab.com',
        });
      });

      it('returns null for invalid GitLab EE go-source URL', async () => {
        hostRules.hostType.mockReturnValue('gitlab');
        httpMock
          .scope('https://my.custom.domain')
          .get('/golang/myrepo?go-get=1')
          .reply(
            200,
            `<meta name="go-source" content="my.custom.domain/golang/myrepo invalid-url"/>`,
          );

        const res = await BaseGoDatasource.getDatasource(
          'my.custom.domain/golang/myrepo',
        );

        expect(res).toBeNull();
      });

      it('supports GitLab EE deps', async () => {
        hostRules.hostType.mockReturnValue('gitlab');
        httpMock
          .scope('https://my.custom.domain')
          .get('/golang/myrepo?go-get=1')
          .reply(200, Fixtures.get('go-get-gitlab-ee.html'));

        const res = await BaseGoDatasource.getDatasource(
          'my.custom.domain/golang/myrepo',
        );

        expect(res).toEqual({
          datasource: GitlabTagsDatasource.id,
          packageName: 'golang/myrepo',
          registryUrl: 'https://my.custom.domain',
        });
      });

      it('supports GitLab EE deps in subgroup', async () => {
        hostRules.hostType.mockReturnValue('gitlab');
        httpMock
          .scope('https://my.custom.domain')
          .get('/golang/subgroup/myrepo?go-get=1')
          .reply(200, Fixtures.get('go-get-gitlab-ee-subgroup.html'));

        const res = await BaseGoDatasource.getDatasource(
          'my.custom.domain/golang/subgroup/myrepo',
        );

        expect(res).toEqual({
          datasource: GitlabTagsDatasource.id,
          packageName: 'golang/subgroup/myrepo',
          registryUrl: 'https://my.custom.domain',
        });
      });

      it('supports GitLab EE deps in private subgroup with api/ as part of packageName and api/v4 as part of endpoint', async () => {
        GlobalConfig.set({ endpoint: 'https://my.custom.domain/api/v4' });

        hostRules.hostType.mockReturnValue('gitlab');
        httpMock
          .scope('https://my.custom.domain')
          .get('/group/subgroup-api/myrepo?go-get=1')
          .reply(
            200,
            Fixtures.get('go-get-gitlab-ee-private-subgroup-api.html'),
          );

        const res = await BaseGoDatasource.getDatasource(
          'my.custom.domain/group/subgroup-api/myrepo',
        );

        expect(res).toEqual({
          datasource: GitlabTagsDatasource.id,
          packageName: 'group/subgroup-api/myrepo',
          registryUrl: 'https://my.custom.domain/',
        });
      });

      it('supports GitLab EE deps in subgroup with version', async () => {
        hostRules.hostType.mockReturnValue('gitlab');
        httpMock
          .scope('https://my.custom.domain')
          .get('/golang/subgroup/myrepo/v2?go-get=1')
          .reply(200, Fixtures.get('go-get-gitlab-ee-subgroup.html'));

        const res = await BaseGoDatasource.getDatasource(
          'my.custom.domain/golang/subgroup/myrepo/v2',
        );

        expect(res).toEqual({
          datasource: GitlabTagsDatasource.id,
          packageName: 'golang/subgroup/myrepo',
          registryUrl: 'https://my.custom.domain',
        });
      });

      it('supports GitLab EE deps in private subgroup with vcs indicator', async () => {
        hostRules.hostType.mockReturnValue('gitlab');
        httpMock
          .scope('https://my.custom.domain')
          .get('/golang/subgroup/myrepo?go-get=1')
          .reply(200, Fixtures.get('go-get-gitlab-ee-private-subgroup.html'));

        const res = await BaseGoDatasource.getDatasource(
          'my.custom.domain/golang/subgroup/myrepo.git/v2',
        );

        expect(res).toEqual({
          datasource: GitlabTagsDatasource.id,
          packageName: 'golang/subgroup/myrepo',
          registryUrl: 'https://my.custom.domain',
        });
      });

      it('supports GitLab EE deps in private subgroup with vcs indicator and subfolders', async () => {
        hostRules.hostType.mockReturnValue('gitlab');
        httpMock
          .scope('https://my.custom.domain')
          .get('/golang/subgroup/myrepo?go-get=1')
          .reply(200, Fixtures.get('go-get-gitlab-ee-private-subgroup.html'));

        const res = await BaseGoDatasource.getDatasource(
          'my.custom.domain/golang/subgroup/myrepo.git/v2/database',
        );

        expect(res).toEqual({
          datasource: GitlabTagsDatasource.id,
          packageName: 'golang/subgroup/myrepo',
          registryUrl: 'https://my.custom.domain',
        });
      });

      it('supports GitLab EE monorepo deps in subgroup', async () => {
        hostRules.hostType.mockReturnValue('gitlab');
        httpMock
          .scope('https://my.custom.domain')
          .get('/golang/subgroup/myrepo/monorepo?go-get=1')
          .reply(200, Fixtures.get('go-get-gitlab-ee-subgroup.html'));

        const res = await BaseGoDatasource.getDatasource(
          'my.custom.domain/golang/subgroup/myrepo/monorepo',
        );

        expect(res).toEqual({
          datasource: GitlabTagsDatasource.id,
          packageName: 'golang/subgroup/myrepo',
          registryUrl: 'https://my.custom.domain',
        });
      });

      it('handles fyne.io', async () => {
        const meta =
          '<meta name="go-import" content="fyne.io/fyne git https://github.com/fyne-io/fyne">';
        httpMock
          .scope('https://fyne.io')
          .get('/fyne?go-get=1')
          .reply(200, meta);

        const res = await BaseGoDatasource.getDatasource('fyne.io/fyne');

        expect(res).toEqual({
          datasource: GithubTagsDatasource.id,
          registryUrl: 'https://github.com',
          packageName: 'fyne-io/fyne',
        });
      });

      it('handles fyne.io - go-import no quotes', async () => {
        const meta =
          '<meta name=go-import content="fyne.io/fyne git https://github.com/fyne-io/fyne">';
        httpMock
          .scope('https://fyne.io')
          .get('/fyne?go-get=1')
          .reply(200, meta);

        const res = await BaseGoDatasource.getDatasource('fyne.io/fyne');

        expect(res).toEqual({
          datasource: GithubTagsDatasource.id,
          registryUrl: 'https://github.com',
          packageName: 'fyne-io/fyne',
        });
      });

      it('handles go-import with gitlab source', async () => {
        const meta =
          '<meta name="go-import" content="my.custom.domain/golang/myrepo git https://gitlab.com/golang/myrepo.git">';
        httpMock
          .scope('https://my.custom.domain')
          .get('/golang/myrepo?go-get=1')
          .reply(200, meta);

        const res = await BaseGoDatasource.getDatasource(
          'my.custom.domain/golang/myrepo',
        );

        expect(res).toEqual({
          datasource: GitlabTagsDatasource.id,
          registryUrl: 'https://gitlab.com',
          packageName: 'golang/myrepo',
        });
      });

      it('handles go-import with azure devops source', async () => {
        const meta =
          '<meta name="go-import" content="org.visualstudio.com/my-project/_git/my-repo.git git https://org.visualstudio.com/my-project/_git/my-repo.git" />';
        httpMock
          .scope('https://org.visualstudio.com')
          .get('/my-project/_git/my-repo?go-get=1')
          .reply(200, meta);
        const res = await BaseGoDatasource.getDatasource(
          'org.visualstudio.com/my-project/_git/my-repo.git',
        );
        expect(res).toEqual({
          datasource: GitTagsDatasource.id,
          packageName: 'https://org.visualstudio.com/my-project/_git/my-repo',
        });
      });

      it('returns null for invalid azure devops source', async () => {
        httpMock
          .scope('https://dev.azure.com')
          .get('/foo/bar?go-get=1')
          .reply(200);

        const res = await BaseGoDatasource.getDatasource(
          'dev.azure.com/foo/bar.git',
        );

        expect(res).toBeNull();
      });

      it('handles uncommon imports', async () => {
        const meta =
          '<meta name="go-import" content="example.com/uncommon git ssh://git.example.com/uncommon">';
        httpMock
          .scope('https://example.com')
          .get('/uncommon?go-get=1')
          .reply(200, meta);

        const res = await BaseGoDatasource.getDatasource(
          'example.com/uncommon',
        );

        expect(res).toEqual({
          datasource: GitTagsDatasource.id,
          packageName: 'ssh://git.example.com/uncommon',
        });
      });

      it('returns null for mod imports', async () => {
        const meta =
          '<meta name="go-import" content="buf.build/gen/go/gogo/protobuf/protocolbuffers/go mod https://buf.build/gen/go">';
        httpMock
          .scope('https://buf.build')
          .get('/gen/go/gogo/protobuf/protocolbuffers/go?go-get=1')
          .reply(200, meta);

        const res = await BaseGoDatasource.getDatasource(
          'buf.build/gen/go/gogo/protobuf/protocolbuffers/go',
        );

        expect(res).toBeNull();
      });

      it('returns null for invalid import URL', async () => {
        const meta =
          '<meta name="go-import" content="buf.build/gen/go/gogo/protobuf/protocolbuffers/go git foobar">';
        httpMock
          .scope('https://buf.build')
          .get('/gen/go/gogo/protobuf/protocolbuffers/go?go-get=1')
          .reply(200, meta);

        const res = await BaseGoDatasource.getDatasource(
          'buf.build/gen/go/gogo/protobuf/protocolbuffers/go',
        );

        expect(res).toBeNull();
      });

      it('correctly splits a URL where the endpoint is contained', async () => {
        hostRules.hostType.mockReturnValue('gitlab');

        GlobalConfig.set({ endpoint: 'https://example.com/gitlab/api/v4/' });

        const meta =
          '<meta name="go-import" content="example.com/gitlab/my-project/my-repo.git git https://example.com/gitlab/my-project/my-repo" />';
        httpMock
          .scope('https://example.com')
          .get('/gitlab/my-project/my-repo?go-get=1')
          .reply(200, meta);

        const res = await BaseGoDatasource.getDatasource(
          'example.com/gitlab/my-project/my-repo.git',
        );

        expect(res).toEqual({
          datasource: GitlabTagsDatasource.id,
          packageName: 'my-project/my-repo',
          registryUrl: 'https://example.com/gitlab/',
        });

        GlobalConfig.set({ endpoint: 'https://example.com/gitlab/' });

        httpMock
          .scope('https://example.com')
          .get('/gitlab/my-project/my-repo?go-get=1')
          .reply(200, meta);

        const res2 = await BaseGoDatasource.getDatasource(
          'example.com/gitlab/my-project/my-repo.git',
        );

        expect(res2).toEqual({
          datasource: GitlabTagsDatasource.id,
          packageName: 'my-project/my-repo',
          registryUrl: 'https://example.com/gitlab/',
        });
      });
    });
  });
});
