// State variables
let scans = [];
let html5QrcodeScanner = null;
let audioCtx = null;
let focusLockInterval = null;
let isFocusLocked = true; // Enabled by default for convenience

// Charts instances
let countChartInstance = null;
let weightChartInstance = null;

// Initialize Web Audio API for synthetic scan beeps
function initAudio() {
  if (audioCtx) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
    
    // Play a brief silent sound to unlock context in iOS/Safari
    const buffer = audioCtx.createBuffer(1, 1, 22050);
    const node = audioCtx.createBufferSource();
    node.buffer = buffer;
    node.connect(audioCtx.destination);
    node.start(0);

    const toast = document.getElementById('sound-status-bar');
    toast.classList.add('visible');
    setTimeout(() => {
      toast.classList.remove('visible');
    }, 3000);
  } catch (e) {
    console.warn('Web Audio API not supported or blocked:', e);
  }
}

// Sound effects generator
function playBeep(type = 'success') {
  if (!audioCtx) return;
  
  // Resume context if suspended (browser security)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  if (type === 'success') {
    // Crisp scan beep: 900Hz tone, quick decay
    osc.type = 'sine';
    osc.frequency.setValueAtTime(950, now);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
    osc.start(now);
    osc.stop(now + 0.15);
  } else if (type === 'duplicate') {
    // Duplicate warning: two quick lower pitched tones
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450, now);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(450, now + 0.15);
    gain2.gain.setValueAtTime(0.4, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    
    osc.start(now);
    osc.stop(now + 0.12);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.27);
  } else if (type === 'error') {
    // Error buzz: low buzz
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.4);
  } else if (type === 'bulk') {
    // Success finish sound
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.2);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    osc.start(now);
    osc.stop(now + 0.3);
  }
}

// App initial setup
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Owner Auth (blocks dashboard access if not logged in)
  setupAuth();

  // Initialize Lucide Icons
  lucide.createIcons();

  // Set current date string
  updateDate();

  // Load configuration and data
  loadData();

  // Populate courier dropdown lists dynamically
  populateCourierDropdowns();

  // Setup Event Listeners
  setupNavigation();
  setupTheme();
  setupScannerControls();
  setupScanInput();
  setupBulkImport();
  setupManifestGenerator();
  setupEditModal();
  setupCourierConfig(); // Custom Courier Manager setup

  // Initialize Focus Lock
  manageFocusLock();

  // Render lists and charts
  renderAll();
});

// Update the display date
function updateDate() {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const today = new Date();
  document.getElementById('current-date').textContent = today.toLocaleDateString('en-US', options);
  document.getElementById('pm-date').textContent = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Manage state with localStorage
function loadData() {
  const localScans = localStorage.getItem('cargo_scans');
  if (localScans) {
    try {
      scans = JSON.parse(localScans);
    } catch (e) {
      console.error('Failed to parse scans from localStorage', e);
      scans = [...INITIAL_SCANS];
    }
  } else {
    // Load mock data first time for visual beauty
    scans = [...INITIAL_SCANS];
    saveData();
  }
}

function saveData() {
  localStorage.setItem('cargo_scans', JSON.stringify(scans));
}

// Navigation between Sidebar Tabs
function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const pageTitle = document.getElementById('page-title');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      
      // Update active nav button
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update active tab pane
      tabPanes.forEach(pane => pane.classList.remove('active'));
      const activePane = document.getElementById(`tab-${tabId}`);
      if (activePane) activePane.classList.add('active');

      // Update Header Title based on active tab
      if (tabId === 'dashboard') pageTitle.textContent = 'Operational Dashboard';
      else if (tabId === 'bulk-import') pageTitle.textContent = 'Bulk Tracking Intake';
      else if (tabId === 'manifests') pageTitle.textContent = 'Courier Manifest Generator';
      else if (tabId === 'analytics') {
        pageTitle.textContent = 'Logistics Analytics';
        setTimeout(renderCharts, 100); // Small timeout to ensure canvas is visible for sizing
      }

      // Re-trigger layout icons
      lucide.createIcons();
    });
  });
}

// Theme management (Dark / Light Mode)
function setupTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  const sunIcon = themeToggle.querySelector('.light-icon');
  const moonIcon = themeToggle.querySelector('.dark-icon');
  const label = themeToggle.querySelector('span');

  // Check saved theme or system preference
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeUI(savedTheme);

  themeToggle.addEventListener('click', () => {
    initAudio(); // Initialize audio on first click
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeUI(newTheme);
  });

  function updateThemeUI(theme) {
    if (theme === 'dark') {
      sunIcon.classList.add('hidden');
      moonIcon.classList.remove('hidden');
      label.textContent = 'Dark Mode';
    } else {
      moonIcon.classList.add('hidden');
      sunIcon.classList.remove('hidden');
      label.textContent = 'Light Mode';
    }
  }
}

