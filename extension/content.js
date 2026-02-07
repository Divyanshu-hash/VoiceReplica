// Content script
console.log('VoiceReplica Content Script Loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'EXECUTE_ACTION') {
        console.log('Content script received action:', request.action);
        handleAction(request.action);
    }
});

function handleAction(action) {
    const { name, args } = action;

    const unsafe = checkSafePage();
    if (unsafe) {
        console.warn("Safety Stop: Sensitive page detected.");
        return; // Stop execution
    }

    if (name === 'click') {
        return clickElement(args.elementDescription);
    } else if (name === 'type') {
        return typeText(args.elementDescription, args.text);
    } else if (name === 'speak') {
        console.log('Agent says:', args.text);
        const utterance = new SpeechSynthesisUtterance(args.text);
        window.speechSynthesis.speak(utterance);
        return { status: "success", message: "Spoke text" };
    } else if (name === 'get_page_content') {
        return { status: "success", content: getPageContent() };
    } else if (name === 'search_in_site') {
        return searchInSite(args.query);
    }
}

function checkSafePage() {
    const text = document.body.innerText.toLowerCase();
    const sensitiveKeywords = ['checkout', 'payment method', 'credit card', 'cvv', 'card number', 'expiration date', 'captcha', 'otp', 'security check', 'one time password'];

    // Check if any keyword matches
    const found = sensitiveKeywords.find(kw => text.includes(kw));
    if (found) {
        // Double check title to be sure
        const title = document.title.toLowerCase();
        if (title.includes('checkout') || title.includes('pay') || text.includes('pay securely')) {
            alert("VoiceReplica Safety: Stopping on Payment Page.");
            return true;
        }
    }
    return false;
}

function getPageContent() {
    // Basic extraction of visible text
    const bodyText = document.body.innerText;
    // Simple cleanup to remove excessive whitespace
    const cleanText = bodyText.replace(/\s+/g, ' ').trim();
    // Cap length to avoid token limits (e.g. 15k chars)
    return cleanText.substring(0, 15000);
}

function clickElement(description) {
    const desc = description.toLowerCase();

    // 1. Selector including generic clickable classes and roles
    const selector = 'button, a, input[type="submit"], [role="button"], [class*="btn"], [class*="button"]';
    const elements = Array.from(document.querySelectorAll(selector));

    let target = null;

    // Helper: Get best textual representation
    const getText = (el) => {
        return (el.innerText || el.textContent || el.getAttribute('aria-label') || el.value || '').toLowerCase();
    };

    // Helper: Get structural attributes
    const getAttributes = (el) => {
        return (el.id || el.name || el.className || '').toLowerCase();
    };

    // Strategy 1: Exact Text Match
    target = elements.find(el => getText(el).trim() === desc);

    // Strategy 2: Partial Text Match
    if (!target) {
        target = elements.find(el => getText(el).includes(desc));
    }

    // Strategy 3: Attribute Match (ID/Class/Name)
    // Useful if the button is an icon (e.g. <button id="search-btn"></button>)
    if (!target) {
        target = elements.find(el => getAttributes(el).includes(desc));
    }

    // Strategy 4: Keyword Synonym Mapping 
    if (!target) {
        if (desc.includes('search')) {
            const synonyms = ['find', 'go', 'submit', 'query', 'check'];
            target = elements.find(el => {
                const text = getText(el);
                return synonyms.some(s => text.includes(s));
            });
        }
    }

    if (target) {
        console.log('Clicking element:', target);
        target.click();
        target.focus();
        return { status: "success", message: "Clicked " + description };
    } else {
        console.warn('Could not find element to click:', description);
        return { status: "error", message: "Could not find clickable element: " + description };
    }
}

