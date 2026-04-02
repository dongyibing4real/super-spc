---
date: 2026-04-02
topic: ai-agent-assistant
---

# AI Agent Assistant — RAG-Powered Report Generation & Chat

## Problem Frame

Process engineers using Super SPC see charts, violations, and capability indices but must translate those into actionable reports manually. Writing shift summaries, explaining findings to managers, or interpreting statistical results requires SPC expertise that not all users have. An AI agent grounded in SPC reference knowledge and historical site data can generate structured reports and answer questions, making the tool's analytical output accessible and shareable.

## Requirements

**Report Generation**

- R1. A "Generate Report" button on the findings page produces a structured narrative report for the currently selected chart. The report includes: Executive Summary, Process Status (stable/unstable, capable/incapable), Key Findings (violations, patterns, capability), and Recommendations.
- R2. The report is grounded in the chart's actual analysis data — limits, violations, capability indices, zone distribution, phases, sigma method, and point count. No hallucinated statistics.
- R3. Reports are rendered as formatted markdown in the AI Agent panel on the findings page, replacing the current disabled "Connect" placeholder.
- R4. Reports can be generated for any chart by selecting it in the chart rail (left column of findings page). Switching charts clears the previous report.
- R5. Generated reports are exportable — copy to clipboard (markdown) and optionally render to PDF (deferred if Export Pipeline is not yet built).

**RAG Knowledge Base**

- R6. The agent draws on a static SPC reference knowledge base: control chart theory, Nelson/Western Electric rule explanations, capability index interpretation guidelines, sigma method comparisons, and chart type selection guidance.
- R7. The agent also draws on historical dataset context when available: past analysis results, investigation records (from Investigation Mode), annotations, and root cause categories. This makes reports site-specific ("this pattern was previously attributed to bearing wear").
- R8. The RAG system retrieves relevant context before each generation. The agent's responses cite which knowledge informed the output (e.g., "Per Nelson Rule 4: six consecutive points steadily increasing or decreasing").
- R9. The static SPC knowledge base is shipped with the application (not user-provided). It can be updated by adding reference documents.

**Conversational Follow-Up**

- R10. Below the generated report, a chat input allows the user to ask follow-up questions: "What does Cpk 0.87 mean?", "Why is Rule 2 triggered?", "How should I adjust my process?", "Compare Phase 1 vs Phase 2."
- R11. Chat responses are grounded in the same context as the report — the chart's data plus RAG knowledge. The conversation maintains context within a session (previous questions inform later answers).
- R12. Chat responses stream to the UI in real-time (token-by-token via SSE) for responsive feel.

**LLM Configuration**

- R13. The LLM provider is user-configurable. Users can choose between supported providers (OpenAI, Anthropic, and any LangChain-compatible provider) and enter their API key.
- R14. API keys are stored server-side (not in the browser). A settings endpoint accepts and persists the key configuration.
- R15. The agent gracefully handles missing API key configuration — shows a setup prompt instead of the disabled "Connect" button, guiding the user through provider selection and key entry.
- R16. The agent gracefully handles LLM errors (rate limits, invalid key, network failure) with user-friendly messages and retry guidance.

**Backend Architecture**

- R17. LLM orchestration runs on the FastAPI backend using LangChain (Python). The backend receives chart context from the frontend, runs the RAG retrieval + LLM generation, and streams results back via Server-Sent Events (SSE).
- R18. The RAG vector store is initialized on server startup from the static SPC reference documents. Historical context is queried from the existing SQLite database at generation time.
- R19. Each report generation request includes the full chart context: analysis results, violations, capability, phases, point statistics, and chart configuration parameters. The frontend serializes this from the existing state.

**UI Integration**