// Focus Lock mechanism for USB scanner guns
function manageFocusLock() {
  const barcodeInput = document.getElementById('barcode-input');
  const focusBanner = document.getElementById('focus-banner');
  const focusBtn = document.getElementById('btn-focus-lock');

  // Lock function
  function keepFocus() {
    if (isFocusLocked && document.activeElement !== barcodeInput) {
      // Don't hijack focus if user is editing in a modal or select boxes
      if (!document.getElementById('edit-modal').classList.contains('active') && 
          document.activeElement.tagName !== 'SELECT' &&
          document.activeElement.tagName !== 'TEXTAREA') {
        barcodeInput.focus();
      }
    }
  }

  // Set interval to maintain focus
  if (focusLockInterval) clearInterval(focusLockInterval);
  focusLockInterval = setInterval(keepFocus, 1000);

  // Track manual input events
  barcodeInput.addEventListener('focus', () => {
    focusBanner.classList.remove('unfocused');
    focusBanner.querySelector('span').textContent = 'USB Scanner Active. Keep focus here to scan continuously.';
  });

  barcodeInput.addEventListener('blur', () => {
    if (isFocusLocked) {
      // Briefly wait to verify if we moved to something else like a select or modal
      setTimeout(() => {
        if (isFocusLocked && 
            !document.getElementById('edit-modal').classList.contains('active') &&
            document.activeElement.tagName !== 'SELECT' &&
            document.activeElement.tagName !== 'TEXTAREA') {
          barcodeInput.focus();
        } else {
          focusBanner.classList.add('unfocused');
          focusBanner.querySelector('span').textContent = 'Scanner Paused. Click lock focus or scanner input to resume.';
        }
      }, 150);
    } else {
      focusBanner.classList.add('unfocused');
      focusBanner.querySelector('span').textContent = 'Scanner Paused. Click lock focus or scanner input to resume.';
    }
  });

  // Focus lock toggle button
  focusBtn.addEventListener('click', () => {
    initAudio();
    isFocusLocked = !isFocusLocked;
    if (isFocusLocked) {
      barcodeInput.focus();
      focusBtn.innerHTML = '<i data-lucide="lock"></i> Lock Focus';
      focusBtn.classList.remove('btn-secondary');
      focusBtn.classList.add('btn-primary');
    } else {
      barcodeInput.blur();
      focusBtn.innerHTML = '<i data-lucide="unlock"></i> Unlock Focus';
      focusBtn.classList.remove('btn-primary');
      focusBtn.classList.add('btn-secondary');
    }
    lucide.createIcons();
  });
}

// Scanner toggles: USB vs Camera
function setupScannerControls() {
  const usbModeBtn = document.getElementById('scanner-usb-mode');
  const cameraModeBtn = document.getElementById('scanner-camera-mode');
  const usbSection = document.getElementById('usb-scanner-section');
  const cameraSection = document.getElementById('camera-scanner-section');

  usbModeBtn.addEventListener('click', () => {
    initAudio();
    usbModeBtn.classList.add('active');
    cameraModeBtn.classList.remove('active');
    usbSection.classList.add('active');
    cameraSection.classList.remove('active');
    stopCamera();
    isFocusLocked = true;
    manageFocusLock();
  });

  cameraModeBtn.addEventListener('click', () => {
    initAudio();
    cameraModeBtn.classList.add('active');
    usbModeBtn.classList.remove('active');
    cameraSection.classList.add('active');
    usbSection.classList.remove('active');
    isFocusLocked = false;
    if (focusLockInterval) clearInterval(focusLockInterval);
  });

  // Camera start / stop actions
  const startCamBtn = document.getElementById('btn-start-camera');
  const stopCamBtn = document.getElementById('btn-stop-camera');
  const placeholder = document.getElementById('camera-placeholder');
  const cameraControls = document.getElementById('camera-controls');
  const cameraSelect = document.getElementById('camera-select');

  startCamBtn.addEventListener('click', startCamera);
  stopCamBtn.addEventListener('click', stopCamera);

  function startCamera() {
    initAudio();
    placeholder.classList.add('hidden');
    cameraControls.classList.remove('hidden');

    Html5Qrcode.getCameras().then(devices => {
      if (devices && devices.length) {
        cameraSelect.innerHTML = '';
        devices.forEach(device => {
          const opt = document.createElement('option');
          opt.value = device.id;
          opt.text = device.label || `Camera ${cameraSelect.length + 1}`;
          cameraSelect.appendChild(opt);
        });

        // Run scanner on primary camera
        runScanner(devices[0].id);

        cameraSelect.onchange = () => {
          stopScanner().then(() => {
            runScanner(cameraSelect.value);
          });
        };
      } else {
        alert('No cameras found.');
        stopCamera();
      }
    }).catch(err => {
      console.error(err);
      alert('Camera access denied or failed to initialize.');
      stopCamera();
    });
  }

  function runScanner(cameraId) {
    html5QrcodeScanner = new Html5Qrcode("reader");
    html5QrcodeScanner.start(
      cameraId,
      {
        fps: 10,
        qrbox: { width: 250, height: 150 } // Wide box matching barcode format
      },
      (decodedText, decodedResult) => {
        // Successful camera scan
        handleScannedBarcode(decodedText);
      },
      (errorMessage) => {
        // quiet fail on individual frames
      }
    ).catch(err => {
      console.error("Camera startup error: ", err);
    });
  }

  function stopScanner() {
    if (html5QrcodeScanner && html5QrcodeScanner.isScanning) {
      return html5QrcodeScanner.stop();
    }
    return Promise.resolve();
  }

  function stopCamera() {
    stopScanner().then(() => {
      placeholder.classList.remove('hidden');
      cameraControls.classList.add('hidden');
      if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
        html5QrcodeScanner = null;
      }
    }).catch(err => console.error(err));
  }
}

