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
    // Connect to the database
    const { db } = await connectToDatabase('Documents');

    // Read the content of the selected documents from MongoDB
    const documentsContent = await Promise.all(
      selectedDocuments.map((doc) => getFileContentFromMongoDB(db, doc.filename))
    );

    // Combine the content of all selected documents into a single string

    const text = documentsContent.join("\n");

    // Initialize the LLM to use to answer the question
    const model = new OpenAI({ temperature: 0,  });
    const prompt = PromptTemplate.fromTemplate(
      "Odpověz na zadanou otázku?"
    );

    // Split the text into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 300 });
    const docs = await textSplitter.createDocuments([text]);
    console.log("docstore splitted", docs);
    console.log("embeddings started", process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME, process.env.AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME,
      process.env.AZURE_OPENAI_API_EMBEDDINGS_INSTANCE_NAME, process.env.AZURE_OPENAI_API_EMBEDDINGS_VERSION);
    // Create the vector store
    const embeddings = new OpenAIEmbeddings({
      azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY, // In Node.js defaults to process.env.AZURE_OPENAI_API_KEY
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME, // In Node.js defaults to process.env.AZURE_OPENAI_API_INSTANCE_NAME
      azureOpenAIApiDeploymentName: "hci-embedings", // In Node.js defaults to process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME
      azureOpenAIApiVersion: "2022-12-01", // In Node.js defaults to process.env.AZURE_OPENAI_API_VERSION
    });

    const vectorStore = await MemoryVectorStore.fromDocuments(
      docs,
      new OpenAIEmbeddings({batchSize: 1})
    );
    console.log("Vector store completed");

    const questionGeneratorTemplate = `Máš dánu následující konverzaci a následující otázku, přeformuluj následující otázku tak, aby byla samostatnou otázkou.

    Historie chatu:
    {chat_history}
    Následující otázka: {question}
    Samostatná otázka:`;

    const qaTemplate = `Použij následující části kontextu k zodpovězení otázky. Pokud neznáš odpověď, řekni že odpověď neznáš, nevymýšlej si odpověď.

    {context}

    Otázka: {question}
    Výsledná odpověď založená na kontextu:`;
    // Create the chain
    const chain = ConversationalRetrievalQAChain.fromLLM(
      model,
      vectorStore.asRetriever(),
      {
        questionGeneratorTemplate,
        qaTemplate,
        returnSourceDocuments: true,
      }
    );
    console.log("chain completed");
    console.log("openai credentials", process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME, process.env.AZURE_OPENAI_API_KEY);
    // Ask the question
    const response = await chain.call({
      question: question,
      chat_history: chatHistory || [],
    });
    console.log("response completed", response);
    res.status(200).json(response);
  } catch (e) {
    console.log("error", e);
    res.status(500).json({ error: e.message || "Unknown error." });
  }
}
