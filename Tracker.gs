var Tracker = (function () {
  var SHEETS = {
    departments: 'Departments',
    agents: 'Agents',
    coachingLog: 'Coaching Log',
    performanceLog: 'Performance Log',
    disputeLog: 'Dispute Log'
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
    followUpCompleted: 'Follow-up Completed'
  };

  var QA_STREAM_OPTIONS = ['Customer Voice', 'Customer Text', 'Clerk Support', 'D2C'];

  var RESOLVED_DISPUTE_STATUSES = ['resolved', 'closed', 'completed'];

  var TOP_LIST_SIZE = 3;
  var TOP_ROOT_CAUSE_SIZE = 5;

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

    var performanceByStream = computePerformanceByStream(performanceRows);
    var overallAveragePerformance = computeOverallAverage(performanceByStream);
    var openDisputeCount = countOpenDisputes(disputeRows);
    var openActionCount = countOpenActions(coachingRows);

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
        details: serializeRecord(agentData.headers, agentRow)
      },
      summary: {
        coachingCount: coachingRows.length,
        overallAveragePerformance: overallAveragePerformance,
        performanceByStream: performanceByStream,
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

    var topRootCauses = computeTopRootCauses(scoped.performanceRows, TOP_ROOT_CAUSE_SIZE);

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

  // Frequency count of Primary Root Cause across a set of performance rows,
  // returned as the top N { rootCause, count } entries, most frequent first.
  function computeTopRootCauses(performanceRows, limit) {
    var counts = {};
    performanceRows.forEach(function (row) {
      var rootCause = toSafeString(getFieldValue(row, [FIELD_NAMES.primaryRootCause]));
      if (!rootCause) {
        return;
      }
      counts[rootCause] = (counts[rootCause] || 0) + 1;
    });

    return Object.keys(counts)
      .map(function (rootCause) {
        return { rootCause: rootCause, count: counts[rootCause] };
      })
      .sort(function (a, b) {
        return b.count - a.count;
      })
      .slice(0, limit);
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

  function computePerformanceByStream(rows) {
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

      return {
        qaStream: streamName,
        hasData: true,
        weekEnding: serializeValue(getFieldValue(latestRow, [FIELD_NAMES.weekEnding])),
        averageScore: toNumber(getFieldValue(latestRow, [FIELD_NAMES.averageScore])),
        numberOfAudits: toNumber(getFieldValue(latestRow, [FIELD_NAMES.numberOfAudits])),
        primaryRootCause: toSafeString(getFieldValue(latestRow, [FIELD_NAMES.primaryRootCause]))
      };
    });
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

    return prefix + padNumber(maxNumber + 1, padLength);
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

  return {
    getInitialData: getInitialData,
    getAgentsByDepartment: getAgentsByDepartment,
    getAgentDashboard: getAgentDashboard,
    saveCoaching: saveCoaching,
    savePerformance: savePerformance,
    saveDispute: saveDispute,
    getDashboardOverview: getDashboardOverview,
    getDepartmentDashboard: getDepartmentDashboard,
    getAllCoachingRecords: getAllCoachingRecords,
    getAllPerformanceRecords: getAllPerformanceRecords,
    getAllDisputeRecords: getAllDisputeRecords
  };
})();
