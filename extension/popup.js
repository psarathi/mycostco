// Costco Receipt Finder Popup Logic

document.addEventListener('DOMContentLoaded', async () => {
  const statusIndicator = document.getElementById('statusIndicator');
  const statusTitle = document.getElementById('statusTitle');
  const statusDesc = document.getElementById('statusDesc');
  const syncBtn = document.getElementById('syncBtn');
  const syncBtnText = document.getElementById('syncBtnText');
  const syncIcon = document.getElementById('syncIcon');
  const syncSpinner = document.getElementById('syncSpinner');
  const dashboardBtn = document.getElementById('dashboardBtn');
  const lastSyncText = document.getElementById('lastSyncText');

  let activeIdToken = null;
  let activeClientID = null;

  // Initialize: Load last sync time
  const storageData = await chrome.storage.local.get(['lastSyncTime', 'receipts']);
  if (storageData.lastSyncTime) {
    const lastSyncDate = new Date(storageData.lastSyncTime);
    lastSyncText.textContent = `Last synced: ${lastSyncDate.toLocaleString()}`;
  } else {
    lastSyncText.textContent = 'Never synchronized';
  }

  // Dashboard Button
  dashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'dashboard.html' });
  });

  // Sync Button (Sends message to content script to fetch receipts)
  syncBtn.addEventListener('click', async () => {
    if (!activeIdToken || !activeClientID) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const purchasesUrl = 'https://www.costco.com/myaccount/#/app/ordersandpurchases';
      
      if (tab && (tab.url.includes('costco.com') || tab.url.includes('costco.ca'))) {
        chrome.tabs.update(tab.id, { url: purchasesUrl });
      } else {
        chrome.tabs.create({ url: purchasesUrl });
      }
      window.close();
      return;
    }

    // Show loading state
    syncBtn.disabled = true;
    syncBtn.classList.add('btn-disabled');
    syncIcon.classList.add('hidden');
    syncSpinner.classList.remove('hidden');
    syncBtnText.textContent = 'Syncing...';
    
    setConnectionStatus('checking', 'Syncing receipts...', 'Requesting fetch from Costco page context...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error("No active Costco tab found.");

      // Calculate date range: last 2 years (24 months) to today
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - 2);

      const mm1 = String(startDate.getMonth() + 1).padStart(2, '0');
      const dd1 = String(startDate.getDate()).padStart(2, '0');
      const yyyy1 = startDate.getFullYear();
      const startDateStr = `${mm1}/${dd1}/${yyyy1}`;

      const mm2 = String(endDate.getMonth() + 1).padStart(2, '0');
      const dd2 = String(endDate.getDate()).padStart(2, '0');
      const yyyy2 = endDate.getFullYear();
      const endDateStr = `${mm2}/${dd2}/${yyyy2}`;

      // Send message to the content-script.js injected in the active tab
      const response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(
          tab.id,
          {
            action: 'fetchReceipts',
            start: startDateStr,
            end: endDateStr,
            idToken: activeIdToken,
            clientID: activeClientID
          },
          (res) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message || "Failed to communicate with page. Please refresh the Costco page."));
            } else {
              resolve(res);
            }
          }
        );
      });

      if (!response || !response.success) {
        throw new Error(response?.error || "Invalid response or error during sync fetch.");
      }

      const fetchedReceipts = response.receipts;
      
      if (!fetchedReceipts || !Array.isArray(fetchedReceipts)) {
        throw new Error("Failed to retrieve array of receipts from page context.");
      }

      // Merge and save to storage in extension context
      const storageData = await chrome.storage.local.get('receipts');
      const existingReceipts = storageData.receipts || [];
      
      const receiptMap = new Map();
      existingReceipts.forEach(r => {
        const key = `${r.warehouseNumber}-${r.registerNumber}-${r.transactionNumber}-${r.transactionDate}`;
        receiptMap.set(key, r);
      });

      fetchedReceipts.forEach(r => {
        const key = `${r.warehouseNumber}-${r.registerNumber}-${r.transactionNumber}-${r.transactionDate}`;
        receiptMap.set(key, r);
      });

      const mergedReceipts = Array.from(receiptMap.values());
      mergedReceipts.sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));

      await chrome.storage.local.set({
        receipts: mergedReceipts,
        lastSyncTime: new Date().toISOString()
      });

      // Complete status
      setConnectionStatus('connected', 'Sync Complete!', `Synced ${fetchedReceipts.length} receipts successfully.`);
      lastSyncText.textContent = `Last synced: ${new Date().toLocaleString()}`;
      
      setTimeout(() => {
        chrome.tabs.create({ url: 'dashboard.html' });
      }, 1500);

    } catch (err) {
      console.error('Sync failed:', err);
      setConnectionStatus('error', 'Sync Failed', err.message || String(err));
    } finally {
      resetSyncButton();
    }
  });

  // Check tab status
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url) {
      setConnectionStatus('disconnected', 'No active tab', 'Please click when viewing a webpage.');
      return;
    }

    const isCostco = tab.url.includes('costco.com') || tab.url.includes('costco.ca');
    
    if (!isCostco) {
      setConnectionStatus(
        'disconnected', 
        'Not on Costco', 
        'Please navigate to Costco.com and log in.'
      );
      syncBtn.disabled = false;
      syncBtn.classList.remove('btn-disabled');
      syncBtnText.textContent = 'Go to Costco.com';
      return;
    }

    // We are on Costco, try to read local storage tokens from the page
    setConnectionStatus('checking', 'Checking Costco session...', 'Reading secure tokens...');
    
    const tokenResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => {
        // Read tokens from localStorage/sessionStorage
        let idToken = localStorage.getItem('idToken') || sessionStorage.getItem('idToken');
        let clientID = localStorage.getItem('clientID') || sessionStorage.getItem('clientID');

        if (!idToken || !clientID) {
          // Search localStorage for matching keys
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!idToken && (key.toLowerCase().includes('idtoken') || key.toLowerCase().includes('authorization'))) {
              idToken = localStorage.getItem(key);
            }
            if (!clientID && key.toLowerCase().includes('clientid')) {
              clientID = localStorage.getItem(key);
            }
          }
        }
        return { idToken, clientID };
      }
    });

    const tokens = tokenResult?.[0]?.result;
    
    if (tokens && tokens.idToken && tokens.clientID) {
      activeIdToken = tokens.idToken;
      activeClientID = tokens.clientID;
      setConnectionStatus(
        'connected', 
        'Connected to Costco', 
        'Ready to synchronize receipts.'
      );
      syncBtn.disabled = false;
      syncBtn.classList.remove('btn-disabled');
    } else {
      setConnectionStatus(
        'disconnected', 
        'Log in Required', 
        'Please log in and go to your Orders and Purchases page.'
      );
      syncBtn.disabled = false;
      syncBtn.classList.remove('btn-disabled');
      syncBtnText.textContent = 'Go to Purchases Page';
    }
  } catch (err) {
    console.error('Error checking tab status:', err);
    setConnectionStatus(
      'error', 
      'Connection Error', 
      'Could not read session. Try reloading the page.'
    );
  }

  function resetSyncButton() {
    syncBtn.disabled = false;
    syncBtn.classList.remove('btn-disabled');
    syncBtnText.textContent = 'Sync Receipts';
    syncSpinner.classList.add('hidden');
    syncIcon.classList.remove('hidden');
  }

  function setConnectionStatus(status, title, desc) {
    statusTitle.textContent = title;
    statusDesc.textContent = desc;

    statusIndicator.className = 'status-indicator';
    if (status === 'connected') {
      statusIndicator.classList.add('ready');
    } else if (status === 'error') {
      statusIndicator.classList.add('error');
    }
  }
});
