/**
 * VMS-Sync: Background Service Worker (v2.0.0)
 * Dual OMS Support (V1 oms.elitesecom.ai & V2 my.elitesecom.ai)
 * Auto-Login & Session Auto-Recovery
 * Live Google Sheet Sync
 */

const DEFAULT_V2_URL = "https://my.elitesecom.ai/api/scanorders/pickup/pickup_scan";
const DEFAULT_V1_URL = "https://oms.elitesecom.ai/api/pickup-scan";

const RULE_ID_V2 = 101;
const RULE_ID_V1 = 102;

// Setup declarativeNetRequest rules for both V1 and V2
async function setupNetRules() {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [RULE_ID_V2, RULE_ID_V1],
      addRules: [
        {
          id: RULE_ID_V2,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              { header: "origin", operation: "set", value: "https://my.elitesecom.ai" },
              { header: "referer", operation: "set", value: "https://my.elitesecom.ai/scanorders/pickup-entry" }
            ]
          },
          condition: {
            urlFilter: "||my.elitesecom.ai/api/*",
            resourceTypes: ["xmlhttprequest", "other"]
          }
        },
        {
          id: RULE_ID_V1,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              { header: "origin", operation: "set", value: "https://oms.elitesecom.ai" },
              { header: "referer", operation: "set", value: "https://oms.elitesecom.ai/scanorders/pickup-entry" }
            ]
          },
          condition: {
            urlFilter: "||oms.elitesecom.ai/api/*",
            resourceTypes: ["xmlhttprequest", "other"]
          }
        }
      ]
    });
    console.log("[VMS-Sync] Net rules configured for V1 & V2");
  } catch (err) {
    console.warn("[VMS-Sync] Net rules warning:", err);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await setupNetRules();
  const existing = await chrome.storage.local.get([
    "eliteUrl", "syncEnabled", "soundEnabled", "soundVolume", "courier",
    "omsPriority", "autoLoginEnabled", "v1LoginEmail", "v1LoginPassword",
    "v2LoginEmail", "v2LoginPassword", "sheetSyncEnabled", "sheetUrl"
  ]);

  await chrome.storage.local.set({
    eliteUrl: existing.eliteUrl || DEFAULT_V2_URL,
    syncEnabled: existing.syncEnabled !== undefined ? existing.syncEnabled : true,
    soundEnabled: existing.soundEnabled !== undefined ? existing.soundEnabled : true,
    soundVolume: existing.soundVolume !== undefined ? existing.soundVolume : 100,
    courier: existing.courier || "all",
    omsPriority: existing.omsPriority || "auto_v2_first", // auto_v2_first | auto_v1_first | only_v2 | only_v1
    autoLoginEnabled: existing.autoLoginEnabled !== undefined ? existing.autoLoginEnabled : true,
    v1LoginEmail: existing.v1LoginEmail || "",
    v1LoginPassword: existing.v1LoginPassword || "",
    v2LoginEmail: existing.v2LoginEmail || "",
    v2LoginPassword: existing.v2LoginPassword || "",
    sheetSyncEnabled: existing.sheetSyncEnabled !== undefined ? existing.sheetSyncEnabled : false,
    sheetUrl: existing.sheetUrl || "",
    todayDate: getTodayDateString(),
    todaySuccess: 0,
    todayFailed: 0,
    v1_logged_in: false,
    v2_logged_in: false,
    scanLogs: []
  });
});

chrome.runtime.onStartup.addListener(() => {
  setupNetRules();
});

function getTodayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function checkAndResetDailyStats() {
  const today = getTodayDateString();
  const data = await chrome.storage.local.get(["todayDate"]);
  if (data.todayDate !== today) {
    await chrome.storage.local.set({
      todayDate: today,
      todaySuccess: 0,
      todayFailed: 0
    });
  }
}

