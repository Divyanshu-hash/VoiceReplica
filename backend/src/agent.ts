import Groq from 'groq-sdk';
import JSON5 from 'json5';

export class Agent {
    private groq: Groq;
    private history: any[];
    private taskMemory: { goal: string; steps: string[]; lastAction: string | null };

    private activeRequestId: string | null = null;

    constructor(apiKey: string) {
        this.groq = new Groq({
            apiKey: apiKey
        });
        this.taskMemory = { goal: "Ready", steps: [], lastAction: null };
        this.history = [
            {
                role: "system",
                content: this.generateSystemPrompt()
            }
        ];
    }

    private generateSystemPrompt(): string {
        return `You are VoiceReplica, an intelligent browser automation agent.
                Your goal is to output a JSON object containing the list of tools to execute the user's voice command.
                
                CURRENT MEMORY:
                - Goal: ${this.taskMemory.goal}
                - Last Action: ${this.taskMemory.lastAction || "None"}
                - Steps Taken: ${this.taskMemory.steps.length}
                
                You have access to the following tools:
                - navigate(url: string): Go to a website.
                - click(elementDescription: string): Click a button/link.
                - type(elementDescription: string, text: string): Type into a field.
                - search_google(query: string): Search on Google.
                - search_in_site(query: string): Search ON THE CURRENT SITE using its search bar.
                - search_trains(from: string, to: string, date?: string): Search for train tickets on IRCTC. Date MUST be in DD/MM/YYYY format.
                - get_page_content(): Get visible text from the page (for summarization).
                - speak(text: string): Speak the text to the user.
                
                CRITICAL RULES:
                1. You must output a valid JSON object.
                2. The JSON object must have a key "tool_calls" which is an array of tool objects.
                3. Each tool object must have "name" (string) and "arguments" (object).
                4. Do NOT output any XML, Markdown, or conversational text.
                5. Do NOT use markdown code blocks (e.g. \`\`\`json). JUST OUTPUT THE RAW JSON.
                6. STRICTLY use double quotes for keys and strings. {"key": "value"}, NOT {key: 'value'}.
                7. HANDLE CORRECTIONS: If the user changes their mind mid-sentence (e.g., "Search for cats... wait, no, dogs"), ONLY execute the FINAL intent. Ignore the initial abandoned command.
                8. PRIORITY: If the user asks for "tickets" or "trains" (e.g., "show me ticket", "book train"), ALWAYS use 'search_trains', even if currently on the IRCTC website. Do NOT use 'search_in_site' for train tickets.
                9. SELF-CONTAINED TOOLS: 'search_trains' automatically handles navigation, filling details, and clicking search. Do NOT generate 'type' or 'click' actions to fill train details after calling 'search_trains'. ONE tool call is sufficient.
                
                Observation Loop:
                You will sometimes receive messages like "Tool 'get_page_content' output: ...".
                Use this information to answer the user's original question or summarize the text.
                To speak the answer, use the 'speak' tool.
                
                Example JSON Response (Simple):
                {
                  "tool_calls": [
                    { "name": "type", "arguments": { "elementDescription": "search", "text": "cats" } },
                    { "name": "click", "arguments": { "elementDescription": "search button" } }
                  ]
                }
                
                Example JSON Response (Train Search):
                User: "Show me ticket from Kota to Udaipur for tomorrow"
                {
                  "tool_calls": [
                    { "name": "search_trains", "arguments": { "from": "Kota", "to": "Udaipur", "date": "09/02/2026" } }
                  ]
                }
                
                Example JSON Response (Correction):
                User: "Navigate to google.com... actually, go to bing.com"
                {
                  "tool_calls": [
                    { "name": "navigate", "arguments": { "url": "https://www.bing.com" } }
                  ]
                }`;
    }

