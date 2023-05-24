import type { NextApiRequest, NextApiResponse, PageConfig } from "next";
import formidable from "formidable";
import { GridFSBucket } from "mongodb";

import { fileConsumer, formidablePromise } from "@/lib/formidable";
import { connectToDatabase } from "@/lib/mongodb";
import { Document } from "langchain/document";
import { OpenAIEmbeddings } from "langchain/embeddings";
import { createClient } from "redis";
import { RedisVectorStore } from "langchain/vectorstores/redis";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import pdfParse from "pdf-parse";

const formidableConfig = {
  keepExtensions: true,
  maxFileSize: 10_000_000,
  maxFieldsSize: 10_000_000,
  maxFields: 7,
  allowEmptyFiles: false,
  multiples: true,
};

export async function handler(req: NextApiRequest, res: NextApiResponse) {
  const endBuffers: {
    [filename: string]: Buffer;
  } = {};

  const { fields, files } = await formidablePromise(req, {
    ...formidableConfig,
    // consume this, otherwise formidable tries to save the file to disk
    fileWriteStreamHandler: (file) => fileConsumer(file, endBuffers),
  });

  const { db } = await connectToDatabase('Documents');

  // Create a GridFS bucket
  const bucket = new GridFSBucket(db, {
    bucketName: "documents",
  });

  // Save the uploaded documents to the GridFS bucket and redis vectorstore
  try {
    const pdfTextsAndMetadata = await Promise.all(
      Object.values(files).map(async (fileObj: formidable.file) => {
        const fileData = endBuffers[fileObj.newFilename];
        const pdfText = await pdfParse(fileData);
        return { text: pdfText.text, metadata: { filename: fileObj.originalFilename } };
      })
    );

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 4000,
      chunkOverlap: 200,
    });
    const texts = pdfTextsAndMetadata.map((item) => item.text);
    const metadatas = pdfTextsAndMetadata.map((item) => item.metadata);
    const docs = await splitter.createDocuments(texts, metadatas);
    console.log("docs created", docs);

    await Promise.all(
      Object.values(files).map(async (fileObj: formidable.file) => {
        const fileData = endBuffers[fileObj.newFilename];
        const uploadStream = bucket.openUploadStream(fileObj.originalFilename, {
          contentType: fileObj.mimetype,
          metadata: {
            uploadDate: new Date(),
          },
        });

        // Write the file data to the GridFS bucket
        await new Promise((resolve, reject) => {
          uploadStream.end(fileData, (error, result) => {
            if (error) {
              console.error('Error in uploadStream.end:', error);
              reject(error);
            } else {
              resolve(result);
            }
          });
        });
      })
    );

    const client = createClient({
      url: process.env.REDIS_URL ?? "redis://localhost:6379",
    });
    await client.connect();

    const vectorStore = await RedisVectorStore.fromDocuments(
      docs,
      new OpenAIEmbeddings({
        batchSize: 1,
      }),
      {
        redisClient: client,
        indexName: "docs",
      }
    );
    console.log("Vector store completed");
    await client.disconnect();
    res.status(200).json({});
  } catch (e) {
    res.status(500).json({ error: e.message || "Unknown error." });
  }
}

export const config: PageConfig = {
  api: {
    bodyParser: false,
  },
};

export default handler;
