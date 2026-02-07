import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import { Agent } from './agent';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const agent = new Agent(process.env.GROQ_API_KEY || '');

app.get('/', (req: Request, res: Response) => {
    res.send('VoiceReplica Agentic Backend Running');
});

app.post('/command', async (req: Request, res: Response) => {
    const { command } = req.body;
    if (!command) {
        return res.status(400).json({ error: 'Command is required' });
    }

    try {
        const actions = await agent.processCommand(command);
        res.json({ actions });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

