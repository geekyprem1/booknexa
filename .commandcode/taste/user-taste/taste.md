# User Taste
- Communicates in casual Hinglish (Hindi-English mix), using "bhai" and informal phrasing; appreciates replies that mirror this tone. Confidence: 0.9
- Asks for written deliverables (e.g., scripts, copy) to be saved as Markdown (.md) files in the project. Confidence: 0.75
- Expects the agent to do GitHub repo creation and pushing end-to-end ("naya repo banake push kar to bhai") — when handed manual steps he pushes back and asks the agent to just do it. Confidence: 0.75
- Wants tasks driven to completion autonomously: prefers the agent to execute full workflows (create, commit, push, configure) and report results, rather than handing back a list of manual steps for him to run. Confidence: 0.75
- Prefers reusing existing resources over creating duplicates: if a destination (e.g., the `booknexa` GitHub repo) already exists, push to it rather than making a new one — so check for an existing target before creating anything. Confidence: 0.6
- Delegates tool installation/setup to the agent ("github cli installed kar to") — expects the agent to install, verify, and wire up required CLI tooling on its own instead of being told how to do it manually. Confidence: 0.7
- Works on Windows; winget is the available system package manager, so installs should go through winget-style commands with PATH refreshed after install. Confidence: 0.65
- Writes marketing/sales copy (e.g., VSL scripts) for US audiences; wants catchy hook lines and angles emphasizing how customers can make money with the product plus social proof that others are already earning. Confidence: 0.75
- For this project, the product name is now "BookNexa" (renamed from "KDP Profit Machine" / "KDP Launchpad") — use "BookNexa" in all future marketing copy, docs, UI, and deliverables, never the old names. Confidence: 0.95
