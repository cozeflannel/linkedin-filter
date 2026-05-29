// Robust LinkedIn Job Details & Automation Script

console.log("[JobOrchestrator Pro] Content script injected successfully.");

// 1. Listen for clicks on job cards to extract details
document.addEventListener('click', (event) => {
  const jobCard = event.target.closest('.job-search-card__contained-view, [data-job-id], .jobs-search-results-list__list-item');
  if (jobCard) {
    console.log("[JobOrchestrator Pro] Job card click detected, preparing detail extraction...");
    setTimeout(() => {
      extractJobPaneDetails();
    }, 1500); // 1.5s delay to let LinkedIn load dynamic details pane
  }
});

// Helper: Scrape active job details
function extractJobPaneDetails() {
  try {
    // Selectors for Job Title
    const titleElem = document.querySelector('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title h1, h1.t-24, .t-24.t-bold');
    const jobTitle = titleElem ? titleElem.innerText.trim() : "Unknown Title";

    // Selectors for Company Anchor & Name
    const companyAnchor = document.querySelector('.job-details-jobs-unified-top-card__company-name a, .jobs-unified-top-card__company-name a, .jobs-unified-top-card__company-name');
    let companyName = "Unknown Company";
    let companyUrl = "";
    
    if (companyAnchor) {
      companyName = companyAnchor.innerText.trim().split('\n')[0];
      if (companyAnchor.tagName === 'A' && companyAnchor.href) {
        // Normalize URL to remove trailing query parameters
        const urlObj = new URL(companyAnchor.href);
        companyUrl = urlObj.origin + urlObj.pathname;
      }
    }

    // Selectors for Recruiter Poster Name and Profile Link
    const posterAnchor = document.querySelector('.jobs-poster__name a, .jobs-poster__name');
    let posterName = "Not explicitly listed";
    let recruiterUrl = "";
    
    if (posterAnchor) {
      posterName = posterAnchor.innerText.trim();
      if (posterAnchor.tagName === 'A' && posterAnchor.href) {
        recruiterUrl = posterAnchor.href;
      }
    }

    // Selectors for Job Description
    const descElem = document.querySelector('#job-details, .jobs-description__content, .jobs-box__html-content, .jobs-description-content__text');
    const jobDescription = descElem ? descElem.innerText.trim() : "Unable to extract description.";

    const jobUrl = window.location.href;

    console.log(`[JobOrchestrator Pro] Extracted details for: ${jobTitle} at ${companyName}`);

    // Send payload back to the sidepanel
    chrome.runtime.sendMessage({
      type: "JOB_SELECTED",
      data: {
        title: jobTitle,
        company: companyName,
        companyUrl: companyUrl,
        poster: posterName,
        recruiterUrl: recruiterUrl,
        description: jobDescription,
        url: jobUrl,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("[JobOrchestrator Pro] Error extracting job details:", error);
  }
}

// 2. Message Listener for Actions requested by sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(`[JobOrchestrator Pro] Received background message type: ${message.type}`);
  
  if (message.type === "CLICK_INTERESTED") {
    handleInterestedClick(sendResponse);
    return true; // Keep message channel open for async response
  }
  
  if (message.type === "START_DEEP_DIVE") {
    // Start automated workflow by saving state
    chrome.storage.local.set({
      deepdive_state: "NAVIGATING_COMPANY",
      deepdive_company_url: message.companyUrl,
      deepdive_company_name: message.companyName
    }, () => {
      console.log("[JobOrchestrator Pro] Deep-Dive initialized in local storage. Navigating...");
      window.location.href = message.companyUrl;
      sendResponse({ status: "navigating", message: "Redirecting to company page..." });
    });
    return true;
  }
  
  if (message.type === "TRIGGER_PEOPLE_SEARCH") {
    runPeopleSearch(sendResponse);
    return true;
  }
  
  if (message.type === "SCRAPE_RECRUITERS") {
    scrapeRecruiterCards(sendResponse);
    return true;
  }
});

// Action: Find and click the "Interested" or "I'm Interested" button
function handleInterestedClick(sendResponse) {
  try {
    const buttons = Array.from(document.querySelectorAll('button'));
    // Look for button containing text like "interested" or "i'm interested", ignoring things like "not interested"
    const interestedBtn = buttons.find(b => {
      const txt = (b.textContent || b.innerText || "").trim().toLowerCase();
      return (txt.includes('interested') || txt.includes('i\'m interested') || txt.includes("i’m interested")) && !txt.includes('not');
    });

    if (interestedBtn) {
      console.log("[JobOrchestrator Pro] Found Interested button. Clicking...");
      // Highlight visually before clicking
      interestedBtn.style.outline = "4px solid #10b981";
      interestedBtn.style.transition = "outline 0.3s ease";
      
      setTimeout(() => {
        interestedBtn.click();
        interestedBtn.style.outline = "none";
        sendResponse({ success: true, message: "Successfully signaled interest!" });
      }, 500);
    } else {
      console.warn("[JobOrchestrator Pro] Interested button not found on this page.");
      sendResponse({ success: false, message: "Could not find 'Interested' button. Ensure you are on a LinkedIn Company Life or Overview page." });
    }
  } catch (error) {
    console.error("[JobOrchestrator Pro] Error clicking interested:", error);
    sendResponse({ success: false, message: error.message });
  }
}

// 3. Automated State Machine Engine for Deep-Dive
// Runs automatically on page load to check if a Deep-Dive is currently active
function checkDeepDiveState() {
  chrome.storage.local.get(["deepdive_state", "deepdive_company_url", "deepdive_company_name"], (res) => {
    if (!res.deepdive_state || res.deepdive_state === "IDLE") return;
    
    const currentUrl = window.location.href;
    console.log(`[JobOrchestrator Pro] Active Deep-Dive detected. State: ${res.deepdive_state}. URL: ${currentUrl}`);

    // State 1: We wanted to go to the company page and just loaded it
    if (res.deepdive_state === "NAVIGATING_COMPANY") {
      if (currentUrl.includes("/company/")) {
        console.log("[JobOrchestrator Pro] Company page loaded. Advancing to People Tab...");
        chrome.storage.local.set({ deepdive_state: "COMPANY_LOADED" }, () => {
          // Direct navigation to /people/ is highly robust and avoids searching for elements
          let peopleUrl = currentUrl;
          if (!peopleUrl.endsWith('/')) peopleUrl += '/';
          if (!peopleUrl.includes('/people')) peopleUrl += 'people/';
          
          setTimeout(() => {
            window.location.href = peopleUrl;
          }, 1000);
        });
      }
    } 
    
    // State 2: We navigated to the people tab and it loaded
    else if (res.deepdive_state === "COMPANY_LOADED") {
      if (currentUrl.includes("/people")) {
        console.log("[JobOrchestrator Pro] People tab loaded. Initiating Recruiter Search...");
        chrome.storage.local.set({ deepdive_state: "PEOPLE_LOADED" }, () => {
          setTimeout(() => {
            injectPeopleSearchKeywords();
          }, 2000); // 2s wait for page elements to mount
        });
      }
    }
    
    // State 3: Search keywords entered, waiting for user or automated scrape trigger
    else if (res.deepdive_state === "PEOPLE_LOADED") {
      if (currentUrl.includes("/people")) {
        // Scrape the resulting cards
        setTimeout(() => {
          scrapeRecruiterCards(null);
        }, 3000); // Wait 3s for search results to fetch
      }
    }
  });
}

// Action: Enter "recruiter" in the company's People search box
function injectPeopleSearchKeywords() {
  try {
    const searchBox = document.querySelector('input#people-search-keywords, input[placeholder*="Search employees"], input[placeholder*="Search by title"]');
    if (searchBox) {
      console.log("[JobOrchestrator Pro] Found search box. Injecting keyword 'recruiter'...");
      searchBox.focus();
      searchBox.value = "recruiter";
      searchBox.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Simulate Enter Key press
      setTimeout(() => {
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
        });
        searchBox.dispatchEvent(enterEvent);
        console.log("[JobOrchestrator Pro] Keyword injected and search triggered.");
        
        // Update state to allow automated scraping next
        chrome.storage.local.set({ deepdive_state: "PEOPLE_LOADED" });
      }, 500);
    } else {
      console.warn("[JobOrchestrator Pro] People search box element not found.");
    }
  } catch (error) {
    console.error("[JobOrchestrator Pro] Error injecting search keywords:", error);
  }
}

