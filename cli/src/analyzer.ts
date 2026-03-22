// Session Analyzer — transforms raw parser output into the rich Session type
// the React frontend expects (see cli/app/src/types.ts)

// ── Input types (contract with parser, Task 8.3) ──────────────

export interface ParsedTurn {
  timestamp: string;           // ISO or HH:mm:ss
  type: 'prompt' | 'response' | 'tool' | 'error';
  content: string;
  toolName?: string;           // e.g. "Read", "Edit", "Bash", "Grep", "Write"
  toolInput?: string;          // e.g. file path or command
  toolOutput?: string;         // abbreviated output
}

export interface ParsedFileChange {
  path: string;
  additions: number;
  deletions: number;
}

export interface SessionAnalysis {
  id: string;
  title: string;               // first prompt or summarized
  date: string;                // ISO timestamp
  /** End time as ISO timestamp */
  endTime?: string;
  durationMinutes: number;
  /** Wall-clock minutes (first to last timestamp, includes idle) */
  wallClockMinutes?: number;
  projectName: string;
  turns: ParsedTurn[];
  filesChanged: ParsedFileChange[];
  rawLog: string[];
  childSessions?: SessionAnalysis[];
  agentRole?: string;
  parentSessionId?: string | null;
  /** Working directory where the session was started */
  cwd?: string;
}

// ── Output types (mirrors cli/app/src/types.ts) ────────────────

export interface ExecutionStep {
  stepNumber: number;
  title: string;
  description: string;
  type?: 'analysis' | 'implementation' | 'testing' | 'deployment' | 'decision';
}

export interface ToolUsage {
  tool: string;
  count: number;
}

export interface TurnEvent {
  timestamp: string;
  type: 'prompt' | 'response' | 'tool' | 'error';
  content: string;
}

export interface FileChange {
  path: string;
  additions: number;
  deletions: number;
}

export interface Session {
  id: string;
  title: string;
  date: string;
  /** End time as ISO timestamp */
  endTime?: string;
  /** Active time in minutes (excludes idle gaps) */
  durationMinutes: number;
  /** Wall-clock time in minutes (first to last timestamp) */
  wallClockMinutes?: number;
  turns: number;
  linesOfCode: number;
  status: 'draft' | 'enhanced' | 'published' | 'archived';
  projectName: string;
  rawLog: string[];
  skills: string[];
  executionPath: ExecutionStep[];
  toolBreakdown: ToolUsage[];
  filesChanged: FileChange[];
  turnTimeline: TurnEvent[];
  toolCalls: number;
  /** AI-generated fields (populated from enhanced data) */
  context?: string;
  developerTake?: string;
  qaPairs?: Array<{ question: string; answer: string }>;
  childSessions?: Session[];
  parentSessionId?: string | null;
  agentRole?: string;
  isOrchestrated?: boolean;
  /** Working directory where the session was started */
  cwd?: string;
  /** True when enhanced via bulk mode with auto-accepted AI suggestions */
  quickEnhanced?: boolean;
}

// ── Skill extraction ───────────────────────────────────────────

const EXTENSION_SKILLS: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'React', '.jsx': 'React', '.js': 'JavaScript',
  '.rs': 'Rust', '.go': 'Go', '.py': 'Python', '.rb': 'Ruby',
  '.java': 'Java', '.kt': 'Kotlin', '.swift': 'Swift',
  '.css': 'CSS', '.scss': 'SCSS', '.html': 'HTML',
  '.sql': 'SQL', '.graphql': 'GraphQL',
  '.ex': 'Elixir', '.exs': 'Elixir', '.erl': 'Erlang',
  '.c': 'C', '.cpp': 'C++', '.h': 'C', '.hpp': 'C++',
  '.sh': 'Shell', '.bash': 'Shell', '.zsh': 'Shell',
  '.yml': 'YAML', '.yaml': 'YAML', '.toml': 'TOML',
  '.proto': 'Protobuf', '.tf': 'Terraform',
};

const CONFIG_FILE_SKILLS: Record<string, string> = {
  'Dockerfile': 'Docker', 'docker-compose.yml': 'Docker',
  'package.json': 'Node.js', 'tsconfig.json': 'TypeScript',
  'Cargo.toml': 'Rust', 'go.mod': 'Go', 'requirements.txt': 'Python',
  'Gemfile': 'Ruby', 'mix.exs': 'Elixir', 'build.gradle': 'Gradle',
  'pom.xml': 'Maven', '.eslintrc': 'ESLint', 'jest.config': 'Jest',
  'vitest.config': 'Vitest', 'webpack.config': 'Webpack',
  'vite.config': 'Vite', 'tailwind.config': 'Tailwind CSS',
  'prisma/schema.prisma': 'Prisma', 'drizzle.config': 'Drizzle',
};

