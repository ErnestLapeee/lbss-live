'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface GameState {
  inning: number;
  half: 'top' | 'bot';
  outs: number;
  homeScore: number;
  awayScore: number;
  bases: { first: number | null; second: number | null; third: number | null };
  homeLineScore: number[];
  awayLineScore: number[];
  eventCount: number;
}

interface GameUpdatePayload {
  state?: GameState;
  event?: {
    eventNumber: number;
    eventType: string;
    batterId?: number;
    pitcherId?: number;
    eventDetail?: string;
  };
  status?: string;
  lineupAdjusted?: boolean;
}

interface GameFinalPayload {
  gameId: number;
  homeScore: number;
  awayScore: number;
  status: 'final';
}

export function useGameSocket(gameId: number | null, apiUrl: string) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [lastEvent, setLastEvent] = useState<GameUpdatePayload['event'] | null>(null);
  const [updateSeq, setUpdateSeq] = useState(0);
  const [isFinal, setIsFinal] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);

  const connect = useCallback(() => {
    if (!gameId || socketRef.current?.connected) return;

    const socket = io(apiUrl, {
      path: '/ws',
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('game:subscribe', gameId);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('game:update', (data: GameUpdatePayload) => {
      setUpdateSeq((seq) => seq + 1);
      if (data.state) setGameState(data.state);
      if (data.event) setLastEvent(data.event);
    });

    socket.on('game:final', (data: GameFinalPayload) => {
      setIsFinal(true);
      setGameState(prev => prev ? { ...prev, homeScore: data.homeScore, awayScore: data.awayScore } : prev);
    });

    socket.on('game:viewers', (data: { gameId: number; count: number }) => {
      setViewerCount(data.count);
    });

    socketRef.current = socket;
  }, [gameId, apiUrl]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      if (gameId) socketRef.current.emit('game:unsubscribe', gameId);
      socketRef.current.disconnect();
      socketRef.current = null;
      setConnected(false);
    }
  }, [gameId]);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { connected, gameState, lastEvent, updateSeq, isFinal, viewerCount, setGameState };
}
