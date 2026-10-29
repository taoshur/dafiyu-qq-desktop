'use strict';

// Read-only memory view. The actual extraction/recall/lifecycle engine stays in
// qq-bridge; the desktop only queries or reviews the isolated test DB.
const memory = require('../../memory');

module.exports = {
  status: memory.memoryStatus,
  list: memory.listMemory,
  candidate: memory.getCandidate,
  initTestDb: memory.initTestDb,
  review: memory.reviewCandidate
};
