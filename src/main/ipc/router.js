'use strict';

const { isKnownChannel } = require('./contracts');

class AppError extends Error {
  constructor(code, message, { retryable = false, details = null } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

function ok(data) {
  return { ok: true, data };
}

function fail(error) {
  if (error instanceof AppError) {
    return { ok: false, error: { code: error.code, message: error.message, retryable: error.retryable, details: error.details } };
  }
  return {
    ok: false,
    error: {
      code: 'E_INTERNAL',
      message: String(error?.message || error || 'unknown error'),
      retryable: false,
      details: null
    }
  };
}

function asAppError(error, fallbackCode = 'E_INTERNAL') {
  if (error instanceof AppError) return error;
  return new AppError(fallbackCode, String(error?.message || error || 'unknown error'));
}

function createIpcRouter({ ipcMain, log = () => {} } = {}) {
  const registered = [];
  const handlers = new Set();
  if (!ipcMain || typeof ipcMain.handle !== 'function') throw new Error('ipcMain.handle is required');

  function register(channel, handler, { result = false, fallbackCode = 'E_INTERNAL' } = {}) {
    const name = String(channel || '');
    if (!isKnownChannel(name)) throw new Error(`IPC channel not in contract: ${name}`);
    if (handlers.has(name)) throw new Error(`IPC channel registered twice: ${name}`);
    handlers.add(name);
    registered.push(name);
    ipcMain.handle(name, async (event, payload) => {
      try {
        const value = await handler(event, payload);
        return result ? ok(value) : value;
      } catch (error) {
        log('ipc', `${name} failed: ${error?.code || error?.message || error}`);
        if (result) return fail(asAppError(error, fallbackCode));
        throw error;
      }
    });
  }

  return {
    handle: (channel, handler) => register(channel, handler),
    handleResult: (channel, handler, options = {}) => register(channel, handler, { ...options, result: true }),
    registered: () => [...registered],
    channels: () => [...handlers]
  };
}

module.exports = { createIpcRouter, AppError, ok, fail, asAppError };
