import { useState, useRef, useCallback, useEffect } from "react";
import type { Turn, ToolCall } from "../types";

export type PlaybackPhase =
  | "idle"
  | "typing_prompt"
  | "thinking"
  | "streaming_response"
  | "tool_running"
  | "turn_gap"
  | "finished";

export interface ToolCallState {
  toolCall: ToolCall;
  status: "pending" | "running" | "resolved";
}

export interface PlaybackState {
  phase: PlaybackPhase;
  currentTurnIndex: number;
  visiblePrompt: string;
  visibleResponse: string;
  toolCallStates: ToolCallState[];
  currentToolIndex: number;
  isPlaying: boolean;
  speed: number;
  completedTurns: Turn[];
}

const PROMPT_CPS = 45;
const THINKING_MS = 700;
const TOOL_RUN_MS = 800;
const TURN_GAP_MS = 1200;

export function usePlaybackEngine(turns: Turn[]) {
  const [state, setState] = useState<PlaybackState>({
    phase: "idle",
    currentTurnIndex: 0,
    visiblePrompt: "",
    visibleResponse: "",
    toolCallStates: [],
    currentToolIndex: -1,
    isPlaying: false,
    speed: 1,
    completedTurns: [],
  });

  const rafRef = useRef<number>(0);
  const phaseStartRef = useRef(0);
  const speedRef = useRef(state.speed);
  speedRef.current = state.speed;

  const currentTurn = turns[state.currentTurnIndex] ?? null;

  useEffect(() => {
    if (!state.isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const animate = () => {
      const now = performance.now();
      const elapsed = (now - phaseStartRef.current) * speedRef.current;

      setState((prev) => {
        if (!prev.isPlaying) return prev;
        const turn = turns[prev.currentTurnIndex];
        if (!turn) return { ...prev, phase: "finished", isPlaying: false };

        switch (prev.phase) {
          case "typing_prompt": {
            const chars = Math.floor((elapsed / 1000) * PROMPT_CPS);
            if (chars >= turn.userPrompt.length) {
              phaseStartRef.current = now;
              return { ...prev, visiblePrompt: turn.userPrompt, phase: "thinking" };
            }
            return { ...prev, visiblePrompt: turn.userPrompt.slice(0, chars) };
          }

          case "thinking": {
            if (elapsed < THINKING_MS) return prev;
            phaseStartRef.current = now;
            if (turn.toolCalls.length > 0) {
              return {
                ...prev,
                phase: "tool_running",
                toolCallStates: turn.toolCalls.map((tc, i): ToolCallState => ({
                  toolCall: tc,
                  status: i === 0 ? "running" : "pending",
                })),
                currentToolIndex: 0,
              };
            }
            return { ...prev, phase: "streaming_response", visibleResponse: "" };
          }

          case "tool_running": {
            if (elapsed < TOOL_RUN_MS) return prev;
            phaseStartRef.current = now;
            const newTools = prev.toolCallStates.map((s, i) => {
              if (i === prev.currentToolIndex) return { ...s, status: "resolved" as const };
              if (i === prev.currentToolIndex + 1) return { ...s, status: "running" as const };
              return s;
            });
            const nextIdx = prev.currentToolIndex + 1;
            if (nextIdx < turn.toolCalls.length) {
              return { ...prev, toolCallStates: newTools, currentToolIndex: nextIdx };
            }
            return { ...prev, toolCallStates: newTools, phase: "streaming_response", visibleResponse: "" };
          }

          case "streaming_response": {
            // Show Claude's full response immediately (not character by character)
            phaseStartRef.current = now;
            return {
              ...prev,
              visibleResponse: turn.assistantText,
              phase: "turn_gap",
            };
          }

          case "turn_gap": {
            if (elapsed < TURN_GAP_MS) return prev;
            const nextIdx = prev.currentTurnIndex + 1;
            // Move current turn to completed
            const completed = [...prev.completedTurns, turn];
            if (nextIdx >= turns.length) {
              return { ...prev, phase: "finished", isPlaying: false, completedTurns: completed };
            }
            phaseStartRef.current = now;
            return {
              ...prev,
              completedTurns: completed,
              currentTurnIndex: nextIdx,
              visiblePrompt: "",
              visibleResponse: "",
              toolCallStates: [],
              currentToolIndex: -1,
              phase: "typing_prompt",
            };
          }

          default:
            return prev;
        }
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    // Don't reset phaseStartRef if we're resuming mid-phase
    if (phaseStartRef.current === 0) {
      phaseStartRef.current = performance.now();
    }
    rafRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(rafRef.current);
  }, [state.isPlaying, turns]);

  const play = useCallback(() => {
    phaseStartRef.current = performance.now();
    setState((prev) => {
      if (prev.phase === "idle" || prev.phase === "finished") {
        return {
          ...prev,
          isPlaying: true,
          phase: "typing_prompt",
          currentTurnIndex: prev.phase === "finished" ? 0 : prev.currentTurnIndex,
          completedTurns: prev.phase === "finished" ? [] : prev.completedTurns,
          visiblePrompt: "",
          visibleResponse: "",
          toolCallStates: [],
          currentToolIndex: -1,
        };
      }
      return { ...prev, isPlaying: true };
    });
  }, []);

  const pause = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  const togglePlay = useCallback(() => {
    setState((prev) => {
      if (prev.isPlaying) return { ...prev, isPlaying: false };
      phaseStartRef.current = performance.now();
      if (prev.phase === "idle" || prev.phase === "finished") {
        return {
          ...prev,
          isPlaying: true,
          phase: "typing_prompt",
          currentTurnIndex: prev.phase === "finished" ? 0 : prev.currentTurnIndex,
          completedTurns: prev.phase === "finished" ? [] : prev.completedTurns,
          visiblePrompt: "",
          visibleResponse: "",
          toolCallStates: [],
          currentToolIndex: -1,
        };
      }
      return { ...prev, isPlaying: true };
    });
  }, []);

  const setSpeed = useCallback((speed: number) => {
    phaseStartRef.current = performance.now();
    setState((prev) => ({ ...prev, speed }));
  }, []);

  const jumpToTurn = useCallback((turnIndex: number) => {
    if (turnIndex < 0 || turnIndex >= turns.length) return;
    phaseStartRef.current = performance.now();
    setState((prev) => ({
      ...prev,
      currentTurnIndex: turnIndex,
      completedTurns: turns.slice(0, turnIndex),
      visiblePrompt: "",
      visibleResponse: "",
      toolCallStates: [],
      currentToolIndex: -1,
      phase: prev.isPlaying ? "typing_prompt" : "idle",
    }));
  }, [turns]);

  return {
    ...state,
    currentTurn,
    totalTurns: turns.length,
    play,
    pause,
    togglePlay,
    setSpeed,
    jumpToTurn,
  };
}