// Intake logic for new scans
function setupScanInput() {
  const barcodeInput = document.getElementById('barcode-input');
  const clearInputBtn = document.getElementById('clear-barcode-input');
  const manualCourier = document.getElementById('manual-courier');
  const manualWeight = document.getElementById('manual-weight');
  const manualNotes = document.getElementById('manual-notes');
  const submitBtn = document.getElementById('btn-submit-scan');

  // Input text changed triggers clear button display
  barcodeInput.addEventListener('input', () => {
    if (barcodeInput.value.trim() !== '') {
      clearInputBtn.style.display = 'flex';
    } else {
      clearInputBtn.style.display = 'none';
    }
  });

  clearInputBtn.addEventListener('click', () => {
    barcodeInput.value = '';
    clearInputBtn.style.display = 'none';
    barcodeInput.focus();
  });

  // Handle enter key (USB scanner outputs Enter automatically)
  barcodeInput.addEventListener('keydown', (e) => {
    initAudio();
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerAddLoad();
    }
  });

  submitBtn.addEventListener('click', () => {
    initAudio();
    triggerAddLoad();
  });

  function triggerAddLoad() {
    const trackingId = barcodeInput.value.trim();
    if (!trackingId) {
      playBeep('error');
      alert('Please enter or scan a valid Tracking ID.');
      return;
    }

    const weightVal = parseFloat(manualWeight.value) || 0.50; // Default weight 500g
    const courierVal = manualCourier.value;
    const notesVal = manualNotes.value.trim();

    const success = addScannedItem(trackingId, courierVal, weightVal, notesVal);
    
    if (success) {
      // Clear input and reset for next quick scan
      barcodeInput.value = '';
      clearInputBtn.style.display = 'none';
      manualWeight.value = '';
      manualNotes.value = '';
      
      // Auto focus back
      if (isFocusLocked) {
        barcodeInput.focus();
      }
    }
  }
}

// Central processing logic for barcode inputs
function handleScannedBarcode(barcode) {
  const cleanBarcode = barcode.trim();
  if (!cleanBarcode) return;
  
  // Trigger scan add with auto detect, default weight
  addScannedItem(cleanBarcode, 'auto', 0.50, '');
}

// Core array insertion
function addScannedItem(trackingId, courierId, weight, notes) {
  // Check for duplicates
  const isDuplicate = scans.some(item => item.trackingId.toLowerCase() === trackingId.toLowerCase());
  
  if (isDuplicate) {
    playBeep('duplicate');
    showScanFlashEffect('danger');
    alert(`Tracking ID "${trackingId}" already scanned!`);
    return false;
  }

  // Detect courier brand
  let finalCourierId = courierId;
  if (courierId === 'auto') {
    finalCourierId = detectCourier(trackingId);
  }

  const newScan = {
    id: 'TXN-' + Math.floor(10000 + Math.random() * 90000),
    trackingId: trackingId,
    courierId: finalCourierId,
    weight: parseFloat(weight) || 0.50,
    status: 'scanned',
    timestamp: new Date().toISOString(),
    notes: notes || ''
  };

  scans.unshift(newScan); // Add at top of list
  saveData();
  playBeep('success');
  showScanFlashEffect('success');
  renderAll();
  return true;
}

// Flash visual effect on scanner input box
function showScanFlashEffect(type) {
  const container = document.querySelector('.scan-center');
  container.classList.add('scan-flash');
  setTimeout(() => {
    container.classList.remove('scan-flash');
  }, 400);
}

// Bulk text-area processing
function setupBulkImport() {
  const textarea = document.getElementById('bulk-textarea');
  const overrideSelect = document.getElementById('bulk-courier-override');
  const defaultWeight = document.getElementById('bulk-default-weight');
  const processBtn = document.getElementById('btn-process-bulk');
  const statusMsg = document.getElementById('bulk-process-status');

  processBtn.addEventListener('click', () => {
    initAudio();
    const text = textarea.value.trim();
    if (!text) {
      statusMsg.className = 'status-msg error';
      statusMsg.textContent = 'Please enter barcode list first.';
      playBeep('error');
      return;
    }

    // Split by new lines
    const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
    let addedCount = 0;
    let duplicateCount = 0;
    
    const chosenCourier = overrideSelect.value;
    const chosenWeight = parseFloat(defaultWeight.value) || 0.50;

    lines.forEach(trackingId => {
      // Check duplicate
      const isDup = scans.some(item => item.trackingId.toLowerCase() === trackingId.toLowerCase());
      if (isDup) {
        duplicateCount++;
        return;
      }

      let finalCourierId = chosenCourier;
      if (chosenCourier === 'auto') {
        finalCourierId = detectCourier(trackingId);
      }

      const item = {
        id: 'TXN-' + Math.floor(10000 + Math.random() * 90000),
        trackingId: trackingId,
        courierId: finalCourierId,
        weight: chosenWeight,
        status: 'scanned',
        timestamp: new Date().toISOString(),
        notes: 'Bulk imported'
      };

      scans.unshift(item);
      addedCount++;
    });

    if (addedCount > 0) {
      saveData();
      renderAll();
      playBeep('bulk');
      textarea.value = '';
      statusMsg.className = 'status-msg success';
      statusMsg.innerHTML = `<i data-lucide="check-circle-2" style="display:inline; width:14px; height:14px;"></i> Imported ${addedCount} packages successfully! (${duplicateCount} duplicates skipped)`;
    } else {
      playBeep('duplicate');
      statusMsg.className = 'status-msg error';
      statusMsg.textContent = `All ${duplicateCount} packages were duplicates and skipped.`;
    }
    lucide.createIcons();
  });
}

