import { MongoClient } from "mongodb"

const uri = process.env.MONGODB_URI
const options = {
  useUnifiedTopology: true,
  useNewUrlParser: true,
}

let client
let clientPromise

if (!process.env.MONGODB_URI) {
  throw new Error("Please add the MONGODB_URI to your environment variables.")
}

if (process.env.NODE_ENV === "development") {
  if (!client) {
    client = new MongoClient(uri, options)
    client.connect()
  }
  clientPromise = client
} else {
  if (!clientPromise) {
    clientPromise = MongoClient.connect(uri, options)
  }
}

export async function connectToDatabase(databaseName) {
  const connection = await clientPromise
  const db = connection.db(databaseName)

  console.log("connection succesfull:", uri);
  return { db, connection }
}
