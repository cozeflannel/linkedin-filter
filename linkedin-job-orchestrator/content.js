// Robust LinkedIn Job Details & Automation Script

console.log("[JobOrchestrator Pro] Content script injected successfully.");

// Helper: Polling function to wait for elements to appear in DOM every 200ms
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(interval);
        resolve(el);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for element: ${selector}`));
      }
    }, 200);
  });
}

// 1. Listen for clicks on job cards to extract details dynamically
document.addEventListener('click', (event) => {
  const jobCard = event.target.closest('.job-search-card__contained-view, [data-job-id], .jobs-search-results-list__list-item');
  if (jobCard) {
    console.log("[JobOrchestrator Pro] Job card click detected, waiting for details pane to load...");
    // Wait for description content to mount in the details pane
    waitForElement('#job-details, .jobs-description__content, .jobs-box__html-content, .jobs-description-content__text')
      .then(() => {
        extractJobPaneDetails();
      })
      .catch(err => {
        console.warn("[JobOrchestrator Pro] Details pane did not load in time. Attempting extraction anyway...", err);
        extractJobPaneDetails();
      });
  }
});

// Extract details from the currently active job pane
function extractJobPaneDetails() {
  try {
    const titleElem = document.querySelector('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title h1, h1.t-24, .t-24.t-bold');
    const jobTitle = titleElem ? titleElem.innerText.trim() : "Unknown Title";

    const companyAnchor = document.querySelector('.job-details-jobs-unified-top-card__company-name a, .jobs-unified-top-card__company-name a, .jobs-unified-top-card__company-name');
    let companyName = "Unknown Company";
    let companyUrl = "";
    
    if (companyAnchor) {
      companyName = companyAnchor.innerText.trim().split('\n')[0];
      if (companyAnchor.tagName === 'A' && companyAnchor.href) {
        const urlObj = new URL(companyAnchor.href);
        companyUrl = urlObj.origin + urlObj.pathname;
      }
    }

    const posterAnchor = document.querySelector('.jobs-poster__name a, .jobs-poster__name');
    let posterName = "Not explicitly listed";
    let recruiterUrl = "";
    
    if (posterAnchor) {
      posterName = posterAnchor.innerText.trim();
      if (posterAnchor.tagName === 'A' && posterAnchor.href) {
        recruiterUrl = posterAnchor.href;
      }
    }

    const descElem = document.querySelector('#job-details, .jobs-description__content, .jobs-box__html-content, .jobs-description-content__text');
    const jobDescription = descElem ? descElem.innerText.trim() : "Unable to extract description.";

    const jobUrl = window.location.href;

    console.log(`[JobOrchestrator Pro] Extracted details for: ${jobTitle} at ${companyName}`);

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
  
  else if (message.type === "START_DEEP_DIVE") {
    chrome.storage.local.set({
      deepdive_state: "NAVIGATING_COMPANY",
      deepdive_company_url: message.companyUrl,
      deepdive_company_name: message.companyName,
      deepdive_job_title: message.jobTitle
    }, () => {
      console.log("[JobOrchestrator Pro] Deep-Dive initialized in storage. Redirecting...");
      window.location.href = message.companyUrl;
      sendResponse({ success: true, status: "navigating", message: "Redirecting to company page..." });
    });
    return true;
  }
  
  else if (message.type === "TRIGGER_PEOPLE_SEARCH") {
    runPeopleSearch(sendResponse);
    return true;
  }
  
  else if (message.type === "SCRAPE_RECRUITERS") {
    scrapeRecruiterCards(sendResponse);
    return true;
  }

  else if (message.type === "SEARCH_LINKEDIN_GROUPS") {
    chrome.storage.local.set({
      group_search_state: "SEARCHING",
      group_search_keyword: message.keyword
    }, () => {
      console.log(`[JobOrchestrator Pro] Navigating to group search for: ${message.keyword}`);
      window.location.href = `https://www.linkedin.com/search/results/groups/?keywords=${encodeURIComponent(message.keyword)}`;
      sendResponse({ success: true, message: "Navigating to group search page..." });
    });
    return true;
  }
});

// Action: Find and click the "Interested" or "Express Interest" buttons, ignoring negation words
function handleInterestedClick(sendResponse) {
  try {
    const buttons = Array.from(document.querySelectorAll('button'));
    // Capture any button containing "interest" (e.g. Express Interest) but exclude "not"
    const interestedBtn = buttons.find(b => {
      const txt = (b.textContent || b.innerText || "").trim().toLowerCase();
      return txt.includes('interest') && !txt.includes('not');
    });

    if (interestedBtn) {
      console.log("[JobOrchestrator Pro] Found Interested button. Clicking...");
      interestedBtn.style.outline = "4px solid #10b981";
      interestedBtn.style.transition = "outline 0.3s ease";
      
      setTimeout(() => {
        interestedBtn.click();
        interestedBtn.style.outline = "none";
        if (sendResponse) sendResponse({ success: true, message: "Successfully signaled interest!" });
      }, 500);
    } else {
      console.warn("[JobOrchestrator Pro] Interested button not found on this page.");
      if (sendResponse) sendResponse({ success: false, message: "Could not find 'Interested' button." });
    }
  } catch (error) {
    console.error("[JobOrchestrator Pro] Error clicking interested:", error);
    if (sendResponse) sendResponse({ success: false, message: error.message });
  }
}

