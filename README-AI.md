# AI Assistant Guidelines & Project Context

Welcome! This document provides essential context and instructions for AI agents and coding assistants (like Cursor, Copilot, Cline, or Antigravity) working on this repository.

## ⚠️ Critical Directive: Package Manager

* **Do NOT use `npm` or `yarn` under any circumstances.**
* **ALWAYS use `pnpm`** for all package management, installation, running scripts, and development commands.

### Approved Commands
* Install dependencies: `pnpm install`
* Add packages: `pnpm add <package-name>`
* Run development server: `pnpm dev`
* Build production bundle: `pnpm build`
* Start production build: `pnpm start`
* Type checking: `pnpm exec tsc --noEmit` or `npx tsc --noEmit`

---

## Technical Stack & Architecture

* **Framework**: Next.js 16 (App Router, Turbopack)
* **Styling**: Tailwind CSS & Shadcn/ui (using CSS variables for light/dark mode styling)
* **Authentication**: Supabase Auth (configured with Google/Gmail OAuth provider)
* **Storage**: AWS SDK v3 wrapper for S3 / DigitalOcean Spaces (`lib/s3-client.ts`)
* **State Management**: React state hooks (`useState`, `useEffect`, etc.)
* **Icons**: Lucide React (`lucide-react`)
* **Notifications**: React Hot Toast (`react-hot-toast`)

---

## Configuration & Environment Variables

Make sure to look at [.env.example](file:///.env.example) for required configuration keys:
* `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL endpoint
* `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon public client key
* `NEXT_PUBLIC_ENCRYPTION_KEY`: Secret string utilized for AES-encrypting/decrypting user S3 credentials

---

## File Structure Overview

* [app/page.tsx](file:///app/page.tsx) - Main page layout, dark/light theme toggle, S3 config modal entry, and robust session logout logic.
* [components/file-explorer.tsx](file:///components/file-explorer.tsx) - Core component containing path breadcrumbs, unified button groups (Upload, Go to Root, New Folder, Refresh, List/Grid View), search, file galleries (List/Grid), image thumbnail previews, and file cards.
* [components/media-player.tsx](file:///components/media-player.tsx) - Handles inline previews for video, audio, image, and PDF files.
* [lib/s3-client.ts](file:///lib/s3-client.ts) - Direct browser-to-S3 client manager wrapper.
* [lib/encryption.ts](file:///lib/encryption.ts) - AES helper algorithms for S3 storage configuration credential encryption.
* [docs/todo.txt](file:///docs/todo.txt) - Active project tasks tracker.
