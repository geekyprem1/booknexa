# Orchestrator workflow notes

This reference expands the phases in `SKILL.md`. Keep the skill portable: tool names vary between Claude Code, Codex, Cursor, Gemini CLI, and other skill hosts. Call only tools actually exposed by the host; if an action requires a local BookNexa checkout and the agent has no shell/local access, provide commands for the user rather than claiming to execute them.

## Research record template

```markdown
# Opportunity research — <concept>
- Researched: YYYY-MM-DD
- Marketplace/language:
- Intended reader/use case:
- Sources/tool access:

## Observations
| Signal | Observation | Source | Observed on | Limitations |
|---|---|---|---|---|

## Competitor patterns
| Public listing/title | Audience/format | Observable positioning | Source/date | Possible differentiation |
|---|---|---|---|---|

## Hypothesis and risks
- Differentiation hypothesis:
- Rights/trademark checks still needed:
- Production budget assumptions:
- Unknowns / confidence:
- Recommendation: explore further / go / no-go
```

Only include metrics actually observed from a cited, permitted source. Explain that listing counts, reviews, public ranks and trend charts are proxies; they do not establish sales or demand by themselves. Do not claim access to Amazon internal search volume or conversion data.

## Human approval gates

1. Opportunity recommendation before investing in full production.
2. Concept/brief and outline before long-form drafting or image batches.
3. Manuscript before final layout and image generation.
4. Representative image sample, estimated generation expense, and art direction before batch generation.
5. Final package review (files, metadata, rights, AI disclosures, preflight warnings) before KDP handoff.
6. Account identity, Previewer, policy answers, and Publish button remain the user's responsibility.

User approval is specific to the artifact/version shown. Revisions after approval should be surfaced as a new version and re-reviewed where material.

## Generator routing (current plan)

| Need | Preferred path | Boundary |
|---|---|---|
| Market research and editorial judgment | This skill plus authorized search/tools | Evidence and dates required; no sales guarantees |
| BookNexa-supported puzzle/activity/coloring/ebook/storybook | BookNexa native generator | Verify the particular output type and current configuration |
| Illustrated children's picture-book alternative | Evaluate licensed illustrated-book generator adapters | Keep local model dependencies optional; sample + human approval first |
| Full coloring-book workflow | BookNexa native coloring generator or a license-cleared external image/interior tool | Validate image rights, output quality, print geometry, and metadata |
| Print formatting of a supplied manuscript | KDP Toolkit adapter | Does not write content, research a niche, or guarantee KDP acceptance |
| KDP authoring handoff | Local KDP publisher/profile, if its account-selection feature is verified | Local session only; no credentials in skill, cloud, or repository |

An upstream repo is not an integration just because it appears in a registry or README. Record license and upstream commit/version, pinned dependencies, external service and cost, quality tests, and generated asset provenance before calling it production-ready. Repos with no clear license remain research-only; do not copy code into BookNexa until permission is resolved.

## Artifact structure recommendation

```text
workspace/<project-slug>/
  research/opportunity.md
  brief/book-brief.md
  manuscript/draft-v001.md
  editorial/review-v001.md
  assets/illustrations/       # only if generated/imported and rights recorded
  assets/provenance.json
  production/metadata.json
  production/booknexa-kdp.json
  production/validation/
  production/<project>-kdp.zip
```

Use the existing BookNexa package contract and local publisher if present. Before invoking any command, inspect the installed checkout's docs and `--help`; do not assume branch documentation and CLI flags are in sync. A successful package preflight means only that the package matched basic technical checks. It is not a human editorial review or a KDP approval.

## Research and legal limitations

- Use user-provided sources and authorized public research tools. Follow site terms, robots/access controls, privacy, and rate limits.
- Do not harvest competitor books or reviews at scale, reproduce copyrighted text/images, or create confusingly similar titles, covers, brands, or characters.
- Do not diagnose trademark/copyright status as a legal conclusion. Flag for human/legal review.
- Make AI disclosure notes from actual generation provenance; the author determines and submits answers to KDP.
- If a research source is inaccessible, report that rather than filling gaps with invented evidence.