// Action: Scrape profile cards from the People page results
function scrapeRecruiterCards(sendResponse) {
  try {
    console.log("[JobOrchestrator Pro] Scanning DOM for employee profile cards...");
    
    // Selectors for profile cards in the People directory
    const cards = Array.from(document.querySelectorAll('.org-people-profile-card, li.grid, .org-people-profiles-module__profile-item, .org-people-profile-card__card-spacing'));
    const recruitersFound = [];

    cards.forEach(card => {
      const nameElem = card.querySelector('.org-people-profile-card__profile-title, .lt-line-clamp--single, h4, .artdeco-entity-lockup__title');
      const titleElem = card.querySelector('.org-people-profile-card__profile-subtitle, .lt-line-clamp--multi, .artdeco-entity-lockup__subtitle');
      const linkElem = card.querySelector('a[href*="/in/"]');

      if (nameElem && linkElem) {
        const name = nameElem.innerText.trim();
        const title = titleElem ? titleElem.innerText.trim() : "Employee";
        let profileUrl = linkElem.href;
        
        // Remove tracking params
        if (profileUrl) {
          const urlObj = new URL(profileUrl);
          profileUrl = urlObj.origin + urlObj.pathname;
        }

        // Avoid adding duplicates
        if (name && profileUrl && !recruitersFound.some(r => r.url === profileUrl)) {
          // Double-check if the role looks like a recruiter or talent specialist
          const lowerTitle = title.toLowerCase();
          const isRecruiter = lowerTitle.includes('recru') || 
                             lowerTitle.includes('talent') || 
                             lowerTitle.includes('hr') || 
                             lowerTitle.includes('acquisition') || 
                             lowerTitle.includes('hiring') ||
                             lowerTitle.includes('sourcing') ||
                             lowerTitle.includes('people');
          
          recruitersFound.push({
            name: name,
            title: title,
            url: profileUrl,
            priority: isRecruiter ? 1 : 2 // Rank recruiters higher
          });
        }
      }
    });

    // Sort recruiters first
    recruitersFound.sort((a, b) => a.priority - b.priority);

    // Take top 5
    const topRecruiters = recruitersFound.slice(0, 5);
    console.log(`[JobOrchestrator Pro] Scrape completed. Found ${topRecruiters.length} profiles.`, topRecruiters);

    // Save to storage
    chrome.storage.local.set({
      deepdive_state: "IDLE", // Reset to idle
      deepdive_recruiters: topRecruiters
    }, () => {
      // Notify sidepanel
      chrome.runtime.sendMessage({
        type: "RECRUITERS_FOUND",
        data: topRecruiters
      });
      
      if (sendResponse) {
        sendResponse({ success: true, count: topRecruiters.length, data: topRecruiters });
      }
    });
  } catch (error) {
    console.error("[JobOrchestrator Pro] Error scraping recruiters:", error);
    if (sendResponse) {
      sendResponse({ success: false, message: error.message });
    }
  }
}

// Execute active deep-dive checks automatically on mount
checkDeepDiveState();