// Filters & Searches on Dashboard table
const searchInput = document.getElementById('search-load');
const filterCourier = document.getElementById('filter-courier');
const filterStatus = document.getElementById('filter-status');

[searchInput, filterCourier, filterStatus].forEach(el => {
  el.addEventListener('input', () => {
    renderLoadTable();
  });
});

// Clear all logs
document.getElementById('btn-clear-all').addEventListener('click', () => {
  if (confirm('Are you sure you want to clear all loaded package logs? This cannot be undone.')) {
    scans = [];
    saveData();
    renderAll();
    playBeep('error');
  }
});

// Export Log as Excel-compatible CSV file
document.getElementById('btn-export-csv').addEventListener('click', () => {
  if (scans.length === 0) {
    alert('Log is empty. Nothing to export.');
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Serial No,Transaction ID,Tracking ID,Courier Partner,Weight (kg),Status,Timestamp,Notes\n";

  scans.forEach((scan, index) => {
    const courier = COURIER_PARTNERS.find(p => p.id === scan.courierId) || { name: 'Other' };
    const dateStr = new Date(scan.timestamp).toLocaleString();
    const cleanNotes = scan.notes.replace(/"/g, '""');
    csvContent += `${index + 1},"${scan.id}","${scan.trackingId}","${courier.name}",${scan.weight},"${scan.status}","${dateStr}","${cleanNotes}"\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `JCMS_Manifest_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

// Rendering UI: Header counters, lists
function renderAll() {
  updateStats();
  renderLoadTable();
  updateManifestPanel();
}

function updateStats() {
  const total = scans.length;
  const scanned = scans.filter(s => s.status === 'scanned').length;
  const manifested = scans.filter(s => s.status === 'manifested').length;
  const dispatched = scans.filter(s => s.status === 'dispatched').length;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-scanned').textContent = scanned;
  document.getElementById('stat-manifested').textContent = manifested;
  document.getElementById('stat-dispatched').textContent = dispatched;
}

function renderLoadTable() {
  const tbody = document.getElementById('load-table-body');
  const emptyState = document.getElementById('table-empty-state');
  const searchQuery = searchInput.value.toLowerCase().trim();
  const courierFilter = filterCourier.value;
  const statusFilter = filterStatus.value;

  tbody.innerHTML = '';

  const filteredScans = scans.filter(item => {
    const matchesSearch = item.trackingId.toLowerCase().includes(searchQuery) || item.id.toLowerCase().includes(searchQuery);
    const matchesCourier = courierFilter === 'all' || item.courierId === courierFilter;
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesCourier && matchesStatus;
  });

  if (filteredScans.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  filteredScans.forEach((item, index) => {
    const courier = COURIER_PARTNERS.find(p => p.id === item.courierId) || { name: 'Other', logo: '📦', color: '#64748b' };
    const dateStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="color: var(--text-muted)">${dateStr}</td>
      <td class="tracking-cell">${item.trackingId}</td>
      <td>
        <span class="courier-tag" style="background-color: ${courier.color}">
          ${courier.logo} ${courier.name}
        </span>
      </td>
      <td><strong>${item.weight.toFixed(2)} kg</strong></td>
      <td><span class="badge badge-status ${item.status}">${item.status}</span></td>
      <td class="actions-cell">
        <button class="icon-btn edit-btn" data-id="${item.id}" title="Edit package details">
          <i data-lucide="edit-3" style="width:14px; height:14px;"></i>
        </button>
        <button class="icon-btn delete-btn" style="border-color: rgba(239, 68, 68, 0.2); color: var(--danger)" data-id="${item.id}" title="Delete package">
          <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });

  // Bind edit & delete listeners
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = btn.getAttribute('data-id');
      deleteScanItem(id);
    });
  });

  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = btn.getAttribute('data-id');
      openEditModal(id);
    });
  });

  lucide.createIcons();
}

function deleteScanItem(id) {
  scans = scans.filter(s => s.id !== id);
  saveData();
  renderAll();
}

// Package Edit Modal Handlers
function setupEditModal() {
  const modal = document.getElementById('edit-modal');
  const closeBtn = document.getElementById('btn-close-modal');
  const cancelBtn = document.getElementById('btn-cancel-edit');
  const saveBtn = document.getElementById('btn-save-edit');

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  
  saveBtn.addEventListener('click', () => {
    const id = document.getElementById('edit-index-id').value;
    const courier = document.getElementById('edit-courier').value;
    const weight = parseFloat(document.getElementById('edit-weight').value) || 0.50;
    const status = document.getElementById('edit-status').value;
    const notes = document.getElementById('edit-notes').value.trim();

    const scanIndex = scans.findIndex(s => s.id === id);
    if (scanIndex !== -1) {
      scans[scanIndex].courierId = courier;
      scans[scanIndex].weight = weight;
      scans[scanIndex].status = status;
      scans[scanIndex].notes = notes;
      
      saveData();
      renderAll();
      closeModal();
    }
  });

  function closeModal() {
    modal.classList.remove('active');
  }
}

