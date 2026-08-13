
# Lab 1 — AI Use and Reflection

**LLM/agent used:** Blackbox AI

## Selected key prompts (6–10)
| # | Prompt (summarised) | What I did with the result |
|---|---------------------|----------------------------|
| 1 | Setup the TokTickIT project tech stack (React, Node, Express, Postgres) without adding extra functionality beyond Lab 1 scope. | Read the explanation of the scaffold structure and prepared to run the installation commands. |
| 2 | Implement the API health check endpoint as specified in Lab 1. The endpoint should be a GET request at /api/health that returns a 200 OK status and a JSON object like {"status": "ok", "db": "connected"} if the database connects successfully, or a 500 error if it fails. Do not use Prisma yet, just setup the basic route structure. |  |
| 2 | The current implementation with TCP connection is too complex for this step. Please simplify the /api/health endpoint to just return {"status": "ok"} for now, as per the Lab 1 basic requirement for the health check endpoint. |  |

## Reflection
Providing specific constraints, like "Do not add functionality beyond the Lab 1 scope," helped keep the AI's suggestions focused on the immediate task. However, I had to ignore some of the AI's file creation commands because the starter scaffold already provided the initial project structure.