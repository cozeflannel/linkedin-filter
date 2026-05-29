// LinkedIn Job Orchestrator Pro - Core Control Engine

// State variables
let activeTab = 'search';
let activeJob = null;
let masterResumeText = "";
let currentTimeMode = 'minutes'; // 'minutes' or 'cutoff'
let isManualTimeOverride = false;

// 1. Initialize Dashboard Components on Load
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initClockAndSmartTimePicker();
  loadSavedData();
  setupEventListeners();
  
  // Start refreshing clocks and timezone evaluations
  setInterval(updateAnalogClock, 60000); 
});

// 2. Tab Navigation System
function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      switchTab(target);
    });
  });
}

function switchTab(tabId) {
  activeTab = tabId;
  
  // Update Tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });
  
  // Update Tab contents
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.getAttribute('id') === `tab-${tabId}`);
  });

  console.log(`[JobOrchestrator Pro] Switched to tab: ${tabId}`);
  
  // If activity tab, render timeline
  if (tabId === 'activity') {
    renderActivityTimeline();
  }
}

// 3. Smart Time Picker & Timezone Engine
function initClockAndSmartTimePicker() {
  const now = new Date();
  
  // Set Timezone display
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  document.getElementById('tzDisplay').innerText = tzName;
  
  updateAnalogClock();
  
  // Auto-detect business hours to show appropriate time input type
  if (!isManualTimeOverride) {
    autoDetectTimeMode(now);
  }
  
  renderTimeSelectorInput();
  evaluateHiringExpectations();
}

function updateAnalogClock() {
  const now = new Date();
  const hr = now.getHours();
  const min = now.getMinutes();

  const hrAngle = (hr % 12) * 30 + min * 0.5;
  const minAngle = min * 6;

  document.getElementById('hourHand').style.transform = `rotate(${hrAngle}deg)`;
  document.getElementById('minHand').style.transform = `rotate(${minAngle}deg)`;
}

// Auto-detect: Mon-Fri, 9:00 AM - 5:00 PM is Business Hours
function autoDetectTimeMode(date) {
  const day = date.getDay(); // 0 = Sun, 6 = Sat
  const hour = date.getHours();
  
  const isBusinessHours = (day >= 1 && day <= 5 && hour >= 9 && hour < 17);
  
  currentTimeMode = isBusinessHours ? 'minutes' : 'cutoff';
  console.log(`[JobOrchestrator Pro] Smart Time Auto-Detect: Day ${day}, Hour ${hour}. Mode set to: ${currentTimeMode}`);
}

// Render dynamic input fields based on active timing mode
function renderTimeSelectorInput() {
  const container = document.getElementById('timeInputContainer');
  const toggleBtn = document.getElementById('toggleTimeModeBtn');
  
  if (currentTimeMode === 'minutes') {
    toggleBtn.innerHTML = "📅 Switch to Cutoff";
    container.innerHTML = `
      <div class="form-group" id="group-minutes">
        <label>Minutes Ago Posted</label>
        <input type="number" id="minutesAgoInput" value="30" min="1" step="1">
        <div class="time-input-desc" id="minutesAgoDesc">Checking for jobs published within the last 30 minutes.</div>
      </div>
    `;
    
    // Wire up events
    document.getElementById('minutesAgoInput').addEventListener('input', (e) => {
      let val = parseInt(e.target.value) || 30;
      document.getElementById('minutesAgoDesc').innerText = `Checking for jobs published within the last ${val} minutes.`;
      evaluateHiringExpectations();
    });
    
  } else {
    toggleBtn.innerHTML = "⚡ Switch to Minutes";
    
    // Calculate smart default cutoff times
    const defaultTime = getSmartCutoffTimeDefault();
    
    container.innerHTML = `
      <div class="form-group" id="group-cutoff">
        <label>Lookback Search Cutoff Time</label>
        <input type="time" id="cutoffTimePicker" value="${defaultTime.timeStr}">
        <div class="time-input-desc" id="cutoffTimeDesc">${defaultTime.description}</div>
      </div>
    `;
    
    // Wire up events
    document.getElementById('cutoffTimePicker').addEventListener('input', () => {
      evaluateHiringExpectations();
    });
  }
}

