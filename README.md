# Receipt Parser

A small full-stack web application that allows users to upload receipt images, extract structured data using an LLM, review and correct the extracted fields, save corrected receipts locally, and export a clean receipt review summary as PNG or JPG.

Built as part of the Handa Uncle engineering take-home assignment.

---

## Tech Stack

### Frontend
- React
- TypeScript
- Tailwind CSS
- Vite

### Backend
- Node.js
- Express
- TypeScript
- Multer

### LLM
- Gemini 1.5 Flash

### Persistence
- Local JSON file storage

---

# Features

- Upload receipt images (JPG/PNG)
- Drag-and-drop upload support
- Receipt image preview
- LLM-based structured extraction
- Editable correction flow
- Add/remove items
- Save corrected receipts locally
- View and reopen previously saved receipts
- Export corrected receipt review as PNG/JPG
- Single-command local development setup

---

# Local Setup

## 1. Clone the Repository

```bash
git clone https://github.com/Sreeaiswar/receipt-parser.git
cd receipt-parser
```

---

## 2. Install Dependencies

### Root

```bash
npm install
```

### Client

```bash
cd client
npm install
```

### Server

```bash
cd ../server
npm install
```

---


## 3. Run the Application

From the project root:

```bash
npm run dev
```

---

# What did you build?

I built a small full-stack receipt parsing application where users can upload a receipt image and receive structured data extracted using Gemini 1.5 Flash. The extracted receipt fields can be reviewed and corrected inline before saving locally. The application also supports reopening saved receipts and exporting corrected receipt reviews as PNG or JPG.

---

# Biggest Tradeoffs and Why

## 1. Chose Gemini 1.5 Flash for parsing

I selected Gemini 1.5 Flash because it provided a good balance between speed, image understanding, and cost. Since the assignment was focused more on product workflow and iteration speed, I prioritized a lightweight model that could handle receipt extraction reliably without adding unnecessary complexity.

## 2. Kept the backend architecture intentionally simple

I avoided adding a database, authentication, or complex abstractions and instead used local JSON persistence with a minimal Express structure. This reduced setup overhead and kept the implementation focused on the core upload → parse → correct → save workflow.

## 3. Prioritized editable review flow over extraction perfection

Receipts can vary heavily in format, so instead of trying to perfectly handle every edge case at the parsing layer, I focused on making the extracted data easy to review and edit. This made the application more practical and aligned with the idea that users should be able to quickly correct LLM mistakes.

---

# Where I Used LLMs

- Used Gemini 1.5 Flash for receipt image parsing and structured extraction.
- Used ChatGPT/Cursor during development for architecture planning, prompt iteration, UI refinement ideas, and workflow validation.
- Wrote the application structure, API integration flow, persistence logic, and correction workflow implementation myself.
- Used AI assistance selectively for speeding up repetitive scaffolding and refining prompts.

---

# What I Would Do With Another Week

If I had another week, I would focus on:

- confidence scoring/highlighting for uncertain fields
- subtotal/tax validation checks
- improved error recovery for malformed model responses
- support for PDFs and multi-page receipts
- lightweight automated tests around parsing and persistence
- receipt categorization/tagging
- SQLite persistence instead of JSON storage
- better mobile responsiveness
- deployment and hosted demo environment

---

# One Thing I’d Push Back On

I would push back slightly on treating all receipts as structurally similar. In practice, receipts vary significantly across merchants, countries, languages, and formats. A production-ready version would likely need:
- confidence indicators
- human verification workflows
- fallback parsing strategies
- better handling for ambiguous totals, taxes, and discounts
- PDF support

---

# Notes

- API keys are excluded using `.env`
- `.env.example` is included
- The project is intentionally scoped to fit the requested time-box
- Focus was placed on practical workflow design rather than overengineering