const IMPORT_PATTERNS: Array<{ pattern: RegExp; skill: string }> = [
  { pattern: /from\s+['"]react['"]/, skill: 'React' },
  { pattern: /from\s+['"]express['"]/, skill: 'Express' },
  { pattern: /from\s+['"]next/, skill: 'Next.js' },
  { pattern: /from\s+['"]@angular/, skill: 'Angular' },
  { pattern: /from\s+['"]vue['"]/, skill: 'Vue' },
  { pattern: /from\s+['"]@nestjs/, skill: 'NestJS' },
  { pattern: /from\s+['"]fastify['"]/, skill: 'Fastify' },
  { pattern: /from\s+['"]zod['"]/, skill: 'Zod' },
  { pattern: /from\s+['"]@prisma/, skill: 'Prisma' },
  { pattern: /from\s+['"]redis['"]/, skill: 'Redis' },
  { pattern: /from\s+['"]pg['"]/, skill: 'PostgreSQL' },
  { pattern: /from\s+['"]mongoose['"]/, skill: 'MongoDB' },
  { pattern: /from\s+['"]@aws-sdk/, skill: 'AWS' },
  { pattern: /from\s+['"]@anthropic/, skill: 'Claude API' },
  { pattern: /from\s+['"]openai['"]/, skill: 'OpenAI' },
];

export function extractSkills(analysis: SessionAnalysis): string[] {
  const skills = new Set<string>();

  // From file extensions
  for (const file of analysis.filesChanged) {
    const ext = extname(file.path);
    if (ext && EXTENSION_SKILLS[ext]) {
      skills.add(EXTENSION_SKILLS[ext]);
    }
  }

  // From config file names
  for (const file of analysis.filesChanged) {
    const basename = file.path.split('/').pop() ?? '';
    for (const [configFile, skill] of Object.entries(CONFIG_FILE_SKILLS)) {
      if (basename.startsWith(configFile) || file.path.includes(configFile)) {
        skills.add(skill);
      }
    }
  }

  // From import statements and tool output in turns
  const allContent = analysis.turns
    .filter((t) => t.type === 'tool' || t.type === 'response')
    .map((t) => [t.content, t.toolOutput ?? ''].join('\n'))
    .join('\n');

  for (const { pattern, skill } of IMPORT_PATTERNS) {
    if (pattern.test(allContent)) {
      skills.add(skill);
    }
  }

  // From tool names (if Claude Code tools are used)
  const toolNames = new Set(analysis.turns.filter((t) => t.toolName).map((t) => t.toolName!));
  if (toolNames.has('Bash')) skills.add('Shell');

  return [...skills].sort();
}

function extname(filePath: string): string {
  const dot = filePath.lastIndexOf('.');
  return dot > 0 ? filePath.slice(dot) : '';
}

// ── Tool breakdown ─────────────────────────────────────────────

export function computeToolBreakdown(turns: ParsedTurn[]): ToolUsage[] {
  const counts = new Map<string, number>();
  for (const turn of turns) {
    if (turn.type === 'tool' && turn.toolName) {
      counts.set(turn.toolName, (counts.get(turn.toolName) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count);
}

// ── Execution path generation ──────────────────────────────────

interface TurnGroup {
  turns: ParsedTurn[];
  startIndex: number;
}

function classifyStepType(group: TurnGroup): ExecutionStep['type'] {
  const tools = group.turns.filter((t) => t.type === 'tool');
  const toolNames = new Set(tools.map((t) => t.toolName).filter(Boolean));
  const contents = group.turns.map((t) => t.content.toLowerCase()).join(' ');

  if (contents.includes('test') || contents.includes('spec') || contents.includes('assert')) {
    return 'testing';
  }
  if (contents.includes('deploy') || contents.includes('release') || contents.includes('ci')) {
    return 'deployment';
  }
  const readOnlyTools = new Set(['Read', 'Grep', 'Glob']);
  if (toolNames.size > 0 && [...toolNames].every((n) => readOnlyTools.has(n!))) {
    return 'analysis';
  }
  if (tools.some((t) => t.content.toLowerCase().includes('chose') || t.content.toLowerCase().includes('decided'))) {
    return 'decision';
  }
  return 'implementation';
}

function summarizeGroup(group: TurnGroup): { title: string; description: string } {
  const tools = group.turns.filter((t) => t.type === 'tool');
  const files = tools
    .filter((t) => t.toolInput)
    .map((t) => t.toolInput!.split('/').pop() ?? t.toolInput!)
    .filter((v, i, a) => a.indexOf(v) === i);

  const toolNames = [...new Set(tools.map((t) => t.toolName).filter(Boolean))];

  // Use the first prompt or response as description basis
  const narrative = group.turns.find((t) => t.type === 'response' || t.type === 'prompt');
  const desc = narrative?.content ?? `Used ${toolNames.join(', ')} on ${files.join(', ')}`;

  // Title: derive from the dominant action
  let title: string;
  if (toolNames.length === 0 && group.turns.some((t) => t.type === 'prompt')) {
    title = 'Discussed approach';
  } else if (files.length > 0) {
    const readOnly = toolNames.every((n) => n === 'Read' || n === 'Grep' || n === 'Glob');
    if (readOnly) {
      title = `Analyzed ${files.slice(0, 3).join(', ')}`;
    } else {
      title = `Modified ${files.slice(0, 3).join(', ')}`;
    }
  } else if (toolNames.includes('Bash')) {
    title = 'Ran shell commands';
  } else {
    title = 'Worked on implementation';
  }

  return {
    title,
    description: desc.length > 200 ? desc.slice(0, 197) + '...' : desc,
  };
}

export function generateExecutionPath(turns: ParsedTurn[]): ExecutionStep[] {
  if (turns.length === 0) return [];

  // Group turns into logical steps: a prompt starts a new group,
  // consecutive tool calls are grouped together, responses end groups
  const groups: TurnGroup[] = [];
  let current: TurnGroup = { turns: [], startIndex: 0 };

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];

    if (turn.type === 'prompt' && current.turns.length > 0) {
      groups.push(current);
      current = { turns: [], startIndex: i };
    }

    current.turns.push(turn);
  }

  if (current.turns.length > 0) {
    groups.push(current);
  }

  return groups.map((group, idx) => {
    const { title, description } = summarizeGroup(group);
    return {
      stepNumber: idx + 1,
      title,
      description,
      type: classifyStepType(group),
    };
  });
}

// ── Turn timeline ──────────────────────────────────────────────

export function buildTurnTimeline(turns: ParsedTurn[]): TurnEvent[] {
  return turns.map((t) => ({
    timestamp: t.timestamp,
    type: t.type,
    content: t.type === 'tool' && t.toolName
      ? `${t.toolName} ${t.toolInput ?? ''}`.trim()
      : t.content,
  }));
}

// ── Context detection ──────────────────────────────────────────

export function detectContext(analysis: SessionAnalysis): string | undefined {
  // Try to extract git branch from Bash commands
  const bashTurns = analysis.turns.filter(
    (t) => t.type === 'tool' && t.toolName === 'Bash'
  );

  let branch: string | undefined;
  for (const turn of bashTurns) {
    const branchMatch = turn.content.match(/git\s+(?:checkout|switch)\s+(?:-[bc]\s+)?(\S+)/);
    if (branchMatch) {
      branch = branchMatch[1];
      break;
    }
    const outputMatch = turn.toolOutput?.match(/On branch (\S+)/);
    if (outputMatch) {
      branch = outputMatch[1];
      break;
    }
  }

  // Detect project type from config files touched
  const configFiles = analysis.filesChanged
    .map((f) => f.path.split('/').pop() ?? '')
    .filter((f) => CONFIG_FILE_SKILLS[f]);

  const parts: string[] = [];
  if (branch) parts.push(`Branch: ${branch}`);
  if (configFiles.length > 0) {
    const types = configFiles.map((f) => CONFIG_FILE_SKILLS[f]).filter((v, i, a) => a.indexOf(v) === i);
    parts.push(`Stack: ${types.join(', ')}`);
  }

  return parts.length > 0 ? parts.join('. ') : undefined;
}

// ── Lines of code ──────────────────────────────────────────────

export function computeLinesOfCode(filesChanged: ParsedFileChange[]): number {
  return filesChanged.reduce((sum, f) => sum + f.additions + f.deletions, 0);
}

// ── Main analyzer ──────────────────────────────────────────────

export function analyzeSession(analysis: SessionAnalysis): Session {
  const toolTurns = analysis.turns.filter((t) => t.type === 'tool');
  const childSessions = analysis.childSessions?.map(analyzeSession);
  const isOrchestrated = childSessions !== undefined && childSessions.length > 0;

  return {
    id: analysis.id,
    title: analysis.title,
    date: analysis.date,
    ...(analysis.endTime ? { endTime: analysis.endTime } : {}),
    durationMinutes: analysis.durationMinutes,
    ...(analysis.wallClockMinutes != null ? { wallClockMinutes: analysis.wallClockMinutes } : {}),
    turns: analysis.turns.length,
    linesOfCode: computeLinesOfCode(analysis.filesChanged),
    status: 'draft',
    projectName: analysis.projectName,
    rawLog: analysis.rawLog,
    skills: extractSkills(analysis),
    executionPath: generateExecutionPath(analysis.turns),
    toolBreakdown: computeToolBreakdown(analysis.turns),
    filesChanged: analysis.filesChanged,
    turnTimeline: buildTurnTimeline(analysis.turns),
    toolCalls: toolTurns.length,
    ...(childSessions && childSessions.length > 0 ? { childSessions } : {}),
    ...(analysis.parentSessionId != null ? { parentSessionId: analysis.parentSessionId } : {}),
    ...(analysis.agentRole ? { agentRole: analysis.agentRole } : {}),
    ...(isOrchestrated ? { isOrchestrated } : {}),
    ...(analysis.cwd ? { cwd: analysis.cwd } : {}),
  };
}
