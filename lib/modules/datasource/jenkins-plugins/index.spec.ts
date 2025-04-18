import { getPkgReleases } from '..';
import type { Timestamp } from '../../../util/timestamp';
import * as versioning from '../../versioning/docker';
import type {
  JenkinsPluginsInfoResponse,
  JenkinsPluginsVersionsResponse,
} from './types';
import { JenkinsPluginsDatasource } from '.';
import * as httpMock from '~test/http-mock';

const jenkinsPluginsInfo: JenkinsPluginsInfoResponse = {
  plugins: {
    foobar: {
      name: 'foobar',
      scm: 'https://source-url.example.com',
    },
  },
};

const jenkinsPluginsVersions: JenkinsPluginsVersionsResponse = {
  plugins: {
    foobar: {
      '1.0.0': {
        version: '1.0.0',
        url: 'https://download.example.com',
      },
      '2.0.0': {
        version: '2.0.0',
        url: 'https://download.example.com',
        buildDate: 'Jan 02, 2020',
      },
      '3.0.0': {
        version: '3.0.0',
        url: 'https://download.example.com',
        releaseTimestamp: '2020-05-13T00:11:40.00Z' as Timestamp,
        requiredCore: '2.164.3',
      },
    },
  },
};

describe('modules/datasource/jenkins-plugins/index', () => {
  describe('getReleases', () => {
    const params = {
      versioning: versioning.id,
      datasource: JenkinsPluginsDatasource.id,
      packageName: 'foobar',
      registryUrls: ['https://updates.jenkins.io/'],
    };

    afterEach(() => {
      if (!httpMock.allUsed()) {
        throw new Error('Not all http mocks have been used!');
      }
    });

    it('returns null for a package miss', async () => {
      const newparams = { ...params };
      newparams.packageName = 'non-existing';

      httpMock
        .scope('https://updates.jenkins.io')
        .get('/current/update-center.actual.json')
        .reply(200, jenkinsPluginsInfo);

      expect(await getPkgReleases(newparams)).toBeNull();
    });

    it('returns package releases for a hit for info and releases', async () => {
      httpMock
        .scope('https://updates.jenkins.io')
        .get('/current/update-center.actual.json')
        .reply(200, jenkinsPluginsInfo);

      httpMock
        .scope('https://updates.jenkins.io')
        .get('/current/plugin-versions.json')
        .reply(200, jenkinsPluginsVersions);

      const res = await getPkgReleases(params);

      expect(res).toEqual({
        registryUrl: 'https://updates.jenkins.io',
        releases: [
          {
            downloadUrl: 'https://download.example.com',
            version: '1.0.0',
          },
          {
            downloadUrl: 'https://download.example.com',
            releaseTimestamp: '2020-01-02T00:00:00.000Z' as Timestamp,
            version: '2.0.0',
          },
          {
            downloadUrl: 'https://download.example.com',
            releaseTimestamp: '2020-05-13T00:11:40.000Z' as Timestamp,
            version: '3.0.0',
          },
        ],
        sourceUrl: 'https://source-url.example.com',
      });
    });

    it('returns package releases for a hit for info and miss for releases', async () => {
      httpMock
        .scope('https://updates.jenkins.io')
        .get('/current/update-center.actual.json')
        .reply(200, jenkinsPluginsInfo);

      httpMock
        .scope('https://updates.jenkins.io')
        .get('/current/plugin-versions.json')
        .reply(200, {});

      const res = await getPkgReleases(params);
      expect(res).toEqual({
        releases: [],
        sourceUrl: 'https://source-url.example.com',
      });
    });

    it('returns null empty response', async () => {
      httpMock
        .scope('https://updates.jenkins.io')
        .get('/current/update-center.actual.json')
        .reply(200, {});

      expect(await getPkgReleases(params)).toBeNull();
    });

    it('returns package releases from a custom registry', async () => {
      httpMock
        .scope('https://custom.registry.renovatebot.com')
        .get('/current/update-center.actual.json')
        .reply(200, jenkinsPluginsInfo);

      httpMock
        .scope('https://custom.registry.renovatebot.com')
        .get('/current/plugin-versions.json')
        .reply(200, jenkinsPluginsVersions);

      const res = await getPkgReleases({
        versioning: versioning.id,
        datasource: JenkinsPluginsDatasource.id,
        packageName: 'foobar',
        registryUrls: ['https://custom.registry.renovatebot.com'],
        constraints: { jenkins: '2.164.0' },
      });

      expect(res).toEqual({
        registryUrl: 'https://custom.registry.renovatebot.com',
        releases: [
          {
            downloadUrl: 'https://download.example.com',
            version: '1.0.0',
          },
          {
            downloadUrl: 'https://download.example.com',
            releaseTimestamp: '2020-01-02T00:00:00.000Z' as Timestamp,
            version: '2.0.0',
          },
          {
            downloadUrl: 'https://download.example.com',
            releaseTimestamp: '2020-05-13T00:11:40.000Z' as Timestamp,
            version: '3.0.0',
          },
        ],
        sourceUrl: 'https://source-url.example.com',
      });
    });
  });
});
