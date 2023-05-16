import { MongoClient, MongoClientOptions } from "mongodb"

const uri = process.env.MONGODB_URI
// const options: MongoClientOptions = {
//   useUnifiedTopology: true,
//   useNewUrlParser: true,
// }

let client
let clientPromise

if (!process.env.MONGODB_URI) {
  throw new Error("Please add the MONGODB_URI to your environment variables.")
}

if (process.env.NODE_ENV === "development") {
  if (!client) {
    client = new MongoClient(uri)
    client.connect()
  }
  clientPromise = client
} else {
  if (!clientPromise) {
    clientPromise = MongoClient.connect(uri)
  }
}

export async function connectToDatabase(databaseName) {
  const connection = await clientPromise
  const db = connection.db(databaseName)

  console.log("connection succesfull here:", uri);
  return { db, connection }
}
