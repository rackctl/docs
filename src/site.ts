/**
 * Site-wide constants that appear in more than one place.
 *
 * The install command is shown in the hero and documented in `install.md`. They
 * must agree — a hero advertising a command the install page contradicts is a
 * broken first impression — but Markdown cannot import, so `scripts/check-build.mjs`
 * asserts the docs page still contains this exact string and fails the build if it
 * drifts.
 */

export const INSTALL_COMMAND = "curl -fsSL rackctl.sh/install | sh";

/** Where `install.md` must repeat INSTALL_COMMAND, for the build-time assertion. */
export const INSTALL_DOC = "src/content/docs/install.md";
