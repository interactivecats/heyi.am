export { WorkTimeline, computeSegments } from './WorkTimeline';
export type { WorkTimelineProps } from './WorkTimeline';

export { GrowthChart, buildGrowthTimeSeries, buildSmoothPath, formatLocAxis, formatLocDelta, computeAxisTicks } from './GrowthChart';
export type { GrowthPoint, SessionBoundary } from './GrowthChart';

export { DirectoryHeatmap } from './DirectoryHeatmap';

export type {
  Session,
  ChildSessionSummary,
  ExecutionStep,
  ToolUsage,
  FileChange,
  TurnEvent,
  QaPair,
} from './types';
