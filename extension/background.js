// Background service worker
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'openSidePanel',
        title: 'Open Side Panel',
        contexts: ['all']
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'openSidePanel') {
        // This will open the panel in all the pages on the current window.
        chrome.sidePanel.open({ windowId: tab.windowId });
    }
});
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request);

    if (request.type === 'VOICE_COMMAND') {
        console.log('Processing Voice Command:', request.command);

        fetch('http://localhost:3000/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: request.command })
        })
            .then(response => response.json())
            .then(data => {
                console.log('Actions received:', data.actions);
                if (data.actions && Array.isArray(data.actions)) {
                    processActionsSequentially(data.actions);
                }
            })
            .catch(error => {
                console.error('Error contacting backend:', error);
            });
    }
});

async function processActionsSequentially(actions) {
    for (const action of actions) {
        try {
            await executeAction(action);
        } catch (error) {
            console.error(`Error executing action ${action.name}:`, error);
            break; // Stop execution on error
        }
    }
}

function executeAction(action) {
    return new Promise((resolve, reject) => {
        console.log('Executing action:', action);

        if (action.name === 'navigate') {
            chrome.tabs.update({ url: action.args.url }, (tab) => {
                if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                // Wait for page load
                const listener = (tabId, changeInfo) => {
                    if (tabId === tab.id && changeInfo.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        // Give it a small buffer for content scripts to initialize
                        setTimeout(resolve, 1500);
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
            });
        } else if (action.name === 'search_google') {
            const url = `https://www.google.com/search?q=${encodeURIComponent(action.args.query)}`;
            chrome.tabs.update({ url: url }, (tab) => {
                const listener = (tabId, changeInfo) => {
                    if (tabId === tab.id && changeInfo.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        setTimeout(resolve, 1500);
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
            });
        } else if (action.name === 'speak') {
            chrome.tts.speak(action.args.text, {
                lang: 'en-US',
                rate: 1.0,
                onEvent: (event) => {
                    if (event.type === 'end' || event.type === 'interrupted' || event.type === 'error') {
                        resolve();
                    }
                }
            });
        } else if (action.name === 'search_trains') {
            const { from, to, date = null } = action.args;
            console.log(`Searching trains from ${from} to ${to} on ${date}`);

            chrome.tabs.create({ url: 'https://www.irctc.co.in/nget/train-search' }, (tab) => {
                const listener = (tabId, changeInfo) => {
                    if (tabId === tab.id && changeInfo.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);

                        // Inject script after load
                        chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: irctcAutomationScript,
                            args: [from, to, date || ""]
                        }, () => {
                            sendExecutionResult('search_trains', 'Train search initiated. Results are loading on screen. No further actions needed.');
                            resolve();
                        });
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
            });

        } else {
            // content script actions (type, click, etc)
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        type: 'EXECUTE_ACTION',
                        action: action
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.warn("Could not send to content script:", chrome.runtime.lastError.message);
                            sendExecutionResult(action.name, "Error: " + chrome.runtime.lastError.message);
                            // Don't verify rejection here as it might be a temporary glitches, but for this sequence we want to know
                            // If receiving end does not exist, it means page isn't ready or script is dead.
                            // We relied on 'navigate' waiting, so this should generally be fine.
                            // resolve anyway to try next step? No, if click fails, typing might fail.
                            resolve();
                        } else if (response) {
                            console.log("Got response from content script:", response);
                            sendExecutionResult(action.name, response);
                            resolve();
                        } else {
                            sendExecutionResult(action.name, "Success");
                            resolve();
                        }
                    });
                } else {
                    resolve();
                }
            });
        }
    });
}

function sendExecutionResult(actionName, result) {
    console.log(`Sending result for ${actionName} to backend...`);
    // We treat this as a 'system' or 'tool' output, but for now sending as a command
    // with a specific format so the Agent understands it's a result.
    const message = `Tool '${actionName}' output: ${result}`;

    fetch('http://localhost:3000/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: message })
    })
        .then(response => response.json())
        .then(data => {
            if (data.actions && Array.isArray(data.actions)) {
                processActionsSequentially(data.actions);
            }
        })
        .catch(err => console.error("Failed to send execution result:", err));
}

