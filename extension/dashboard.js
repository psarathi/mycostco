// Costco Receipt Finder Dashboard Logic

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const statTotalSpent = document.getElementById('statTotalSpent');
  const statReceiptCount = document.getElementById('statReceiptCount');
  const statAvgSpent = document.getElementById('statAvgSpent');
  const statTopWarehouse = document.getElementById('statTopWarehouse');
  const yearFiltersContainer = document.getElementById('yearFilters');
  const warehouseFiltersContainer = document.getElementById('warehouseFilters');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const sortBy = document.getElementById('sortBy');
  const receiptsCountLabel = document.getElementById('receiptsCountLabel');
  const receiptsGrid = document.getElementById('receiptsGrid');
  const syncTime = document.getElementById('syncTime');
  const spendingChart = document.getElementById('spendingChart');

  // Modal Elements
  const receiptModal = document.getElementById('receiptModal');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const recWarehouseNum = document.getElementById('recWarehouseNum');
  const recWarehouseAddress = document.getElementById('recWarehouseAddress');
  const recWarehouseCityState = document.getElementById('recWarehouseCityState');
  const recDate = document.getElementById('recDate');
  const recTime = document.getElementById('recTime');
  const recMembership = document.getElementById('recMembership');
  const recRegister = document.getElementById('recRegister');
  const recOperator = document.getElementById('recOperator');
  const recTransaction = document.getElementById('recTransaction');
  const recItemsList = document.getElementById('recItemsList');
  const recSubtotal = document.getElementById('recSubtotal');
  const recInstantSavingsRow = document.getElementById('recInstantSavingsRow');
  const recInstantSavings = document.getElementById('recInstantSavings');
  const recTax = document.getElementById('recTax');
  const recTotal = document.getElementById('recTotal');
  const recTenders = document.getElementById('recTenders');
  const recBarcode = document.getElementById('recBarcode');
  const recBarcodeText = document.getElementById('recBarcodeText');
  const printReceiptBtn = document.getElementById('printReceiptBtn');
  const exportDataBtn = document.getElementById('exportDataBtn');
  const importDataBtn = document.getElementById('importDataBtn');
  const importFileInput = document.getElementById('importFileInput');
  const hoverPreview = document.getElementById('hoverPreview');
  const hideReturnsCheckbox = document.getElementById('hideReturnsCheckbox');
  const statDateRange = document.getElementById('statDateRange');
  const filterStartDate = document.getElementById('filterStartDate');
  const filterEndDate = document.getElementById('filterEndDate');
  const clearDateFilterBtn = document.getElementById('clearDateFilterBtn');

  // Alias Editor Elements
  const aliasEditorPanel = document.getElementById('aliasEditorPanel');
  const aliasItemHeader = document.getElementById('aliasItemHeader');
  const aliasInput = document.getElementById('aliasInput');
  const saveAliasBtn = document.getElementById('saveAliasBtn');

  // State
  let allReceipts = [];
  let itemAliases = {};
  let itemPurchaseCounts = {}; // itemNumber -> count
  let itemTotalQty = {}; // itemNumber -> total quantity
  let selectedYears = new Set();
  let selectedWarehouses = new Set();
  let activeSearchQuery = '';
  let selectedItemForAlias = null; // { itemNumber: string, itemDescription: string }
  let currentOpenReceipt = null;

  // Load Data
  await loadData();
  initThemeManager();
  renderDashboard();
  updatePresetActiveStates();

  // Load from Storage
  async function loadData() {
    const data = await chrome.storage.local.get(['receipts', 'itemAliases', 'lastSyncTime']);
    allReceipts = data.receipts || [];
    itemAliases = data.itemAliases || {};
    calculateItemFrequencies();
    
    if (data.lastSyncTime) {
      const lastSyncDate = new Date(data.lastSyncTime);
      syncTime.textContent = `Last synced: ${lastSyncDate.toLocaleString()}`;
    } else {
      syncTime.textContent = 'Never synced';
    }
  }

  // Calculate global item purchase frequencies
  function calculateItemFrequencies() {
    itemPurchaseCounts = {};
    itemTotalQty = {};

    allReceipts.forEach(r => {
      const items = r.itemArray || [];
      items.forEach(item => {
        const num = String(item.itemNumber || '');
        if (!num) return;
        itemPurchaseCounts[num] = (itemPurchaseCounts[num] || 0) + 1;
        const qty = parseFloat(item.unit) || 1;
        itemTotalQty[num] = (itemTotalQty[num] || 0) + qty;
      });
    });
  }

  // Save Aliases to Storage
  async function saveAliases() {
    await chrome.storage.local.set({ itemAliases });
  }

  // Initialize Theme Selector and System Sync logic
  function initThemeManager() {
    const themeSelector = document.getElementById('themeSelector');
    if (!themeSelector) return;

    function applyTheme(theme) {
      if (theme === 'system') {
        const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', isSystemDark ? 'dark' : 'solarized-light');
      } else {
        document.documentElement.setAttribute('data-theme', theme);
      }
    }

    // Load preferred theme from storage, default to dark mode
    chrome.storage.local.get(['themePreference'], (result) => {
      const preferredTheme = result.themePreference || 'dark';
      themeSelector.value = preferredTheme;
      applyTheme(preferredTheme);
    });

    themeSelector.addEventListener('change', (e) => {
      const selectedTheme = e.target.value;
      chrome.storage.local.set({ themePreference: selectedTheme });
      applyTheme(selectedTheme);
    });

    // Listen for system theme changes and apply dynamically if set to system
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (themeSelector.value === 'system') {
        applyTheme('system');
      }
    });
  }

  // Render everything
  function renderDashboard() {
    computeStatistics();
    populateFilterOptions();
    renderChart();
    renderReceiptsGrid();
  }

  // Compute stats
  function computeStatistics() {
    if (allReceipts.length === 0) {
      statTotalSpent.textContent = '$0.00';
      statReceiptCount.textContent = '0';
      statAvgSpent.textContent = '$0.00';
      statTopWarehouse.textContent = '-';
      return;
    }

    let total = 0;
    const warehouseCounts = {};

    allReceipts.forEach(r => {
      total += parseFloat(r.total) || 0;
      const wName = r.warehouseName || 'Unknown Warehouse';
      warehouseCounts[wName] = (warehouseCounts[wName] || 0) + 1;
    });

    statTotalSpent.textContent = formatCurrency(total);
    statReceiptCount.textContent = allReceipts.length;
    statAvgSpent.textContent = formatCurrency(total / allReceipts.length);

    // Find top warehouse
    let topWarehouse = '-';
    let maxCount = 0;
    for (const [wName, count] of Object.entries(warehouseCounts)) {
      if (count > maxCount) {
        maxCount = count;
        topWarehouse = wName;
      }
    }
    statTopWarehouse.textContent = topWarehouse;
  }

  // Populate filter selectors
  function populateFilterOptions() {
    const years = new Set();
    const warehouses = new Set();

    allReceipts.forEach(r => {
      if (r.transactionDate) {
        const year = new Date(r.transactionDate).getFullYear();
        if (year) years.add(year);
      }
      if (r.warehouseName) {
        warehouses.add(r.warehouseName);
      }
    });

    // Populate Year Chips
    const sortedYears = Array.from(years).sort((a, b) => b - a);
    const existingYearsHTML = yearFiltersContainer.innerHTML;
    let yearsHTML = '';
    sortedYears.forEach(year => {
      const activeClass = selectedYears.has(year) ? 'active' : '';
      yearsHTML += `
        <div class="filter-chip ${activeClass}" data-year="${year}">
          <span>${year}</span>
        </div>
      `;
    });
    yearFiltersContainer.innerHTML = yearsHTML || '<div class="stat-label">No years available</div>';

    // Populate Warehouse Chips
    const sortedWarehouses = Array.from(warehouses).sort();
    let warehousesHTML = '';
    sortedWarehouses.forEach(wh => {
      const activeClass = selectedWarehouses.has(wh) ? 'active' : '';
      const escapedWh = escapeHTML(wh);
      warehousesHTML += `
        <div class="filter-chip ${activeClass}" data-warehouse="${escapedWh}">
          <span>${escapedWh}</span>
        </div>
      `;
    });
    warehouseFiltersContainer.innerHTML = warehousesHTML || '<div class="stat-label">No locations available</div>';

    // Add Filter Click Listeners
    document.querySelectorAll('#yearFilters .filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const year = parseInt(chip.getAttribute('data-year'));
        if (selectedYears.has(year)) {
          selectedYears.delete(year);
          chip.classList.remove('active');
        } else {
          selectedYears.add(year);
          chip.classList.add('active');
        }
        renderReceiptsGrid();
      });
    });

    document.querySelectorAll('#warehouseFilters .filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const wh = chip.getAttribute('data-warehouse');
        if (selectedWarehouses.has(wh)) {
          selectedWarehouses.delete(wh);
          chip.classList.remove('active');
        } else {
          selectedWarehouses.add(wh);
          chip.classList.add('active');
        }
        renderReceiptsGrid();
      });
    });
  }

  // Draw SVG spending chart (last 12 months)
  function renderChart() {
    spendingChart.innerHTML = '';
    if (allReceipts.length === 0) return;

    // Get last 12 months boundaries
    const now = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        year: d.getFullYear(),
        monthNum: d.getMonth(),
        amount: 0
      });
    }

    // Accumulate receipts total
    allReceipts.forEach(r => {
      const rDate = new Date(r.transactionDate);
      const rYear = rDate.getFullYear();
      const rMonth = rDate.getMonth();

      const match = months.find(m => m.year === rYear && m.monthNum === rMonth);
      if (match) {
        match.amount += parseFloat(r.total) || 0;
      }
    });

    const maxAmount = Math.max(...months.map(m => m.amount), 100);

    // Chart Dimensions
    const containerWidth = spendingChartContainer.clientWidth || 800;
    const containerHeight = 140;
    spendingChart.setAttribute('viewBox', `0 0 ${containerWidth} ${containerHeight}`);

    const paddingLeft = 45;
    const paddingBottom = 25;
    const paddingTop = 15;
    const paddingRight = 20;

    const chartWidth = containerWidth - paddingLeft - paddingRight;
    const chartHeight = containerHeight - paddingTop - paddingBottom;

    // Draw Y gridlines
    const gridLines = 3;
    for (let i = 0; i <= gridLines; i++) {
      const yVal = maxAmount * (i / gridLines);
      const yPos = containerHeight - paddingBottom - (chartHeight * (i / gridLines));

      // Gridline
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', paddingLeft);
      line.setAttribute('y1', yPos);
      line.setAttribute('x2', containerWidth - paddingRight);
      line.setAttribute('y2', yPos);
      line.setAttribute('class', 'chart-line');
      spendingChart.appendChild(line);

      // Y Label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', paddingLeft - 8);
      text.setAttribute('y', yPos + 3);
      text.setAttribute('text-anchor', 'end');
      text.setAttribute('class', 'chart-text');
      text.textContent = `$${Math.round(yVal)}`;
      spendingChart.appendChild(text);
    }

    // Draw Bars
    const barSpacing = chartWidth / months.length;
    const barWidth = barSpacing * 0.6;

    months.forEach((m, idx) => {
      const barHeight = (m.amount / maxAmount) * chartHeight;
      const xPos = paddingLeft + (idx * barSpacing) + (barSpacing - barWidth) / 2;
      const yPos = containerHeight - paddingBottom - barHeight;

      // Bar Rect
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', xPos);
      rect.setAttribute('y', yPos);
      rect.setAttribute('width', barWidth);
      rect.setAttribute('height', Math.max(barHeight, 2)); // Ensure at least a line is visible
      rect.setAttribute('rx', 3);
      rect.setAttribute('class', 'chart-bar');
      
      // Tooltip/Title
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${m.label} ${m.year}: ${formatCurrency(m.amount)}`;
      rect.appendChild(title);
      
      spendingChart.appendChild(rect);

      // X Label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', xPos + barWidth / 2);
      text.setAttribute('y', containerHeight - paddingBottom + 16);
      text.setAttribute('class', 'chart-text');
      text.textContent = m.label;
      spendingChart.appendChild(text);
    });

    // Draw X Axis
    const axis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    axis.setAttribute('x1', paddingLeft);
    axis.setAttribute('y1', containerHeight - paddingBottom);
    axis.setAttribute('x2', containerWidth - paddingRight);
    axis.setAttribute('y2', containerHeight - paddingBottom);
    axis.setAttribute('class', 'chart-axis');
    spendingChart.appendChild(axis);
  }

  // Filter and Search Receipts
  function getFilteredReceipts() {
    let filtered = allReceipts;

    // Apply Year Filter
    if (selectedYears.size > 0) {
      filtered = filtered.filter(r => {
        const year = new Date(r.transactionDate).getFullYear();
        return selectedYears.has(year);
      });
    }

    // Apply Warehouse Filter
    if (selectedWarehouses.size > 0) {
      filtered = filtered.filter(r => selectedWarehouses.has(r.warehouseName));
    }

    // Apply Hide Returns Filter
    if (hideReturnsCheckbox && hideReturnsCheckbox.checked) {
      filtered = filtered.filter(r => (parseFloat(r.total) || 0) >= 0);
    }

    // Apply Date Range Filter
    if (filterStartDate && filterStartDate.value) {
      const startLimit = new Date(filterStartDate.value + 'T00:00:00');
      filtered = filtered.filter(r => {
        if (!r.transactionDate) return false;
        const rDate = new Date(r.transactionDate);
        return rDate >= startLimit;
      });
    }

    if (filterEndDate && filterEndDate.value) {
      const endLimit = new Date(filterEndDate.value + 'T23:59:59');
      filtered = filtered.filter(r => {
        if (!r.transactionDate) return false;
        const rDate = new Date(r.transactionDate);
        return rDate <= endLimit;
      });
    }

    // Toggle clear button visibility
    if (clearDateFilterBtn) {
      if ((filterStartDate && filterStartDate.value) || (filterEndDate && filterEndDate.value)) {
        clearDateFilterBtn.style.display = 'block';
      } else {
        clearDateFilterBtn.style.display = 'none';
      }
    }

    // Apply Search
    if (activeSearchQuery.trim() !== '') {
      const searchTokens = activeSearchQuery.toLowerCase().split(/\s+/).filter(t => t.length > 0);
      
      filtered = filtered.filter(r => {
        return searchTokens.every(token => {
          // Match warehouse name
          if (r.warehouseName && String(r.warehouseName).toLowerCase().includes(token)) return true;
          // Match warehouse number
          if (r.warehouseNumber && String(r.warehouseNumber).includes(token)) return true;
          // Match Date
          if (r.transactionDate && String(r.transactionDate).includes(token)) return true;

          // Match items in receipt
          if (r.itemArray) {
            const hasMatchingItem = r.itemArray.some(item => {
              const desc1 = String(item.itemDescription01 || '').toLowerCase();
              const desc2 = String(item.itemDescription02 || '').toLowerCase();
              const itemNum = String(item.itemNumber || '').toLowerCase();
              const alias = String(itemAliases[itemNum] || '').toLowerCase();

              // Check abbreviations like "ks" -> "kirkland signature", "org" -> "organic"
              if (matchAbbreviation(token, desc1) || matchAbbreviation(token, desc2)) return true;

              return desc1.includes(token) || 
                     desc2.includes(token) || 
                     itemNum.includes(token) ||
                     alias.includes(token);
            });
            if (hasMatchingItem) return true;
          }

          return false;
        });
      });
    }

    // Apply Sorting
    const sortVal = sortBy.value;
    filtered.sort((a, b) => {
      if (sortVal === 'date-desc') {
        return new Date(b.transactionDate) - new Date(a.transactionDate);
      } else if (sortVal === 'date-asc') {
        return new Date(a.transactionDate) - new Date(b.transactionDate);
      } else if (sortVal === 'total-desc') {
        return (parseFloat(b.total) || 0) - (parseFloat(a.total) || 0);
      } else if (sortVal === 'total-asc') {
        return (parseFloat(a.total) || 0) - (parseFloat(b.total) || 0);
      }
      return 0;
    });

    return filtered;
  }

  // Match abbreviation helpers (e.g. KS matching Kirkland Signature)
  function matchAbbreviation(searchToken, itemDescription) {
    if (searchToken === 'kirkland' || searchToken === 'signature') {
      return itemDescription.includes('ks');
    }
    if (searchToken === 'organic') {
      return itemDescription.includes('org') || itemDescription.includes('or ');
    }
    if (searchToken === 'chicken') {
      return itemDescription.includes('ckn');
    }
    if (searchToken === 'boneless') {
      return itemDescription.includes('bnls');
    }
    if (searchToken === 'sweet') {
      return itemDescription.includes('swt');
    }
    return false;
  }

  // Render the list of receipt cards
  function renderReceiptsGrid() {
    receiptsGrid.innerHTML = '';
    const filtered = getFilteredReceipts();

    receiptsCountLabel.textContent = `Matching Receipts (${filtered.length})`;

    // Update date range label in Overview
    if (statDateRange) {
      if (filtered.length === 0) {
        statDateRange.textContent = '-';
      } else {
        const dates = filtered
          .map(r => r.transactionDate ? new Date(r.transactionDate) : null)
          .filter(d => d !== null && !isNaN(d));
        
        if (dates.length > 0) {
          const minDate = new Date(Math.min(...dates));
          const maxDate = new Date(Math.max(...dates));
          
          const options = { year: 'numeric', month: 'short', day: 'numeric' };
          const minStr = minDate.toLocaleDateString('en-US', options);
          const maxStr = maxDate.toLocaleDateString('en-US', options);
          
          if (minStr === maxStr) {
            statDateRange.textContent = minStr;
          } else {
            statDateRange.textContent = `${minStr} – ${maxStr}`;
          }
        } else {
          statDateRange.textContent = '-';
        }
      }
    }

    if (filtered.length === 0) {
      receiptsGrid.innerHTML = `
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
          </svg>
          <p>No matching receipts found. Try clearing your filters or search terms.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(r => {
      const card = document.createElement('div');
      const isReturn = (parseFloat(r.total) || 0) < 0;
      card.className = 'receipt-card' + (isReturn ? ' is-return' : '');
      
      const rDate = new Date(r.transactionDate);
      const formattedDate = rDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      // Prepare preview of items
      let itemsPreviewHTML = '';
      const limit = 5;
      const items = r.itemArray || [];

      // Calculate matches summary if searching
      let matchedItemsSummaryHTML = '';
      if (activeSearchQuery.trim() !== '') {
        const matchingItems = items.filter(item => isItemMatched(item));
        if (matchingItems.length > 0) {
          const matchLines = matchingItems.map(item => {
            const desc = escapeHTML(item.itemDescription01 || 'Unknown Item');
            const itemNum = escapeHTML(item.itemNumber || '');
            const alias = itemAliases[itemNum] ? ` (${escapeHTML(itemAliases[itemNum])})` : '';
            const purchaseCount = itemPurchaseCounts[itemNum] || 0;
            return `<div class="card-match-highlight">Matched: <strong>${desc}${alias}</strong> (${purchaseCount}x bought)</div>`;
          });
          matchedItemsSummaryHTML = `<div class="card-matches-container">${matchLines.join('')}</div>`;
        }
      }
      
      for (let i = 0; i < Math.min(items.length, limit); i++) {
        const item = items[i];
        const desc = escapeHTML(item.itemDescription01 || 'Unknown Item');
        const itemNum = escapeHTML(item.itemNumber || '');
        const alias = itemAliases[itemNum] ? ` (${escapeHTML(itemAliases[itemNum])})` : '';
        const isMatched = isItemMatched(item);
        
        // Show global purchase frequency badge in card preview
        const purchaseCount = itemPurchaseCounts[itemNum] || 0;
        const freqBadge = purchaseCount > 1 ? ` (${purchaseCount}x bought)` : '';
        
        itemsPreviewHTML += `
          <div class="card-item-tag ${isMatched ? 'matched' : ''}">
            ${item.unit ? `${item.unit}x ` : ''}${desc}${alias}${freqBadge}
          </div>
        `;
      }

      if (items.length > limit) {
        itemsPreviewHTML += `<div class="card-item-tag text-secondary">+ ${items.length - limit} more items</div>`;
      }

      card.innerHTML = `
        <div class="card-header">
          <span class="card-date">${formattedDate}${isReturn ? '<span class="return-badge">Return</span>' : ''}</span>
          <span class="card-total">${formatCurrency(r.total)}</span>
        </div>
        <div>
          <div class="card-warehouse">${escapeHTML(r.warehouseName || 'Costco Wholesale')}</div>
        </div>
        <div class="card-items-preview">
          ${matchedItemsSummaryHTML}
          ${itemsPreviewHTML}
        </div>
        <div class="card-footer">
          <span>TX: ${escapeHTML(r.transactionNumber || 'N/A')}</span>
          <span>${items.length} items</span>
        </div>
      `;

      card.addEventListener('click', () => {
        hoverPreview.classList.remove('active');
        openReceiptModal(r);
      });
      card.addEventListener('mouseenter', () => {
        if (receiptModal.classList.contains('active')) return;
        populateHoverPreview(r);
        positionHoverPreview(card);
      });
      card.addEventListener('mouseleave', () => {
        hoverPreview.classList.remove('active');
      });
      receiptsGrid.appendChild(card);
    });
  }

  // Check if an item matches the active search terms
  function isItemMatched(item) {
    if (activeSearchQuery.trim() === '') return false;
    const tokens = activeSearchQuery.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    const desc1 = String(item.itemDescription01 || '').toLowerCase();
    const desc2 = String(item.itemDescription02 || '').toLowerCase();
    const itemNum = String(item.itemNumber || '').toLowerCase();
    const alias = String(itemAliases[itemNum] || '').toLowerCase();

    return tokens.some(token => {
      return desc1.includes(token) || 
             desc2.includes(token) || 
             itemNum.includes(token) ||
             alias.includes(token) ||
             matchAbbreviation(token, desc1) ||
             matchAbbreviation(token, desc2);
    });
  }

  // Open detailed receipt modal
  function openReceiptModal(receipt) {
    currentOpenReceipt = receipt;
    selectedItemForAlias = null;
    aliasEditorPanel.classList.add('hidden');
    
    // Set Warehouse Details
    recWarehouseNum.textContent = receipt.warehouseNumber || '000';
    recWarehouseAddress.textContent = receipt.warehouseAddress1 || 'Costco Wholesale';
    
    const city = receipt.warehouseCity || '';
    const state = receipt.warehouseState || '';
    const zip = receipt.warehousePostalCode || '';
    recWarehouseCityState.textContent = `${city}, ${state} ${zip}`;

    // Set Meta Details
    recDate.textContent = receipt.transactionDate ? new Date(receipt.transactionDate).toLocaleDateString('en-US') : '00/00/0000';
    
    // Parse time
    let timeStr = '12:00 AM';
    if (receipt.transactionDateTime) {
      const dt = new Date(receipt.transactionDateTime);
      if (!isNaN(dt)) {
        timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      }
    }
    recTime.textContent = timeStr;
    recMembership.textContent = receipt.membershipNumber ? formatMembership(receipt.membershipNumber) : '************';
    recRegister.textContent = receipt.registerNumber || '00';
    recOperator.textContent = receipt.operatorNumber || '00';
    recTransaction.textContent = receipt.transactionNumber || '00';

    // Populate Item Slip
    recItemsList.innerHTML = '';
    const items = receipt.itemArray || [];
    
    items.forEach(item => {
      const itemRow = document.createElement('div');
      itemRow.className = 'receipt-item-row';
      
      const itemNum = String(item.itemNumber || '');
      const desc1 = String(item.itemDescription01 || '');
      const alias = itemAliases[itemNum];
      
      // Determine if this item matches search query
      const isMatched = isItemMatched(item);
      if (isMatched) {
        itemRow.classList.add('matched-highlight');
      }

      // Quantity detail if more than 1 (keep receipt slip clean and authentic)
      let qtyLine = '';
      if (item.unit && parseFloat(item.unit) > 1) {
        qtyLine = `<div class="item-sub-line">${item.unit} @ ${formatCurrency(parseFloat(item.amount) / parseFloat(item.unit))}</div>`;
      }

      const escapedDesc = escapeHTML(desc1);
      const escapedAlias = alias ? escapeHTML(alias) : '';
      const escapedItemNum = escapeHTML(itemNum);
      itemRow.innerHTML = `
        <div class="item-main-line">
          <span class="item-desc">
            ${escapedDesc} 
            ${alias ? `<span class="item-alias-tag">(${escapedAlias})</span>` : ''}
            <span style="font-size: 10px; color: #666; font-weight: normal; margin-left: 5px;">#${escapedItemNum}</span>
          </span>
          <span class="item-price">${formatCurrency(item.amount)}</span>
        </div>
        ${qtyLine}
      `;

      itemRow.addEventListener('click', (e) => {
        // Toggle selected styling
        document.querySelectorAll('.receipt-item-row').forEach(row => row.classList.remove('selected-for-alias'));
        itemRow.classList.add('selected-for-alias');
        
        openAliasEditor(itemNum, desc1);
      });

      recItemsList.appendChild(itemRow);
    });

    // Totals
    recSubtotal.textContent = formatCurrency(receipt.subTotal);
    
    const savings = parseFloat(receipt.instantSavings) || 0;
    if (savings > 0) {
      recInstantSavingsRow.classList.remove('hidden');
      recInstantSavings.textContent = `-${formatCurrency(savings)}`;
    } else {
      recInstantSavingsRow.classList.add('hidden');
    }

    recTax.textContent = formatCurrency(receipt.taxes);
    recTotal.textContent = formatCurrency(receipt.total);

    // Tenders
    recTenders.innerHTML = '';
    const tenders = receipt.tenderArray || [];
    tenders.forEach(t => {
      const tDiv = document.createElement('div');
      tDiv.style.display = 'flex';
      tDiv.style.justifyContent = 'space-between';
      tDiv.innerHTML = `
        <span>${escapeHTML(t.tenderDescription || 'TENDER')}</span>
        <span>${formatCurrency(t.amountTender)}</span>
      `;
      recTenders.appendChild(tDiv);
    });

    const cleanBarcode = getCleanBarcodeNumber(receipt);
    recBarcodeText.textContent = cleanBarcode;
    if (cleanBarcode) {
      recBarcode.innerHTML = generateCode128SVG(cleanBarcode);
      recBarcode.className = 'real-barcode';
    } else {
      recBarcode.innerHTML = '';
      recBarcode.className = 'hidden';
    }
    
    // Open Modal
    receiptModal.classList.add('active');
  }

  // Pure JavaScript dynamic Code 128 SVG Barcode Generator (Offline-friendly)
  function generateCode128SVG(text) {
    const CODE128_PATTERNS = [
      "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", // 0-9
      "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", // 10-19
      "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", // 20-29
      "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", // 30-39
      "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", // 40-49
      "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", // 50-59
      "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", // 60-69
      "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", // 70-79
      "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", // 80-89
      "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", // 90-99
      "114131", "311141", "411131", "211412", "211214", "211232", "2331112" // 100-106 (Start A, Start B, Start C, Stop)
    ];

    const startB = 104;
    const stop = 106;

    // Convert text to indices
    const indices = [];
    indices.push(startB);

    let checksum = startB;
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      let val = charCode - 32;
      if (val < 0 || val > 95) {
        val = 0; // fallback for non-printable char in Set B
      }
      indices.push(val);
      checksum += val * (i + 1);
    }

    checksum = checksum % 103;
    indices.push(checksum);
    indices.push(stop);

    const quietZone = 20;
    const moduleWidth = 2; // module width in pixels
    const barHeight = 85;

    let x = quietZone;
    const svgRects = [];

    for (let i = 0; i < indices.length; i++) {
      const pattern = CODE128_PATTERNS[indices[i]];
      for (let j = 0; j < pattern.length; j++) {
        const width = parseInt(pattern[j], 10) * moduleWidth;
        const isBar = (j % 2 === 0);
        if (isBar) {
          svgRects.push(`<rect x="${x}" y="0" width="${width}" height="${barHeight}" fill="#000000" />`);
        }
        x += width;
      }
    }

    const totalWidth = x + quietZone;

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${totalWidth} ${barHeight}" preserveAspectRatio="xMidYMid meet" style="shape-rendering: crispEdges;">
        <rect x="0" y="0" width="${totalWidth}" height="${barHeight}" fill="#ffffff" />
        ${svgRects.join('')}
      </svg>
    `;
  }

  // Helper to dynamically extract components and build a clean, valid 21-digit Costco barcode number
  function getCleanBarcodeNumber(receipt) {
    if (!receipt) return '';
    
    // If it's already a clean numeric barcode of standard length 21, return it
    if (receipt.transactionBarcode && /^\d{21}$/.test(receipt.transactionBarcode)) {
      return receipt.transactionBarcode;
    }
    
    // If it's numeric, return it
    if (receipt.transactionBarcode && /^\d+$/.test(receipt.transactionBarcode)) {
      return receipt.transactionBarcode;
    }
    
    // Fallback: Dynamically reconstruct standard 21-digit Costco barcode number:
    // Format: 3 [Warehouse 5-digit] [Register 3-digit] [Transaction 5-digit] [MMDDYY Date 6-digit] 0
    try {
      const warehouse = String(receipt.warehouseNumber || '0').replace(/\D/g, '').padStart(5, '0');
      const register = String(receipt.registerNumber || '0').replace(/\D/g, '').padStart(3, '0');
      const transaction = String(receipt.transactionNumber || '0').replace(/\D/g, '').padStart(5, '0');
      
      let dateStr = '000000';
      if (receipt.transactionDate) {
        const d = new Date(receipt.transactionDate);
        if (!isNaN(d.getTime())) {
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const yy = String(d.getFullYear()).slice(-2);
          dateStr = `${mm}${dd}${yy}`;
        }
      }
      
      return `3${warehouse}${register}${transaction}${dateStr}0`;
    } catch (e) {
      console.warn("Could not reconstruct barcode number:", e);
      return String(receipt.transactionBarcode || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    }
  }

  function closeReceiptModal() {
    receiptModal.classList.remove('active');
    currentOpenReceipt = null;
  }

  // Populate the hover receipt preview tooltip
  function populateHoverPreview(receipt) {
    const items = receipt.itemArray || [];
    let itemsHTML = '';
    const displayLimit = 8; // Show a bit more items in hover preview
    
    for (let i = 0; i < Math.min(items.length, displayLimit); i++) {
      const item = items[i];
      const name = escapeHTML(item.itemDescription01 || 'Unknown Item');
      const price = formatCurrency(item.amount);
      itemsHTML += `
        <div class="hover-preview-item">
          <span class="hover-preview-item-name">${name}</span>
          <span class="hover-preview-item-price">${price}</span>
        </div>
      `;
    }
    
    if (items.length > displayLimit) {
      itemsHTML += `
        <div class="hover-preview-item" style="color: #666; font-style: italic;">
          <span>... and ${items.length - displayLimit} more items</span>
        </div>
      `;
    }

    const wNum = escapeHTML(receipt.warehouseNumber || '000');
    const wName = escapeHTML(receipt.warehouseName || 'Costco Wholesale');
    const dateStr = receipt.transactionDate ? new Date(receipt.transactionDate).toLocaleDateString('en-US') : '00/00/0000';
    const txNum = escapeHTML(receipt.transactionNumber || '00');

    hoverPreview.innerHTML = `
      <div class="hover-preview-header">COSTCO WHSE</div>
      <div class="hover-preview-sub">#${wNum} - ${wName}</div>
      <div class="hover-preview-divider"></div>
      <div class="hover-preview-meta">
        <div>DATE: ${dateStr}</div>
        <div>TX: ${txNum}</div>
      </div>
      <div class="hover-preview-divider"></div>
      <div class="hover-preview-items">
        ${itemsHTML}
      </div>
      <div class="hover-preview-divider"></div>
      <div class="hover-preview-totals">
        <div class="hover-preview-total-row">
          <span>TOTAL</span>
          <span>${formatCurrency(receipt.total)}</span>
        </div>
      </div>
    `;
  }

  // Position the hover preview container relative to the hovered card
  function positionHoverPreview(card) {
    const cardRect = card.getBoundingClientRect();
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    // Position it to the right of the card by default
    let top = cardRect.top + scrollTop;
    let left = cardRect.right + scrollLeft + 12;
    
    // Check if there is enough space on the right, otherwise place on the left
    const tooltipWidth = 278; // width of tooltip (250px) + padding + offset
    if (cardRect.right + 12 + tooltipWidth > window.innerWidth) {
      left = cardRect.left + scrollLeft - tooltipWidth;
    }
    
    hoverPreview.style.top = `${top}px`;
    hoverPreview.style.left = `${left}px`;
    hoverPreview.classList.add('active');
  }

  // Open Alias Editor
  function openAliasEditor(itemNumber, itemDescription) {
    selectedItemForAlias = { itemNumber, itemDescription };
    
    const purchaseCount = itemPurchaseCounts[itemNumber] || 0;
    const totalQty = itemTotalQty[itemNumber] || 0;
    
    aliasItemHeader.innerHTML = `
      Edit Nickname for Item #${itemNumber}<br>
      <span style="font-size: 11px; font-weight: normal; color: var(--text-secondary); font-family: var(--font-family);">
        Total Purchases: ${purchaseCount} times (${totalQty} units)
      </span>
    `;
    
    aliasInput.value = itemAliases[itemNumber] || '';
    aliasEditorPanel.classList.remove('hidden');
    aliasInput.focus();
  }

  // Save Alias
  saveAliasBtn.addEventListener('click', async () => {
    if (!selectedItemForAlias) return;

    const nickname = aliasInput.value.trim();
    if (nickname) {
      itemAliases[selectedItemForAlias.itemNumber] = nickname;
    } else {
      delete itemAliases[selectedItemForAlias.itemNumber];
    }

    await saveAliases();
    
    // Refresh UI
    renderDashboard();
    
    // Refresh modal slip if still open
    if (currentOpenReceipt) {
      openReceiptModal(currentOpenReceipt);
    }

    // Hide editor panel
    aliasEditorPanel.classList.add('hidden');
    document.querySelectorAll('.receipt-item-row').forEach(row => row.classList.remove('selected-for-alias'));
  });

  // Modal Closures
  modalCloseBtn.addEventListener('click', closeReceiptModal);
  modalOverlay.addEventListener('click', closeReceiptModal);

  // Print Receipt Button Action
  printReceiptBtn.addEventListener('click', () => {
    const originalTitle = document.title;
    if (currentOpenReceipt && currentOpenReceipt.transactionDate) {
      let dateStr = '';
      const rawDate = currentOpenReceipt.transactionDate;
      if (String(rawDate).includes('T')) {
        dateStr = String(rawDate).split('T')[0];
      } else {
        const dateObj = new Date(rawDate);
        if (!isNaN(dateObj.getTime())) {
          const yyyy = dateObj.getFullYear();
          const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
          const dd = String(dateObj.getDate()).padStart(2, '0');
          dateStr = `${yyyy}-${mm}-${dd}`;
        } else {
          dateStr = String(rawDate);
        }
      }
      document.title = `Costco Receipt ${dateStr}`;
    }
    window.print();
    // Restore title after a short delay so the print job inherits the custom title
    setTimeout(() => {
      document.title = originalTitle;
    }, 150);
  });

  // Search Input Actions
  searchInput.addEventListener('input', () => {
    activeSearchQuery = searchInput.value;
    if (activeSearchQuery.trim() !== '') {
      clearSearchBtn.classList.remove('hidden');
    } else {
      clearSearchBtn.classList.add('hidden');
    }
    renderReceiptsGrid();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    activeSearchQuery = '';
    clearSearchBtn.classList.add('hidden');
    searchInput.focus();
    renderReceiptsGrid();
  });

  sortBy.addEventListener('change', () => {
    renderReceiptsGrid();
  });

  if (hideReturnsCheckbox) {
    hideReturnsCheckbox.addEventListener('change', () => {
      renderReceiptsGrid();
    });
  }

  // Helper to format Date as YYYY-MM-DD (local time)
  function formatDateLocal(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // Update preset active styling based on current filter input values
  function updatePresetActiveStates() {
    const startVal = filterStartDate ? filterStartDate.value : '';
    const endVal = filterEndDate ? filterEndDate.value : '';

    document.querySelectorAll('.date-preset-btn').forEach(btn => {
      btn.classList.remove('active');
    });

    if (!startVal && !endVal) {
      const btn = document.querySelector('.date-preset-btn[data-preset="all"]');
      if (btn) btn.classList.add('active');
      return;
    }

    const todayStr = formatDateLocal(new Date());

    const d3m = new Date();
    d3m.setMonth(d3m.getMonth() - 3);
    const d3mStr = formatDateLocal(d3m);

    const d6m = new Date();
    d6m.setMonth(d6m.getMonth() - 6);
    const d6mStr = formatDateLocal(d6m);

    const d12m = new Date();
    d12m.setMonth(d12m.getMonth() - 12);
    const d12mStr = formatDateLocal(d12m);

    const dytd = new Date(new Date().getFullYear(), 0, 1);
    const dytdStr = formatDateLocal(dytd);

    if (endVal === todayStr) {
      if (startVal === d3mStr) {
        const btn = document.querySelector('.date-preset-btn[data-preset="3m"]');
        if (btn) btn.classList.add('active');
      } else if (startVal === d6mStr) {
        const btn = document.querySelector('.date-preset-btn[data-preset="6m"]');
        if (btn) btn.classList.add('active');
      } else if (startVal === d12mStr) {
        const btn = document.querySelector('.date-preset-btn[data-preset="12m"]');
        if (btn) btn.classList.add('active');
      } else if (startVal === dytdStr) {
        const btn = document.querySelector('.date-preset-btn[data-preset="ytd"]');
        if (btn) btn.classList.add('active');
      }
    }
  }

  // Date range filters change listeners
  const handleDateChange = () => {
    renderReceiptsGrid();
    updatePresetActiveStates();
  };
  
  if (filterStartDate) filterStartDate.addEventListener('change', handleDateChange);
  if (filterEndDate) filterEndDate.addEventListener('change', handleDateChange);
  
  if (clearDateFilterBtn) {
    clearDateFilterBtn.addEventListener('click', () => {
      if (filterStartDate) filterStartDate.value = '';
      if (filterEndDate) filterEndDate.value = '';
      renderReceiptsGrid();
      updatePresetActiveStates();
    });
  }

  // Set up click listeners for preset buttons
  document.querySelectorAll('.date-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-preset');
      const today = new Date();
      const todayStr = formatDateLocal(today);

      if (preset === 'all') {
        if (filterStartDate) filterStartDate.value = '';
        if (filterEndDate) filterEndDate.value = '';
      } else {
        let start = new Date();
        if (preset === '3m') {
          start.setMonth(start.getMonth() - 3);
        } else if (preset === '6m') {
          start.setMonth(start.getMonth() - 6);
        } else if (preset === '12m') {
          start.setMonth(start.getMonth() - 12);
        } else if (preset === 'ytd') {
          start = new Date(today.getFullYear(), 0, 1);
        }
        if (filterStartDate) filterStartDate.value = formatDateLocal(start);
        if (filterEndDate) filterEndDate.value = todayStr;
      }
      
      renderReceiptsGrid();
      updatePresetActiveStates();
    });
  });

  // Window Resize
  window.addEventListener('resize', () => {
    renderChart();
  });

  // Handle Escape Key Closure / Clear Search & Cmd+K Search Focus
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (receiptModal.classList.contains('active')) {
        closeReceiptModal();
      } else {
        if (searchInput.value !== '') {
          searchInput.value = '';
          activeSearchQuery = '';
          clearSearchBtn.classList.add('hidden');
          renderReceiptsGrid();
        }
      }
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  // Export Data Click Handler
  exportDataBtn.addEventListener('click', () => {
    chrome.storage.local.get(['receipts', 'itemAliases', 'lastSyncTime'], (data) => {
      const exportObj = {
        source: 'CostcoReceiptFinder',
        version: 1,
        exportedAt: new Date().toISOString(),
        lastSyncTime: data.lastSyncTime || null,
        itemAliases: data.itemAliases || {},
        receipts: data.receipts || []
      };

      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `costco-receipts-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  });

  // Import Data Click Handler (clicks the hidden file input)
  importDataBtn.addEventListener('click', () => {
    importFileInput.click();
  });

  // Handle Backup Import
  importFileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importObj = JSON.parse(e.target.result);

        // Validation
        if (!importObj || importObj.source !== 'CostcoReceiptFinder') {
          alert('Invalid backup file. Please select a valid Costco Receipt Finder JSON backup file.');
          importFileInput.value = '';
          return;
        }

        const importedReceipts = importObj.receipts || [];
        const importedAliases = importObj.itemAliases || {};
        const importedLastSyncTime = importObj.lastSyncTime;

        if (!Array.isArray(importedReceipts)) {
          alert('Invalid receipts data in backup file.');
          importFileInput.value = '';
          return;
        }

        // Fetch current data to merge
        const currentData = await chrome.storage.local.get(['receipts', 'itemAliases', 'lastSyncTime']);
        const currentReceipts = currentData.receipts || [];
        const currentAliases = currentData.itemAliases || {};

        // Merge Receipts: Deduplicate by unique key
        const receiptMap = new Map();
        currentReceipts.forEach(r => {
          const key = `${r.warehouseNumber}-${r.registerNumber}-${r.transactionNumber}-${r.transactionDate}`;
          receiptMap.set(key, r);
        });

        let newReceiptsCount = 0;
        importedReceipts.forEach(r => {
          const key = `${r.warehouseNumber}-${r.registerNumber}-${r.transactionNumber}-${r.transactionDate}`;
          if (!receiptMap.has(key)) {
            newReceiptsCount++;
          }
          receiptMap.set(key, r);
        });

        const mergedReceipts = Array.from(receiptMap.values());
        // Sort newest first
        mergedReceipts.sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));

        // Merge Aliases: merge keys, incoming overwrites conflicting local ones
        const mergedAliases = Object.assign({}, currentAliases, importedAliases);
        const newAliasesCount = Object.keys(importedAliases).filter(k => !currentAliases[k]).length;

        // Merge Sync Time (take latest)
        let mergedLastSyncTime = currentData.lastSyncTime;
        if (importedLastSyncTime) {
          if (!mergedLastSyncTime || new Date(importedLastSyncTime) > new Date(mergedLastSyncTime)) {
            mergedLastSyncTime = importedLastSyncTime;
          }
        }

        // Save to storage
        await chrome.storage.local.set({
          receipts: mergedReceipts,
          itemAliases: mergedAliases,
          lastSyncTime: mergedLastSyncTime
        });

        alert(`Successfully imported backup!\n- Imported ${importedReceipts.length} receipts (${newReceiptsCount} new)\n- Imported ${Object.keys(importedAliases).length} nicknames (${newAliasesCount} new)`);

        // Reset file input
        importFileInput.value = '';

        // Reload dashboard
        window.location.reload();

      } catch (err) {
        console.error('Failed to import backup:', err);
        alert('Failed to read or parse backup file: ' + err.message);
        importFileInput.value = '';
      }
    };
    reader.readAsText(file);
  });

  // Helpers
  function formatCurrency(val) {
    const num = parseFloat(val);
    if (isNaN(num)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(num);
  }

  function formatMembership(val) {
    if (val.length <= 4) return val;
    return '*'.repeat(val.length - 4) + val.slice(-4);
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
