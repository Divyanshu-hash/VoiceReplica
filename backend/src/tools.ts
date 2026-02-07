export const TOOLS = [
    {
        type: "function",
        function: {
            name: "navigate",
            description: "Navigate the browser to a specific URL",
            parameters: {
                type: "object",
                properties: {
                    url: {
                        type: "string",
                        description: "The full URL to navigate to (e.g. https://www.google.com)"
                    }
                },
                required: ["url"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "click",
            description: "Click on an element on the page",
            parameters: {
                type: "object",
                properties: {
                    elementDescription: {
                        type: "string",
                        description: "A description of the element to click (e.g. 'Search button', 'Login link', 'The first search result')"
                    }
                },
                required: ["elementDescription"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "type",
            description: "Type text into an input field",
            parameters: {
                type: "object",
                properties: {
                    elementDescription: {
                        type: "string",
                        description: "Description of the input field (e.g. 'Search box', 'Username field')"
                    },
                    text: {
                        type: "string",
                        description: "The text to type"
                    }
                },
                required: ["elementDescription", "text"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "search_google",
            description: "Perform a Google search directly",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The search query"
                    }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_page_content",
            description: "Get the visible text content of the current web page. Use this when asked to summarize, read, or answer questions about the page.",
            parameters: {
                type: "object",
                properties: {},
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "speak",
            description: "Speak text aloud to the user. Use this to provide feedback, answer questions, or summarize results.",
            parameters: {
                type: "object",
                properties: {
                    text: {
                        type: "string",
                        description: "The text to speak"
                    }
                },
                required: ["text"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "search_in_site",
            description: "Perform a search within the specific current website using its own search bar.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The query to search for on this site."
                    }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "search_trains",
            description: "Search for trains between two stations on IRCTC.",
            parameters: {
                type: "object",
                properties: {
                    from: {
                        type: "string",
                        description: "Origin station (e.g. 'Kota', 'New Delhi')"
                    },
                    to: {
                        type: "string",
                        description: "Destination station (e.g. 'Udaipur', 'Mumbai')"
                    },
                    date: {
                        type: "string",
                        description: "Date of travel in DD-MM-YYYY format (e.g. '25-12-2025'). Optional."
                    }
                },
                required: ["from", "to"]
            }
        }
    }
];