// Helper: Extract core keyword from job title
function getCoreKeyword(jobTitle) {
  if (!jobTitle) return "recruiter";
  let clean = jobTitle.replace(/[\(\[\{\}\]\)\-\,\.\/\\\|]/g, ' ');
  const words = clean.split(/\s+/).map(w => w.trim()).filter(w => w.length > 2);
  const stopwords = new Set([
    'senior', 'junior', 'lead', 'staff', 'principal', 'pro', 'associate', 
    'engineer', 'developer', 'analyst', 'manager', 'director', 'intern', 'co-op',
    'executive', 'specialist', 'consultant', 'coordinator', 'administrator'
  ]);
  const coreWords = words.filter(w => !stopwords.has(w.toLowerCase()));
  if (coreWords.length > 0) {
    return coreWords[0];
  }
  return words[0] || "recruiter";
}

// 3. Automated State Machine Engine for Deep-Dive
function checkDeepDiveState() {
  chrome.storage.local.get(["deepdive_state", "deepdive_company_url", "deepdive_company_name"], (res) => {
    if (!res.deepdive_state || res.deepdive_state === "IDLE") return;
    
    const currentUrl = window.location.href;
    console.log(`[JobOrchestrator Pro] Active Deep-Dive state: ${res.deepdive_state}`);

    // State 1: Navigating to company page -> trigger auto interest signaling
    if (res.deepdive_state === "NAVIGATING_COMPANY") {
      if (currentUrl.includes("/company/")) {
        console.log("[JobOrchestrator Pro] Company page loaded. Signaling interest automatically...");
        handleInterestedClick((clickRes) => {
          console.log("[JobOrchestrator Pro] Interest click outcome:", clickRes);
          // Advance state and navigate to People tab
          chrome.storage.local.set({ deepdive_state: "COMPANY_LOADED" }, () => {
            let peopleUrl = currentUrl;
            if (!peopleUrl.endsWith('/')) peopleUrl += '/';
            if (!peopleUrl.includes('/people')) peopleUrl += 'people/';
            
            setTimeout(() => {
              window.location.href = peopleUrl;
            }, 1200);
          });
        });
      }
    } 
    
    // State 2: Navigated to people tab -> wait for search input box to render
    else if (res.deepdive_state === "COMPANY_LOADED") {
      if (currentUrl.includes("/people")) {
        console.log("[JobOrchestrator Pro] People tab loaded. Waiting for search elements...");
        waitForElement('input#people-search-keywords, input[placeholder*="Search employees"], input[placeholder*="Search by title"]')
          .then(() => {
            injectPeopleSearchKeywords();
          })
          .catch(err => {
            console.error("[JobOrchestrator Pro] Search input element was not found in time:", err);
          });
      }
    }
    
    // State 3: Keywords injected -> wait for profiles list results to load
    else if (res.deepdive_state === "PEOPLE_LOADED") {
      if (currentUrl.includes("/people")) {
        console.log("[JobOrchestrator Pro] Waiting for search profile results to mount...");
        waitForElement('.org-people-profile-card, li.grid, .org-people-profiles-module__profile-item, .org-people-profile-card__card-spacing')
          .then(() => {
            scrapeRecruiterCards(null);
          })
          .catch(err => {
            console.warn("[JobOrchestrator Pro] Profile cards did not load. Running fallback scrape...", err);
            scrapeRecruiterCards(null);
          });
      }
    }
  });
}

// Action: Construct and inject smart search query on Company Employees page
function injectPeopleSearchKeywords() {
  try {
    const searchBox = document.querySelector('input#people-search-keywords, input[placeholder*="Search employees"], input[placeholder*="Search by title"]');
    if (searchBox) {
      chrome.storage.local.get(["deepdive_job_title"], (res) => {
        const jobTitle = res.deepdive_job_title || "";
        const coreKeyword = getCoreKeyword(jobTitle);
        const searchQuery = `recruiter OR manager OR ${coreKeyword}`;
        
        console.log(`[JobOrchestrator Pro] Injecting smart query: ${searchQuery}`);
        searchBox.focus();
        searchBox.value = searchQuery;
        searchBox.dispatchEvent(new Event('input', { bubbles: true }));
        
        setTimeout(() => {
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
          });
          searchBox.dispatchEvent(enterEvent);
          
          chrome.storage.local.set({ deepdive_state: "PEOPLE_LOADED" });
        }, 500);
      });
    }
  } catch (error) {
    console.error("[JobOrchestrator Pro] Error injecting search keywords:", error);
  }
}