// Session expiration detectors
function isV1SessionExpired(status, text, data) {
  if (status === 401 || status === 403) return true;
  if (text && text.includes('<html') && text.toLowerCase().includes('login')) return true;
  if (data) {
    if (data.status === 401 || data.status === 403 || data.status_code === 401 || data.status_code === 403) return true;
    const msg = String(data.message || data.error || (data.data && data.data.message) || "").toLowerCase();
    if (msg.includes('cookie') || msg.includes('session') || msg.includes('login') || msg.includes('auth')) return true;
  }
  return false;
}

function isV2SessionExpired(status, text, data) {
  if (status === 401 || status === 403) return true;
  if (text && text.includes('<html') && text.toLowerCase().includes('login')) return true;
  if (data) {
    if (data.status === 401 || data.status === 403) return true;
    const msg = String(data.error || data.message || "").toLowerCase();
    if (msg.includes('unauth') || msg.includes('not authenticated') || msg.includes('login required')) return true;
  }
  return false;
}

// Auto-Login Helpers
async function performV1Login(email, password) {
  if (!email || !password) return { success: false, error: "Missing V1 email or password" };
  try {
    const res = await fetch("https://oms.elitesecom.ai/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: email, password: password })
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) {}
    const isSuccess = res.ok && (!data || data.status_code === 200 || data.success === true || !data.error);
    if (isSuccess) {
      chrome.storage.local.set({ v1_logged_in: true });
      return { success: true, message: "V1 Login Successful", data };
    }
    return { success: false, error: (data && (data.message || data.error)) || `V1 Login Failed (HTTP ${res.status})` };
  } catch (err) {
    return { success: false, error: "V1 Login Network Error: " + err.message };
  }
}

async function performV2Login(email, password) {
  if (!email || !password) return { success: false, error: "Missing V2 email or password" };
  try {
    const res = await fetch("https://my.elitesecom.ai/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ login: email, email: email, password: password })
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) {}
    const isSuccess = res.ok && (!data || (data.status !== "error" && data.success !== false && !data.error));
    if (isSuccess) {
      chrome.storage.local.set({ v2_logged_in: true });
      return { success: true, message: "V2 Login Successful", data };
    }
    return { success: false, error: (data && (data.message || data.error)) || `V2 Login Failed (HTTP ${res.status})` };
  } catch (err) {
    return { success: false, error: "V2 Login Network Error: " + err.message };
  }
}

// Session Check for Both V1 and V2
async function checkOmsSessions() {
  const [v2Result, v1Result] = await Promise.allSettled([
    // Check V2
    fetch(DEFAULT_V2_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        awbNumber: "__PING_CHECK__",
        location_key: [],
        courier: "all",
        marketplace: []
      })
    }).then(async (res) => {
      let data = null;
      let text = "";
      try {
        text = await res.text();
        data = JSON.parse(text);
      } catch (e) {}
      const expired = isV2SessionExpired(res.status, text, data) || (res.redirected && res.url && res.url.includes("login"));
      return !expired && (res.status === 200 || res.status === 404 || res.status === 409);
    }).catch(() => false),

    // Check V1
    fetch(DEFAULT_V1_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        number: "__PING_CHECK__",
        location_key: null,
        courier: "all",
        marketplace: []
      })
    }).then(async (res) => {
      let data = null;
      let text = "";
      try {
        text = await res.text();
        data = JSON.parse(text);
      } catch (e) {}
      const expired = isV1SessionExpired(res.status, text, data) || (res.redirected && res.url && res.url.includes("login"));
      return !expired && (res.status === 200 || res.status === 404 || res.status === 409);
    }).catch(() => false)
  ]);

  const v2LoggedIn = v2Result.status === "fulfilled" ? v2Result.value : false;
  const v1LoggedIn = v1Result.status === "fulfilled" ? v1Result.value : false;

  await chrome.storage.local.set({
    v2_logged_in: v2LoggedIn,
    v1_logged_in: v1LoggedIn,
    oms_session_checked_at: Date.now()
  });

  return {
    v2_logged_in: v2LoggedIn,
    v1_logged_in: v1LoggedIn,
    any_logged_in: v2LoggedIn || v1LoggedIn
  };
}

