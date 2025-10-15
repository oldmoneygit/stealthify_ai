'use client';

/**
 * LogViewer - Componente para exibir logs do servidor em tempo real no navegador
 *
 * Uso:
 * - Inclui o componente na página
 * - Passa o requestId recebido da API
 * - Logs aparecem automaticamente no console do navegador
 */

import { useEffect, useRef, useState } from 'react';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  data?: any;
}

interface LogViewerProps {
  requestId: string | null;
  autoScroll?: boolean;
  showInConsole?: boolean; // Exibir também no console do navegador
}

export function LogViewer({
  requestId,
  autoScroll = true,
  showInConsole = true
}: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const processedLogsCount = useRef(0);

  useEffect(() => {
    if (!requestId) {
      setLogs([]);
      processedLogsCount.current = 0;
      return;
    }

    setIsPolling(true);

    // Polling de logs a cada 500ms
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/logs/${requestId}`);

        if (!response.ok) {
          console.error('Erro ao buscar logs:', response.status);
          return;
        }

        const data = await response.json();
        const newLogs = data.logs as LogEntry[];

        setLogs(newLogs);

        // Exibir novos logs no console do navegador
        if (showInConsole && newLogs.length > processedLogsCount.current) {
          const unprocessedLogs = newLogs.slice(processedLogsCount.current);

          unprocessedLogs.forEach(log => {
            const emoji = getLogEmoji(log.level);
            const style = getLogStyle(log.level);
            const time = new Date(log.timestamp).toLocaleTimeString('pt-BR');

            if (log.data) {
              console.log(
                `%c${emoji} [${time}] ${log.message}`,
                style,
                log.data
              );
            } else {
              console.log(`%c${emoji} [${time}] ${log.message}`, style);
            }
          });

          processedLogsCount.current = newLogs.length;
        }

      } catch (error) {
        console.error('Erro ao fazer polling de logs:', error);
      }
    }, 500);

    return () => {
      clearInterval(interval);
      setIsPolling(false);
    };
  }, [requestId, showInConsole]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  if (!requestId) {
    return null;
  }

  return (
    <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm max-h-96 overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-gray-400 text-xs uppercase tracking-wide">
          Logs em Tempo Real
        </h3>
        <div className="flex items-center gap-2">
          {isPolling && (
            <div className="flex items-center gap-1 text-green-400 text-xs">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              Ao vivo
            </div>
          )}
          <span className="text-gray-500 text-xs">
            {logs.length} log{logs.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="space-y-1">
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            Aguardando logs...
          </div>
        ) : (
          logs.map((log, index) => (
            <div
              key={index}
              className={`py-1 px-2 rounded ${getLogBackgroundColor(log.level)}`}
            >
              <div className="flex items-start gap-2">
                <span className="text-xs opacity-50">
                  {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                </span>
                <span>{getLogEmoji(log.level)}</span>
                <span className={getLogTextColor(log.level)}>
                  {log.message}
                </span>
              </div>
              {log.data && (
                <pre className="mt-1 text-xs opacity-70 overflow-x-auto">
                  {JSON.stringify(log.data, null, 2)}
                </pre>
              )}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}

function getLogEmoji(level: LogEntry['level']): string {
  switch (level) {
    case 'info': return 'ℹ️';
    case 'warn': return '⚠️';
    case 'error': return '❌';
    case 'success': return '✅';
    default: return '📝';
  }
}

function getLogStyle(level: LogEntry['level']): string {
  switch (level) {
    case 'info': return 'color: #3b82f6'; // blue
    case 'warn': return 'color: #f59e0b'; // amber
    case 'error': return 'color: #ef4444; font-weight: bold'; // red
    case 'success': return 'color: #10b981'; // green
    default: return 'color: #6b7280'; // gray
  }
}

function getLogTextColor(level: LogEntry['level']): string {
  switch (level) {
    case 'info': return 'text-blue-400';
    case 'warn': return 'text-amber-400';
    case 'error': return 'text-red-400';
    case 'success': return 'text-green-400';
    default: return 'text-gray-400';
  }
}

function getLogBackgroundColor(level: LogEntry['level']): string {
  switch (level) {
    case 'info': return 'bg-blue-950/30';
    case 'warn': return 'bg-amber-950/30';
    case 'error': return 'bg-red-950/30';
    case 'success': return 'bg-green-950/30';
    default: return 'bg-gray-800/30';
  }
}
