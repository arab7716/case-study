require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenAI, Type } = require('@google/genai');
const { tavily } = require('@tavily/core');

const app = express();
app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });



const ROUTER_PROMPT = `
You are a classification router for PartSelect.com.
Determine if the LATEST message is within scope.

IN-SCOPE: 
- Refrigerators and Dishwashers.
- Generic appliance parts IF they plausibly belong to a Refrigerator or Dishwasher (e.g., "door bins", "water valves", "ice makers", "filters").
- Any message containing a part number (e.g., PS11752778, WPW10321304).
- Any natural conversational continuation of an in-scope topic (e.g., "how much?", "yes", "no, look it up", "47.40").

OUT-OF-SCOPE: 
- Explicit pivots to Ovens, microwaves, washers, dryers, cars, or general knowledge.

Return ONLY a raw JSON object with this exact schema:
{
  "is_in_scope": boolean,
  "appliance_detected": "string or null",
  "reason": "string explaining why"
}
`;

const SYSTEM_PROMPT = `
You are the primary AI Assistant for PartSelect.com.
Your domain is STRICTLY limited to Refrigerator and Dishwasher parts, repair guides, and order support.

<core_directives>
1. You can look up specific parts using 'lookup_part_details', OR help users discover parts by description/price using 'search_catalog'.
2. If you are recommending a part or providing part details, you MUST append a special product card token at the very end of your response. Format it EXACTLY like this:[PRODUCT_CARD: PART_NUMBER | PRICE | PART_NAME | URL]
Example:[PRODUCT_CARD: PS11752778 | $47.40 | Refrigerator Door Shelf Bin | https://www.partselect.com/PS11752778-Whirlpool-WPW10321304-Refrigerator-Door-Shelf-Bin.htm]
Make sure to extract the exact URL from your search results to use in this token.
3. If providing installation steps, use numbered lists.
4. If a user asks about order status, tracking, or shipping, politely inform them that "Order tracking is currently not functional due to the scope of this case study." Do not attempt to use tools for order tracking.
</core_directives>

<execution_framework>
Step 1: Identify the appliance type and the user's intent.
Step 2: Determine which tools are required.
Step 3: Execute the tools.
Step 4: Formulate the final response based ONLY on the live search data returned by the tools. Do not hallucinate compatibility.
</execution_framework>
`;



const partSelectTools =[{
    functionDeclarations:[
        {
            name: "lookup_part_details",
            description: "Searches the live website for part details, prices, and cross-checks compatibility with a target model.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    part_number: { type: Type.STRING, description: "The part number (e.g., PS11752778)" },
                    target_model_number: { type: Type.STRING, description: "Optional. The appliance model number to check compatibility against (e.g., WDT780SAEM1)" }
                },
                required: ["part_number"]
            }
        },
        {
            name: "troubleshoot_symptom",
            description: "Searches the live website for diagnostic reasoning and recommended parts for an appliance symptom.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    appliance_type: { type: Type.STRING, description: "Must be 'Refrigerator' or 'Dishwasher'" },
                    symptom_description: { type: Type.STRING, description: "The problem, e.g., 'ice maker not working'" }
                },
                required:["appliance_type", "symptom_description"]
            }
        },
        {
            name: "get_repair_instructions",
            description: "Searches the live website for step-by-step installation guides for a specific part.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    part_number: { type: Type.STRING, description: "The part number to look up" }
                },
                required:["part_number"]
            }
        },
        {
            name: "search_catalog",
            description: "Searches the catalog for parts based on a general description, category, or price constraint.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    search_query: { type: Type.STRING, description: "The general part description (e.g., 'refrigerator door shelf bin')" },
                    price_constraint: { type: Type.STRING, description: "Any price limits mentioned (e.g., 'under 40 dollars')" }
                },
                required: ["search_query"]
            }
        },
    ]
}];



