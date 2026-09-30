/**
 * VMS-Sync: Main World Interceptor
 * Injected into the page context of https://fkvms.synlabs.io/*
 * Hooks fetch and XMLHttpRequest to reliably detect AWB scans without breaking VMS camera/ui.
 */

(function () {
  console.log("%c[VMS-Sync] Interceptor Active on Flipkart VMS", "background: #1877F2; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;");

  let customFkPattern = "awb/scan";

  document.addEventListener("VMS_SYNC_UPDATE_PATTERN", function (event) {
    if (event.detail && event.detail.fkPattern) {
      customFkPattern = event.detail.fkPattern.trim();
      console.log("[VMS-Sync] Updated Flipkart scan pattern keyword to:", customFkPattern);
    }
  });

  let activeAwb = "";
  let activeAwbTime = 0;
  let lastVideoUploadedAwb = "";
  let lastVideoUploadedTime = 0;

  function isFkVmsScanUrl(url) {
    if (!url) return false;
    if (customFkPattern && url.includes(customFkPattern)) return true;
    return url.includes("/api/awb/scan") ||
           url.includes("/awb/scan") ||
           (url.includes("/awb/") && url.includes("signed")) ||
           url.includes("/scan/signed");
  }

  function extractAwbFromBody(body) {
    if (!body) return null;
    try {
      const parsed = typeof body === "string" ? JSON.parse(body) : body;
      return parsed.awb || parsed.awbNumber || parsed.awb_number || parsed.trackingId || parsed.barcode || null;
    } catch (e) {
      return null;
    }
  }

  function notifyAwbScan(awb, originUrl, triggerType) {
    if (!awb) return;
    const cleanAwb = String(awb).trim();
    if (!cleanAwb || cleanAwb.length < 5) return;

    try {
      document.dispatchEvent(new CustomEvent("VMS_SYNC_AWB_DISPATCH", {
        detail: {
          awb: cleanAwb,
          url: originUrl || "",
          triggerType: triggerType || "NETWORK",
          timestamp: Date.now()
        }
      }));
    } catch (e) {
      console.warn("[VMS-Sync] Event dispatch error:", e);
    }
  }

  // 1. Hook window.fetch
  const originalFetch = window.fetch;
  window.fetch = function () {
    try {
      const resource = arguments[0];
      const config = arguments[1];
      const url = typeof resource === "string" ? resource : (resource && resource.url) || "";

      if (isFkVmsScanUrl(url)) {
        const body = config && config.body;
        const awb = extractAwbFromBody(body);
        if (awb) {
          notifyAwbScan(awb, url, "FETCH");
        }
      }
    } catch (err) {
      console.warn("[VMS-Sync] Fetch inspect warning:", err);
    }
    return originalFetch.apply(window, arguments);
  };

  // 2. Hook XMLHttpRequest
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function () {
    this._vms_sync_url = arguments[1];
    return originalXhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    try {
      const url = this._vms_sync_url || "";
      if (isFkVmsScanUrl(url)) {
        const awb = extractAwbFromBody(body);
        if (awb) {
          notifyAwbScan(awb, url, "XHR");
        }
      }
    } catch (err) {
      console.warn("[VMS-Sync] XHR inspect warning:", err);
    }
    return originalXhrSend.apply(this, arguments);
  };

  // 3. Fallback: Input keydown watcher (Enter key on AWB input box)
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      const hash = (window.location.hash || "").toLowerCase();
      if (hash.includes("login")) return;

      const target = e.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        if (target.type === "password") return;
        const ph = (target.placeholder || "").toLowerCase();
        if (ph.includes("feed") || ph.includes("username") || ph.includes("password")) return;

        const id = (target.id || "").toLowerCase();
        if (id.includes("feed") || id.includes("login") || id.includes("pass")) return;

        const bodyText = document.body ? (document.body.innerText || "") : "";
        if (bodyText.includes("Connect to Feed") || bodyText.includes("Scan the Feed Id on your Desk")) return;

        const val = (target.value || "").trim();
        // AWB barcodes are typically 8 to 40 characters
        if (val.length >= 8 && val.length <= 40) {
          notifyAwbScan(val, "DOM_INPUT", "KEYBOARD");
        }
      }
    }
  }, true);

})();
