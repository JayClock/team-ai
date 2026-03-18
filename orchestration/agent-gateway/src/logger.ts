import type { LogLevel } from './config.js';

const LOG_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  constructor(private readonly level: LogLevel) {}

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (LOG_PRIORITY[level] < LOG_PRIORITY[this.level]) {
      return;
    }

    const record = {
      time: new Date().toISOString(),
      level,
      message,
      data,
    };

    if (level === 'error') {
      console.error(JSON.stringify(record));
      return;
    }

    console.log(JSON.stringify(record));
  }
}
