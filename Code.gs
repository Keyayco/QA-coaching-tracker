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

function getRootCauseDrilldown(departmentId, rootCause) {
  return runSafely(function () {
    return Tracker.getRootCauseDrilldown(departmentId, rootCause);
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

function getScorecardCriteria(templateId) {
  return runSafely(function () {
    return Tracker.getScorecardCriteria(templateId);
  });
}

function getScorecardTemplatesForDepartment(departmentId) {
  return runSafely(function () {
    return Tracker.getScorecardTemplatesForDepartment(departmentId);
  });
}

function getAllScorecardTemplates() {
  return runSafely(function () {
    return Tracker.getAllScorecardTemplates();
  });
}

function saveScorecardTemplate(payload) {
  return runSafely(function () {
    return Tracker.saveScorecardTemplate(payload);
  });
}

function updateScorecardTemplate(templateId, payload) {
  return runSafely(function () {
    return Tracker.updateScorecardTemplate(templateId, payload);
  });
}

function getSuggestedAuditScore(templateId, failedCriteriaNames) {
  return runSafely(function () {
    return Tracker.getSuggestedAuditScore(templateId, failedCriteriaNames);
  });
}

function getScorecardCriteriaForBuilder(templateId) {
  return runSafely(function () {
    return Tracker.getScorecardCriteriaForBuilder(templateId);
  });
}

function saveScorecardCriterion(payload) {
  return runSafely(function () {
    return Tracker.saveScorecardCriterion(payload);
  });
}

function updateScorecardCriterion(criteriaId, payload) {
  return runSafely(function () {
    return Tracker.updateScorecardCriterion(criteriaId, payload);
  });
}

function reorderScorecardCriteria(templateId, orderedCriteriaIds) {
  return runSafely(function () {
    return Tracker.reorderScorecardCriteria(templateId, orderedCriteriaIds);
  });
}

function duplicateScorecardTemplate(templateId) {
  return runSafely(function () {
    return Tracker.duplicateScorecardTemplate(templateId);
  });
}

function createNewTemplateVersion(templateId, activateAndDeactivatePrevious) {
  return runSafely(function () {
    return Tracker.createNewTemplateVersion(templateId, activateAndDeactivatePrevious);
  });
}

function searchAudits(filters) {
  return runSafely(function () {
    return Tracker.searchAudits(filters);
  });
}

function getSearchFilterOptions() {
  return runSafely(function () {
    return Tracker.getSearchFilterOptions();
  });
}

function generateReport(type, filters) {
  return runSafely(function () {
    return Tracker.generateReport(type, filters);
  });
}

function getKnowledgeBaseHomepage() {
  return runSafely(function () {
    return Tracker.getKnowledgeBaseHomepage();
  });
}

function getKnowledgeBaseArticles(filters) {
  return runSafely(function () {
    return Tracker.getKnowledgeBaseArticles(filters);
  });
}

function getArticleById(articleId) {
  return runSafely(function () {
    return Tracker.getArticleById(articleId);
  });
}

function getArticlesForCriterion(criterionName) {
  return runSafely(function () {
    return Tracker.getArticlesForCriterion(criterionName);
  });
}

function saveArticle(payload) {
  return runSafely(function () {
    return Tracker.saveArticle(payload);
  });
}

function updateArticle(articleId, payload) {
  return runSafely(function () {
    return Tracker.updateArticle(articleId, payload);
  });
}

function setArticleStatus(articleId, status) {
  return runSafely(function () {
    return Tracker.setArticleStatus(articleId, status);
  });
}

function getCoachingSessions(filters) {
  return runSafely(function () {
    return Tracker.getCoachingSessions(filters);
  });
}

function getCoachingSessionById(coachingId) {
  return runSafely(function () {
    return Tracker.getCoachingSessionById(coachingId);
  });
}

function getCoachingContextFromAudit(auditId) {
  return runSafely(function () {
    return Tracker.getCoachingContextFromAudit(auditId);
  });
}

function saveCoachingActionPlan(coachingId, actionItems) {
  return runSafely(function () {
    return Tracker.saveCoachingActionPlan(coachingId, actionItems);
  });
}

function updateCoaching(coachingId, payload) {
  return runSafely(function () {
    return Tracker.updateCoaching(coachingId, payload);
  });
}

function getCoachingDashboard() {
  return runSafely(function () {
    return Tracker.getCoachingDashboard();
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
