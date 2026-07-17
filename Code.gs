function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('QA Command Centre')
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

function getDashboardOverview() {
  return runSafely(function () {
    return Tracker.getDashboardOverview();
  });
}

function getDepartmentDashboard(departmentId) {
  return runSafely(function () {
    return Tracker.getDepartmentDashboard(departmentId);
  });
}

function getAllCoachingRecords() {
  return runSafely(function () {
    return Tracker.getAllCoachingRecords();
  });
}

function getAllPerformanceRecords() {
  return runSafely(function () {
    return Tracker.getAllPerformanceRecords();
  });
}

function getAllDisputeRecords() {
  return runSafely(function () {
    return Tracker.getAllDisputeRecords();
  });
}

function getScorecardCriteria() {
  return runSafely(function () {
    return Tracker.getScorecardCriteria();
  });
}

function saveWeeklyReview(payload) {
  return runSafely(function () {
    return Tracker.saveWeeklyReview(payload);
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
