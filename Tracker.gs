var Tracker = (function () {
  var SHEETS = {
    departments: 'Departments',
    agents: 'Agents',
    coachingLog: 'Coaching Log',
    performanceLog: 'Performance Log',
    disputeLog: 'Dispute Log',
    scorecardCriteria: 'Scorecard Criteria',
    scorecardTemplates: 'Scorecard Templates',
    weeklyReviewDetail: 'Weekly Review Detail'
  };

  var FIELD_NAMES = {
    departmentId: 'Department ID',
    departmentName: 'Department Name',
    active: 'Active',
    agentId: 'Agent ID',
    name: 'Name',
    supervisor: 'Supervisor',
    startDate: 'Start Date',
    status: 'Status',
    coachingId: 'Coaching ID',
    disputeId: 'Dispute ID',
    performanceId: 'Performance ID',
    weekEnding: 'Week Ending',
    qaStream: 'QA Stream',
    averageScore: 'Average Score',
    numberOfAudits: 'Number of Audits',
    primaryRootCause: 'Primary Root Cause',
    qaSummary: 'QA Summary',
    date: 'Date',
    disputeStatus: 'Dispute Status',
    followUpDate: 'Follow-up Date',
    followUpCompleted: 'Follow-up Completed',
    secondaryRootCause: 'Secondary Root Cause',
    detailId: 'Detail ID',
    interactionId: 'Interaction ID',
    auditDate: 'Audit Date',
    score: 'Score',
    failedCriteria: 'Failed Criteria',
    comments: 'Comments',
    criterionName: 'Criterion Name',
    criterionWeight: 'Weight',
    coachingTip: 'Coaching Tip',
    employeeNumber: 'Employee Number',
    teamLeader: 'Team Leader',
    role: 'Role',
    email: 'Email',
    phone: 'Phone',
    location: 'Location',
    languages: 'Languages',
    skills: 'Skills',
    certifications: 'Certifications',
    templateId: 'Template ID',
    templateName: 'Template Name',
    version: 'Version',
    effectiveFrom: 'Effective From',
    effectiveTo: 'Effective To',
    templateStatus: 'Status',
    notes: 'Notes',
    // Shared header text, used on two different sheets for two different
    // purposes - always read from the correct sheet's rows, never mixed:
    //  - Scorecard Templates: overall calculation strategy, e.g.
    //    "Weighted Percentage" / "Critical Failure + Weighted Percentage"
    //  - Scorecard Criteria: per-criterion classification, "Weighted" or
    //    "Fatal" (Fatal = critical/zero-tolerance criterion)
    scoringType: 'Scoring Type',
    criteriaId: 'Criteria ID',
    displayOrder: 'Display Order',
    parameter: 'Parameter',
    attribute: 'Attribute',
    explanation: 'Explanation'
  };

  // Normalized (lowercase, alnum-only) Scoring Type values.
  var CRITERION_SCORING_TYPE_FATAL = 'fatal';
  var TEMPLATE_SCORING_TYPE_WEIGHTED = 'weightedpercentage';
  var TEMPLATE_SCORING_TYPE_CRITICAL = 'criticalfailureweightedpercentage';

  var MIN_AUDITS_FOR_STRENGTH = 3;
  var TIMELINE_LIMITS = { weekly: 26, monthly: 12, quarterly: 8, yearly: 5 };

  var MIN_REQUIRED_AUDITS = 3;
  var MAX_AUDITS = 5;

  var QA_STREAM_OPTIONS = ['Customer Voice', 'Customer Text', 'Clerk Support', 'D2C'];

  var RESOLVED_DISPUTE_STATUSES = ['resolved', 'closed', 'completed'];

  var TOP_LIST_SIZE = 3;

  // Auto-generated ID columns, keyed by sheet.
  var ID_GENERATION_CONFIG = {};
  ID_GENERATION_CONFIG[SHEETS.coachingLog] = {
    header: FIELD_NAMES.coachingId,
    prefix: 'COA-',
    padLength: 6
  };
  ID_GENERATION_CONFIG[SHEETS.disputeLog] = {
    header: FIELD_NAMES.disputeId,
    prefix: 'DIS-',
    padLength: 6
  };
  ID_GENERATION_CONFIG[SHEETS.performanceLog] = {
    header: FIELD_NAMES.performanceId,
    prefix: 'PERF-',
    padLength: 6
  };
  ID_GENERATION_CONFIG[SHEETS.weeklyReviewDetail] = {
    header: FIELD_NAMES.detailId,
    prefix: 'WRD-',
    padLength: 6
  };
  ID_GENERATION_CONFIG[SHEETS.scorecardTemplates] = {
    header: FIELD_NAMES.templateId,
    prefix: 'TPL-',
    padLength: 4
  };
  ID_GENERATION_CONFIG[SHEETS.scorecardCriteria] = {
    header: FIELD_NAMES.criteriaId,
    prefix: 'CRIT-',
    padLength: 4
  };

  // Weekly Review Detail header names have drifted from FIELD_NAMES in the
  // live sheet (e.g. "Weekly Review ID" instead of "Performance ID"). Rather
  // than requiring a sheet rename, each logical field accepts multiple known
  // header spellings here - the same candidate-list pattern getFieldValue()
  // already uses for reads, extended to the write path in saveWeeklyReview().
  var WEEKLY_REVIEW_DETAIL_HEADER_ALIASES = {
    detailId: [FIELD_NAMES.detailId, 'Review Detail ID'],
    performanceId: [FIELD_NAMES.performanceId, 'Weekly Review ID'],
    agentId: [FIELD_NAMES.agentId],
    auditNumber: ['Audit Number', 'Audit #'],
    interactionId: [FIELD_NAMES.interactionId],
    auditDate: [FIELD_NAMES.auditDate],
    score: [FIELD_NAMES.score],
    failedCriteria: [FIELD_NAMES.failedCriteria, 'Failed Criteria ID'],
    comments: [FIELD_NAMES.comments, 'Notes']
  };

  // ---------------------------------------------------------------------
  // Existing entry points (unchanged behavior)
  // ---------------------------------------------------------------------

  function getInitialData() {
    var departmentData = readSheet(SHEETS.departments);
    var coachingData = readSheet(SHEETS.coachingLog);
    var performanceData = readSheet(SHEETS.performanceLog);
    var disputeData = readSheet(SHEETS.disputeLog);
    var activeHeader = findHeader(departmentData.headers, [FIELD_NAMES.active]);

    var departments = departmentData.rows
      .filter(function (row) {
        return !activeHeader || isTruthyValue(getFieldValue(row, [FIELD_NAMES.active]));
      })
      .map(function (row) {
        return {
          departmentId: toSafeString(getFieldValue(row, [FIELD_NAMES.departmentId])),
          departmentName: toSafeString(getFieldValue(row, [FIELD_NAMES.departmentName])),
          active: isTruthyValue(getFieldValue(row, [FIELD_NAMES.active]))
        };
      })
      .filter(function (department) {
        return department.departmentId;
      })
      .sort(function (a, b) {
        return a.departmentName.localeCompare(b.departmentName);
      });

    return {
      success: true,
      departments: departments,
      forms: {
        coaching: buildFormDefinition(coachingData.headers, [FIELD_NAMES.coachingId]),
        performance: buildFormDefinition(performanceData.headers, [FIELD_NAMES.performanceId]),
        dispute: buildFormDefinition(disputeData.headers, [FIELD_NAMES.disputeId])
      }
    };
  }

  function getAgentsByDepartment(departmentId) {
    var requestedDepartmentId = toSafeString(departmentId);
    if (!requestedDepartmentId) {
      return {
        success: false,
        message: 'A department must be selected before loading agents.',
        agents: []
      };
    }

    var agentData = readSheet(SHEETS.agents);
    var agents = agentData.rows
      .filter(function (row) {
        return toSafeString(getFieldValue(row, [FIELD_NAMES.departmentId])) === requestedDepartmentId;
      })
      .map(function (row) {
        return mapAgentRow(row);
      })
      .filter(function (agent) {
        return agent.agentId;
      })
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });

    return {
      success: true,
      agents: agents
    };
  }

  function getAgentDashboard(agentId) {
    var requestedAgentId = toSafeString(agentId);
    if (!requestedAgentId) {
      return {
        success: false,
        message: 'An agent must be selected before loading the dashboard.'
      };
    }

    var departmentData = readSheet(SHEETS.departments);
    var agentData = readSheet(SHEETS.agents);
    var coachingData = readSheet(SHEETS.coachingLog);
    var performanceData = readSheet(SHEETS.performanceLog);
    var disputeData = readSheet(SHEETS.disputeLog);
    var detailData = readSheet(SHEETS.weeklyReviewDetail);

    var agentRow = findRowByField(agentData.rows, FIELD_NAMES.agentId, requestedAgentId);
    if (!agentRow) {
      return {
        success: false,
        message: 'The selected agent could not be found in the Agents sheet.'
      };
    }

    var departmentId = toSafeString(getFieldValue(agentRow, [FIELD_NAMES.departmentId]));
    var departmentRow = findRowByField(departmentData.rows, FIELD_NAMES.departmentId, departmentId);

    var coachingRows = filterRowsByAgentId(coachingData.rows, requestedAgentId);
    var performanceRows = filterRowsByAgentId(performanceData.rows, requestedAgentId);
    var disputeRows = filterRowsByAgentId(disputeData.rows, requestedAgentId);

    // Scope Weekly Review Detail to this agent via the Performance ID FK
    // (not a direct Agent ID column on Weekly Review Detail, which isn't
    // guaranteed to exist) so per-stream failed criteria can be derived
    // straight from Weekly Review Detail.
    var agentPerformanceIds = buildPerformanceIdSet(performanceRows);
    var agentDetailRows = filterDetailRowsByPerformanceIds(detailData.rows, agentPerformanceIds);

    var performanceByStream = computePerformanceByStream(performanceRows, agentDetailRows);
    var overallAveragePerformance = computeOverallAverage(performanceByStream);
    var openDisputeCount = countOpenDisputes(disputeRows);
    var openActionCount = countOpenActions(coachingRows);

    var scorecardCriteria = getAllActiveCriteriaAcrossTemplates().criteria;
    var performanceTimeline = buildPerformanceTimeline(performanceRows);
    var criteriaAnalysis = computeAgentCriteriaAnalysis(agentDetailRows, scorecardCriteria);

    return {
      success: true,
      agent: {
        agentId: toSafeString(getFieldValue(agentRow, [FIELD_NAMES.agentId])),
        name: toSafeString(getFieldValue(agentRow, [FIELD_NAMES.name])),
        departmentId: departmentId,
        departmentName: departmentRow ? toSafeString(getFieldValue(departmentRow, [FIELD_NAMES.departmentName])) : '',
        supervisor: toSafeString(getFieldValue(agentRow, [FIELD_NAMES.supervisor])),
        startDate: serializeValue(getFieldValue(agentRow, [FIELD_NAMES.startDate])),
        status: toSafeString(getFieldValue(agentRow, [FIELD_NAMES.status])),
        profile: buildAgentProfileFields(agentRow),
        details: serializeRecord(agentData.headers, agentRow)
      },
      summary: {
        coachingCount: coachingRows.length,
        overallAveragePerformance: overallAveragePerformance,
        performanceByStream: performanceByStream,
        performanceTimeline: performanceTimeline,
        criteriaAnalysis: criteriaAnalysis,
        mostRecentCoaching: getMostRecentDateLabel(coachingRows),
        mostRecentPerformance: getMostRecentDateLabel(performanceRows),
        mostRecentDispute: getMostRecentDateLabel(disputeRows),
        openDisputeCount: openDisputeCount,
        openActionCount: openActionCount
      },
      histories: {
        coaching: {
          headers: coachingData.headers,
          records: serializeRecords(coachingData.headers, coachingRows)
        },
        performance: {
          headers: performanceData.headers,
          records: serializeRecords(performanceData.headers, performanceRows)
        },
        dispute: {
          headers: disputeData.headers,
          records: serializeRecords(disputeData.headers, disputeRows)
        }
      }
    };
  }

  function saveCoaching(payload) {
    return saveLogEntry(SHEETS.coachingLog, 'Coaching', payload, ID_GENERATION_CONFIG[SHEETS.coachingLog]);
  }

  function savePerformance(payload) {
    return saveLogEntry(SHEETS.performanceLog, 'Performance', payload, ID_GENERATION_CONFIG[SHEETS.performanceLog]);
  }

  function saveDispute(payload) {
    return saveLogEntry(SHEETS.disputeLog, 'Dispute', payload, ID_GENERATION_CONFIG[SHEETS.disputeLog]);
  }

  // ---------------------------------------------------------------------
  // New read-only entry points for the QA Command Centre UI
  // (additive only — nothing above this line changes behavior)
  // ---------------------------------------------------------------------

  function getDashboardOverview() {
    var departmentData = readSheet(SHEETS.departments);
    var agentData = readSheet(SHEETS.agents);
    var performanceData = readSheet(SHEETS.performanceLog);
    var coachingData = readSheet(SHEETS.coachingLog);
    var disputeData = readSheet(SHEETS.disputeLog);
    var activeHeader = findHeader(departmentData.headers, [FIELD_NAMES.active]);

    var departmentRows = departmentData.rows.filter(function (row) {
      return !activeHeader || isTruthyValue(getFieldValue(row, [FIELD_NAMES.active]));
    });

    var departmentCards = departmentRows
      .map(function (departmentRow) {
        var departmentId = toSafeString(getFieldValue(departmentRow, [FIELD_NAMES.departmentId]));
        if (!departmentId) {
          return null;
        }
        var scoped = buildDepartmentScope(departmentId, agentData, performanceData, coachingData, disputeData);
        return {
          departmentId: departmentId,
          departmentName: toSafeString(getFieldValue(departmentRow, [FIELD_NAMES.departmentName])),
          averageScore: scoped.aggregate.averageScore,
          totalAgents: scoped.aggregate.totalAgents,
          totalAudits: scoped.aggregate.totalAudits,
          totalCoachings: scoped.aggregate.totalCoachings,
          openDisputes: scoped.aggregate.openDisputes
        };
      })
      .filter(function (card) {
        return card !== null;
      })
      .sort(function (a, b) {
        return a.departmentName.localeCompare(b.departmentName);
      });

    var overallAggregate = combineAggregates(departmentCards.map(function (card) {
      return {
        averageScore: card.averageScore,
        totalAgents: card.totalAgents,
        totalAudits: card.totalAudits,
        totalCoachings: card.totalCoachings,
        openDisputes: card.openDisputes
      };
    }));

    return {
      success: true,
      kpis: overallAggregate,
      departments: departmentCards
    };
  }

  function getDepartmentDashboard(departmentId) {
    var requestedDepartmentId = toSafeString(departmentId);
    if (!requestedDepartmentId) {
      return {
        success: false,
        message: 'A department must be selected before loading its dashboard.'
      };
    }

    var departmentData = readSheet(SHEETS.departments);
    var departmentRow = findRowByField(departmentData.rows, FIELD_NAMES.departmentId, requestedDepartmentId);
    if (!departmentRow) {
      return {
        success: false,
        message: 'The selected department could not be found.'
      };
    }

    var agentData = readSheet(SHEETS.agents);
    var performanceData = readSheet(SHEETS.performanceLog);
    var coachingData = readSheet(SHEETS.coachingLog);
    var disputeData = readSheet(SHEETS.disputeLog);
    var detailData = readSheet(SHEETS.weeklyReviewDetail);

    var scoped = buildDepartmentScope(requestedDepartmentId, agentData, performanceData, coachingData, disputeData);

    var agentsWithData = scoped.agentSummaries.filter(function (agentSummary) {
      return typeof agentSummary.overallAverage === 'number';
    });

    var topPerformers = agentsWithData
      .slice()
      .sort(function (a, b) {
        return b.overallAverage - a.overallAverage;
      })
      .slice(0, TOP_LIST_SIZE);

    var needsCoaching = agentsWithData
      .slice()
      .sort(function (a, b) {
        return a.overallAverage - b.overallAverage;
      })
      .slice(0, TOP_LIST_SIZE);

    // Root cause analytics: Department -> Agents -> Performance IDs (via
    // Performance Log, used ONLY as an identity/linking index here, never
    // for its Primary/Secondary Root Cause columns) -> Weekly Review Detail
    // rows -> Failed Criteria aggregation. This is the single aggregation
    // path for root cause reporting; see computeFailedCriteriaAggregate().
    var departmentPerformanceIds = buildPerformanceIdSet(scoped.performanceRows);
    var departmentDetailRows = filterDetailRowsByPerformanceIds(detailData.rows, departmentPerformanceIds);
    var topRootCauses = computeFailedCriteriaAggregate(departmentDetailRows);

    return {
      success: true,
      department: {
        departmentId: requestedDepartmentId,
        departmentName: toSafeString(getFieldValue(departmentRow, [FIELD_NAMES.departmentName]))
      },
      kpis: scoped.aggregate,
      topRootCauses: topRootCauses,
      topPerformers: topPerformers,
      needsCoaching: needsCoaching
    };
  }

  // Drill-down: Department -> Performance Log (matching Primary/Secondary
  // Root Cause) -> Performance ID -> Weekly Review Detail (matching Failed
  // Criteria) -> individual interaction. This is a read-time join only -
  // nothing is duplicated or stored separately from Performance Log /
  // Weekly Review Detail.
  function getRootCauseDrilldown(departmentId, rootCause) {
    var requestedDepartmentId = toSafeString(departmentId);
    var requestedRootCause = toSafeString(rootCause);

    if (!requestedDepartmentId || !requestedRootCause) {
      return {
        success: false,
        message: 'A department and root cause are required.'
      };
    }

    var agentData = readSheet(SHEETS.agents);
    var performanceData = readSheet(SHEETS.performanceLog);
    var detailData = readSheet(SHEETS.weeklyReviewDetail);

    var agentNameById = {};
    var departmentAgentIds = {};
    agentData.rows.forEach(function (agentRow) {
      var agentId = toSafeString(getFieldValue(agentRow, [FIELD_NAMES.agentId]));
      agentNameById[agentId] = toSafeString(getFieldValue(agentRow, [FIELD_NAMES.name]));
      if (toSafeString(getFieldValue(agentRow, [FIELD_NAMES.departmentId])) === requestedDepartmentId) {
        departmentAgentIds[agentId] = true;
      }
    });

    // Step 1: Department -> Agents -> every Performance Log row for those
    // agents. Performance Log is used ONLY as a Performance ID -> Agent ID /
    // Week Ending index here - its Primary/Secondary Root Cause columns are
    // never read or compared against. No pre-filtering by root cause
    // happens at this step.
    var performanceById = {};
    performanceData.rows.forEach(function (row) {
      var agentId = toSafeString(getFieldValue(row, [FIELD_NAMES.agentId]));
      if (!departmentAgentIds[agentId]) {
        return;
      }

      var performanceId = toSafeString(getFieldValue(row, [FIELD_NAMES.performanceId]));
      if (performanceId) {
        performanceById[performanceId] = row;
      }
    });

    // Step 2: Performance ID -> Weekly Review Detail rows (the FK link) ->
    // keep only rows whose Failed Criteria actually cites the requested
    // root cause. This is the ONLY place root cause matching happens.
    var records = [];
    detailData.rows.forEach(function (detailRow) {
      var linkedPerformanceId = toSafeString(getFieldValue(detailRow, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.performanceId));
      var parentRow = performanceById[linkedPerformanceId];
      if (!parentRow) {
        return;
      }

      var failedCriteriaList = parseFailedCriteria(getFieldValue(detailRow, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.failedCriteria));

      var citesThisRootCause = failedCriteriaList.some(function (criterionName) {
        return rootCauseMatches(criterionName, requestedRootCause);
      });
      if (!citesThisRootCause) {
        return;
      }

      var agentId = toSafeString(getFieldValue(parentRow, [FIELD_NAMES.agentId]));

      records.push({
        performanceId: linkedPerformanceId,
        agentId: agentId,
        agentName: agentNameById[agentId] || agentId,
        weekEnding: serializeValue(getFieldValue(parentRow, [FIELD_NAMES.weekEnding])),
        interactionId: toSafeString(getFieldValue(detailRow, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.interactionId)),
        auditDate: serializeValue(getFieldValue(detailRow, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.auditDate)),
        score: toNumber(getFieldValue(detailRow, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.score)),
        comments: toSafeString(getFieldValue(detailRow, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.comments)),
        failedCriteria: failedCriteriaList
      });
    });

    records.sort(function (a, b) {
      return (b.auditDate || '').localeCompare(a.auditDate || '');
    });

    return {
      success: true,
      rootCause: requestedRootCause,
      departmentId: requestedDepartmentId,
      records: records
    };
  }

  // Case/whitespace-insensitive equality used to match a Failed Criteria
  // entry against a requested root cause name. This is the only place
  // "does this value represent that root cause" is decided.
  function rootCauseMatches(valueA, valueB) {
    return normalizeHeader(valueA) === normalizeHeader(valueB) && normalizeHeader(valueA) !== '';
  }

  // Splits a Weekly Review Detail "Failed Criteria" cell into a clean list:
  // comma-separated, trimmed, blanks dropped. This is the single parsing
  // path every root-cause function uses to read that column.
  function parseFailedCriteria(rawValue) {
    return toSafeString(rawValue)
      .split(',')
      .map(function (value) { return value.trim(); })
      .filter(function (value) { return value; });
  }

  // Broad, non-template-scoped view of every active criterion across every
  // template. Used only where a specific audit's template can't be reliably
  // determined after the fact (Weekly Review Detail doesn't store Template
  // ID, per the "no schema changes" constraint): the legacy Primary/
  // Secondary Root Cause tie-break weight lookup, and the Agent Profile
  // Strengths analysis. New Weekly Reviews should use getScorecardCriteria
  // (templateId) instead, which is template-scoped and authoritative.
  function getAllActiveCriteriaAcrossTemplates() {
    var criteriaData = readSheet(SHEETS.scorecardCriteria);
    var seen = {};
    var criteria = criteriaData.rows
      .filter(function (row) {
        var activeHeader = findHeader(criteriaData.headers, [FIELD_NAMES.active]);
        return !activeHeader || isTruthyValue(getFieldValue(row, [FIELD_NAMES.active]));
      })
      .map(function (row) {
        return {
          name: toSafeString(getFieldValue(row, [FIELD_NAMES.criterionName])),
          weight: toNumber(getFieldValue(row, [FIELD_NAMES.criterionWeight])) || 0,
          coachingTip: toSafeString(getFieldValue(row, [FIELD_NAMES.coachingTip]))
        };
      })
      .filter(function (criterion) {
        if (!criterion.name) { return false; }
        var key = normalizeHeader(criterion.name);
        if (seen[key]) { return false; }
        seen[key] = true;
        return true;
      })
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });

    return {
      success: true,
      criteria: criteria
    };
  }

  // Template-scoped criteria list: the authoritative source for the Weekly
  // Review workflow and the scoring engine. Filters by Template ID and
  // Active, sorted by Display Order. Each criterion includes its own
  // Scoring Type ("Weighted"/"Fatal") so the scoring engine can partition
  // critical vs. general criteria without any naming-convention guessing.
  function getScorecardCriteria(templateId) {
    var requestedTemplateId = toSafeString(templateId);
    if (!requestedTemplateId) {
      return {
        success: false,
        message: 'A Scorecard Template ID is required to load its criteria.',
        criteria: []
      };
    }

    var criteriaData = readSheet(SHEETS.scorecardCriteria);
    var activeHeader = findHeader(criteriaData.headers, [FIELD_NAMES.active]);

    var criteria = criteriaData.rows
      .filter(function (row) {
        return toSafeString(getFieldValue(row, [FIELD_NAMES.templateId])) === requestedTemplateId;
      })
      .filter(function (row) {
        return !activeHeader || isTruthyValue(getFieldValue(row, [FIELD_NAMES.active]));
      })
      .map(function (row) {
        var criterionScoringType = toSafeString(getFieldValue(row, [FIELD_NAMES.scoringType]));
        return {
          criteriaId: toSafeString(getFieldValue(row, [FIELD_NAMES.criteriaId])),
          name: toSafeString(getFieldValue(row, [FIELD_NAMES.criterionName])),
          weight: toNumber(getFieldValue(row, [FIELD_NAMES.criterionWeight])) || 0,
          parameter: toSafeString(getFieldValue(row, [FIELD_NAMES.parameter])),
          attribute: toSafeString(getFieldValue(row, [FIELD_NAMES.attribute])),
          explanation: toSafeString(getFieldValue(row, [FIELD_NAMES.explanation])),
          coachingTip: toSafeString(getFieldValue(row, [FIELD_NAMES.coachingTip])),
          scoringType: criterionScoringType,
          isCritical: normalizeHeader(criterionScoringType) === CRITERION_SCORING_TYPE_FATAL,
          displayOrder: toNumber(getFieldValue(row, [FIELD_NAMES.displayOrder]))
        };
      })
      .filter(function (criterion) {
        return criterion.name;
      })
      .sort(function (a, b) {
        var orderA = typeof a.displayOrder === 'number' ? a.displayOrder : Number.MAX_SAFE_INTEGER;
        var orderB = typeof b.displayOrder === 'number' ? b.displayOrder : Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) { return orderA - orderB; }
        return a.name.localeCompare(b.name);
      });

    return {
      success: true,
      templateId: requestedTemplateId,
      criteria: criteria
    };
  }

  // Active templates for a Department, sorted most-recent-version-first.
  // "Active" here means Status normalizes to a truthy/active-like value AND
  // today falls within [Effective From, Effective To] when either bound is
  // set (an unset bound is treated as unbounded on that side).
  function getScorecardTemplatesForDepartment(departmentId) {
    var requestedDepartmentId = toSafeString(departmentId);
    if (!requestedDepartmentId) {
      return { success: false, message: 'A department is required.', templates: [] };
    }

    var templateData = readSheet(SHEETS.scorecardTemplates);
    var today = new Date();

    var templates = templateData.rows
      .filter(function (row) {
        return toSafeString(getFieldValue(row, [FIELD_NAMES.departmentId])) === requestedDepartmentId;
      })
      .filter(function (row) {
        return isTemplateCurrentlyActive(row, today);
      })
      .map(mapScorecardTemplateRow)
      .sort(function (a, b) {
        return (toNumber(b.version) || 0) - (toNumber(a.version) || 0);
      });

    return { success: true, templates: templates };
  }

  // Every template regardless of status/date, for the Settings admin table.
  function getAllScorecardTemplates() {
    var departmentData = readSheet(SHEETS.departments);
    var departmentNameById = {};
    departmentData.rows.forEach(function (row) {
      departmentNameById[toSafeString(getFieldValue(row, [FIELD_NAMES.departmentId]))] =
        toSafeString(getFieldValue(row, [FIELD_NAMES.departmentName]));
    });

    var templateData = readSheet(SHEETS.scorecardTemplates);
    var criteriaData = readSheet(SHEETS.scorecardCriteria);

    var criteriaCountByTemplateId = {};
    criteriaData.rows.forEach(function (row) {
      if (!isTruthyValue(getFieldValue(row, [FIELD_NAMES.active]))) { return; }
      var templateId = toSafeString(getFieldValue(row, [FIELD_NAMES.templateId]));
      criteriaCountByTemplateId[templateId] = (criteriaCountByTemplateId[templateId] || 0) + 1;
    });

    var templates = templateData.rows
      .map(function (row) {
        var mapped = mapScorecardTemplateRow(row);
        mapped.departmentName = departmentNameById[mapped.departmentId] || mapped.departmentId;
        mapped.criteriaCount = criteriaCountByTemplateId[mapped.templateId] || 0;
        return mapped;
      })
      .sort(function (a, b) {
        if (a.departmentName !== b.departmentName) { return a.departmentName.localeCompare(b.departmentName); }
        return (toNumber(b.version) || 0) - (toNumber(a.version) || 0);
      });

    // Version history is a display-only heuristic: templates are considered
    // the same lineage when their Template Name and Department ID match
    // (normalized). There is no stored parent/lineage relationship - if two
    // unrelated templates happen to share a name in the same department,
    // they'll appear grouped here. This is clearly a heuristic, not a
    // guarantee, since no new lineage-tracking column was added.
    var lineageGroups = {};
    templates.forEach(function (template) {
      var lineageKey = normalizeHeader(template.templateName) + '::' + normalizeHeader(template.departmentId);
      if (!lineageGroups[lineageKey]) { lineageGroups[lineageKey] = []; }
      lineageGroups[lineageKey].push(template);
    });

    templates.forEach(function (template) {
      var lineageKey = normalizeHeader(template.templateName) + '::' + normalizeHeader(template.departmentId);
      template.versionHistory = lineageGroups[lineageKey]
        .map(function (t) { return { templateId: t.templateId, version: t.version, status: t.status }; })
        .sort(function (a, b) { return (toNumber(b.version) || 0) - (toNumber(a.version) || 0); });
    });

    return { success: true, templates: templates };
  }

  function mapScorecardTemplateRow(row) {
    return {
      templateId: toSafeString(getFieldValue(row, [FIELD_NAMES.templateId])),
      templateName: toSafeString(getFieldValue(row, [FIELD_NAMES.templateName])),
      departmentId: toSafeString(getFieldValue(row, [FIELD_NAMES.departmentId])),
      version: toSafeString(getFieldValue(row, [FIELD_NAMES.version])),
      effectiveFrom: serializeValue(getFieldValue(row, [FIELD_NAMES.effectiveFrom])),
      effectiveTo: serializeValue(getFieldValue(row, [FIELD_NAMES.effectiveTo])),
      status: toSafeString(getFieldValue(row, [FIELD_NAMES.templateStatus])),
      notes: toSafeString(getFieldValue(row, [FIELD_NAMES.notes])),
      scoringType: toSafeString(getFieldValue(row, [FIELD_NAMES.scoringType]))
    };
  }

  function isTemplateCurrentlyActive(row, today) {
    var status = toSafeString(getFieldValue(row, [FIELD_NAMES.templateStatus])).toLowerCase();
    if (status && status !== 'active') {
      return false;
    }

    var effectiveFrom = parseDate(getFieldValue(row, [FIELD_NAMES.effectiveFrom]));
    var effectiveTo = parseDate(getFieldValue(row, [FIELD_NAMES.effectiveTo]));

    if (effectiveFrom && today.getTime() < effectiveFrom.getTime()) {
      return false;
    }
    if (effectiveTo && today.getTime() > effectiveTo.getTime()) {
      return false;
    }
    return true;
  }

  // Creates a new Scorecard Template. Header-driven, like every other save
  // function - Template ID is auto-generated, every other provided value is
  // matched to the sheet's actual header text so column order/wording never
  // has to be hardcoded.
  function saveScorecardTemplate(payload) {
    var templateData = readSheet(SHEETS.scorecardTemplates);
    var values = (payload && payload.values) || {};

    if (!templateData.headers.length) {
      throw new Error(SHEETS.scorecardTemplates + ' must contain a header row before data can be saved.');
    }

    var templateId = generateNextSequentialId(templateData.rows, [FIELD_NAMES.templateId], 'TPL-', 4);

    var row = templateData.headers.map(function (header) {
      if (normalizeHeader(header) === normalizeHeader(FIELD_NAMES.templateId)) {
        return templateId;
      }
      return coerceValueForSheet(header, getPayloadValue(values, header));
    });

    templateData.sheet.appendRow(row);

    return {
      success: true,
      message: 'Scorecard template saved successfully (' + templateId + ').',
      templateId: templateId
    };
  }

  // Updates an existing Scorecard Template in place (used for editing and
  // for activate/deactivate). Only columns present in the payload's values
  // are touched; Template ID itself is never overwritten.
  function updateScorecardTemplate(templateId, payload) {
    var requestedTemplateId = toSafeString(templateId);
    if (!requestedTemplateId) {
      throw new Error('A Template ID is required to update a scorecard template.');
    }

    updateRowById(SHEETS.scorecardTemplates, FIELD_NAMES.templateId, requestedTemplateId, (payload && payload.values) || {});

    return {
      success: true,
      message: 'Scorecard template ' + requestedTemplateId + ' updated successfully.'
    };
  }

  // Generic "find a row by its ID column and overwrite it in place" used by
  // every admin edit function (templates, criteria, and any future entity).
  // Only headers present in `values` (by exact or normalized-header match)
  // are changed; everything else keeps its existing cell value. The ID
  // column itself is always preserved as idValue, never overwritten.
  function updateRowById(sheetName, idHeader, idValue, values) {
    var data = readSheet(sheetName);

    var rowIndex = -1;
    var existingRow = null;
    for (var i = 0; i < data.rows.length; i += 1) {
      if (toSafeString(getFieldValue(data.rows[i], [idHeader])) === idValue) {
        rowIndex = data.rows[i]._rowNumber;
        existingRow = data.rows[i];
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error('Record ' + idValue + ' could not be found in ' + sheetName + '.');
    }

    var updatedRow = data.headers.map(function (header) {
      if (normalizeHeader(header) === normalizeHeader(idHeader)) {
        return idValue;
      }
      var hasValue = Object.prototype.hasOwnProperty.call(values, header) ||
        Object.keys(values).some(function (key) { return normalizeHeader(key) === normalizeHeader(header); });
      if (hasValue) {
        return coerceValueForSheet(header, getPayloadValue(values, header));
      }
      return serializeValue(getFieldValue(existingRow, [header]));
    });

    data.sheet.getRange(rowIndex, 1, 1, data.headers.length).setValues([updatedRow]);
    return { rowNumber: rowIndex, headers: data.headers };
  }

  // ---------------------------------------------------------------------
  // Scorecard Builder: full CRUD + reordering for Scorecard Criteria,
  // replacing direct sheet editing. All writes are header-driven and
  // scoped to a Template ID, matching the rest of the app's conventions.
  // ---------------------------------------------------------------------

  // Every criterion for a template (active AND inactive), for the admin
  // Scorecard Builder - unlike getScorecardCriteria(), which only returns
  // Active criteria for actual audit-taking.
  function getScorecardCriteriaForBuilder(templateId) {
    var requestedTemplateId = toSafeString(templateId);
    if (!requestedTemplateId) {
      return { success: false, message: 'A Template ID is required.', criteria: [] };
    }

    var criteriaData = readSheet(SHEETS.scorecardCriteria);
    var criteria = criteriaData.rows
      .filter(function (row) {
        return toSafeString(getFieldValue(row, [FIELD_NAMES.templateId])) === requestedTemplateId;
      })
      .map(function (row) {
        return {
          criteriaId: toSafeString(getFieldValue(row, [FIELD_NAMES.criteriaId])),
          templateId: requestedTemplateId,
          displayOrder: toNumber(getFieldValue(row, [FIELD_NAMES.displayOrder])),
          parameter: toSafeString(getFieldValue(row, [FIELD_NAMES.parameter])),
          attribute: toSafeString(getFieldValue(row, [FIELD_NAMES.attribute])),
          name: toSafeString(getFieldValue(row, [FIELD_NAMES.criterionName])),
          explanation: toSafeString(getFieldValue(row, [FIELD_NAMES.explanation])),
          weight: toNumber(getFieldValue(row, [FIELD_NAMES.criterionWeight])) || 0,
          scoringType: toSafeString(getFieldValue(row, [FIELD_NAMES.scoringType])),
          active: isTruthyValue(getFieldValue(row, [FIELD_NAMES.active]))
        };
      })
      .sort(function (a, b) {
        var orderA = typeof a.displayOrder === 'number' ? a.displayOrder : Number.MAX_SAFE_INTEGER;
        var orderB = typeof b.displayOrder === 'number' ? b.displayOrder : Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });

    return { success: true, templateId: requestedTemplateId, criteria: criteria };
  }

  // Creates a new criterion under a template. Display Order defaults to
  // "last" within that template if not supplied. Active defaults to true.
  function saveScorecardCriterion(payload) {
    var templateId = toSafeString(payload && payload.templateId);
    if (!templateId) {
      throw new Error('A Template ID is required to add a criterion.');
    }

    var criteriaData = readSheet(SHEETS.scorecardCriteria);
    var values = (payload && payload.values) || {};

    if (!criteriaData.headers.length) {
      throw new Error(SHEETS.scorecardCriteria + ' must contain a header row before data can be saved.');
    }

    var criteriaId = generateNextSequentialId(criteriaData.rows, [FIELD_NAMES.criteriaId], 'CRIT-', 4);

    var existingForTemplate = criteriaData.rows.filter(function (row) {
      return toSafeString(getFieldValue(row, [FIELD_NAMES.templateId])) === templateId;
    });
    var maxDisplayOrder = existingForTemplate.reduce(function (max, row) {
      var order = toNumber(getFieldValue(row, [FIELD_NAMES.displayOrder])) || 0;
      return Math.max(max, order);
    }, 0);

    var providedDisplayOrder = getPayloadValue(values, FIELD_NAMES.displayOrder);
    var displayOrder = isEmptyValue(providedDisplayOrder) ? (maxDisplayOrder + 1) : toNumber(providedDisplayOrder);

    var row = criteriaData.headers.map(function (header) {
      var normalized = normalizeHeader(header);
      if (normalized === normalizeHeader(FIELD_NAMES.criteriaId)) { return criteriaId; }
      if (normalized === normalizeHeader(FIELD_NAMES.templateId)) { return templateId; }
      if (normalized === normalizeHeader(FIELD_NAMES.displayOrder)) { return displayOrder; }
      if (normalized === normalizeHeader(FIELD_NAMES.active) && isEmptyValue(getPayloadValue(values, header))) { return true; }
      return coerceValueForSheet(header, getPayloadValue(values, header));
    });

    criteriaData.sheet.appendRow(row);

    return {
      success: true,
      message: 'Criterion saved successfully (' + criteriaId + ').',
      criteriaId: criteriaId
    };
  }

  // Edits a criterion in place (including toggling Active - "deletion" in
  // the UI is really this, per the audit-protection requirement: historical
  // audits already reference criteria by name/text in Weekly Review Detail,
  // never by Criteria ID, so deactivating never breaks a historical record).
  function updateScorecardCriterion(criteriaId, payload) {
    var requestedCriteriaId = toSafeString(criteriaId);
    if (!requestedCriteriaId) {
      throw new Error('A Criteria ID is required to update a criterion.');
    }

    updateRowById(SHEETS.scorecardCriteria, FIELD_NAMES.criteriaId, requestedCriteriaId, (payload && payload.values) || {});

    return {
      success: true,
      message: 'Criterion ' + requestedCriteriaId + ' updated successfully.'
    };
  }

  // Bulk-applies a new Display Order to every criterion in orderedCriteriaIds
  // (1-based, matching array position) for drag-and-drop reordering. Only
  // rows whose Criteria ID appears in the array and whose Template ID
  // matches are touched.
  function reorderScorecardCriteria(templateId, orderedCriteriaIds) {
    var requestedTemplateId = toSafeString(templateId);
    var idList = Array.isArray(orderedCriteriaIds) ? orderedCriteriaIds : [];
    if (!requestedTemplateId || !idList.length) {
      return { success: false, message: 'A Template ID and an ordered list of Criteria IDs are required.' };
    }

    var criteriaData = readSheet(SHEETS.scorecardCriteria);
    var displayOrderHeader = findHeader(criteriaData.headers, [FIELD_NAMES.displayOrder]);
    if (!displayOrderHeader) {
      throw new Error(SHEETS.scorecardCriteria + ' must have a Display Order column to support reordering.');
    }
    var displayOrderColumnIndex = criteriaData.headers.indexOf(displayOrderHeader) + 1;

    idList.forEach(function (id, index) {
      var normalizedId = toSafeString(id);
      var matchingRow = criteriaData.rows.find(function (row) {
        return toSafeString(getFieldValue(row, [FIELD_NAMES.criteriaId])) === normalizedId &&
          toSafeString(getFieldValue(row, [FIELD_NAMES.templateId])) === requestedTemplateId;
      });
      if (matchingRow) {
        criteriaData.sheet.getRange(matchingRow._rowNumber, displayOrderColumnIndex).setValue(index + 1);
      }
    });

    return { success: true, message: 'Criteria order updated.' };
  }

  // ---------------------------------------------------------------------
  // Template duplication & versioning
  // ---------------------------------------------------------------------

  // Shared clone routine: copies a template row (with overrides) to a new
  // Template ID, then copies every ACTIVE criterion under it to new
  // Criteria ID rows linked to the new template. Used by both "Duplicate"
  // (independent clone) and "Create New Version" (same lineage).
  function cloneTemplateWithCriteria(sourceTemplateId, overrideValues) {
    var templateData = readSheet(SHEETS.scorecardTemplates);
    var sourceRow = findRowByField(templateData.rows, FIELD_NAMES.templateId, sourceTemplateId);
    if (!sourceRow) {
      throw new Error('Scorecard template ' + sourceTemplateId + ' could not be found.');
    }

    var newTemplateId = generateNextSequentialId(templateData.rows, [FIELD_NAMES.templateId], 'TPL-', 4);

    var newTemplateRow = templateData.headers.map(function (header) {
      var normalized = normalizeHeader(header);
      if (normalized === normalizeHeader(FIELD_NAMES.templateId)) { return newTemplateId; }
      if (Object.prototype.hasOwnProperty.call(overrideValues, header)) {
        return coerceValueForSheet(header, overrideValues[header]);
      }
      return serializeValue(getFieldValue(sourceRow, [header]));
    });
    templateData.sheet.appendRow(newTemplateRow);

    var criteriaData = readSheet(SHEETS.scorecardCriteria);
    var sourceCriteria = criteriaData.rows.filter(function (row) {
      return toSafeString(getFieldValue(row, [FIELD_NAMES.templateId])) === sourceTemplateId &&
        isTruthyValue(getFieldValue(row, [FIELD_NAMES.active]));
    });

    var nextCriteriaNumber = computeMaxSequentialNumber(criteriaData.rows, [FIELD_NAMES.criteriaId]);
    sourceCriteria.forEach(function (sourceCriterionRow) {
      nextCriteriaNumber += 1;
      var newCriteriaId = 'CRIT-' + padNumber(nextCriteriaNumber, 4);

      var newCriterionRow = criteriaData.headers.map(function (header) {
        var normalized = normalizeHeader(header);
        if (normalized === normalizeHeader(FIELD_NAMES.criteriaId)) { return newCriteriaId; }
        if (normalized === normalizeHeader(FIELD_NAMES.templateId)) { return newTemplateId; }
        return serializeValue(getFieldValue(sourceCriterionRow, [header]));
      });
      criteriaData.sheet.appendRow(newCriterionRow);
    });

    return {
      newTemplateId: newTemplateId,
      criteriaCopied: sourceCriteria.length
    };
  }

  // Independent clone: new lineage entirely, starts as a Draft so it never
  // accidentally becomes live, Version reset to 1.
  function duplicateScorecardTemplate(templateId) {
    var requestedTemplateId = toSafeString(templateId);
    if (!requestedTemplateId) {
      throw new Error('A Template ID is required to duplicate.');
    }

    var templateData = readSheet(SHEETS.scorecardTemplates);
    var sourceRow = findRowByField(templateData.rows, FIELD_NAMES.templateId, requestedTemplateId);
    if (!sourceRow) {
      throw new Error('Scorecard template ' + requestedTemplateId + ' could not be found.');
    }
    var sourceName = toSafeString(getFieldValue(sourceRow, [FIELD_NAMES.templateName]));

    var overrides = {};
    overrides[FIELD_NAMES.templateName] = sourceName + ' (Copy)';
    overrides[FIELD_NAMES.version] = '1';
    overrides[FIELD_NAMES.templateStatus] = 'Draft';

    var result = cloneTemplateWithCriteria(requestedTemplateId, overrides);

    return {
      success: true,
      message: 'Duplicated as a new template (' + result.newTemplateId + ') with ' + result.criteriaCopied + ' criteria, saved as Draft.',
      templateId: result.newTemplateId
    };
  }

  // Same lineage, same Department/Name, Version incremented. If
  // activateAndDeactivatePrevious is true, the new version goes live
  // immediately and the source template is deactivated; otherwise the new
  // version is saved as a Draft and the source template (and whatever it's
  // currently resolving to) is left completely untouched until an
  // administrator explicitly switches over.
  function createNewTemplateVersion(templateId, activateAndDeactivatePrevious) {
    var requestedTemplateId = toSafeString(templateId);
    if (!requestedTemplateId) {
      throw new Error('A Template ID is required to create a new version.');
    }

    var templateData = readSheet(SHEETS.scorecardTemplates);
    var sourceRow = findRowByField(templateData.rows, FIELD_NAMES.templateId, requestedTemplateId);
    if (!sourceRow) {
      throw new Error('Scorecard template ' + requestedTemplateId + ' could not be found.');
    }

    var currentVersion = toNumber(getFieldValue(sourceRow, [FIELD_NAMES.version]));
    var nextVersion = (typeof currentVersion === 'number' && !isNaN(currentVersion)) ? (currentVersion + 1) : 2;

    var overrides = {};
    overrides[FIELD_NAMES.version] = String(nextVersion);
    overrides[FIELD_NAMES.templateStatus] = activateAndDeactivatePrevious ? 'Active' : 'Draft';

    var result = cloneTemplateWithCriteria(requestedTemplateId, overrides);

    if (activateAndDeactivatePrevious) {
      var deactivateValues = {};
      deactivateValues[FIELD_NAMES.templateStatus] = 'Inactive';
      updateRowById(SHEETS.scorecardTemplates, FIELD_NAMES.templateId, requestedTemplateId, deactivateValues);
    }

    return {
      success: true,
      message: 'Created version ' + nextVersion + ' (' + result.newTemplateId + ') with ' + result.criteriaCopied + ' criteria copied' +
        (activateAndDeactivatePrevious ? '; previous version deactivated.' : '; previous version left active until you switch over.'),
      templateId: result.newTemplateId
    };
  }

  // ---------------------------------------------------------------------
  // Scoring engine: a registry keyed by the Scorecard Template's own
  // Scoring Type value - never a hardcoded LOB/department name. Adding a
  // future scoring type means adding one new entry to SCORING_STRATEGIES,
  // nothing else changes.
  // ---------------------------------------------------------------------

  var SCORING_STRATEGIES = {};

  SCORING_STRATEGIES[TEMPLATE_SCORING_TYPE_WEIGHTED] = function (criteria, failedCriteriaNames) {
    var score = computeWeightedDeductionScore(criteria, failedCriteriaNames);
    return { score: score, isCriticalFailure: false };
  };

  SCORING_STRATEGIES[TEMPLATE_SCORING_TYPE_CRITICAL] = function (criteria, failedCriteriaNames) {
    var criticalCriteria = criteria.filter(function (c) { return c.isCritical; });
    var generalCriteria = criteria.filter(function (c) { return !c.isCritical; });

    var failedCritical = criticalCriteria.some(function (criterion) {
      return failedCriteriaNames.some(function (failedName) {
        return normalizeHeader(failedName) === normalizeHeader(criterion.name);
      });
    });

    if (failedCritical) {
      return { score: 0, isCriticalFailure: true };
    }

    var score = computeWeightedDeductionScore(generalCriteria, failedCriteriaNames);
    return { score: score, isCriticalFailure: false };
  };

  // Deduction model: start at 100, subtract the Weight of every criterion
  // (from the given criteria set) that was marked failed for this audit.
  // Clamped to [0, 100] as a safety guard against misconfigured weights.
  function computeWeightedDeductionScore(criteria, failedCriteriaNames) {
    var totalDeduction = criteria.reduce(function (sum, criterion) {
      var wasFailed = failedCriteriaNames.some(function (failedName) {
        return normalizeHeader(failedName) === normalizeHeader(criterion.name);
      });
      return sum + (wasFailed ? criterion.weight : 0);
    }, 0);

    var score = 100 - totalDeduction;
    return Math.max(0, Math.min(100, roundNumber(score, 2)));
  }

  // Resolves a template's Scoring Type and computes a suggested score for
  // one audit's selected Failed Criteria. This is advisory only - it never
  // writes anywhere, and manual Score entry in the Weekly Review remains
  // authoritative. Falls back to the Weighted Percentage strategy (and
  // flags usedFallbackStrategy) for templates with a blank/unrecognized
  // Scoring Type, so older templates keep working unchanged.
  function getSuggestedAuditScore(templateId, failedCriteriaNames) {
    var requestedTemplateId = toSafeString(templateId);
    if (!requestedTemplateId) {
      return { success: false, message: 'A Scorecard Template is required to suggest a score.' };
    }

    var templateData = readSheet(SHEETS.scorecardTemplates);
    var templateRow = findRowByField(templateData.rows, FIELD_NAMES.templateId, requestedTemplateId);
    if (!templateRow) {
      return { success: false, message: 'Scorecard template ' + requestedTemplateId + ' could not be found.' };
    }

    var rawScoringType = toSafeString(getFieldValue(templateRow, [FIELD_NAMES.scoringType]));
    var normalizedScoringType = normalizeHeader(rawScoringType);
    var strategy = SCORING_STRATEGIES[normalizedScoringType];
    var usedFallbackStrategy = false;

    if (!strategy) {
      strategy = SCORING_STRATEGIES[TEMPLATE_SCORING_TYPE_WEIGHTED];
      usedFallbackStrategy = true;
    }

    var criteria = getScorecardCriteria(requestedTemplateId).criteria;
    var failedNames = Array.isArray(failedCriteriaNames) ? failedCriteriaNames : [];
    var result = strategy(criteria, failedNames);

    return {
      success: true,
      templateId: requestedTemplateId,
      scoringType: rawScoringType,
      usedFallbackStrategy: usedFallbackStrategy,
      suggestedScore: result.score,
      isCriticalFailure: result.isCriticalFailure
    };
  }

  // =========================================================================
  // ANALYTICS MODULE
  // Kept deliberately separate from the scoring engine and from Search's own
  // filtering logic above/below: this module's only job is to read every
  // relevant sheet EXACTLY ONCE per request and produce one flat, denormalized
  // array of audit-level records. Every future analytics consumer (Root
  // Cause Analytics, Trend Analysis, Team Leader Dashboard, Department
  // Analytics, Executive Dashboard, Week Explorer) should filter/group THIS
  // SAME array rather than re-reading sheets or re-deriving joins - "aggregate
  // once, reuse everywhere." This is also the shape future AI features would
  // consume (per-audit records with resolved template/criticality context
  // already attached), without needing their own separate data plumbing.
  // =========================================================================

  // Builds the flat audit-level dataset: one entry per Weekly Review Detail
  // row, joined with its parent Performance Log record, the agent, the
  // department, and (heuristically - see resolveTemplateForAudit) the
  // Scorecard Template that most likely governed it. Every sheet involved is
  // read exactly once, regardless of how many audits/departments exist.
  function buildAuditAnalyticsDataset() {
    var departmentData = readSheet(SHEETS.departments);
    var agentData = readSheet(SHEETS.agents);
    var performanceData = readSheet(SHEETS.performanceLog);
    var templateData = readSheet(SHEETS.scorecardTemplates);
    var criteriaData = readSheet(SHEETS.scorecardCriteria);
    var detailData = readSheet(SHEETS.weeklyReviewDetail);

    var departmentNameById = {};
    departmentData.rows.forEach(function (row) {
      departmentNameById[toSafeString(getFieldValue(row, [FIELD_NAMES.departmentId]))] =
        toSafeString(getFieldValue(row, [FIELD_NAMES.departmentName]));
    });

    var agentInfoById = {};
    agentData.rows.forEach(function (row) {
      var agentId = toSafeString(getFieldValue(row, [FIELD_NAMES.agentId]));
      var departmentId = toSafeString(getFieldValue(row, [FIELD_NAMES.departmentId]));
      agentInfoById[agentId] = {
        agentId: agentId,
        name: toSafeString(getFieldValue(row, [FIELD_NAMES.name])),
        departmentId: departmentId,
        departmentName: departmentNameById[departmentId] || departmentId,
        teamLeader: toSafeString(getFieldValue(row, [FIELD_NAMES.teamLeader]))
      };
    });

    var performanceById = {};
    performanceData.rows.forEach(function (row) {
      var performanceId = toSafeString(getFieldValue(row, [FIELD_NAMES.performanceId]));
      performanceById[performanceId] = {
        agentId: toSafeString(getFieldValue(row, [FIELD_NAMES.agentId])),
        weekEnding: serializeValue(getFieldValue(row, [FIELD_NAMES.weekEnding])),
        qaStream: toSafeString(getFieldValue(row, [FIELD_NAMES.qaStream]))
      };
    });

    var templatesByDepartment = {};
    templateData.rows.forEach(function (row) {
      var departmentId = toSafeString(getFieldValue(row, [FIELD_NAMES.departmentId]));
      if (!templatesByDepartment[departmentId]) { templatesByDepartment[departmentId] = []; }
      templatesByDepartment[departmentId].push({
        templateId: toSafeString(getFieldValue(row, [FIELD_NAMES.templateId])),
        templateName: toSafeString(getFieldValue(row, [FIELD_NAMES.templateName])),
        version: toSafeString(getFieldValue(row, [FIELD_NAMES.version])),
        effectiveFrom: parseDate(getFieldValue(row, [FIELD_NAMES.effectiveFrom])),
        effectiveTo: parseDate(getFieldValue(row, [FIELD_NAMES.effectiveTo]))
      });
    });

    var criteriaByTemplateId = {};
    criteriaData.rows.forEach(function (row) {
      var templateId = toSafeString(getFieldValue(row, [FIELD_NAMES.templateId]));
      if (!criteriaByTemplateId[templateId]) { criteriaByTemplateId[templateId] = []; }
      var criterionScoringType = toSafeString(getFieldValue(row, [FIELD_NAMES.scoringType]));
      criteriaByTemplateId[templateId].push({
        name: toSafeString(getFieldValue(row, [FIELD_NAMES.criterionName])),
        parameter: toSafeString(getFieldValue(row, [FIELD_NAMES.parameter])),
        attribute: toSafeString(getFieldValue(row, [FIELD_NAMES.attribute])),
        isCritical: normalizeHeader(criterionScoringType) === CRITERION_SCORING_TYPE_FATAL
      });
    });

    var records = detailData.rows.map(function (row) {
      var performanceId = toSafeString(getFieldValue(row, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.performanceId));
      var performanceInfo = performanceById[performanceId] || {};
      var agentInfo = agentInfoById[performanceInfo.agentId] || {};

      var auditDate = parseDate(getFieldValue(row, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.auditDate));
      var resolvedTemplate = resolveTemplateForAudit(agentInfo.departmentId, auditDate, templatesByDepartment);
      var failedCriteriaNames = parseFailedCriteria(getFieldValue(row, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.failedCriteria));
      var templateCriteria = resolvedTemplate ? (criteriaByTemplateId[resolvedTemplate.templateId] || []) : [];

      var failedCriteria = failedCriteriaNames.map(function (criterionName) {
        var matched = templateCriteria.find(function (c) { return normalizeHeader(c.name) === normalizeHeader(criterionName); });
        return {
          name: criterionName,
          parameter: matched ? matched.parameter : '',
          attribute: matched ? matched.attribute : '',
          isCritical: matched ? matched.isCritical : null
        };
      });

      return {
        detailId: toSafeString(getFieldValue(row, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.detailId)),
        performanceId: performanceId,
        agentId: agentInfo.agentId || performanceInfo.agentId || '',
        agentName: agentInfo.name || '',
        departmentId: agentInfo.departmentId || '',
        departmentName: agentInfo.departmentName || '',
        teamLeader: agentInfo.teamLeader || '',
        qaStream: performanceInfo.qaStream || '',
        weekEnding: performanceInfo.weekEnding || '',
        interactionId: toSafeString(getFieldValue(row, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.interactionId)),
        auditDate: auditDate ? formatDate(auditDate) : '',
        auditDateObj: auditDate,
        score: toNumber(getFieldValue(row, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.score)),
        comments: toSafeString(getFieldValue(row, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.comments)),
        failedCriteria: failedCriteria,
        templateId: resolvedTemplate ? resolvedTemplate.templateId : '',
        templateName: resolvedTemplate ? resolvedTemplate.templateName : '',
        templateVersion: resolvedTemplate ? resolvedTemplate.version : '',
        templateResolved: !!resolvedTemplate,
        weekKey: auditDate ? getIsoWeekKey(auditDate) : '',
        monthKey: auditDate ? getMonthPeriodKey(auditDate) : '',
        quarterKey: auditDate ? getQuarterPeriodKey(auditDate) : '',
        yearKey: auditDate ? getYearPeriodKey(auditDate) : ''
      };
    });

    return records;
  }

  // HEURISTIC: Weekly Review Detail never stored which Template governed an
  // audit (no schema change was authorized to add that column), so this
  // resolves it after the fact via Department + Effective Date range. When
  // more than one template is active for the department on that date (e.g.
  // mid-version-transition), the highest version wins - documented tie-break,
  // not a guarantee. Returns null (search/analytics show "unresolved") if no
  // candidate matches at all.
  function resolveTemplateForAudit(departmentId, auditDate, templatesByDepartment) {
    if (!departmentId || !auditDate) { return null; }
    var candidates = (templatesByDepartment[departmentId] || []).filter(function (template) {
      if (template.effectiveFrom && auditDate.getTime() < template.effectiveFrom.getTime()) { return false; }
      if (template.effectiveTo && auditDate.getTime() > template.effectiveTo.getTime()) { return false; }
      return true;
    });

    if (!candidates.length) { return null; }

    candidates.sort(function (a, b) { return (toNumber(b.version) || 0) - (toNumber(a.version) || 0); });
    return candidates[0];
  }

  // Universal Search: every filter is optional and AND-combined - providing
  // more filters only ever narrows the result set further. Built on top of
  // buildAuditAnalyticsDataset(), so this never re-reads a sheet itself.
  //
  // filters: {
  //   week, month, quarter, year,          // exact match against precomputed period keys
  //   dateFrom, dateTo,                     // ISO date strings, inclusive
  //   agentId, departmentId, teamLeader,
  //   templateId, version,
  //   parameter, attribute, criterion,      // criterion = a specific failed criterion name
  //   criticality,                          // 'critical' | 'general' | '' (any)
  //   scoreMin, scoreMax,
  //   auditId                                // matches Detail ID OR Interaction ID
  // }
  function searchAudits(filters) {
    var f = filters || {};
    var dataset = buildAuditAnalyticsDataset();

    var dateFrom = f.dateFrom ? parseDate(f.dateFrom) : null;
    var dateTo = f.dateTo ? parseDate(f.dateTo) : null;
    var normalizedAuditId = toSafeString(f.auditId);
    var normalizedTeamLeader = normalizeHeader(f.teamLeader);
    var normalizedParameter = normalizeHeader(f.parameter);
    var normalizedAttribute = normalizeHeader(f.attribute);
    var normalizedCriterion = normalizeHeader(f.criterion);
    var normalizedCriticality = toSafeString(f.criticality).toLowerCase();

    var results = dataset.filter(function (record) {
      if (f.week) {
        var weekFilterDate = parseDate(f.week);
        if (!weekFilterDate || record.weekKey !== getIsoWeekKey(weekFilterDate)) { return false; }
      }
      if (f.month && record.monthKey !== f.month) { return false; }
      if (f.quarter && record.quarterKey !== f.quarter) { return false; }
      if (f.year && record.yearKey !== f.year) { return false; }

      if (dateFrom || dateTo) {
        if (!record.auditDateObj) { return false; }
        if (dateFrom && record.auditDateObj.getTime() < dateFrom.getTime()) { return false; }
        if (dateTo && record.auditDateObj.getTime() > dateTo.getTime()) { return false; }
      }

      if (f.agentId && record.agentId !== toSafeString(f.agentId)) { return false; }
      if (f.departmentId && record.departmentId !== toSafeString(f.departmentId)) { return false; }
      if (normalizedTeamLeader && normalizeHeader(record.teamLeader) !== normalizedTeamLeader) { return false; }
      if (f.templateId && record.templateId !== toSafeString(f.templateId)) { return false; }
      if (f.version && toSafeString(record.templateVersion) !== toSafeString(f.version)) { return false; }

      if (typeof f.scoreMin === 'number' && (typeof record.score !== 'number' || record.score < f.scoreMin)) { return false; }
      if (typeof f.scoreMax === 'number' && (typeof record.score !== 'number' || record.score > f.scoreMax)) { return false; }

      if (normalizedAuditId && !matchesAuditId(record, normalizedAuditId)) {
        return false;
      }

      if (normalizedParameter && !record.failedCriteria.some(function (c) { return normalizeHeader(c.parameter) === normalizedParameter; })) {
        return false;
      }
      if (normalizedAttribute && !record.failedCriteria.some(function (c) { return normalizeHeader(c.attribute) === normalizedAttribute; })) {
        return false;
      }
      if (normalizedCriterion && !record.failedCriteria.some(function (c) { return normalizeHeader(c.name) === normalizedCriterion; })) {
        return false;
      }
      if (normalizedCriticality === 'critical' && !record.failedCriteria.some(function (c) { return c.isCritical === true; })) {
        return false;
      }
      if (normalizedCriticality === 'general' && !record.failedCriteria.some(function (c) { return c.isCritical === false; })) {
        return false;
      }

      return true;
    });

    results.sort(function (a, b) {
      return (b.auditDateObj ? b.auditDateObj.getTime() : 0) - (a.auditDateObj ? a.auditDateObj.getTime() : 0);
    });

    return {
      success: true,
      resultCount: results.length,
      records: results
    };
  }

  // Distinct option lists for populating Search's filter dropdowns. Reads
  // the reference sheets directly (Departments, Agents, Scorecard Templates,
  // Scorecard Criteria) rather than the full joined audit dataset, since
  // these are cheap lookups that don't need the Weekly Review Detail join.
  function getSearchFilterOptions() {
    var departmentData = readSheet(SHEETS.departments);
    var agentData = readSheet(SHEETS.agents);
    var templateData = readSheet(SHEETS.scorecardTemplates);
    var criteriaData = readSheet(SHEETS.scorecardCriteria);

    var departments = departmentData.rows.map(function (row) {
      return {
        departmentId: toSafeString(getFieldValue(row, [FIELD_NAMES.departmentId])),
        departmentName: toSafeString(getFieldValue(row, [FIELD_NAMES.departmentName]))
      };
    }).filter(function (d) { return d.departmentId; });

    var agents = agentData.rows.map(function (row) {
      return {
        agentId: toSafeString(getFieldValue(row, [FIELD_NAMES.agentId])),
        name: toSafeString(getFieldValue(row, [FIELD_NAMES.name])),
        departmentId: toSafeString(getFieldValue(row, [FIELD_NAMES.departmentId]))
      };
    }).filter(function (a) { return a.agentId; });

    var teamLeaders = distinctNonEmpty(agentData.rows.map(function (row) {
      return toSafeString(getFieldValue(row, [FIELD_NAMES.teamLeader]));
    }));

    var templates = templateData.rows.map(function (row) {
      return {
        templateId: toSafeString(getFieldValue(row, [FIELD_NAMES.templateId])),
        templateName: toSafeString(getFieldValue(row, [FIELD_NAMES.templateName])),
        version: toSafeString(getFieldValue(row, [FIELD_NAMES.version]))
      };
    }).filter(function (t) { return t.templateId; });

    var parameters = distinctNonEmpty(criteriaData.rows.map(function (row) {
      return toSafeString(getFieldValue(row, [FIELD_NAMES.parameter]));
    }));
    var attributes = distinctNonEmpty(criteriaData.rows.map(function (row) {
      return toSafeString(getFieldValue(row, [FIELD_NAMES.attribute]));
    }));
    var criteria = distinctNonEmpty(criteriaData.rows.map(function (row) {
      return toSafeString(getFieldValue(row, [FIELD_NAMES.criterionName]));
    }));

    return {
      success: true,
      departments: departments,
      agents: agents,
      teamLeaders: teamLeaders,
      templates: templates,
      parameters: parameters,
      attributes: attributes,
      criteria: criteria
    };
  }

  function distinctNonEmpty(values) {
    var seen = {};
    var result = [];
    values.forEach(function (value) {
      if (!value) { return; }
      var key = normalizeHeader(value);
      if (!seen[key]) {
        seen[key] = true;
        result.push(value);
      }
    });
    return result.sort(function (a, b) { return a.localeCompare(b); });
  }

  // =========================================================================
  // REPORTING ENGINE
  // Every report type below is a thin composition of these shared helpers
  // plus buildAuditAnalyticsDataset() - no report computes its own average,
  // its own grouping, or its own root-cause frequency count. If two report
  // types need "average score by X," they both call summarizeGroupedRecords
  // with a different key function; the arithmetic itself lives in one place.
  // =========================================================================

  var REPORT_TYPES = {
    audit: buildAuditReport,
    agent: buildAgentReport,
    weekly: buildWeeklyReport,
    monthly: buildMonthlyReport,
    teamleader: buildTeamLeaderReport,
    department: buildDepartmentReport,
    executive: buildExecutiveReport
  };

  // Single entry point for every report in the application. Builds the
  // shared analytics dataset exactly once, then hands it to whichever
  // report builder matches `type`. The frontend only ever calls this one
  // function - never a report-specific endpoint - and only ever renders the
  // JSON it returns.
  function generateReport(type, filters) {
    var normalizedType = normalizeHeader(type);
    var builder = REPORT_TYPES[normalizedType];
    if (!builder) {
      return { success: false, message: 'Unknown report type: ' + type };
    }

    var dataset = buildAuditAnalyticsDataset();
    return builder(dataset, filters || {});
  }

  // ---- Shared aggregation helpers --------------------------------------

  function computeAverageScore(records) {
    var scores = records
      .map(function (r) { return r.score; })
      .filter(function (v) { return typeof v === 'number' && !isNaN(v); });
    if (!scores.length) { return null; }
    return roundNumber(scores.reduce(function (sum, v) { return sum + v; }, 0) / scores.length, 2);
  }

  function computeCriticalFailureRate(records) {
    if (!records.length) { return 0; }
    var criticalCount = records.filter(function (r) { return recordHasCriticalFailure(r); }).length;
    return roundNumber((criticalCount / records.length) * 100, 1);
  }

  function recordHasCriticalFailure(record) {
    return record.failedCriteria.some(function (c) { return c.isCritical === true; });
  }

  // Standard-deviation-based consistency: a tighter spread of period scores
  // scores higher. Documented, not a universal industry definition - stddev
  // in score-points is subtracted directly from 100 and clamped to [0,100].
  function computeConsistencyScore(scores) {
    var validScores = (scores || []).filter(function (v) { return typeof v === 'number' && !isNaN(v); });
    if (validScores.length < 2) { return null; }

    var mean = validScores.reduce(function (sum, v) { return sum + v; }, 0) / validScores.length;
    var variance = validScores.reduce(function (sum, v) { return sum + Math.pow(v - mean, 2); }, 0) / validScores.length;
    var stdDev = Math.sqrt(variance);

    return Math.max(0, Math.round(100 - stdDev));
  }

  // Generic "group records by a key, compute average score / audit count /
  // critical failure rate per group" - the single implementation behind
  // agent ranking, department breakdown, team leader breakdown, and
  // template usage. Sorted by average score descending (groups with no
  // scored audits sort last).
  function summarizeGroupedRecords(records, keyFn, labelFn) {
    var groups = {};

    records.forEach(function (record) {
      var key = keyFn(record);
      if (!key) { return; }
      if (!groups[key]) {
        groups[key] = { key: key, label: labelFn(record), scores: [], criticalCount: 0, auditCount: 0 };
      }
      groups[key].auditCount += 1;
      if (typeof record.score === 'number' && !isNaN(record.score)) {
        groups[key].scores.push(record.score);
      }
      if (recordHasCriticalFailure(record)) {
        groups[key].criticalCount += 1;
      }
    });

    return Object.keys(groups).map(function (key) {
      var g = groups[key];
      var avg = g.scores.length
        ? roundNumber(g.scores.reduce(function (sum, v) { return sum + v; }, 0) / g.scores.length, 2)
        : null;
      return {
        key: g.key,
        label: g.label,
        averageScore: avg,
        auditCount: g.auditCount,
        criticalFailureCount: g.criticalCount,
        criticalFailureRate: g.auditCount ? roundNumber((g.criticalCount / g.auditCount) * 100, 1) : 0
      };
    }).sort(function (a, b) {
      if (a.averageScore === null) { return 1; }
      if (b.averageScore === null) { return -1; }
      return b.averageScore - a.averageScore;
    });
  }

  function computeAgentRanking(records) {
    return summarizeGroupedRecords(records, function (r) { return r.agentId; }, function (r) { return r.agentName; });
  }

  function computeDepartmentBreakdown(records) {
    return summarizeGroupedRecords(records, function (r) { return r.departmentId; }, function (r) { return r.departmentName; });
  }

  function computeTeamLeaderBreakdown(records) {
    return summarizeGroupedRecords(records, function (r) { return r.teamLeader; }, function (r) { return r.teamLeader; });
  }

  function computeTemplateUsage(records) {
    return summarizeGroupedRecords(
      records,
      function (r) { return r.templateId || 'unresolved'; },
      function (r) { return r.templateResolved ? (r.templateName + ' v' + r.templateVersion) : 'Unresolved'; }
    );
  }

  // Groups failed criteria by Parameter (used for the Parameter Breakdown
  // sections). Each occurrence within a record counts once per record.
  function computeParameterBreakdown(records) {
    var counts = {};
    records.forEach(function (record) {
      var parametersInRecord = uniqueStrings(record.failedCriteria.map(function (c) { return c.parameter; }).filter(Boolean));
      parametersInRecord.forEach(function (parameter) {
        var key = normalizeHeader(parameter);
        if (!counts[key]) { counts[key] = { parameter: parameter, count: 0 }; }
        counts[key].count += 1;
      });
    });
    return Object.keys(counts).map(function (key) { return counts[key]; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  // Root cause frequency, generalized to work directly off the analytics
  // dataset's already-resolved failedCriteria (name/parameter/attribute/
  // isCritical) rather than re-parsing raw Failed Criteria text - this is
  // the reporting engine's canonical root-cause aggregation, reusing the
  // same "count once per record" rule as every other root-cause count in
  // the app (computeFailedCriteriaAggregate, computeTopRootCauses' successor).
  function aggregateFailedCriteriaFromRecords(records) {
    var counts = {};
    records.forEach(function (record) {
      var uniqueNames = uniqueStrings(record.failedCriteria.map(function (c) { return c.name; }));
      uniqueNames.forEach(function (name) {
        var key = normalizeHeader(name);
        var matchingCriterion = record.failedCriteria.find(function (c) { return normalizeHeader(c.name) === key; });
        if (!counts[key]) {
          counts[key] = {
            rootCause: name,
            count: 0,
            parameter: matchingCriterion ? matchingCriterion.parameter : '',
            attribute: matchingCriterion ? matchingCriterion.attribute : '',
            isCritical: matchingCriterion ? matchingCriterion.isCritical : null,
            scores: []
          };
        }
        counts[key].count += 1;
        if (typeof record.score === 'number' && !isNaN(record.score)) {
          counts[key].scores.push(record.score);
        }
      });
    });

    var totalRecords = records.length || 1;
    return Object.keys(counts).map(function (key) {
      var c = counts[key];
      return {
        rootCause: c.rootCause,
        count: c.count,
        percentage: roundNumber((c.count / totalRecords) * 100, 1),
        parameter: c.parameter,
        attribute: c.attribute,
        isCritical: c.isCritical,
        averageScoreWhenPresent: c.scores.length ? roundNumber(c.scores.reduce(function (s, v) { return s + v; }, 0) / c.scores.length, 2) : null
      };
    }).sort(function (a, b) { return b.count - a.count; });
  }

  // Splits records into two halves by chronological order (not by date
  // range midpoint) - matches the same trend convention already used by
  // the Agent Profile's Development Areas trend, so "improving/declining"
  // means the same thing everywhere in the app.
  function splitRecordsChronologically(records) {
    var sorted = records.filter(function (r) { return r.auditDateObj; })
      .sort(function (a, b) { return a.auditDateObj.getTime() - b.auditDateObj.getTime(); });
    var midpoint = Math.floor(sorted.length / 2);
    return { firstHalf: sorted.slice(0, midpoint), secondHalf: sorted.slice(midpoint) };
  }

  function computeTrendDirection(previousAvg, currentAvg) {
    if (typeof previousAvg !== 'number' || typeof currentAvg !== 'number') {
      return { direction: 'Insufficient data', deltaPct: null };
    }
    var deltaPct = previousAvg !== 0 ? roundNumber(((currentAvg - previousAvg) / previousAvg) * 100, 1) : null;
    var direction = currentAvg > previousAvg ? 'Improving' : (currentAvg < previousAvg ? 'Declining' : 'Stable');
    return { direction: direction, deltaPct: deltaPct };
  }

  // The one place "does this Audit ID match this record" is decided - reused
  // by both Search (searchAudits) and the Audit Report, so they can never
  // disagree about what counts as a match.
  function matchesAuditId(record, auditId) {
    var normalized = normalizeHeader(auditId);
    if (!normalized) { return false; }
    return normalizeHeader(record.detailId) === normalized || normalizeHeader(record.interactionId) === normalized;
  }

  function formatPercentValue(value) {
    return (value === null || value === undefined) ? 'N/A' : (value + '%');
  }

  // ---- Audit Report -------------------------------------------------------

  function buildAuditReport(dataset, filters) {
    var auditId = toSafeString(filters.auditId);
    if (!auditId) {
      return { success: false, message: 'An Audit ID is required.' };
    }

    var record = dataset.find(function (r) { return matchesAuditId(r, auditId); });
    if (!record) {
      return { success: false, message: 'No audit found matching ID "' + auditId + '".' };
    }

    var templateCriteria = record.templateResolved ? getScorecardCriteria(record.templateId).criteria : [];
    var failedNames = record.failedCriteria.map(function (c) { return c.name; });

    var passedCriteria = templateCriteria.filter(function (criterion) {
      return !failedNames.some(function (name) { return normalizeHeader(name) === normalizeHeader(criterion.name); });
    });

    var recommendations = record.failedCriteria.map(function (failed) {
      var matched = templateCriteria.find(function (c) { return normalizeHeader(c.name) === normalizeHeader(failed.name); });
      return {
        criterion: failed.name,
        explanation: matched ? matched.explanation : '',
        coachingTip: matched ? matched.coachingTip : ''
      };
    });

    // Parameter -> Attribute -> Criterion grouping of this audit's own
    // failures (a single-audit tree, not a frequency count).
    var rootCauseTree = {};
    record.failedCriteria.forEach(function (c) {
      var parameterKey = c.parameter || 'Unspecified Parameter';
      var attributeKey = c.attribute || 'Unspecified Attribute';
      if (!rootCauseTree[parameterKey]) { rootCauseTree[parameterKey] = {}; }
      if (!rootCauseTree[parameterKey][attributeKey]) { rootCauseTree[parameterKey][attributeKey] = []; }
      rootCauseTree[parameterKey][attributeKey].push(c.name);
    });
    var rootCauseGrouping = Object.keys(rootCauseTree).map(function (parameter) {
      return {
        parameter: parameter,
        attributes: Object.keys(rootCauseTree[parameter]).map(function (attribute) {
          return { attribute: attribute, criteria: rootCauseTree[parameter][attribute] };
        })
      };
    });

    var criticalFailures = record.failedCriteria.filter(function (c) { return c.isCritical === true; });

    var summary = buildAuditSummary({
      score: record.score,
      criticalFailures: criticalFailures,
      failedCriteria: record.failedCriteria
    });

    var limitations = [];
    if (!record.templateResolved) {
      limitations.push('Scorecard Template could not be determined for this audit (Department + effective dates found no match), so Passed Criteria and some Recommendations are unavailable.');
    }
    limitations.push('"Auditor" is not currently tracked anywhere in the data model, so it cannot be shown.');

    return {
      success: true,
      reportType: 'audit',
      header: {
        auditId: record.detailId,
        interactionId: record.interactionId,
        agentName: record.agentName,
        departmentName: record.departmentName,
        teamLeader: record.teamLeader,
        weekEnding: record.weekEnding,
        auditDate: record.auditDate,
        templateName: record.templateResolved ? record.templateName : 'Unresolved',
        templateVersion: record.templateResolved ? record.templateVersion : ''
      },
      performance: {
        score: record.score,
        criticalFailures: criticalFailures,
        failedCriteria: record.failedCriteria,
        passedCriteria: passedCriteria,
        comments: record.comments
      },
      rootCauseGrouping: rootCauseGrouping,
      recommendations: recommendations,
      summary: summary,
      limitations: limitations
    };
  }

  function buildAuditSummary(data) {
    var lines = [];
    lines.push('The audit achieved ' + formatPercentValue(data.score) + '.');

    if (data.criticalFailures.length) {
      lines.push('Critical failure(s) occurred: ' + data.criticalFailures.map(function (c) { return c.name; }).join(', ') + '.');
    } else {
      lines.push('No critical failures occurred.');
    }

    if (data.failedCriteria.length) {
      var topParameters = uniqueStrings(data.failedCriteria.map(function (c) { return c.parameter; }).filter(Boolean)).slice(0, 2);
      if (topParameters.length) {
        lines.push('The primary opportunities relate to ' + topParameters.join(' and ') + '.');
      }
      var topCriteria = data.failedCriteria.slice(0, 2).map(function (c) { return c.name; });
      lines.push('Coaching should focus on ' + topCriteria.join(' and ') + ' accuracy.');
    } else {
      lines.push('All scorecard criteria were passed.');
    }

    return lines.join(' ');
  }

  // ---- Agent Report --------------------------------------------------------

  function buildAgentReport(dataset, filters) {
    var agentId = toSafeString(filters.agentId);
    if (!agentId) {
      return { success: false, message: 'An Agent is required.' };
    }

    // Reuse the existing Agent Dashboard entirely for profile, KPIs,
    // performance-by-stream, performance timeline, and strengths/development
    // - none of that is recomputed here.
    var agentDashboard = getAgentDashboard(agentId);
    if (!agentDashboard.success) {
      return agentDashboard;
    }

    var agentRecords = dataset.filter(function (r) { return r.agentId === agentId; })
      .sort(function (a, b) { return (b.auditDateObj ? b.auditDateObj.getTime() : 0) - (a.auditDateObj ? a.auditDateObj.getTime() : 0); });

    var auditHistory = agentRecords.map(function (r) {
      return {
        interactionId: r.interactionId,
        auditDate: r.auditDate,
        weekEnding: r.weekEnding,
        score: r.score,
        templateName: r.templateResolved ? (r.templateName + ' v' + r.templateVersion) : 'Unresolved',
        failedCriteria: r.failedCriteria.map(function (c) { return c.name; }),
        comments: r.comments
      };
    });

    var criticalFailureCount = agentRecords.filter(function (r) { return recordHasCriticalFailure(r); }).length;
    var rootCauses = aggregateFailedCriteriaFromRecords(agentRecords);

    var weeklyTimeline = (agentDashboard.summary.performanceTimeline && agentDashboard.summary.performanceTimeline.weekly) || [];
    var consistencyScore = computeConsistencyScore(weeklyTimeline.map(function (p) { return p.averageScore; }));

    var halves = splitRecordsChronologically(agentRecords);
    var improvementTrend = computeTrendDirection(computeAverageScore(halves.firstHalf), computeAverageScore(halves.secondHalf));

    var achievements = computeAgentAchievements(agentDashboard, agentRecords, consistencyScore);

    var topDevelopmentArea = (agentDashboard.summary.criteriaAnalysis.developmentAreas || [])[0];

    var summary = buildAgentSummary({
      name: agentDashboard.agent.name,
      weekly: weeklyTimeline,
      topDevelopmentArea: topDevelopmentArea ? topDevelopmentArea.criterion : ''
    });

    return {
      success: true,
      reportType: 'agent',
      profile: agentDashboard.agent,
      performanceSummary: agentDashboard.summary,
      auditHistory: auditHistory,
      scoreTimeline: weeklyTimeline,
      rootCauses: rootCauses,
      strengths: agentDashboard.summary.criteriaAnalysis.strengths,
      developmentAreas: agentDashboard.summary.criteriaAnalysis.developmentAreas,
      criticalFailureCount: criticalFailureCount,
      consistencyScore: consistencyScore,
      improvementTrend: improvementTrend,
      achievements: achievements,
      summary: summary,
      limitations: [
        'Achievements shown are a first-pass evidence-based subset (95% Club, Dispute Free, Consistency Champion, Audit Volume milestones) - the fuller badge set described in earlier planning (Perfect Week, Fast Improver, etc.) needs additional historical tracking not yet in the data model.',
        'Coaching History is available via the existing Coachings page/history and is intentionally not recomputed here to avoid duplicating that data.'
      ]
    };
  }

  // First-pass, evidence-based achievements only - every badge here is
  // directly checkable against data already computed above, nothing
  // invented. See the report's `limitations` for what's intentionally
  // NOT included yet.
  function computeAgentAchievements(agentDashboard, agentRecords, consistencyScore) {
    var achievements = [];

    if (typeof agentDashboard.summary.overallAveragePerformance === 'number' && agentDashboard.summary.overallAveragePerformance >= 95) {
      achievements.push({ name: '95% Club', detail: 'Overall average performance is ' + agentDashboard.summary.overallAveragePerformance + '%.' });
    }
    if (typeof agentDashboard.summary.openDisputeCount === 'number' && agentDashboard.summary.openDisputeCount === 0) {
      achievements.push({ name: 'Dispute Free', detail: 'No open disputes currently on record.' });
    }
    if (typeof consistencyScore === 'number' && consistencyScore >= 90) {
      achievements.push({ name: 'Consistency Champion', detail: 'Consistency score of ' + consistencyScore + '.' });
    }
    if (agentRecords.length >= 100) {
      achievements.push({ name: '100 Audits Reviewed', detail: agentRecords.length + ' audits reviewed to date.' });
    }

    return achievements;
  }

  function buildAgentSummary(data) {
    var weekly = data.weekly || [];
    if (weekly.length < 2) {
      return 'Not enough weekly history yet to summarize a trend for ' + (data.name || 'this agent') + '.';
    }

    var first = weekly[0];
    var last = weekly[weekly.length - 1];
    var lines = [];
    lines.push('Over the last ' + weekly.length + ' weeks, ' + data.name + ' has moved from ' +
      formatPercentValue(first.averageScore) + ' to ' + formatPercentValue(last.averageScore) + '.');

    if (data.topDevelopmentArea) {
      lines.push(data.topDevelopmentArea + ' remains the primary coaching focus.');
    }

    return lines.join(' ');
  }

  // ---- Weekly Report --------------------------------------------------------

  function buildWeeklyReport(dataset, filters) {
    var weekDate = parseDate(filters.week);
    if (!weekDate) {
      return { success: false, message: 'A valid week (date within it) is required.' };
    }

    var weekKey = getIsoWeekKey(weekDate);
    var previousWeekDate = new Date(weekDate.getTime() - 7 * 86400000);
    var previousWeekKey = getIsoWeekKey(previousWeekDate);

    var currentRecords = dataset.filter(function (r) { return r.weekKey === weekKey; });
    var previousRecords = dataset.filter(function (r) { return r.weekKey === previousWeekKey; });

    var averageScore = computeAverageScore(currentRecords);
    var auditCount = currentRecords.length;
    var criticalFailureCount = currentRecords.filter(function (r) { return recordHasCriticalFailure(r); }).length;
    var generalFailureCount = currentRecords.filter(function (r) {
      return r.failedCriteria.some(function (c) { return c.isCritical === false; });
    }).length;

    var agentRanking = computeAgentRanking(currentRecords);
    var topPerformer = agentRanking.length ? agentRanking[0] : null;
    var lowestPerformer = agentRanking.length ? agentRanking[agentRanking.length - 1] : null;

    var previousAgentRanking = computeAgentRanking(previousRecords);
    var previousByAgent = {};
    previousAgentRanking.forEach(function (a) { previousByAgent[a.key] = a; });
    var mostImprovedAgent = null;
    var bestDelta = null;
    agentRanking.forEach(function (agent) {
      var previous = previousByAgent[agent.key];
      if (previous && typeof previous.averageScore === 'number' && typeof agent.averageScore === 'number') {
        var delta = roundNumber(agent.averageScore - previous.averageScore, 2);
        if (bestDelta === null || delta > bestDelta) {
          bestDelta = delta;
          mostImprovedAgent = { label: agent.label, deltaPct: delta, from: previous.averageScore, to: agent.averageScore };
        }
      }
    });

    var rootCauses = aggregateFailedCriteriaFromRecords(currentRecords);
    var recommendations = buildRecommendationsFromRootCauses(rootCauses.slice(0, 3));

    var summary = buildWeeklySummary({
      weekKey: weekKey,
      averageScore: averageScore,
      auditCount: auditCount,
      criticalFailureCount: criticalFailureCount,
      topRootCause: rootCauses.length ? rootCauses[0] : null,
      trend: computeTrendDirection(computeAverageScore(previousRecords), averageScore)
    });

    return {
      success: true,
      reportType: 'weekly',
      week: weekKey,
      overview: {
        averageScore: averageScore,
        auditCount: auditCount,
        criticalFailureCount: criticalFailureCount,
        generalFailureCount: generalFailureCount
      },
      topPerformer: topPerformer,
      lowestPerformer: lowestPerformer,
      mostImprovedAgent: mostImprovedAgent,
      rootCauses: rootCauses,
      parameterBreakdown: computeParameterBreakdown(currentRecords),
      departmentBreakdown: computeDepartmentBreakdown(currentRecords),
      recommendations: recommendations,
      summary: summary,
      limitations: [
        'Completion % is intentionally omitted - there is no configured audit quota/target anywhere in the data model to measure completion against, and inventing one would be misleading.'
      ]
    };
  }

  function buildWeeklySummary(data) {
    var lines = [];
    lines.push('Week ' + data.weekKey + ' averaged ' + formatPercentValue(data.averageScore) +
      ' across ' + data.auditCount + ' audit(s), with ' + data.criticalFailureCount + ' critical failure(s).');

    if (data.topRootCause) {
      lines.push('The most common root cause was ' + data.topRootCause.rootCause + ' (' + data.topRootCause.percentage + '% of audits).');
    }

    if (data.trend.direction !== 'Insufficient data') {
      lines.push('This is ' + data.trend.direction.toLowerCase() + ' compared to the previous week' +
        (data.trend.deltaPct !== null ? ' (' + (data.trend.deltaPct > 0 ? '+' : '') + data.trend.deltaPct + '%)' : '') + '.');
    }

    return lines.join(' ');
  }

  // ---- Monthly Report -------------------------------------------------------

  function buildMonthlyReport(dataset, filters) {
    var monthKey = toSafeString(filters.month);
    if (!monthKey) {
      return { success: false, message: 'A month is required.' };
    }

    var previousMonthKey = shiftMonthKey(monthKey, -1);
    var currentRecords = dataset.filter(function (r) { return r.monthKey === monthKey; });
    var previousRecords = dataset.filter(function (r) { return r.monthKey === previousMonthKey; });

    var weeksInMonth = {};
    currentRecords.forEach(function (r) {
      if (!r.weekKey) { return; }
      if (!weeksInMonth[r.weekKey]) { weeksInMonth[r.weekKey] = []; }
      weeksInMonth[r.weekKey].push(r);
    });
    var weekComparisons = Object.keys(weeksInMonth).sort().map(function (weekKey) {
      return { weekKey: weekKey, averageScore: computeAverageScore(weeksInMonth[weekKey]), auditCount: weeksInMonth[weekKey].length };
    });

    var currentAgentRanking = computeAgentRanking(currentRecords);
    var previousAgentRanking = computeAgentRanking(previousRecords);
    var previousByAgent = {};
    previousAgentRanking.forEach(function (a) { previousByAgent[a.key] = a; });

    var deltas = currentAgentRanking
      .map(function (agent) {
        var previous = previousByAgent[agent.key];
        if (!previous || typeof previous.averageScore !== 'number' || typeof agent.averageScore !== 'number') { return null; }
        return { label: agent.label, from: previous.averageScore, to: agent.averageScore, deltaPct: roundNumber(agent.averageScore - previous.averageScore, 2) };
      })
      .filter(Boolean);

    var topImprovements = deltas.slice().sort(function (a, b) { return b.deltaPct - a.deltaPct; }).slice(0, 3);
    var largestDeclines = deltas.slice().sort(function (a, b) { return a.deltaPct - b.deltaPct; }).slice(0, 3);

    var currentAvg = computeAverageScore(currentRecords);
    var previousAvg = computeAverageScore(previousRecords);
    var trend = computeTrendDirection(previousAvg, currentAvg);

    var criticalTrend = computeTrendDirection(computeCriticalFailureRate(previousRecords), computeCriticalFailureRate(currentRecords));

    var summary = buildMonthlySummary({
      monthKey: monthKey,
      averageScore: currentAvg,
      auditCount: currentRecords.length,
      trend: trend,
      topImprovement: topImprovements[0] || null
    });

    return {
      success: true,
      reportType: 'monthly',
      month: monthKey,
      overview: { averageScore: currentAvg, auditCount: currentRecords.length, criticalFailureRate: computeCriticalFailureRate(currentRecords) },
      weekComparisons: weekComparisons,
      trendSummary: trend,
      topImprovements: topImprovements,
      largestDeclines: largestDeclines,
      criticalFailureTrend: criticalTrend,
      rootCauses: aggregateFailedCriteriaFromRecords(currentRecords),
      parameterBreakdown: computeParameterBreakdown(currentRecords),
      departmentBreakdown: computeDepartmentBreakdown(currentRecords),
      summary: summary,
      limitations: []
    };
  }

  function shiftMonthKey(monthKey, deltaMonths) {
    var parts = monthKey.split('-');
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10) - 1;
    var shifted = new Date(year, month + deltaMonths, 1);
    return shifted.getFullYear() + '-' + padNumber(shifted.getMonth() + 1, 2);
  }

  function buildMonthlySummary(data) {
    var lines = [];
    lines.push(data.monthKey + ' averaged ' + formatPercentValue(data.averageScore) + ' across ' + data.auditCount + ' audit(s).');
    if (data.trend.direction !== 'Insufficient data') {
      lines.push('This is ' + data.trend.direction.toLowerCase() + ' month-over-month' +
        (data.trend.deltaPct !== null ? ' (' + (data.trend.deltaPct > 0 ? '+' : '') + data.trend.deltaPct + '%)' : '') + '.');
    }
    if (data.topImprovement) {
      lines.push(data.topImprovement.label + ' showed the largest improvement, moving from ' +
        formatPercentValue(data.topImprovement.from) + ' to ' + formatPercentValue(data.topImprovement.to) + '.');
    }
    return lines.join(' ');
  }

  // Shared by every report's Recommendations section: turns a list of
  // aggregated root causes into coaching recommendations using the
  // existing Scorecard Criteria explanations/coaching tips - reused rather
  // than re-implemented per report type.
  function buildRecommendationsFromRootCauses(rootCauses) {
    var criteriaLookup = getAllActiveCriteriaAcrossTemplates().criteria;
    return rootCauses.map(function (rootCause) {
      var matched = criteriaLookup.find(function (c) { return normalizeHeader(c.name) === normalizeHeader(rootCause.rootCause); });
      return {
        criterion: rootCause.rootCause,
        percentage: rootCause.percentage,
        coachingTip: matched ? matched.coachingTip : ''
      };
    });
  }

  // Weekly-grouped average score series for an arbitrary record set - the
  // shared "trend over time" shape reused by Team Leader and Department
  // reports (both want a simple chronological score series, not the full
  // Performance Timeline machinery built for individual agents).
  function buildWeeklyScoreSeries(records) {
    var byWeek = {};
    records.forEach(function (r) {
      if (!r.weekKey) { return; }
      if (!byWeek[r.weekKey]) { byWeek[r.weekKey] = []; }
      byWeek[r.weekKey].push(r);
    });
    return Object.keys(byWeek).sort().map(function (weekKey) {
      return { weekKey: weekKey, averageScore: computeAverageScore(byWeek[weekKey]), auditCount: byWeek[weekKey].length };
    });
  }

  // Lightweight secondary read - Coaching Log isn't part of the audit
  // analytics dataset (coaching sessions aren't audits), so this reads it
  // directly rather than folding it into buildAuditAnalyticsDataset().
  function countCoachingSessionsForAgents(agentIds) {
    var coachingData = readSheet(SHEETS.coachingLog);
    var idSet = {};
    agentIds.forEach(function (id) { idSet[id] = true; });
    return coachingData.rows.filter(function (row) {
      return idSet[toSafeString(getFieldValue(row, [FIELD_NAMES.agentId]))];
    }).length;
  }

  // ---- Team Leader Report ---------------------------------------------------

  // Agent x Week average-score grid, used only by the Team Leader Report's
  // heatmap. Capped to the most recent 12 weeks and the agents already in
  // the ranking, to keep the payload bounded for large teams/long histories.
  function buildAgentWeekMatrix(records, agentRanking) {
    var weeks = distinctNonEmpty(records.map(function (r) { return r.weekKey; })).sort().slice(-12);
    var agents = agentRanking.slice(0, 15);

    var matrix = agents.map(function (agent) {
      return weeks.map(function (weekKey) {
        var weekRecords = records.filter(function (r) { return r.agentId === agent.key && r.weekKey === weekKey; });
        return computeAverageScore(weekRecords);
      });
    });

    return {
      agentLabels: agents.map(function (a) { return a.label; }),
      weekLabels: weeks,
      matrix: matrix
    };
  }

  function buildTeamLeaderReport(dataset, filters) {
    var teamLeader = toSafeString(filters.teamLeader);
    if (!teamLeader) {
      return { success: false, message: 'A Team Leader is required.' };
    }

    var records = dataset.filter(function (r) { return normalizeHeader(r.teamLeader) === normalizeHeader(teamLeader); });
    var agentIds = distinctNonEmpty(records.map(function (r) { return r.agentId; }));
    var agentRanking = computeAgentRanking(records);

    var weeklySeries = buildWeeklyScoreSeries(records);
    var halves = splitRecordsChronologically(records);
    var trend = computeTrendDirection(computeAverageScore(halves.firstHalf), computeAverageScore(halves.secondHalf));
    var agentWeekMatrix = buildAgentWeekMatrix(records, agentRanking);

    var summary = buildTeamLeaderSummary({
      teamLeader: teamLeader,
      averageScore: computeAverageScore(records),
      agentCount: agentIds.length,
      trend: trend,
      topRootCause: aggregateFailedCriteriaFromRecords(records)[0] || null
    });

    return {
      success: true,
      reportType: 'teamleader',
      teamLeader: teamLeader,
      overview: {
        averageScore: computeAverageScore(records),
        auditCount: records.length,
        agentCount: agentIds.length,
        criticalFailureRate: computeCriticalFailureRate(records)
      },
      agentRanking: agentRanking,
      topPerformers: agentRanking.slice(0, 3),
      bottomPerformers: agentRanking.slice(-3).reverse(),
      agentWeekMatrix: agentWeekMatrix,
      rootCauses: aggregateFailedCriteriaFromRecords(records),
      coachingSessionsLogged: countCoachingSessionsForAgents(agentIds),
      performanceTrend: { series: weeklySeries, direction: trend },
      summary: summary,
      limitations: [
        'Team Leader is a text field on Agents rather than its own tracked entity, so this report groups by exact text match - inconsistent spelling/casing across records would split what should be one team.',
        '"Coaching Completion" is reported as a raw count of logged sessions, not a percentage against a target, since no coaching quota exists in the data model.'
      ]
    };
  }

  function buildTeamLeaderSummary(data) {
    var lines = [];
    lines.push(data.teamLeader + '\u2019s team averaged ' + formatPercentValue(data.averageScore) + ' across ' + data.agentCount + ' agent(s).');
    if (data.trend.direction !== 'Insufficient data') {
      lines.push('Performance is ' + data.trend.direction.toLowerCase() + ' over the period covered.');
    }
    if (data.topRootCause) {
      lines.push('The most common root cause is ' + data.topRootCause.rootCause + '.');
    }
    return lines.join(' ');
  }

  // ---- Department Report ----------------------------------------------------

  function buildDepartmentReport(dataset, filters) {
    var departmentId = toSafeString(filters.departmentId);
    if (!departmentId) {
      return { success: false, message: 'A Department is required.' };
    }

    var records = dataset.filter(function (r) { return r.departmentId === departmentId; });
    var teamLeaders = computeTeamLeaderBreakdown(records);
    var agentRanking = computeAgentRanking(records);
    var weeklySeries = buildWeeklyScoreSeries(records);

    var halves = splitRecordsChronologically(records);
    var trend = computeTrendDirection(computeAverageScore(halves.firstHalf), computeAverageScore(halves.secondHalf));

    var departmentName = records.length ? records[0].departmentName : departmentId;

    var summary = buildDepartmentSummary({
      departmentName: departmentName,
      averageScore: computeAverageScore(records),
      auditCount: records.length,
      trend: trend,
      topRootCause: aggregateFailedCriteriaFromRecords(records)[0] || null
    });

    return {
      success: true,
      reportType: 'department',
      department: { departmentId: departmentId, departmentName: departmentName },
      overview: {
        averageScore: computeAverageScore(records),
        auditCount: records.length,
        criticalFailureRate: computeCriticalFailureRate(records)
      },
      teamLeaders: teamLeaders,
      parameterBreakdown: computeParameterBreakdown(records),
      rootCauses: aggregateFailedCriteriaFromRecords(records),
      agentRanking: agentRanking,
      templateUsage: computeTemplateUsage(records),
      trend: { series: weeklySeries, direction: trend },
      summary: summary,
      limitations: []
    };
  }

  function buildDepartmentSummary(data) {
    var lines = [];
    lines.push(data.departmentName + ' averaged ' + formatPercentValue(data.averageScore) + ' across ' + data.auditCount + ' audit(s).');
    if (data.trend.direction !== 'Insufficient data') {
      lines.push('Performance is ' + data.trend.direction.toLowerCase() + ' over the period covered.');
    }
    if (data.topRootCause) {
      lines.push(data.topRootCause.rootCause + ' is the most common root cause, present in ' + data.topRootCause.percentage + '% of audits.');
    }
    return lines.join(' ');
  }

  // ---- Executive Report -----------------------------------------------------

  function buildExecutiveReport(dataset, filters) {
    var dateFrom = filters.dateFrom ? parseDate(filters.dateFrom) : null;
    var dateTo = filters.dateTo ? parseDate(filters.dateTo) : null;

    var records = dataset.filter(function (r) {
      if (!dateFrom && !dateTo) { return true; }
      if (!r.auditDateObj) { return false; }
      if (dateFrom && r.auditDateObj.getTime() < dateFrom.getTime()) { return false; }
      if (dateTo && r.auditDateObj.getTime() > dateTo.getTime()) { return false; }
      return true;
    });

    var agentData = readSheet(SHEETS.agents);
    var activeAgentCount = agentData.rows.filter(function (row) {
      return isTruthyValue(getFieldValue(row, [FIELD_NAMES.status])) || !findHeader(agentData.headers, [FIELD_NAMES.status]);
    }).length;
    var auditedAgentCount = distinctNonEmpty(records.map(function (r) { return r.agentId; })).length;
    var auditCoveragePct = activeAgentCount ? roundNumber((auditedAgentCount / activeAgentCount) * 100, 1) : null;

    var departmentComparison = computeDepartmentBreakdown(records);
    var teamLeaderComparison = computeTeamLeaderBreakdown(records);
    var top10RootCauses = aggregateFailedCriteriaFromRecords(records).slice(0, 10);

    var highestRiskDepartments = departmentComparison.slice().sort(function (a, b) { return b.criticalFailureRate - a.criticalFailureRate; }).slice(0, 3);
    var highestPerformingDepartments = departmentComparison.slice(0, 3);

    var midpointSplit = splitRecordsByDateHalves(records);
    var firstHalfDeptBreakdown = computeDepartmentBreakdown(midpointSplit.firstHalf);
    var secondHalfDeptBreakdown = computeDepartmentBreakdown(midpointSplit.secondHalf);
    var firstHalfByKey = {};
    firstHalfDeptBreakdown.forEach(function (d) { firstHalfByKey[d.key] = d; });

    var departmentDeltas = secondHalfDeptBreakdown
      .map(function (d) {
        var previous = firstHalfByKey[d.key];
        if (!previous || typeof previous.averageScore !== 'number' || typeof d.averageScore !== 'number') { return null; }
        return { label: d.label, from: previous.averageScore, to: d.averageScore, deltaPct: roundNumber(d.averageScore - previous.averageScore, 2) };
      })
      .filter(Boolean);

    var mostImprovedDepartments = departmentDeltas.slice().sort(function (a, b) { return b.deltaPct - a.deltaPct; }).slice(0, 3);
    var largestDeclineDepartments = departmentDeltas.slice().sort(function (a, b) { return a.deltaPct - b.deltaPct; }).slice(0, 3);

    var coachingActivity = countCoachingSessionsForAgents(distinctNonEmpty(records.map(function (r) { return r.agentId; })));

    var overallQA = computeAverageScore(records);
    var criticalFailureRate = computeCriticalFailureRate(records);

    var summary = buildExecutiveSummary({
      overallQA: overallQA,
      auditCoveragePct: auditCoveragePct,
      criticalFailureRate: criticalFailureRate,
      highestPerforming: highestPerformingDepartments[0] || null,
      highestRisk: highestRiskDepartments[0] || null,
      topRootCause: top10RootCauses[0] || null
    });

    var recommendations = buildRecommendationsFromRootCauses(top10RootCauses.slice(0, 3));
    if (highestRiskDepartments.length && highestRiskDepartments[0].criticalFailureRate > 0) {
      recommendations.push({
        criterion: null,
        percentage: null,
        coachingTip: 'Prioritize a critical-failure review with ' + highestRiskDepartments[0].label +
          ' (' + highestRiskDepartments[0].criticalFailureRate + '% critical failure rate).'
      });
    }

    return {
      success: true,
      reportType: 'executive',
      overview: { overallQA: overallQA, auditCoveragePct: auditCoveragePct, criticalFailureRate: criticalFailureRate, auditCount: records.length },
      departmentComparison: departmentComparison,
      teamLeaderComparison: teamLeaderComparison,
      top10RootCauses: top10RootCauses,
      highestRiskDepartments: highestRiskDepartments,
      highestPerformingDepartments: highestPerformingDepartments,
      mostImprovedDepartments: mostImprovedDepartments,
      largestDeclineDepartments: largestDeclineDepartments,
      coachingActivity: coachingActivity,
      recommendations: recommendations,
      summary: summary,
      limitations: [
        '"Most Improved"/"Largest Decline" compare the first half of the selected period to the second half (chronological midpoint), not a specific prior period, unless a date range is provided.',
        'Audit Coverage assumes an "Active" Status column exists on Agents; departments/agents without a Status column are counted as active by default.'
      ]
    };
  }

  function splitRecordsByDateHalves(records) {
    var sorted = records.filter(function (r) { return r.auditDateObj; })
      .sort(function (a, b) { return a.auditDateObj.getTime() - b.auditDateObj.getTime(); });
    if (!sorted.length) { return { firstHalf: [], secondHalf: [] }; }

    var earliestTime = sorted[0].auditDateObj.getTime();
    var latestTime = sorted[sorted.length - 1].auditDateObj.getTime();
    var midpointTime = earliestTime + (latestTime - earliestTime) / 2;

    return {
      firstHalf: sorted.filter(function (r) { return r.auditDateObj.getTime() <= midpointTime; }),
      secondHalf: sorted.filter(function (r) { return r.auditDateObj.getTime() > midpointTime; })
    };
  }

  function buildExecutiveSummary(data) {
    var lines = [];
    lines.push('Overall QA is ' + formatPercentValue(data.overallQA) +
      (data.auditCoveragePct !== null ? ' with ' + data.auditCoveragePct + '% agent audit coverage' : '') + '.');
    lines.push('The critical failure rate stands at ' + data.criticalFailureRate + '%.');
    if (data.highestPerforming) {
      lines.push(data.highestPerforming.label + ' is the highest performing department at ' + formatPercentValue(data.highestPerforming.averageScore) + '.');
    }
    if (data.highestRisk && data.highestRisk.criticalFailureRate > 0) {
      lines.push(data.highestRisk.label + ' carries the highest critical failure rate at ' + data.highestRisk.criticalFailureRate + '%.');
    }
    if (data.topRootCause) {
      lines.push('The leading root cause business-wide is ' + data.topRootCause.rootCause + '.');
    }
    return lines.join(' ');
  }

  // Creates one Weekly Review (a Performance Log record) from 3-5 individual
  // audits, each stored as its own Weekly Review Detail row linked back to
  // the generated Performance ID. Statistics and the primary/secondary
  // failed criteria are derived only from audits that were actually
  // completed (i.e. have a Score) - blank optional audits are ignored.
  //
  // payload: {
  //   agentId, weekEnding, qaStream, summary,
  //   audits: [ { interactionId, auditDate, score, failedCriteria: [...], comments }, ... ]
  // }
  function saveWeeklyReview(payload) {
    var agentId = toSafeString(payload && payload.agentId);
    if (!agentId) {
      throw new Error('Agent ID is required before saving a weekly review.');
    }

    var agentRow = getAgentRowOrThrow(agentId);
    var agentName = toSafeString(getFieldValue(agentRow, [FIELD_NAMES.name]));

    var weekEnding = toSafeString(payload && payload.weekEnding);
    var qaStream = toSafeString(payload && payload.qaStream);
    var summary = toSafeString(payload && payload.summary);
    var rawAudits = (payload && payload.audits) || [];

    if (!weekEnding) {
      throw new Error('Week Ending is required.');
    }
    if (!qaStream) {
      throw new Error('QA Stream is required.');
    }

    var completedAudits = rawAudits
      .slice(0, MAX_AUDITS)
      .map(normalizeAuditInput)
      .filter(function (audit) {
        return audit.hasScore;
      });

    if (completedAudits.length < MIN_REQUIRED_AUDITS) {
      throw new Error('At least ' + MIN_REQUIRED_AUDITS + ' completed audits (with a Score) are required to save a weekly review.');
    }

    completedAudits.forEach(function (audit) {
      if (typeof audit.score !== 'number' || isNaN(audit.score)) {
        throw new Error('Every completed audit must include a numeric Score.');
      }
    });

    var scores = completedAudits.map(function (audit) { return audit.score; });
    var auditCount = scores.length;
    var averageScore = roundNumber(scores.reduce(function (sum, value) { return sum + value; }, 0) / auditCount, 2);
    var highestScore = Math.max.apply(null, scores);
    var lowestScore = Math.min.apply(null, scores);

    // LEGACY WRITE ONLY: Primary/Secondary Root Cause are still computed and
    // written to Performance Log below for backwards compatibility, but no
    // dashboard, report, or drill-down reads them anymore - all root cause
    // analytics come from Weekly Review Detail's Failed Criteria via
    // computeFailedCriteriaAggregate(). Safe to remove this computation and
    // the two writes below entirely once the Primary/Secondary Root Cause
    // columns are retired from Performance Log.
    var rootCauses = computeTopFailedCriteria(completedAudits);

    var performanceData = readSheet(SHEETS.performanceLog);
    var performanceId = generateNextSequentialId(performanceData.rows, [FIELD_NAMES.performanceId], 'PERF-', 6);
    var today = new Date();

    var performanceRow = performanceData.headers.map(function (header) {
      var normalized = normalizeHeader(header);

      if (normalized === normalizeHeader(FIELD_NAMES.performanceId)) {
        return performanceId;
      }
      if (normalized === normalizeHeader(FIELD_NAMES.agentId)) {
        return agentId;
      }
      if (normalized === normalizeHeader(FIELD_NAMES.name)) {
        return agentName;
      }
      if (isAutoFillDateHeader(header)) {
        return coerceValueForSheet(header, today);
      }
      if (normalized === normalizeHeader(FIELD_NAMES.weekEnding)) {
        return coerceValueForSheet(header, weekEnding);
      }
      if (normalized === normalizeHeader(FIELD_NAMES.qaStream)) {
        return qaStream;
      }
      if (normalized === normalizeHeader(FIELD_NAMES.averageScore)) {
        return averageScore;
      }
      if (normalized === normalizeHeader(FIELD_NAMES.numberOfAudits)) {
        return auditCount;
      }
      if (normalized === normalizeHeader(FIELD_NAMES.primaryRootCause)) {
        return rootCauses.primary;
      }
      if (normalized === normalizeHeader(FIELD_NAMES.secondaryRootCause)) {
        return rootCauses.secondary;
      }
      if (normalized === normalizeHeader(FIELD_NAMES.qaSummary)) {
        return summary;
      }
      return '';
    });

    performanceData.sheet.appendRow(performanceRow);

    var detailData = readSheet(SHEETS.weeklyReviewDetail);
    var nextDetailNumber = computeMaxSequentialNumber(detailData.rows, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.detailId);

    completedAudits.forEach(function (audit, auditIndex) {
      nextDetailNumber += 1;
      var detailId = 'WRD-' + padNumber(nextDetailNumber, 6);

      var detailRow = detailData.headers.map(function (header) {
        if (headerMatchesAny(header, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.detailId)) {
          return detailId;
        }
        if (headerMatchesAny(header, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.performanceId)) {
          return performanceId;
        }
        if (headerMatchesAny(header, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.agentId)) {
          return agentId;
        }
        if (headerMatchesAny(header, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.auditNumber)) {
          return auditIndex + 1;
        }
        if (headerMatchesAny(header, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.interactionId)) {
          return audit.interactionId;
        }
        if (headerMatchesAny(header, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.auditDate)) {
          return coerceValueForSheet(header, audit.auditDate);
        }
        if (headerMatchesAny(header, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.score)) {
          return audit.score;
        }
        if (headerMatchesAny(header, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.failedCriteria)) {
          return audit.failedCriteria.join(', ');
        }
        if (headerMatchesAny(header, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.comments)) {
          return audit.comments;
        }
        return '';
      });

      detailData.sheet.appendRow(detailRow);
    });

    return {
      success: true,
      message: 'Weekly review saved successfully (' + performanceId + ') with ' + auditCount + ' audits.',
      performanceId: performanceId,
      averageScore: averageScore,
      highestScore: highestScore,
      lowestScore: lowestScore,
      auditCount: auditCount,
      primaryRootCause: rootCauses.primary,
      secondaryRootCause: rootCauses.secondary
    };
  }

  function normalizeAuditInput(rawAudit) {
    var audit = rawAudit || {};
    var scoreValue = toNumber(audit.score);
    var failedCriteria = Array.isArray(audit.failedCriteria)
      ? audit.failedCriteria.map(toSafeString).filter(function (value) { return value; })
      : [];

    return {
      interactionId: toSafeString(audit.interactionId),
      auditDate: audit.auditDate,
      score: scoreValue,
      hasScore: typeof scoreValue === 'number' && !isNaN(scoreValue),
      failedCriteria: failedCriteria,
      comments: toSafeString(audit.comments)
    };
  }

  // Ranks failed criteria by how many completed audits cite them (each
  // criterion counted at most once per audit), breaking ties using the
  // criterion's Weight from the Scorecard Criteria sheet (higher wins).
  function computeTopFailedCriteria(completedAudits) {
    var counts = {};
    completedAudits.forEach(function (audit) {
      var uniqueCriteria = uniqueStrings(audit.failedCriteria);
      uniqueCriteria.forEach(function (criterionName) {
        counts[criterionName] = (counts[criterionName] || 0) + 1;
      });
    });

    var criterionNames = Object.keys(counts);
    if (!criterionNames.length) {
      return { primary: '', secondary: '' };
    }

    var weightByName = {};
    getAllActiveCriteriaAcrossTemplates().criteria.forEach(function (criterion) {
      weightByName[normalizeHeader(criterion.name)] = criterion.weight;
    });

    var ranked = criterionNames
      .map(function (name) {
        return {
          name: name,
          count: counts[name],
          weight: weightByName[normalizeHeader(name)] || 0
        };
      })
      .sort(function (a, b) {
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        if (b.weight !== a.weight) {
          return b.weight - a.weight;
        }
        return a.name.localeCompare(b.name);
      });

    return {
      primary: ranked[0] ? ranked[0].name : '',
      secondary: ranked[1] ? ranked[1].name : ''
    };
  }

  function uniqueStrings(values) {
    var seen = {};
    var result = [];
    values.forEach(function (value) {
      var key = normalizeHeader(value);
      if (!seen[key]) {
        seen[key] = true;
        result.push(value);
      }
    });
    return result;
  }

  function getAllCoachingRecords() {
    return getFullLogWithAgentNames(SHEETS.coachingLog);
  }

  function getAllPerformanceRecords() {
    return getFullLogWithAgentNames(SHEETS.performanceLog);
  }

  function getAllDisputeRecords() {
    return getFullLogWithAgentNames(SHEETS.disputeLog);
  }

  // ---------------------------------------------------------------------
  // Internal helpers backing the new entry points
  // ---------------------------------------------------------------------

  // Scopes agents, performance rows, coaching rows, and dispute rows to a
  // single department, and computes both per-agent summaries and a combined
  // department-level aggregate. Shared by getDashboardOverview (per card)
  // and getDepartmentDashboard (full detail).
  function buildDepartmentScope(departmentId, agentData, performanceData, coachingData, disputeData) {
    var departmentAgents = agentData.rows.filter(function (row) {
      return toSafeString(getFieldValue(row, [FIELD_NAMES.departmentId])) === departmentId;
    });

    var performanceRows = [];
    var agentSummaries = departmentAgents.map(function (agentRow) {
      var agentId = toSafeString(getFieldValue(agentRow, [FIELD_NAMES.agentId]));
      var agentName = toSafeString(getFieldValue(agentRow, [FIELD_NAMES.name]));
      var agentPerformanceRows = filterRowsByAgentId(performanceData.rows, agentId);
      var agentCoachingRows = filterRowsByAgentId(coachingData.rows, agentId);
      var agentDisputeRows = filterRowsByAgentId(disputeData.rows, agentId);

      performanceRows = performanceRows.concat(agentPerformanceRows);

      // detailRows intentionally omitted: this scope only needs
      // overallAverage/totalAudits from the stream summary, never the
      // per-stream topFailedCriterion, so there's no reason to read
      // Weekly Review Detail again for every agent here.
      var streamSummary = computePerformanceByStream(agentPerformanceRows);
      var overallAverage = computeOverallAverage(streamSummary);
      var totalAudits = sumNumberOfAudits(agentPerformanceRows);

      return {
        agentId: agentId,
        name: agentName,
        overallAverage: overallAverage,
        totalAudits: totalAudits,
        coachingCount: agentCoachingRows.length,
        openDisputes: countOpenDisputes(agentDisputeRows)
      };
    });

    var aggregate = combineAggregates(agentSummaries.map(function (agentSummary) {
      return {
        averageScore: agentSummary.overallAverage,
        totalAgents: 1,
        totalAudits: agentSummary.totalAudits,
        totalCoachings: agentSummary.coachingCount,
        openDisputes: agentSummary.openDisputes
      };
    }));

    return {
      agentSummaries: agentSummaries,
      performanceRows: performanceRows,
      aggregate: aggregate
    };
  }

  // Combines a list of { averageScore, totalAgents, totalAudits,
  // totalCoachings, openDisputes } items (one per agent or one per
  // department) into a single rolled-up aggregate. averageScore is combined
  // as a weighted average (weighted by totalAudits); openDisputes stays null
  // only if every input was null (meaning "unknown" rather than "zero").
  function combineAggregates(items) {
    var totalAgents = items.reduce(function (sum, item) {
      return sum + (item.totalAgents || 0);
    }, 0);

    var totalAudits = items.reduce(function (sum, item) {
      return sum + (item.totalAudits || 0);
    }, 0);

    var totalCoachings = items.reduce(function (sum, item) {
      return sum + (item.totalCoachings || 0);
    }, 0);

    var disputeValues = items
      .map(function (item) {
        return item.openDisputes;
      })
      .filter(function (value) {
        return value !== null && value !== undefined;
      });
    var openDisputes = disputeValues.length
      ? disputeValues.reduce(function (sum, value) { return sum + value; }, 0)
      : null;

    var scoredItems = items.filter(function (item) {
      return typeof item.averageScore === 'number' && !isNaN(item.averageScore);
    });

    var averageScore = null;
    if (scoredItems.length) {
      var weightTotal = scoredItems.reduce(function (sum, item) {
        return sum + (item.totalAudits || 0);
      }, 0);

      if (weightTotal > 0) {
        var weightedSum = scoredItems.reduce(function (sum, item) {
          return sum + (item.averageScore * (item.totalAudits || 0));
        }, 0);
        averageScore = roundNumber(weightedSum / weightTotal, 2);
      } else {
        var simpleSum = scoredItems.reduce(function (sum, item) {
          return sum + item.averageScore;
        }, 0);
        averageScore = roundNumber(simpleSum / scoredItems.length, 2);
      }
    }

    return {
      averageScore: averageScore,
      totalAgents: totalAgents,
      totalAudits: totalAudits,
      totalCoachings: totalCoachings,
      openDisputes: openDisputes
    };
  }

  function sumNumberOfAudits(rows) {
    return rows.reduce(function (sum, row) {
      var value = toNumber(getFieldValue(row, [FIELD_NAMES.numberOfAudits]));
      return sum + (typeof value === 'number' && !isNaN(value) ? value : 0);
    }, 0);
  }

  // SINGLE SOURCE OF TRUTH for root-cause analytics. Reads Failed Criteria
  // directly from Weekly Review Detail rows only - Performance Log's
  // Primary/Secondary Root Cause columns are never read here or anywhere
  // else in the reporting pipeline. Each criterion is counted once per
  // audit (a detail row listing the same criterion twice is not double-
  // counted), then aggregated across every row provided. Returns every
  // criterion that occurred, sorted most frequent first - no artificial
  // cap, since a department should show every criterion that occurred.
  function computeFailedCriteriaAggregate(detailRows) {
    var counts = {};
    var displayLabels = {};

    detailRows.forEach(function (row) {
      var criteriaInRow = uniqueStrings(
        parseFailedCriteria(getFieldValue(row, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.failedCriteria))
      );

      criteriaInRow.forEach(function (criterion) {
        var key = normalizeHeader(criterion);
        counts[key] = (counts[key] || 0) + 1;
        if (!displayLabels[key]) {
          displayLabels[key] = criterion;
        }
      });
    });

    return Object.keys(counts)
      .map(function (key) {
        return { rootCause: displayLabels[key], count: counts[key] };
      })
      .sort(function (a, b) {
        return b.count - a.count;
      });
  }

  // Builds a { performanceId: true } lookup set from a list of Performance
  // Log rows - used to scope Weekly Review Detail rows to a department or
  // agent via the Performance ID foreign key, without ever reading that
  // row's root cause columns.
  function buildPerformanceIdSet(performanceRows) {
    var idSet = {};
    performanceRows.forEach(function (row) {
      var performanceId = toSafeString(getFieldValue(row, [FIELD_NAMES.performanceId]));
      if (performanceId) {
        idSet[performanceId] = true;
      }
    });
    return idSet;
  }

  // Filters Weekly Review Detail rows to those linked to a Performance ID
  // present in the given set.
  function filterDetailRowsByPerformanceIds(detailRows, performanceIdSet) {
    return detailRows.filter(function (detailRow) {
      var linkedPerformanceId = toSafeString(getFieldValue(detailRow, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.performanceId));
      return !!performanceIdSet[linkedPerformanceId];
    });
  }

  // Reads an entire log sheet (no agent filter) and enriches each record
  // with the corresponding agent's name for display in list-style pages.
  function getFullLogWithAgentNames(sheetName) {
    var data = readSheet(sheetName);
    var agentData = readSheet(SHEETS.agents);

    var records = data.rows.map(function (row) {
      var record = serializeRecord(data.headers, row);
      var agentId = toSafeString(getFieldValue(row, [FIELD_NAMES.agentId]));
      var agentRow = findRowByField(agentData.rows, FIELD_NAMES.agentId, agentId);
      record.agentName = agentRow ? toSafeString(getFieldValue(agentRow, [FIELD_NAMES.name])) : '';
      return record;
    });

    // Most recent first, using whichever date-like column is present.
    var decorated = records.map(function (record, index) {
      return { record: record, row: data.rows[index] };
    });
    decorated.sort(function (a, b) {
      var dateA = extractDateFromRow(a.row);
      var dateB = extractDateFromRow(b.row);
      if (dateA && dateB) {
        return dateB.getTime() - dateA.getTime();
      }
      if (dateA) { return -1; }
      if (dateB) { return 1; }
      return 0;
    });

    return {
      success: true,
      headers: data.headers,
      records: decorated.map(function (item) {
        return item.record;
      })
    };
  }

  // Counts coaching rows representing an outstanding follow-up action.
  // Uses "Follow-up Completed" and/or "Follow-up Date" if present; returns
  // null (meaning "unknown") if neither column exists, rather than guessing.
  function countOpenActions(rows) {
    if (!rows.length) {
      return 0;
    }

    var hasFollowUpDateColumn = rowsHaveHeader(rows, FIELD_NAMES.followUpDate);
    var hasCompletedColumn = rowsHaveHeader(rows, FIELD_NAMES.followUpCompleted);

    if (!hasFollowUpDateColumn && !hasCompletedColumn) {
      return null;
    }

    return rows.filter(function (row) {
      var hasFollowUpDate = hasFollowUpDateColumn &&
        !isEmptyValue(getFieldValue(row, [FIELD_NAMES.followUpDate]));

      if (hasCompletedColumn) {
        var isCompleted = isTruthyValue(getFieldValue(row, [FIELD_NAMES.followUpCompleted]));
        return hasFollowUpDate ? !isCompleted : false;
      }

      return hasFollowUpDate;
    }).length;
  }

  function rowsHaveHeader(rows, headerName) {
    var normalizedTarget = normalizeHeader(headerName);
    return rows.some(function (row) {
      return Object.keys(row).some(function (key) {
        return key.charAt(0) !== '_' && normalizeHeader(key) === normalizedTarget;
      });
    });
  }

  function mapAgentRow(row) {
    return {
      agentId: toSafeString(getFieldValue(row, [FIELD_NAMES.agentId])),
      name: toSafeString(getFieldValue(row, [FIELD_NAMES.name])),
      departmentId: toSafeString(getFieldValue(row, [FIELD_NAMES.departmentId])),
      supervisor: toSafeString(getFieldValue(row, [FIELD_NAMES.supervisor])),
      startDate: serializeValue(getFieldValue(row, [FIELD_NAMES.startDate])),
      status: toSafeString(getFieldValue(row, [FIELD_NAMES.status]))
    };
  }

  // ---------------------------------------------------------------------
  // Shared save logic (unchanged)
  // ---------------------------------------------------------------------

  function saveLogEntry(sheetName, label, payload, idConfig) {
    var data = readSheet(sheetName);
    var values = payload && payload.values ? payload.values : {};
    var agentId = toSafeString(payload && payload.agentId ? payload.agentId : getPayloadValue(values, FIELD_NAMES.agentId));
    var agentIdHeader = findHeader(data.headers, [FIELD_NAMES.agentId]);

    if (!data.headers.length) {
      throw new Error(sheetName + ' must contain a header row before data can be saved.');
    }

    if (!agentIdHeader) {
      throw new Error(sheetName + ' must contain an Agent ID column.');
    }

    if (!agentId) {
      throw new Error('Agent ID is required before saving to ' + sheetName + '.');
    }

    var agentRow = getAgentRowOrThrow(agentId);
    var agentName = toSafeString(getFieldValue(agentRow, [FIELD_NAMES.name]));
    var today = new Date();

    var generatedId = null;
    if (idConfig && findHeader(data.headers, [idConfig.header])) {
      generatedId = generateNextSequentialId(data.rows, [idConfig.header], idConfig.prefix, idConfig.padLength);
    }

    var hasUserEnteredValue = false;
    var rowToAppend = data.headers.map(function (header) {
      var isAgentIdColumn = normalizeHeader(header) === normalizeHeader(FIELD_NAMES.agentId);
      var isNameColumn = normalizeHeader(header) === normalizeHeader(FIELD_NAMES.name);
      var isAutoFillDate = isAutoFillDateHeader(header);
      var isGeneratedIdColumn = idConfig && generatedId !== null &&
        normalizeHeader(header) === normalizeHeader(idConfig.header);
      var isAutoFilled = isAgentIdColumn || isNameColumn || isAutoFillDate || isGeneratedIdColumn;
      var rawValue;

      if (isAgentIdColumn) {
        rawValue = agentId;
      } else if (isNameColumn) {
        rawValue = agentName;
      } else if (isAutoFillDate) {
        rawValue = today;
      } else if (isGeneratedIdColumn) {
        rawValue = generatedId;
      } else {
        rawValue = getPayloadValue(values, header);
      }

      if (!isEmptyValue(rawValue) && !isAutoFilled) {
        hasUserEnteredValue = true;
      }

      return coerceValueForSheet(header, rawValue);
    });

    if (!hasUserEnteredValue && data.headers.length > 1) {
      throw new Error('Enter at least one value before saving the ' + label.toLowerCase() + ' form.');
    }

    data.sheet.appendRow(rowToAppend);

    return {
      success: true,
      message: generatedId
        ? label + ' saved successfully (' + generatedId + ').'
        : label + ' saved successfully.'
    };
  }

  function getAgentRowOrThrow(agentId) {
    var agentData = readSheet(SHEETS.agents);
    var agentRow = findRowByField(agentData.rows, FIELD_NAMES.agentId, agentId);
    if (!agentRow) {
      throw new Error('The selected Agent ID does not exist in the Agents sheet.');
    }
    return agentRow;
  }

  function filterRowsByAgentId(rows, agentId) {
    return rows.filter(function (row) {
      return toSafeString(getFieldValue(row, [FIELD_NAMES.agentId])) === agentId;
    });
  }

  // detailRows (optional): Weekly Review Detail rows already scoped to this
  // agent, used only to derive each stream's top failed criterion straight
  // from Weekly Review Detail - Performance Log's Primary/Secondary Root
  // Cause columns are never read here.
  function computePerformanceByStream(rows, detailRows) {
    var scopedDetailRows = detailRows || [];

    return QA_STREAM_OPTIONS.map(function (streamName) {
      var streamRows = rows.filter(function (row) {
        return toSafeString(getFieldValue(row, [FIELD_NAMES.qaStream])) === streamName;
      });

      if (!streamRows.length) {
        return {
          qaStream: streamName,
          hasData: false
        };
      }

      var latestRow = streamRows.reduce(function (latest, row) {
        var latestDate = parseDate(getFieldValue(latest, [FIELD_NAMES.weekEnding]));
        var candidateDate = parseDate(getFieldValue(row, [FIELD_NAMES.weekEnding]));
        if (!latestDate) {
          return row;
        }
        if (candidateDate && candidateDate.getTime() > latestDate.getTime()) {
          return row;
        }
        return latest;
      });

      var latestPerformanceId = toSafeString(getFieldValue(latestRow, [FIELD_NAMES.performanceId]));
      var latestReviewDetailRows = scopedDetailRows.filter(function (detailRow) {
        return toSafeString(getFieldValue(detailRow, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.performanceId)) === latestPerformanceId;
      });
      var failedCriteriaSummary = computeFailedCriteriaAggregate(latestReviewDetailRows);

      return {
        qaStream: streamName,
        hasData: true,
        weekEnding: serializeValue(getFieldValue(latestRow, [FIELD_NAMES.weekEnding])),
        averageScore: toNumber(getFieldValue(latestRow, [FIELD_NAMES.averageScore])),
        numberOfAudits: toNumber(getFieldValue(latestRow, [FIELD_NAMES.numberOfAudits])),
        topFailedCriterion: failedCriteriaSummary.length ? failedCriteriaSummary[0].rootCause : ''
      };
    });
  }

  // Builds the extended Agent Profile fields. Every field is header-driven
  // and optional - if a column doesn't exist yet in the Agents sheet,
  // getFieldValue already returns '' gracefully, so this never breaks for
  // sheets that haven't added the new columns.
  function buildAgentProfileFields(agentRow) {
    return {
      employeeNumber: toSafeString(getFieldValue(agentRow, [FIELD_NAMES.employeeNumber])),
      teamLeader: toSafeString(getFieldValue(agentRow, [FIELD_NAMES.teamLeader])),
      role: toSafeString(getFieldValue(agentRow, [FIELD_NAMES.role])),
      email: toSafeString(getFieldValue(agentRow, [FIELD_NAMES.email])),
      phone: toSafeString(getFieldValue(agentRow, [FIELD_NAMES.phone])),
      location: toSafeString(getFieldValue(agentRow, [FIELD_NAMES.location])),
      languages: splitTagList(getFieldValue(agentRow, [FIELD_NAMES.languages])),
      skills: splitTagList(getFieldValue(agentRow, [FIELD_NAMES.skills])),
      certifications: splitTagList(getFieldValue(agentRow, [FIELD_NAMES.certifications])),
      tenureLabel: computeTenureLabel(getFieldValue(agentRow, [FIELD_NAMES.startDate]))
    };
  }

  // Splits a comma-separated cell (e.g. "Spanish, French") into a clean
  // array. Used for Languages/Skills/Certifications, which are free-text
  // list cells rather than single values.
  function splitTagList(rawValue) {
    return toSafeString(rawValue)
      .split(',')
      .map(function (value) { return value.trim(); })
      .filter(function (value) { return value; });
  }

  function computeTenureLabel(startDateValue) {
    var startDate = parseDate(startDateValue);
    if (!startDate) {
      return '';
    }

    var today = new Date();
    var totalMonths = (today.getFullYear() - startDate.getFullYear()) * 12 + (today.getMonth() - startDate.getMonth());
    if (today.getDate() < startDate.getDate()) {
      totalMonths -= 1;
    }
    if (totalMonths < 0) {
      totalMonths = 0;
    }

    var years = Math.floor(totalMonths / 12);
    var months = totalMonths % 12;

    if (years === 0 && months === 0) {
      return 'Less than a month';
    }
    if (years === 0) {
      return months + (months === 1 ? ' month' : ' months');
    }
    if (months === 0) {
      return years + (years === 1 ? ' year' : ' years');
    }
    return years + (years === 1 ? ' yr ' : ' yrs ') + months + (months === 1 ? ' mo' : ' mos');
  }

  // Rolls this agent's Performance Log rows (every QA Stream, every week)
  // into weekly/monthly/quarterly/yearly periods. Each period's score is a
  // weighted average across whatever weeks/streams fall in it (weighted by
  // Number of Audits), so a period with more reviewed audits counts more.
  // Each entry also gets a 3-period moving average and an improvement %
  // versus the immediately preceding period.
  function buildPerformanceTimeline(performanceRows) {
    var points = performanceRows
      .map(function (row) {
        return {
          date: parseDate(getFieldValue(row, [FIELD_NAMES.weekEnding])),
          score: toNumber(getFieldValue(row, [FIELD_NAMES.averageScore])),
          audits: toNumber(getFieldValue(row, [FIELD_NAMES.numberOfAudits])) || 0
        };
      })
      .filter(function (point) {
        return point.date && typeof point.score === 'number' && !isNaN(point.score);
      });

    return {
      weekly: buildTimelinePeriods(points, getWeekPeriodKey, TIMELINE_LIMITS.weekly),
      monthly: buildTimelinePeriods(points, getMonthPeriodKey, TIMELINE_LIMITS.monthly),
      quarterly: buildTimelinePeriods(points, getQuarterPeriodKey, TIMELINE_LIMITS.quarterly),
      yearly: buildTimelinePeriods(points, getYearPeriodKey, TIMELINE_LIMITS.yearly)
    };
  }

  function buildTimelinePeriods(points, periodKeyFn, limit) {
    var periods = {};
    points.forEach(function (point) {
      var key = periodKeyFn(point.date);
      if (!periods[key]) {
        periods[key] = { periodLabel: key, sortDate: point.date, totalWeightedScore: 0, totalAudits: 0, rowCount: 0 };
      }
      var weight = point.audits > 0 ? point.audits : 1;
      periods[key].totalWeightedScore += point.score * weight;
      periods[key].totalAudits += weight;
      periods[key].rowCount += 1;
      if (point.date.getTime() > periods[key].sortDate.getTime()) {
        periods[key].sortDate = point.date;
      }
    });

    var ordered = Object.keys(periods)
      .map(function (key) { return periods[key]; })
      .sort(function (a, b) { return a.sortDate.getTime() - b.sortDate.getTime(); })
      .map(function (period) {
        return {
          periodLabel: period.periodLabel,
          averageScore: roundNumber(period.totalWeightedScore / period.totalAudits, 2),
          auditCount: period.totalAudits
        };
      });

    var withTrend = ordered.map(function (period, index) {
      var windowStart = Math.max(0, index - 2);
      var window = ordered.slice(windowStart, index + 1);
      var movingAverage = roundNumber(
        window.reduce(function (sum, p) { return sum + p.averageScore; }, 0) / window.length,
        2
      );

      var previous = index > 0 ? ordered[index - 1] : null;
      var improvementPct = previous && previous.averageScore
        ? roundNumber(((period.averageScore - previous.averageScore) / previous.averageScore) * 100, 1)
        : null;

      return {
        periodLabel: period.periodLabel,
        averageScore: period.averageScore,
        auditCount: period.auditCount,
        movingAverage: movingAverage,
        improvementPct: improvementPct
      };
    });

    return withTrend.slice(Math.max(0, withTrend.length - limit));
  }

  function getWeekPeriodKey(date) {
    return formatDate(date);
  }

  // Calendar-week key for audit-level Search ("Week 30"), distinct from
  // getWeekPeriodKey() above (which keys by exact date, correct for the
  // Performance Timeline where each row already IS one week's snapshot, but
  // wrong here - multiple audits sharing a calendar week but not an exact
  // date need to match the same "week"). Simplified (day-of-year / 7), not
  // strict ISO-8601 week numbering, but consistent everywhere it's used.
  function getIsoWeekKey(date) {
    var startOfYear = new Date(date.getFullYear(), 0, 1);
    var dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000) + 1;
    var weekNumber = Math.ceil(dayOfYear / 7);
    return date.getFullYear() + '-W' + padNumber(weekNumber, 2);
  }

  function getMonthPeriodKey(date) {
    return date.getFullYear() + '-' + padNumber(date.getMonth() + 1, 2);
  }

  function getQuarterPeriodKey(date) {
    var quarter = Math.floor(date.getMonth() / 3) + 1;
    return date.getFullYear() + ' Q' + quarter;
  }

  function getYearPeriodKey(date) {
    return String(date.getFullYear());
  }

  // Evidence-based Strengths / Development Areas, derived ONLY from this
  // agent's Weekly Review Detail rows (the same source of truth as all
  // other root cause analytics - never Performance Log). A criterion only
  // counts as a "strength" once there's enough audit volume behind it
  // (MIN_AUDITS_FOR_STRENGTH) to avoid claiming a strength from too little
  // evidence. Development areas include a simple first-half-vs-second-half
  // trend rather than a fabricated behavioral label.
  function computeAgentCriteriaAnalysis(agentDetailRows, scorecardCriteria) {
    var totalAuditsReviewed = agentDetailRows.length;
    var coachingTipByName = {};
    scorecardCriteria.forEach(function (criterion) {
      coachingTipByName[normalizeHeader(criterion.name)] = criterion.coachingTip;
    });

    var rowsWithParsedDate = agentDetailRows.map(function (row) {
      return {
        criteria: uniqueStrings(parseFailedCriteria(getFieldValue(row, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.failedCriteria))),
        date: parseDate(getFieldValue(row, WEEKLY_REVIEW_DETAIL_HEADER_ALIASES.auditDate))
      };
    });

    var failureCounts = {};
    var displayLabels = {};
    rowsWithParsedDate.forEach(function (row) {
      row.criteria.forEach(function (criterion) {
        var key = normalizeHeader(criterion);
        failureCounts[key] = (failureCounts[key] || 0) + 1;
        if (!displayLabels[key]) {
          displayLabels[key] = criterion;
        }
      });
    });

    // Strengths: every scorecard criterion this agent has never (or
    // essentially never) failed, provided there's enough audit volume to
    // say so with confidence.
    var strengths = [];
    if (totalAuditsReviewed >= MIN_AUDITS_FOR_STRENGTH) {
      scorecardCriteria.forEach(function (criterion) {
        var key = normalizeHeader(criterion.name);
        var failureCount = failureCounts[key] || 0;
        if (failureCount === 0) {
          strengths.push({
            criterion: criterion.name,
            auditCount: totalAuditsReviewed,
            note: 'No failures across ' + totalAuditsReviewed + ' audits reviewed'
          });
        }
      });
      strengths.sort(function (a, b) { return b.auditCount - a.auditCount; });
    }

    // Development areas: every criterion that WAS cited, with a simple
    // trend (first half of this agent's audit history vs. second half) and
    // the last date it occurred.
    var sortedRows = rowsWithParsedDate.filter(function (row) { return row.date; })
      .sort(function (a, b) { return a.date.getTime() - b.date.getTime(); });
    var midpoint = Math.floor(sortedRows.length / 2);
    var firstHalf = sortedRows.slice(0, midpoint);
    var secondHalf = sortedRows.slice(midpoint);

    var developmentAreas = Object.keys(failureCounts).map(function (key) {
      var criterionName = displayLabels[key];
      var lastOccurrence = null;
      rowsWithParsedDate.forEach(function (row) {
        if (row.date && row.criteria.some(function (c) { return normalizeHeader(c) === key; })) {
          if (!lastOccurrence || row.date.getTime() > lastOccurrence.getTime()) {
            lastOccurrence = row.date;
          }
        }
      });

      var firstHalfCount = firstHalf.filter(function (row) {
        return row.criteria.some(function (c) { return normalizeHeader(c) === key; });
      }).length;
      var secondHalfCount = secondHalf.filter(function (row) {
        return row.criteria.some(function (c) { return normalizeHeader(c) === key; });
      }).length;

      var trend = 'Stable';
      if (firstHalf.length && secondHalf.length) {
        var firstRate = firstHalfCount / firstHalf.length;
        var secondRate = secondHalfCount / secondHalf.length;
        if (secondRate > firstRate) { trend = 'Increasing'; }
        else if (secondRate < firstRate) { trend = 'Decreasing'; }
      } else {
        trend = 'Insufficient data';
      }

      return {
        criterion: criterionName,
        count: failureCounts[key],
        trend: trend,
        lastOccurrence: lastOccurrence ? formatDate(lastOccurrence) : '',
        coachingTip: coachingTipByName[key] || ''
      };
    }).sort(function (a, b) { return b.count - a.count; });

    return {
      totalAuditsReviewed: totalAuditsReviewed,
      strengths: strengths,
      developmentAreas: developmentAreas
    };
  }

  function computeOverallAverage(performanceByStream) {
    var streamsWithScores = performanceByStream.filter(function (stream) {
      return stream.hasData && typeof stream.averageScore === 'number' && !isNaN(stream.averageScore);
    });

    if (!streamsWithScores.length) {
      return null;
    }

    var totalWeight = streamsWithScores.reduce(function (sum, stream) {
      return sum + (typeof stream.numberOfAudits === 'number' && !isNaN(stream.numberOfAudits) ? stream.numberOfAudits : 0);
    }, 0);

    if (totalWeight > 0) {
      var weightedSum = streamsWithScores.reduce(function (sum, stream) {
        var weight = typeof stream.numberOfAudits === 'number' && !isNaN(stream.numberOfAudits) ? stream.numberOfAudits : 0;
        return sum + (stream.averageScore * weight);
      }, 0);
      return roundNumber(weightedSum / totalWeight, 2);
    }

    var simpleSum = streamsWithScores.reduce(function (sum, stream) {
      return sum + stream.averageScore;
    }, 0);
    return roundNumber(simpleSum / streamsWithScores.length, 2);
  }

  function countOpenDisputes(rows) {
    if (!rows.length) {
      return 0;
    }

    var statusHeaderCandidates = [FIELD_NAMES.disputeStatus, FIELD_NAMES.status];
    var hasStatusColumn = rows.some(function (row) {
      return Object.keys(row).some(function (key) {
        return key.charAt(0) !== '_' &&
          statusHeaderCandidates.map(normalizeHeader).indexOf(normalizeHeader(key)) !== -1;
      });
    });

    if (!hasStatusColumn) {
      return null;
    }

    return rows.filter(function (row) {
      var statusValue = toSafeString(getFieldValue(row, statusHeaderCandidates)).toLowerCase();
      return RESOLVED_DISPUTE_STATUSES.indexOf(statusValue) === -1;
    }).length;
  }

  function generateNextSequentialId(rows, headerCandidates, prefix, padLength) {
    var maxNumber = computeMaxSequentialNumber(rows, headerCandidates);
    return prefix + padNumber(maxNumber + 1, padLength);
  }

  function computeMaxSequentialNumber(rows, headerCandidates) {
    var maxNumber = 0;

    rows.forEach(function (row) {
      var rawValue = toSafeString(getFieldValue(row, headerCandidates));
      var match = rawValue.match(/(\d+)\s*$/);
      if (match) {
        var numericPart = parseInt(match[1], 10);
        if (!isNaN(numericPart) && numericPart > maxNumber) {
          maxNumber = numericPart;
        }
      }
    });

    return maxNumber;
  }

  function padNumber(number, length) {
    var numberString = String(number);
    while (numberString.length < length) {
      numberString = '0' + numberString;
    }
    return numberString;
  }

  function getMostRecentDateLabel(rows) {
    if (!rows.length) {
      return 'None';
    }

    var latestDate = null;
    rows.forEach(function (row) {
      var candidateDate = extractDateFromRow(row);
      if (candidateDate && (!latestDate || candidateDate.getTime() > latestDate.getTime())) {
        latestDate = candidateDate;
      }
    });

    if (latestDate) {
      return formatDate(latestDate);
    }

    return 'Recorded';
  }

  function readSheet(sheetName) {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error('Sheet not found: ' + sheetName);
    }

    var lastColumn = sheet.getLastColumn();
    if (!lastColumn) {
      return {
        sheet: sheet,
        headers: [],
        rows: []
      };
    }

    var lastRow = Math.max(sheet.getLastRow(), 1);
    var values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
    var headers = values[0].map(function (header) {
      return toSafeString(header);
    });

    var rows = [];
    for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
      var rowObject = { _rowNumber: rowIndex + 1 };
      for (var columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
        var header = headers[columnIndex];
        if (header) {
          rowObject[header] = values[rowIndex][columnIndex];
        }
      }
      rows.push(rowObject);
    }

    return {
      sheet: sheet,
      headers: headers,
      rows: rows
    };
  }

  function isAutoManagedHeader(header) {
    return normalizeHeader(header) === normalizeHeader(FIELD_NAMES.agentId) ||
      normalizeHeader(header) === normalizeHeader(FIELD_NAMES.name) ||
      isAutoFillDateHeader(header);
  }

  function isAutoFillDateHeader(header) {
    return normalizeHeader(header) === normalizeHeader(FIELD_NAMES.date);
  }

  function buildFormDefinition(headers, hiddenHeaderNames) {
    var normalizedHidden = (hiddenHeaderNames || []).map(normalizeHeader);

    return {
      headers: headers,
      fields: headers
        .filter(function (header) {
          return !isAutoManagedHeader(header) &&
            normalizedHidden.indexOf(normalizeHeader(header)) === -1;
        })
        .map(function (header) {
          var type = inferInputType(header);
          var field = {
            name: header,
            label: header,
            type: type,
            readOnly: false
          };

          if (type === 'select') {
            field.options = getSelectOptions(header);
          }

          return field;
        })
    };
  }

  function inferInputType(header) {
    if (normalizeHeader(header) === normalizeHeader(FIELD_NAMES.qaStream)) {
      return 'select';
    }

    if (/date/i.test(header)) {
      return 'date';
    }

    if (/score|points|rating|audits/i.test(header)) {
      return 'number';
    }

    if (/notes?|comments?|reason|summary|details?|description|outcome|action/i.test(header)) {
      return 'textarea';
    }

    return 'text';
  }

  function getSelectOptions(header) {
    if (normalizeHeader(header) === normalizeHeader(FIELD_NAMES.qaStream)) {
      return QA_STREAM_OPTIONS;
    }
    return [];
  }

  function findRowByField(rows, fieldName, expectedValue) {
    var normalizedExpected = toSafeString(expectedValue);
    for (var i = 0; i < rows.length; i += 1) {
      if (toSafeString(getFieldValue(rows[i], [fieldName])) === normalizedExpected) {
        return rows[i];
      }
    }
    return null;
  }

  function findHeader(headers, candidates) {
    var normalizedCandidates = candidates.map(normalizeHeader);
    for (var i = 0; i < headers.length; i += 1) {
      if (normalizedCandidates.indexOf(normalizeHeader(headers[i])) !== -1) {
        return headers[i];
      }
    }
    return '';
  }

  function getFieldValue(row, candidates) {
    var candidateList = Array.isArray(candidates) ? candidates : [candidates];
    var normalizedCandidates = candidateList.map(normalizeHeader);
    var keys = Object.keys(row);

    for (var i = 0; i < keys.length; i += 1) {
      if (keys[i].charAt(0) === '_') {
        continue;
      }

      if (normalizedCandidates.indexOf(normalizeHeader(keys[i])) !== -1) {
        return row[keys[i]];
      }
    }

    return '';
  }

  function getPayloadValue(payload, header) {
    if (!payload) {
      return '';
    }

    if (Object.prototype.hasOwnProperty.call(payload, header)) {
      return payload[header];
    }

    var normalizedHeader = normalizeHeader(header);
    var keys = Object.keys(payload);
    for (var i = 0; i < keys.length; i += 1) {
      if (normalizeHeader(keys[i]) === normalizedHeader) {
        return payload[keys[i]];
      }
    }

    return '';
  }

  function serializeRecords(headers, rows) {
    return rows.map(function (row) {
      return serializeRecord(headers, row);
    });
  }

  function serializeRecord(headers, row) {
    var serialized = {};
    headers.forEach(function (header) {
      serialized[header] = serializeValue(row[header]);
    });
    return serialized;
  }

  function serializeValue(value) {
    if (value instanceof Date) {
      return formatDate(value);
    }

    if (value === null || value === undefined) {
      return '';
    }

    return value;
  }

  function coerceValueForSheet(header, value) {
    if (isEmptyValue(value)) {
      return '';
    }

    if (/date/i.test(header)) {
      var parsedDate = parseDate(value);
      if (parsedDate) {
        return parsedDate;
      }
    }

    if (/score|points|rating|audits/i.test(header)) {
      var numericValue = toNumber(value);
      if (typeof numericValue === 'number' && !isNaN(numericValue)) {
        return numericValue;
      }
    }

    return value;
  }

  function extractDateFromRow(row) {
    var keys = Object.keys(row).filter(function (key) {
      return key.charAt(0) !== '_';
    });

    for (var i = 0; i < keys.length; i += 1) {
      if (/date|time/i.test(keys[i])) {
        var preferredDate = parseDate(row[keys[i]]);
        if (preferredDate) {
          return preferredDate;
        }
      }
    }

    for (var j = 0; j < keys.length; j += 1) {
      var fallbackDate = parseDate(row[keys[j]]);
      if (fallbackDate) {
        return fallbackDate;
      }
    }

    return null;
  }

  function parseDate(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      var parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return null;
  }

  function formatDate(date) {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  function toNumber(value) {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      var cleanedValue = value.replace(/,/g, '').trim();
      if (cleanedValue) {
        var parsedValue = Number(cleanedValue);
        if (!isNaN(parsedValue)) {
          return parsedValue;
        }
      }
    }

    return null;
  }

  function roundNumber(value, decimals) {
    var factor = Math.pow(10, decimals || 0);
    return Math.round(value * factor) / factor;
  }

  function isTruthyValue(value) {
    if (typeof value === 'boolean') {
      return value;
    }

    var normalized = toSafeString(value).toLowerCase();
    return ['true', 'yes', 'y', '1', 'active'].indexOf(normalized) !== -1;
  }

  function isEmptyValue(value) {
    return value === null || value === undefined || toSafeString(value) === '';
  }

  function toSafeString(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  function normalizeHeader(value) {
    return toSafeString(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // Returns true if `header` normalizes to match any of the given candidate
  // header spellings. Used on the write path (building a row to append) so
  // a sheet's actual header text doesn't have to exactly match FIELD_NAMES.
  function headerMatchesAny(header, candidates) {
    var normalizedHeader = normalizeHeader(header);
    return candidates.some(function (candidate) {
      return normalizeHeader(candidate) === normalizedHeader;
    });
  }

  return {
    getInitialData: getInitialData,
    getAgentsByDepartment: getAgentsByDepartment,
    getAgentDashboard: getAgentDashboard,
    saveCoaching: saveCoaching,
    savePerformance: savePerformance,
    saveDispute: saveDispute,
    getDashboardOverview: getDashboardOverview,
    getDepartmentDashboard: getDepartmentDashboard,
    getRootCauseDrilldown: getRootCauseDrilldown,
    getAllCoachingRecords: getAllCoachingRecords,
    getAllPerformanceRecords: getAllPerformanceRecords,
    getAllDisputeRecords: getAllDisputeRecords,
    getScorecardCriteria: getScorecardCriteria,
    getScorecardTemplatesForDepartment: getScorecardTemplatesForDepartment,
    getAllScorecardTemplates: getAllScorecardTemplates,
    saveScorecardTemplate: saveScorecardTemplate,
    updateScorecardTemplate: updateScorecardTemplate,
    getSuggestedAuditScore: getSuggestedAuditScore,
    getScorecardCriteriaForBuilder: getScorecardCriteriaForBuilder,
    saveScorecardCriterion: saveScorecardCriterion,
    updateScorecardCriterion: updateScorecardCriterion,
    reorderScorecardCriteria: reorderScorecardCriteria,
    duplicateScorecardTemplate: duplicateScorecardTemplate,
    createNewTemplateVersion: createNewTemplateVersion,
    searchAudits: searchAudits,
    getSearchFilterOptions: getSearchFilterOptions,
    generateReport: generateReport,
    saveWeeklyReview: saveWeeklyReview
  };
})();
