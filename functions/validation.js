const validateFarmData = (data) => {
  if (!data.name || typeof data.name !== 'string' || data.name.length === 0) {
    return 'Farm name is required.';
  }
  return null;
};

const validateTankData = (data) => {
  if (!data.name || typeof data.name !== 'string' || data.name.length === 0) {
    return 'Tank name is required.';
  }
  if (!data.farmId || typeof data.farmId !== 'string' || data.farmId.length === 0) {
    return 'Farm ID is required.';
  }
  return null;
};

const validateFeedRoundData = (data) => {
  if (!data.tankId || typeof data.tankId !== 'string' || data.tankId.length === 0) {
    return 'Tank ID is required.';
  }
  if (typeof data.feedAmount !== 'number' || data.feedAmount < 0) {
    return 'Feed amount must be a non-negative number.';
  }
  return null;
};

module.exports = {
  validateFarmData,
  validateTankData,
  validateFeedRoundData,
};
