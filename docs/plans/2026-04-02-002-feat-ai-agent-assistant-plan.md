---
title: "feat: AI Agent Assistant — RAG-Powered Report Generation & Chat"
type: feat
status: active
date: 2026-04-02
origin: docs/brainstorms/2026-04-02-ai-agent-assistant-requirements.md
---

# feat: AI Agent Assistant — RAG-Powered Report Generation & Chat

## Overview

Add an AI-powered report generation and chat assistant to the findings page. The agent generates structured SPC analysis reports grounded in actual chart data and a RAG knowledge base, with conversational follow-up for questions about violations, capability, and process behavior. LLM orchestration runs on the FastAPI backend with SSE streaming to the frontend.

## Problem Frame

Process engineers see charts, violations, and capability indices but must manually translate them into reports and explanations. An AI agent grounded in SPC reference knowledge and historical site data generates structured reports and answers questions, making analytical output accessible to non-statisticians. (see origin: docs/brainstorms/2026-04-02-ai-agent-assistant-requirements.md)

## Requirements Trace

- R1. One-click structured report (Executive Summary, Process Status, Key Findings, Recommendations)
- R2. Grounded in actual analysis data — no hallucinated statistics
- R3-R5. Rendered as markdown in findings page panel, exportable to clipboard
- R6-R9. Dual RAG: static SPC reference + historical site data, with citations
- R10-R12. Chat follow-up with session context and SSE streaming
- R13-R16. User-configurable LLM provider, server-side key storage, graceful error handling
- R17-R19. FastAPI backend orchestration, SSE streaming, chart context serialization
- R20-R22. Findings page panel with Setup/Ready/Active states, design system compliance

## Scope Boundaries

- Single-chart reports only (no multi-chart comparison)
- No natural language commands that take app actions
- No PDF export (deferred to Export Pipeline)
- No agent memory across page reloads
- No cost tracking or token monitoring
- Investigation Mode enriches historical context but is not required

## Context & Research

### Relevant Code and Patterns

- `api/main.py` — FastAPI app with router mounting at `/api/datasets`
- `api/routes/datasets.py` — Existing CRUD + analyze endpoints; `StreamingResponse` used for CSV export (line 311)
- `api/services/analysis.py` — Analysis orchestration pattern (fetch → compute → persist → return)
- `api/models.py` — SQLAlchemy ORM; `Finding` model exists but has zero routes (natural extension point)
- `api/schemas.py` — Pydantic request/response schemas
- `api/database.py` — Async SQLAlchemy singleton, `get_db()` dependency
- `src/data/api.js` — Frontend fetch wrapper (`request()` function); no SSE support yet
- `src/views/findings.js` — Disabled "AI Agent" placeholder at lines 149-175 with "Connect" button
- `src/core/findings-engine.js` — Client-side findings generation with structured data
- `.claude/reference/` — JMP docs + quality methods PDF (source material for RAG knowledge base)

### Institutional Learnings

- No existing AI/LLM code anywhere in the codebase — this is entirely new ground
- The `Finding` ORM model (title, severity, summary, evidence, status, FK to dataset) is defined but unused — natural extension point for AI-generated findings
- SSE is net-new plumbing; the only existing streaming is CSV file download
- The Vite dev proxy passes streaming through without special configuration

### External References

- LangChain LCEL (v0.3+) for chain composition — not legacy `LLMChain`/`AgentExecutor`
- ChromaDB `PersistentClient` for embedded vector store with metadata filtering
- `sse-starlette` for SSE responses in FastAPI
- Pydantic `with_structured_output()` for anti-hallucination
- `fetch` + `ReadableStream` on frontend (not `EventSource` — POST bodies required)

## Key Technical Decisions