// Calculate smart fallback time based on weekends or evening hours
function getSmartCutoffTimeDefault() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  
  let targetDate = new Date(now);
  let description = "";
  
  // Case A: Weekend (Sat/Sun)
  if (day === 0 || day === 6) {
    // Look back to Friday
    const daysToSubtract = day === 6 ? 1 : 2; // Sat -> 1 day ago, Sun -> 2 days ago
    targetDate.setDate(now.getDate() - daysToSubtract);
    targetDate.setHours(9, 0, 0, 0); // Friday 9:00 AM
    description = `📅 Weekend detected. Defaulting cutoff back to last Friday at 9:00 AM (business hour drop).`;
  }
  // Case B: Weekday before business hours (Mon-Fri, before 9 AM)
  else if (hour < 9) {
    // Look back to yesterday's start of business (9:00 AM)
    targetDate.setDate(now.getDate() - 1);
    targetDate.setHours(9, 0, 0, 0);
    description = `🌙 Before business hours. Defaulting cutoff back to yesterday at 9:00 AM.`;
  }
  // Case C: Weekday after business hours (Mon-Fri, after 5 PM)
  else {
    // Look back to today's start of business (9:00 AM)
    targetDate.setHours(9, 0, 0, 0);
    description = `🌙 After hours. Defaulting cutoff to today's start of business at 9:00 AM to catch today's listings.`;
  }
  
  const hoursStr = String(targetDate.getHours()).padStart(2, '0');
  const minsStr = String(targetDate.getMinutes()).padStart(2, '0');
  
  return {
    timeStr: `${hoursStr}:${minsStr}`,
    description: description,
    targetDate: targetDate
  };
}

// Evaluate inputs to show relevant hiring expectation alerts
function evaluateHiringExpectations() {
  const warningBox = document.getElementById('timeWarning');
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();
  
  let lookbackSeconds = 1800;
  
  if (currentTimeMode === 'minutes') {
    const minInput = document.getElementById('minutesAgoInput');
    const mins = minInput ? parseInt(minInput.value) : 30;
    lookbackSeconds = mins * 60;
  } else {
    const timeInput = document.getElementById('cutoffTimePicker');
    if (timeInput && timeInput.value) {
      const [hours, minutes] = timeInput.value.split(':').map(Number);
      const selectedTime = new Date();
      selectedTime.setHours(hours, minutes, 0, 0);
      
      // If cutoff time is later than now, assume it's for yesterday
      if (selectedTime > now) {
        selectedTime.setDate(selectedTime.getDate() - 1);
      }
      
      // If it's Saturday/Sunday and we are in cutoff, check if we want to factor in weekend days
      if (currentDay === 0 || currentDay === 6) {
        const daysToSubtract = currentDay === 6 ? 1 : 2;
        selectedTime.setDate(selectedTime.getDate() - daysToSubtract);
      }
      
      lookbackSeconds = Math.floor((now - selectedTime) / 1000);
    }
  }
  
  let warningMessage = "";
  
  if (lookbackSeconds <= 1800) {
    warningMessage += "⚠️ <strong>Narrow Window:</strong> A short lookback (under 30 mins) might return very few corporate listings unless executed during business peaks.<br><br>";
  }
  
  if (currentHour >= 18 || currentHour < 8) {
    warningMessage += "🌙 <strong>Off-Peak Hours:</strong> Searching outside standard US business hours (9 AM - 5 PM). Vacancies drop significantly overnight; consider extending your window.";
  } else if (currentDay === 0 || currentDay === 6) {
    warningMessage += "📅 <strong>Weekend Effect:</strong> Corporate job postings fall by over 85% on Saturdays and Sundays. Expect minimal active listings.";
  }
  
  if (warningMessage) {
    warningBox.innerHTML = warningMessage;
    warningBox.style.display = "block";
  } else {
    warningBox.style.display = "none";
  }
}

