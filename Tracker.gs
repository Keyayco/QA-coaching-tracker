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
    disputeStatus: 'Dispute Status'
  };

  var QA_STREAM_OPTIONS = ['Customer Voice', 'Customer Text', 'Clerk Support', 'D2C'];

  var RESOLVED_DISPUTE_STATUSES = ['resolved', 'closed', 'completed'];

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
        // Agent ID, Name, and the exact "Date" column are auto-managed
        // server-side and hidden automatically. Coaching/Dispute/Performance
        // IDs are system-generated, so they're hidden explicitly here.
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
        return {
          agentId: toSafeString(getFieldValue(row, [FIELD_NAMES.agentId])),
          name: toSafeString(getFieldValue(row, [FIELD_NAMES.name])),
          departmentId: toSafeString(getFieldValue(row, [FIELD_NAMES.departmentId])),
          supervisor: toSafeString(getFieldValue(row, [FIELD_NAMES.supervisor])),
          startDate: serializeValue(getFieldValue(row, [FIELD_NAMES.startDate])),
          status: toSafeString(getFieldValue(row, [FIELD_NAMES.status]))
        };
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

    // Each log is read once per request, then filtered in memory for the selected agent.
    var coachingRows = filterRowsByAgentId(coachingData.rows, requestedAgentId);
    var performanceRows = filterRowsByAgentId(performanceData.rows, requestedAgentId);
    var disputeRows = filterRowsByAgentId(disputeData.rows, requestedAgentId);

    var performanceByStream = computePerformanceByStream(performanceRows);
    var overallAveragePerformance = computeOverallAverage(performanceByStream);
    var openDisputeCount = countOpenDisputes(disputeRows);

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
        openDisputeCount: openDisputeCount
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

  // idConfig is optional: { header, prefix, padLength }. When provided, the
  // matching column is always system-generated and never taken from the client.
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
    // Build the append row from the live header row so column order is never hardcoded.
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

  // Groups performance rows by QA Stream and returns the most recent
  // (by Week Ending) snapshot for each of the four fixed streams, so the
  // dashboard can always render all streams even if some have no data yet.
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

  // Weighted average of each stream's latest Average Score, weighted by
  // Number of Audits. Falls back to a simple average if weights are missing.
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

  // Counts disputes not marked resolved/closed. Looks for a "Dispute Status"
  // or "Status" column; returns null (meaning "unknown") if neither exists,
  // rather than guessing.
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

  // Finds the highest existing numeric suffix for the given ID column across
  // all rows, and returns the next ID as prefix + zero-padded(number + 1).
  // If no existing IDs are found, generation starts at 1.
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

  // Any header the server fills in automatically and that the user should
  // never see or edit: Agent ID, Name, and the exact "Date" column (not
  // "Follow-up Date", "Week Ending", or any other date-like header).
  function isAutoManagedHeader(header) {
    return normalizeHeader(header) === normalizeHeader(FIELD_NAMES.agentId) ||
      normalizeHeader(header) === normalizeHeader(FIELD_NAMES.name) ||
      isAutoFillDateHeader(header);
  }

  function isAutoFillDateHeader(header) {
    return normalizeHeader(header) === normalizeHeader(FIELD_NAMES.date);
  }

  // hiddenHeaderNames (optional): additional headers to exclude from the
  // editable "fields" list (used for system-generated ID columns). Headers
  // matching isAutoManagedHeader are always hidden. All headers remain in
  // "headers" so history tables still display every column.
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

    if (/score|points|rating/i.test(header)) {
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
    saveDispute: saveDispute
  };
})();