// Google Sheets Sync Helper
async function postToGoogleSheet(url, payload) {
  if (!url) return { success: false, error: "No Sheet URL configured" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    if (json && json.result === "success") {
      return { success: true, count: json.count || 1 };
    }
    if (res.ok) {
      return { success: true, raw: text };
    }
    return { success: false, error: text.slice(0, 100) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Direct Pickup Request to V2 (with auto-login retry)
async function requestPickupV2(cleanAwb, courier, autoLogin, creds) {
  async function callV2() {
    // Check if in-tab message possible
    try {
      const tabs = await chrome.tabs.query({ url: "*://my.elitesecom.ai/*" });
      if (tabs && tabs.length > 0) {
        const tabRes = await new Promise((resResolve) => {
          const t = setTimeout(() => resResolve(null), 2500);
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "SCAN_AWB_IN_ELITE",
            awb: cleanAwb,
            courier: courier || "all"
          }, (resp) => {
            clearTimeout(t);
            resResolve(chrome.runtime.lastError ? null : resp);
          });
        });
        if (tabRes && tabRes.status !== undefined) {
          return { resStatus: tabRes.status, json: tabRes.json, text: tabRes.text, ok: tabRes.ok };
        }
      }
    } catch (e) {}

    // Direct fetch
    const res = await fetch(DEFAULT_V2_URL, {
      method: "POST",
      headers: {
        "accept": "*/*",
        "content-type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        awbNumber: cleanAwb,
        location_key: [],
        courier: courier || "all",
        marketplace: []
      })
    });
    let json = null;
    let text = "";
    try {
      text = await res.text();
      json = JSON.parse(text);
    } catch (e) {}
    return { resStatus: res.status, json, text, ok: res.ok };
  }

  let result = await callV2();
  let isExpired = isV2SessionExpired(result.resStatus, result.text, result.json);

  if (isExpired && autoLogin && creds.v2LoginEmail && creds.v2LoginPassword) {
    console.log("[VMS-Sync] V2 session expired, attempting auto-login...");
    const loginRes = await performV2Login(creds.v2LoginEmail, creds.v2LoginPassword);
    if (loginRes.success) {
      console.log("[VMS-Sync] V2 auto-login success, retrying pickup scan...");
      result = await callV2();
      isExpired = isV2SessionExpired(result.resStatus, result.text, result.json);
    }
  }

  return {
    oms_source: "V2",
    status: result.resStatus,
    ok: result.ok,
    json: result.json,
    text: result.text,
    isExpired
  };
}

// Direct Pickup Request to V1 (with auto-login retry)
async function requestPickupV1(cleanAwb, courier, autoLogin, creds) {
  async function callV1() {
    // Check if in-tab message possible
    try {
      const tabs = await chrome.tabs.query({ url: "*://oms.elitesecom.ai/*" });
      if (tabs && tabs.length > 0) {
        const tabRes = await new Promise((resResolve) => {
          const t = setTimeout(() => resResolve(null), 2500);
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "SCAN_AWB_IN_ELITE",
            awb: cleanAwb,
            courier: courier || "all"
          }, (resp) => {
            clearTimeout(t);
            resResolve(chrome.runtime.lastError ? null : resp);
          });
        });
        if (tabRes && tabRes.status !== undefined) {
          return { resStatus: tabRes.status, json: tabRes.json, text: tabRes.text, ok: tabRes.ok };
        }
      }
    } catch (e) {}

    // Direct fetch
    const res = await fetch(DEFAULT_V1_URL, {
      method: "POST",
      headers: {
        "accept": "*/*",
        "content-type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        number: cleanAwb,
        location_key: null,
        courier: courier || "all",
        marketplace: []
      })
    });
    let json = null;
    let text = "";
    try {
      text = await res.text();
      json = JSON.parse(text);
    } catch (e) {}
    return { resStatus: res.status, json, text, ok: res.ok };
  }

  let result = await callV1();
  let isExpired = isV1SessionExpired(result.resStatus, result.text, result.json);

  if (isExpired && autoLogin && creds.v1LoginEmail && creds.v1LoginPassword) {
    console.log("[VMS-Sync] V1 session expired, attempting auto-login...");
    const loginRes = await performV1Login(creds.v1LoginEmail, creds.v1LoginPassword);
    if (loginRes.success) {
      console.log("[VMS-Sync] V1 auto-login success, retrying pickup scan...");
      result = await callV1();
      isExpired = isV1SessionExpired(result.resStatus, result.text, result.json);
    }
  }

  return {
    oms_source: "V1",
    status: result.resStatus,
    ok: result.ok,
    json: result.json,
    text: result.text,
    isExpired
  };
}