    async processCommand(command: string) {
        console.log(`\n>>> INCOMING COMMAND: "${command}"\n`);

        // Generate a unique ID for this request
        const currentRequestId = Date.now().toString() + Math.random().toString();
        this.activeRequestId = currentRequestId;

        // Detect new high-level goal (heuristic)
        if (this.taskMemory.goal === "Ready" || command.length > 20) {
            this.taskMemory.goal = command;
        }

        // SAFETY: If the command mentions "Message port closed" or "receiving end does not exist", this is an orphaned content script error.
        if (command.includes("Message port closed") || command.includes("receiving end does not exist") || command.includes("Could not establish connection")) {
            console.warn("Orphaned Content Script detected. Resetting memory.");
            this.taskMemory = { goal: "Ready", steps: [], lastAction: null };
            this.history = [{ role: "system", content: this.generateSystemPrompt() }];
            return [{ name: 'speak', args: { text: "Connection lost. Please refresh the web page and try again." } }];
        }

        // Update system prompt with fresh memory
        this.history[0].content = this.generateSystemPrompt();

        this.history.push({ role: "user", content: command });

        // History Management: Keep last 10 messages + System Prompt (index 0)
        if (this.history.length > 11) {
            const system = this.history[0];
            const recent = this.history.slice(this.history.length - 10);
            this.history = [system, ...recent];
        }

        const maxRetries = 3;
        let retryCount = 0;

        while (retryCount < maxRetries) {
            // Check if a new request has come in
            if (this.activeRequestId !== currentRequestId) {
                console.log(`Request ${currentRequestId} cancelled by newer request.`);
                return []; // Return empty actions to effectively cancel
            }

            try {
                console.log("sending to LLM history:", JSON.stringify(this.history, null, 2));
                const completion = await this.groq.chat.completions.create({
                    messages: this.history,
                    model: "llama-3.1-8b-instant",
                    temperature: 0,
                    max_tokens: 2048,
                    response_format: { type: "json_object" }
                });

                // Check active request again after await
                if (this.activeRequestId !== currentRequestId) {
                    console.log(`Request ${currentRequestId} cancelled after LLM call.`);
                    return [];
                }

                console.log("Full Completion Response:", JSON.stringify(completion, null, 2));

                if (!completion.choices || completion.choices.length === 0) {
                    console.error("Groq API returned no choices.");
                    return [{ name: 'error', args: { message: "AI provider returned no response." } }];
                }

                const choice = completion.choices[0];
                const content = choice.message?.content;
                this.history.push({ role: "assistant", content: content || "" });

                console.log("\n==================== LLM RESPONSE START ====================");
                console.log(content);
                console.log("==================== LLM RESPONSE END ====================\n");

                try {
                    // Sanitize content
                    let cleanContent = content || "{}";
                    cleanContent = cleanContent.replace(/```json\s*/g, "").replace(/```/g, "").trim();

                    // Extract JSON object if wrapped in text
                    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        cleanContent = jsonMatch[0];
                    }

                    let response;
                    try {
                        response = JSON5.parse(cleanContent);
                    } catch (parseError) {
                        console.warn("JSON5 Parse Failed. Attempting repair...");
                        if (cleanContent.trim().endsWith("}")) {
                            // balanced? probably not if failed
                        } else {
                            const patched = cleanContent + '"} } ] }';
                            try {
                                const match = patched.match(/\{[\s\S]*\}/);
                                if (match) {
                                    const candidate = match[0].replace(/,(\s*[}\]])/g, '$1');
                                    response = JSON5.parse(candidate);
                                    console.log("Repair successful!");
                                }
                            } catch (e2) {
                                try {
                                    response = JSON5.parse(cleanContent + ' ] }');
                                } catch (e3) {
                                    throw parseError;
                                }
                            }
                        }
                        if (!response) throw parseError;
                    }

                    if (response.tool_calls && Array.isArray(response.tool_calls) && response.tool_calls.length > 0) {
                        // Update memory safely
                        this.taskMemory.steps.push(command.substring(0, 50));
                        this.taskMemory.lastAction = response.tool_calls[0].name;

                        return response.tool_calls.map((tool: any) => ({
                            name: tool.name,
                            args: tool.arguments
                        }));
                    }
                } catch (e) {
                    console.error("Failed to parse agent JSON response:", e);
                    return [{ name: 'error', args: { message: "Invalid response format from agent." } }];
                }

                return [{ name: 'speak', args: { text: "I understood, but I didn't see any actions to take." } }];

            } catch (error: any) {
                console.error(`Agent Error (Attempt ${retryCount + 1}):`, error);

                // Handle Rate Limit specifically
                if (error?.status === 429) {
                    const retryAfter = error?.headers?.['retry-after'];
                    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 10000;

                    console.warn(`Rate Limit Hit. Retry-After: ${retryAfter}s`);

                    if (waitTime > 60000) {
                        return [{ name: 'speak', args: { text: `I am currently rate limited by the AI provider. Please try again in ${Math.ceil(waitTime / 60000)} minutes.` } }];
                    }

                    console.warn(`Waiting ${waitTime}ms...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    retryCount++;
                    continue;
                }

                return [{ name: 'error', args: { message: "Failed to process command due to error." } }];
            }
        }
        return [{ name: 'error', args: { message: "System is busy (Rate Limit). Please try again later." } }];
    }
}