function openEditModal(id) {
  const item = scans.find(s => s.id === id);
  if (!item) return;

  document.getElementById('edit-index-id').value = item.id;
  document.getElementById('edit-tracking-id').value = item.trackingId;
  document.getElementById('edit-courier').value = item.courierId;
  document.getElementById('edit-weight').value = item.weight;
  document.getElementById('edit-status').value = item.status;
  document.getElementById('edit-notes').value = item.notes;

  const modal = document.getElementById('edit-modal');
  modal.classList.add('active');
}

// Manifest Generation Tab handlers
let selectedManifestIds = [];

function setupManifestGenerator() {
  const courierSelect = document.getElementById('manifest-courier-select');
  const selectAllBtn = document.getElementById('btn-select-all-manifest');
  const generateBtn = document.getElementById('btn-generate-manifest');
  const driverInput = document.getElementById('driver-name');

  courierSelect.addEventListener('change', () => {
    selectedManifestIds = [];
    updateManifestPanel();
  });

  driverInput.addEventListener('input', () => {
    document.getElementById('pm-driver').textContent = driverInput.value.trim() || 'Pending Details';
  });

  selectAllBtn.addEventListener('click', () => {
    const courierVal = courierSelect.value;
    if (!courierVal) return;

    // Filter packages matching courier with status 'scanned'
    const available = scans.filter(s => s.courierId === courierVal && s.status === 'scanned');
    const checkboxes = document.querySelectorAll('.manifest-cb');
    
    // Toggle all
    if (selectedManifestIds.length === available.length) {
      // Uncheck all
      selectedManifestIds = [];
      checkboxes.forEach(cb => cb.checked = false);
    } else {
      // Check all
      selectedManifestIds = available.map(s => s.id);
      checkboxes.forEach(cb => cb.checked = true);
    }
    updatePreviewSheet();
  });

  generateBtn.addEventListener('click', () => {
    initAudio();
    if (selectedManifestIds.length === 0) return;

    // Trigger Print
    window.print();

    // Mark packages as 'manifested' after print dialog opens
    selectedManifestIds.forEach(id => {
      const idx = scans.findIndex(s => s.id === id);
      if (idx !== -1) {
        scans[idx].status = 'manifested';
      }
    });

    saveData();
    renderAll();
    
    // Reset selection
    selectedManifestIds = [];
    updateManifestPanel();
  });
}

function updateManifestPanel() {
  const courierSelect = document.getElementById('manifest-courier-select');
  const container = document.getElementById('manifest-packages-container');
  const countLabel = document.getElementById('available-manifest-count');
  const generateBtn = document.getElementById('btn-generate-manifest');
  
  const courierVal = courierSelect.value;
  if (!courierVal) {
    container.innerHTML = '<div class="selection-placeholder">Please select a Courier Partner to list packages</div>';
    countLabel.textContent = '0';
    generateBtn.disabled = true;
    return;
  }

  const partner = COURIER_PARTNERS.find(p => p.id === courierVal);
  document.getElementById('pm-courier').textContent = partner ? partner.name : courierVal;

  const available = scans.filter(s => s.courierId === courierVal && s.status === 'scanned');
  countLabel.textContent = available.length;

  if (available.length === 0) {
    container.innerHTML = '<div class="selection-placeholder">No packages in "Scanned" status for this Courier.</div>';
    generateBtn.disabled = true;
    updatePreviewSheet();
    return;
  }

  container.innerHTML = '';
  available.forEach(item => {
    const checked = selectedManifestIds.includes(item.id) ? 'checked' : '';
    const row = document.createElement('div');
    row.className = 'manifest-item-row';
    row.innerHTML = `
      <input type="checkbox" class="manifest-cb" data-id="${item.id}" ${checked}>
      <span class="mir-tracking">${item.trackingId}</span>
      <span class="mir-weight">${item.weight.toFixed(2)} kg</span>
    `;

    row.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') {
        const cb = row.querySelector('.manifest-cb');
        cb.checked = !cb.checked;
        toggleManifestSelection(item.id, cb.checked);
      }
    });

    row.querySelector('.manifest-cb').addEventListener('change', (e) => {
      toggleManifestSelection(item.id, e.target.checked);
    });

    container.appendChild(row);
  });

  generateBtn.disabled = selectedManifestIds.length === 0;
  updatePreviewSheet();
}

function toggleManifestSelection(id, checked) {
  if (checked) {
    if (!selectedManifestIds.includes(id)) selectedManifestIds.push(id);
  } else {
    selectedManifestIds = selectedManifestIds.filter(val => val !== id);
  }
  document.getElementById('btn-generate-manifest').disabled = selectedManifestIds.length === 0;
  updatePreviewSheet();
}

