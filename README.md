# Excel God Mode

Offline Excel engine for oil field accounting. Bilingual (Arabic/English) with RTL support.

## Features

- Import .xlsx/.xls templates
- Auto-detects field types (text, number, date, select)
- Preserves Excel formulas with live calculation preview
- Add custom fields mapped to any sheet/column
- Quick entry forms with sheet tabs
- Global search across all sheets
- Version history with rollback
- Export back to XLSX or PDF summary
- 100% offline - all data stays on device via AsyncStorage

## Tech Stack

- Expo Router (tab-based navigation)
- React Native + TypeScript
- XLSX (SheetJS) for Excel parsing/writing
- AsyncStorage for local persistence
- Lucide icons

## Getting Started

```bash
npm install
npm run dev
```

## Build

```bash
npm run typecheck
npm run build:web
```
