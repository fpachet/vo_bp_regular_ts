# npm prerelease checklist

Target: `markov-constraints@0.4.0-rc.1`, public access, `next` tag.
Registry lookup on 2026-10-05 returned E404 for the name; publication still
depends on registry acceptance and an authenticated maintainer account.

1. Run `npm test` and `npm run test:package`; wait for Node 20/22/24, Python
   parity, Chromium and Firefox CI checks on the release commit.
2. Run `npm pack --cache /tmp/markov-npm-cache`, then validate that exact tarball
   with `npm run test:package -- /absolute/path/markov-constraints-0.4.0-rc.1.tgz`.
3. Tag the checked commit `v0.4.0-rc.1` and create a GitHub prerelease with the
   exact validated tarball and SHA-256 checksum attached.
4. Authenticate locally with `npm login`, check `npm whoami`, then publish the
   same tarball:

   ```sh
   npm publish ./markov-constraints-0.4.0-rc.1.tgz --tag next --access public
   ```

   `publishConfig` defaults to the public npm registry and `next`; do not promote
   this prerelease to `latest`. Complete any npm account/2FA challenge personally.

5. Verify `npm view markov-constraints@0.4.0-rc.1 version dist.integrity` and
   `npm dist-tag ls markov-constraints`, then run
   `npm run test:package -- markov-constraints@0.4.0-rc.1` in a fresh consumer.
6. Update README, installation guide and playground to link the npm package and
   remove “publication pending” only after the registry check succeeds. Record
   registry validation in the GitHub release notes and commit/push the docs.

Never commit authentication tokens or copy them into release notes. The manual
GitHub artifact workflow validates and packs; it does not publish to npm.

References: [npm publish](https://docs.npmjs.com/cli/commands/npm-publish/),
[npm authentication](https://docs.npmjs.com/about-two-factor-authentication/).

## Result on 2026-10-05

- Kept the available unscoped name `markov-constraints`; configured public
  registry publishing with `next` as the default tag.
- Reviewed the public entry points and documented prerelease compatibility,
  read-only inspection buffers, Node/browser/Worker usage and memory tradeoffs.
- Release commit: `a6aa8484e16430d003760feb54de7c69e0692573`.
- [CI](https://github.com/fpachet/vo_bp_regular_ts/actions/runs/37313093508)
  passed all Node 20/22/24 tests, Python parity and Chromium/Firefox cases.
- [Pages deployment](https://github.com/fpachet/vo_bp_regular_ts/actions/runs/37313093547)
  and [release-artifact workflow](https://github.com/fpachet/vo_bp_regular_ts/actions/runs/37313287212)
  passed.
- Created [GitHub prerelease v0.4.0-rc.1](https://github.com/fpachet/vo_bp_regular_ts/releases/tag/v0.4.0-rc.1)
  with the tested 30 kB tarball and SHA-256 checksum. Downloaded the public
  artifact and verified it in a fresh strict TypeScript consumer, including
  the executable README quick start and browser Bundler type resolution.
- Tarball SHA-256: `ee3a2b08c89f820a4586aba8cf36c73c1d96cc7e70bd9ba82653dfb4ff811453`.
- npm publication and registry-install verification remain blocked by missing
  maintainer authentication (`npm whoami` returns `ENEEDAUTH`). The package is
  installable from the GitHub release; npm availability is not claimed.
