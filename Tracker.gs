var Tracker = (function () {
  var SHEETS = {
    departments: 'Departments',
    agents: 'Agents',
    coachingLog: 'Coaching Log',
    performanceLog: 'Performance Log',
    disputeLog: 'Dispute Log',
    scorecardCriteria: 'Scorecard Criteria',
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
    certifications: 'Certifications'
  };

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

    var scorecardCriteria = getScorecardCriteria().criteria;
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

  function getScorecardCriteria() {
    var criteriaData = readSheet(SHEETS.scorecardCriteria);
    var criteria = criteriaData.rows
      .map(function (row) {
        return {
          name: toSafeString(getFieldValue(row, [FIELD_NAMES.criterionName])),
          weight: toNumber(getFieldValue(row, [FIELD_NAMES.criterionWeight])) || 0,
          coachingTip: toSafeString(getFieldValue(row, [FIELD_NAMES.coachingTip]))
        };
      })
      .filter(function (criterion) {
        return criterion.name;
      })
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });

    return {
      success: true,
      criteria: criteria
    };
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
    getScorecardCriteria().criteria.forEach(function (criterion) {
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
    saveWeeklyReview: saveWeeklyReview
  };
})();
