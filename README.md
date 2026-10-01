# notify-for-visibility

tag the people who care about a part of the code when a PR changes it. a github comment, a slack message, or both. visibility only, it never requests a review or blocks a merge

## usage

add a workflow:

```yaml
# .github/workflows/notify-for-visibility.yml
name: notify-for-visibility
on:
  pull_request:
    types: [opened, reopened, synchronize, ready_for_review]
permissions:
  contents: read
  pull-requests: write
concurrency:
  group: notify-for-visibility-${{ github.event.pull_request.number }}
jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: hydra-db/notify-for-visibility@v1
        with:
          slack-token: ${{ secrets.SLACK_BOT_TOKEN }} # optional
```

and the rules, on your default branch:

```yaml
# .github/notify-for-visibility.yml
# yaml-language-server: $schema=https://raw.githubusercontent.com/hydra-db/notify-for-visibility/v1/schema/config.schema.json
people:
  tushar: { github: tushar-hydradb, slack: U0123ABCD }
  kim: { github: kim }

slack:
  channel: C0456EFGH

rules:
  - name: go-ash
    change:
      - paths: ["goash/**", "platform/goash/**"]
    notify:
      - person: tushar
        via: [github, slack]

  - name: graph-queries
    change:
      - paths: ["**/*.go"]
        ast-grep:
          language: go
          rule:
            any:
              - kind: interpreted_string_literal
              - kind: raw_string_literal
            regex: '\b(MATCH|MERGE|CREATE)\b'
    notify:
      - person: kim
        via: [github]
        comment: new or changed cypher, worth a look at index usage
```

## config

- `people` maps a name to a `github` login and, optionally, a slack member id. someone without a slack id still shows up in slack, just by name instead of a mention
- `slack.channel` is the channel id to post into. required once any rule notifies over slack
- `ignore-drafts` defaults to `true`. a draft is checked again once its marked ready for review
- `rules[].change` is a list, and the rule fires when any entry matches
  - `paths` are globs matched against changed files. a rename matches on its old name too. `**` does not descend into dot directories, so write `.github/**` explicitly
  - `ast-grep` is optional and narrows `paths` down to files where a matching snippet was added, removed or edited. its an ast-grep rule passed through as-is, so `pattern`, `kind`, `has`, `inside`, `regex`, `constraints` and `utils` all work. https://ast-grep.github.io/playground.html is the fastest way to write one
- `rules[].notify[]` takes a `person`, `via` (`github`, `slack`) and an optional `comment`, posted verbatim next to the mention

the config is read from the PR's base commit, so a PR cant change the rules its checked against. a config change takes effect once its merged

## how matching works

paths are checked first. for an `ast-grep` entry, the base and head versions of each file that passed the path filter are fetched through the api and scanned, and the matched snippets are compared as a multiset. line numbers are ignored, so code that only moved does not fire, and neither does a match in a comment or an unrelated edit in the same file

ast-grep is downloaded from its github release only when some rule uses it. the binary is pinned and checked against a sha256 baked into the action. `ast-grep-version` overrides the version but skips that check

## notifications

each person is notified once per rule per PR, per channel. a later push that matches the same rule does not ping them again, but a rule that starts matching on a later push does

every run with something new to send posts a new comment rather than editing an old one, because github does not notify people who are @-mentioned in an edit. the comment also carries a hidden record of what was sent, which is how later runs know. only comments from a bot account count, so a PR author cant post a fake record to skip a notification. a slack-only notification still posts a short comment for that reason

the `concurrency` group in the workflow above keeps two quick pushes from sending twice

## inputs

- `github-token` defaults to `github.token`. needs `contents: read` and `pull-requests: write`
- `slack-token` is a slack bot token with `chat:write`, and the bot has to be in the channel. without it slack is skipped with a warning
- `config-path` defaults to `.github/notify-for-visibility.yml`
- `ast-grep-version` overrides the pinned ast-grep

the `matched-rules` output is a json array of the rules that matched

## forks

on `pull_request`, PRs from forks get no secrets and a read-only token, so commenting fails. if you take fork PRs, use `pull_request_target`. thats safe here because the action never checks out or runs PR code, it only reads files through the api. dont add a checkout of the PR head to that workflow

## development

node 24.12 or newer runs the typescript in `src/` directly, no build step:

```sh
npm ci
npm test
npm run typecheck
```

`dist/index.js` is the esbuild bundle the action actually runs. run `npm run build` and commit it with any change to `src/`, ci fails when its stale
