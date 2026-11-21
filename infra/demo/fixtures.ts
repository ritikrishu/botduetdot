export const ACME_FORECAST_TS = `export interface Forecast {
  readonly city: string;
  readonly highC: number;
  readonly lowC: number;
}

export function averageTemperatureC(forecast: Forecast): number {
  return (forecast.highC + forecast.lowC) / 2;
}

export function describe(forecast: Forecast): string {
  return \`\${forecast.city}: \${forecast.lowC}C to \${forecast.highC}C\`;
}
`;

export const DEMO_REPOS: Record<
  "acme-weather" | "notes-cli" | "pixel-garden",
  Record<string, string>
> = {
  "acme-weather": {
    "README.md": `# Acme Weather

A tiny forecast library used for demos.

## Development

Run the tests with \`npm test\`.
`,
    "package.json": `{
  "name": "acme-weather",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  }
}
`,
    "src/forecast.ts": ACME_FORECAST_TS,
  },
  "notes-cli": {
    "README.md": `# Notes CLI

Keep short notes from the terminal.
`,
    "package.json": `{
  "name": "notes-cli",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "bin": { "notes": "./src/index.ts" }
}
`,
    "src/index.ts": `import { addNote, listNotes } from "./notes.ts";

const [command, ...rest] = process.argv.slice(2);

if (command === "add") {
  addNote(rest.join(" "));
} else {
  for (const note of listNotes()) console.log(note);
}
`,
    "src/notes.ts": `const notes: string[] = [];

export function addNote(text: string): void {
  if (text.trim().length > 0) notes.push(text.trim());
}

export function listNotes(): ReadonlyArray<string> {
  return notes;
}
`,
  },
  "pixel-garden": {
    "README.md": `# Pixel Garden

A small grid where flowers grow one tick at a time.
`,
    "package.json": `{
  "name": "pixel-garden",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
`,
    "src/garden.ts": `export type Cell = "empty" | "seed" | "flower";

export function createGarden(size: number): Cell[][] {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => "empty" as Cell));
}

export function tick(garden: Cell[][]): Cell[][] {
  return garden.map((row) =>
    row.map((cell) => (cell === "seed" ? "flower" : cell)),
  );
}
`,
  },
};

export const DEMO_THREADS: ReadonlyArray<{
  repo: keyof typeof DEMO_REPOS;
  title: string;
  model: "code-change";
  messages: ReadonlyArray<string>;
}> = [
  {
    repo: "acme-weather",
    title: "Add a Fahrenheit helper",
    model: "code-change",
    messages: [
      "Add a helper that converts a forecast's average temperature to Fahrenheit, with a test.",
      "Looks good. Can you double check the rounding?",
    ],
  },
];

export const DEMO_SPACES = [
  { id: "work", name: "Work", icon: "💼", repos: ["acme-weather", "notes-cli"] },
  { id: "side", name: "Side projects", icon: "🚀", repos: ["pixel-garden"] },
] as const;