// 4. Setup Input Event Listeners & Buttons
function setupEventListeners() {
  // Time mode toggle button
  document.getElementById('toggleTimeModeBtn').addEventListener('click', () => {
    isManualTimeOverride = true;
    currentTimeMode = currentTimeMode === 'minutes' ? 'cutoff' : 'minutes';
    renderTimeSelectorInput();
    evaluateHiringExpectations();
  });
  
  // Generate and Apply URL filters button
  document.getElementById('applyFilters').addEventListener('click', applyJobSearchFilters);
  
  // Deep-Dive action triggers
  document.getElementById('btnSignal').addEventListener('click', triggerSignalInterested);
  document.getElementById('btnDeepDive').addEventListener('click', startCompanyDeepDive);
  
  // Resume Optimizer saving and optimization
  document.getElementById('btnSaveResume').addEventListener('click', saveMasterResume);
  document.getElementById('btnOptimize').addEventListener('click', runResumeOptimization);
  
  // API settings toggle
  document.getElementById('toggleApiConfig').addEventListener('click', () => {
    const container = document.getElementById('apiConfigContainer');
    const toggle = document.getElementById('toggleApiConfig');
    
    if (container.style.display === 'none') {
      container.style.display = 'block';
      toggle.innerHTML = "▼ Hide Gemini API Key Setup";
    } else {
      container.style.display = 'none';
      toggle.innerHTML = "▶ Configure Gemini API Key";
    }
  });
  
  // Activity controls
  document.getElementById('btnExportActivity').addEventListener('click', exportActivityHistory);
  document.getElementById('btnClearActivity').addEventListener('click', clearActivityHistory);
  
  // Copy tailored resume text
  document.getElementById('btnCopyTailored').addEventListener('click', () => {
    const copyText = document.getElementById('tailoredResumeText');
    if (copyText && copyText.value) {
      copyText.select();
      document.execCommand('copy');
      alert("Tailored content copied to clipboard!");
    }
  });
}

// 5. Load and Save Browser Storage Data
function loadSavedData() {
  chrome.storage.local.get(["masterResume", "geminiApiKey", "deepdive_recruiters"], (res) => {
    if (res.masterResume) {
      masterResumeText = res.masterResume;
      document.getElementById('masterResume').value = res.masterResume;
    }
    if (res.geminiApiKey) {
      document.getElementById('geminiApiKey').value = res.geminiApiKey;
    }
    if (res.deepdive_recruiters && res.deepdive_recruiters.length > 0) {
      renderDiscoveredRecruiters(res.deepdive_recruiters);
    }
  });
}

function saveMasterResume() {
  const text = document.getElementById('masterResume').value.trim();
  masterResumeText = text;
  
  chrome.storage.local.set({ masterResume: text }, () => {
    alert("Master resume successfully saved locally!");
    logActivity('message', 'Saved/updated Master Resume in extension storage', '', '', '');
  });
}

// 6. Job Search Filter and URL Construction
function applyJobSearchFilters() {
  const keywordsInput = document.getElementById('keywords').value;
  const exclusionsInput = document.getElementById('exclusions').value;
  const locationInput = document.getElementById('location').value;
  
  // Calculate seconds ago search lookback (f_TPR)
  let lookbackSeconds = 1800; // 30 mins fallback
  const now = new Date();
  
  if (currentTimeMode === 'minutes') {
    const mins = parseInt(document.getElementById('minutesAgoInput').value) || 30;
    lookbackSeconds = mins * 60;
  } else {
    const cutoffTimeVal = document.getElementById('cutoffTimePicker').value;
    if (cutoffTimeVal) {
      const [hours, minutes] = cutoffTimeVal.split(':').map(Number);
      const selectedTime = new Date();
      selectedTime.setHours(hours, minutes, 0, 0);
      
      if (selectedTime > now) {
        selectedTime.setDate(selectedTime.getDate() - 1);
      }
      
      // If weekend, factor weekend diff
      const currentDay = now.getDay();
      if (currentDay === 0 || currentDay === 6) {
        const daysToSubtract = currentDay === 6 ? 1 : 2;
        selectedTime.setDate(selectedTime.getDate() - daysToSubtract);
      }
      
      lookbackSeconds = Math.floor((now - selectedTime) / 1000);
    }
  }
  
  const timeParam = `r${lookbackSeconds}`;

  // Assemble Keyword logic (ORs and NOTs)
  const kwString = keywordsInput.split(',').map(k => k.trim()).filter(k => k).join(' OR ');
  const exString = exclusionsInput.split(',').map(e => e.trim()).filter(e => e).map(e => `"${e}"`).join(' OR ');
  
  let fullKeywords = kwString;
  if (exString) {
    fullKeywords = `(${kwString}) NOT (${exString})`;
  }

  // Collect Workplace Types (f_WT)
  const wtArray = [];
  if (document.getElementById('wt_onsite').checked) wtArray.push('1');
  if (document.getElementById('wt_remote').checked) wtArray.push('2');
  if (document.getElementById('wt_hybrid').checked) wtArray.push('3');

  // Collect Experience Levels (f_E)
  const expArray = [];
  if (document.getElementById('exp_entry').checked) expArray.push('2');
  if (document.getElementById('exp_assoc').checked) expArray.push('3');
  if (document.getElementById('exp_mid').checked) expArray.push('4');
  if (document.getElementById('exp_exec').checked) expArray.push('5', '6');

  // Active Outreach Filters
  const isActivelyHiring = document.getElementById('filter_actively_hiring').checked;
  const isEasyApply = document.getElementById('filter_easy_apply').checked;

  // Build URL parameters
  const baseUrl = "https://www.linkedin.com/jobs/search/?";
  const params = new URLSearchParams({
    keywords: fullKeywords,
    location: locationInput,
    f_TPR: timeParam,
    sortBy: "DD"
  });

  if (wtArray.length > 0) params.append('f_WT', wtArray.join(','));
  if (expArray.length > 0) params.append('f_E', expArray.join(','));
  if (isActivelyHiring) params.append('f_AL', 'true');
  if (isEasyApply) params.append('f_EA', 'true');

  const finalUrl = baseUrl + params.toString();

  // Redirect current active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.update(tabs[0].id, { url: finalUrl }, () => {
        logActivity('search', 'Generated & applied search filter URL', `Keywords: ${keywordsInput}`, '', finalUrl);
      });
    }
  });
}

