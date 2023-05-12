import { NextApiRequest, NextApiResponse } from "next"
import { connectToDatabase } from "@/lib/mongodb"
import { GridFSBucket } from "mongodb"

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === "GET") {
    try {
      const { db } = await connectToDatabase('Documents')

      // Create a GridFS bucket
      const bucket = new GridFSBucket(db, {
        bucketName: "documents",
      })

      // Fetch the file names and metadata from the GridFS bucket
      const documents = await bucket
        .find({})
        .project({ filename: 1, "metadata.uploadDate": 1, _id: 1 })
        .toArray()

      res.status(200).json(documents)
    } catch (error) {
      res.status(500).json({ error: "Error fetching documents" })
    }
  } else {
    res.status(405).json({ error: "Method not allowed" })
  }
}
export default handler
