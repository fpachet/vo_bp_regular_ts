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
