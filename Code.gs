function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('QA Performance Management System')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getInitialData() {
  return runSafely(function () {
    return Tracker.getInitialData();
  });
}

function getAgentsByDepartment(departmentId) {
  return runSafely(function () {
    return Tracker.getAgentsByDepartment(departmentId);
  });
}

function getAgentDashboard(agentId) {
  return runSafely(function () {
    return Tracker.getAgentDashboard(agentId);
  });
}

function saveCoaching(payload) {
  return runSafely(function () {
    return Tracker.saveCoaching(payload);
  });
}

function savePerformance(payload) {
  return runSafely(function () {
    return Tracker.savePerformance(payload);
  });
}

function saveDispute(payload) {
  return runSafely(function () {
    return Tracker.saveDispute(payload);
  });
}

function runSafely(callback) {
  try {
    var result = callback();
    return result && typeof result === 'object'
      ? result
      : { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      message: error && error.message ? error.message : 'An unexpected error occurred.'
    };
  }
}
