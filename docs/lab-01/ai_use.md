
# Lab 1 — AI Use and Reflection

**LLM/agent used:** Blackbox AI

## Selected key prompts (6–10)
| # | Prompt (summarised) | What I did with the result |
|---|---------------------|----------------------------|
| 1 | Setup the TokTickIT project tech stack (React, Node, Express, Postgres) without adding extra functionality beyond Lab 1 scope. | Read the explanation of the scaffold structure and prepared to run the installation commands. |
| 2 | Implement the API health check endpoint as specified in Lab 1. The endpoint should be a GET request at /api/health that returns a 200 OK status and a JSON object like {"status": "ok", "db": "connected"} if the database connects successfully, or a 500 error if it fails. Do not use Prisma yet, just setup the basic route structure. | Reviewed the generated TCP connection code and decided it was too complex for the current step |
| 3 | The current implementation with TCP connection is too complex for this step. Please simplify the /api/health endpoint to just return {"status": "ok"} for now, as per the Lab 1 basic requirement for the health check endpoint. | Verified the simplified API endpoint response, tested it locally, and confirmed it matched the lab requirements |
| 4 | Please verify if the code matches the requirement for Issue 2 based on the labsheet. | Realized that the test file was in the wrong folder. Fixed it to be in `tests/lab-01/`. |
| 5 | The PR for Issue 3 is missing the schema and the seed script. Update schema.prisma with the Category model and create seed.ts with PrismaClient upsert. | Let the AI rewrite `schema.prisma` and `seed.ts` based on my exact provided code and push the commit. |
| 6 | Check every file to ensure the code and web UI exactly match the requirements in the PDF. | Found out that some UI texts like 'Supported Request Categories:' were missing. Allowed the AI to fix them. |
| 7 | If you commit the UI changes now, won't it go into the wrong feature branch (Issue 3) and violate the labsheet? | The AI realized the mistake, reverted the UI changes from Issue 3 branch, and prepared to do them in Issue 4 instead. |
| 8 | Understood, proceed to Issue 4. | Let the AI create `feature/4-category-list`, apply the UI fixes, and write Supertest/Vitest automated tests. |

## Reflection
Providing specific constraints, like "Do not add functionality beyond the Lab 1 scope," helped keep the AI's suggestions focused on the immediate task. However, I had to ignore some of the AI's complex database connection code and direct it to simplify the health check endpoint so it would precisely match the basic requirements. I also found that AI can sometimes mix up features into the wrong branch, so being mindful and questioning its git actions (like catching the UI changes in the DB branch) is crucial for keeping a clean git history.