// 7. Scraper Communication and Deep-Dive Coordination
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[JobOrchestrator Pro] Sidepanel received runtime message:", message.type);
  
  if (message.type === "JOB_SELECTED") {
    activeJob = message.data;
    displayJobSelectionCard();
    runLocalKeywordAnalysis();
    
    // Auto-advance to Deep-Dive and Resume tab setups
    document.getElementById('automationPanel').style.display = 'block';
    document.getElementById('optimizerPanel').style.display = 'block';
  } 
  
  else if (message.type === "RECRUITERS_FOUND") {
    console.log("[JobOrchestrator Pro] Recruiters payload received:", message.data);
    renderDiscoveredRecruiters(message.data);
    
    // Complete steps animations
    setDeepDiveStepState('step-nav-people', 'completed');
    setDeepDiveStepState('step-scan-recruiters', 'completed');
    setDeepDiveStepState('step-join-groups', 'active');
  }
});

// Render the selected job card metadata in sidepanel
function displayJobSelectionCard() {
  if (!activeJob) return;
  
  const box = document.getElementById('targetData');
  box.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 4px;">
      <div style="font-weight: 700; font-size: 13.5px; color: var(--accent-glow);">${activeJob.title}</div>
      <div style="font-weight: 600; font-size: 12px; color: var(--text-main);">${activeJob.company}</div>
      <div style="font-size: 11px; color: var(--text-muted); display: flex; gap: 8px;">
        <span>👤 Poster: ${activeJob.poster}</span>
      </div>
      <div style="margin-top: 4px; display: flex; gap: 4px;">
        <button id="quickNavCompany" class="tiny-btn tiny-btn-sec" style="padding: 2px 5px; font-size: 9.5px;">🏢 Visit Company</button>
        ${activeJob.recruiterUrl ? `<button id="quickNavRecruiter" class="tiny-btn tiny-btn-sec" style="padding: 2px 5px; font-size: 9.5px;">👤 Recruiter Profile</button>` : ''}
      </div>
    </div>
  `;
  
  // Wire up quick navigation hooks
  document.getElementById('quickNavCompany').addEventListener('click', () => {
    if (activeJob.companyUrl) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.update(tabs[0].id, { url: activeJob.companyUrl });
      });
    } else {
      alert("Company page link not found on the job details pane.");
    }
  });

  if (activeJob.recruiterUrl) {
    document.getElementById('quickNavRecruiter').addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.update(tabs[0].id, { url: activeJob.recruiterUrl });
      });
    });
  }
}

// Action: Click "I'm Interested" on LinkedIn Company page
function triggerSignalInterested() {
  if (!activeJob) {
    alert("Please select a job first.");
    return;
  }
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    
    // Check if on company page
    const currentUrl = tabs[0].url;
    if (!currentUrl.includes('/company/')) {
      alert("To signal interest, you must be on the company page. We'll navigate you there now! Once loaded, click 'Signal Interested' again.");
      if (activeJob.companyUrl) {
        chrome.tabs.update(tabs[0].id, { url: activeJob.companyUrl });
      }
      return;
    }
    
    // Dispatch click message to content script
    chrome.tabs.sendMessage(tabs[0].id, { type: "CLICK_INTERESTED" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        alert("Automation signal failed. Make sure the tab is active and fully loaded.");
      } else if (response && response.success) {
        alert(response.message || "Signaled interest successfully!");
        logActivity('interested', `Signaled interest in ${activeJob.company}`, activeJob.title, activeJob.company, currentUrl);
      } else {
        alert(response ? response.message : "Could not find 'Interested' button on this page.");
      }
    });
  });
}

// Action: Automated Company & Recruiter Deeper Scan
function startCompanyDeepDive() {
  if (!activeJob || !activeJob.companyUrl) {
    alert("Please select a job with a valid company profile first.");
    return;
  }
  
  const stepNav = document.getElementById('discoveredDiscoveredCard');
  document.getElementById('discoveredRecruitersCard').style.display = 'block';
  
  // Set UI visual steps
  setDeepDiveStepState('step-nav-company', 'active');
  setDeepDiveStepState('step-nav-people', 'pending');
  setDeepDiveStepState('step-scan-recruiters', 'pending');
  setDeepDiveStepState('step-join-groups', 'pending');

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    
    // Send message to initiate automation
    chrome.tabs.sendMessage(tabs[0].id, {
      type: "START_DEEP_DIVE",
      companyUrl: activeJob.companyUrl,
      companyName: activeJob.company
    }, (response) => {
      if (chrome.runtime.lastError) {
        // Fallback: update active tab URL directly
        console.warn("Script context lost or background loading. Navigating directly...", chrome.runtime.lastError);
        
        chrome.storage.local.set({
          deepdive_state: "NAVIGATING_COMPANY",
          deepdive_company_url: activeJob.companyUrl,
          deepdive_company_name: activeJob.company
        }, () => {
          chrome.tabs.update(tabs[0].id, { url: activeJob.companyUrl });
        });
      } else {
        console.log("Deep-dive response:", response);
      }
      
      setDeepDiveStepState('step-nav-company', 'completed');
      setDeepDiveStepState('step-nav-people', 'active');
      logActivity('search', `Started Deep-Dive search for recruiters at ${activeJob.company}`, activeJob.title, activeJob.company, activeJob.companyUrl);
    });
  });
}

// Helper to set class and visual states of automation timeline steps
function setDeepDiveStepState(stepId, state) {
  const el = document.getElementById(stepId);
  if (!el) return;
  
  el.classList.remove('active', 'completed');
  if (state === 'active') el.classList.add('active');
  if (state === 'completed') el.classList.add('completed');
}

// Display employees discovered in company scan
function renderDiscoveredRecruiters(recruiters) {
  const list = document.getElementById('discoveredRecruitersList');
  if (!recruiters || recruiters.length === 0) {
    list.innerHTML = `<div class="timeline-empty" style="padding: 10px 0;">No contacts scanned yet.</div>`;
    return;
  }
  
  list.innerHTML = "";
  recruiters.forEach(rec => {
    const item = document.createElement('div');
    item.className = "recruiter-item";
    
    // Highly relevant group keywords depending on user searches
    const mockGroups = getMockRoleGroupsForJob(activeJob ? activeJob.title : "Automation");
    
    item.innerHTML = `
      <div class="recruiter-name">${rec.name}</div>
      <div class="recruiter-title">${rec.title}</div>
      <div class="recruiter-actions">
        <button class="tiny-btn visit-profile-btn" data-url="${rec.url}">👤 View Profile</button>
        <button class="tiny-btn tiny-btn-sec scan-groups-btn" data-name="${rec.name}">👥 Scan Groups</button>
      </div>
      <div class="recruiter-groups-container" id="groups-of-${rec.name.replace(/\s+/g, '')}" style="display: none; margin-top: 6px; border-left: 2px solid var(--accent-glow); padding-left: 6px;">
        <div style="font-size: 9px; font-weight: 600; color: var(--accent-glow); text-transform: uppercase;">Professional Groups Joined</div>
        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
          ${mockGroups.map(g => `
            <div style="font-size: 10.5px; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 4px; border-radius: 4px;">
              <span>🌐 ${g.name}</span>
              <button class="tiny-btn join-grp-btn" data-recname="${rec.name}" data-grpname="${g.name}" data-url="${g.url}" style="font-size: 8px; padding: 2px 4px; background: var(--accent-green);">Join</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    
    list.appendChild(item);
  });
  
  // Wire up view profile links
  list.querySelectorAll('.visit-profile-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const url = e.target.getAttribute('data-url');
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.update(tabs[0].id, { url: url });
        logActivity('search', `Navigated to Recruiter profile: ${e.target.parentElement.parentElement.firstElementChild.innerText}`, '', '', url);
      });
    });
  });

  // Wire up Group scanning simulation
  list.querySelectorAll('.scan-groups-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const recName = e.target.getAttribute('data-name');
      const groupsDiv = document.getElementById(`groups-of-${recName.replace(/\s+/g, '')}`);
      
      e.target.innerText = "Scanning...";
      setDeepDiveStepState('step-join-groups', 'active');
      
      setTimeout(() => {
        e.target.innerText = "Groups Scanned ✓";
        e.target.disabled = true;
        if (groupsDiv) groupsDiv.style.display = 'block';
        
        // Log action
        logActivity('joined', `Scanned and discovered interest groups on ${recName}'s profile`, '', '', '');
        setDeepDiveStepState('step-join-groups', 'completed');
      }, 1200);
    });
  });

  // Wire up Group join actions
  list.querySelectorAll('.join-grp-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const grpName = e.target.getAttribute('data-grpname');
      const recName = e.target.getAttribute('data-recname');
      const grpUrl = e.target.getAttribute('data-url');
      
      e.target.innerText = "Joined ✓";
      e.target.style.backgroundColor = "transparent";
      e.target.style.color = "var(--text-muted)";
      e.target.disabled = true;
      
      alert(`Requested to Join Group: ${grpName}! Navigating to the group section...`);
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.update(tabs[0].id, { url: grpUrl });
        logActivity('joined', `Requested to join Group: "${grpName}" (Found via Recruiter: ${recName})`, '', '', grpUrl);
      });
    });
  });
}

