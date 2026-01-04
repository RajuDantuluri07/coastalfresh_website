exports.validateFarmData = (data) => {
    if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
        return "Farm name is required.";
    }
    return null;
};

exports.validateTankData = (data) => {
    if (!data.farmId) return "Farm ID is required.";
    if (!data.name) return "Tank name is required.";
    return null;
};

exports.validateFeedRoundData = (data) => {
    if (!data.tankId) return "Tank ID is required.";
    if (!data.feedAmount || data.feedAmount <= 0) {
        return "Valid feed amount is required.";
    }
    return null;
};