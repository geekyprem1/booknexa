# KDP Publishing Skill

BookNexa's AI-first direction is to use a portable skill as the workflow's research, writing, editing, and quality-review orchestrator, with BookNexa and optional generator adapters as production tools. The skill is designed to discover and evaluate missing capabilities, but it does not silently install or execute code: it asks the user before adding tools, MCP servers, project/global skills, permissions, or paid services, then verifies an approved installation with a safe test.

The skill instructions live at [`skills/kdp-publishing/SKILL.md`](../skills/kdp-publishing/SKILL.md); capability discovery and installation safeguards are in [`capability-discovery.md`](../skills/kdp-publishing/references/capability-discovery.md). A skill does not itself bring web search, image generation, BookNexa API access, or a local browser. Its host agent must provide the relevant tools and permissions. When a capability is missing, it must disclose that limitation rather than pretend it did the work.

The local KDP browser remains a separate final-stage tool. Amazon credentials and browser sessions stay on the user's device, and account challenges, preview, disclosures, and final publishing remain user-controlled.
