'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

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
}

interface GameFinalPayload {
  gameId: number;
  homeScore: number;
  awayScore: number;
  status: 'final';
}

export function useGameSocket(gameId: number | null) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [lastEvent, setLastEvent] = useState<GameUpdatePayload['event'] | null>(null);
  const [isFinal, setIsFinal] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);

  const connect = useCallback(() => {
    if (!gameId || socketRef.current?.connected) return;

    const socket = io(API_URL, {
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
  }, [gameId]);

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

  return { connected, gameState, lastEvent, isFinal, viewerCount, setGameState };
}
