'use strict';

const fs = require('node:fs');
const path = require('node:path');

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/**
 * Shared task journal for install/update. It stores metadata only; never
 * credentials, download URLs with tokens, or task logs containing secrets.
 */
function createTaskJournal({ file, max = 80 } = {}) {
  if (!file) throw new Error('task journal file is required');

  function read() {
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      return value && Array.isArray(value.tasks) ? value : { version: 1, tasks: [] };
    } catch {
      return { version: 1, tasks: [] };
    }
  }

  function record(task) {
    if (!task || !task.id) return;
    const value = read();
    const safe = {
      id: String(task.id),
      kind: String(task.kind || 'unknown'),
      component: task.component || null,
      status: String(task.status || 'unknown'),
      targetDir: task.targetDir || null,
      version: task.version || null,
      percent: task.percent == null ? null : Number(task.percent),
      error: task.error ? String(task.error).slice(0, 300) : null,
      createdAt: Number(task.createdAt) || Date.now(),
      updatedAt: Number(task.updatedAt) || Date.now(),
      finishedAt: Number(task.finishedAt) || null
    };
    const index = value.tasks.findIndex((item) => item.id === safe.id);
    if (index >= 0) value.tasks[index] = safe;
    else value.tasks.push(safe);
    value.tasks.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    value.tasks = value.tasks.slice(0, Math.max(1, Number(max) || 80));
    writeAtomic(file, value);
  }

  function list() {
    return read().tasks;
  }

  function get(id) {
    return read().tasks.find((item) => item.id === String(id)) || null;
  }

  return { record, list, get, file };
}

module.exports = { createTaskJournal };
