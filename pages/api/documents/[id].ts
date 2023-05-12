import type { NextApiRequest, NextApiResponse } from "next";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const {
    query: { id },
    method,
  } = req;

  const { db } = await connectToDatabase('Documents');

  switch (method) {
    case "DELETE":
      try {
        // First, delete the associated chunks
        const chunksResult = await db.collection("documents.chunks").deleteMany({ files_id: new ObjectId(id) });
        console.log(chunksResult);

        // Then, delete the file
        const filesResult = await db.collection("documents.files").deleteOne({ _id: new ObjectId(id) });
        console.log(filesResult);

        if (filesResult.deletedCount === 0) {
          res.status(404).json({ error: "Document not found." });
        } else {
          res.status(200).json({});
        }
      } catch (error) {
        res.status(500).json({ error: error.message || "Unknown error." });
      }
      break;
    default:
      res.setHeader("Allow", ["DELETE"]);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}