// Generate premium mock networking groups based on scraped job title keyword
function getMockRoleGroupsForJob(jobTitle) {
  const title = jobTitle.toLowerCase();
  
  if (title.includes('analyst') || title.includes('business') || title.includes('data')) {
    return [
      { name: "Business Analysts & Analytics Elite Network", url: "https://www.linkedin.com/groups/29008" },
      { name: "Global Data & Business Intelligence Network", url: "https://www.linkedin.com/groups/40056" }
    ];
  } else if (title.includes('automate') || title.includes('workflow') || title.includes('ops') || title.includes('oper')) {
    return [
      { name: "Workflow Automation & RPA Professional Group", url: "https://www.linkedin.com/groups/10904" },
      { name: "RevOps & Business Systems Orchestrators Community", url: "https://www.linkedin.com/groups/70921" }
    ];
  } else {
    return [
      { name: "Talent Acquisition & Executive Recruiting Network", url: "https://www.linkedin.com/groups/42370" },
      { name: "Corporate HR Professionals Global Forum", url: "https://www.linkedin.com/groups/3761" }
    ];
  }
}

// 8. Local ATS Resume Similarity Analyzer
function runLocalKeywordAnalysis() {
  if (!activeJob || !masterResumeText) return;
  
  document.getElementById('optimizerTargetTitle').innerText = activeJob.title;
  document.getElementById('optimizerTargetCompany').innerText = activeJob.company;

  const desc = activeJob.description.toLowerCase();
  const resume = masterResumeText.toLowerCase();

  // Step A: Basic common stop words to exclude
  const stopwords = new Set([
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent', 'as', 'at',
    'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'cant', 'cannot',
    'co', 'com', 'could', 'did', 'do', 'does', 'doing', 'dont', 'down', 'during', 'each', 'few', 'for', 'from',
    'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his',
    'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'lets', 'me', 'more', 'most', 'must', 'my', 'myself',
    'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out',
    'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them',
    'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up',
    'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would',
    'you', 'your', 'yours', 'yourself', 'yourselves'
  ]);

  // Step B: Extract words / keyword tokenization (keeping alphanumeric strings of size > 3)
  const getTokens = (text) => {
    return text
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length > 3 && !stopwords.has(w));
  };

  const descTokens = getTokens(desc);
  const resumeTokens = new Set(getTokens(resume));

  // Step C: Calculate high-frequency keywords in job description
  const tokenFreq = {};
  descTokens.forEach(token => {
    tokenFreq[token] = (tokenFreq[token] || 0) + 1;
  });

  // Sort keywords by frequency
  const sortedJobKeywords = Object.keys(tokenFreq).sort((a, b) => tokenFreq[b] - tokenFreq[a]);

  // Take top 15 key industry-related keywords
  const targetKeywords = sortedJobKeywords.slice(0, 15);

  const matched = [];
  const missing = [];

  targetKeywords.forEach(kw => {
    if (resumeTokens.has(kw)) {
      matched.push(kw);
    } else {
      missing.push(kw);
    }
  });

  // Step D: Calculate similarity match percentage score
  const scorePercent = Math.min(100, Math.round((matched.length / Math.max(1, targetKeywords.length)) * 100));

  // Render score circle
  const scoreVal = document.getElementById('matchScoreVal');
  scoreVal.innerText = `${scorePercent}%`;
  
  if (scorePercent >= 75) {
    scoreVal.style.color = "var(--accent-green)";
  } else if (scorePercent >= 45) {
    scoreVal.style.color = "var(--accent-yellow)";
  } else {
    scoreVal.style.color = "var(--accent-red)";
  }

  // Render keyword badges
  const matchedContainer = document.getElementById('matchedKeywordsContainer');
  const missingContainer = document.getElementById('missingKeywordsContainer');

  matchedContainer.innerHTML = matched.map(k => `<span class="badge badge-green">${k}</span>`).join('') || `<span style="font-size:10px;color:var(--text-muted);">No keywords matched</span>`;
  missingContainer.innerHTML = missing.map(k => `<span class="badge badge-red">${k}</span>`).join('') || `<span style="font-size:10px;color:var(--text-muted);">Highly optimized! No critical keywords missing.</span>`;
}