- R20. The AI Agent panel replaces the existing disabled placeholder on the findings page. It sits below the finding detail panel or in a dedicated tab alongside findings.
- R21. The panel has three states: (a) Setup — no API key configured, shows configuration form, (b) Ready — "Generate Report" button + chat input, (c) Active — streaming report or chat response with a loading indicator.
- R22. The panel respects the app's dark theme and design system (typography, spacing, colors from CSS custom properties).

## Success Criteria

- SC1. A process engineer can generate a meaningful, accurate report for any chart in under 10 seconds (excluding LLM latency).
- SC2. Reports contain no hallucinated statistics — every number cited matches the actual analysis data.
- SC3. Follow-up questions about SPC concepts receive accurate, contextual answers grounded in the reference knowledge base.
- SC4. The agent works with at least OpenAI and Anthropic as LLM providers via user configuration.
- SC5. The feature degrades gracefully when no API key is configured (shows setup) or when the LLM is unavailable (shows error, not a crash).

## Scope Boundaries

**In scope:**
- Report generation for individual charts from the findings page
- Chat follow-up grounded in chart data + RAG
- Static SPC reference knowledge base (shipped with app)
- Historical context from past analyses and investigations (when available)
- User-configurable LLM provider with server-side key storage
- SSE streaming for real-time response rendering
- Copy-to-clipboard export of reports

**Out of scope (deferred):**
- Multi-chart comparative reports ("compare all charts in this workspace")
- Natural language commands that take actions in the app ("exclude point 5", "change to X-bar R")
- Automated report scheduling (generate daily/weekly reports)
- Fine-tuned or locally-hosted LLM models
- PDF export of AI-generated reports (depends on Export Pipeline feature)
- Agent memory across sessions (conversation resets on page reload)
- Cost tracking or token usage monitoring
- AI-assisted root cause suggestion (listed in Investigation Mode as deferred)

## Key Decisions

- **Report-first, chat-second:** The primary interaction is one-click structured report generation, not open-ended chat. Chat is a follow-up mechanism, not the entry point.
- **Backend LLM orchestration:** LangChain runs in Python on FastAPI. API keys never touch the browser. SSE streaming for UX.
- **User-configurable provider:** No vendor lock-in. LangChain abstracts the provider layer. User brings their own API key.
- **Dual RAG sources:** Static SPC reference material (always available) + historical site data (gets richer over time as Investigation Mode populates records).
- **Findings page only (V1):** The agent lives on the findings page, not app-wide. This keeps the scope bounded and the context clear (one chart at a time).

## Dependencies / Assumptions

- **LangChain Python ecosystem:** The backend already runs Python (FastAPI). LangChain and a vector store library (e.g., ChromaDB, FAISS) are new dependencies.
- **Investigation Mode (optional enrichment):** Historical context is richer when Investigation Mode is built (investigation records, annotations, root cause categories). The agent should work without it — just with less historical grounding.
- **Static SPC reference docs:** Need to curate and chunk the knowledge base from existing reference material in `.claude/reference/` (JMP docs, quality methods PDF).

## Outstanding Questions

### Deferred to Planning
- [Affects R6, R9][Needs research] What vector store is best for this scale? ChromaDB (simple, embedded) vs FAISS (faster, no server) vs pgvector (if we move to Postgres later)?
- [Affects R17][Technical] What's the optimal chunking strategy for SPC reference documents? Section-level vs paragraph-level vs semantic chunking?
- [Affects R18][Technical] How should the historical context query work? Direct SQL for recent analyses + vector search for investigation notes? Or vector store for everything?
- [Affects R14][Technical] How should API keys be stored securely server-side? Environment variable, encrypted config file, or SQLite table?
- [Affects R1][Technical] What prompt template produces the best structured reports? Needs iteration with real chart data.
- [Affects R13][Needs research] Which LangChain chat model integrations are most stable for streaming? Any known issues with specific providers?
- [Affects R19][Technical] What's the maximum context size for chart data serialization? Large datasets with many violations could exceed token limits — may need summarization.

## Next Steps

-> `/ce:plan` for structured implementation planning
