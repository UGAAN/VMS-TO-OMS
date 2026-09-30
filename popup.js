/**
 * VMS-Sync: Popup Script (v2.0.0)
 * Dual OMS Support, Auto-Login Management, Google Sheets Testing, Audio Volume Slider
 */

document.addEventListener("DOMContentLoaded", async () => {
  // Elements
  const pillV2 = document.getElementById("pill-v2");
  const pillV1 = document.getElementById("pill-v1");
  const selectPriority = document.getElementById("select-priority");
  const toggleSync = document.getElementById("toggle-sync");
  const volumeSlider = document.getElementById("volume-slider");
  const volumeVal = document.getElementById("volume-val");
  const btnTestSound = document.getElementById("btn-test-sound");
  const statTotal = document.getElementById("stat-total");
  const statSuccess = document.getElementById("stat-success");
  const statFailed = document.getElementById("stat-failed");
  const btnDownloadCsv = document.getElementById("btn-download-csv");
  const testInput = document.getElementById("test-awb-input");
  const btnTestScan = document.getElementById("btn-test-scan");
  const testResultBox = document.getElementById("test-result-box");
  const btnToggleSettings = document.getElementById("btn-toggle-settings");
  const settingsSection = document.getElementById("settings-section");
  const toggleAutoLogin = document.getElementById("toggle-autologin");
  const v2Email = document.getElementById("v2-email");
  const v2Pass = document.getElementById("v2-pass");
  const btnTestV2Login = document.getElementById("btn-test-v2-login");
  const v2LoginMsg = document.getElementById("v2-login-msg");
  const v1Email = document.getElementById("v1-email");
  const v1Pass = document.getElementById("v1-pass");
  const btnTestV1Login = document.getElementById("btn-test-v1-login");
  const v1LoginMsg = document.getElementById("v1-login-msg");
  const toggleSheetSync = document.getElementById("toggle-sheetsync");
  const inputSheetUrl = document.getElementById("input-sheet-url");
  const btnTestSheet = document.getElementById("btn-test-sheet");
  const sheetMsg = document.getElementById("sheet-msg");
  const inputCourier = document.getElementById("input-courier");
  const btnSaveSettings = document.getElementById("btn-save-settings");
  const btnClearHistory = document.getElementById("btn-clear-history");
  const footerConnection = document.getElementById("footer-connection");

  // Web Audio Synthesizer with Volume Control
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) audioCtx = new AudioCtxClass();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playTone(type, volumePct) {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const volMultiplier = Math.max(0, Math.min(1.5, (volumePct !== undefined ? volumePct : 100) / 100));
      if (volMultiplier === 0) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === "success") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.setValueAtTime(880.00, now + 0.08);
        gain.gain.setValueAtTime(0.4 * volMultiplier, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.32);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.33);
      } else {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(280, now);
        gain.gain.setValueAtTime(0.45 * volMultiplier, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.32);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.33);
      }
    } catch (e) {
      console.warn("[VMS-Sync] Audio tone error:", e);
    }
  }

  // Load Saved State
  chrome.runtime.sendMessage({ action: "GET_STATS" }, (data) => {
    if (!data) return;

    toggleSync.checked = data.syncEnabled !== false;
    selectPriority.value = data.omsPriority || "auto_v2_first";

    const vol = data.soundVolume !== undefined ? Number(data.soundVolume) : 100;
    volumeSlider.value = vol;
    volumeVal.textContent = `${vol}%`;

    const s = data.todaySuccess || 0;
    const f = data.todayFailed || 0;
    statSuccess.textContent = s;
    statFailed.textContent = f;
    statTotal.textContent = s + f;

    toggleAutoLogin.checked = data.autoLoginEnabled !== false;
    v2Email.value = data.v2LoginEmail || "";
    v2Pass.value = data.v2LoginPassword || "";
    v1Email.value = data.v1LoginEmail || "";
    v1Pass.value = data.v1LoginPassword || "";

    toggleSheetSync.checked = !!data.sheetSyncEnabled;
    inputSheetUrl.value = data.sheetUrl || "";
    inputCourier.value = data.courier || "all";

    updatePillStatus("v2", !!data.v2_logged_in);
    updatePillStatus("v1", !!data.v1_logged_in);
  });

  // Check live session connection
  chrome.runtime.sendMessage({ action: "CHECK_CONNECTION" }, (res) => {
    if (res) {
      updatePillStatus("v2", !!res.v2_logged_in);
      updatePillStatus("v1", !!res.v1_logged_in);
      if (res.any_logged_in) {
        footerConnection.textContent = "Status: Online 🟢";
        footerConnection.style.color = "#10b981";
      } else {
        footerConnection.textContent = "Status: Offline 🔴";
        footerConnection.style.color = "#ef4444";
      }
    }
  });

  function updatePillStatus(portal, isOnline) {
    const pill = portal === "v2" ? pillV2 : pillV1;
    if (!pill) return;
    if (isOnline) {
      pill.className = "status-pill online";
      pill.title = `${portal.toUpperCase()} Online - Click to Open`;
    } else {
      pill.className = "status-pill offline";
      pill.title = `${portal.toUpperCase()} Offline / Logged Out - Click to Open`;
    }
  }

  // Click on pills to open portal tabs
  pillV2.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "OPEN_ELITE_TAB", panel: "v2" });
  });
  pillV1.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "OPEN_ELITE_TAB", panel: "v1" });
  });

  // Priority Mode Change
  selectPriority.addEventListener("change", () => {
    chrome.storage.local.set({ omsPriority: selectPriority.value });
  });

  // Toggle Sync
  toggleSync.addEventListener("change", () => {
    chrome.storage.local.set({ syncEnabled: toggleSync.checked });
  });

  // Volume Slider
  volumeSlider.addEventListener("input", () => {
    const val = Number(volumeSlider.value);
    volumeVal.textContent = `${val}%`;
  });
  volumeSlider.addEventListener("change", () => {
    const val = Number(volumeSlider.value);
    chrome.storage.local.set({ soundVolume: val });
    playTone("success", val);
  });

  btnTestSound.addEventListener("click", () => {
    playTone("success", Number(volumeSlider.value));
  });

  // Password Visibility Toggle
  document.querySelectorAll(".btn-eye").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const input = document.getElementById(targetId);
      if (input) {
        input.type = input.type === "password" ? "text" : "password";
        btn.textContent = input.type === "password" ? "👁️" : "🙈";
      }
    });
  });

  // Test V2 Login
  btnTestV2Login.addEventListener("click", () => {
    const email = v2Email.value.trim();
    const pass = v2Pass.value.trim();
    if (!email || !pass) {
      v2LoginMsg.className = "msg-hint error";
      v2LoginMsg.textContent = "Please enter V2 email & password.";
      return;
    }
    v2LoginMsg.className = "msg-hint";
    v2LoginMsg.textContent = "Testing V2 Login...";
    btnTestV2Login.disabled = true;

    chrome.runtime.sendMessage({ action: "LOGIN_V2", email, password: pass }, (res) => {
      btnTestV2Login.disabled = false;
      if (res && res.success) {
        v2LoginMsg.className = "msg-hint success";
        v2LoginMsg.textContent = "✅ V2 Login Successful!";
        updatePillStatus("v2", true);
        playTone("success", Number(volumeSlider.value));
      } else {
        v2LoginMsg.className = "msg-hint error";
        v2LoginMsg.textContent = `❌ ${(res && res.error) || "Login failed"}`;
        updatePillStatus("v2", false);
        playTone("error", Number(volumeSlider.value));
      }
    });
  });

  // Test V1 Login
  btnTestV1Login.addEventListener("click", () => {
    const email = v1Email.value.trim();
    const pass = v1Pass.value.trim();
    if (!email || !pass) {
      v1LoginMsg.className = "msg-hint error";
      v1LoginMsg.textContent = "Please enter V1 email & password.";
      return;
    }
    v1LoginMsg.className = "msg-hint";
    v1LoginMsg.textContent = "Testing V1 Login...";
    btnTestV1Login.disabled = true;

    chrome.runtime.sendMessage({ action: "LOGIN_V1", email, password: pass }, (res) => {
      btnTestV1Login.disabled = false;
      if (res && res.success) {
        v1LoginMsg.className = "msg-hint success";
        v1LoginMsg.textContent = "✅ V1 Login Successful!";
        updatePillStatus("v1", true);
        playTone("success", Number(volumeSlider.value));
      } else {
        v1LoginMsg.className = "msg-hint error";
        v1LoginMsg.textContent = `❌ ${(res && res.error) || "Login failed"}`;
        updatePillStatus("v1", false);
        playTone("error", Number(volumeSlider.value));
      }
    });
  });

  // 1-Click Copy Apps Script Code
  const btnCopyScriptCode = document.getElementById("btn-copy-script-code");
  const btnOpenSheets = document.getElementById("btn-open-sheets");
  const copyScriptMsg = document.getElementById("copy-script-msg");

  const GOOGLE_APPS_SCRIPT_CODE = `function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ 
    result: "success", 
    status: "active", 
    message: "VMS-Sync Google Sheet Webhook is ready!" 
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      throw new Error("Spreadsheet not linked! Please open your Google Sheet and go to Extensions > Apps Script.");
    }
    
    var sheet = ss.getActiveSheet();
    var defaultHeaders = ["Timestamp", "Date", "Time", "AWB Number", "OMS Platform", "Courier", "Status", "Message"];
    
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(defaultHeaders);
      sheet.getRange(1, 1, 1, defaultHeaders.length).setFontWeight("bold").setBackground("#dcfce7");
    }

    var contents = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    if (!contents) {
      return ContentService.createTextOutput(JSON.stringify({ result: "error", error: "No data received" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(contents);

    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.date || "",
      data.time || "",
      data.awb || "",
      data.omsSource || data.oms_source || "V2",
      data.courier || "all",
      data.statusType || (data.success ? "SUCCESS" : "ERROR"),
      data.message || ""
    ]);

    return ContentService.createTextOutput(JSON.stringify({ result: "success", count: 1 }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ result: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

  if (btnCopyScriptCode) {
    btnCopyScriptCode.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
        if (copyScriptMsg) {
          copyScriptMsg.className = "msg-hint success";
          copyScriptMsg.textContent = "✅ Apps Script Code Copied! Paste (Ctrl+V) into Code.gs";
        }
        btnCopyScriptCode.textContent = "✅ Copied to Clipboard!";
        playTone("success", Number(volumeSlider.value));
        setTimeout(() => {
          btnCopyScriptCode.textContent = "📋 Copy Apps Script Code";
        }, 3000);
      } catch (err) {
        if (copyScriptMsg) {
          copyScriptMsg.className = "msg-hint error";
          copyScriptMsg.textContent = "Failed to copy: " + err.message;
        }
      }
    });
  }

  if (btnOpenSheets) {
    btnOpenSheets.addEventListener("click", () => {
      chrome.tabs.create({ url: "https://sheets.new" });
    });
  }

  // Test Google Sheet Sync
  btnTestSheet.addEventListener("click", () => {
    const url = inputSheetUrl.value.trim();
    if (!url) {
      sheetMsg.className = "msg-hint error";
      sheetMsg.textContent = "Please enter Apps Script Web App URL.";
      return;
    }
    sheetMsg.className = "msg-hint";
    sheetMsg.textContent = "Sending test row...";
    btnTestSheet.disabled = true;

    chrome.runtime.sendMessage({ action: "TEST_SHEET_SYNC", url }, (res) => {
      btnTestSheet.disabled = false;
      if (res && res.success) {
        sheetMsg.className = "msg-hint success";
        sheetMsg.textContent = "✅ Google Sheet Connected successfully!";
        playTone("success", Number(volumeSlider.value));
      } else {
        sheetMsg.className = "msg-hint error";
        sheetMsg.textContent = `❌ ${(res && res.error) || "Connection failed"}`;
        playTone("error", Number(volumeSlider.value));
      }
    });
  });

  // Manual Test Scan
  btnTestScan.addEventListener("click", performTestScan);
  testInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") performTestScan();
  });

  function performTestScan() {
    const awb = testInput.value.trim();
    if (!awb) {
      testInput.focus();
      return;
    }

    testResultBox.style.display = "block";
    testResultBox.className = "test-result";
    testResultBox.textContent = "Scanning on OMS...";

    chrome.runtime.sendMessage({ action: "SYNC_AWB_TO_ELITE", awb }, (res) => {
      const vol = Number(volumeSlider.value);
      if (!res) {
        testResultBox.className = "test-result err";
        testResultBox.textContent = "No response received.";
        playTone("error", vol);
        return;
      }

      const omsTag = res.omsSource ? `[${res.omsSource}] ` : "";
      if (res.success) {
        testResultBox.className = "test-result ok";
        testResultBox.textContent = `✅ ${omsTag}${res.message || "Pickup OK"}`;
        playTone("success", vol);
      } else {
        testResultBox.className = "test-result err";
        testResultBox.textContent = `❌ ${omsTag}${res.message || "Error"}`;
        playTone("error", vol);
      }

      // Refresh counters
      chrome.runtime.sendMessage({ action: "GET_STATS" }, (data) => {
        if (data) {
          const s = data.todaySuccess || 0;
          const f = data.todayFailed || 0;
          statSuccess.textContent = s;
          statFailed.textContent = f;
          statTotal.textContent = s + f;
        }
      });
    });
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

  function formatDurationHms(sec) {
    if (isNaN(sec) || sec < 0) return "00:00:00";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
  }

  function generateCsvReport(logs, todayDate) {
    const dateStr = todayDate || new Date().toISOString().slice(0, 10);
    if (!logs || logs.length === 0) {
      return {
        csvContent: "",
        filename: `VMS_OMS_Scans_${dateStr}.csv`,
        isEmpty: true
      };
    }

    let startTimestamp = Infinity;
    let endTimestamp = 0;
    let successCount = 0;
    let failedCount = 0;

    logs.forEach(log => {
      const sTime = log.startTimestamp || log.id || 0;
      const eTime = log.endTimestamp || sTime;
      if (sTime > 0 && sTime < startTimestamp) startTimestamp = sTime;
      if (eTime > endTimestamp) endTimestamp = eTime;
      if (log.success) successCount++;
      else failedCount++;
    });

    const batchStartTime = startTimestamp !== Infinity ? new Date(startTimestamp).toLocaleTimeString('en-IN', { hour12: true }) : "-";
    const batchEndTime = endTimestamp > 0 ? new Date(endTimestamp).toLocaleTimeString('en-IN', { hour12: true }) : "-";
    const totalDurationSec = (startTimestamp !== Infinity && endTimestamp >= startTimestamp) ? Math.round((endTimestamp - startTimestamp) / 1000) : 0;
    const totalDurationStr = formatDurationHms(totalDurationSec);

    let csv = "data:text/csv;charset=utf-8,";
    csv += `"=== VMS TO OMS PACKING REPORT ===","","","","","","","",""\r\n`;
    csv += `"Date:","${dateStr}","","","","","","",""\r\n`;
    csv += `"Batch Start Time:","${batchStartTime}","","","","","","",""\r\n`;
    csv += `"Batch End Time:","${batchEndTime}","","","","","","",""\r\n`;
    csv += `"Total Working Duration:","${totalDurationStr}","","","","","","",""\r\n`;
    csv += `"Total Orders:","${logs.length}","Successful:","${successCount}","Failed:","${failedCount}","","",""\r\n`;
    csv += `"","","","","","","","",""\r\n`;
    csv += `"No","AWB Number","OMS Platform","Start Time","End Time","Duration","Video Upload","Status","Message"\r\n`;

    logs.forEach((log, index) => {
      const no = logs.length - index;
      const awb = log.awb || "";
      const platform = log.omsSource || "V2";
      const sTime = log.startTime || log.time || "-";
      const eTime = log.endTime || log.startTime || log.time || "-";
      const duration = log.duration || (log.durationSec ? formatSeconds(log.durationSec) : "-");
      const videoUpload = log.videoStatus || "DONE";
      const status = log.statusType || (log.success ? "SUCCESS" : "FAILED");
      const cleanMsg = (log.message || "").replace(/"/g, '""');

      const row = [
        no,
        `"${awb}"`,
        `"${platform}"`,
        `"${sTime}"`,
        `"${eTime}"`,
        `"${duration}"`,
        `"${videoUpload}"`,
        `"${status}"`,
        `"${cleanMsg}"`
      ].join(",");
      csv += row + "\r\n";
    });

    return {
      csvContent: csv,
      filename: `VMS_OMS_Scans_${dateStr}.csv`,
      isEmpty: false
    };
  }

  // Download CSV Report
  btnDownloadCsv.addEventListener("click", async () => {
    const data = await chrome.storage.local.get(["scanLogs", "todayDate"]);
    const logs = data.scanLogs || [];
    const report = generateCsvReport(logs, data.todayDate);

    if (report.isEmpty) {
      alert("No scan logs found for today.");
      return;
    }

    const encodedUri = encodeURI(report.csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", report.filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Settings Section Toggle
  btnToggleSettings.addEventListener("click", () => {
    const isHidden = settingsSection.style.display === "none";
    settingsSection.style.display = isHidden ? "flex" : "none";
    btnToggleSettings.innerHTML = isHidden
      ? "⚙️ Advanced Settings (Auto-Login, Sheet, API) &#9652;"
      : "⚙️ Advanced Settings (Auto-Login, Sheet, API) &#9662;";
  });

  // Save Settings
  btnSaveSettings.addEventListener("click", async () => {
    const courier = inputCourier.value.trim() || "all";
    const autoLogin = toggleAutoLogin.checked;
    const v2_e = v2Email.value.trim();
    const v2_p = v2Pass.value.trim();
    const v1_e = v1Email.value.trim();
    const v1_p = v1Pass.value.trim();
    const sheetSync = toggleSheetSync.checked;
    const sheetUrl = inputSheetUrl.value.trim();
    const priority = selectPriority.value;

    await chrome.storage.local.set({
      courier,
      autoLoginEnabled: autoLogin,
      v2LoginEmail: v2_e,
      v2LoginPassword: v2_p,
      v1LoginEmail: v1_e,
      v1LoginPassword: v1_p,
      sheetSyncEnabled: sheetSync,
      sheetUrl: sheetUrl,
      omsPriority: priority
    });

    alert("✅ All settings saved successfully!");
  });

  // Clear History
  btnClearHistory.addEventListener("click", async () => {
    if (confirm("Do you want to reset all scan logs and counters for today?")) {
      await chrome.storage.local.set({
        todaySuccess: 0,
        todayFailed: 0,
        scanLogs: []
      });
      statSuccess.textContent = 0;
      statFailed.textContent = 0;
      statTotal.textContent = 0;
      testResultBox.style.display = "none";
      alert("All scan logs and counters have been reset.");
    }
  });

});