// Generate the printable preview sheet
function updatePreviewSheet() {
  const pmTableBody = document.getElementById('pm-table-body');
  const pmTotalQty = document.getElementById('pm-total-qty');
  const pmTotalWt = document.getElementById('pm-total-wt');
  const pmId = document.getElementById('pm-id');

  // Random Manifest ID generator
  pmId.textContent = 'MNF-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + Math.floor(100 + Math.random() * 900);

  if (selectedManifestIds.length === 0) {
    pmTableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 20px; color: var(--text-muted)">
          No packages added to manifest preview. Select packages on the left.
        </td>
      </tr>
    `;
    pmTotalQty.textContent = '0';
    pmTotalWt.textContent = '0.00 kg';
    return;
  }

  pmTableBody.innerHTML = '';
  let totalWeight = 0;

  selectedManifestIds.forEach((id, idx) => {
    const item = scans.find(s => s.id === id);
    if (!item) return;

    totalWeight += item.weight;
    const row = document.createElement('tr');
    
    // Renders the barcode using Libre Barcode font by wrapping in a styling span
    // Barcode requires start/stop characters * for code39 standard, html5 qrcode scans have it already
    const barcodeStr = `*${item.trackingId}*`;

    row.innerHTML = `
      <td style="text-align: center;">${idx + 1}</td>
      <td style="font-family: monospace; font-weight: 600; font-size: 13px;">${item.trackingId}</td>
      <td><span class="barcode-text">${item.trackingId}</span></td>
      <td>${item.weight.toFixed(2)} kg</td>
      <td style="text-transform: capitalize;">${item.status}</td>
    `;
    pmTableBody.appendChild(row);
  });

  pmTotalQty.textContent = selectedManifestIds.length;
  pmTotalWt.textContent = totalWeight.toFixed(2) + ' kg';
}

// Rendering Analytics charts and tables
function renderCharts() {
  const countCanvas = document.getElementById('courier-count-chart');
  const weightCanvas = document.getElementById('courier-weight-chart');
  
  if (!countCanvas || !weightCanvas) return;

  // Aggregate stats per courier
  const dataMap = {};
  COURIER_PARTNERS.forEach(p => {
    dataMap[p.id] = { name: p.name, count: 0, weight: 0, color: p.color };
  });
  dataMap['other'] = { name: 'Other', count: 0, weight: 0, color: '#64748b' };

  scans.forEach(s => {
    const key = dataMap[s.courierId] ? s.courierId : 'other';
    dataMap[key].count++;
    dataMap[key].weight += s.weight;
  });

  const labels = [];
  const counts = [];
  const weights = [];
  const colors = [];
  const breakdownRows = [];
  const totalScans = scans.length;

  for (const key in dataMap) {
    const item = dataMap[key];
    if (item.count > 0 || key === 'other' && totalScans === 0) {
      labels.push(item.name);
      counts.push(item.count);
      weights.push(item.weight.toFixed(2));
      colors.push(item.color);

      // Percentage share
      const share = totalScans > 0 ? ((item.count / totalScans) * 100).toFixed(1) : '0';
      breakdownRows.push(`
        <tr>
          <td><strong>${item.name}</strong></td>
          <td>${item.count}</td>
          <td><strong>${item.weight.toFixed(2)} kg</strong></td>
          <td>
            <div style="display:flex; align-items:center; gap: 8px;">
              <span style="flex-grow:1; background-color:var(--border-color); height:6px; border-radius:3px; overflow:hidden; position:relative; width:60px;">
                <span style="position:absolute; left:0; top:0; height:100%; width:${share}%; background-color:${item.color}; border-radius:3px;"></span>
              </span>
              <span>${share}%</span>
            </div>
          </td>
        </tr>
      `);
    }
  }

  // Populate analytics breakdown table
  document.getElementById('analytics-breakdown-body').innerHTML = breakdownRows.join('') || `
    <tr>
      <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">
        No logistics data available to analyze.
      </td>
    </tr>
  `;

  // Destroy previous charts to redraw cleanly
  if (countChartInstance) countChartInstance.destroy();
  if (weightChartInstance) weightChartInstance.destroy();

  // Create count share chart (Doughnut)
  countChartInstance = new Chart(countCanvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: counts,
        backgroundColor: colors,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: document.documentElement.getAttribute('data-theme') === 'dark' ? '#94A3B8' : '#64748B',
            font: { family: 'Inter', size: 12 }
          }
        }
      }
    }
  });

  // Create weight share chart (Bar)
  weightChartInstance = new Chart(weightCanvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Total Weight (kg)',
        data: weights,
        backgroundColor: colors,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          grid: { color: document.documentElement.getAttribute('data-theme') === 'dark' ? '#1e293b' : '#f1f5f9' },
          ticks: { color: document.documentElement.getAttribute('data-theme') === 'dark' ? '#94A3B8' : '#64748B' }
        },
        x: {
          grid: { display: false },
          ticks: { color: document.documentElement.getAttribute('data-theme') === 'dark' ? '#94A3B8' : '#64748B' }
        }
      }
    }
  });
}

// ==========================================
// NEW JCMS ADDITIONS: OWNER LOGIN & COURIER CONFIG
// ==========================================

// Owner Authentication Logic
function setupAuth() {
  const logoutBtn = document.getElementById('btn-logout');
  const API_BASE = window.location.origin.includes('5000') ? '' : 'http://localhost:5000';

  // Check if session token exists
  const checkSession = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/user/profile`, { credentials: 'include' });
      const data = await res.json();
      
      if (res.ok && data.success) {
        localStorage.setItem('jcms_active_session', 'true');
        localStorage.setItem('jcms_logged_user', data.user.email);
        // Update sidebar username card dynamically
        updateSidebarUserCard(data.user.name || data.user.email);
      } else {
        localStorage.removeItem('jcms_active_session');
        localStorage.removeItem('jcms_logged_user');
        window.location.href = 'auth.html';
      }
    } catch (err) {
      console.error('[JCMS Auth App] Failed checking session state:', err);
      localStorage.removeItem('jcms_active_session');
      localStorage.removeItem('jcms_logged_user');
      window.location.href = 'auth.html';
    }
  };

  // Update Username Display in Sidebar Card
  const updateSidebarUserCard = (emailOrName) => {
    const usernameSpan = document.getElementById('sidebar-username');
    const avatarDiv = document.getElementById('sidebar-avatar');
    if (!emailOrName) {
      if (usernameSpan) usernameSpan.textContent = 'Owner Admin';
      if (avatarDiv) avatarDiv.textContent = 'OA';
      return;
    }
    
    // Extract prefix or capitalize first letter
    const displayName = emailOrName.includes('@') ? emailOrName.split('@')[0] : emailOrName;
    const capitalized = displayName.charAt(0).toUpperCase() + displayName.slice(1);
    const initials = displayName.substring(0, 2).toUpperCase();

    if (usernameSpan) usernameSpan.textContent = capitalized;
    if (avatarDiv) avatarDiv.textContent = initials;
  };

  // Run initial session check
  checkSession();

  // Logout handler
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to log out from JCMS?')) {
        try {
          await fetch(`${API_BASE}/api/logout`, { method: 'POST', credentials: 'include' });
        } catch(err) {
          console.warn('API logout connection error', err);
        }
        localStorage.removeItem('jcms_active_session');
        localStorage.removeItem('jcms_logged_user');
        playBeep('error');
        window.location.href = 'auth.html';
      }
    });
  }
}