const executeTool = async (functionName, args) => {
    console.log(`[EXEC] Running Microservice: ${functionName}`, args);

    // Helper to run Tavily searches securely
    const searchTavily = async (query) => {
        try {
            // Using "advanced" depth and 5 results ensures we capture prices and instruction lists
            const response = await tvly.search(query, { searchDepth: "advanced", maxResults: 5 });
            return response.results.length > 0 
                ? response.results.map(r => r.content).join(" | ") 
                : "No live data found for this query.";
        } catch (err) {
            console.error("Tavily Error:", err);
            return "Live search failed.";
        }
    };

    if (functionName === 'lookup_part_details') {
        let query = `site:partselect.com ${args.part_number} price cost in stock`;
        if (args.target_model_number) {
            query += ` compatible with ${args.target_model_number}`;
        }
        const liveData = await searchTavily(query);
        return { live_search_results: liveData };
    }

    if (functionName === 'troubleshoot_symptom') {
        const query = `site:partselect.com troubleshoot ${args.appliance_type} ${args.symptom_description} recommended parts`;
        const liveData = await searchTavily(query);
        return { live_search_results: liveData };
    }

    if (functionName === 'get_repair_instructions') {
        const query = `${args.part_number} installation instructions step-by-step repair guide`;
        const liveData = await searchTavily(query);
        return { live_search_results: liveData };
    }

    if (functionName === 'search_catalog') {
        let query = `site:partselect.com ${args.search_query} price`;
        if (args.price_constraint) {
            query += ` ${args.price_constraint}`;
        }
        
        try {
            const response = await tvly.search(query, { searchDepth: "advanced", maxResults: 5 });
            return { 
                live_search_results: response.results.length > 0 
                    ? response.results.map(r => r.content + " URL: " + r.url).join(" | ") 
                    : "No products found matching that description." 
            };
        } catch (err) {
            console.error("Tavily Error:", err);
            return { error: "Catalog search failed." };
        }
    }
    return { error: "Unknown API endpoint." };
};



app.post('/api/chat', async (req, res) => {
    try {
        const { message, history } = req.body;

        console.log(`\n==================================================`);
        console.log(`[USER MESSAGE]: "${message}"`);
        
        const recentHistory = (history ||[]).slice(-3).map(h => `${h.role.toUpperCase()}: ${h.content}`).join('\n');
        const routerInput = `RECENT CONVERSATION HISTORY:\n${recentHistory}\n\nUSER'S LATEST MESSAGE:\n"${message}"`;

        const routerResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: routerInput,
            config: {
                systemInstruction: ROUTER_PROMPT,
                temperature: 0.0,
                responseMimeType: "application/json"
            }
        });

        let classification;
        try {
            classification = JSON.parse(routerResponse.text);
        } catch (e) {
            classification = { is_in_scope: true }; 
        }

        if (!classification.is_in_scope) {
            console.log(`[ROUTER] Blocked: ${classification.reason}`);
            const blockReply = `I apologize, but I specialize exclusively in Refrigerator and Dishwasher parts and troubleshooting. I cannot assist with ${classification.appliance_detected || 'this topic'}.`;
            return res.json({ reply: blockReply });
        }

        let formattedHistory = (history ||[]).map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts:[{ text: msg.content }]
        }));
        formattedHistory.push({ role: 'user', parts: [{ text: message }] });

        let isDone = false;
        let finalReply = "";
        let loopCount = 0;
        
        while (!isDone && loopCount < 3) {
            loopCount++;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: formattedHistory,
                config: {
                    systemInstruction: SYSTEM_PROMPT,
                    temperature: 0.1, 
                    tools: partSelectTools,
                }
            });

            const functionCalls = response.functionCalls;

            if (functionCalls && functionCalls.length > 0) {
                
                
                if (response.text && !response.text.includes("there are non-text parts functionCall")) {
                    console.log(`[AGENT THINKING]:\n${response.text.trim()}`);
                }

                formattedHistory.push({
                    role: 'model',
                    parts: functionCalls.map(call => ({ functionCall: call }))
                });

                const toolResults = await Promise.all(
                    functionCalls.map(async (call) => {
                        const result = await executeTool(call.name, call.args);
                        return {
                            functionResponse: {
                                name: call.name,
                                response: result
                            }
                        };
                    })
                );

                formattedHistory.push({
                    role: 'user',
                    parts: toolResults
                });

            } else {
                isDone = true;
                finalReply = response.text || "I was unable to process a response.";
            }
        }

        const cleanReply = finalReply.replace(/<thinking>[\s\S]*?<\/thinking>\n?/g, '').trim();
        
        console.log(`[AGENT FINAL REPLY]:\n${cleanReply}`);
        res.json({ reply: cleanReply });

    } catch (error) {
        console.error("Error from Agent:", error);
        res.status(500).json({ error: "An internal system error occurred." });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Live Enterprise Agent Backend running on port ${PORT}`);
});