function irctcAutomationScript(origin, destination, travelDate) {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    async function automate() {
        try {
            console.log("Starting IRCTC automation...");

            // Helper to simulate typing and triggering events for Angular/PrimeNG
            const typeAndSelect = async (input, text) => {
                if (!input) return;

                input.focus();
                input.value = "";
                input.dispatchEvent(new Event('input', { bubbles: true }));
                await sleep(200);

                // Simulate typing - IRCTC expects Uppercase usually
                input.value = text.toUpperCase();
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('keydown', { bubbles: true }));
                input.dispatchEvent(new Event('keyup', { bubbles: true }));

                // Wait for the dropdown (PrimeNG uses p-autocomplete-items)
                // Retry loop for suggestions
                let listItems = [];
                for (let i = 0; i < 20; i++) { // Increase retries to 10 seconds
                    await sleep(500);
                    // Targeted selectors for IRCTC's specific PrimeNG implementation
                    listItems = document.querySelectorAll('.ui-autocomplete-items li, .p-autocomplete-items li');

                    // Filter out empty or hidden items if needed
                    if (listItems && listItems.length > 0) {
                        // Double check it's visible
                        if (listItems[0].offsetParent !== null) break;
                    }
                }

                if (listItems && listItems.length > 0) {
                    console.log(`Found ${listItems.length} suggestions. Selecting the first one: ${listItems[0].innerText}`);
                    const item = listItems[0];

                    // Trigger multiple events to ensure selection registers
                    item.dispatchEvent(new Event('mousedown', { bubbles: true }));
                    item.click();
                    item.dispatchEvent(new Event('mouseup', { bubbles: true }));
                } else {
                    console.warn(`No suggestions found for "${text}". Hitting Tab.`);
                    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true }));
                }
                await sleep(500);
            };

            // 1. Enter Origin
            // Selector: p-autocomplete[id="origin"] input
            const originInput = document.querySelector('p-autocomplete[formcontrolname="origin"] input') ||
                document.querySelector('input[aria-controls="pr_id_1_list"]');
            // Fallback: generic p-autocomplete input
            const inputs = document.querySelectorAll('p-autocomplete input');

            await typeAndSelect(originInput || inputs[0], origin);

            // 2. Enter Destination
            const destInput = document.querySelector('p-autocomplete[formcontrolname="destination"] input') ||
                document.querySelector('input[aria-controls="pr_id_2_list"]');

            await typeAndSelect(destInput || inputs[1], destination);

            // 3. Enter Date (if provided)
            if (travelDate) {
                const dateInput = document.querySelector('p-calendar input');
                if (dateInput) {
                    console.log(`Setting date to: ${travelDate}`);
                    dateInput.focus();

                    // Specific hack for PrimeNG: clear value effectively
                    dateInput.value = "";
                    dateInput.dispatchEvent(new Event('input', { bubbles: true }));
                    await sleep(100);

                    // Set value
                    dateInput.value = travelDate;
                    dateInput.dispatchEvent(new Event('input', { bubbles: true }));
                    dateInput.dispatchEvent(new Event('change', { bubbles: true }));

                    // Simulate Enter key to confirm/close calendar
                    dateInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                    dateInput.dispatchEvent(new Event('blur', { bubbles: true }));

                    await sleep(500);

                    // Force close calendar if it's still open
                    const calendarPanel = document.querySelector('.ui-datepicker, .p-datepicker');
                    if (calendarPanel && calendarPanel.offsetParent !== null) {
                        document.body.click();
                    }
                }
            }

            // 4. Click Search
            await sleep(1000);

            // Try specific "Search" button classes first. 
            // Avoid generic button[type="submit"] as it hits ads like Golden Chariot.
            const searchBtn = document.querySelector('button.search_btn') ||
                document.querySelector('button.train_Search');

            if (searchBtn) {
                console.log("Clicking search (by class)...");
                searchBtn.click();
            } else {
                // Find by text "SEARCH" or "Search"
                const buttons = Array.from(document.querySelectorAll('button'));
                const btn = buttons.find(b => {
                    const txt = b.innerText.trim().toUpperCase();
                    return txt === 'SEARCH' || txt === 'SEARCH TRAINS';
                });

                if (btn) {
                    console.log("Clicking search (by text)...");
                    btn.click();
                }
            }

        } catch (e) {
            console.error("Automation error:", e);
            // alert("Automation failed: " + e.message);
        }
    }

    // Wait for page load logic
    if (document.readyState === 'complete') {
        automate();
    } else {
        window.addEventListener('load', automate);
    }
}