// Action: Scrape all loaded profile cards and rank contacts into tiers
function scrapeRecruiterCards(sendResponse) {
  chrome.storage.local.get(["deepdive_job_title"], (storageRes) => {
    try {
      console.log("[JobOrchestrator Pro] Scanning and scraping employee profiles...");
      const jobTitle = storageRes.deepdive_job_title || "";
      const coreKeyword = getCoreKeyword(jobTitle).toLowerCase();
      
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
          
          if (profileUrl) {
            const urlObj = new URL(profileUrl);
            profileUrl = urlObj.origin + urlObj.pathname;
          }

          if (name && profileUrl && !recruitersFound.some(r => r.url === profileUrl)) {
            const lowerTitle = title.toLowerCase();
            
            const isRecruiter = lowerTitle.includes('recru') || 
                               lowerTitle.includes('talent') || 
                               lowerTitle.includes('hr') || 
                               lowerTitle.includes('acquisition') || 
                               lowerTitle.includes('hiring') ||
                               lowerTitle.includes('sourcing') ||
                               lowerTitle.includes('people');
                               
            const isManager = lowerTitle.includes('manager') ||
                              lowerTitle.includes('director') ||
                              lowerTitle.includes('head') ||
                              lowerTitle.includes('lead');
                              
            const containsCore = lowerTitle.includes(coreKeyword);
            
            let priority = 4;
            let category = "General Employee";
            
            if (isRecruiter) {
              priority = 1;
              category = "Recruiting / HR";
            } else if (isManager && containsCore) {
              priority = 2;
              category = "Potential Hiring Manager";
            } else if (containsCore && !isManager) {
              priority = 3;
              category = "Similar Role / Peer";
            } else {
              priority = 4;
              category = "General Employee";
            }
            
            recruitersFound.push({
              name: name,
              title: title,
              url: profileUrl,
              priority: priority,
              category: category
            });
          }
        }
      });

      // Sort contacts by priority tier
      recruitersFound.sort((a, b) => a.priority - b.priority);

      console.log(`[JobOrchestrator Pro] Scraped and categorized ${recruitersFound.length} profiles.`, recruitersFound);

      chrome.storage.local.set({
        deepdive_state: "IDLE",
        deepdive_recruiters: recruitersFound
      }, () => {
        chrome.runtime.sendMessage({
          type: "RECRUITERS_FOUND",
          data: recruitersFound
        });
        
        if (sendResponse) {
          sendResponse({ success: true, count: recruitersFound.length, data: recruitersFound });
        }
      });
    } catch (error) {
      console.error("[JobOrchestrator Pro] Error scraping recruiters:", error);
      if (sendResponse) {
        sendResponse({ success: false, message: error.message });
      }
    }
  });
}

// 4. Automated State Machine for Group Search
function checkGroupSearchState() {
  chrome.storage.local.get(["group_search_state", "group_search_keyword"], (res) => {
    if (res.group_search_state === "SEARCHING") {
      const currentUrl = window.location.href;
      if (currentUrl.includes("/search/results/groups/")) {
        console.log("[JobOrchestrator Pro] Group Search loaded. Waiting for results to render...");
        // Wait for reusable search list items
        waitForElement('.reusable-search__result-container, .search-results__list, li.reusable-search__result-container')
          .then(() => {
            scrapeGroupCards();
          })
          .catch(err => {
            console.error("[JobOrchestrator Pro] Group search results didn't render in time:", err);
            scrapeGroupCards();
          });
      }
    }
  });
}

// Scrape dynamic group search results card content
function scrapeGroupCards() {
  try {
    console.log("[JobOrchestrator Pro] Scraping group cards...");
    const cards = Array.from(document.querySelectorAll('.reusable-search__result-container, li.reusable-search__result-container, .search-result__wrapper'));
    const groupsFound = [];
    
    cards.forEach(card => {
      const titleElem = card.querySelector('.entity-result__title-text a, .search-result__info a, a.app-aware-link');
      if (titleElem) {
        const name = titleElem.innerText.trim();
        let url = titleElem.href;
        
        if (url) {
          const urlObj = new URL(url);
          url = urlObj.origin + urlObj.pathname;
        }
        
        if (name && url && !groupsFound.some(g => g.url === url)) {
          groupsFound.push({ name, url });
        }
      }
    });
    
    console.log(`[JobOrchestrator Pro] Found ${groupsFound.length} groups. Sending response.`);
    
    chrome.storage.local.set({
      group_search_state: "IDLE"
    }, () => {
      chrome.runtime.sendMessage({
        type: "GROUPS_FOUND",
        groups: groupsFound
      });
    });
  } catch (error) {
    console.error("[JobOrchestrator Pro] Error scraping groups:", error);
    chrome.storage.local.set({ group_search_state: "IDLE" });
  }
}

// Automatically trigger active deep-dive checks and group searches on mount
checkDeepDiveState();
checkGroupSearchState();
