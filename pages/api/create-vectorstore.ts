import type { NextApiRequest, NextApiResponse } from "next";
import { MongoVectorStore } from "langchain/vectorstores/mongo";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { connectToDatabase } from "@/lib/mongodb";
import { GridFSBucket } from "mongodb";

export async function getFileContentFromMongoDB(db, filename: string): Promise<string> {
  const bucket = new GridFSBucket(db, {
    bucketName: "documents",
  });

  const readStream = bucket.openDownloadStreamByName(filename);
  let content = "";

  return new Promise((resolve, reject) => {
    readStream
      .on("data", (chunk) => {
        content += chunk.toString();
      })
      .on("error", (error) => {
        reject(error);
      })
      .on("end", () => {
        resolve(content);
      });
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { credentials, selectedDocuments } = req.body;

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // Connect to the database
    const { db, connection } = await connectToDatabase('Documents');

    // Read the content of the selected documents from MongoDB
    const documentsContent = await Promise.all(
      selectedDocuments.map((doc) => getFileContentFromMongoDB(db, doc.filename))
    );

    // Combine the content of all selected documents into a single string
    const text = documentsContent.join("\n");

    // Split the text into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000 });
    const docs = await textSplitter.createDocuments([text]);
    console.log("docs created");
    // Create the vectorstore
    const vectorStore = await MongoVectorStore.fromDocuments(docs,
      new OpenAIEmbeddings({
        openAIApiKey: credentials.openaiApiKey
      }),
      {
        client: connection,
        collection: db.collection("vectorstore"),
      }
    );

    console.log("Vector store completed");

    res.status(200).json({ message: "Vector store created successfully." });
  } catch (e) {
    res.status(500).json({ error: e.message || "Unknown error." });
  }
}
