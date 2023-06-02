import type { NextApiRequest, NextApiResponse } from "next";
import { OpenAIEmbeddings } from "langchain/embeddings";
import { RedisVectorStore } from "langchain/vectorstores/redis";
import { createClient } from "redis";
import { ConversationalRetrievalQAChain} from "langchain/chains";
import {ChatOpenAI} from "langchain/chat_models/openai";
import { convAgent} from "@/lib/agent-hci";


export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { question, chatHistory, credentials, selectedDocuments } = req.body;

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!question) {
    return res.status(400).json({ message: "No question in the request" });
  }

  try {
     const client = createClient({
      url: process.env.REDIS_URL ?? "redis://localhost:6379",
    });

    await client.connect();
    const vectorStore = new RedisVectorStore(new OpenAIEmbeddings(), {
      redisClient: client,
      indexName: "docs",
    });

    const model = new ChatOpenAI({
      temperature: 0,
      azureOpenAIApiDeploymentName: "gpt3-hci"
    });

    const questionGeneratorTemplate = `Máš dánu následující konverzaci a následující otázku, přeformuluj následující otázku tak, aby byla samostatnou otázkou.

    Historie chatu:
    {chat_history}
    Následující otázka: {question}
    Samostatná otázka:`;

    const qaTemplate = `Použij následující části kontextu k zodpovězení otázky. Pokud neznáš odpověď, řekni že odpověď neznáš, nevymýšlej si odpověď.

    {context}

    Otázka: {question}
    Výsledná odpověď založená na kontextu:`;

    const filenames = selectedDocuments.map(doc => doc.filename);
    // Create the chain
    const chain = ConversationalRetrievalQAChain.fromLLM(
      model,
      vectorStore.asRetriever(1, filenames),
      {
        questionGeneratorTemplate,
        qaTemplate,
        returnSourceDocuments: true,
      }
    );
    // Ask the question
    const response = await chain.call({
      question: question,
      chat_history: chatHistory || [],
    });
    console.log(response)
    //);

    const input = question;
    const createdAgenOne = await convAgent(client);
    const resultAgentOne = await createdAgenOne.call({input});
    await client.disconnect();
    console.log("agent response:", resultAgentOne)
    console.log("agent response:", resultAgentOne.output)
    res.status(200).json(resultAgentOne);
  } catch (e) {
    console.log(e)
    res.status(500).json({ error: e.message || "Unknown error." });
  }
}
