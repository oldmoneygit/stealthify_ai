/**
 * Browser Logger - Envia logs do servidor para o console do navegador
 *
 * Uso:
 * - No servidor (API Routes): Usar log() ao invés de console.log()
 * - Os logs serão armazenados e retornados para o cliente
 * - O cliente exibe os logs no console do navegador em tempo real
 */

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  data?: any;
}

// Store de logs (em memória)
const logStore: Map<string, LogEntry[]> = new Map();

/**
 * Gera ID único para cada requisição
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Logger centralizado que armazena logs para envio ao cliente
 */
export class BrowserLogger {
  private requestId: string;

  constructor(requestId: string) {
    this.requestId = requestId;

    // Inicializar array de logs para esta requisição
    if (!logStore.has(requestId)) {
      logStore.set(requestId, []);
    }
  }

  private addLog(level: LogEntry['level'], message: string, data?: any) {
    const logs = logStore.get(this.requestId) || [];

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };

    logs.push(entry);
    logStore.set(this.requestId, logs);

    // Também logar no terminal (backup)
    const emoji = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'success' ? '✅' : 'ℹ️';
    console.log(`${emoji} [${this.requestId.substring(0, 8)}] ${message}`, data || '');
  }

  info(message: string, data?: any) {
    this.addLog('info', message, data);
  }

  warn(message: string, data?: any) {
    this.addLog('warn', message, data);
  }

  error(message: string, data?: any) {
    this.addLog('error', message, data);
  }

  success(message: string, data?: any) {
    this.addLog('success', message, data);
  }

  /**
   * Retorna todos os logs desta requisição
   */
  getLogs(): LogEntry[] {
    return logStore.get(this.requestId) || [];
  }

  /**
   * Limpa logs desta requisição (libera memória)
   */
  clearLogs() {
    logStore.delete(this.requestId);
  }
}

/**
 * Cria uma instância do logger para uma requisição
 */
export function createLogger(requestId?: string): BrowserLogger {
  const id = requestId || generateRequestId();
  return new BrowserLogger(id);
}

/**
 * Recupera logs de uma requisição específica
 */
export function getRequestLogs(requestId: string): LogEntry[] {
  return logStore.get(requestId) || [];
}

/**
 * Limpa logs antigos (garbage collection)
 * Executar periodicamente para evitar memory leak
 */
export function cleanupOldLogs(maxAgeMinutes: number = 10) {
  const cutoffTime = Date.now() - (maxAgeMinutes * 60 * 1000);

  let cleaned = 0;
  for (const [requestId, logs] of logStore.entries()) {
    if (logs.length === 0) {
      logStore.delete(requestId);
      cleaned++;
      continue;
    }

    const lastLog = logs[logs.length - 1];
    if (lastLog && new Date(lastLog.timestamp).getTime() < cutoffTime) {
      logStore.delete(requestId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 Limpou ${cleaned} log store(s) antiga(s)`);
  }
}

// Limpar logs antigos a cada 5 minutos
if (typeof setInterval !== 'undefined') {
  setInterval(() => cleanupOldLogs(10), 5 * 60 * 1000);
}
