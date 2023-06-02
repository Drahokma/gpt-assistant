import type { NextApiRequest, NextApiResponse, PageConfig } from "next";
import formidable from "formidable";
import { GridFSBucket } from "mongodb";

import { fileConsumer, formidablePromise } from "@/lib/formidable";
import { connectToDatabase } from "@/lib/mongodb";
import { OpenAIEmbeddings } from "langchain/embeddings";
import { createClient } from "redis";
import { RedisVectorStore } from "langchain/vectorstores/redis";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import textract from "textract";

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
    const getTextsAndMetadata = async (fileObj: formidable.file, fileData: Buffer) => {
      return new Promise<{ text: string; metadata: { filename: string } }>((resolve, reject) => {
        textract.fromBufferWithMime(fileObj.mimetype, fileData, (error, text) => {
          if (error) {
            reject(error);
          } else {
            resolve({ text, metadata: { filename: fileObj.originalFilename } });
          }
        });
      });
    };

    const textsAndMetadata = await Promise.all(
      Object.values(files).map(async (fileObj: formidable.file) => {
        const fileData = endBuffers[fileObj.newFilename];
        return getTextsAndMetadata(fileObj, fileData);
      })
    );

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 600,
      chunkOverlap: 200,
    });
    const texts = textsAndMetadata.map((item) => item.text);
    const metadatas = textsAndMetadata.map((item) => item.metadata);
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