// Master Dual Pickup Execution with Priority & Auto-Fallback
async function executeDualPickupScan(awb) {
  await checkAndResetDailyStats();
  const settings = await chrome.storage.local.get([
    "syncEnabled", "courier", "scanLogs", "todaySuccess", "todayFailed",
    "omsPriority", "autoLoginEnabled", "v1LoginEmail", "v1LoginPassword",
    "v2LoginEmail", "v2LoginPassword", "sheetSyncEnabled", "sheetUrl"
  ]);

  if (settings.syncEnabled === false) {
    return {
      success: false,
      skipped: true,
      statusType: "WARNING",
      awb,
      message: "Sync PAUSED in settings."
    };
  }

  const cleanAwb = String(awb).trim();
  const priority = settings.omsPriority || "auto_v2_first";
  const autoLogin = settings.autoLoginEnabled !== false;

  let primaryRes = null;
  let secondaryRes = null;
  let finalRes = null;

  if (priority === "only_v2") {
    finalRes = await requestPickupV2(cleanAwb, settings.courier, autoLogin, settings);
  } else if (priority === "only_v1") {
    finalRes = await requestPickupV1(cleanAwb, settings.courier, autoLogin, settings);
  } else if (priority === "auto_v1_first") {
    // Try V1 first
    primaryRes = await requestPickupV1(cleanAwb, settings.courier, autoLogin, settings);
    const isV1Found = isResultSuccessfulOrHandled(primaryRes);
    if (isV1Found) {
      finalRes = primaryRes;
    } else {
      console.log("[VMS-Sync] Order not in V1 or error, falling back to V2...");
      secondaryRes = await requestPickupV2(cleanAwb, settings.courier, autoLogin, settings);
      finalRes = secondaryRes;
    }
  } else {
    // Default: auto_v2_first
    primaryRes = await requestPickupV2(cleanAwb, settings.courier, autoLogin, settings);
    const isV2Found = isResultSuccessfulOrHandled(primaryRes);
    if (isV2Found) {
      finalRes = primaryRes;
    } else {
      console.log("[VMS-Sync] Order not in V2 or error, falling back to V1...");
      secondaryRes = await requestPickupV1(cleanAwb, settings.courier, autoLogin, settings);
      finalRes = secondaryRes;
    }
  }

  return recordResult(cleanAwb, finalRes, settings);
}

function isResultSuccessfulOrHandled(res) {
  if (!res) return false;
  if (res.isExpired) return false;
  // If status is 200 OK, or already scanned 409, consider it handled by this OMS
  if (res.status === 200) {
    // If json says "order not found" or similar, fallback
    const msg = String((res.json && (res.json.message || res.json.error)) || res.text || "").toLowerCase();
    if (msg.includes("not found") || msg.includes("does not exist") || msg.includes("invalid")) {
      return false;
    }
    return true;
  }
  if (res.status === 409) return true; // Already scanned
  return false;
}

