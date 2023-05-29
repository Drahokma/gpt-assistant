import type { NextApiRequest, NextApiResponse } from "next";
import { OpenAI } from "langchain/llms";
import { PromptTemplate} from "langchain";
import { LLMChain} from "langchain";
import { ConversationalRetrievalQAChain } from "langchain/chains";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "langchain/embeddings";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { connectToDatabase } from "@/lib/mongodb";
import { GridFSBucket } from "mongodb";
import pdfParse from "pdf-parse";
import { Document } from "langchain/document";
import { RedisVectorStore } from "langchain/vectorstores/redis";
import { createClient } from "redis";

export async function getFileContentFromMongoDB(db, filename: string): Promise<string> {
  const bucket = new GridFSBucket(db, {
    bucketName: "documents",
  });

  const readStream = bucket.openDownloadStreamByName(filename);
  let data = [];

  return new Promise((resolve, reject) => {
    readStream
      .on("data", (chunk) => {
        data.push(chunk);
      })
      .on("error", (error) => {
        reject(error);
      })
      .on("end", async () => {
        const buffer = Buffer.concat(data);
        try {
          const pdfData = await pdfParse(buffer);
          resolve(pdfData.text);
        } catch (error) {
          reject(error);
        }
      });
  });
}

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

    const model = new OpenAI({temperature: 0, maxTokens: 1000});
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
    console.log('chain completed')
    const response = await chain.call({
      question: question,
      chat_history: chatHistory || [],
    });
    console.log(response)
    await client.disconnect();
    res.status(200).json(response);
  } catch (e) {
    res.status(500).json({ error: e.message || "Unknown error." });
  }
}