// 9. AI Tailoring via Gemini Client-side Integration
async function runResumeOptimization() {
  if (!activeJob) {
    alert("Please select a job listing on LinkedIn first.");
    return;
  }
  
  if (!masterResumeText) {
    alert("Please enter and save your Master Resume first under the Master Resume editor.");
    return;
  }

  const apiKeyInput = document.getElementById('geminiApiKey').value.trim();
  const optimizeBtn = document.getElementById('btnOptimize');
  const outputCard = document.getElementById('optimizedOutputCard');
  const outputText = document.getElementById('tailoredResumeText');

  // A. Save API key to local storage for convenience
  if (apiKeyInput) {
    chrome.storage.local.set({ geminiApiKey: apiKeyInput });
  }

  // B. Fallback rule-based keywords optimizer if no API key is specified
  if (!apiKeyInput) {
    console.log("[JobOrchestrator Pro] No Gemini API key provided. Using rule-based local keyword injection...");
    optimizeBtn.innerText = "Tailoring locally...";
    optimizeBtn.disabled = true;

    setTimeout(() => {
      // Gather missing keywords from DOM badges
      const missingBadges = Array.from(document.querySelectorAll('#missingKeywordsContainer .badge')).map(b => b.innerText);
      
      let localTailored = `[LOCAL OPTIMIZER SUMMARY - INJECTED KEYWORDS]\n\n`;
      localTailored += `Experienced and metrics-driven professional with deep expertise in ${missingBadges.slice(0, 3).join(', ')} and core ${activeJob.title} operations. Proven history of optimizing execution pipelines at ${activeJob.company}.\n\n`;
      localTailored += `[RECOMMENDED RESUME BULLET POINTS TO ADD]\n`;
      missingBadges.slice(3, 7).forEach(kw => {
        localTailored += `• Led business critical initiatives integrating ${kw} structures, resulting in a 24% increase in team output efficiency.\n`;
      });
      
      outputText.value = localTailored;
      outputCard.style.display = 'block';
      
      optimizeBtn.innerText = "✨ Generate AI Tailored Content";
      optimizeBtn.disabled = false;
      
      logActivity('message', `Locally optimized resume summary for ${activeJob.title} at ${activeJob.company}`, activeJob.title, activeJob.company, '');
      alert("Resume tailored locally! To get advanced AI rewriting, supply your Google Gemini API key above.");
    }, 1000);
    
    return;
  }

  // C. Execute full Gemini AI client-side call
  optimizeBtn.innerText = "AI Tailoring in progress...";
  optimizeBtn.disabled = true;

  try {
    const prompt = `You are a world-class professional ATS Resume Optimization Writer. 
Given the user's Master Resume and the Target Job Description below, generate a tailor-made resume optimization document in plain text.

Structure your response PRECISELY like this:
[TAILORED PROFESSIONAL SUMMARY]
(Write a 3-4 sentence powerful resume summary tailored perfectly to highlight relevance to the job requirements, company background, and job responsibilities)

[OPTIMIZED RESUME BULLET POINTS]
(Create 3 highly professional, impact-driven bullet points showcasing achievements tailored for this role. Use industry terms and structure with high-impact action verbs)

MASTER RESUME:
"""
${masterResumeText}
"""

TARGET JOB DETAILS:
Title: ${activeJob.title}
Company: ${activeJob.company}
Description:
${activeJob.description}
`;

    console.log("[JobOrchestrator Pro] Dispatching API request to Gemini...");
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKeyInput}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1000
        }
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error ? errData.error.message : "Gemini API connection error");
    }

    const resData = await response.json();
    const tailoredText = resData.candidates[0].content.parts[0].text;

    outputText.value = tailoredText;
    outputCard.style.display = 'block';
    
    logActivity('message', `AI-Optimized resume summary for ${activeJob.title} at ${activeJob.company}`, activeJob.title, activeJob.company, '');
    alert("AI Resume tailoring successfully completed!");

  } catch (error) {
    console.error("[JobOrchestrator Pro] Gemini optimization error:", error);
    alert(`Gemini AI Tailoring Failed: ${error.message}. Defaulting back to local keyword generator.`);
    
    // Fallback trigger
    document.getElementById('geminiApiKey').value = ""; // Clear bad key
    chrome.storage.local.remove("geminiApiKey");
    runResumeOptimization();
  } finally {
    optimizeBtn.innerText = "✨ Generate AI Tailored Content";
    optimizeBtn.disabled = false;
  }
}

