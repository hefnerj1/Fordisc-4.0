# Public Repository Setup

## Recommended repository identity

- **Repository name:** `fordisc4` or `fordisc4-public`
- **Description:** `Public information, access details, and release notes for FORDISC 4.0.`
- **Visibility:** Public
- **Suggested topics:** `fordisc`, `forensic-anthropology`, `forensic-science`, `craniometrics`, `postcranial`, `discriminant-analysis`

Keep this repository completely separate from the private application repository. Do not add the private repository as a submodule, mirror its commit history, attach production release archives, or copy internal validation and deployment files here.

## Publish with GitHub Pages

1. Create a new empty public repository. Do not initialize it with a README, license, or `.gitignore` because this package already includes those files.
2. Push the contents of this folder to the repository's `main` branch.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Choose the `main` branch and the repository root (`/`).
6. Save and wait for the Pages deployment to finish.

The included `.nojekyll` file ensures the dependency-free static site is served directly.

## Repository settings recommended for the initial launch

- Disable **Wiki** and **Projects** unless they will be actively managed.
- Consider leaving **Issues** disabled initially; subscription and eligibility support should continue through the published support email.
- Use GitHub Releases for public release notes only. Do not attach private source, reference data, or deployable application packages.
- Protect the `main` branch so updates are deliberate.
- Add the GitHub Pages URL to the repository's website field.

## Optional custom subdomain

The production application already occupies `www.fordisc.com`. If a branded Pages address is desired later, use a separate subdomain such as `updates.fordisc.com` or `project.fordisc.com`; do not point `www.fordisc.com` away from the application.
