import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ── Types ─────────────────────────────────────────────

export interface OgImageOptions {
  title: string;
  author?: string;
  durationMinutes?: number;
  turnCount?: number;
  toolCalls?: number;
  fileCount?: number;
  skills?: string[];
}

// ── Design tokens (from App.css) ──────────────────────

const COLORS = {
  bg: "#FEFDFB",
  ink: "#18151E",
  gray: "#6B667A",
  light: "#A8A3B5",
  faint: "#ECEAF0",
  violet: "#7C5CFC",
  rose: "#F9507A",
  teal: "#06B6A0",
  violetBg: "#F0ECFF",
  roseBg: "#FFF0F3",
  tealBg: "#EDFCF9",
} as const;

const WIDTH = 1200;
const HEIGHT = 630;

// ── Font loading ──────────────────────────────────────

let fontData: ArrayBuffer | null = null;

/**
 * Load the Space Grotesk font for Satori rendering.
 * Tries a local .ttf file first (bundled in assets/),
 * falls back to fetching from Google Fonts CDN.
 */
async function loadFont(): Promise<ArrayBuffer> {
  if (fontData) return fontData;

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const localPath = join(__dirname, "../assets/SpaceGrotesk-Medium.ttf");

  try {
    const buffer = readFileSync(localPath);
    fontData = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    return fontData;
  } catch {
    // Local font not found -- fetch from Google Fonts
  }

  const response = await fetch(
    "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500&display=swap",
  );
  const css = await response.text();
  const urlMatch = css.match(/url\(([^)]+)\)/);
  if (!urlMatch) {
    throw new Error(
      "Failed to extract font URL from Google Fonts CSS. Place SpaceGrotesk-Medium.ttf in local/assets/",
    );
  }

  const fontUrl = urlMatch[1];
  // Validate the font URL comes from a trusted Google Fonts domain
  if (!fontUrl.startsWith("https://fonts.gstatic.com/")) {
    throw new Error(
      "Font URL is not from fonts.gstatic.com. Place SpaceGrotesk-Medium.ttf in local/assets/",
    );
  }
  const fontResponse = await fetch(fontUrl);
  fontData = await fontResponse.arrayBuffer();
  return fontData;
}

// ── Stat formatting ───────────────────────────────────

function formatStat(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toString();
}

// ── Input validation ──────────────────────────────────

function validateOptions(options: OgImageOptions): OgImageOptions {
  const title =
    typeof options.title === "string" && options.title.trim().length > 0
      ? options.title.trim().slice(0, 120)
      : "Untitled Session";

  const author =
    typeof options.author === "string"
      ? options.author.trim().slice(0, 50)
      : undefined;

  const skills = Array.isArray(options.skills)
    ? options.skills
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .slice(0, 6)
        .map((s) => s.trim().slice(0, 30))
    : undefined;

  const durationMinutes =
    typeof options.durationMinutes === "number" && options.durationMinutes > 0
      ? Math.round(options.durationMinutes)
      : undefined;

  const turnCount =
    typeof options.turnCount === "number" && options.turnCount > 0
      ? Math.round(options.turnCount)
      : undefined;

  const toolCalls =
    typeof options.toolCalls === "number" && options.toolCalls > 0
      ? Math.round(options.toolCalls)
      : undefined;

  const fileCount =
    typeof options.fileCount === "number" && options.fileCount > 0
      ? Math.round(options.fileCount)
      : undefined;

  return { title, author, skills, durationMinutes, turnCount, toolCalls, fileCount };
}

// ── JSX-like element builder for Satori ───────────────
// Satori accepts a React-element-like tree but does not
// require actual React. We build the tree manually.

type SatoriNode = {
  type: string;
  props: Record<string, unknown> & { children?: SatoriNode | SatoriNode[] | string };
};

function el(
  type: string,
  props: Record<string, unknown>,
  ...children: Array<SatoriNode | string | null | undefined | false>
): SatoriNode {
  const filtered = children.filter(
    (c): c is SatoriNode | string => c !== null && c !== undefined && c !== false,
  );
  return {
    type,
    props: {
      ...props,
      children: filtered.length === 1 ? filtered[0] : filtered.length > 0 ? (filtered as SatoriNode[]) : undefined,
    },
  };
}

// ── Card composition ──────────────────────────────────