function typeText(description, text) {
    const desc = description.toLowerCase();
    let inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea'));

    let target = null;

    // Strategy 0: explicitly find <label> with matching text
    const labels = Array.from(document.querySelectorAll('label'));
    const matchingLabel = labels.find(l => l.innerText.toLowerCase().includes(desc));
    if (matchingLabel) {
        if (matchingLabel.htmlFor) {
            target = document.getElementById(matchingLabel.htmlFor);
        } else {
            // implicit association (input inside label)
            target = matchingLabel.querySelector('input, textarea');
        }
    }

    // Strategy 1: Look for "Search"-specific inputs if the user said "search"
    if (!target && desc.includes('search')) {
        target = inputs.find(el =>
            el.type === 'search' ||
            el.name === 'q' ||
            el.name === 'search' ||
            (el.placeholder && el.placeholder.toLowerCase().includes('search')) ||
            (el.getAttribute('aria-label') && el.getAttribute('aria-label').toLowerCase().includes('search'))
        );
    }

    // Strategy 2: Look for exact/partial placeholder/label/name match
    if (!target) {
        target = inputs.find(el => {
            const label = el.placeholder || el.getAttribute('aria-label') || el.name || '';
            return label.toLowerCase().includes(desc);
        });
    }

    // Strategy 3: Special case for "From" / "To" (common in booking) if description is short like "from field"
    if (!target && (desc.includes('from') || desc.includes('to') || desc.includes('source') || desc.includes('dest'))) {
        // Try finding any element with ID containing the keyword
        target = inputs.find(el => (el.id && el.id.toLowerCase().includes(desc.replace(' field', '').trim())));
    }

    // Strategy 4: Heuristic fallback - Single visible input
    if (!target && inputs.length > 0) {
        const visibleInputs = inputs.filter(el => el.offsetParent !== null);
        if (visibleInputs.length === 1) {
            target = visibleInputs[0];
        }
    }

    if (target) {
        console.log('Typing into element:', target);
        target.focus();
        target.value = text;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        target.dispatchEvent(new Event('blur', { bubbles: true })); // Trigger validation
        return { status: "success", message: "Typed '" + text + "' into " + description };
    } else {
        console.warn('Could not find element to type in:', description);
        return { status: "error", message: "Could not find input field: " + description };
    }
}

function searchInSite(query) {
    console.log("Attempting in-site search for:", query);

    // Reuse typeText logic but prioritize search inputs
    // We force the description to "search" to trigger typeText's search strategy
    // But we also add logic to submit the form

    // 1. Find the input
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea'));

    // Find best search bar candidate
    let target = inputs.find(el =>
        el.type === 'search' ||
        el.name === 'q' ||
        el.name === 'search' ||
        (el.placeholder && el.placeholder.toLowerCase().includes('search')) ||
        (el.getAttribute('aria-label') && el.getAttribute('aria-label').toLowerCase().includes('search')) ||
        (el.className && typeof el.className === 'string' && el.className.toLowerCase().includes('search')) ||
        (el.id && el.id.toLowerCase().includes('search'))
    );

    if (!target) {
        // Fallback: look for a magnifying glass icon button and check its sibling input?
        // For now, heuristic fallback to top-most flexible input?
        // Or fail gracefully
        console.warn("No explicit search bar found. Trying generic fallback.");
        // Try finding *any* input that looks like a text field at the top of the page
        target = inputs.find(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
        });
    }

    if (target) {
        console.log("Found search target:", target);
        target.focus();
        target.value = query;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));

        // 2. Submit
        // Try pressing Enter
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        target.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));

        // Try getting form and submitting
        if (target.form) {
            console.log("Submitting parent form...");
            target.form.requestSubmit ? target.form.requestSubmit() : target.form.submit();
        } else {
            // Try clicking a sibling button?
            // simplistic approach: look for a button nearby?
            // If Enter didn't work and no form, this might fail, but Enter usually works for search bars.
            const nextSibling = target.nextElementSibling;
            if (nextSibling && (nextSibling.tagName === 'BUTTON' || nextSibling.tagName === 'INPUT')) {
                nextSibling.click();
            }
        }
        return { status: "success", message: "Performed search for " + query };
    } else {
        console.warn("Could not find any search bar for in-site search.");
        return { status: "error", message: "Could not find site search bar." };
    }
}