// Populate all Courier Dropdowns dynamically
function populateCourierDropdowns() {
  const manualCourier = document.getElementById('manual-courier');
  const filterCourier = document.getElementById('filter-courier');
  const bulkCourierOverride = document.getElementById('bulk-courier-override');
  const manifestCourierSelect = document.getElementById('manifest-courier-select');
  const editCourier = document.getElementById('edit-courier');

  // Preserve selected values where possible
  const prevManual = manualCourier.value;
  const prevFilter = filterCourier.value;
  const prevBulk = bulkCourierOverride.value;
  const prevManifest = manifestCourierSelect.value;
  const prevEdit = editCourier.value;

  // 1. Manual Scan Dropdown
  manualCourier.innerHTML = '<option value="auto">🔍 Auto-Detect Courier</option>';
  COURIER_PARTNERS.forEach(p => {
    manualCourier.innerHTML += `<option value="${p.id}">${p.logo} ${p.name}</option>`;
  });
  manualCourier.innerHTML += '<option value="other">Other / General</option>';
  manualCourier.value = prevManual || 'auto';

  // 2. Filter Dropdown
  filterCourier.innerHTML = '<option value="all">All Couriers</option>';
  COURIER_PARTNERS.forEach(p => {
    filterCourier.innerHTML += `<option value="${p.id}">${p.logo} ${p.name}</option>`;
  });
  filterCourier.innerHTML += '<option value="other">Other</option>';
  filterCourier.value = prevFilter || 'all';

  // 3. Bulk Import Override Dropdown
  bulkCourierOverride.innerHTML = '<option value="auto">🔍 Auto-Detect Each Barcode</option>';
  COURIER_PARTNERS.forEach(p => {
    bulkCourierOverride.innerHTML += `<option value="${p.id}">${p.logo} ${p.name}</option>`;
  });
  bulkCourierOverride.innerHTML += '<option value="other">Other / General</option>';
  bulkCourierOverride.value = prevBulk || 'auto';

  // 4. Manifest Selector Dropdown
  manifestCourierSelect.innerHTML = '<option value="" disabled selected>Choose a courier brand...</option>';
  COURIER_PARTNERS.forEach(p => {
    manifestCourierSelect.innerHTML += `<option value="${p.id}">${p.logo} ${p.name}</option>`;
  });
  manifestCourierSelect.innerHTML += '<option value="other">Other</option>';
  manifestCourierSelect.value = prevManifest || '';

  // 5. Edit Modal Dropdown
  editCourier.innerHTML = '';
  COURIER_PARTNERS.forEach(p => {
    editCourier.innerHTML += `<option value="${p.id}">${p.logo} ${p.name}</option>`;
  });
  editCourier.innerHTML += '<option value="other">Other / General</option>';
  editCourier.value = prevEdit || 'other';
}

