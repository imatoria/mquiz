# mquiz

An advanced, offline-first educational examination & test paper creation platform featuring multi-provider AI question generation (OpenAI, Gemini, DeepSeek, Groq), automated answer re-checking, step-by-step rationale generation, and in-browser SQLite database storage.

## Features

- **Multi-Provider AI Pipeline**: Configurable priority ordering with automatic failover across OpenAI, Google Gemini, DeepSeek, and Groq.
- **Book & Topic AI Question Generation**: Generate high-quality multiple choice and True/False questions from custom topics or textbook pages.
- **Answer Verification & Explanations**: Smart unbiased AI answer re-check with step-by-step reasoning and shortcut/elimination tips.
- **In-Browser SQLite Storage**: Fast offline-first persistence powered by WebAssembly.

## Getting Started

### Requirements
- Node.js (v18+) & npm

### Development Setup

```sh
# Clone the repository
git clone https://github.com/imatoria/mquiz.git

# Navigate to project directory
cd mquiz

# Install dependencies
npm install

# Run local development server
npm run dev
```

### Build & Preview

```sh
# Build for production
npm run build

# Preview production build locally
npm run preview
```

## Built With

- **Framework**: React + Vite + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Icons**: Lucide React
- **Database**: In-Browser SQLite WASM
