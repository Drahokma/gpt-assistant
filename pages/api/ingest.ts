import type { NextApiRequest, NextApiResponse, PageConfig } from "next";
import formidable from "formidable";
import { GridFSBucket } from "mongodb";

import { fileConsumer, formidablePromise } from "@/lib/formidable";
import { connectToDatabase } from "@/lib/mongodb";

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

  // Save the uploaded documents to the GridFS bucket
  try {
    await Promise.all(
      Object.values(files).map(async (fileObj: formidable.file) => {
        const fileData = endBuffers[fileObj.newFilename];
        console.log(fileObj.newFilename)
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
              reject(error);
            } else {
              resolve(result);
            }
          });
        });
      })
    );
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
