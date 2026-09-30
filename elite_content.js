/**
 * VMS-Sync: EliteSecom Content Script (elite_content.js)
 * Runs directly inside https://my.elitesecom.ai/*
 * Executes pickup scans within the authenticated EliteSecom page context.
 */

(function () {
  console.log("%c[VMS-Sync] EliteSecom Handler Ready", "background: #00C853; color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold;");

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "SCAN_AWB_IN_ELITE") {
      const awb = String(request.awb || "").trim();
      console.log("[VMS-Sync] Received scan request for AWB:", awb);

      // 1. Also update the DOM input field on pickup-entry page if present
      try {
        const input = document.querySelector('input[placeholder*="AWB Number"]') ||
                      document.querySelector('input[placeholder*="Click Here To Scan"]') ||
                      document.querySelector('.pickup-entry input') ||
                      document.querySelector('input[type="text"]');
        if (input) {
          input.focus();
          input.value = awb;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      } catch (domErr) {
        console.warn("[VMS-Sync] DOM update note:", domErr);
      }

      const isV1 = window.location.hostname.includes("oms.elitesecom.ai");
      const scanUrl = isV1 
        ? "https://oms.elitesecom.ai/api/pickup-scan"
        : "https://my.elitesecom.ai/api/scanorders/pickup/pickup_scan";
      const referrerUrl = isV1
        ? "https://oms.elitesecom.ai/scanorders/pickup-entry"
        : "https://my.elitesecom.ai/scanorders/pickup-entry";
      const payload = isV1 ? {
        number: awb,
        location_key: null,
        courier: request.courier || "all",
        marketplace: []
      } : {
        awbNumber: awb,
        location_key: [],
        courier: request.courier || "all",
        marketplace: []
      };

      // 2. Execute same-origin fetch with page credentials
      fetch(scanUrl, {
        method: "POST",
        headers: {
          "accept": "*/*",
          "accept-language": "en-GB,en-US;q=0.9,en;q=0.8,gu;q=0.7",
          "content-type": "application/json"
        },
        referrer: referrerUrl,
        credentials: "include",
        body: JSON.stringify(payload)
      })
      .then(async (res) => {
        let json = null;
        let text = "";
        try {
          text = await res.text();
          json = JSON.parse(text);
        } catch (e) {}

        console.log(`[VMS-Sync] EliteSecom ${isV1 ? "V1" : "V2"} response:`, res.status, json || text);
        sendResponse({
          ok: res.ok,
          status: res.status,
          json: json,
          text: text,
          oms_source: isV1 ? "V1" : "V2"
        });
      })
      .catch((fetchErr) => {
        console.error("[VMS-Sync] EliteSecom fetch error:", fetchErr);
        sendResponse({
          ok: false,
          status: 0,
          error: fetchErr.message || "EliteSecom page network error",
          oms_source: isV1 ? "V1" : "V2"
        });
      });

      return true; // Keep message channel open for async response
    }
  });
})();
