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
    console.log("text", text);

    // Initialize the LLM to use to answer the question
    const model = new OpenAI({ temperature: 0 });
    const prompt = PromptTemplate.fromTemplate(
      "Odpověz na zadanou otázku?"
    );
    const chainA = new LLMChain({ llm: model, prompt });

    // Split the text into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000 });
    const docs = await textSplitter.createDocuments([text]);

    // Create the vector store
    const vectorStore = await MemoryVectorStore.fromDocuments(docs,
      new OpenAIEmbeddings({
        openAIApiKey: credentials.openaiApiKey
      })
    );

    console.log("Vector store completed");

    const questionGeneratorTemplate = `Máš dánu následující konverzací a následující otázku, přeformulujte následující otázku tak, aby byla samostatnou otázkou.

    Historie chatu:
    {chat_history}
    Následující otázka: {question}
    Samostatná otázka:`;

    const qaTemplate = `Použijte následující části kontextu k zodpovězení otázky na konci. Pokud neznáte odpověď, řekněte, že to nevíte, nevymýšlejte si odpověď.

    {context}

    Otázka: {question}
    Nápomocná odpověď:`;
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
    // Ask the question
    const response = await chain.call({
      question: question,
      chat_history: chatHistory || [],
    });

    res.status(200).json(response);
  } catch (e) {
    res.status(500).json({ error: e.message || "Unknown error." });
  }
}
