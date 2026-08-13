# Code signing policy

This policy describes how AIVPlayer release artifacts are built, reviewed, and
submitted for code signing.

> Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/)

## Project

- Project: AIVPlayer
- Source repository: <https://github.com/ponponon/aivplayer>
- Project website: <https://aivplayer.pages.dev/>
- License: MIT
- Supported release artifacts: Windows installers and other artifacts produced
  by the repository's documented release workflows.

The Microsoft Store MSIX distribution is a separate path: Microsoft re-signs
MSIX packages after certification. This policy applies to AIVPlayer artifacts
that are submitted to SignPath for signing, such as the Windows installer used
for direct distribution.

## Roles

- Committer and reviewer: [ponponon](https://github.com/ponponon), the project
  owner and maintainer.
- SignPath approver: [ponponon](https://github.com/ponponon).

External contributions are reviewed by the maintainer before they are merged
into a release branch. If additional maintainers or reviewers are added, this
document will be updated before they receive signing responsibilities.

## Build and signing process

1. A release is built from the source revision, build scripts, and CI
   configuration committed to the AIVPlayer repository.
2. The release workflow produces artifacts with one consistent product version
   and records the source revision used for the build.
3. The maintainer reviews the release contents, checks the generated hashes,
   and verifies that the artifact is the intended AIVPlayer build before
   requesting a signature.
4. Every SignPath signing request is manually approved by the SignPath
   approver after the release review.
5. Only AIVPlayer's own release artifacts are submitted for signing. Third-party
   open-source components are included according to their licenses and are not
   represented as AIVPlayer source code or independently signed as AIVPlayer
   binaries.
6. The signed artifact is published through the corresponding release page.

Signing credentials, tokens, and private keys must never be committed to the
repository, release notes, or public issue discussions. CI secrets are stored
in the repository or signing service's protected secret store.

## Security and privacy

AIVPlayer is an open-source local-first desktop application. Its source code,
build scripts, and third-party license information are publicly reviewable.
The application does not upload local media by default. Network access can be
requested by the user for model downloads, update checks, LAN/Web features, or
for sending text to an AI provider configured by the user.

The complete application privacy policy is available at
<https://aivplayer.pages.dev/privacy/> and in the repository at
[`docs/site/privacy/index.html`](docs/site/privacy/index.html).

The installer provides an uninstall path. Changes to system integration, such
as installing the `aivcli` launcher, are documented as part of the installation
flow.

## Policy maintenance

This policy is reviewed whenever the signing workflow, release ownership,
artifact scope, privacy behavior, or contributor roles change. Questions and
requests for policy changes can be opened in the
[GitHub issue tracker](https://github.com/ponponon/aivplayer/issues).

Last updated: 2026-08-12