- **Vector store: ChromaDB** — Embedded, persistent, native metadata filtering, auto-embedding. FAISS requires building persistence/metadata manually. ChromaDB is right-sized for 50-100 pages of reference material. (Resolves deferred Q1 from origin)
- **Chunking: Hybrid structure-aware** — Prose at 800 chars/100 overlap via `RecursiveCharacterTextSplitter`. Formulas as atomic units. Tables as whole chunks. Nelson rules as one-per-chunk with metadata tags (content_type, topic, rule_set). (Resolves deferred Q2)
- **Historical context: Direct SQL + optional vector search** — Recent analyses and investigation records via SQL query. Investigation notes via vector search when Investigation Mode exists. Hybrid approach avoids vectorizing structured data unnecessarily. (Resolves deferred Q3)
- **API key storage: Fernet-encrypted local JSON** — Backend-for-Frontend pattern. Keys stored in `api/config/llm_keys.json` encrypted with `cryptography.Fernet`. Environment variable fallback (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`). Validate with test API call on save. (Resolves deferred Q4)
- **Anti-hallucination: Three layers** — (a) Grounding system prompt forbidding extrapolation, (b) Pydantic structured output for report sections, (c) Temperature = 0. Chart data passed as JSON, not prose. (Resolves deferred Q5)
- **SSE via sse-starlette** — `EventSourceResponse` with async generator calling `chain.astream()`. Frontend uses `fetch` + `ReadableStream` (not `EventSource` — need POST with body). Structured events: `token`, `done`, `error`. (Resolves deferred Q6)
- **LangChain LCEL chains** — Factory function keyed on provider string creates the right `ChatModel`. Skip LangGraph/LangSmith — unnecessary complexity for single-user app. (Resolves deferred Q7 partially)
- **Embeddings: OpenAI text-embedding-3-small default** — With fallback to local `sentence-transformers/all-MiniLM-L6-v2` for users without OpenAI key. Embedding provider separate from chat provider.

## Open Questions

### Resolved During Planning

- **Vector store**: ChromaDB PersistentClient (see Key Technical Decisions)
- **Chunking**: Hybrid structure-aware (see Key Technical Decisions)
- **Historical context**: SQL for structured data + vector for unstructured notes
- **Key storage**: Fernet-encrypted JSON file + env var fallback
- **Streaming**: sse-starlette + fetch ReadableStream
- **Provider stability**: OpenAI primary, Anthropic secondary — both stable with `.astream()`

### Deferred to Implementation

- Exact prompt template wording for structured reports — needs iteration with real chart data
- Token limit handling for large datasets with many violations — may need summarization middleware
- ChromaDB collection naming and reset strategy on reference doc updates
- Fernet key generation and storage location (generate on first run, store alongside config)

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
Frontend (findings.js)                    Backend (FastAPI)
┌─────────────────────┐                  ┌──────────────────────────┐
│ AI Agent Panel       │                  │                          │
│                      │  POST /api/agent │  Agent Service           │
│ [Generate Report] ───┼──── /report ────>│  ├─ Serialize chart ctx  │
│                      │  (chart context) │  ├─ RAG retrieval        │
│ Streaming markdown  <┼── SSE stream ───│  │  ├─ ChromaDB (static) │
│ rendered in panel    │  (token events)  │  │  └─ SQL (historical)  │
│                      │                  │  ├─ Build prompt          │
│ [Chat input] ────────┼── POST /api/agent│  ├─ LLM call (streaming) │
│                      │  /chat           │  │  ├─ OpenAI             │
│ Streaming response  <┼── SSE stream ───│  │  ├─ Anthropic          │
│                      │                  │  │  └─ (configurable)     │
│ [Copy to clipboard]  │                  │  └─ SSE response          │
└─────────────────────┘                  └──────────────────────────┘

Settings (one-time):
  POST /api/agent/config  →  Save provider + encrypted API key
  GET  /api/agent/config  →  Return provider name + key status (not the key)
```

## Implementation Units

- [ ] **Unit 1: Python Dependencies & Agent Service Skeleton**

**Goal:** Add LangChain, ChromaDB, sse-starlette, and cryptography dependencies. Create the agent service module structure with provider factory.

**Requirements:** R13, R17

**Dependencies:** None

**Files:**
- Modify: `pyproject.toml` (add langchain-core, langchain-openai, langchain-anthropic, chromadb, sse-starlette, cryptography)
- Create: `api/services/agent.py` (LLM provider factory, chain builder)
- Create: `api/services/agent_config.py` (API key encryption/decryption, config CRUD)
- Test: `tests/api/test_agent_config.py`

**Approach:**
- Provider factory: dictionary mapping provider name → ChatModel constructor (ChatOpenAI, ChatAnthropic)
- Config stored as Fernet-encrypted JSON at `api/config/llm_keys.json`
- Fernet key auto-generated on first access, stored at `api/config/.fernet_key`
- Environment variable fallback: check `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` before config file

**Patterns to follow:**
- `api/services/analysis.py` — service layer pattern (function-based, receives db session)
- `api/schemas.py` — Pydantic schema definitions

**Test scenarios:**
- Happy path: Create config with valid provider + key, retrieve config shows provider name but not raw key
- Happy path: Factory returns correct ChatModel for "openai" and "anthropic" providers
- Edge case: Config file doesn't exist yet — auto-creates on first save
- Edge case: Environment variable fallback when no config file exists
- Error path: Invalid provider name raises ValueError
- Error path: Fernet decryption with wrong key raises clear error

**Verification:**
- `pip install -e .` succeeds with new dependencies
- Agent config round-trip works (save key, load key, create model)

---

- [ ] **Unit 2: RAG Knowledge Base — Static SPC Reference**

**Goal:** Build the ChromaDB vector store from static SPC reference documents with hybrid chunking strategy.

**Requirements:** R6, R8, R9

**Dependencies:** Unit 1

**Files:**
- Create: `api/services/rag.py` (document loading, chunking, ChromaDB initialization, retrieval)
- Create: `api/data/spc_reference/` (directory for curated reference markdown files)
- Create: `api/data/spc_reference/nelson_rules.md`
- Create: `api/data/spc_reference/capability_indices.md`
- Create: `api/data/spc_reference/chart_type_guide.md`
- Create: `api/data/spc_reference/sigma_methods.md`
- Create: `api/data/spc_reference/western_electric_rules.md`
- Test: `tests/api/test_rag.py`

**Approach:**
- ChromaDB `PersistentClient` with data stored at `api/data/chromadb/`
- Hybrid chunking: prose (RecursiveCharacterTextSplitter, 800 chars, 100 overlap), rules (one per chunk), tables (whole), formulas (atomic)
- Metadata on each chunk: `content_type` (prose/rule/table/formula), `topic` (capability/control_limits/rules/etc.), `rule_set` (nelson/western_electric/none)
- Initialization: check collection exists + doc hash matches; rebuild only when source docs change
- Retrieval: `similarity_search(query, k=5, filter=metadata_filter)` with optional topic filter

**Patterns to follow:**
- Curate reference content from `.claude/reference/` (JMP docs, quality methods PDF) into structured markdown

**Test scenarios:**
- Happy path: Initialize knowledge base from reference docs, query "What is Nelson Rule 4?" returns relevant chunk with correct metadata
- Happy path: Query with topic filter returns only chunks matching that topic
- Edge case: Re-initialization when reference docs haven't changed skips rebuild (hash check)
- Edge case: Empty query returns empty results, not error
- Integration: Retrieval returns chunks with citations (source document + section)

**Verification:**
- ChromaDB collection populated with expected chunk count
- Retrieval returns relevant, correctly-tagged chunks for SPC queries

---

- [ ] **Unit 3: Historical Context Retrieval**

**Goal:** Query existing SQLite data (past analyses, violations) to provide site-specific context for report generation.

**Requirements:** R7, R18

**Dependencies:** Unit 1

**Files:**
- Modify: `api/services/rag.py` (add historical context retrieval functions)
- Test: `tests/api/test_rag.py` (extend with historical context tests)

**Approach:**
- SQL query for recent analyses on the same dataset: limits, violations, capability trends
- SQL query for the current chart's analysis result (already available from analyze endpoint)
- Format historical context as structured text for prompt injection
- When Investigation Mode exists later: query investigation records, annotations, root causes
- Graceful degradation: if no historical data exists, skip this context source

**Patterns to follow:**
- `api/services/analysis.py` — async SQLAlchemy session queries with `get_db()` dependency

**Test scenarios:**
- Happy path: Dataset with 3 past analyses returns formatted historical summary
- Edge case: Dataset with no historical analyses returns empty context (not error)
- Edge case: Historical context for dataset that doesn't exist returns empty context

**Verification:**
- Historical context retrieval returns structured text from SQLite data

---

- [ ] **Unit 4: Report Generation Chain**

**Goal:** Build the LangChain LCEL chain that generates structured SPC reports from chart context + RAG.

**Requirements:** R1, R2, R8

**Dependencies:** Units 1, 2, 3

**Files:**
- Modify: `api/services/agent.py` (add report generation chain)
- Create: `api/services/prompts.py` (system prompts, report template, grounding rules)
- Test: `tests/api/test_agent_report.py`

**Approach:**
- LCEL chain: `(context_builder | prompt_template | chat_model | output_parser)`
- Context builder: serialize chart data (limits, violations, capability, phases, zone distribution) + RAG retrieval + historical context into a structured prompt
- System prompt: grounding rules (no extrapolation, cite exact values, structured sections)
- Report sections via Pydantic structured output: ExecutiveSummary, ProcessStatus, KeyFindings, Recommendations
- Temperature = 0 for report generation
- Chart data passed as JSON block in the prompt, not embedded in prose

**Patterns to follow:**
- LangChain LCEL chain composition with `RunnableSequence`

**Test scenarios:**
- Happy path: Generate report for a chart with violations — report contains correct violation counts and limit values
- Happy path: Report includes RAG-grounded explanations (e.g., Nelson Rule descriptions)
- Edge case: Chart with no violations generates "process is stable" report
- Edge case: Chart with no capability data (missing spec limits) omits capability section
- Error path: LLM returns malformed output — structured parser catches and retries or returns partial report

**Verification:**
- Generated report contains all four sections with data matching the input chart context
- No numbers in the report that don't appear in the input data

---

- [ ] **Unit 5: Chat Follow-Up Chain**

**Goal:** Build the conversational chain for follow-up questions after report generation.

**Requirements:** R10, R11

**Dependencies:** Unit 4

**Files:**
- Modify: `api/services/agent.py` (add chat chain with conversation history)
- Test: `tests/api/test_agent_chat.py`

**Approach:**
- Chat chain: same context (chart data + RAG) as report, plus conversation history
- History stored in-memory per session (list of HumanMessage/AIMessage)
- Session keyed by dataset_id + chart_id (no persistence across page reload)
- RAG retrieval on each question for domain-specific grounding
- System prompt: same grounding rules as report + instruction to be helpful and concise

**Test scenarios:**
- Happy path: Ask "What does Cpk 0.87 mean?" — response references the chart's actual Cpk and explains interpretation
- Happy path: Follow-up question references previous answer (conversation context maintained)
- Edge case: First question without generating report first — chat still works with chart context + RAG
- Edge case: Session reset when chart selection changes

**Verification:**
- Chat responses are contextual and reference chart data
- Conversation history maintained within a session

---

- [ ] **Unit 6: SSE Streaming API Endpoints**

**Goal:** Create FastAPI endpoints for report generation and chat with SSE streaming responses.

**Requirements:** R12, R17, R19

**Dependencies:** Units 4, 5

**Files:**
- Create: `api/routes/agent.py` (router with /report, /chat, /config endpoints)
- Modify: `api/main.py` (mount agent router)
- Create: `api/schemas.py` additions (AgentReportRequest, AgentChatRequest, AgentConfigRequest)
- Test: `tests/api/test_agent_routes.py`

**Approach:**
- `POST /api/agent/report` — accepts chart context JSON, returns `EventSourceResponse` streaming tokens
- `POST /api/agent/chat` — accepts message + chart context + session_id, returns SSE stream
- `POST /api/agent/config` — save LLM provider + API key
- `GET /api/agent/config` — return provider name + configured status (not the raw key)
- SSE event format: `event: token\ndata: {"text": "..."}\n\n` for tokens, `event: done\ndata: {}\n\n` for completion, `event: error\ndata: {"message": "..."}\n\n` for errors
- `sse-starlette.EventSourceResponse` with async generator calling `chain.astream()`
- Check `request.is_disconnected()` in stream loop to avoid wasting tokens

**Patterns to follow:**
- `api/routes/datasets.py` — router pattern with `APIRouter(prefix="/api/agent")`
- `api/routes/datasets.py:311` — existing `StreamingResponse` for CSV export (adapt for SSE)

**Test scenarios:**
- Happy path: POST /report with valid chart context returns SSE stream with token events followed by done event
- Happy path: POST /chat with message returns streaming response
- Happy path: GET /config returns provider name and configured=true when key exists
- Error path: POST /report without configured API key returns 400 with setup instructions
- Error path: LLM API failure (invalid key) returns error SSE event, not HTTP 500
- Error path: Client disconnects mid-stream — server stops generating

**Verification:**
- SSE endpoints return properly formatted event streams
- Config CRUD works end-to-end

---

- [ ] **Unit 7: Frontend SSE Client**

**Goal:** Add SSE streaming client to the frontend API layer using fetch + ReadableStream.

**Requirements:** R12

**Dependencies:** Unit 6

**Files:**
- Modify: `src/data/api.js` (add `streamRequest()` function for SSE consumption)
- Test: `tests/api-client.test.js` (new test for stream parsing)

**Approach:**
- `streamRequest(url, body, onToken, onDone, onError)` — POST with `Accept: text/event-stream`, read response body as ReadableStream, parse SSE events, call callbacks
- Parse `data:` lines, handle `event:` types (token, done, error)
- Handle connection errors and reconnection (single retry on network failure)
- Not using `EventSource` API — it's GET-only and can't send POST bodies

**Patterns to follow:**
- `src/data/api.js` — existing `request()` function pattern for headers and error handling

**Test scenarios:**
- Happy path: Stream with multiple token events concatenates correctly
- Happy path: Done event triggers onDone callback
- Edge case: Empty token events are skipped
- Error path: Network failure triggers onError callback
- Error path: Error SSE event triggers onError with message

**Verification:**
- `streamRequest` correctly parses SSE events and calls appropriate callbacks

---

- [ ] **Unit 8: Findings Page AI Agent Panel**

**Goal:** Replace the disabled "AI Agent / Connect" placeholder with the full agent panel UI.

**Requirements:** R3, R4, R5, R15, R20, R21, R22

**Dependencies:** Units 6, 7

**Files:**
- Modify: `src/views/findings.js` (replace placeholder at lines 149-175 with agent panel)
- Modify: `src/core/state/init.js` (add agent state domain: config status, report, chat history, loading)
- Modify: `src/core/state/findings.js` (add agent state reducers)
- Modify: `src/events/click-handler.js` (handle agent panel clicks: generate, send, copy, configure)
- Modify: `src/styles.css` (agent panel styles — markdown rendering, chat bubbles, loading states)
- Test: `tests/findings-agent.test.js`

**Approach:**
- Panel states: Setup (config form), Ready (generate button + chat input), Active (streaming content)
- Setup state: provider dropdown (OpenAI, Anthropic) + API key input + Save button
- Ready state: "Generate Report" primary button + chat text input with send button
- Active state: markdown rendering area with streaming text + loading indicator
- Copy-to-clipboard button on generated reports
- Chart switching (via chart rail) clears report and chat history
- Markdown rendering: simple regex-based renderer (headers, bold, lists, code blocks) — no external dependency
- All styling via existing CSS custom properties (dark theme, typography tokens)

**Patterns to follow:**
- `src/views/findings.js` — existing `renderFindingsPage` template pattern
- `src/components/recipe-rail.js` — inline form editing pattern (chips)
- `src/events/click-handler.js` — `data-action` delegation pattern

**Test scenarios:**
- Happy path: Panel shows Setup state when no API key configured
- Happy path: After config, panel shows Ready state with Generate Report button
- Happy path: Click Generate Report → panel shows Active state with streaming markdown
- Happy path: Chat input sends message and shows streaming response below report
- Happy path: Copy to clipboard copies report markdown
- Edge case: Switching charts clears report and chat history, returns to Ready state
- Error path: LLM error shows user-friendly message in panel with retry button
- Error path: Invalid API key during config save shows validation error

**Verification:**
- Full flow: configure → generate report → ask follow-up → copy report
- Panel respects dark theme and design system tokens

## System-Wide Impact

- **New backend router:** `/api/agent/*` mounted alongside existing `/api/datasets/*` — no interaction with existing endpoints
- **New Python dependencies:** langchain-core, langchain-openai, langchain-anthropic, chromadb, sse-starlette, cryptography — added to pyproject.toml
- **ChromaDB data directory:** `api/data/chromadb/` — persistent vector store, needs to be in `.gitignore`
- **Config file:** `api/config/llm_keys.json` + `api/config/.fernet_key` — sensitive, must be in `.gitignore`
- **Reference docs:** `api/data/spc_reference/*.md` — shipped with app, checked into git
- **Frontend state expansion:** New `agent` state domain in `init.js` — isolated from existing chart/findings state
- **No changes to existing analysis pipeline** — agent consumes analysis results, does not modify them
- **Vite proxy:** No changes needed — `/api/agent/*` routes through existing `/api` proxy config

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| LLM hallucinating statistics | Three-layer defense: grounding prompt, structured output, temp=0. Chart data as JSON. |
| Token limits with large datasets | Summarization middleware for violations/phases when count exceeds threshold. Defer exact threshold to implementation. |
| ChromaDB startup latency | Hash-check to skip rebuild when docs unchanged. Collection persists across restarts. |
| API key security | Fernet encryption at rest. Keys never sent to frontend. Environment variable fallback for dev. |
| SSE connection drops | Client-side single retry. Server checks `is_disconnected()`. Error events for graceful degradation. |
| LangChain version churn | Pin exact versions in pyproject.toml. Use only stable LCEL APIs. |
| Embedding cost for OpenAI | Offer local `sentence-transformers` fallback. Embeddings only run on reference doc init, not per-query. |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-02-ai-agent-assistant-requirements.md](docs/brainstorms/2026-04-02-ai-agent-assistant-requirements.md)
- Related code: `api/services/analysis.py` (service pattern), `api/routes/datasets.py` (router pattern), `src/views/findings.js` (AI placeholder)
- LangChain LCEL docs: python.langchain.com/docs/how_to/
- ChromaDB: docs.trychroma.com
- sse-starlette: github.com/sysid/sse-starlette
