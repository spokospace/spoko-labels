# Backward compatibility

What this project treats as a protected contract surface, and how a change to one must be handled. Review skills check PRs against this file; implementation skills warn when a change would break it.

## Versioning

All packages follow [semver](https://semver.org). Until `1.0.0`, a minor version may break a contract, but only with a changelog entry under **Breaking** and a migration note in the package README. From `1.0.0`, breaking changes need a major version and a deprecation window of at least one minor release where the old form still works and warns.

## Protected surfaces

| Surface | Where | Breaking change | Required path |
|---|---|---|---|
| Package public API | exports of each `@spokospace/labels-*` package (*planned*) | removing or renaming an export, changing a signature or a return shape, tightening accepted input | deprecate first (JSDoc `@deprecated` + console warning), changelog, version bump |
| Template format | the template JSON schema (*planned*, versioned by a `version` field) | removing a field, changing units or meaning of a field, rendering an existing template differently on purpose | bump the schema version and ship a migration from the previous version; old templates keep rendering |
| Niimbot import output | `packages/niimbot-import` (*planned*) | different JSON for the same Niimbot input | same as the template format |
| Embed API | the dialog's options, events and URL/hash parameters (*planned*) | removing or renaming an option, event or parameter; changing its meaning | deprecation window, changelog |
| Web app deep links | `apps/web` URL/hash parameters such as `#add=…` (*planned*) | removing or renaming a parameter; links that worked stop working | keep accepting the old form for at least one minor release |
| Printer protocol behavior | `packages/core` (*planned*) | a printer model that printed correctly stops printing correctly | hardware evidence for every supported model in the PR; never a silent change |

## Not a contract

- Internal modules not exported from a package entry point.
- The exact pixels of a label between minor versions, as long as layout, text and QR content stay the same (anti-aliasing and threshold tweaks are allowed; golden images are updated in the same PR).
- Files under `.ai/` and `.claude/`.
