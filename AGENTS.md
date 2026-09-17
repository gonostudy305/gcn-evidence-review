# Repository guidance

- This standalone app uses Next.js 16. Before changing Next.js APIs or conventions, read the relevant guide in `node_modules/next/dist/docs/`.
- Keep image inspection and comparison in the browser. Do not add upload, analytics, persistence, or external AI-provider calls without documenting the data flow and getting an explicit product decision.
- Describe metadata matches as provenance signals. The current parser does not verify C2PA signatures or trust chains.
- Describe pixel comparison as a heuristic against a user-supplied original. It cannot attribute a change to AI or decide whether a certificate is genuine.
- Keep the human reviewer responsible for every decision that may affect a student's eligibility.