async function recordResult(awb, res, settings) {
  let statusType = "ERROR"; // "SUCCESS", "ALREADY_SCANNED", "CANCELLED", "NOT_FOUND", "AUTH_EXPIRED", "ERROR"
  let serverMsg = "";
  const omsSource = res.oms_source || "V2";

  if (res.json) {
    serverMsg = res.json.message || res.json.error || res.json.msg || res.json.errorMessage || "";
    if (typeof serverMsg !== "string") {
      try { serverMsg = JSON.stringify(serverMsg); } catch (e) { serverMsg = ""; }
    }
  }
  if (!serverMsg && res.text) {
    serverMsg = res.text.length < 150 ? res.text : res.text.slice(0, 120);
  }

  const lower = (serverMsg || "").toLowerCase();

  if (res.isExpired || res.status === 401 || res.status === 403) {
    statusType = "AUTH_EXPIRED";
    serverMsg = `${omsSource} Session Expired (Please Login)`;
  } else if (res.status === 200) {
    const hasErrorFlag = res.json && (
      res.json.status === false ||
      res.json.success === false ||
      res.json.status === "error" ||
      res.json.error
    );

    const isCancel = lower.includes("cancel") || lower.includes("cancle");
    const isAlready = lower.includes("already") || lower.includes("picked");
    const isNotFound = lower.includes("not found") || lower.includes("does not exist");

    if (hasErrorFlag || isCancel || isAlready || isNotFound) {
      if (isCancel) {
        statusType = "CANCELLED";
        if (!serverMsg || serverMsg === "true") serverMsg = "Order is Cancelled in OMS";
      } else if (isAlready) {
        statusType = "ALREADY_SCANNED";
        if (!serverMsg || serverMsg === "true") serverMsg = "Already Scanned / Picked";
      } else if (isNotFound) {
        statusType = "NOT_FOUND";
        if (!serverMsg || serverMsg === "true") serverMsg = "Order Not Found in OMS";
      } else {
        statusType = "ERROR";
      }
    } else {
      statusType = "SUCCESS";
      if (!serverMsg) serverMsg = `${omsSource} Pickup Done`;
    }
  } else if (res.status === 409 || lower.includes("already") || lower.includes("picked")) {
    statusType = "ALREADY_SCANNED";
    if (!serverMsg) serverMsg = "Suborders have already been picked up.";
  } else if (lower.includes("cancel") || lower.includes("cancle")) {
    statusType = "CANCELLED";
    if (!serverMsg) serverMsg = "Order is Cancelled in OMS";
  } else if (res.status === 404 || lower.includes("not found")) {
    statusType = "NOT_FOUND";
    if (!serverMsg) serverMsg = `Order not found in ${omsSource}`;
  } else {
    statusType = "ERROR";
    if (!serverMsg) serverMsg = `${omsSource} Error ${res.status}`;
  }

  const isSuccess = statusType === "SUCCESS";
  const isWarning = statusType === "ALREADY_SCANNED";
  const now = Date.now();
  const timeStr = new Date().toLocaleTimeString('en-IN', { hour12: true });

  // Update storage logs
  let logs = settings.scanLogs || [];
  const existingIndex = logs.findIndex(item => item.awb === awb && (now - (item.startTimestamp || item.id || 0) < 15 * 60 * 1000));

  let startTimestamp = now;
  let startTime = timeStr;
  let durationStr = "-";
  let diffSec = 0;

  if (existingIndex !== -1) {
    startTimestamp = logs[existingIndex].startTimestamp || logs[existingIndex].id || now;
    startTime = logs[existingIndex].startTime || logs[existingIndex].time || timeStr;
    diffSec = Math.max(1, Math.round((now - startTimestamp) / 1000));
    durationStr = formatSeconds(diffSec);

    logs[existingIndex].endTime = timeStr;
    logs[existingIndex].endTimestamp = now;
    logs[existingIndex].duration = durationStr;
    logs[existingIndex].durationSec = diffSec;
    logs[existingIndex].videoStatus = "DONE";
    logs[existingIndex].statusType = statusType;
    logs[existingIndex].omsSource = omsSource;
    logs[existingIndex].success = isSuccess;
    logs[existingIndex].status = res.status;
    logs[existingIndex].message = serverMsg;
  } else {
    logs.unshift({
      id: now,
      startTimestamp: now,
      endTimestamp: now,
      awb: awb,
      omsSource: omsSource,
      time: timeStr,
      startTime: timeStr,
      endTime: timeStr,
      duration: "-",
      durationSec: 0,
      videoStatus: "DONE",
      statusType: statusType,
      success: isSuccess,
      status: res.status,
      message: serverMsg
    });
    if (logs.length > 500) logs = logs.slice(0, 500);
  }

  let successCount = (settings.todaySuccess || 0) + (isSuccess && existingIndex === -1 ? 1 : 0);
  let failedCount = (settings.todayFailed || 0) + (!isSuccess && !isWarning && existingIndex === -1 ? 1 : 0);

  await chrome.storage.local.set({
    scanLogs: logs,
    todaySuccess: successCount,
    todayFailed: failedCount
  });

  // Live Google Sheets Sync
  if (settings.sheetSyncEnabled && settings.sheetUrl) {
    postToGoogleSheet(settings.sheetUrl, {
      timestamp: new Date().toISOString(),
      date: getTodayDateString(),
      time: timeStr,
      awb: awb,
      omsSource: omsSource,
      statusType: statusType,
      success: isSuccess,
      courier: settings.courier || "all",
      message: serverMsg
    }).then(res => {
      console.log("[VMS-Sync] Google Sheet Sync result:", res);
    }).catch(err => {
      console.warn("[VMS-Sync] Google Sheet Sync error:", err);
    });
  }

  return {
    awb,
    omsSource,
    success: isSuccess,
    statusType: statusType,
    status: res.status,
    message: serverMsg,
    startTime: startTime,
    endTime: timeStr,
    duration: durationStr,
    videoStatus: "DONE"
  };
}