// Custom Courier Manager configuration panel
function setupCourierConfig() {
  const form = document.getElementById('add-courier-form');
  const colorInput = document.getElementById('ac-color');
  const colorHexSpan = document.getElementById('color-hex');
  const regexInput = document.getElementById('ac-regex');
  const testInput = document.getElementById('test-tracking-input');
  const testResult = document.getElementById('test-regex-result');
  const resetBtn = document.getElementById('btn-reset-couriers');

  // Update color hex label dynamically
  colorInput.addEventListener('input', () => {
    colorHexSpan.textContent = colorInput.value.toUpperCase();
  });

  // Regex tester utility function
  const runTester = () => {
    const regexStr = regexInput.value.trim();
    const testVal = testInput.value.trim();

    if (!regexStr) {
      testResult.textContent = 'Enter regex pattern above to test';
      testResult.className = 'test-result-indicator';
      return;
    }

    try {
      // Validate pattern syntax
      let cleanPattern = regexStr;
      let flags = '';
      
      const parts = regexStr.match(/^\/(.*?)\/([gimy]*)$/);
      if (parts) {
        cleanPattern = parts[1];
        flags = parts[2];
      }
      
      const rx = new RegExp(cleanPattern, flags);
      
      if (!testVal) {
        testResult.textContent = '✅ Regex format is valid. Enter test ID below to test matches.';
        testResult.className = 'test-result-indicator success';
      } else {
        const matches = rx.test(testVal);
        if (matches) {
          testResult.textContent = '🎉 MATCHES SUCCESSFULLY!';
          testResult.className = 'test-result-indicator success';
        } else {
          testResult.textContent = '❌ DOES NOT MATCH';
          testResult.className = 'test-result-indicator error';
        }
      }
    } catch (e) {
      testResult.textContent = '⚠️ Invalid Regex pattern syntax!';
      testResult.className = 'test-result-indicator error';
    }
  };

  [regexInput, testInput].forEach(el => el.addEventListener('input', runTester));

  // Add courier form submit handler
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    initAudio();

    const name = document.getElementById('ac-name').value.trim();
    const logo = document.getElementById('ac-logo').value.trim();
    const color = colorInput.value;
    const regexStr = regexInput.value.trim();

    // Verify regex validity
    let rx;
    try {
      let cleanPattern = regexStr;
      let flags = '';
      const parts = regexStr.match(/^\/(.*?)\/([gimy]*)$/);
      if (parts) {
        cleanPattern = parts[1];
        flags = parts[2];
      }
      rx = new RegExp(cleanPattern, flags);
    } catch (err) {
      playBeep('error');
      alert('Invalid Regex pattern! Cannot save.');
      return;
    }

    // Generate safe unique ID
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Check if ID already exists
    if (COURIER_PARTNERS.some(p => p.id === id)) {
      playBeep('error');
      alert('A courier partner with this name already exists!');
      return;
    }

    // Save custom courier partner
    const newPartner = {
      id: id,
      name: name,
      logo: logo || '📦',
      color: color,
      regex: rx,
      placeholder: `e.g. tracking number for ${name}`
    };

    COURIER_PARTNERS.push(newPartner);
    saveCourierPartners();
    
    // Reset form fields
    form.reset();
    colorHexSpan.textContent = '#6366F1';
    testResult.textContent = 'Enter regex and sample ID to test';
    testResult.className = 'test-result-indicator';
    
    // Propagate changes
    populateCourierDropdowns();
    renderAll();
    renderCourierListTable();
    playBeep('bulk');
    alert(`Courier "${name}" added successfully!`);
  });

  // Reset defaults button
  resetBtn.addEventListener('click', () => {
    initAudio();
    if (confirm('Are you sure you want to restore default courier configurations? All custom couriers will be removed.')) {
      localStorage.removeItem('jcms_couriers');
      initCourierPartners();
      populateCourierDropdowns();
      renderAll();
      renderCourierListTable();
      playBeep('error');
      alert('Courier configurations reset to defaults.');
    }
  });

  // Load list table
  renderCourierListTable();
}

// Render the active courier configurations table in Settings
function renderCourierListTable() {
  const tbody = document.getElementById('couriers-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';
  COURIER_PARTNERS.forEach(p => {
    const isDefault = DEFAULT_COURIER_PARTNERS.some(d => d.id === p.id);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size: 20px; text-align:center;">${p.logo || '📦'}</td>
      <td>
        <span class="courier-tag" style="background-color: ${p.color}">
          ${p.name}
        </span>
      </td>
      <td style="font-family: monospace; font-size:12px; color:var(--text-muted);">${p.regex.toString()}</td>
      <td>
        ${isDefault ? 
          `<span style="font-size:11px; color:var(--text-muted); font-weight:600; text-transform:uppercase;">System</span>` : 
          `<button class="icon-btn delete-courier-btn" data-id="${p.id}" style="border-color: rgba(239, 68, 68, 0.2); color: var(--danger)" title="Remove Custom Courier">
             <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
           </button>`
        }
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Bind delete custom courier buttons
  document.querySelectorAll('.delete-courier-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (confirm('Delete this custom courier partner? Packages matching this courier will fallback to "Other".')) {
        // Remove from list
        COURIER_PARTNERS = COURIER_PARTNERS.filter(p => p.id !== id);
        saveCourierPartners();
        
        // Propagate updates
        populateCourierDropdowns();
        renderAll();
        renderCourierListTable();
        playBeep('error');
      }
    });
  });

  lucide.createIcons();
}
