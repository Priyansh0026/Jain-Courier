// In-memory fallback database store to allow testing without local MongoDB installation
const memoryStore = {
  users: [],
  verifications: new Map()
};

module.exports = memoryStore;