function formatSeconds(sec) {
  if (isNaN(sec) || sec < 0) return "-";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m ${s}s`;
}

async function handleEliteScanWithTimeout(awb) {
  return new Promise(async (resolve) => {
    const timer = setTimeout(() => {
      resolve({
        awb,
        success: false,
        statusType: "ERROR",
        status: 408,
        message: "Timeout: EliteSecom server not responding."
      });
    }, 7000);

    try {
      const result = await executeDualPickupScan(awb);
      clearTimeout(timer);
      resolve(result);
    } catch (err) {
      clearTimeout(timer);
      resolve({
        awb,
        success: false,
        statusType: "ERROR",
        message: err.message || "Scan error"
      });
    }
  });
}

// Runtime message router
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SYNC_AWB_TO_ELITE") {
    handleEliteScanWithTimeout(request.awb)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({
        success: false,
        statusType: "ERROR",
        awb: request.awb,
        message: err.message || "Request Error"
      }));
    return true;
  }

  if (request.action === "GET_STATS") {
    checkAndResetDailyStats().then(async () => {
      const stats = await chrome.storage.local.get([
        "eliteUrl", "syncEnabled", "soundEnabled", "soundVolume", "courier",
        "omsPriority", "autoLoginEnabled", "v1LoginEmail", "v1LoginPassword",
        "v2LoginEmail", "v2LoginPassword", "sheetSyncEnabled", "sheetUrl",
        "todaySuccess", "todayFailed", "v1_logged_in", "v2_logged_in", "scanLogs"
      ]);
      sendResponse(stats);
    });
    return true;
  }

  if (request.action === "CHECK_CONNECTION") {
    checkOmsSessions().then(res => sendResponse(res));
    return true;
  }

  if (request.action === "LOGIN_V1") {
    performV1Login(request.email, request.password).then(sendResponse);
    return true;
  }

  if (request.action === "LOGIN_V2") {
    performV2Login(request.email, request.password).then(sendResponse);
    return true;
  }

  if (request.action === "TEST_SHEET_SYNC") {
    postToGoogleSheet(request.url, {
      test: true,
      timestamp: new Date().toISOString(),
      message: "VMS-Sync Connection Test",
      awb: "TEST_AWB_123456",
      omsSource: "TEST",
      statusType: "SUCCESS"
    }).then(sendResponse);
    return true;
  }

  if (request.action === "OPEN_ELITE_TAB") {
    const targetUrl = request.panel === "v1" 
      ? "https://oms.elitesecom.ai/scanorders/pickup-entry"
      : "https://my.elitesecom.ai/scanorders/pickup-entry";
    chrome.tabs.create({ url: targetUrl });
    sendResponse({ ok: true });
    return true;
  }
});