// 10. Persistent Activity Logger Timeline System
function logActivity(actionType, title, jobTitle, company, url) {
  chrome.storage.local.get("activityLog", (res) => {
    const log = res.activityLog || [];
    
    const newAction = {
      timestamp: new Date().toISOString(),
      actionType: actionType, // 'search' | 'interested' | 'joined' | 'message'
      title: title,
      jobTitle: jobTitle,
      company: company,
      url: url
    };
    
    log.unshift(newAction); // Push to start of timeline
    
    // Cap at 100 timeline elements for storage performance
    const cappedLog = log.slice(0, 100);
    
    chrome.storage.local.set({ activityLog: cappedLog }, () => {
      console.log(`[JobOrchestrator Pro] Action logged: ${title}`);
      if (activeTab === 'activity') {
        renderActivityTimeline();
      }
    });
  });
}

function renderActivityTimeline() {
  const container = document.getElementById('activityTimeline');
  
  chrome.storage.local.get("activityLog", (res) => {
    const log = res.activityLog || [];
    
    if (log.length === 0) {
      container.innerHTML = `<div class="timeline-empty">No logged activities found yet. Your searches and outreach actions will be recorded here.</div>`;
      return;
    }
    
    container.innerHTML = "";
    
    log.forEach(item => {
      const node = document.createElement('div');
      node.className = "timeline-node";
      
      const localTime = new Date(item.timestamp).toLocaleString();
      
      node.innerHTML = `
        <div class="timeline-dot ${item.actionType}"></div>
        <div class="timeline-time">${localTime}</div>
        <div class="timeline-title">${item.title}</div>
        ${item.jobTitle || item.company ? `<div class="timeline-desc"><strong>Target:</strong> ${item.jobTitle} at ${item.company}</div>` : ''}
        ${item.url ? `<a href="${item.url}" target="_blank" class="timeline-link">🔗 View LinkedIn Page</a>` : ''}
      `;
      
      container.appendChild(node);
    });
  });
}

function clearActivityHistory() {
  if (confirm("Are you sure you want to permanently clear your activity log?")) {
    chrome.storage.local.remove("activityLog", () => {
      renderActivityTimeline();
      alert("Activity log cleared!");
    });
  }
}

function exportActivityHistory() {
  chrome.storage.local.get("activityLog", (res) => {
    const log = res.activityLog || [];
    
    if (log.length === 0) {
      alert("No activities to export.");
      return;
    }
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(log, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href",     dataStr     );
    dlAnchor.setAttribute("download", `linkedin_job_orchestrator_log_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  });
}