function buildStatChip(value: number, label: string): SatoriNode {
  return el(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "12px 20px",
        borderRadius: "10px",
        border: `1.5px solid ${COLORS.faint}`,
        minWidth: "90px",
      },
    },
    el(
      "span",
      {
        style: {
          fontFamily: "Space Grotesk",
          fontSize: "28px",
          fontWeight: 600,
          color: COLORS.ink,
          lineHeight: 1,
        },
      },
      formatStat(value),
    ),
    el(
      "span",
      {
        style: {
          fontFamily: "Space Grotesk",
          fontSize: "12px",
          fontWeight: 500,
          color: COLORS.light,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginTop: "4px",
        },
      },
      label,
    ),
  );
}

function buildSkillTag(skill: string, index: number): SatoriNode {
  const colors = [
    { bg: COLORS.violetBg, fg: COLORS.violet },
    { bg: COLORS.roseBg, fg: COLORS.rose },
    { bg: COLORS.tealBg, fg: COLORS.teal },
  ];
  const { bg, fg } = colors[index % colors.length];

  return el(
    "span",
    {
      style: {
        fontFamily: "Space Grotesk",
        fontSize: "14px",
        fontWeight: 500,
        padding: "6px 14px",
        borderRadius: "8px",
        backgroundColor: bg,
        color: fg,
      },
    },
    skill,
  );
}

function buildGradientLine(): SatoriNode {
  return el("div", {
    style: {
      width: "100%",
      height: "4px",
      borderRadius: "2px",
      background: `linear-gradient(90deg, ${COLORS.violet}, ${COLORS.rose}, ${COLORS.teal})`,
    },
  });
}

function buildCardTree(options: OgImageOptions): SatoriNode {
  const stats: SatoriNode[] = [];
  if (options.durationMinutes) stats.push(buildStatChip(options.durationMinutes, "min"));
  if (options.turnCount) stats.push(buildStatChip(options.turnCount, "turns"));
  if (options.toolCalls) stats.push(buildStatChip(options.toolCalls, "tools"));
  if (options.fileCount) stats.push(buildStatChip(options.fileCount, "files"));

  const skillTags =
    options.skills && options.skills.length > 0
      ? options.skills.map((s, i) => buildSkillTag(s, i))
      : null;

  return el(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: COLORS.bg,
        padding: "56px 64px",
        fontFamily: "Space Grotesk",
      },
    },
    // Logo
    el(
      "div",
      {
        style: {
          display: "flex",
          fontSize: "18px",
          fontWeight: 600,
          color: COLORS.light,
        },
      },
      el("span", { style: { color: COLORS.light } }, "heyi"),
      el("span", { style: { color: COLORS.violet } }, "."),
      el("span", { style: { color: COLORS.light } }, "am"),
    ),

    // Title
    el(
      "h1",
      {
        style: {
          fontSize: options.title.length > 60 ? "32px" : "40px",
          fontWeight: 700,
          color: COLORS.ink,
          lineHeight: 1.2,
          letterSpacing: "-0.03em",
          marginTop: "32px",
          maxWidth: "900px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        },
      },
      options.title,
    ),

    // Author
    options.author
      ? el(
          "p",
          {
            style: {
              fontSize: "16px",
              fontWeight: 500,
              color: COLORS.gray,
              marginTop: "12px",
            },
          },
          `By @${options.author}`,
        )
      : null,

    // Spacer
    el("div", { style: { flex: 1 } }),

    // Stats row
    stats.length > 0
      ? el(
          "div",
          {
            style: {
              display: "flex",
              gap: "16px",
              marginBottom: skillTags ? "20px" : "32px",
            },
          },
          ...stats,
        )
      : null,

    // Skills row
    skillTags
      ? el(
          "div",
          {
            style: {
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              marginBottom: "32px",
            },
          },
          ...skillTags,
        )
      : null,

    // Gradient line (brand element)
    buildGradientLine(),
  );
}

// ── Main export ───────────────────────────────────────

/**
 * Generate a 1200x630 PNG social card for og:image.
 *
 * Uses Satori to render a JSX-like tree to SVG, then
 * @resvg/resvg-js to rasterize to PNG. No browser needed.
 */
export async function generateOgImage(options: OgImageOptions): Promise<Buffer> {
  const validated = validateOptions(options);
  const font = await loadFont();
  const tree = buildCardTree(validated);

  const svg = await satori(tree as any, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      {
        name: "Space Grotesk",
        data: font,
        weight: 500,
        style: "normal",
      },
    ],
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: WIDTH },
  });
  const pngData = resvg.render();
  return Buffer.from(pngData.asPng());
}

// Re-export for testing
export { validateOptions, buildCardTree, formatStat, COLORS, WIDTH, HEIGHT };
